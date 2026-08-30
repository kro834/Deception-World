import { advanceArchiveAiRequest } from "./archive-ai-job.server.ts";
import { logArchiveAiEvent } from "./archive-ai-observability.server.ts";
import type { ArchiveAiRequestState } from "./archive-ai-request.ts";
import { getSql } from "./db.ts";

const RECOVERY_BATCH_SIZE = 24;

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
};

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

  logArchiveAiEvent("maintenance_recovery_batch", summary);
  return summary;
}
