import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import { isAllowedArchiveProviderModel } from "../src/lib/archive-provider-models.js";

const DEFAULT_TIMEOUT_MS = 180_000;
const SEARCH_EFFORTS = ["low", "medium", "high", "xhigh"];

const SEARCH_MESSAGE = "公開AI接続の自動確認です。短く応答してください。";
const PERSONA_MESSAGE = "公開AI接続の自動確認だ。短く一言で答えてくれ。";

function searchCase(id, label, model, effort, execution = "standard") {
  return {
    id,
    label,
    path: "/api/archive-search",
    client: "search-v1",
    expectedModel: model,
    body: {
      query: SEARCH_MESSAGE,
      messages: [{ role: "user", content: SEARCH_MESSAGE }],
      candidates: [],
      modelPreference: { model, effort, execution },
    },
  };
}

function personaCase(id, label, mode, proProfile, expectedModel) {
  return {
    id,
    label,
    path: "/api/archive-intelligence",
    client: "persona-v1",
    expectedModel,
    body: {
      characterId: "ciel",
      mode,
      proProfile,
      messages: [{ role: "user", content: PERSONA_MESSAGE }],
    },
  };
}

export const ARCHIVE_AI_DEPLOYMENT_CASES = [
  ...["gpt-5.5", "gpt-5.6-terra"].flatMap((model) =>
    SEARCH_EFFORTS.map((effort) =>
      searchCase(
        `search-${model === "gpt-5.5" ? "gpt55" : "terra"}-${effort}`,
        `Search ${model === "gpt-5.5" ? "GPT-5.5" : "Terra"} ${effort.toUpperCase()}`,
        model,
        effort,
      ),
    ),
  ),
  searchCase("search-pro", "Search Pro", "gpt-5.6-terra", "xhigh", "pro"),
  personaCase("persona-normal", "Persona Normal", "normal", "pro", "gpt-5.6-luna"),
  personaCase("persona-instant", "Persona Pro Instant", "pro", "instant", "gpt-5.6-sol"),
  personaCase("persona-max", "Persona Pro Max", "pro", "max", "gpt-5.6-sol"),
  personaCase("persona-pro", "Persona Pro", "pro", "pro", "gpt-5.6-sol"),
];

function normalizeBaseUrl(value) {
  const parsed = new URL(value);
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error("Base URL must use HTTP or HTTPS");
  }
  if (parsed.username || parsed.password) throw new Error("Base URL must not contain credentials");
  return parsed.origin;
}

function deploymentSha(response) {
  return response.headers?.get?.("x-archive-deployment-sha") ?? null;
}

function summarizeResult(payload) {
  if (!payload || typeof payload !== "object") {
    return {
      source: "missing",
      channel: "missing",
      reason: "missing",
      requestedModel: "missing",
      providerModel: "missing",
      providerResponseId: "missing",
      openaiRequestId: "missing",
      requestId: "missing",
      modelVerified: false,
    };
  }
  const delivery = payload.delivery && typeof payload.delivery === "object" ? payload.delivery : {};
  return {
    source: typeof payload.source === "string" ? payload.source : "missing",
    channel: typeof delivery.channel === "string" ? delivery.channel : "missing",
    reason: typeof delivery.reason === "string" ? delivery.reason : "missing",
    requestedModel: typeof payload.requestedModel === "string" ? payload.requestedModel : "missing",
    providerModel: typeof payload.providerModel === "string" ? payload.providerModel : "missing",
    providerResponseId:
      typeof payload.providerResponseId === "string" ? payload.providerResponseId : "missing",
    openaiRequestId:
      typeof payload.openaiRequestId === "string" ? payload.openaiRequestId : "missing",
    requestId: typeof payload.requestId === "string" ? payload.requestId : "missing",
    modelVerified: payload.modelVerified === true,
  };
}

function pendingEnvelope(payload) {
  return (
    payload &&
    typeof payload === "object" &&
    (payload.state === "queued" || payload.state === "running" || payload.state === "unknown") &&
    typeof payload.requestId === "string"
  );
}

