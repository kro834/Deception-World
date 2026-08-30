import { waitUntil } from "@vercel/functions";
import {
  acquireArchiveAiCircuit,
  recordArchiveAiCircuitOutcome,
} from "./archive-ai-circuit.server.ts";
import { readArchiveRequestIdentity } from "./archive-ai-crypto.server.ts";
import {
  admitArchiveAiRequest,
  archiveAiRequestState,
  beginArchiveAiProviderCreateAttempt,
  claimArchiveAiRequest,
  completeArchiveAiRequest,
  decryptArchiveAiRequestPayload,
  deferArchiveAiProviderCreateRetry,
  failArchiveAiRequest,
  getArchiveAiRequest,
  recordArchiveAiProviderProgress,
  recordArchiveAiProviderStarted,
  type ArchiveAiRequestRow,
} from "./archive-ai-ledger.server.ts";
import { logArchiveAiEvent } from "./archive-ai-observability.server.ts";
import {
  checkArchiveAiAccess,
  type ArchiveAiAccess,
} from "./archive-ai-rate-limit.server.ts";
import type { ArchiveAiRequestState } from "./archive-ai-request.ts";
import type { ArchiveDeliveryReason } from "./archive-delivery.ts";
import {
  createArchiveIntelligenceOpenAiExecution,
  parseArchiveIntelligenceOpenAiPayload,
  archiveIntelligenceRequestSchema,
  type ArchiveIntelligenceProcessingContext,
  type ArchiveIntelligenceRequest,
} from "./archive-intelligence.server.ts";
import {
  archiveOpenAiCreateOutcomeUnknown,
  archiveOpenAiProviderIdentity,
  archiveOpenAiResponseIsMissing,
  archiveProviderFailureReason,
  cancelOpenAiBackgroundResponse,
  createOpenAiBackgroundResponse,
  isRetryableArchiveProviderError,
  retrieveOpenAiBackgroundResponse,
  type ArchiveOpenAiBackgroundResponse,
} from "./archive-openai-transport.server.ts";
import {
  createLocalArchiveReply,
  type ArchiveIntelligenceReply,
} from "./archive-roleplay-fallback.ts";
import {
  createArchiveSearchOpenAiExecution,
  parseArchiveSearchOpenAiPayload,
  archiveSearchRequestSchema,
  type ArchiveSearchProcessingContext,
  type ArchiveSearchRequest,
} from "./archive-search.server.ts";
import { canonicalizeArchiveSearchCandidates } from "./archive-search-catalog.server.ts";
import { createLocalArchiveSearchReply, type ArchiveSearchReply } from "./archive-search.ts";

export type ArchiveAiResult = ArchiveSearchReply | ArchiveIntelligenceReply;
export type ArchiveAiWireState = ArchiveAiRequestState<ArchiveAiResult>;

type SearchStoredPayload = Omit<ArchiveSearchRequest, "requestId">;
type PersonaStoredPayload = Omit<ArchiveIntelligenceRequest, "requestId">;
const BACKGROUND_POLL_STAGGER_MS = 350;

function requestMatchesBody(requestId: string, bodyRequestId: string | undefined): boolean {
  return Boolean(bodyRequestId && requestId === bodyRequestId.toLowerCase());
}

function localNotice(reason: ArchiveDeliveryReason, surface: "search" | "persona"): string {
  const noun = surface === "search" ? "ローカルサーチ" : "ローカル人格コア";
  if (reason === "unconfigured") return `AI接続が未設定のため、${noun}で応答しています。`;
  if (reason === "shared_state_unavailable") {
    return `共有状態を安全に確認できないため、${noun}で応答しています。`;
  }
  if (reason === "rate_limited" || reason === "provider_rate_limited") {
    return `AI回線が混み合っているため、${noun}で応答しています。`;
  }
  if (reason === "provider_model_mismatch") {
    return `指定モデルを実在照合できなかったため、${noun}で応答しています。`;
  }
  return `オンライン回答を確定できなかったため、${noun}で応答しています。`;
}

