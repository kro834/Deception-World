import { randomUUID } from "node:crypto";
import type { ArchiveDeliveryReason } from "./archive-delivery.ts";
import { logArchiveAiEvent } from "./archive-ai-observability.server.ts";
import {
  ARCHIVE_PROVIDER_MODELS_BY_REQUEST,
  isAllowedArchiveProviderModel,
} from "./archive-provider-models.js";

export { isAllowedArchiveProviderModel } from "./archive-provider-models.js";

const MAX_ATTEMPTS = 3;
const MAX_BACKOFF_DELAY_MS = 4_000;
const RETRYABLE_STATUS_CODES = new Set([408, 409, 425, 429]);
const DEFINITIVE_CREATE_RETRY_STATUS_CODES = new Set([409, 425, 429]);
const NON_RETRYABLE_LIMIT_CODES = new Set([
  "billing_hard_limit_reached",
  "credit_balance_exhausted",
  "organization_spend_limit_exceeded",
  "project_spend_limit_exceeded",
  "organization_usage_limit_exceeded",
  "insufficient_quota",
]);

type OpenAiErrorPayload = { error?: { code?: unknown; type?: unknown } };

export type ArchiveOpenAiMetadata = {
  requestedModel: string;
  providerModel: string;
  providerResponseId: string;
  openaiRequestId?: string;
  status: "queued" | "in_progress" | "completed" | "failed" | "cancelled" | "incomplete";
};

export type ArchiveOpenAiBackgroundResponse = {
  payload: unknown;
  metadata: ArchiveOpenAiMetadata;
};

export class ArchiveOpenAiTransportError extends Error {
  readonly status?: number;
  readonly code?: string;
  readonly openaiRequestId?: string;
  readonly clientRequestId?: string;
  readonly outcomeUnknown: boolean;

  constructor(
    message: string,
    status?: number,
    options?: {
      code?: string;
      openaiRequestId?: string;
      clientRequestId?: string;
      outcomeUnknown?: boolean;
      cause?: unknown;
    },
  ) {
    super(message, options?.cause === undefined ? undefined : { cause: options.cause });
    this.name = "ArchiveOpenAiTransportError";
    this.status = status;
    this.code = options?.code;
    this.openaiRequestId = options?.openaiRequestId;
    this.clientRequestId = options?.clientRequestId;
    this.outcomeUnknown = options?.outcomeUnknown ?? false;
  }
}

export type ArchiveOpenAiProviderIdentity = {
  providerModel: string;
  providerResponseId: string;
  openaiRequestId?: string;
};

export class ArchiveOpenAiCreateResultError extends Error {
  readonly outcomeUnknown: boolean;
  readonly providerIdentity?: ArchiveOpenAiProviderIdentity;

  constructor(
    message: string,
    options: {
      outcomeUnknown: boolean;
      providerIdentity?: ArchiveOpenAiProviderIdentity;
      cause?: unknown;
    },
  ) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = "ArchiveOpenAiCreateResultError";
    this.outcomeUnknown = options.outcomeUnknown;
    this.providerIdentity = options.providerIdentity;
  }
}

export class ArchiveOpenAiPayloadError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "ArchiveOpenAiPayloadError";
  }
}

export class ArchiveOpenAiModelMismatchError extends Error {
  readonly requestedModel: string;
  readonly providerModel: string;

  constructor(requestedModel: string, providerModel: string) {
    super(`OpenAI returned an unexpected model for ${requestedModel}`);
    this.name = "ArchiveOpenAiModelMismatchError";
    this.requestedModel = requestedModel;
    this.providerModel = providerModel;
  }
}

function errorCode(payload: unknown): string | undefined {
  if (!payload || typeof payload !== "object") return undefined;
  const code = (payload as OpenAiErrorPayload).error?.code;
  return typeof code === "string" ? code : undefined;
}

export function archiveProviderFailureReason(error: unknown): ArchiveDeliveryReason {
  const classifiedError = unwrapArchiveOpenAiError(error);
  if (classifiedError instanceof ArchiveOpenAiModelMismatchError) {
    return "provider_model_mismatch";
  }
  if (classifiedError instanceof ArchiveOpenAiPayloadError) return "provider_invalid_response";
  if (classifiedError instanceof ArchiveOpenAiTransportError) {
    if (/timed out/iu.test(classifiedError.message)) return "provider_timeout";
    if (classifiedError.status === 401) return "provider_authentication";
    if (classifiedError.status === 403) return "provider_permission";
    if (classifiedError.status === 404) return "provider_model_unavailable";
    if (classifiedError.status === 400 || classifiedError.status === 422) {
      return "provider_invalid_response";
    }
    if (
      classifiedError.status === 429 &&
      classifiedError.code &&
      NON_RETRYABLE_LIMIT_CODES.has(classifiedError.code)
    ) {
      return "provider_quota";
    }
    if (classifiedError.status === 429) return "provider_rate_limited";
  }
  return "provider_unavailable";
}