function waitWithSignal(delay, signal) {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
    };
    const abort = () => {
      cleanup();
      reject(signal.reason);
    };
    const timer = setTimeout(() => {
      cleanup();
      resolve();
    }, delay);
    signal.addEventListener("abort", abort, { once: true });
  });
}

function allTrue(record, keys) {
  return Boolean(record) && keys.every((key) => record[key] === true);
}

async function readControlPlaneResponse({
  baseUrl,
  path,
  method,
  monitorToken,
  expectedSha,
  bypassToken,
  fetchImpl,
  signal,
}) {
  let response;
  try {
    response = await fetchImpl(new URL(path, baseUrl), {
      method,
      headers: {
        authorization: `Bearer ${monitorToken}`,
        "content-type": "application/json",
        ...(bypassToken
          ? {
              "x-vercel-protection-bypass": bypassToken,
              "x-vercel-set-bypass-cookie": "true",
            }
          : {}),
      },
      signal,
    });
  } catch {
    return { ok: false, failure: signal.aborted ? "timeout" : "network_error" };
  }
  const responseSha = deploymentSha(response);
  if (expectedSha && responseSha !== expectedSha) {
    return {
      ok: false,
      failure: "deployment_sha_mismatch",
      expectedSha,
      deploymentSha: responseSha ?? "missing",
      status: response.status,
    };
  }
  let payload;
  try {
    payload = await response.json();
  } catch {
    return { ok: false, failure: "invalid_json", status: response.status };
  }
  return {
    ok: response.ok,
    failure: response.ok ? null : "http_status",
    status: response.status,
    deploymentSha: responseSha ?? "missing",
    payload,
  };
}