function localSearchResult(
  payload: SearchStoredPayload,
  requestId: string,
  requestedModel: string,
  reason: ArchiveDeliveryReason,
): ArchiveSearchReply {
  const candidates = canonicalizeArchiveSearchCandidates(payload.candidates);
  return {
    ...createLocalArchiveSearchReply({
      query: payload.query,
      candidates,
      notice: localNotice(reason, "search"),
      deliveryReason: reason,
    }),
    requestId,
    requestedModel,
    model: requestedModel,
    modelVerified: false,
  };
}

function localPersonaResult(
  payload: PersonaStoredPayload,
  requestId: string,
  requestedModel: string,
  reason: ArchiveDeliveryReason,
): ArchiveIntelligenceReply {
  const latestMessage = payload.messages.at(-1)?.content ?? "";
  return {
    ...createLocalArchiveReply({
      characterId: payload.characterId,
      mode: payload.mode,
      message: latestMessage,
      messages: payload.messages,
      notice: localNotice(reason, "persona"),
      deliveryReason: reason,
    }),
    requestId,
    requestedModel,
    model: requestedModel,
    modelVerified: false,
  };
}

function localResultFromPayload(
  row: ArchiveAiRequestRow,
  payload: unknown,
  reason: ArchiveDeliveryReason,
): ArchiveAiResult {
  if (row.surface === "search") {
    const parsed = archiveSearchRequestSchema.parse(payload);
    const { requestId: _requestId, ...stored } = parsed;
    return localSearchResult(stored, row.request_id, row.requested_model, reason);
  }
  const parsed = archiveIntelligenceRequestSchema.parse(payload);
  const { requestId: _requestId, ...stored } = parsed;
  return localPersonaResult(stored, row.request_id, row.requested_model, reason);
}

function parseCompletedResponse(
  row: ArchiveAiRequestRow,
  response: ArchiveOpenAiBackgroundResponse,
): ArchiveAiResult {
  const result =
    row.surface === "search"
      ? parseArchiveSearchOpenAiPayload(
          response.payload,
          response.metadata,
          row.processing_context as ArchiveSearchProcessingContext,
        )
      : parseArchiveIntelligenceOpenAiPayload(
          response.payload,
          response.metadata,
          row.processing_context as ArchiveIntelligenceProcessingContext,
        );
  return { ...result, requestId: row.request_id };
}

function circuitKey(row: ArchiveAiRequestRow): string {
  const routeKey =
    typeof row.processing_context.routeKey === "string"
      ? row.processing_context.routeKey
      : "default";
  return `${row.surface}:${row.requested_model}:${routeKey}`;
}

function requestTelemetry(row: ArchiveAiRequestRow) {
  const routeKey =
    typeof row.processing_context.routeKey === "string"
      ? row.processing_context.routeKey
      : "default";
  const startedAt = Date.parse(row.created_at_text);
  return {
    routeKey,
    totalLatencyMs: Number.isFinite(startedAt) ? Math.max(0, Date.now() - startedAt) : undefined,
  };
}

async function latestState(row: ArchiveAiRequestRow): Promise<ArchiveAiWireState> {
  return archiveAiRequestState<ArchiveAiResult>(
    await getArchiveAiRequest(row.request_id, row.session_hash),
  );
}

function pendingState(
  row: ArchiveAiRequestRow,
  state: "queued" | "running" | "unknown",
  retryAfterMs: number,
): ArchiveAiWireState {
  return {
    requestId: row.request_id,
    state,
    retryAfterMs: Math.max(250, Math.min(5_000, retryAfterMs)),
    requestedModel: row.requested_model,
    expiresAt: row.expires_at_text,
  };
}