function unwrapArchiveOpenAiError(error: unknown): unknown {
  return error instanceof ArchiveOpenAiCreateResultError && error.cause !== undefined
    ? error.cause
    : error;
}

export function archiveOpenAiResponseIsMissing(error: unknown): boolean {
  const classifiedError = unwrapArchiveOpenAiError(error);
  return (
    classifiedError instanceof ArchiveOpenAiTransportError && classifiedError.status === 404
  );
}

/**
 * Only failures that can plausibly succeed without changing the request are
 * retried. In particular, auth, permission, missing-model, invalid-payload and
 * quota failures are terminal even if their public delivery reason is broad.
 */
export function isRetryableArchiveProviderError(error: unknown): boolean {
  const classifiedError = unwrapArchiveOpenAiError(error);
  if (!(classifiedError instanceof ArchiveOpenAiTransportError)) return false;
  if (classifiedError.status === undefined) {
    return (
      /timed out|network request failed/iu.test(classifiedError.message) ||
      classifiedError.outcomeUnknown
    );
  }
  if (
    classifiedError.status === 429 &&
    classifiedError.code &&
    NON_RETRYABLE_LIMIT_CODES.has(classifiedError.code)
  ) {
    return false;
  }
  return (
    RETRYABLE_STATUS_CODES.has(classifiedError.status) ||
    (classifiedError.status >= 500 && classifiedError.status <= 599)
  );
}

export function archiveOpenAiCreateOutcomeUnknown(error: unknown): boolean {
  return (
    (error instanceof ArchiveOpenAiTransportError && error.outcomeUnknown) ||
    (error instanceof ArchiveOpenAiCreateResultError && error.outcomeUnknown)
  );
}

export function archiveOpenAiProviderIdentity(
  error: unknown,
): ArchiveOpenAiProviderIdentity | undefined {
  return error instanceof ArchiveOpenAiCreateResultError ? error.providerIdentity : undefined;
}

export function isRetryableOpenAiResponse(status: number, payload: unknown): boolean {
  if (!RETRYABLE_STATUS_CODES.has(status) && !(status >= 500 && status <= 599)) return false;
  const code = errorCode(payload);
  return !code || !NON_RETRYABLE_LIMIT_CODES.has(code);
}

/**
 * A create POST may have reached the provider even when its gateway returns a
 * timeout or 5xx. Retrying those responses inside the transport can therefore
 * create more than one billable response. Only statuses that definitively did
 * not create a response are retried here; ambiguous results are handed to the
 * ledger's delayed, single re-create fence.
 */
export function isRetryableOpenAiCreateResponse(status: number, payload: unknown): boolean {
  if (!DEFINITIVE_CREATE_RETRY_STATUS_CODES.has(status)) return false;
  return isRetryableOpenAiResponse(status, payload);
}

function isAmbiguousOpenAiCreateResponse(status: number): boolean {
  return status === 408 || (status >= 500 && status <= 599);
}

export function openAiRetryDelayMs(response: Response, attempt: number): number {
  const retryAfterMs = response.headers.get("retry-after-ms")?.trim();
  if (retryAfterMs) {
    const milliseconds = Number(retryAfterMs);
    if (Number.isFinite(milliseconds) && milliseconds >= 0) return Math.ceil(milliseconds);
  }
  const retryAfter = response.headers.get("retry-after")?.trim();
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds) && seconds >= 0) return Math.ceil(seconds * 1_000);
    const date = Date.parse(retryAfter);
    if (Number.isFinite(date)) return Math.max(0, date - Date.now());
  }
  const ceiling = Math.min(MAX_BACKOFF_DELAY_MS, 450 * 2 ** attempt);
  return Math.floor(Math.random() * Math.max(1, ceiling + 1));
}

