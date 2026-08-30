import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  ARCHIVE_AI_DEPLOYMENT_CASES,
  runArchiveAiDeploymentCheck,
  verifyArchiveAiControlPlane,
  verifyArchiveAiDeployment,
} from "./verify-archive-ai-deployment.mjs";

const SHA = "0123456789abcdef0123456789abcdef01234567";
const TOKEN = "monitor-token".repeat(4);
const deploymentWorkflow = readFileSync(".github/workflows/deploy-main.yml", "utf8");
const monitorWorkflow = readFileSync(".github/workflows/archive-ai-monitor.yml", "utf8");
const vercelConfig = JSON.parse(readFileSync("vercel.json", "utf8"));

function providerModelFor(deploymentCase) {
  return deploymentCase.expectedModel === "gpt-5.5"
    ? "gpt-5.5-2026-04-23"
    : deploymentCase.expectedModel;
}

function onlineEnvelope(deploymentCase, requestId = crypto.randomUUID()) {
  const providerResponseId = `resp_${requestId.replaceAll("-", "")}`;
  const providerModel = providerModelFor(deploymentCase);
  const result = {
    reply: "接続確認済みです。",
    source: "openai",
    requestedModel: deploymentCase.expectedModel,
    providerModel,
    providerResponseId,
    openaiRequestId: `req_${requestId.replaceAll("-", "")}`,
    requestId,
    modelVerified: true,
    delivery: { channel: "online", reason: "ok" },
  };
  return {
    requestId,
    state: "succeeded",
    requestedModel: deploymentCase.expectedModel,
    providerModel,
    providerResponseId,
    openaiRequestId: `req_${requestId.replaceAll("-", "")}`,
    result,
  };
}

test("Vercel Git cannot bypass the attested main promotion workflow", () => {
  assert.equal(vercelConfig.git?.deploymentEnabled?.main, false);
  assert.equal(vercelConfig.github?.autoAlias, false);
});

function json(payload, status = 200, sha = SHA) {
  return Response.json(payload, {
    status,
    headers: { "x-archive-deployment-sha": sha },
  });
}

test("deployment verifier covers every selectable Search and persona route", async () => {
  const requests = [];
  const report = await verifyArchiveAiDeployment({
    baseUrl: "https://archive.example/intelligence",
    expectedSha: SHA,
    monitorToken: TOKEN,
    probeControlPlane: false,
    fetchImpl: async (input, init) => {
      const deploymentCase = ARCHIVE_AI_DEPLOYMENT_CASES[requests.length];
      const body = JSON.parse(init.body);
      requests.push({ input: String(input), init, body });
      return json(onlineEnvelope(deploymentCase, body.requestId));
    },
  });

  assert.equal(report.ok, true);
  assert.equal(report.baseUrl, "https://archive.example");
  assert.equal(report.results.length, 13);
  assert.deepEqual(
    report.results.map(({ id, ok, providerModel }) => ({ id, ok, providerModel })),
    ARCHIVE_AI_DEPLOYMENT_CASES.map((deploymentCase) => ({
      id: deploymentCase.id,
      ok: true,
      providerModel: providerModelFor(deploymentCase),
    })),
  );
  assert.ok(requests.every((request) => request.init.headers["x-archive-request-id"]));
  assert.ok(requests.every((request) => request.init.headers["x-archive-session-id"]));
  assert.ok(requests.every((request) => request.init.headers["x-archive-monitor-token"] === TOKEN));
  assert.ok(
    requests.every(
      (request) => request.body.requestId === request.init.headers["x-archive-request-id"],
    ),
  );
  assert.deepEqual(
    requests.slice(0, 8).map((request) => request.body.modelPreference),
    ["gpt-5.5", "gpt-5.6-terra"].flatMap((model) =>
      ["low", "medium", "high", "xhigh"].map((effort) => ({
        model,
        effort,
        execution: "standard",
      })),
    ),
  );
  assert.deepEqual(requests[8].body.modelPreference, {
    model: "gpt-5.6-terra",
    effort: "xhigh",
    execution: "pro",
  });
  assert.deepEqual(
    requests.slice(9).map((request) => request.body.proProfile),
    ["pro", "instant", "max", "pro"],
  );
});

