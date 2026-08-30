import {
  ARCHIVE_DELIVERY_REASONS,
  type ArchiveDeliveryReason,
} from "./archive-delivery.ts";
import {
  isAllowedArchiveProviderModel,
  isArchiveRequestedModel,
} from "./archive-provider-models.js";

export const ARCHIVE_AI_REQUEST_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export const ARCHIVE_AI_SESSION_ID_PATTERN = ARCHIVE_AI_REQUEST_ID_PATTERN;
const ARCHIVE_OPENAI_RESPONSE_ID_PATTERN = /^resp_[A-Za-z0-9_-]{8,}$/u;
const ARCHIVE_OPENAI_REQUEST_ID_PATTERN = /^req_[A-Za-z0-9_-]{8,}$/u;
const ARCHIVE_UUID_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

export function isArchiveProviderResponseId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length >= 8 &&
    value.length <= 128 &&
    (ARCHIVE_OPENAI_RESPONSE_ID_PATTERN.test(value) ||
      ARCHIVE_UUID_ID_PATTERN.test(value) ||
      /^[A-Za-z0-9._:-]{8,}$/u.test(value))
  );
}

export function isArchiveProviderRequestId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length >= 8 &&
    value.length <= 128 &&
    (ARCHIVE_OPENAI_REQUEST_ID_PATTERN.test(value) ||
      ARCHIVE_UUID_ID_PATTERN.test(value) ||
      /^[A-Za-z0-9._-]{8,}$/u.test(value))
  );
}
const ARCHIVE_MAX_PENDING_TTL_MS = 25 * 60 * 60 * 1_000;
const ARCHIVE_PENDING_CLOCK_SKEW_MS = 5 * 60 * 1_000;

function isValidPendingExpiry(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const expiresAt = Date.parse(value);
  const now = Date.now();
  return (
    Number.isFinite(expiresAt) &&
    expiresAt >= now - ARCHIVE_PENDING_CLOCK_SKEW_MS &&
    expiresAt <= now + ARCHIVE_MAX_PENDING_TTL_MS
  );
}

export type ArchiveAiLifecycleState =
  | "queued"
  | "running"
  | "unknown"
  | "succeeded"
  | "local"
  | "failed"
  | "expired"
  | "cancelled";

export type ArchiveAiRequestState<T> =
  | {
      requestId: string;
      state: "queued" | "running" | "unknown";
      retryAfterMs: number;
      requestedModel: string;
      expiresAt: string;
    }
  | {
      requestId: string;
      state: "succeeded" | "local";
      requestedModel: string;
      providerModel?: string;
      providerResponseId?: string;
      openaiRequestId?: string;
      result: T;
    }
  | {
      requestId: string;
      state: "failed" | "expired" | "cancelled";
      reason: ArchiveDeliveryReason;
      retryable: boolean;
    };

export function isArchiveAiPendingState(
  value: ArchiveAiRequestState<unknown>,
): value is Extract<ArchiveAiRequestState<unknown>, { state: "queued" | "running" | "unknown" }> {
  return value.state === "queued" || value.state === "running" || value.state === "unknown";
}

export function isArchiveAiRequestEnvelope<T>(
  value: unknown,
  validateResult: (payload: unknown) => payload is T,
): value is ArchiveAiRequestState<T> {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<ArchiveAiRequestState<T>> & Record<string, unknown>;
  if (typeof candidate.requestId !== "string" || !ARCHIVE_AI_REQUEST_ID_PATTERN.test(candidate.requestId)) {
    return false;
  }
  if (
    candidate.state === "queued" ||
    candidate.state === "running" ||
    candidate.state === "unknown"
  ) {
    return (
      typeof candidate.retryAfterMs === "number" &&
      candidate.retryAfterMs >= 250 &&
      candidate.retryAfterMs <= 5_000 &&
      isArchiveRequestedModel(candidate.requestedModel) &&
      isValidPendingExpiry(candidate.expiresAt)
    );
  }
  if (candidate.state === "succeeded" || candidate.state === "local") {
    const structurallyValid =
      isArchiveRequestedModel(candidate.requestedModel) &&
      (candidate.providerModel === undefined || typeof candidate.providerModel === "string") &&
      (candidate.providerResponseId === undefined || typeof candidate.providerResponseId === "string") &&
      (candidate.openaiRequestId === undefined || typeof candidate.openaiRequestId === "string") &&
      validateResult(candidate.result);
    if (!structurallyValid || !candidate.result || typeof candidate.result !== "object") return false;
    const result = candidate.result as Record<string, unknown>;
    if (
      result.requestId !== candidate.requestId ||
      result.requestedModel !== candidate.requestedModel
    ) {
      return false;
    }
    if (candidate.state === "succeeded") {
      return (
        typeof candidate.providerModel === "string" &&
        isAllowedArchiveProviderModel(
          candidate.requestedModel as string,
          candidate.providerModel as string,
        ) &&
        isArchiveProviderResponseId(candidate.providerResponseId) &&
        (candidate.openaiRequestId === undefined ||
          isArchiveProviderRequestId(candidate.openaiRequestId)) &&
        result.source === "openai" &&
        result.modelVerified === true &&
        result.providerModel === candidate.providerModel &&
        result.providerResponseId === candidate.providerResponseId &&
        result.openaiRequestId === candidate.openaiRequestId
      );
    }
    return (
      candidate.providerModel === undefined &&
      candidate.providerResponseId === undefined &&
      candidate.openaiRequestId === undefined &&
      result.source === "local" &&
      result.modelVerified === false &&
      result.providerModel === undefined &&
      result.providerResponseId === undefined &&
      result.openaiRequestId === undefined
    );
  }
  if (
    candidate.state === "failed" ||
    candidate.state === "expired" ||
    candidate.state === "cancelled"
  ) {
    return (
      ARCHIVE_DELIVERY_REASONS.includes(candidate.reason as ArchiveDeliveryReason) &&
      typeof candidate.retryable === "boolean"
    );
  }
  return false;
}