function waitForRetry(delayMs: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) {
    return Promise.reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
  }
  return new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
    };
    const onAbort = () => {
      cleanup();
      reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
    };
    const timer = setTimeout(() => {
      cleanup();
      resolve();
    }, delayMs);
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch (cause) {
    throw new ArchiveOpenAiPayloadError("OpenAI response was not valid JSON", { cause });
  }
}

function requestedModelFromBody(body: unknown): string {
  if (!body || typeof body !== "object") return "";
  const model = (body as { model?: unknown }).model;
  return typeof model === "string" ? model : "";
}

function parseMetadata(
  payload: unknown,
  requestedModel: string,
  openaiRequestId?: string,
): ArchiveOpenAiMetadata {
  if (!payload || typeof payload !== "object") {
    throw new ArchiveOpenAiPayloadError("OpenAI response envelope was missing");
  }
  const root = payload as { id?: unknown; model?: unknown; status?: unknown };
  if (typeof root.id !== "string" || !root.id.startsWith("resp_")) {
    throw new ArchiveOpenAiPayloadError("OpenAI response id was missing");
  }
  if (typeof root.model !== "string") {
    throw new ArchiveOpenAiPayloadError("OpenAI provider model was missing");
  }
  if (!isAllowedArchiveProviderModel(requestedModel, root.model)) {
    throw new ArchiveOpenAiModelMismatchError(requestedModel, root.model);
  }
  const status = root.status;
  if (
    status !== "queued" &&
    status !== "in_progress" &&
    status !== "completed" &&
    status !== "failed" &&
    status !== "cancelled" &&
    status !== "incomplete"
  ) {
    throw new ArchiveOpenAiPayloadError("OpenAI response status was invalid");
  }
  return {
    requestedModel,
    providerModel: root.model,
    providerResponseId: root.id,
    openaiRequestId,
    status,
  };
}

