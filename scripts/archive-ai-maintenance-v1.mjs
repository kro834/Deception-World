import { appendFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const SHA_PATTERN = /^[0-9a-f]{40}$/iu;

function option(args, name) {
  const index = args.indexOf(name);
  if (index >= 0) {
    if (!args[index + 1]) throw new Error(`${name} requires a value`);
    return args[index + 1];
  }
  return args.find((argument) => argument.startsWith(`${name}=`))?.slice(name.length + 1);
}

function safeOutputValue(value) {
  return String(value)
    .replace(/[^a-zA-Z0-9_.:-]+/gu, "_")
    .slice(0, 180);
}

function nonNegativeInteger(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function validRecovery(recovery) {
  if (!recovery || typeof recovery !== "object") return false;
  const fields = ["examined", "pending", "succeeded", "local", "failed", "errors"];
  if (!fields.every((field) => nonNegativeInteger(recovery[field]))) return false;
  return (
    recovery.examined ===
    recovery.pending + recovery.succeeded + recovery.local + recovery.failed + recovery.errors
  );
}

function normalizeBaseUrl(value) {
  const parsed = new URL(value);
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error("Base URL must use HTTP or HTTPS");
  }
  if (parsed.username || parsed.password) throw new Error("Base URL must not contain credentials");
  return parsed.origin;
}

export async function runArchiveAiMaintenanceV1({
  baseUrl,
  expectedSha,
  monitorToken,
  bypassToken,
  timeoutMs = 60_000,
  fetchImpl = globalThis.fetch,
}) {
  if (!SHA_PATTERN.test(expectedSha ?? "")) {
    throw new Error("An exact Production commit SHA is required");
  }
  if (typeof monitorToken !== "string" || Buffer.byteLength(monitorToken.trim()) < 32) {
    throw new Error("A monitor token containing at least 32 bytes is required");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Math.min(timeoutMs, 60_000));
  let response;
  try {
    response = await fetchImpl(
      new URL("/api/internal/archive-ai-maintenance", normalizeBaseUrl(baseUrl)),
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${monitorToken.trim()}`,
          "content-type": "application/json",
          "x-archive-maintenance-contract": "1",
          ...(bypassToken
            ? {
                "x-vercel-protection-bypass": bypassToken,
                "x-vercel-set-bypass-cookie": "true",
              }
            : {}),
        },
        signal: controller.signal,
      },
    );
  } catch {
    return { ok: false, reason: controller.signal.aborted ? "timeout" : "network_error" };
  } finally {
    clearTimeout(timeout);
  }

  const deploymentSha = response.headers.get("x-archive-deployment-sha");
  if (deploymentSha !== expectedSha.toLowerCase()) {
    return {
      ok: false,
      reason: "deployment_sha_mismatch",
      status: response.status,
      deploymentSha: deploymentSha ?? "missing",
    };
  }

  let payload;
  try {
    payload = await response.json();
  } catch {
    return { ok: false, reason: "invalid_json", status: response.status, deploymentSha };
  }

  // The first durable-ledger release had the same bounded shape but no explicit
  // version field. Accept that exact legacy shape as v1 so a newer main monitor
  // can keep the last healthy Production ancestor draining its pending jobs.
  const supportedVersion = payload?.contractVersion === undefined || payload?.contractVersion === 1;
  const contractValid =
    supportedVersion &&
    nonNegativeInteger(payload?.cleaned) &&
    validRecovery(payload?.recovery) &&
    payload?.deploymentSha === expectedSha.toLowerCase();
  if (!contractValid) {
    return {
      ok: false,
      reason: supportedVersion ? "maintenance_contract" : "unsupported_contract_version",
      status: response.status,
      deploymentSha,
    };
  }
  if (!response.ok || payload.recovery.errors > 0) {
    return {
      ok: false,
      reason: payload.recovery.errors > 0 ? "recovery_errors" : "http_status",
      status: response.status,
      deploymentSha,
    };
  }
  return {
    ok: true,
    reason: "maintenance_v1_ok",
    status: response.status,
    deploymentSha,
  };
}

export async function runArchiveAiMaintenanceCli({
  args = process.argv.slice(2),
  environment = process.env,
  run = runArchiveAiMaintenanceV1,
  log = console.log,
} = {}) {
  const baseUrl = option(args, "--base-url") || environment.ARCHIVE_AI_BASE_URL;
  const expectedSha = option(args, "--expected-sha") || environment.ARCHIVE_EXPECTED_SHA;
  const monitorToken = option(args, "--monitor-token") || environment.ARCHIVE_MONITOR_TOKEN;
  const bypassToken = option(args, "--vercel-bypass-token") || environment.VERCEL_PROTECTION_BYPASS;
  const githubOutput = option(args, "--github-output");
  if (!baseUrl) throw new Error("An explicit Production base URL is required");

  const result = await run({
    baseUrl,
    expectedSha: expectedSha?.toLowerCase(),
    monitorToken,
    bypassToken,
    timeoutMs: Number(environment.ARCHIVE_AI_VERIFY_TIMEOUT_MS || 60_000),
  });
  const verdict = result.ok ? "pass" : "alert_only";
  log(`Archive AI maintenance v1: ${verdict} / ${result.reason}`);
  if (githubOutput) {
    appendFileSync(
      githubOutput,
      `verdict=${safeOutputValue(verdict)}\nreason=${safeOutputValue(result.reason)}\n`,
    );
  }
  return result.ok ? 0 : 1;
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  runArchiveAiMaintenanceCli()
    .then((exitCode) => {
      process.exitCode = exitCode;
    })
    .catch((error) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    });
}