async function cancelUnadoptedProviderResponse(
  apiKey: string,
  row: ArchiveAiRequestRow,
  providerResponseId: string,
): Promise<void> {
  try {
    await cancelOpenAiBackgroundResponse({
      apiKey,
      responseId: providerResponseId,
      logicalRequestId: row.request_id,
      attemptOffset: 120 + row.lease_generation * 3,
    });
    logArchiveAiEvent("unadopted_provider_cancelled", {
      ...requestTelemetry(row),
      requestId: row.request_id,
      surface: row.surface,
      requestedModel: row.requested_model,
      providerResponseId,
    });
  } catch (error) {
    // The ledger remains terminal/owned by the winning worker. Cancellation is
    // best-effort, but an adoption race must never silently lose the exact ID.
    logArchiveAiEvent("unadopted_provider_cancel_failed", {
      ...requestTelemetry(row),
      requestId: row.request_id,
      surface: row.surface,
      requestedModel: row.requested_model,
      providerResponseId,
      reason: error instanceof Error ? error.name : "unknown",
    });
  }
}

async function finishOnline(
  row: ArchiveAiRequestRow,
  response: ArchiveOpenAiBackgroundResponse,
  breakerKey: string,
): Promise<ArchiveAiWireState> {
  const result = parseCompletedResponse(row, response);
  const completed = await completeArchiveAiRequest({
    requestId: row.request_id,
    sessionHash: row.session_hash,
    result,
    channel: "online",
    reason: "ok",
    providerModel: response.metadata.providerModel,
    providerResponseId: response.metadata.providerResponseId,
    openaiRequestId: response.metadata.openaiRequestId,
    leaseGeneration: row.lease_generation,
  });
  if (completed) {
    await recordArchiveAiCircuitOutcome({ breakerKey, success: true });
    logArchiveAiEvent("request_succeeded", {
      ...requestTelemetry(row),
      requestId: row.request_id,
      surface: row.surface,
      requestedModel: row.requested_model,
      providerModel: response.metadata.providerModel,
      providerResponseId: response.metadata.providerResponseId,
      openaiRequestId: response.metadata.openaiRequestId,
    });
    return {
      requestId: row.request_id,
      state: "succeeded",
      requestedModel: row.requested_model,
      providerModel: response.metadata.providerModel,
      providerResponseId: response.metadata.providerResponseId,
      openaiRequestId: response.metadata.openaiRequestId,
      result,
    };
  }
  return latestState(row);
}

async function finishLocal(
  row: ArchiveAiRequestRow,
  payload: unknown,
  reason: ArchiveDeliveryReason,
): Promise<ArchiveAiWireState> {
  const result = localResultFromPayload(row, payload, reason);
  const completed = await completeArchiveAiRequest({
    requestId: row.request_id,
    sessionHash: row.session_hash,
    result,
    channel: "local",
    reason,
    leaseGeneration: row.lease_generation,
  });
  if (completed) {
    logArchiveAiEvent("request_local", {
      ...requestTelemetry(row),
      requestId: row.request_id,
      surface: row.surface,
      requestedModel: row.requested_model,
      reason,
    });
    return {
      requestId: row.request_id,
      state: "local",
      requestedModel: row.requested_model,
      result,
    };
  }
  return latestState(row);
}

async function failRequest(
  row: ArchiveAiRequestRow,
  reason: ArchiveDeliveryReason,
  retryable: boolean,
): Promise<ArchiveAiWireState> {
  const failed = await failArchiveAiRequest({
    requestId: row.request_id,
    sessionHash: row.session_hash,
    reason,
    retryable,
    leaseGeneration: row.lease_generation,
  });
  if (failed) {
    logArchiveAiEvent("request_failed", {
      ...requestTelemetry(row),
      requestId: row.request_id,
      surface: row.surface,
      requestedModel: row.requested_model,
      providerModel: row.provider_model,
      providerResponseId: row.provider_response_id,
      openaiRequestId: row.openai_request_id,
      reason,
      retryable,
    });
    return {
      requestId: row.request_id,
      state: "failed",
      reason,
      retryable,
    };
  }
  return latestState(row);
}

async function executionForRow(
  row: ArchiveAiRequestRow,
  payload: unknown,
  safetyIdentifier?: string,
) {
  if (row.surface === "search") {
    const parsed = archiveSearchRequestSchema.parse(payload);
    return createArchiveSearchOpenAiExecution({
      messages: parsed.messages,
      candidates: canonicalizeArchiveSearchCandidates(parsed.candidates),
      modelPreference: parsed.modelPreference,
      safetyIdentifier,
    });
  }
  const parsed = archiveIntelligenceRequestSchema.parse(payload);
  return createArchiveIntelligenceOpenAiExecution({
    characterId: parsed.characterId,
    mode: parsed.mode,
    proProfile: parsed.proProfile,
    messages: parsed.messages,
    safetyIdentifier,
  });
}

