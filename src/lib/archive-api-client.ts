import {
  isArchiveAiRequestEnvelope,
  type ArchiveAiLifecycleState,
  type ArchiveAiRequestState,
} from "./archive-ai-request.ts";
import type { ArchiveDeliveryReason } from "./archive-delivery.ts";
import {
  createArchiveAiRequestId,
  forgetArchiveAiPending,
  getArchiveAiSessionId,
  rememberArchiveAiPending,
  type ArchiveAiPendingRecord,
} from "./archive-ai-pending.ts";

export {
  createArchiveAiRequestId,
  forgetArchiveAiPending,
  listArchiveAiPending,
  subscribeArchiveAiRecoveryWake,
} from "./archive-ai-pending.ts";

export class ArchiveApiClientError extends Error {
  readonly reason: ArchiveDeliveryReason;
  readonly retryable: boolean;

  constructor(
    message: string,
    reason: ArchiveDeliveryReason,
    options?: { cause?: unknown; retryable?: boolean },
  ) {
    super(message, options?.cause === undefined ? undefined : { cause: options.cause });
    this.name = "ArchiveApiClientError";
    this.reason = reason;
    this.retryable = options?.retryable ?? false;
  }
}

export type ArchiveApiLifecycle =
  | Extract<ArchiveAiLifecycleState, "queued" | "running" | "unknown">
  | "submitting"
  | "reconnecting";

export type ArchiveApiTiming = {
  requestId: string;
  phase: "submit" | "poll" | "resume";
  attempt: number;
  durationMs: number;
  outcome: "response" | "network_error" | "aborted";
  status?: number;
};

const CLIENT_DELAYS_MS = [1_000, 2_000, 4_000, 5_000] as const;
const REQUEST_TTL_MS = 32_000;
const RESUME_TTL_MS = 32_000;
const FETCH_ATTEMPT_TIMEOUT_MS = 12_000;
const MAX_LEDGER_POST_ATTEMPTS = 3;

function abortError(signal: AbortSignal): unknown {
  return signal.reason ?? new DOMException("Aborted", "AbortError");
}

function browserCanAttempt(): boolean {
  // iOS Safari/WebKit can report hidden or offline while the composer is
  // focused (keyboard, iframe preview). Blocking the poll there left the UI
  // on 思考中 forever because waitForConnectionWindow had no timer.
  return typeof navigator === "undefined" || navigator.onLine !== false;
}

function waitForConnectionWindow(delayMs: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.reject(abortError(signal));
  if (typeof window === "undefined" || typeof document === "undefined") {
    return new Promise<void>((resolve, reject) => {
      const cleanup = () => {
        clearTimeout(timer);
        signal.removeEventListener("abort", abort);
      };
      const abort = () => {
        cleanup();
        reject(abortError(signal));
      };
      const timer = setTimeout(() => {
        cleanup();
        resolve();
      }, delayMs);
      signal.addEventListener("abort", abort, { once: true });
    });
  }
  return new Promise<void>((resolve, reject) => {
    let timer = 0;
    const cleanup = () => {
      if (timer) window.clearTimeout(timer);
      window.removeEventListener("online", wake);
      window.removeEventListener("pageshow", wake);
      document.removeEventListener("visibilitychange", visibilityWake);
      signal.removeEventListener("abort", abort);
    };
    const finish = () => {
      cleanup();
      resolve();
    };
    const wake = () => {
      if (browserCanAttempt()) finish();
    };
    const visibilityWake = () => {
      if (document.visibilityState === "visible" && browserCanAttempt()) finish();
    };
    const abort = () => {
      cleanup();
      reject(abortError(signal));
    };
    window.addEventListener("online", wake, { once: true });
    window.addEventListener("pageshow", wake, { once: true });
    document.addEventListener("visibilitychange", visibilityWake);
    signal.addEventListener("abort", abort, { once: true });
    timer = window.setTimeout(finish, Math.max(250, Math.min(5_000, delayMs)));
  });
}

function retryDelay(attempt: number, serverDelay?: number): number {
  if (typeof serverDelay === "number" && Number.isFinite(serverDelay)) {
    // A healthy pending response already carries the server's lease-aware next
    // poll window. Adding client jitter here only makes a completed answer sit
    // unseen for longer; transient transport failures still use jitter below.
    return Math.max(250, Math.min(5_000, serverDelay));
  }
  const base = CLIENT_DELAYS_MS[Math.min(attempt, CLIENT_DELAYS_MS.length - 1)];
  return base + Math.floor(Math.random() * 180);
}

