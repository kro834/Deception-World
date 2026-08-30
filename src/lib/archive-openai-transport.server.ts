import { randomUUID } from "node:crypto";

const MAX_ATTEMPTS = 3;
const MAX_BACKOFF_DELAY_MS = 4_000;
const RETRYABLE_STATUS_CODES = new Set([408, 409, 425, 429]);
const NON_RETRYABLE_LIMIT_CODES = new Set([
  "credit_balance_exhausted",
  "organization_spend_limit_exceeded",
  "project_spend_limit_exceeded",
  "organization_usage_limit_exceeded",
  "insufficient_quota",
]);

type OpenAiErrorPayload = {
  error?: {
    code?: unknown;
  };
};

export class ArchiveOpenAiTransportError extends Error {
  readonly status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = "ArchiveOpenAiTransportError";
    this.status = status;
  }
}

export class ArchiveOpenAiPayloadError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "ArchiveOpenAiPayloadError";
  }
}

export function archiveProviderFailureReason(
  error: unknown,
): "provider_timeout" | "provider_unavailable" | "provider_invalid_response" {
  if (error instanceof ArchiveOpenAiPayloadError) return "provider_invalid_response";
  if (error instanceof ArchiveOpenAiTransportError && /timed out/iu.test(error.message)) {
    return "provider_timeout";
  }
  return "provider_unavailable";
}

function errorCode(payload: unknown): string | undefined {
  if (!payload || typeof payload !== "object") return undefined;
  const code = (payload as OpenAiErrorPayload).error?.code;
  return typeof code === "string" ? code : undefined;
}

export function isRetryableOpenAiResponse(status: number, payload: unknown): boolean {
  if (!RETRYABLE_STATUS_CODES.has(status) && !(status >= 500 && status <= 599)) return false;
  const code = errorCode(payload);
  return !code || !NON_RETRYABLE_LIMIT_CODES.has(code);
}

export function openAiRetryDelayMs(response: Response, attempt: number): number {
  const retryAfterMs = response.headers.get("retry-after-ms")?.trim();
  if (retryAfterMs) {
    const milliseconds = Number(retryAfterMs);
    if (Number.isFinite(milliseconds) && milliseconds >= 0) {
      return Math.ceil(milliseconds);
    }
  }

  const retryAfter = response.headers.get("retry-after")?.trim();
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds) && seconds >= 0) {
      return Math.ceil(seconds * 1_000);
    }
    const date = Date.parse(retryAfter);
    if (Number.isFinite(date)) {
      return Math.max(0, date - Date.now());
    }
  }
  return Math.min(MAX_BACKOFF_DELAY_MS, 450 * 2 ** attempt + Math.floor(Math.random() * 180));
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
    if (signal.aborted) onAbort();
  });
}

async function waitForNextAttempt(
  delayMs: number,
  deadline: number,
  signal: AbortSignal,
  terminalError: unknown,
): Promise<void> {
  const remainingMs = Math.max(0, deadline - Date.now());
  if (delayMs >= remainingMs) throw terminalError;
  await waitForRetry(delayMs, signal);
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

export async function requestOpenAiStructuredResponse<T>({
  apiKey,
  body,
  timeoutMs,
  signal,
  parse,
}: {
  apiKey: string;
  body: unknown;
  timeoutMs: number;
  signal?: AbortSignal;
  parse: (payload: unknown) => T;
}): Promise<T> {
  const controller = new AbortController();
  const deadline = Date.now() + timeoutMs;
  const abortFromCaller = () => {
    if (controller.signal.aborted) return;
    if (signal?.reason !== undefined) controller.abort(signal.reason);
    else controller.abort();
  };
  if (signal?.aborted) abortFromCaller();
  else signal?.addEventListener("abort", abortFromCaller, { once: true });
  const timeout = setTimeout(
    () => controller.abort(new ArchiveOpenAiTransportError("OpenAI request timed out")),
    timeoutMs,
  );
  let lastError: unknown;
  let payloadRetryUsed = false;

  try {
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
      let response: Response;
      try {
        response = await fetch("https://api.openai.com/v1/responses", {
          method: "POST",
          headers: {
            authorization: `Bearer ${apiKey}`,
            "content-type": "application/json",
            "x-client-request-id": randomUUID(),
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
      } catch (error) {
        if (controller.signal.aborted) throw controller.signal.reason ?? error;
        lastError = error;
        if (attempt === MAX_ATTEMPTS - 1) throw error;
        await waitForNextAttempt(
          450 * 2 ** attempt + Math.floor(Math.random() * 180),
          deadline,
          controller.signal,
          error,
        );
        continue;
      }

      const payload = await readJson(response);
      if (controller.signal.aborted) {
        throw controller.signal.reason ?? new DOMException("Aborted", "AbortError");
      }
      if (!response.ok) {
        const retryable = isRetryableOpenAiResponse(response.status, payload);
        lastError = new ArchiveOpenAiTransportError(
          `OpenAI request failed with ${response.status}`,
          response.status,
        );
        if (!retryable || attempt === MAX_ATTEMPTS - 1) throw lastError;
        console.warn("[archive-ai] retrying transient OpenAI response", {
          attempt: attempt + 1,
          status: response.status,
          requestId: response.headers.get("x-request-id") ?? undefined,
        });
        await waitForNextAttempt(
          openAiRetryDelayMs(response, attempt),
          deadline,
          controller.signal,
          lastError,
        );
        continue;
      }

      if (payload === undefined && attempt === 0) {
        lastError = new ArchiveOpenAiTransportError("OpenAI response was not valid JSON");
        console.warn("[archive-ai] retrying an unreadable OpenAI response", {
          attempt: attempt + 1,
          requestId: response.headers.get("x-request-id") ?? undefined,
        });
        await waitForNextAttempt(300, deadline, controller.signal, lastError);
        continue;
      }
      try {
        return parse(payload);
      } catch (error) {
        lastError = new ArchiveOpenAiPayloadError(
          "OpenAI response did not match the expected structured payload",
          { cause: error },
        );
        if (payloadRetryUsed || attempt === MAX_ATTEMPTS - 1) throw lastError;
        payloadRetryUsed = true;
        console.warn("[archive-ai] retrying one invalid structured response", {
          attempt: attempt + 1,
          requestId: response.headers.get("x-request-id") ?? undefined,
        });
        await waitForNextAttempt(320, deadline, controller.signal, lastError);
      }
    }
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", abortFromCaller);
  }

  throw lastError ?? new ArchiveOpenAiTransportError("OpenAI request failed");
}
