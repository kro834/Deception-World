import {
  archivePayloadHash,
  archivePayloadHashes,
  decryptArchiveValue,
  encryptArchiveValue,
} from "./archive-ai-crypto.server.ts";
import type { ArchiveAiRequestState } from "./archive-ai-request.ts";
import {
  chargeArchiveAiAccessInTransaction,
  type ArchiveAiAccess,
  type ArchiveAiCostClass,
} from "./archive-ai-rate-limit.server.ts";
import type { ArchiveDeliveryReason } from "./archive-delivery.ts";
import { getSql } from "./db.ts";

export type ArchiveAiSurface = "search" | "persona";
export type ArchiveAiStoredState =
  "queued" | "running" | "unknown" | "succeeded" | "local" | "failed" | "expired" | "cancelled";

export type ArchiveAiRequestRow = {
  request_id: string;
  session_hash: string;
  surface: ArchiveAiSurface;
  client_version: string;
  payload_hash: string;
  requested_model: string;
  provider_model: string | null;
  state: ArchiveAiStoredState;
  encrypted_request: string | null;
  processing_context: Record<string, unknown>;
  encrypted_result: string | null;
  provider_response_id: string | null;
  openai_request_id: string | null;
  delivery_reason: ArchiveDeliveryReason | null;
  retryable: boolean;
  attempt_count: number;
  lease_generation: number;
  created_at_text: string;
  expires_at_text: string;
};

export class ArchiveAiRequestConflictError extends Error {
  constructor() {
    super("request_id_conflict");
    this.name = "ArchiveAiRequestConflictError";
  }
}

export class ArchiveAiRequestNotFoundError extends Error {
  constructor() {
    super("archive_ai_request_not_found");
    this.name = "ArchiveAiRequestNotFoundError";
  }
}

const REQUEST_TTL_MS = 24 * 60 * 60 * 1_000;
// Provider create/retrieve calls use a 25s/20s deadline. Keep the database
// lease comfortably beyond that boundary so another request cannot enter while
// the first worker is still unwinding its provider call.
const LEASE_MS = 45_000;

const SELECT_REQUEST = `SELECT
  request_id::text,
  session_hash,
  surface,
  client_version,
  payload_hash,
  requested_model,
  provider_model,
  state,
  encrypted_request,
  processing_context,
  encrypted_result,
  provider_response_id,
  openai_request_id,
  delivery_reason,
  retryable,
  attempt_count,
  lease_generation,
  created_at::text AS created_at_text,
  expires_at::text AS expires_at_text
FROM archive_ai_requests`;

const EXPIRE_REQUEST_SET = `SET state = 'expired', encrypted_request = NULL, encrypted_result = NULL,
    processing_context = '{}'::jsonb, provider_model = NULL,
    provider_response_id = NULL, openai_request_id = NULL,
    provider_request_ids = '[]'::jsonb, delivery_reason = 'request_expired',
    retryable = FALSE, lease_expires_at = NULL, next_poll_at = NULL,
    completed_at = COALESCE(completed_at, NOW()),
    expires_at = NOW() + INTERVAL '1 hour', updated_at = NOW()`;

const EXPIRE_REQUEST = `UPDATE archive_ai_requests
${EXPIRE_REQUEST_SET}
WHERE request_id = $1::uuid AND session_hash = $2
  AND state <> 'expired' AND expires_at <= NOW()`;

function verifyOwnership(
  row: ArchiveAiRequestRow | undefined,
  sessionHash: string | readonly string[],
) {
  const candidates = typeof sessionHash === "string" ? [sessionHash] : sessionHash;
  if (!row || !candidates.includes(row.session_hash)) throw new ArchiveAiRequestNotFoundError();
  return row;
}