function monotonicNow(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

function reportTiming(
  onTiming: ((timing: ArchiveApiTiming) => void) | undefined,
  timing: ArchiveApiTiming,
): void {
  try {
    onTiming?.(timing);
  } catch {
    // Diagnostics must never become part of the delivery path.
  }
}

async function responsePayload(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch (cause) {
    throw new ArchiveApiClientError("Archive API response was not JSON", "client_invalid_payload", {
      cause,
    });
  }
}

function responseRequestId(payload: unknown): string | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const requestId = (payload as { requestId?: unknown }).requestId;
  return typeof requestId === "string" ? requestId : null;
}

function assertMatchingResponseRequestId(payload: unknown, expectedRequestId: string): void {
  const receivedRequestId = responseRequestId(payload);
  if (receivedRequestId === null || receivedRequestId === expectedRequestId) return;
  // Never accept a response from another logical request. Keep our own pending record so a
  // later clean GET can still recover it after a stale proxy/cache response disappears.
  throw new ArchiveApiClientError(
    "Archive API response request id did not match",
    "client_invalid_payload",
  );
}

async function fetchWithAttemptTimeout(
  input: RequestInfo | URL,
  init: RequestInit,
  parentSignal: AbortSignal,
  timeoutMs = FETCH_ATTEMPT_TIMEOUT_MS,
): Promise<Response> {
  if (parentSignal.aborted) throw abortError(parentSignal);
  const controller = new AbortController();
  const abortFromParent = () => controller.abort(abortError(parentSignal));
  parentSignal.addEventListener("abort", abortFromParent, { once: true });
  let timer = 0;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      const error = new DOMException("Archive API attempt timed out", "TimeoutError");
      controller.abort(error);
      reject(error);
    }, timeoutMs) as unknown as number;
  });
  try {
    // iOS WebKit can ignore AbortController on fetch. Race the timer so 送信中
    // cannot block the composer after the attempt budget.
    return await Promise.race([
      fetch(input, { ...init, signal: controller.signal }),
      timeout,
    ]);
  } finally {
    if (timer) clearTimeout(timer);
    parentSignal.removeEventListener("abort", abortFromParent);
  }
}

export async function cancelArchiveApi({
  client,
  requestId,
  sessionId,
}: {
  client: "search-v1" | "persona-v1";
  requestId: string;
  sessionId?: string;
}): Promise<void> {
  const controller = new AbortController();
  try {
    const resolvedSessionId = sessionId ?? (await getArchiveAiSessionId());
    const response = await fetchWithAttemptTimeout(
      `/api/archive-ai/requests/${encodeURIComponent(requestId)}`,
      {
        method: "DELETE",
        credentials: "same-origin",
        headers: {
          "x-archive-client": client,
          "x-archive-request-id": requestId,
          "x-archive-session-id": resolvedSessionId,
        },
      },
      controller.signal,
      8_000,
    );
    if (response.ok || response.status === 404 || response.status === 410) {
      await forgetArchiveAiPending(requestId);
    }
  } catch {
    // Cancellation is best-effort. A completed result remains recoverable by request ID.
  }
}

