import assert from "node:assert/strict";
import { readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  runArchiveAiMaintenanceCli,
  runArchiveAiMaintenanceV1,
} from "./archive-ai-maintenance-v1.mjs";

const SHA = "0123456789abcdef0123456789abcdef01234567";
const TOKEN = "maintenance-monitor-token".repeat(2);

function maintenanceResponse({ contractVersion = 1, sha = SHA, errors = 0, status = 200 } = {}) {
  const payload = {
    ...(contractVersion === null ? {} : { contractVersion }),
    cleaned: 2,
    recovery: {
      examined: 3 + errors,
      pending: 1,
      succeeded: 1,
      local: 0,
      failed: 1,
      errors,
    },
    deploymentSha: sha,
  };
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json",
      "x-archive-deployment-sha": sha,
    },
  });
}

test("maintenance v1 accepts explicit v1 and the exact legacy durable-ledger shape", async () => {
  for (const contractVersion of [1, null]) {
    let request;
    const result = await runArchiveAiMaintenanceV1({
      baseUrl: "https://archive.example",
      expectedSha: SHA,
      monitorToken: TOKEN,
      bypassToken: "preview-bypass",
      fetchImpl: async (_input, init) => {
        request = init;
        return maintenanceResponse({ contractVersion });
      },
    });
    assert.equal(result.ok, true);
    assert.equal(request.method, "POST");
    assert.equal(request.headers["x-archive-maintenance-contract"], "1");
    assert.equal(request.headers["x-vercel-protection-bypass"], "preview-bypass");
  }
});

test("maintenance v1 fails closed on another deployment or future incompatible contract", async () => {
  const otherSha = "fedcba9876543210fedcba9876543210fedcba98";
  const mismatch = await runArchiveAiMaintenanceV1({
    baseUrl: "https://archive.example",
    expectedSha: SHA,
    monitorToken: TOKEN,
    fetchImpl: async () => maintenanceResponse({ sha: otherSha }),
  });
  assert.equal(mismatch.reason, "deployment_sha_mismatch");

  const future = await runArchiveAiMaintenanceV1({
    baseUrl: "https://archive.example",
    expectedSha: SHA,
    monitorToken: TOKEN,
    fetchImpl: async () => maintenanceResponse({ contractVersion: 2 }),
  });
  assert.equal(future.reason, "unsupported_contract_version");
});

test("maintenance recovery errors alert but can never request rollback", async () => {
  const outputPath = join(tmpdir(), `archive-maintenance-${crypto.randomUUID()}.txt`);
  writeFileSync(outputPath, "");
  try {
    const exitCode = await runArchiveAiMaintenanceCli({
      args: [
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
      run: async () => ({ ok: false, reason: "recovery_errors", status: 503 }),
      log: () => {},
    });
    assert.equal(exitCode, 1);
    const output = readFileSync(outputPath, "utf8");
    assert.equal(output, "verdict=alert_only\nreason=recovery_errors\n");
    assert.doesNotMatch(output, /rollback/u);
  } finally {
    unlinkSync(outputPath);
  }
});