export async function getArchiveAiRequest(
  requestId: string,
  sessionHash: string | readonly string[],
): Promise<ArchiveAiRequestRow> {
  const sql = await getSql();
  let rows = await sql.query<ArchiveAiRequestRow>(
    `${SELECT_REQUEST} WHERE request_id = $1::uuid LIMIT 1`,
    [requestId],
  );
  let row = verifyOwnership(rows[0], sessionHash);
  if (row.state !== "expired" && new Date(row.expires_at_text).getTime() <= Date.now()) {
    await sql.query(EXPIRE_REQUEST, [requestId, row.session_hash]);
    rows = await sql.query<ArchiveAiRequestRow>(
      `${SELECT_REQUEST} WHERE request_id = $1::uuid LIMIT 1`,
      [requestId],
    );
    row = verifyOwnership(rows[0], sessionHash);
  }
  return row;
}

export async function admitArchiveAiRequest({
  request,
  requestId,
  sessionHash,
  sessionHashes,
  surface,
  clientVersion,
  payload,
  processingContext,
  requestedModel,
  costClass,
  rateLimitHash,
}: {
  request: Request;
  requestId: string;
  sessionHash: string;
  sessionHashes?: readonly string[];
  surface: ArchiveAiSurface;
  clientVersion: string;
  payload: unknown;
  processingContext: Record<string, unknown>;
  requestedModel: string;
  costClass: ArchiveAiCostClass;
  rateLimitHash?: string;
}): Promise<{ row: ArchiveAiRequestRow; created: boolean; access?: ArchiveAiAccess }> {
  const sql = await getSql();
  const hashInput = { surface, requestedModel, payload };
  const payloadHash = archivePayloadHash(hashInput);
  const payloadHashes = archivePayloadHashes(hashInput);
  const ownershipHashes = sessionHashes?.length ? sessionHashes : [sessionHash];
  const encryptedRequest = encryptArchiveValue(payload, {
    requestId,
    sessionHash,
    purpose: "request",
  });
  const expiresAt = new Date(Date.now() + REQUEST_TTL_MS).toISOString();
  return sql.transaction(async (transaction) => {
    const inserted = await transaction.query<{ request_id: string }>(
      `INSERT INTO archive_ai_requests (
         request_id, session_hash, surface, client_version, payload_hash,
         requested_model, state, encrypted_request, processing_context, expires_at
       ) VALUES ($1::uuid, $2, $3, $4, $5, $6, 'queued', $7, $8::jsonb, $9::timestamptz)
       ON CONFLICT (request_id) DO NOTHING
       RETURNING request_id::text`,
      [
        requestId,
        sessionHash,
        surface,
        clientVersion,
        payloadHash,
        requestedModel,
        encryptedRequest,
        JSON.stringify(processingContext),
        expiresAt,
      ],
    );
    let rows = await transaction.query<ArchiveAiRequestRow>(
      `${SELECT_REQUEST} WHERE request_id = $1::uuid LIMIT 1 FOR UPDATE`,
      [requestId],
    );
    let row = verifyOwnership(rows[0], ownershipHashes);
    if (row.state !== "expired" && new Date(row.expires_at_text).getTime() <= Date.now()) {
      await transaction.query(EXPIRE_REQUEST, [requestId, row.session_hash]);
      rows = await transaction.query<ArchiveAiRequestRow>(
        `${SELECT_REQUEST} WHERE request_id = $1::uuid LIMIT 1 FOR UPDATE`,
        [requestId],
      );
      row = verifyOwnership(rows[0], ownershipHashes);
    }
    if (
      row.surface !== surface ||
      !payloadHashes.includes(row.payload_hash) ||
      row.requested_model !== requestedModel
    ) {
      throw new ArchiveAiRequestConflictError();
    }

    // This is deliberately inside the same transaction as the ledger INSERT.
    // Existing requestIds resolve through archive_ai_rate_charges and therefore
    // cannot consume the three user buckets for a second time.
    const access = await chargeArchiveAiAccessInTransaction(
      transaction,
      request,
      costClass,
      requestId,
      rateLimitHash ?? row.session_hash,
    );
    return { row, created: Boolean(inserted.length), access };
  });
}