export async function postArchiveApi<T>({
  url,
  client,
  body,
  signal,
  validate,
  requestId = createArchiveAiRequestId(),
  pendingContext,
  onState,
  onTiming,
}: {
  url: "/api/archive-search" | "/api/archive-intelligence";
  client: "search-v1" | "persona-v1";
  body: unknown;
  signal: AbortSignal;
  validate: (payload: unknown) => payload is T;
  requestId?: string;
  pendingContext?: Pick<ArchiveAiPendingRecord, "contextId" | "userMessageId">;
  onState?: (state: ArchiveApiLifecycle) => void;
  onTiming?: (timing: ArchiveApiTiming) => void;
}): Promise<T> {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new ArchiveApiClientError(
      "Archive API request body was invalid",
      "client_invalid_payload",
    );
  }
  const startedAt = Date.now();
  const deadline = startedAt + REQUEST_TTL_MS;
  const sessionId = await getArchiveAiSessionId();
  const requestBody = { ...(body as Record<string, unknown>), requestId };
  const headers = {
    "content-type": "application/json",
    "x-archive-client": client,
    "x-archive-request-id": requestId,
    "x-archive-session-id": sessionId,
  };
  await rememberArchiveAiPending({
    requestId,
    sessionId,
    url,
    client,
    startedAt,
    ...pendingContext,
  });

  let postAttempted = false;
  let postAttempts = 0;
  let pollAttempt = 0;
  let transportAttempt = 0;
  let serverDelay: number | undefined;
  let reconnecting = false;

  while (Date.now() < deadline) {
    if (signal.aborted) throw abortError(signal);
    if (!browserCanAttempt()) {
      reconnecting = true;
      onState?.("reconnecting");
      await waitForConnectionWindow(1_000, signal);
      continue;
    }
    const method = postAttempted ? "GET" : "POST";
    const endpoint =
      method === "POST" ? url : `/api/archive-ai/requests/${encodeURIComponent(requestId)}`;
    if (method === "POST") postAttempts += 1;
    onState?.(method === "POST" ? "submitting" : reconnecting ? "reconnecting" : "running");

    let response: Response;
    const fetchStartedAt = monotonicNow();
    const phase = method === "POST" ? "submit" : "poll";
    const attempt = ++transportAttempt;
    try {
      response = await fetchWithAttemptTimeout(
        endpoint,
        {
          method,
          credentials: "same-origin",
          headers,
          body: method === "POST" ? JSON.stringify(requestBody) : undefined,
        },
        signal,
      );
      reportTiming(onTiming, {
        requestId,
        phase,
        attempt,
        durationMs: Math.max(0, monotonicNow() - fetchStartedAt),
        outcome: "response",
        status: response.status,
      });
      reconnecting = false;
    } catch {
      reportTiming(onTiming, {
        requestId,
        phase,
        attempt,
        durationMs: Math.max(0, monotonicNow() - fetchStartedAt),
        outcome: signal.aborted ? "aborted" : "network_error",
      });
      if (signal.aborted) throw abortError(signal);
      postAttempted = true;
      reconnecting = true;
      onState?.("reconnecting");
      await waitForConnectionWindow(retryDelay(pollAttempt++), signal);
      continue;
    }

    if (
      response.status === 404 &&
      postAttempted &&
      postAttempts < MAX_LEDGER_POST_ATTEMPTS
    ) {
      postAttempted = false;
      // A successful authoritative lookup proved that this logical request has
      // no ledger row. Recreate it immediately with the same id; sleeping here
      // previously added two to four seconds after an already-paid retry wait.
      continue;
    }
    if (response.status === 410) {
      void forgetArchiveAiPending(requestId);
      throw new ArchiveApiClientError("Archive AI request expired", "request_expired");
    }
    if (response.status >= 500) {
      postAttempted = true;
      reconnecting = true;
      onState?.("reconnecting");
      await waitForConnectionWindow(retryDelay(pollAttempt++), signal);
      continue;
    }
    if (!response.ok) {
      void forgetArchiveAiPending(requestId);
      throw new ArchiveApiClientError(
        `Archive API request failed with ${response.status}`,
        response.status >= 500 ? "client_http_5xx" : "client_http_4xx",
      );
    }

    const payload = await responsePayload(response);
    assertMatchingResponseRequestId(payload, requestId);
    if (!isArchiveAiRequestEnvelope(payload, validate)) {
      throw new ArchiveApiClientError("Archive API response was invalid", "client_invalid_payload");
    }
    const state: ArchiveAiRequestState<T> = payload;
    if (state.state === "succeeded" || state.state === "local") {
      void forgetArchiveAiPending(requestId);
      return state.result;
    }
    if (state.state === "failed" || state.state === "expired" || state.state === "cancelled") {
      void forgetArchiveAiPending(requestId);
      throw new ArchiveApiClientError(`Archive AI request ended in ${state.state}`, state.reason, {
        retryable: state.retryable,
      });
    }

    if (state.state === "queued" || state.state === "running" || state.state === "unknown") {
      postAttempted = true;
      serverDelay = state.retryAfterMs;
      onState?.(state.state);
      await waitForConnectionWindow(retryDelay(pollAttempt++, serverDelay), signal);
      continue;
    }
    throw new ArchiveApiClientError(
      "Archive API response state was invalid",
      "client_invalid_payload",
    );
  }

  void forgetArchiveAiPending(requestId);
  throw new ArchiveApiClientError("Archive AI request expired", "request_expired");
}

