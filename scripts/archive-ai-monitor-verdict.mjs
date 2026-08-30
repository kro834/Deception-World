import { appendFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { verifyArchiveAiDeployment } from "./verify-archive-ai-deployment.mjs";

const TRANSIENT_HTTP_STATUSES = new Set([408, 409, 425, 429]);
const AMBIGUOUS_PROVIDER_REASONS = new Set([
  "provider_timeout",
  "provider_unavailable",
  "provider_rate_limited",
  "provider_quota",
  "provider_invalid_response",
  "shared_state_unavailable",
]);
const DEPLOYMENT_CONFIGURATION_REASONS = new Set([
  "unconfigured",
  "provider_authentication",
  "provider_permission",
  "provider_model_unavailable",
  "provider_model_mismatch",
]);

function transientHttpStatus(status) {
  return TRANSIENT_HTTP_STATUSES.has(status) || (status >= 500 && status <= 599);
}

function definiteHealthConfigurationFailure(probe) {
  const payload = probe?.payload;
  if (!payload || typeof payload !== "object") return false;
  if (payload.healthy === true) return false;
  const configured = payload.configured;
  if (
    configured &&
    typeof configured === "object" &&
    Object.values(configured).some((value) => value === false)
  ) {
    return true;
  }
  return (
    (payload.database?.connected === true &&
      payload.database?.tables &&
      Object.values(payload.database.tables).some((value) => value === false)) ||
    payload.crypto?.roundTrip === false
  );
}

function classifyControlProbe(probe, kind) {
  if (!probe || probe.ok) return { verdict: "pass", reason: `${kind}_ok` };
  if (probe.failure === "deployment_sha_mismatch") {
    return { verdict: "rollback", reason: `${kind}_deployment_sha_mismatch` };
  }
  if (kind === "health" && definiteHealthConfigurationFailure(probe)) {
    return { verdict: "rollback", reason: "health_configuration_contract" };
  }
  if (probe.failure === "health_contract") {
    return { verdict: "rollback", reason: "health_contract" };
  }
  if (probe.failure === "maintenance_contract") {
    return transientHttpStatus(probe.status)
      ? { verdict: "alert_only", reason: "maintenance_upstream_or_shared_failure" }
      : { verdict: "rollback", reason: "maintenance_contract" };
  }
  if (probe.failure === "invalid_json") {
    return transientHttpStatus(probe.status)
      ? { verdict: "alert_only", reason: `${kind}_upstream_invalid_json` }
      : { verdict: "rollback", reason: `${kind}_invalid_json_contract` };
  }
  if (probe.failure === "http_status") {
    return transientHttpStatus(probe.status)
      ? { verdict: "alert_only", reason: `${kind}_transient_http_${probe.status}` }
      : { verdict: "rollback", reason: `${kind}_http_${probe.status ?? "unknown"}` };
  }
  if (probe.failure === "timeout" || probe.failure === "network_error") {
    return { verdict: "alert_only", reason: `${kind}_${probe.failure}` };
  }
  return { verdict: "alert_only", reason: `${kind}_${probe.failure ?? "unknown"}` };
}

function classifyRouteResult(result) {
  if (result.ok) return { verdict: "pass", reason: `${result.id}_ok` };
  if (result.failure === "deployment_sha_mismatch") {
    return { verdict: "rollback", reason: `${result.id}_deployment_sha_mismatch` };
  }
  if (result.failure === "timeout" || result.failure === "network_error") {
    return { verdict: "alert_only", reason: `${result.id}_${result.failure}` };
  }
  if (result.failure === "http_status") {
    return transientHttpStatus(result.status)
      ? { verdict: "alert_only", reason: `${result.id}_transient_http_${result.status}` }
      : { verdict: "rollback", reason: `${result.id}_http_${result.status ?? "unknown"}` };
  }
  if (AMBIGUOUS_PROVIDER_REASONS.has(result.reason)) {
    return { verdict: "alert_only", reason: `${result.id}_${result.reason}` };
  }
  if (DEPLOYMENT_CONFIGURATION_REASONS.has(result.reason)) {
    return { verdict: "rollback", reason: `${result.id}_${result.reason}` };
  }
  if (result.failure === "deployment_contract" || result.failure === "invalid_json") {
    return { verdict: "rollback", reason: `${result.id}_${result.failure}` };
  }
  if (result.failure === "request_state") {
    return { verdict: "rollback", reason: `${result.id}_request_state_${result.reason}` };
  }
  return { verdict: "alert_only", reason: `${result.id}_${result.failure ?? "unknown"}` };
}

function collapseVerdicts(classifications, fallbackReason) {
  const rollback = classifications.find((classification) => classification.verdict === "rollback");
  if (rollback) return rollback;
  const alert = classifications.find((classification) => classification.verdict === "alert_only");
  if (alert) return alert;
  return { verdict: "alert_only", reason: fallbackReason };
}

export function classifyArchiveAiMonitorReport(report, phase) {
  if (report?.ok === true) return { verdict: "pass", reason: `${phase}_ok` };
  if (phase === "control-plane") {
    const classifications = [
      classifyControlProbe(report?.controlPlane?.health, "health"),
      ...(report?.controlPlane?.maintenance
        ? [classifyControlProbe(report.controlPlane.maintenance, "maintenance")]
        : []),
    ].filter((classification) => classification.verdict !== "pass");
    return collapseVerdicts(classifications, "control_plane_unknown");
  }
  const controlClassification = report?.controlPlane?.ok
    ? null
    : classifyControlProbe(report?.controlPlane?.health, "health");
  if (controlClassification?.verdict === "rollback") return controlClassification;
  const routeClassifications = Array.isArray(report?.results)
    ? report.results
        .map(classifyRouteResult)
        .filter((classification) => classification.verdict !== "pass")
    : [];
  return collapseVerdicts(
    [...(controlClassification ? [controlClassification] : []), ...routeClassifications],
    "model_routes_unknown",
  );
}

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

export async function runArchiveAiMonitorCheck({
  args = process.argv.slice(2),
  environment = process.env,
  verify = verifyArchiveAiDeployment,
  log = console.log,
} = {}) {
  const phase = option(args, "--phase");
  if (phase !== "control-plane" && phase !== "all-routes") {
    throw new Error("--phase must be control-plane or all-routes");
  }
  const baseUrl = option(args, "--base-url") || environment.ARCHIVE_AI_BASE_URL;
  const expectedSha = option(args, "--expected-sha") || environment.ARCHIVE_EXPECTED_SHA;
  const monitorToken = option(args, "--monitor-token") || environment.ARCHIVE_MONITOR_TOKEN;
  const bypassToken = option(args, "--vercel-bypass-token") || environment.VERCEL_PROTECTION_BYPASS;
  const githubOutput = option(args, "--github-output");
  if (!baseUrl) throw new Error("An explicit Production base URL is required");
  if (!/^[0-9a-f]{40}$/iu.test(expectedSha ?? "")) {
    throw new Error("An exact Production commit SHA is required");
  }
  if (typeof monitorToken !== "string" || Buffer.byteLength(monitorToken.trim()) < 32) {
    throw new Error("A monitor token containing at least 32 bytes is required");
  }
  const report = await verify({
    baseUrl,
    expectedSha: expectedSha.toLowerCase(),
    monitorToken: monitorToken.trim(),
    bypassToken,
    timeoutMs: Number(environment.ARCHIVE_AI_VERIFY_TIMEOUT_MS || 180_000),
    controlPlaneOnly: phase === "control-plane",
    runMaintenance: phase === "control-plane",
  });
  const classification = classifyArchiveAiMonitorReport(report, phase);
  log(`Archive AI monitor ${phase}: ${classification.verdict} / ${classification.reason}`);
  if (githubOutput) {
    appendFileSync(
      githubOutput,
      `verdict=${safeOutputValue(classification.verdict)}\nreason=${safeOutputValue(classification.reason)}\n`,
    );
  }
  return classification.verdict === "pass" ? 0 : 1;
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  runArchiveAiMonitorCheck()
    .then((exitCode) => {
      process.exitCode = exitCode;
    })
    .catch((error) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    });
}