export function decryptArchiveAiRequestPayload<T>(row: ArchiveAiRequestRow): T {
  if (!row.encrypted_request) throw new Error("archive_request_payload_unavailable");
  return decryptArchiveValue<T>(row.encrypted_request, {
    requestId: row.request_id,
    sessionHash: row.session_hash,
    purpose: "request",
  });
}

export async function claimArchiveAiRequest(
  requestId: string,
  sessionHash: string,
): Promise<ArchiveAiRequestRow | null> {
  const sql = await getSql();
  const updated = await sql.query<ArchiveAiRequestRow>(
    `UPDATE archive_ai_requests
     SET lease_expires_at = NOW() + ($3::text || ' milliseconds')::interval,
         lease_generation = lease_generation + 1,
         updated_at = NOW()
     WHERE request_id = $1::uuid
       AND session_hash = $2
       AND state IN ('queued', 'running', 'unknown')
       AND (lease_expires_at IS NULL OR lease_expires_at <= NOW())
       AND (next_poll_at IS NULL OR next_poll_at <= NOW())
       AND expires_at > NOW()
     RETURNING request_id::text, session_hash, surface, client_version, payload_hash,
       requested_model, provider_model, state, encrypted_request, processing_context, encrypted_result,
       provider_response_id, openai_request_id, delivery_reason, retryable,
       attempt_count, lease_generation, created_at::text AS created_at_text,
       expires_at::text AS expires_at_text`,
    [requestId, sessionHash, LEASE_MS],
  );
  return updated[0] ?? null;
}

export async function recordArchiveAiProviderStarted({
  requestId,
  sessionHash,
  providerModel,
  providerResponseId,
  openaiRequestId,
  status,
  leaseGeneration,
}: {
  requestId: string;
  sessionHash: string;
  providerModel: string;
  providerResponseId: string;
  openaiRequestId?: string;
  status: "queued" | "in_progress" | "completed" | "failed" | "cancelled" | "incomplete";
  leaseGeneration: number;
}): Promise<boolean> {
  void status;
  const sql = await getSql();
  const rows = await sql.query<{ request_id: string }>(
    `UPDATE archive_ai_requests
     SET provider_model = $3,
         provider_response_id = $4,
         openai_request_id = COALESCE($5, openai_request_id),
         provider_request_ids = CASE
           WHEN $5::text IS NULL THEN provider_request_ids
           ELSE provider_request_ids || jsonb_build_array($5::text)
         END,
         state = 'running',
         encrypted_request = NULL,
         lease_expires_at = NULL,
         next_poll_at = NOW() + INTERVAL '900 milliseconds',
         updated_at = NOW()
     WHERE request_id = $1::uuid AND session_hash = $2
       AND state IN ('queued', 'running', 'unknown')
       AND provider_response_id IS NULL
       AND attempt_count BETWEEN 1 AND 2
       AND lease_generation = $6
       AND expires_at > NOW()
     RETURNING request_id::text`,
    [
      requestId,
      sessionHash,
      providerModel,
      providerResponseId,
      openaiRequestId ?? null,
      leaseGeneration,
    ],
  );
  return rows.length > 0;
}

export async function beginArchiveAiProviderCreateAttempt(
  requestId: string,
  sessionHash: string,
  leaseGeneration: number,
): Promise<number | null> {
  const sql = await getSql();
  // A create is normally sent once. If and only if the first result was
  // explicitly marked ambiguous, the same logical request may make one final
  // recovery create after its five-second quiet period.
  const rows = await sql.query<{ attempt_count: number }>(
    `UPDATE archive_ai_requests
     SET state = 'unknown', attempt_count = attempt_count + 1,
         next_poll_at = NULL, updated_at = NOW()
     WHERE request_id = $1::uuid AND session_hash = $2
       AND provider_response_id IS NULL
       AND state IN ('queued', 'running', 'unknown')
       AND (
         attempt_count = 0
         OR (attempt_count = 1 AND state = 'unknown' AND next_poll_at <= NOW())
       )
       AND attempt_count < 2
       AND lease_generation = $3
       AND lease_expires_at > NOW()
     RETURNING attempt_count`,
    [requestId, sessionHash, leaseGeneration],
  );
  return rows[0]?.attempt_count ?? null;
}