async function advanceArchiveAiRequestFromRow(
  request: Request,
  existing: ArchiveAiRequestRow,
  trustedRateLimitHash?: string,
  precheckedAccess?: ArchiveAiAccess,
  preparedExecution?: Awaited<ReturnType<typeof executionForRow>>,
): Promise<ArchiveAiWireState> {
  const existingState = archiveAiRequestState<ArchiveAiResult>(existing);
  if (
    existingState.state !== "queued" &&
    existingState.state !== "running" &&
    existingState.state !== "unknown"
  ) {
    return existingState;
  }
  const row = await claimArchiveAiRequest(existing.request_id, existing.session_hash);
  if (!row) return latestState(existing);

  const breakerKey = circuitKey(row);
  const apiKey = process.env.OPENAI_API_KEY?.trim() ?? "";
  let decryptedPayload: unknown;
  let providerCreateAttempt: number | null = null;
  let providerResponseStarted = false;
  let createdProviderResponseId: string | undefined;
  try {
    if (row.provider_response_id) {
      if (!apiKey) return failRequest(row, "unconfigured", false);
      const response = await retrieveOpenAiBackgroundResponse({
        apiKey,
        responseId: row.provider_response_id,
        requestedModel: row.requested_model,
        logicalRequestId: row.request_id,
        attemptOffset: 6 + row.lease_generation * 3,
      });
      if (response.metadata.status === "completed") {
        return finishOnline(row, response, breakerKey);
      }
      if (response.metadata.status === "queued" || response.metadata.status === "in_progress") {
        const recorded = await recordArchiveAiProviderProgress({
          requestId: row.request_id,
          sessionHash: row.session_hash,
          providerModel: response.metadata.providerModel,
          openaiRequestId: response.metadata.openaiRequestId,
          delayMs: 1_000,
          leaseGeneration: row.lease_generation,
        });
        if (recorded) return pendingState(row, "running", 1_000);
        return latestState(row);
      }
      return failRequest(row, "provider_unavailable", false);
    }

    decryptedPayload = decryptArchiveAiRequestPayload(row);
    const initialExecution = preparedExecution ?? (await executionForRow(row, decryptedPayload));
    const storedRateLimitHash =
      typeof row.processing_context.rateLimitHash === "string" &&
      /^[0-9a-f]{64}$/u.test(row.processing_context.rateLimitHash)
        ? row.processing_context.rateLimitHash
        : (trustedRateLimitHash ?? row.session_hash);
    const access =
      precheckedAccess ??
      (await checkArchiveAiAccess(
        request,
        initialExecution.costClass,
        row.request_id,
        storedRateLimitHash,
      ));
    if (!access.allowed) {
      const reason =
        access.reason === "unconfigured"
          ? "unconfigured"
          : access.reason === "shared_state_unavailable"
            ? "shared_state_unavailable"
            : "rate_limited";
      return finishLocal(row, decryptedPayload, reason);
    }
    const circuit = await acquireArchiveAiCircuit(breakerKey);
    if (!circuit.allowed) return finishLocal(row, decryptedPayload, "provider_unavailable");
    providerCreateAttempt = await beginArchiveAiProviderCreateAttempt(
      row.request_id,
      row.session_hash,
      row.lease_generation,
    );
    if (!providerCreateAttempt) return failRequest(row, "provider_unavailable", false);

    // Admission already prepared and validated the exact prompt. Only the
    // server-derived safety identifier is learned after the atomic rate-limit
    // charge, so inject that one field instead of parsing/canonicalizing the
    // entire conversation for a second time.
    const execution = access.safetyIdentifier
      ? {
          ...initialExecution,
          body: { ...initialExecution.body, safety_identifier: access.safetyIdentifier },
        }
      : initialExecution;
    const response = await createOpenAiBackgroundResponse({
      apiKey,
      body: execution.body,
      requestedModel: row.requested_model,
      timeoutMs: Math.min(execution.timeoutMs, 25_000),
      logicalRequestId: row.request_id,
      attemptOffset: (providerCreateAttempt - 1) * 3,
    });
    createdProviderResponseId = response.metadata.providerResponseId;
    let adopted: boolean;
    try {
      adopted = await recordArchiveAiProviderStarted({
        requestId: row.request_id,
        sessionHash: row.session_hash,
        providerModel: response.metadata.providerModel,
        providerResponseId: response.metadata.providerResponseId,
        openaiRequestId: response.metadata.openaiRequestId,
        status: response.metadata.status,
        leaseGeneration: row.lease_generation,
      });
    } catch (error) {
      await cancelUnadoptedProviderResponse(apiKey, row, response.metadata.providerResponseId);
      createdProviderResponseId = undefined;
      throw error;
    }
    if (!adopted) {
      await cancelUnadoptedProviderResponse(apiKey, row, response.metadata.providerResponseId);
      createdProviderResponseId = undefined;
      return latestState(row);
    }
    providerResponseStarted = true;
    createdProviderResponseId = undefined;
    logArchiveAiEvent("provider_started", {
      ...requestTelemetry(row),
      requestId: row.request_id,
      surface: row.surface,
      requestedModel: row.requested_model,
      providerModel: response.metadata.providerModel,
      providerResponseId: response.metadata.providerResponseId,
      openaiRequestId: response.metadata.openaiRequestId,
      attempt: providerCreateAttempt,
      status: response.metadata.status,
    });
    if (response.metadata.status === "completed") return finishOnline(row, response, breakerKey);
    if (response.metadata.status === "queued" || response.metadata.status === "in_progress") {
      return pendingState(row, "running", 900);
    }
    await recordArchiveAiCircuitOutcome({
      breakerKey,
      success: false,
      reason: "provider_unavailable",
    });
    return failRequest(row, "provider_unavailable", false);
  } catch (error) {
    if (createdProviderResponseId && !providerResponseStarted) {
      await cancelUnadoptedProviderResponse(apiKey, row, createdProviderResponseId);
      createdProviderResponseId = undefined;
    }
    const providerIdentity = archiveOpenAiProviderIdentity(error);
    if (providerIdentity) {
      let adopted = false;
      try {
        adopted = await recordArchiveAiProviderStarted({
          requestId: row.request_id,
          sessionHash: row.session_hash,
          providerModel: providerIdentity.providerModel,
          providerResponseId: providerIdentity.providerResponseId,
          openaiRequestId: providerIdentity.openaiRequestId,
          status: "in_progress",
          leaseGeneration: row.lease_generation,
        });
      } catch (adoptionError) {
        await cancelUnadoptedProviderResponse(apiKey, row, providerIdentity.providerResponseId);
        logArchiveAiEvent("provider_identity_adoption_failed", {
          ...requestTelemetry(row),
          requestId: row.request_id,
          surface: row.surface,
          requestedModel: row.requested_model,
          providerResponseId: providerIdentity.providerResponseId,
          reason: adoptionError instanceof Error ? adoptionError.name : "unknown",
        });
        return latestState(row);
      }
      if (adopted) {
        logArchiveAiEvent("provider_identity_adopted", {
          ...requestTelemetry(row),
          requestId: row.request_id,
          surface: row.surface,
          requestedModel: row.requested_model,
          providerModel: providerIdentity.providerModel,
          providerResponseId: providerIdentity.providerResponseId,
          openaiRequestId: providerIdentity.openaiRequestId,
          attempt: providerCreateAttempt,
        });
        return pendingState(row, "running", 900);
      } else {
        await cancelUnadoptedProviderResponse(apiKey, row, providerIdentity.providerResponseId);
      }
      return latestState(row);
    }
    const reason =
      row.provider_response_id && archiveOpenAiResponseIsMissing(error)
        ? "provider_response_expired"
        : archiveProviderFailureReason(error);
    try {
      await recordArchiveAiCircuitOutcome({ breakerKey, success: false, reason });
    } catch (circuitError) {
      logArchiveAiEvent("circuit_record_failed", {
        ...requestTelemetry(row),
        requestId: row.request_id,
        surface: row.surface,
        requestedModel: row.requested_model,
        reason: circuitError instanceof Error ? circuitError.name : "unknown",
      });
    }
    if (
      decryptedPayload !== undefined &&
      providerCreateAttempt === 1 &&
      archiveOpenAiCreateOutcomeUnknown(error)
    ) {
      const deferred = await deferArchiveAiProviderCreateRetry({
        requestId: row.request_id,
        sessionHash: row.session_hash,
        leaseGeneration: row.lease_generation,
      });
      if (deferred) {
        logArchiveAiEvent("provider_create_retry_deferred", {
          ...requestTelemetry(row),
          requestId: row.request_id,
          surface: row.surface,
          requestedModel: row.requested_model,
          attempt: providerCreateAttempt,
          retryAfterMs: 5_000,
          reason,
        });
        return pendingState(row, "unknown", 5_000);
      }
      return latestState(row);
    }
    // Once an OpenAI response identity was persisted, a malformed completed
    // result must remain an online terminal failure. Falling back locally here
    // would retain provider identifiers and produce an invalid local envelope.
    if (providerResponseStarted) {
      return failRequest(row, reason, false);
    }
    if (decryptedPayload !== undefined) {
      try {
        return await finishLocal(row, decryptedPayload, reason);
      } catch {
        // The request may have completed concurrently; the ledger remains authoritative.
      }
    }
    const retryableProviderFailure = isRetryableArchiveProviderError(error);
    if (row.provider_response_id && retryableProviderFailure) {
      const recorded = await recordArchiveAiProviderProgress({
        requestId: row.request_id,
        sessionHash: row.session_hash,
        providerModel: row.provider_model ?? row.requested_model,
        openaiRequestId: row.openai_request_id ?? undefined,
        delayMs: 5_000,
        leaseGeneration: row.lease_generation,
      });
      logArchiveAiEvent("provider_retrieval_deferred", {
        ...requestTelemetry(row),
        requestId: row.request_id,
        surface: row.surface,
        requestedModel: row.requested_model,
        providerResponseId: row.provider_response_id,
        reason,
      });
      if (recorded) return pendingState(row, "running", 5_000);
      return latestState(row);
    }
    return failRequest(row, reason, retryableProviderFailure);
  }
}