export async function resumeArchiveApi<T>({
  pending,
  signal,
  validate,
  onState,
  onTiming,
}: {
  pending: ArchiveAiPendingRecord;
  signal: AbortSignal;
  validate: (payload: unknown) => payload is T;
  onState?: (state: ArchiveApiLifecycle) => void;
  onTiming?: (timing: ArchiveApiTiming) => void;
}): Promise<T> {
  const sessionId = pending.sessionId ?? (await getArchiveAiSessionId());
  const headers = {
    "x-archive-client": pending.client,
    "x-archive-request-id": pending.requestId,
    "x-archive-session-id": sessionId,
  };
  let attempt = 0;
  let transportAttempt = 0;
  let serverDelay: number | undefined;

  const resumeDeadline = Math.min(
    pending.expiresAt,
    Math.max(pending.startedAt, Date.now()) + RESUME_TTL_MS,
    Date.now() + RESUME_TTL_MS,
  );
  while (Date.now() < resumeDeadline) {
    if (signal.aborted) throw abortError(signal);
    if (!browserCanAttempt()) {
      onState?.("reconnecting");
      await waitForConnectionWindow(1_000, signal);
      continue;
    }
    onState?.("running");
    let response: Response;
    const fetchStartedAt = monotonicNow();
    const fetchAttempt = ++transportAttempt;
    try {
      response = await fetchWithAttemptTimeout(
        `/api/archive-ai/requests/${encodeURIComponent(pending.requestId)}`,
        {
          method: "GET",
          credentials: "same-origin",
          headers,
        },
        signal,
      );
      reportTiming(onTiming, {
        requestId: pending.requestId,
        phase: "resume",
        attempt: fetchAttempt,
        durationMs: Math.max(0, monotonicNow() - fetchStartedAt),
        outcome: "response",
        status: response.status,
      });
    } catch {
      reportTiming(onTiming, {
        requestId: pending.requestId,
        phase: "resume",
        attempt: fetchAttempt,
        durationMs: Math.max(0, monotonicNow() - fetchStartedAt),
        outcome: signal.aborted ? "aborted" : "network_error",
      });
      if (signal.aborted) throw abortError(signal);
      await waitForConnectionWindow(retryDelay(attempt++), signal);
      continue;
    }
    if (response.status === 410) {
      void forgetArchiveAiPending(pending.requestId);
      throw new ArchiveApiClientError("Archive AI request expired", "request_expired");
    }
    if (response.status >= 500) {
      await waitForConnectionWindow(retryDelay(attempt++), signal);
      continue;
    }
    if (!response.ok) {
      // A status probe can race ledger admission, key propagation, or a WebKit
      // process restore. Keep the durable identity until an explicit terminal
      // envelope/410 or its local TTL proves that recovery is impossible.
      throw new ArchiveApiClientError(
        `Archive API request recovery failed with ${response.status}`,
        "client_http_4xx",
      );
    }

    const payload = await responsePayload(response);
    assertMatchingResponseRequestId(payload, pending.requestId);
    if (!isArchiveAiRequestEnvelope(payload, validate)) {
      void forgetArchiveAiPending(pending.requestId);
      throw new ArchiveApiClientError(
        "Archive API recovery response was invalid",
        "client_invalid_payload",
      );
    }
    const state: ArchiveAiRequestState<T> = payload;
    if (state.state === "succeeded" || state.state === "local") {
      void forgetArchiveAiPending(pending.requestId);
      return state.result;
    }
    if (state.state === "failed" || state.state === "expired" || state.state === "cancelled") {
      void forgetArchiveAiPending(pending.requestId);
      throw new ArchiveApiClientError(`Archive AI request ended in ${state.state}`, state.reason, {
        retryable: state.retryable,
      });
    }
    if (state.state === "queued" || state.state === "running" || state.state === "unknown") {
      serverDelay = state.retryAfterMs;
      onState?.(state.state);
      await waitForConnectionWindow(retryDelay(attempt++, serverDelay), signal);
      continue;
    }
    throw new ArchiveApiClientError(
      "Archive API recovery state was invalid",
      "client_invalid_payload",
    );
  }

  void forgetArchiveAiPending(pending.requestId);
  throw new ArchiveApiClientError("Archive AI request expired", "request_expired");
}