export async function deferArchiveAiProviderCreateRetry({
  requestId,
  sessionHash,
  leaseGeneration,
}: {
  requestId: string;
  sessionHash: string;
  leaseGeneration: number;
}): Promise<boolean> {
  const sql = await getSql();
  const rows = await sql.query<{ request_id: string }>(
    `UPDATE archive_ai_requests
     SET state = 'unknown', lease_expires_at = NULL,
         next_poll_at = NOW() + INTERVAL '5 seconds', updated_at = NOW()
     WHERE request_id = $1::uuid AND session_hash = $2
       AND state = 'unknown'
       AND provider_response_id IS NULL
       AND attempt_count = 1
       AND lease_generation = $3
       AND expires_at > NOW()
     RETURNING request_id::text`,
    [requestId, sessionHash, leaseGeneration],
  );
  return rows.length > 0;
}

export async function recordArchiveAiProviderProgress({
  requestId,
  sessionHash,
  providerModel,
  openaiRequestId,
  delayMs,
  leaseGeneration,
}: {
  requestId: string;
  sessionHash: string;
  providerModel: string;
  openaiRequestId?: string;
  delayMs: number;
  leaseGeneration: number;
}): Promise<boolean> {
  const sql = await getSql();
  const rows = await sql.query<{ request_id: string }>(
    `UPDATE archive_ai_requests
     SET provider_model = $3,
         openai_request_id = COALESCE($4, openai_request_id),
         provider_request_ids = CASE
           WHEN $4::text IS NULL THEN provider_request_ids
           ELSE provider_request_ids || jsonb_build_array($4::text)
         END,
         state = 'running',
         lease_expires_at = NULL,
         next_poll_at = NOW() + ($5::text || ' milliseconds')::interval,
         updated_at = NOW()
     WHERE request_id = $1::uuid AND session_hash = $2
       AND state IN ('running', 'unknown')
       AND provider_response_id IS NOT NULL
       AND lease_generation = $6
       AND expires_at > NOW()
     RETURNING request_id::text`,
    [
      requestId,
      sessionHash,
      providerModel,
      openaiRequestId ?? null,
      Math.max(500, delayMs),
      leaseGeneration,
    ],
  );
  return rows.length > 0;
}

export async function completeArchiveAiRequest<T>({
  requestId,
  sessionHash,
  result,
  channel,
  reason,
  providerModel,
  providerResponseId,
  openaiRequestId,
  leaseGeneration,
}: {
  requestId: string;
  sessionHash: string;
  result: T;
  channel: "online" | "local";
  reason: ArchiveDeliveryReason;
  providerModel?: string;
  providerResponseId?: string;
  openaiRequestId?: string;
  leaseGeneration: number;
}): Promise<boolean> {
  const sql = await getSql();
  const rows = await sql.query<{ request_id: string }>(
    `UPDATE archive_ai_requests
     SET state = $3,
         encrypted_result = $4,
         encrypted_request = NULL,
         delivery_reason = $5,
         provider_model = COALESCE($6, provider_model),
         provider_response_id = COALESCE($7, provider_response_id),
         openai_request_id = COALESCE($8, openai_request_id),
         retryable = FALSE,
         lease_expires_at = NULL,
         next_poll_at = NULL,
         completed_at = NOW(),
         expires_at = NOW() + INTERVAL '24 hours',
         updated_at = NOW()
     WHERE request_id = $1::uuid AND session_hash = $2
       AND state IN ('queued', 'running', 'unknown')
       AND lease_generation = $9
       AND expires_at > NOW()
     RETURNING request_id::text`,
    [
      requestId,
      sessionHash,
      channel === "online" ? "succeeded" : "local",
      encryptArchiveValue(result, { requestId, sessionHash, purpose: "result" }),
      reason,
      providerModel ?? null,
      providerResponseId ?? null,
      openaiRequestId ?? null,
      leaseGeneration,
    ],
  );
  return rows.length > 0;
}