async function requestOpenAiJson({
  apiKey,
  method,
  url,
  body,
  timeoutMs,
  signal,
  logicalRequestId,
  maxAttempts = MAX_ATTEMPTS,
  createOutcomeMayBeUnknown = false,
  retryNetworkErrors = true,
  retryHttpResponse = isRetryableOpenAiResponse,
  httpOutcomeMayBeUnknown = () => false,
  attemptOffset = 0,
}: {
  apiKey: string;
  method: "GET" | "POST";
  url: string;
  body?: unknown;
  timeoutMs: number;
  signal?: AbortSignal;
  logicalRequestId?: string;
  maxAttempts?: number;
  createOutcomeMayBeUnknown?: boolean;
  retryNetworkErrors?: boolean;
  retryHttpResponse?: (status: number, payload: unknown) => boolean;
  httpOutcomeMayBeUnknown?: (status: number) => boolean;
  attemptOffset?: number;
}): Promise<{ payload: unknown; response: Response; attempts: number }> {
  const controller = new AbortController();
  const deadline = Date.now() + timeoutMs;
  let activeClientRequestId: string | undefined;
  const abortFromCaller = () => controller.abort(signal?.reason);
  if (signal?.aborted) abortFromCaller();
  else signal?.addEventListener("abort", abortFromCaller, { once: true });
  const timeout = setTimeout(
    () =>
      controller.abort(
        new ArchiveOpenAiTransportError("OpenAI request timed out", undefined, {
          clientRequestId: activeClientRequestId,
          outcomeUnknown: createOutcomeMayBeUnknown,
        }),
      ),
    timeoutMs,
  );
  let lastError: unknown;
  try {
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const attemptStartedAt = Date.now();
      let response: Response;
      const clientRequestId = logicalRequestId
        ? `${logicalRequestId}.a${attemptOffset + attempt + 1}`
        : randomUUID();
      activeClientRequestId = clientRequestId;
      try {
        response = await fetch(url, {
          method,
          headers: {
            authorization: `Bearer ${apiKey}`,
            ...(body === undefined ? {} : { "content-type": "application/json" }),
            "x-client-request-id": clientRequestId,
          },
          body: body === undefined ? undefined : JSON.stringify(body),
          signal: controller.signal,
        });
      } catch (cause) {
        if (controller.signal.aborted) {
          const abortReason = controller.signal.reason ?? cause;
          logArchiveAiEvent("provider_http_attempt", {
            requestId: logicalRequestId,
            clientRequestId,
            attempt: attempt + 1,
            method,
            outcome: "aborted",
            errorCode: abortReason instanceof Error ? abortReason.name : "unknown",
            latencyMs: Date.now() - attemptStartedAt,
          });
          throw abortReason;
        }
        lastError = new ArchiveOpenAiTransportError("OpenAI network request failed", undefined, {
          clientRequestId,
          outcomeUnknown: createOutcomeMayBeUnknown,
          cause,
        });
        logArchiveAiEvent("provider_http_attempt", {
          requestId: logicalRequestId,
          clientRequestId,
          attempt: attempt + 1,
          method,
          outcome: "network_error",
          errorCode: cause instanceof Error ? cause.name : "unknown",
          latencyMs: Date.now() - attemptStartedAt,
        });
        if (!retryNetworkErrors || attempt >= maxAttempts - 1) throw lastError;
        const remaining = deadline - Date.now();
        const ceiling = Math.min(4_000, 450 * 2 ** attempt);
        const delay = Math.floor(Math.random() * Math.max(1, ceiling + 1));
        if (delay >= remaining) throw lastError;
        await waitForRetry(delay, controller.signal);
        continue;
      }

      let payload: unknown;
      try {
        payload = await readJson(response);
      } catch (error) {
        if (controller.signal.aborted) throw controller.signal.reason ?? error;
        if (response.ok) throw error;
        payload = undefined;
      }
      if (!response.ok) {
        const code = errorCode(payload);
        lastError = new ArchiveOpenAiTransportError(
          `OpenAI request failed with ${response.status}`,
          response.status,
          {
            code,
            openaiRequestId: response.headers.get("x-request-id") ?? undefined,
            clientRequestId,
            outcomeUnknown: createOutcomeMayBeUnknown && httpOutcomeMayBeUnknown(response.status),
          },
        );
        logArchiveAiEvent("provider_http_attempt", {
          requestId: logicalRequestId,
          clientRequestId,
          attempt: attempt + 1,
          method,
          outcome: "http_error",
          status: response.status,
          errorCode: code,
          openaiRequestId: response.headers.get("x-request-id") ?? undefined,
          latencyMs: Date.now() - attemptStartedAt,
        });
        if (!retryHttpResponse(response.status, payload) || attempt >= maxAttempts - 1) {
          throw lastError;
        }
        const delay = openAiRetryDelayMs(response, attempt);
        if (delay >= deadline - Date.now()) throw lastError;
        await waitForRetry(delay, controller.signal);
        continue;
      }
      logArchiveAiEvent("provider_http_attempt", {
        requestId: logicalRequestId,
        clientRequestId,
        attempt: attempt + 1,
        method,
        outcome: "success",
        status: response.status,
        openaiRequestId: response.headers.get("x-request-id") ?? undefined,
        latencyMs: Date.now() - attemptStartedAt,
      });
      return { payload, response, attempts: attempt + 1 };
    }
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", abortFromCaller);
  }
  throw lastError ?? new ArchiveOpenAiTransportError("OpenAI request failed");
}

export async function requestOpenAiStructuredResponse<T>({
  apiKey,
  body,
  requestedModel: requestedModelOverride,
  timeoutMs,
  signal,
  logicalRequestId,
  parse,
}: {
  apiKey: string;
  body: unknown;
  requestedModel?: string;
  timeoutMs: number;
  signal?: AbortSignal;
  logicalRequestId?: string;
  parse: (payload: unknown, metadata?: ArchiveOpenAiMetadata) => T;
}): Promise<T> {
  const requestedModel = requestedModelOverride?.trim() || requestedModelFromBody(body);
  const { payload, response } = await requestOpenAiJson({
    apiKey,
    method: "POST",
    url: "https://api.openai.com/v1/responses",
    body,
    timeoutMs,
    signal,
    logicalRequestId,
  });
  let metadata: ArchiveOpenAiMetadata | undefined;
  if (requestedModel && Object.hasOwn(ARCHIVE_PROVIDER_MODELS_BY_REQUEST, requestedModel)) {
    metadata = parseMetadata(
      payload,
      requestedModel,
      response.headers.get("x-request-id") ?? undefined,
    );
  }
  try {
    return parse(payload, metadata);
  } catch (cause) {
    if (
      cause instanceof ArchiveOpenAiPayloadError ||
      cause instanceof ArchiveOpenAiModelMismatchError
    ) {
      throw cause;
    }
    throw new ArchiveOpenAiPayloadError(
      "OpenAI response did not match the expected structured payload",
      { cause },
    );
  }
}

