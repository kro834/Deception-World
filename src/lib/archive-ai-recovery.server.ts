import { advanceArchiveAiRequest } from "./archive-ai-job.server.ts";
import { logArchiveAiEvent } from "./archive-ai-observability.server.ts";
import type { ArchiveAiRequestState } from "./archive-ai-request.ts";
import { getSql } from "./db.ts";

const RECOVERY_BATCH_SIZE = 24;
// A provider background response is retained only briefly. A request that has
// not reached a terminal ledger state within this window needs an operator
// alert before its exact provider response can disappear.
export const ARCHIVE_AI_STALE_PENDING_MS = 8 * 60 * 1_000;

type RecoverableArchiveAiRequest = {
  request_id: string;
  session_hash: string;
};

export type ArchiveAiRecoverySummary = {
  examined: number;
  pending: number;
  succeeded: number;
  local: number;
  failed: number;
  errors: number;
  stalePending: number;
  oldestPendingAgeMs: number | null;
};

type ArchiveAiPendingHealthRow = {
  stale_pending: number | string;
  oldest_created_at_text: string | null;
};

async function readArchiveAiPendingHealth(): Promise<
  Pick<ArchiveAiRecoverySummary, "stalePending" | "oldestPendingAgeMs">
> {
  const sql = await getSql();
  const rows = await sql.query<ArchiveAiPendingHealthRow>(
    `SELECT
       COUNT(*) FILTER (
         WHERE created_at <= NOW() - ($1::text || ' milliseconds')::interval
       )::integer AS stale_pending,
       MIN(created_at)::text AS oldest_created_at_text
     FROM archive_ai_requests
     WHERE state IN ('queued', 'running', 'unknown')
       AND expires_at > NOW()`,
    [ARCHIVE_AI_STALE_PENDING_MS],
  );
  const row = rows[0];
  const oldestCreatedAt = row?.oldest_created_at_text
    ? Date.parse(row.oldest_created_at_text)
    : Number.NaN;
  return {
    stalePending: Math.max(0, Number(row?.stale_pending ?? 0) || 0),
    oldestPendingAgeMs: Number.isFinite(oldestCreatedAt)
      ? Math.max(0, Date.now() - oldestCreatedAt)
      : null,
  };
}

/**
 * Select only opaque routing identifiers for pending work. The encrypted
 * request and result columns deliberately never leave the ledger here.
 * `advanceArchiveAiRequest` performs the authoritative atomic lease claim, so
 * overlapping maintenance invocations can safely observe the same candidate
 * without running two provider workers.
 */
async function listRecoverableArchiveAiRequests(
  limit = RECOVERY_BATCH_SIZE,
): Promise<RecoverableArchiveAiRequest[]> {
  const sql = await getSql();
  return sql.query<RecoverableArchiveAiRequest>(
    `SELECT request_id::text, session_hash
     FROM archive_ai_requests
     WHERE state IN ('queued', 'running', 'unknown')
       AND expires_at > NOW()
       AND (lease_expires_at IS NULL OR lease_expires_at <= NOW())
       AND (next_poll_at IS NULL OR next_poll_at <= NOW())
     ORDER BY updated_at ASC, created_at ASC
     LIMIT $1::integer`,
    [Math.max(1, Math.min(RECOVERY_BATCH_SIZE, Math.trunc(limit)))],
  );
}

function recordState(
  summary: ArchiveAiRecoverySummary,
  state: ArchiveAiRequestState<unknown>,
): void {
  if (state.state === "queued" || state.state === "running" || state.state === "unknown") {
    summary.pending += 1;
  } else if (state.state === "succeeded") {
    summary.succeeded += 1;
  } else if (state.state === "local") {
    summary.local += 1;
  } else {
    summary.failed += 1;
  }
}

/**
 * Revisit a bounded batch of unexpired requests after the original Function or
 * browser connection is gone. Rows with a provider response identity are
 * retrieved through that exact identity by `advanceArchiveAiRequest`. Rows
 * whose create outcome is unknown remain governed by the ledger's existing
 * attempt_count < 2 fence; this sweep does not introduce another create path.
 */
export async function recoverArchiveAiPendingRequests(
  request: Request,
): Promise<ArchiveAiRecoverySummary> {
  const candidates = await listRecoverableArchiveAiRequests();
  const summary: ArchiveAiRecoverySummary = {
    examined: candidates.length,
    pending: 0,
    succeeded: 0,
    local: 0,
    failed: 0,
    errors: 0,
    stalePending: 0,
    oldestPendingAgeMs: null,
  };

  await Promise.all(
    candidates.map(async (candidate) => {
      try {
        const state = await advanceArchiveAiRequest(
          request,
          candidate.request_id,
          candidate.session_hash,
        );
        recordState(summary, state);
      } catch (error) {
        summary.errors += 1;
        logArchiveAiEvent("maintenance_recovery_error", {
          requestId: candidate.request_id,
          reason: error instanceof Error ? error.name : "unknown",
        });
      }
    }),
  );

  const pendingHealth = await readArchiveAiPendingHealth();
  summary.stalePending = pendingHealth.stalePending;
  summary.oldestPendingAgeMs = pendingHealth.oldestPendingAgeMs;

  logArchiveAiEvent("maintenance_recovery_batch", summary);
  return summary;
}