export async function failArchiveAiRequest({
  requestId,
  sessionHash,
  reason,
  retryable,
  leaseGeneration,
}: {
  requestId: string;
  sessionHash: string;
  reason: ArchiveDeliveryReason;
  retryable: boolean;
  leaseGeneration: number;
}): Promise<boolean> {
  const sql = await getSql();
  const rows = await sql.query<{ request_id: string }>(
    `UPDATE archive_ai_requests
     SET state = 'failed', delivery_reason = $3, retryable = $4,
         encrypted_request = NULL, lease_expires_at = NULL, next_poll_at = NULL,
         completed_at = NOW(), updated_at = NOW()
     WHERE request_id = $1::uuid AND session_hash = $2
       AND state IN ('queued', 'running', 'unknown')
       AND lease_generation = $5
       AND expires_at > NOW()
     RETURNING request_id::text`,
    [requestId, sessionHash, reason, retryable, leaseGeneration],
  );
  return rows.length > 0;
}

export async function cancelArchiveAiRequest(
  requestId: string,
  sessionHash: string,
): Promise<void> {
  const sql = await getSql();
  await sql.query(
    `UPDATE archive_ai_requests
     SET state = 'cancelled', delivery_reason = 'request_cancelled', retryable = FALSE,
         encrypted_request = NULL, lease_expires_at = NULL, next_poll_at = NULL,
         completed_at = NOW(), updated_at = NOW()
     WHERE request_id = $1::uuid AND session_hash = $2
       AND state IN ('queued', 'running', 'unknown')`,
    [requestId, sessionHash],
  );
}

export function archiveAiRequestState<T>(row: ArchiveAiRequestRow): ArchiveAiRequestState<T> {
  if (new Date(row.expires_at_text).getTime() <= Date.now() && row.state !== "expired") {
    return {
      requestId: row.request_id,
      state: "expired",
      reason: "request_expired",
      retryable: false,
    };
  }
  if (row.state === "queued" || row.state === "running" || row.state === "unknown") {
    return {
      requestId: row.request_id,
      state: row.state,
      retryAfterMs: row.state === "queued" ? 250 : 300,
      requestedModel: row.requested_model,
      expiresAt: row.expires_at_text,
    };
  }
  if (row.state === "succeeded" || row.state === "local") {
    if (!row.encrypted_result) throw new Error("archive_result_unavailable");
    return {
      requestId: row.request_id,
      state: row.state,
      requestedModel: row.requested_model,
      providerModel: row.provider_model ?? undefined,
      providerResponseId: row.provider_response_id ?? undefined,
      openaiRequestId: row.openai_request_id ?? undefined,
      result: decryptArchiveValue<T>(row.encrypted_result, {
        requestId: row.request_id,
        sessionHash: row.session_hash,
        purpose: "result",
      }),
    };
  }
  return {
    requestId: row.request_id,
    state: row.state,
    reason:
      row.state === "expired"
        ? "request_expired"
        : row.state === "cancelled"
          ? "request_cancelled"
          : (row.delivery_reason ?? "provider_unavailable"),
    retryable: row.retryable,
  };
}

export async function cleanupArchiveAiRequests(): Promise<number> {
  const sql = await getSql();
  return sql.transaction(async (transaction) => {
    const deleted = await transaction.query<{ request_id: string }>(
      `DELETE FROM archive_ai_requests
       WHERE state = 'expired' AND expires_at <= NOW()
       RETURNING request_id::text`,
    );
    const expired = await transaction.query<{ request_id: string }>(
      `UPDATE archive_ai_requests
       ${EXPIRE_REQUEST_SET}
       WHERE state <> 'expired' AND expires_at <= NOW()
       RETURNING request_id::text`,
    );
    return deleted.length + expired.length;
  });
}