export async function advanceArchiveAiRequest(
  request: Request,
  requestId: string,
  sessionHash: string | readonly string[],
  trustedRateLimitHash?: string,
): Promise<ArchiveAiWireState> {
  const existing = await getArchiveAiRequest(requestId, sessionHash);
  return advanceArchiveAiRequestFromRow(request, existing, trustedRateLimitHash);
}

export async function startArchiveSearchAiRequest(
  request: Request,
  input: ArchiveSearchRequest,
  rateLimitHash?: string,
): Promise<ArchiveAiWireState> {
  const identity = readArchiveRequestIdentity(request);
  if (!requestMatchesBody(identity.requestId, input.requestId)) {
    throw new Error("archive_request_identity_mismatch");
  }
  const canonicalCandidates = canonicalizeArchiveSearchCandidates(input.candidates);
  const storedPayload: SearchStoredPayload = {
    query: input.query,
    messages: input.messages,
    candidates: canonicalCandidates,
    modelPreference: input.modelPreference,
  };
  const execution = createArchiveSearchOpenAiExecution({
    messages: storedPayload.messages,
    candidates: canonicalCandidates,
    modelPreference: storedPayload.modelPreference,
  });
  const admission = await admitArchiveAiRequest({
    request,
    requestId: identity.requestId,
    sessionHash: identity.sessionHash,
    sessionHashes: identity.sessionHashes,
    surface: "search",
    clientVersion: request.headers.get("x-archive-client") ?? "unknown",
    payload: storedPayload,
    processingContext: {
      ...execution.processingContext,
      routeKey: `${storedPayload.modelPreference.execution}:${storedPayload.modelPreference.effort}`,
      ...(rateLimitHash ? { rateLimitHash } : {}),
    },
    requestedModel: execution.requestedModel,
    costClass: execution.costClass,
    rateLimitHash,
  });
  return advanceArchiveAiRequestFromRow(
    request,
    admission.row,
    rateLimitHash,
    admission.access,
    execution,
  );
}

