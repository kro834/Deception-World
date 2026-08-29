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
  const response = await fetch(url, {
    method: "POST",
    credentials: "same-origin",
    headers: {
      "content-type": "application/json",
      "x-archive-client": client,
    },
    body: JSON.stringify(body),
    signal,
  });

  if (!response.ok) throw new Error(`Archive API request failed with ${response.status}`);
  const payload: unknown = await response.json();
  if (!validate(payload)) throw new Error("Archive API response was invalid");
  return payload;
}
