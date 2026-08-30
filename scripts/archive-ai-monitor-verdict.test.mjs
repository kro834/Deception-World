import assert from "node:assert/strict";
import { readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  classifyArchiveAiMonitorReport,
  runArchiveAiMonitorCheck,
} from "./archive-ai-monitor-verdict.mjs";

const SHA = "0123456789abcdef0123456789abcdef01234567";
const TOKEN = "monitor-token".repeat(4);
const workflow = readFileSync(".github/workflows/archive-ai-monitor.yml", "utf8");

test("control-plane configuration and SHA failures require rollback", () => {
  const configuration = classifyArchiveAiMonitorReport(
    {
      ok: false,
      controlPlane: {
        health: {
          ok: false,
          failure: "http_status",
          status: 503,
          payload: {
            healthy: false,
            configured: { openaiKey: false, databaseUrl: true },
          },
        },
        maintenance: null,
      },
    },
    "control-plane",
  );
  assert.deepEqual(configuration, {
    verdict: "rollback",
    reason: "health_configuration_contract",
  });

  const shaMismatch = classifyArchiveAiMonitorReport(
    {
      ok: false,
      controlPlane: {
        health: { ok: false, failure: "deployment_sha_mismatch", status: 200 },
        maintenance: null,
      },
    },
    "control-plane",
  );
  assert.equal(shaMismatch.verdict, "rollback");
});

test("network, timeout, 429, and 5xx model failures are alert-only", () => {
  for (const result of [
    { id: "network", ok: false, failure: "network_error", status: null },
    { id: "timeout", ok: false, failure: "timeout", status: null },
    { id: "rate", ok: false, failure: "http_status", status: 429 },
    { id: "upstream", ok: false, failure: "http_status", status: 503 },
    {
      id: "provider",
      ok: false,
      failure: "request_state",
      status: 200,
      reason: "provider_unavailable",
    },
  ]) {
    const classification = classifyArchiveAiMonitorReport(
      { ok: false, controlPlane: { ok: true }, results: [result] },
      "all-routes",
    );
    assert.equal(classification.verdict, "alert_only", result.id);
  }
});

test("a shared database outage alerts without blindly rolling back", () => {
  const classification = classifyArchiveAiMonitorReport(
    {
      ok: false,
      controlPlane: {
        health: {
          ok: false,
          failure: "http_status",
          status: 503,
          payload: {
            healthy: false,
            configured: {
              openaiKey: true,
              databaseUrl: true,
              strict: true,
              rateLimitSecret: true,
              encryptionKey: true,
              monitorToken: true,
            },
            database: { connected: false },
          },
        },
        maintenance: null,
      },
    },
    "control-plane",
  );
  assert.equal(classification.verdict, "alert_only");
});

test("verified app contract and provider-model mismatches require rollback", () => {
  for (const result of [
    {
      id: "model",
      ok: false,
      failure: "deployment_contract",
      status: 200,
      reason: "provider_model_mismatch",
    },
    {
      id: "envelope",
      ok: false,
      failure: "deployment_contract",
      status: 200,
      reason: "ok",
    },
    { id: "route", ok: false, failure: "http_status", status: 404 },
  ]) {
    const classification = classifyArchiveAiMonitorReport(
      { ok: false, controlPlane: { ok: true }, results: [result] },
      "all-routes",
    );
    assert.equal(classification.verdict, "rollback", result.id);
  }
});

test("monitor CLI emits only a bounded verdict and fails an alert-only incident", async () => {
  const outputPath = join(tmpdir(), `archive-monitor-${crypto.randomUUID()}.txt`);
  writeFileSync(outputPath, "");
  try {
    const lines = [];
    const exitCode = await runArchiveAiMonitorCheck({
      args: [
        "--phase",
        "all-routes",
        "--base-url",
        "https://archive.example",
        "--expected-sha",
        SHA,
        "--monitor-token",
        TOKEN,
        "--github-output",
        outputPath,
      ],
      environment: {},
      verify: async () => ({
        ok: false,
        controlPlane: { ok: true },
        results: [{ id: "terra", ok: false, failure: "http_status", status: 503 }],
      }),
      log: (line) => lines.push(line),
    });
    assert.equal(exitCode, 1);
    assert.equal(
      readFileSync(outputPath, "utf8"),
      "verdict=alert_only\nreason=terra_transient_http_503\n",
    );
    assert.ok(lines.every((line) => !line.includes(TOKEN)));
  } finally {
    unlinkSync(outputPath);
  }
});

test("monitor rollback is main-only, stale-safe, and excludes alert-only verdicts", () => {
  const workflowPreamble = workflow.slice(0, workflow.indexOf("jobs:"));
  const rollback = workflow.slice(
    workflow.indexOf("- name: Roll back only a deployment-attributable Production failure"),
    workflow.indexOf("- name: Fail the workflow to trigger incident email notification"),
  );
  assert.match(workflow, /if: github\.ref == 'refs\/heads\/main'/u);
  assert.match(workflow, /group: deception-world-production-main/u);
  assert.match(workflow, /fetch-depth: 0/u);
  assert.doesNotMatch(workflowPreamble, /\$\{\{ secrets\./u);
  assert.match(
    workflow,
    /current\.id !== expectedId \|\| current\.url !== expectedUrl \|\| current\.sha !== expectedSha/u,
  );
  const rollbackIf = workflow.match(/if: always\(\) && steps\.production[^\n]+/u)?.[0] ?? "";
  assert.match(rollbackIf, /outputs\.verdict == 'rollback'/u);
  assert.doesNotMatch(rollbackIf, /alert_only/u);
  assert.doesNotMatch(rollbackIf, /steps\.maintenance/u);
  assert.match(workflow, /if \[ "\$production_sha" = "\$GITHUB_SHA" \]/u);
  assert.match(workflow, /echo "current=false" >> "\$GITHUB_OUTPUT"/u);
  assert.match(workflow, /echo "durable=true" >> "\$GITHUB_OUTPUT"/u);
  assert.match(
    workflow,
    /steps\.identity\.outcome == 'success' && steps\.identity\.outputs\.durable == 'true' && steps\.identity\.outputs\.current != 'true'/u,
  );
  assert.match(workflow, /node scripts\/archive-ai-maintenance-v1\.mjs/u);
  assert.match(
    workflow,
    /Verify an older durable Production control plane without rollback authority[\s\S]*?--control-plane-only/u,
  );
  assert.match(
    workflow,
    /Verify older durable Production model routes without rollback authority[\s\S]*?--phase all-routes/u,
  );
  assert.match(
    workflow,
    /steps\.identity\.outcome == 'success' && steps\.identity\.outputs\.current == 'true'/u,
  );
  const failureGate = workflow.match(/if: always\(\) && \(steps\.credentials[^\n]+/u)?.[0] ?? "";
  assert.match(failureGate, /steps\.maintenance\.outcome == 'failure'/u);
  assert.match(failureGate, /steps\.ancestor_control\.outcome == 'failure'/u);
  assert.match(failureGate, /steps\.ancestor_routes\.outcome == 'failure'/u);
  assert.doesNotMatch(failureGate, /current != 'true'/u);
  assert.match(workflow, /restored\.url === failedUrl \|\| restored\.sha === failedSha/u);
  assert.match(rollback, /projectId: process\.env\.VERCEL_PROJECT_ID/u);
  assert.match(rollback, /--phase all-routes[\s\S]*?--expected-sha "\$restored_sha"/u);
  assert.match(workflow, /node scripts\/archive-ai-monitor-verdict\.mjs "\$\{args\[@\]\}"/u);
  assert.match(workflow, /exit 1\s*$/u);
});