export async function startArchiveIntelligenceAiRequest(
  request: Request,
  input: ArchiveIntelligenceRequest,
  rateLimitHash?: string,
): Promise<ArchiveAiWireState> {
  const identity = readArchiveRequestIdentity(request);
  if (!requestMatchesBody(identity.requestId, input.requestId)) {
    throw new Error("archive_request_identity_mismatch");
  }
  const storedPayload: PersonaStoredPayload = {
    characterId: input.characterId,
    mode: input.mode,
    proProfile: input.proProfile,
    messages: input.messages,
  };
  const execution = createArchiveIntelligenceOpenAiExecution(storedPayload);
  const admission = await admitArchiveAiRequest({
    request,
    requestId: identity.requestId,
    sessionHash: identity.sessionHash,
    sessionHashes: identity.sessionHashes,
    surface: "persona",
    clientVersion: request.headers.get("x-archive-client") ?? "unknown",
    payload: storedPayload,
    processingContext: {
      ...execution.processingContext,
      routeKey: `${storedPayload.mode}:${storedPayload.proProfile}`,
      ...(rateLimitHash ? { rateLimitHash } : {}),
    },
    requestedModel: execution.requestedModel,
    costClass: execution.costClass,
    rateLimitHash,
  });
  return advanceArchiveAiRequestFromRow(
    request,
    admission.row,
    rateLimitHash,
    admission.access,
    execution,
  );
}