test("deployment verifier polls an accepted job with the same logical identifiers", async () => {
  let call = 0;
  let postIndex = 0;
  const firstCase = ARCHIVE_AI_DEPLOYMENT_CASES[0];
  const seen = [];
  const report = await verifyArchiveAiDeployment({
    baseUrl: "https://archive.example",
    expectedSha: SHA,
    timeoutMs: 10_000,
    monitorToken: TOKEN,
    probeControlPlane: false,
    fetchImpl: async (input, init) => {
      call += 1;
      seen.push({ url: String(input), method: init.method, headers: init.headers });
      if (call === 1) {
        const requestId = init.headers["x-archive-request-id"];
        return json(
          {
            requestId,
            state: "running",
            retryAfterMs: 250,
            requestedModel: firstCase.expectedModel,
            expiresAt: new Date(Date.now() + 60_000).toISOString(),
          },
          202,
        );
      }
      if (call === 2) {
        return json(onlineEnvelope(firstCase, init.headers["x-archive-request-id"]));
      }
      const deploymentCase = ARCHIVE_AI_DEPLOYMENT_CASES[postIndex + 1];
      postIndex += 1;
      const body = JSON.parse(init.body);
      return json(onlineEnvelope(deploymentCase, body.requestId));
    },
  });
  assert.equal(report.ok, true);
  assert.equal(seen[0].method, "POST");
  assert.equal(seen[1].method, "GET");
  assert.match(new URL(seen[1].url).pathname, /\/api\/archive-ai\/requests\//u);
  assert.equal(seen[0].headers["x-archive-request-id"], seen[1].headers["x-archive-request-id"]);
});

test("control-plane verifier authenticates health and maintenance and validates their contracts", async () => {
  const token = "m".repeat(48);
  const seen = [];
  const report = await verifyArchiveAiControlPlane({
    baseUrl: "https://archive.example",
    expectedSha: SHA,
    monitorToken: token,
    runMaintenance: true,
    fetchImpl: async (input, init) => {
      seen.push({ url: String(input), init });
      if (seen.length === 1) {
        return json({
          healthy: true,
          configured: {
            openaiKey: true,
            databaseUrl: true,
            strict: true,
            rateLimitSecret: true,
            encryptionKey: true,
            monitorToken: true,
          },
          database: {
            connected: true,
            tables: { requests: true, rateCharges: true, circuitBreakers: true },
          },
          crypto: { roundTrip: true },
          deploymentSha: SHA,
        });
      }
      return json({
        cleaned: 2,
        recovery: { examined: 2, pending: 1, succeeded: 1, local: 0, failed: 0, errors: 0 },
        deploymentSha: SHA,
      });
    },
  });
  assert.equal(report.ok, true);
  assert.equal(seen.length, 2);
  assert.equal(seen[0].init.method, "GET");
  assert.equal(seen[1].init.method, "POST");
  assert.equal(seen[0].init.headers.authorization, `Bearer ${token}`);
  assert.equal(seen[1].init.headers.authorization, `Bearer ${token}`);
});

test("control-plane verifier fails closed when required tables are absent", async () => {
  const report = await verifyArchiveAiControlPlane({
    baseUrl: "https://archive.example",
    expectedSha: SHA,
    monitorToken: "m".repeat(48),
    fetchImpl: async () =>
      json({
        healthy: false,
        configured: {
          openaiKey: true,
          databaseUrl: true,
          strict: true,
          rateLimitSecret: true,
          encryptionKey: true,
          monitorToken: true,
        },
        database: {
          connected: true,
          tables: { requests: false, rateCharges: true, circuitBreakers: true },
        },
        crypto: { roundTrip: true },
        deploymentSha: SHA,
      }),
  });
  assert.equal(report.ok, false);
  assert.equal(report.health.failure, "health_contract");
});

test("control-plane-only deployment check does not consume a model route", async () => {
  const calls = [];
  const report = await verifyArchiveAiDeployment({
    baseUrl: "https://archive.example",
    expectedSha: SHA,
    monitorToken: TOKEN,
    controlPlaneOnly: true,
    runMaintenance: true,
    fetchImpl: async (input) => {
      calls.push(new URL(input).pathname);
      if (calls.length === 1) {
        return json({
          healthy: true,
          configured: {
            openaiKey: true,
            databaseUrl: true,
            strict: true,
            rateLimitSecret: true,
            encryptionKey: true,
            monitorToken: true,
          },
          database: {
            connected: true,
            tables: { requests: true, rateCharges: true, circuitBreakers: true },
          },
          crypto: { roundTrip: true },
          deploymentSha: SHA,
        });
      }
      return json({
        cleaned: 0,
        recovery: { examined: 0, pending: 0, succeeded: 0, local: 0, failed: 0, errors: 0 },
        deploymentSha: SHA,
      });
    },
  });
  assert.equal(report.ok, true);
  assert.deepEqual(calls, [
    "/api/internal/archive-ai-health",
    "/api/internal/archive-ai-maintenance",
  ]);
  assert.deepEqual(report.results, []);
});

test("deployment CLI requires an explicit base URL and expected SHA", async () => {
  await assert.rejects(
    runArchiveAiDeploymentCheck({ args: [], environment: {}, log() {}, error() {} }),
    /base-url/u,
  );
  await assert.rejects(
    runArchiveAiDeploymentCheck({
      args: ["--base-url", "https://archive.example"],
      environment: {},
      log() {},
      error() {},
    }),
    /expected-sha/u,
  );
});

test("main deployment records and restores the exact previous URL and SHA", () => {
  const jobPreamble = deploymentWorkflow.slice(0, deploymentWorkflow.indexOf("    steps:"));
  const candidateProbe = deploymentWorkflow.slice(
    deploymentWorkflow.indexOf("- name: Attest every selectable model route on candidate"),
    deploymentWorkflow.indexOf("- name: Promote attested candidate"),
  );
  const promote = deploymentWorkflow.slice(
    deploymentWorkflow.indexOf("- name: Promote attested candidate"),
    deploymentWorkflow.indexOf("- name: Verify Production after promotion"),
  );
  const rollback = deploymentWorkflow.slice(
    deploymentWorkflow.indexOf("- name: Roll back ambiguous or failed promotion"),
    deploymentWorkflow.indexOf("- name: Fail release after rollback"),
  );
  assert.match(deploymentWorkflow, /branches: \[main\]/u);
  assert.match(deploymentWorkflow, /fetch-depth: 0/u);
  assert.doesNotMatch(jobPreamble, /\$\{\{ secrets\./u);
  assert.match(
    deploymentWorkflow,
    /npm install --global "vercel@\$VERCEL_CLI_VERSION" --ignore-scripts/u,
  );
  assert.doesNotMatch(deploymentWorkflow, /npx --yes/u);
  assert.match(deploymentWorkflow, /npm run lint/u);
  assert.match(deploymentWorkflow, /id: previous/u);
  assert.match(
    deploymentWorkflow,
    /Verify previous Production commit belongs to main history[\s\S]*?git cat-file -e "\$previous_sha\^\{commit\}"[\s\S]*?git merge-base --is-ancestor "\$previous_sha" "\$GITHUB_SHA"/u,
  );
  assert.match(
    deploymentWorkflow,
    /Choose verification depth across the complete release diff[\s\S]*?git diff --name-only "\$previous_sha" "\$GITHUB_SHA"/u,
  );
  assert.doesNotMatch(deploymentWorkflow, /git diff --name-only HEAD\^ HEAD/u);
  assert.match(deploymentWorkflow, /githubCommitSha/u);
  assert.match(deploymentWorkflow, /projectId: process\.env\.VERCEL_PROJECT_ID/u);
  assert.match(deploymentWorkflow, /id: promote[\s\S]*?continue-on-error: true/u);
  assert.match(promote, /assertVercelProductionSnapshot/u);
  assert.match(promote, /expectedUrl,[\s\S]*?expectedSha,/u);
  assert.match(promote, /projectId: process\.env\.VERCEL_PROJECT_ID/u);
  assert.ok(
    promote.indexOf("assertVercelProductionSnapshot") < promote.indexOf('echo "attempted=true"'),
    "the stale snapshot fence must run before promotion is marked as attempted",
  );
  assert.ok(
    promote.indexOf('echo "attempted=true"') < promote.indexOf("vercel promote"),
    "promotion must start only after the snapshot fence succeeds",
  );
  assert.match(
    deploymentWorkflow,
    /id: previous_probe[\s\S]*?steps\.production_probe\.outputs\.verdict == 'alert_only'/u,
  );
  assert.match(
    deploymentWorkflow,
    /steps\.production_probe\.outputs\.verdict == 'rollback'[\s\S]*?steps\.previous_probe\.outputs\.verdict == 'pass'/u,
  );
  assert.doesNotMatch(candidateProbe, /--maintenance/u);
  assert.match(rollback, /resolveVercelProductionDeployment/u);
  assert.match(rollback, /candidateMatches[\s\S]*?previousMatches/u);
  assert.match(rollback, /third deployment; refusing rollback/u);
  assert.match(
    rollback,
    /if \[ "\$rollback_state" = "candidate" \][\s\S]*?rollback "\$previous_url"/u,
  );
  assert.match(rollback, /elif \[ "\$rollback_state" = "previous" \]/u);
  assert.match(rollback, /--phase all-routes[\s\S]*?--expected-sha "\$previous_sha"/u);
  assert.match(deploymentWorkflow, /steps\.promote\.outputs\.attempted == 'true'/u);
  assert.match(
    deploymentWorkflow,
    /Fail release after rollback[\s\S]*?if: always\(\) && \(steps\.promote\.outcome != 'success' \|\| \(steps\.promote\.outputs\.attempted == 'true'/u,
  );
  assert.doesNotMatch(deploymentWorkflow, /rollback\s+--timeout/u);
  assert.doesNotMatch(deploymentWorkflow, /inspect[^\n]+--json/u);
});

test("synthetic monitor requires explicit production identity and authenticated maintenance", () => {
  const workflowPreamble = monitorWorkflow.slice(0, monitorWorkflow.indexOf("jobs:"));
  const rollback = monitorWorkflow.slice(
    monitorWorkflow.indexOf("- name: Roll back only a deployment-attributable Production failure"),
    monitorWorkflow.indexOf("- name: Fail the workflow to trigger incident email notification"),
  );
  assert.match(monitorWorkflow, /cron: "\*\/5 \* \* \* \*"/u);
  assert.match(monitorWorkflow, /cron: "47 \*\/6 \* \* \*"/u);
  assert.match(monitorWorkflow, /ARCHIVE_AI_BASE_URL: \$\{\{ vars\.PUBLIC_BASE_URL \}\}/u);
  assert.doesNotMatch(workflowPreamble, /\$\{\{ secrets\./u);
  assert.match(
    monitorWorkflow,
    /npm install --global "vercel@\$VERCEL_CLI_VERSION" --ignore-scripts/u,
  );
  assert.doesNotMatch(monitorWorkflow, /npx --yes/u);
  assert.match(
    monitorWorkflow,
    /ARCHIVE_MONITOR_TOKEN: \$\{\{ secrets\.ARCHIVE_MONITOR_TOKEN \}\}/u,
  );
  assert.match(monitorWorkflow, /VERCEL_TOKEN: \$\{\{ secrets\.VERCEL_TOKEN \}\}/u);
  assert.match(monitorWorkflow, /VERCEL_ORG_ID: \$\{\{ secrets\.VERCEL_ORG_ID \}\}/u);
  assert.match(monitorWorkflow, /VERCEL_PROJECT_ID: \$\{\{ secrets\.VERCEL_PROJECT_ID \}\}/u);
  assert.match(monitorWorkflow, /resolveVercelProductionDeployment/u);
  assert.match(monitorWorkflow, /projectId: process\.env\.VERCEL_PROJECT_ID/u);
  assert.match(monitorWorkflow, /git merge-base --is-ancestor "\$production_sha" "\$GITHUB_SHA"/u);
  assert.match(monitorWorkflow, /if \[ "\$production_sha" = "\$GITHUB_SHA" \]/u);
  assert.match(monitorWorkflow, /echo "durable=true" >> "\$GITHUB_OUTPUT"/u);
  assert.match(monitorWorkflow, /node scripts\/archive-ai-maintenance-v1\.mjs/u);
  assert.match(monitorWorkflow, /id: ancestor_control[\s\S]*?--control-plane-only/u);
  assert.match(monitorWorkflow, /id: ancestor_routes[\s\S]*?--phase all-routes/u);
  assert.match(monitorWorkflow, /steps\.identity\.outputs\.current == 'true'/u);
  assert.match(
    monitorWorkflow,
    /--phase control-plane[\s\S]*?--expected-sha "\$\{\{ steps\.production\.outputs\.sha \}\}"/u,
  );
  assert.match(monitorWorkflow, /github\.event\.schedule == '47 \*\/6 \* \* \*'/u);
  assert.match(monitorWorkflow, /vercel rollback --timeout/u);
  assert.match(monitorWorkflow, /restored\.url === failedUrl \|\| restored\.sha === failedSha/u);
  assert.match(rollback, /--phase all-routes[\s\S]*?--expected-sha "\$restored_sha"/u);
  assert.match(monitorWorkflow, /Fail the workflow to trigger incident email notification/u);
});

test("deployment verifier rejects local fallback and reports a non-zero CLI result", async () => {
  const output = [];
  const errors = [];
  let call = 0;
  const exitCode = await runArchiveAiDeploymentCheck({
    args: [
      "--base-url",
      "https://archive.example",
      "--expected-sha",
      SHA,
      "--monitor-token",
      TOKEN,
    ],
    environment: {},
    fetchImpl: async (_input, init) => {
      if (new URL(_input).pathname === "/api/internal/archive-ai-health") {
        return json({
          healthy: true,
          configured: {
            openaiKey: true,
            databaseUrl: true,
            strict: true,
            rateLimitSecret: true,
            encryptionKey: true,
            monitorToken: true,
          },
          database: {
            connected: true,
            tables: { requests: true, rateCharges: true, circuitBreakers: true },
          },
          crypto: { roundTrip: true },
          deploymentSha: SHA,
        });
      }
      const deploymentCase = ARCHIVE_AI_DEPLOYMENT_CASES[call++];
      const body = JSON.parse(init.body);
      if (deploymentCase.id === "search-pro") {
        return json({
          requestId: body.requestId,
          state: "local",
          requestedModel: deploymentCase.expectedModel,
          result: {
            reply: "ローカル応答",
            source: "local",
            requestedModel: deploymentCase.expectedModel,
            modelVerified: false,
            delivery: { channel: "local", reason: "unconfigured" },
          },
        });
      }
      return json(onlineEnvelope(deploymentCase, body.requestId));
    },
    log: (line) => output.push(line),
    error: (line) => errors.push(line),
  });
  assert.equal(exitCode, 1);
  assert.ok(output.some((line) => line.includes("PASS Persona Normal")));
  assert.ok(errors.some((line) => line.includes("FAIL Search Pro")));
  assert.ok(errors.every((line) => !line.includes("ローカル応答")));
});

test("deployment verifier rejects SHA and provider-model mismatches", async () => {
  let call = 0;
  const shaReport = await verifyArchiveAiDeployment({
    baseUrl: "https://archive.example",
    expectedSha: SHA,
    monitorToken: TOKEN,
    probeControlPlane: false,
    fetchImpl: async (_input, init) => {
      const deploymentCase = ARCHIVE_AI_DEPLOYMENT_CASES[call++];
      const body = JSON.parse(init.body);
      return json(onlineEnvelope(deploymentCase, body.requestId), 200, "wrong-sha");
    },
  });
  assert.equal(shaReport.ok, false);
  assert.equal(shaReport.results[0].failure, "deployment_sha_mismatch");

  call = 0;
  const modelReport = await verifyArchiveAiDeployment({
    baseUrl: "https://archive.example",
    expectedSha: SHA,
    monitorToken: TOKEN,
    probeControlPlane: false,
    fetchImpl: async (_input, init) => {
      const deploymentCase = ARCHIVE_AI_DEPLOYMENT_CASES[call++];
      const body = JSON.parse(init.body);
      const envelope = onlineEnvelope(deploymentCase, body.requestId);
      envelope.providerModel = "gpt-5.6-sol";
      envelope.result.providerModel = "gpt-5.6-sol";
      return json(envelope);
    },
  });
  assert.equal(modelReport.ok, false);
  assert.equal(modelReport.results[0].failure, "deployment_contract");

  call = 0;
  const requestIdReport = await verifyArchiveAiDeployment({
    baseUrl: "https://archive.example",
    expectedSha: SHA,
    monitorToken: TOKEN,
    probeControlPlane: false,
    fetchImpl: async (_input, init) => {
      const deploymentCase = ARCHIVE_AI_DEPLOYMENT_CASES[call++];
      const body = JSON.parse(init.body);
      const envelope = onlineEnvelope(deploymentCase, body.requestId);
      envelope.requestId = crypto.randomUUID();
      return json(envelope);
    },
  });
  assert.equal(requestIdReport.ok, false);
  assert.equal(requestIdReport.results[0].failure, "deployment_contract");
});
