/**
 * Only build-owned, anonymous document shells may enter the shared CDN cache.
 * Gallery/search/auth/API responses are deliberately absent from this list.
 * Personal preferences are restored in the browser, never serialized here.
 */
export const PUBLIC_DOCUMENT_PATHS = new Set([
  "/",
  "/world",
  "/dream-chapter",
  "/saga-cinema",
  "/final-stage",
  "/rexonance-saga",
  "/extreme-saga",
  "/far-from-saga",
  "/illusionculum-saga",
]);

export const PUBLIC_DOCUMENT_CDN_CONTROL = "max-age=60, stale-while-revalidate=300";
export const PUBLIC_DOCUMENT_BROWSER_CONTROL = "public, max-age=0, must-revalidate";

export interface PublicDocumentRequest {
  url: URL;
  req: { method: string; headers: Headers };
}

export function isPublicDocumentRequest(event: PublicDocumentRequest): boolean {
  const headers = event.req.headers;
  return (
    event.req.method.toUpperCase() === "GET" &&
    PUBLIC_DOCUMENT_PATHS.has(event.url.pathname) &&
    event.url.search === "" &&
    // Every cookie is excluded, not just currently known session cookie names.
    !headers.has("cookie") &&
    !headers.has("authorization") &&
    !headers.has("range") &&
    (headers.get("accept") ?? "").toLowerCase().includes("text/html")
  );
}

function forbidsSharedCache(value: string | null): boolean {
  return /(?:^|,)\s*(?:private|no-store|no-cache)(?:\s*(?:=|,|$))/i.test(value ?? "");
}

/** Preserve streaming SSR: change headers without buffering HTML or data. */
export function cachePublicDocumentResponse(response: Response): Response {
  const headers = response.headers;
  if (
    response.status !== 200 ||
    !response.body ||
    response.bodyUsed ||
    response.body.locked ||
    !/^text\/html(?:\s*;|$)/i.test(headers.get("content-type") ?? "") ||
    headers.has("set-cookie") ||
    headers.has("content-disposition") ||
    forbidsSharedCache(headers.get("cache-control")) ||
    forbidsSharedCache(headers.get("cdn-cache-control")) ||
    forbidsSharedCache(headers.get("vercel-cdn-cache-control")) ||
    // Vary on cookies/auth/other request inputs would break the public-shell
    // invariant. Accept-Encoding is the platform's normal compressed variant.
    (headers.get("vary") ?? "")
      .split(",")
      .some((value) => value.trim() && value.trim().toLowerCase() !== "accept-encoding") ||
    /'nonce-/i.test(headers.get("content-security-policy") ?? "") ||
    /'nonce-/i.test(headers.get("content-security-policy-report-only") ?? "")
  ) {
    return response;
  }

  const cachedHeaders = new Headers(headers);
  // Deployment-scoped CDN reuse reduces warm traffic's SSR invocations.
  // Browsers always revalidate, so a newly promoted release is visible at once.
  // https://vercel.com/docs/caching/cache-control-headers
  cachedHeaders.set("cache-control", PUBLIC_DOCUMENT_BROWSER_CONTROL);
  cachedHeaders.set("vercel-cdn-cache-control", PUBLIC_DOCUMENT_CDN_CONTROL);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: cachedHeaders,
  });
}