export async function resumeArchiveAiRequest(
  request: Request,
  pathRequestId: string,
  rateLimitHash?: string,
): Promise<ArchiveAiWireState> {
  const identity = readArchiveRequestIdentity(request);
  if (identity.requestId !== pathRequestId.toLowerCase()) {
    throw new Error("archive_request_identity_mismatch");
  }
  return advanceArchiveAiRequest(
    request,
    identity.requestId,
    identity.sessionHashes,
    rateLimitHash,
  );
}

/**
 * Once a provider response has been created, keep collecting it independently
 * from the browser connection. Vercel's waitUntil extends the Function lifetime;
 * local Node development safely keeps the same promise alive in-process.
 */
export function continueArchiveAiRequestInBackground(
  request: Request,
  state: ArchiveAiWireState,
  rateLimitHash?: string,
): void {
  if (state.state !== "queued" && state.state !== "running" && state.state !== "unknown") return;
  const identity = readArchiveRequestIdentity(request);
  const deadline = Date.now() + 4 * 60 * 1_000;
  const work = (async () => {
    let current: ArchiveAiWireState = state;
    while (
      (current.state === "queued" || current.state === "running" || current.state === "unknown") &&
      Date.now() < deadline
    ) {
      // Give the foreground browser poll a small head start. Without this
      // stagger, the waitUntil worker and the active client wake together; the
      // worker can hold the lease while the client reads a stale pending row,
      // delaying an already-finished answer by a full extra polling interval.
      const delay = Math.min(
        5_000,
        Math.max(700, current.retryAfterMs) + BACKGROUND_POLL_STAGGER_MS,
      );
      await new Promise<void>((resolve) => setTimeout(resolve, delay));
      try {
        current = await advanceArchiveAiRequest(
          request,
          identity.requestId,
          identity.sessionHashes,
          rateLimitHash,
        );
      } catch (error) {
        logArchiveAiEvent("background_collection_retry", {
          requestId: identity.requestId,
          reason: error instanceof Error ? error.name : "unknown",
        });
      }
    }
  })();
  const observedWork = work.catch((error) => {
    logArchiveAiEvent("background_collection_stopped", {
      requestId: identity.requestId,
      reason: error instanceof Error ? error.name : "unknown",
    });
  });
  if (process.env.VERCEL) waitUntil(observedWork);
}