export async function createOpenAiBackgroundResponse({
  apiKey,
  body,
  requestedModel: requestedModelOverride,
  timeoutMs = 20_000,
  logicalRequestId,
  attemptOffset = 0,
}: {
  apiKey: string;
  body: Record<string, unknown>;
  requestedModel?: string;
  timeoutMs?: number;
  logicalRequestId: string;
  attemptOffset?: number;
}): Promise<ArchiveOpenAiBackgroundResponse> {
  const requestedModel = requestedModelOverride?.trim() || requestedModelFromBody(body);
  let payload: unknown;
  let response: Response;
  try {
    ({ payload, response } = await requestOpenAiJson({
      apiKey,
      method: "POST",
      url: "https://api.openai.com/v1/responses",
      body: { ...body, background: true, store: false },
      timeoutMs,
      logicalRequestId,
      // Only responses known not to have created work are retried here.
      // Network/timeout/408/5xx outcomes are ambiguous and must instead use
      // the ledger's delayed, one-time re-create path.
      maxAttempts: MAX_ATTEMPTS,
      createOutcomeMayBeUnknown: true,
      retryNetworkErrors: false,
      retryHttpResponse: isRetryableOpenAiCreateResponse,
      httpOutcomeMayBeUnknown: isAmbiguousOpenAiCreateResponse,
      attemptOffset,
    }));
  } catch (cause) {
    if (cause instanceof ArchiveOpenAiPayloadError) {
      throw new ArchiveOpenAiCreateResultError("OpenAI create response was malformed", {
        outcomeUnknown: false,
        cause,
      });
    }
    throw cause;
  }
  const openaiRequestId = response.headers.get("x-request-id") ?? undefined;
  let metadata: ArchiveOpenAiMetadata;
  try {
    metadata = parseMetadata(payload, requestedModel, openaiRequestId);
  } catch (cause) {
    const root =
      payload && typeof payload === "object" ? (payload as { id?: unknown; model?: unknown }) : {};
    if (typeof root.id === "string" && /^resp_[A-Za-z0-9_-]{8,}$/u.test(root.id)) {
      throw new ArchiveOpenAiCreateResultError(
        "OpenAI create identity was confirmed but its metadata was invalid",
        {
          outcomeUnknown: false,
          providerIdentity: {
            providerModel: typeof root.model === "string" ? root.model : requestedModel,
            providerResponseId: root.id,
            openaiRequestId,
          },
          cause,
        },
      );
    }
    throw new ArchiveOpenAiCreateResultError("OpenAI create response identity was missing", {
      outcomeUnknown: false,
      cause,
    });
  }
  return {
    payload,
    metadata,
  };
}

export async function retrieveOpenAiBackgroundResponse({
  apiKey,
  responseId,
  requestedModel,
  logicalRequestId,
  attemptOffset = 0,
  timeoutMs = 20_000,
}: {
  apiKey: string;
  responseId: string;
  requestedModel: string;
  logicalRequestId: string;
  attemptOffset?: number;
  timeoutMs?: number;
}): Promise<ArchiveOpenAiBackgroundResponse> {
  if (!/^resp_[A-Za-z0-9_-]{8,}$/u.test(responseId)) {
    throw new ArchiveOpenAiPayloadError("Stored OpenAI response id was invalid");
  }
  const { payload, response } = await requestOpenAiJson({
    apiKey,
    method: "GET",
    url: `https://api.openai.com/v1/responses/${encodeURIComponent(responseId)}`,
    timeoutMs,
    logicalRequestId,
    attemptOffset,
  });
  return {
    payload,
    metadata: parseMetadata(
      payload,
      requestedModel,
      response.headers.get("x-request-id") ?? undefined,
    ),
  };
}

export async function cancelOpenAiBackgroundResponse({
  apiKey,
  responseId,
  logicalRequestId,
  timeoutMs = 10_000,
  attemptOffset = 0,
}: {
  apiKey: string;
  responseId: string;
  logicalRequestId: string;
  timeoutMs?: number;
  attemptOffset?: number;
}): Promise<void> {
  if (!/^resp_[A-Za-z0-9_-]{8,}$/u.test(responseId)) {
    throw new ArchiveOpenAiPayloadError("Stored OpenAI response id was invalid");
  }
  await requestOpenAiJson({
    apiKey,
    method: "POST",
    url: `https://api.openai.com/v1/responses/${encodeURIComponent(responseId)}/cancel`,
    timeoutMs,
    logicalRequestId,
    attemptOffset,
  });
}
