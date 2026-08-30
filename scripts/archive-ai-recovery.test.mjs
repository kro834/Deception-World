import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { verifyArchiveAiControlPlane } from "./verify-archive-ai-deployment.mjs";

const SHA = "0123456789abcdef0123456789abcdef01234567";
const TOKEN = "recovery-monitor-token".repeat(2);
const recoverySource = readFileSync(
  new URL("../src/lib/archive-ai-recovery.server.ts", import.meta.url),
  "utf8",
);
const maintenanceSource = readFileSync(
  new URL("../src/routes/api/internal/archive-ai-maintenance.ts", import.meta.url),
  "utf8",
);
const ledgerSource = readFileSync(
  new URL("../src/lib/archive-ai-ledger.server.ts", import.meta.url),
  "utf8",
);
const jobSource = readFileSync(
  new URL("../src/lib/archive-ai-job.server.ts", import.meta.url),
  "utf8",
);
const monitorWorkflow = readFileSync(
  new URL("../.github/workflows/archive-ai-monitor.yml", import.meta.url),
  "utf8",
);

function response(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json", "x-archive-deployment-sha": SHA },
  });
}

function healthyControlPlane() {
  return {
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
  };
}

test("maintenance recovery selects only due unexpired opaque request identities", () => {
  const select = recoverySource.slice(
    recoverySource.indexOf("SELECT request_id::text"),
    recoverySource.indexOf("LIMIT $1::integer") + "LIMIT $1::integer".length,
  );
  assert.match(select, /SELECT request_id::text, session_hash/u);
  assert.match(select, /state IN \('queued', 'running', 'unknown'\)/u);
  assert.match(select, /expires_at > NOW\(\)/u);
  assert.match(select, /lease_expires_at IS NULL OR lease_expires_at <= NOW\(\)/u);
  assert.match(select, /next_poll_at IS NULL OR next_poll_at <= NOW\(\)/u);
  assert.match(select, /ORDER BY updated_at ASC, created_at ASC/u);
  assert.doesNotMatch(select, /encrypted_request|encrypted_result|processing_context/u);
  assert.match(recoverySource, /const RECOVERY_BATCH_SIZE = 24/u);
});

test("recovery delegates every provider action to the lease-fenced collector", () => {
  assert.match(recoverySource, /advanceArchiveAiRequest\(/u);
  assert.match(recoverySource, /await Promise\.all\(/u);
  assert.match(jobSource, /const row = await claimArchiveAiRequest\(requestId, sessionHash\)/u);
  assert.match(
    jobSource,
    /if \(row\.provider_response_id\)[\s\S]*?responseId: row\.provider_response_id/u,
  );
  assert.match(ledgerSource, /attempt_count < 2/u);
  assert.match(ledgerSource, /attempt_count = 1 AND state = 'unknown'/u);
  assert.doesNotMatch(
    recoverySource,
    /createOpenAiBackgroundResponse|retrieveOpenAiBackgroundResponse/u,
  );
});

test("signed maintenance runs recovery and the monitor revisits it every five minutes", () => {
  assert.match(maintenanceSource, /if \(!authorized\(request\)\).*404/u);
  assert.match(maintenanceSource, /recoverArchiveAiPendingRequests\(request\)/u);
  assert.match(maintenanceSource, /recovery\.errors > 0 \? 503 : 200/u);
  assert.match(monitorWorkflow, /cron: "\*\/5 \* \* \* \*"/u);
  assert.match(
    monitorWorkflow,
    /--phase control-plane[\s\S]*?--monitor-token "\$ARCHIVE_MONITOR_TOKEN"/u,
  );
});

test("control-plane verification fails closed on a partial recovery batch", async () => {
  let call = 0;
  const report = await verifyArchiveAiControlPlane({
    baseUrl: "https://archive.example",
    expectedSha: SHA,
    monitorToken: TOKEN,
    runMaintenance: true,
    fetchImpl: async () => {
      call += 1;
      if (call === 1) return response(healthyControlPlane());
      return response({
        cleaned: 0,
        recovery: { examined: 2, pending: 1, succeeded: 0, local: 0, failed: 0, errors: 1 },
        deploymentSha: SHA,
      });
    },
  });
  assert.equal(report.ok, false);
  assert.equal(report.maintenance.failure, "maintenance_contract");
});

test("recovery logging is metadata-only", () => {
  assert.match(recoverySource, /maintenance_recovery_error/u);
  assert.match(recoverySource, /maintenance_recovery_batch/u);
  assert.doesNotMatch(
    recoverySource,
    /logArchiveAiEvent\([^)]*(?:prompt|message|query|answer|reply|encrypted_request|encrypted_result)/isu,
  );
});