export async function verifyArchiveAiControlPlane({
  baseUrl,
  fetchImpl = globalThis.fetch,
  timeoutMs = 30_000,
  expectedSha,
  monitorToken,
  bypassToken,
  runMaintenance = false,
}) {
  if (typeof monitorToken !== "string" || Buffer.byteLength(monitorToken.trim()) < 32) {
    throw new Error("A monitor token containing at least 32 bytes is required");
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Math.min(timeoutMs, 60_000));
  try {
    const health = await readControlPlaneResponse({
      baseUrl,
      path: "/api/internal/archive-ai-health",
      method: "GET",
      monitorToken: monitorToken.trim(),
      expectedSha,
      bypassToken,
      fetchImpl,
      signal: controller.signal,
    });
    if (!health.ok) return { ok: false, health, maintenance: null };
    const healthPayload = health.payload;
    const healthContract =
      healthPayload?.healthy === true &&
      healthPayload?.deploymentSha === expectedSha &&
      allTrue(healthPayload?.configured, [
        "openaiKey",
        "databaseUrl",
        "strict",
        "rateLimitSecret",
        "encryptionKey",
        "monitorToken",
      ]) &&
      healthPayload?.database?.connected === true &&
      allTrue(healthPayload?.database?.tables, ["requests", "rateCharges", "circuitBreakers"]) &&
      healthPayload?.crypto?.roundTrip === true;
    if (!healthContract) {
      return {
        ok: false,
        health: { ...health, ok: false, failure: "health_contract" },
        maintenance: null,
      };
    }
    if (!runMaintenance) return { ok: true, health, maintenance: null };
    const maintenance = await readControlPlaneResponse({
      baseUrl,
      path: "/api/internal/archive-ai-maintenance",
      method: "POST",
      monitorToken: monitorToken.trim(),
      expectedSha,
      bypassToken,
      fetchImpl,
      signal: controller.signal,
    });
    const maintenanceContract =
      maintenance.ok &&
      Number.isSafeInteger(maintenance.payload?.cleaned) &&
      maintenance.payload.cleaned >= 0 &&
      Number.isSafeInteger(maintenance.payload?.recovery?.examined) &&
      maintenance.payload.recovery.examined >= 0 &&
      Number.isSafeInteger(maintenance.payload?.recovery?.pending) &&
      maintenance.payload.recovery.pending >= 0 &&
      Number.isSafeInteger(maintenance.payload?.recovery?.succeeded) &&
      maintenance.payload.recovery.succeeded >= 0 &&
      Number.isSafeInteger(maintenance.payload?.recovery?.local) &&
      maintenance.payload.recovery.local >= 0 &&
      Number.isSafeInteger(maintenance.payload?.recovery?.failed) &&
      maintenance.payload.recovery.failed >= 0 &&
      maintenance.payload.recovery.errors === 0 &&
      maintenance.payload.recovery.examined ===
        maintenance.payload.recovery.pending +
          maintenance.payload.recovery.succeeded +
          maintenance.payload.recovery.local +
          maintenance.payload.recovery.failed +
          maintenance.payload.recovery.errors &&
      maintenance.payload?.deploymentSha === expectedSha;
    return {
      ok: maintenanceContract,
      health,
      maintenance: maintenanceContract
        ? maintenance
        : { ...maintenance, ok: false, failure: maintenance.failure ?? "maintenance_contract" },
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function verifyCase({
  baseUrl,
  deploymentCase,
  fetchImpl,
  timeoutMs,
  expectedSha,
  bypassToken,
  monitorToken,
}) {
  const requestId = randomUUID();
  const sessionId = randomUUID();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const headers = {
    "content-type": "application/json",
    "x-archive-client": deploymentCase.client,
    "x-archive-request-id": requestId,
    "x-archive-session-id": sessionId,
    origin: new URL(baseUrl).origin,
    "sec-fetch-site": "same-origin",
    "x-archive-monitor-token": monitorToken,
    ...(bypassToken
      ? {
          "x-vercel-protection-bypass": bypassToken,
          "x-vercel-set-bypass-cookie": "true",
        }
      : {}),
  };
  let endpoint = new URL(deploymentCase.path, baseUrl);
  let method = "POST";
  let body = JSON.stringify({ ...deploymentCase.body, requestId });
  let lastSha = null;
  try {
    for (;;) {
      let response;
      try {
        response = await fetchImpl(endpoint, {
          method,
          headers,
          body: method === "POST" ? body : undefined,
          signal: controller.signal,
        });
      } catch {
        return {
          id: deploymentCase.id,
          label: deploymentCase.label,
          ok: false,
          failure: controller.signal.aborted ? "timeout" : "network_error",
          status: null,
        };
      }
      lastSha = deploymentSha(response);
      if (expectedSha && lastSha !== expectedSha) {
        return {
          id: deploymentCase.id,
          label: deploymentCase.label,
          ok: false,
          failure: "deployment_sha_mismatch",
          status: response.status,
          expectedSha,
          deploymentSha: lastSha ?? "missing",
        };
      }
      if (response.status !== 200 && response.status !== 202) {
        return {
          id: deploymentCase.id,
          label: deploymentCase.label,
          ok: false,
          failure: "http_status",
          status: response.status,
        };
      }
      let envelope;
      try {
        envelope = await response.json();
      } catch {
        return {
          id: deploymentCase.id,
          label: deploymentCase.label,
          ok: false,
          failure: "invalid_json",
          status: response.status,
        };
      }
      if (pendingEnvelope(envelope)) {
        const delay = Math.max(250, Math.min(5_000, Number(envelope.retryAfterMs) || 1_000));
        await waitWithSignal(delay, controller.signal);
        endpoint = new URL(`/api/archive-ai/requests/${requestId}`, baseUrl);
        method = "GET";
        body = undefined;
        continue;
      }
      if (
        !envelope ||
        typeof envelope !== "object" ||
        (envelope.state !== "succeeded" && envelope.state !== "local")
      ) {
        return {
          id: deploymentCase.id,
          label: deploymentCase.label,
          ok: false,
          failure: "request_state",
          status: response.status,
          state: typeof envelope?.state === "string" ? envelope.state : "missing",
          reason: typeof envelope?.reason === "string" ? envelope.reason : "missing",
        };
      }
      const summary = summarizeResult(envelope.result);
      const providerResponseId =
        typeof envelope.providerResponseId === "string"
          ? envelope.providerResponseId
          : summary.providerResponseId;
      const openaiRequestId =
        typeof envelope.openaiRequestId === "string" ? envelope.openaiRequestId : "missing";
      const requestedModel =
        typeof envelope.requestedModel === "string"
          ? envelope.requestedModel
          : summary.requestedModel;
      const providerModel =
        typeof envelope.providerModel === "string" ? envelope.providerModel : summary.providerModel;
      const ok =
        envelope.state === "succeeded" &&
        envelope.requestId === requestId &&
        summary.source === "openai" &&
        summary.channel === "online" &&
        summary.reason === "ok" &&
        summary.modelVerified &&
        requestedModel === deploymentCase.expectedModel &&
        isAllowedArchiveProviderModel(deploymentCase.expectedModel, providerModel) &&
        /^resp_[A-Za-z0-9_-]{8,}$/u.test(providerResponseId) &&
        /^req_[A-Za-z0-9_-]{8,}$/u.test(openaiRequestId) &&
        summary.requestId === requestId &&
        summary.openaiRequestId === openaiRequestId &&
        summary.providerResponseId === providerResponseId;
      return {
        id: deploymentCase.id,
        label: deploymentCase.label,
        ok,
        failure: ok ? null : "deployment_contract",
        status: response.status,
        expectedModel: deploymentCase.expectedModel,
        requestedModel,
        providerModel,
        providerResponseId,
        openaiRequestId,
        source: summary.source,
        channel: summary.channel,
        reason: summary.reason,
        modelVerified: summary.modelVerified,
        deploymentSha: lastSha ?? "missing",
      };
    }
  } catch {
    return {
      id: deploymentCase.id,
      label: deploymentCase.label,
      ok: false,
      failure: controller.signal.aborted ? "timeout" : "verification_error",
      status: null,
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function verifyArchiveAiDeployment({
  baseUrl,
  fetchImpl = globalThis.fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  expectedSha,
  bypassToken,
  rounds = 1,
  monitorToken,
  runMaintenance = false,
  probeControlPlane = true,
  controlPlaneOnly = false,
} = {}) {
  if (!baseUrl) throw new Error("An explicit base URL is required");
  if (!expectedSha) throw new Error("An explicit expected deployment SHA is required");
  if (typeof monitorToken !== "string" || Buffer.byteLength(monitorToken.trim()) < 32) {
    throw new Error("A monitor token containing at least 32 bytes is required");
  }
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl);
  if (typeof fetchImpl !== "function")
    throw new Error("A Fetch-compatible implementation is required");
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1_000 || timeoutMs > 600_000) {
    throw new Error("Timeout must be an integer between 1000 and 600000 milliseconds");
  }
  if (!Number.isSafeInteger(rounds) || rounds < 1 || rounds > 3) {
    throw new Error("Rounds must be an integer between 1 and 3");
  }
  const controlPlane = probeControlPlane
    ? await verifyArchiveAiControlPlane({
        baseUrl: normalizedBaseUrl,
        fetchImpl,
        timeoutMs,
        expectedSha,
        monitorToken,
        bypassToken,
        runMaintenance,
      })
    : null;
  if (controlPlane && !controlPlane.ok) {
    return { ok: false, baseUrl: normalizedBaseUrl, controlPlane, results: [] };
  }
  if (controlPlaneOnly) {
    if (!controlPlane)
      throw new Error("Control-plane-only verification requires the control probe");
    return { ok: controlPlane.ok, baseUrl: normalizedBaseUrl, controlPlane, results: [] };
  }
  const results = [];
  for (let round = 1; round <= rounds; round += 1) {
    for (const deploymentCase of ARCHIVE_AI_DEPLOYMENT_CASES) {
      results.push(
        await verifyCase({
          baseUrl: normalizedBaseUrl,
          deploymentCase: {
            ...deploymentCase,
            label: `${deploymentCase.label} [${round}/${rounds}]`,
          },
          fetchImpl,
          timeoutMs,
          expectedSha,
          bypassToken,
          monitorToken: monitorToken.trim(),
        }),
      );
    }
  }
  return {
    ok: (!controlPlane || controlPlane.ok) && results.every((result) => result.ok),
    baseUrl: normalizedBaseUrl,
    controlPlane,
    results,
  };
}

function printResult(result, log, error) {
  if (result.ok) {
    log(`PASS ${result.label}: ${result.providerModel} / verified`);
    return;
  }
  if (result.failure === "deployment_contract") {
    error(
      `FAIL ${result.label}: source=${result.source}, channel=${result.channel}, reason=${result.reason}, requested=${result.requestedModel}, provider=${result.providerModel}, verified=${result.modelVerified}`,
    );
    return;
  }
  if (result.failure === "deployment_sha_mismatch") {
    error(
      `FAIL ${result.label}: deployment SHA ${result.deploymentSha} (expected ${result.expectedSha})`,
    );
    return;
  }
  if (result.failure === "http_status") {
    error(`FAIL ${result.label}: HTTP ${result.status}`);
    return;
  }
  error(`FAIL ${result.label}: ${result.failure}${result.reason ? ` / ${result.reason}` : ""}`);
}

function option(args, name) {
  const index = args.indexOf(name);
  if (index >= 0) {
    if (!args[index + 1]) throw new Error(`${name} requires a value`);
    return args[index + 1];
  }
  const inline = args.find((argument) => argument.startsWith(`${name}=`));
  return inline?.slice(name.length + 1);
}

export async function runArchiveAiDeploymentCheck({
  args = process.argv.slice(2),
  environment = process.env,
  fetchImpl = globalThis.fetch,
  log = console.log,
  error = console.error,
} = {}) {
  const baseUrl = option(args, "--base-url") || environment.ARCHIVE_AI_BASE_URL;
  const expectedSha = option(args, "--expected-sha") || environment.ARCHIVE_EXPECTED_SHA;
  const bypassToken = option(args, "--vercel-bypass-token") || environment.VERCEL_PROTECTION_BYPASS;
  const monitorToken = option(args, "--monitor-token") || environment.ARCHIVE_MONITOR_TOKEN;
  const runMaintenance = args.includes("--maintenance");
  const controlPlaneOnly = args.includes("--control-plane-only");
  if (!baseUrl) throw new Error("--base-url or ARCHIVE_AI_BASE_URL is required");
  if (!expectedSha) throw new Error("--expected-sha or ARCHIVE_EXPECTED_SHA is required");
  const rounds = Number(option(args, "--rounds") || environment.ARCHIVE_AI_VERIFY_ROUNDS || 1);
  const timeoutMs = Number(environment.ARCHIVE_AI_VERIFY_TIMEOUT_MS || DEFAULT_TIMEOUT_MS);
  const report = await verifyArchiveAiDeployment({
    baseUrl,
    fetchImpl,
    timeoutMs,
    expectedSha,
    bypassToken,
    rounds,
    monitorToken,
    runMaintenance,
    controlPlaneOnly,
  });
  log(`Archive AI deployment check: ${report.baseUrl}`);
  if (report.controlPlane?.ok) {
    log(
      `PASS Archive AI control plane: health attested${report.controlPlane.maintenance ? " / maintenance completed" : ""}`,
    );
  } else if (report.controlPlane) {
    const failure =
      report.controlPlane.health?.failure ??
      report.controlPlane.maintenance?.failure ??
      "control_plane_contract";
    error(`FAIL Archive AI control plane: ${failure}`);
  }
  for (const result of report.results) printResult(result, log, error);
  if (!report.ok) error("Archive AI deployment is not fully online and attested.");
  return report.ok ? 0 : 1;
}

const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectRun) {
  try {
    process.exitCode = await runArchiveAiDeploymentCheck();
  } catch (error) {
    console.error(
      `Archive AI deployment check could not run: ${error instanceof Error ? error.message : "unknown error"}`,
    );
    process.exitCode = 1;
  }
}
