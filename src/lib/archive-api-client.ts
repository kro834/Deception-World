import type { ArchiveDeliveryReason } from "./archive-delivery.ts";

export class ArchiveApiClientError extends Error {
  readonly reason: Extract<
    ArchiveDeliveryReason,
    "client_network" | "client_http_4xx" | "client_http_5xx" | "client_invalid_payload"
  >;

  constructor(
    message: string,
    reason: ArchiveApiClientError["reason"],
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "ArchiveApiClientError";
    this.reason = reason;
  }
}

export async function postArchiveApi<T>({
  url,
  client,
  body,
  signal,
  validate,
}: {
  url: "/api/archive-search" | "/api/archive-intelligence";
  client: "search-v1" | "persona-v1";
  body: unknown;
  signal: AbortSignal;
  validate: (payload: unknown) => payload is T;
}): Promise<T> {
  // Generation POSTs are intentionally single-attempt here. If the browser
  // loses an already-completed response, replaying it could charge the shared
  // budget and generate twice. Transient provider failures are retried inside
  // the server boundary, where one browser request and one rate-limit charge
  // remain authoritative.
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      credentials: "same-origin",
      headers: {
        "content-type": "application/json",
        "x-archive-client": client,
      },
      body: JSON.stringify(body),
      signal,
    });
  } catch (error) {
    if (signal.aborted) throw error;
    throw new ArchiveApiClientError("Archive API network request failed", "client_network", {
      cause: error,
    });
  }

  if (!response.ok) {
    throw new ArchiveApiClientError(
      `Archive API request failed with ${response.status}`,
      response.status >= 500 ? "client_http_5xx" : "client_http_4xx",
    );
  }
  let payload: unknown;
  try {
    payload = await response.json();
  } catch (error) {
    throw new ArchiveApiClientError("Archive API response was not JSON", "client_invalid_payload", {
      cause: error,
    });
  }
  if (!validate(payload)) {
    throw new ArchiveApiClientError("Archive API response was invalid", "client_invalid_payload");
  }
  return payload;
}
