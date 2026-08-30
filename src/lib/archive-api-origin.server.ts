export type ArchiveBrowserClient = "search-v1" | "persona-v1";

function firstHeaderValue(value: string | null): string {
  return value?.split(",")[0]?.trim() ?? "";
}

function normalizedHttpOrigin(value: string): string | null {
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
    if (parsed.username || parsed.password) return null;
    return parsed.origin;
  } catch {
    return null;
  }
}

function proxiedOrigin(request: Request, hostHeader: string | null): string | null {
  const host = firstHeaderValue(hostHeader);
  if (!host || /[\\/?#@\s]/u.test(host)) return null;

  const browserOrigin = normalizedHttpOrigin(request.headers.get("origin") ?? "");
  const browserProtocol = browserOrigin ? new URL(browserOrigin).protocol : null;
  const requestProtocol = normalizedHttpOrigin(request.url) ? new URL(request.url).protocol : null;
  const forwardedProtocol = firstHeaderValue(request.headers.get("x-forwarded-proto"));
  const protocol =
    forwardedProtocol === "https" || forwardedProtocol === "http"
      ? `${forwardedProtocol}:`
      : (browserProtocol ?? requestProtocol);
  if (!protocol) return null;
  return normalizedHttpOrigin(`${protocol}//${host}`);
}

/**
 * Accept only this page's same-origin browser POSTs. Reverse proxies can expose
 * an internal `request.url`, so compare the browser Origin with both that URL
 * and the sanitized public host forwarded by the hosting edge.
 */
export function isAllowedArchiveBrowserRequest(
  request: Request,
  expectedClient: ArchiveBrowserClient,
): boolean {
  const origin = normalizedHttpOrigin(request.headers.get("origin") ?? "");
  if (request.headers.get("x-archive-client") !== expectedClient) return false;

  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite && fetchSite !== "same-origin") return false;

  if (!origin) return request.method === "GET" && fetchSite === "same-origin";

  const acceptedOrigins = new Set<string>();
  const directOrigin = normalizedHttpOrigin(request.url);
  if (directOrigin) acceptedOrigins.add(directOrigin);
  for (const hostHeader of [request.headers.get("x-forwarded-host"), request.headers.get("host")]) {
    const candidate = proxiedOrigin(request, hostHeader);
    if (candidate) acceptedOrigins.add(candidate);
  }
  if (acceptedOrigins.has(origin)) return true;

  // Some managed front doors intentionally hide the public host from the
  // function. In a real browser, Fetch Metadata is the reliable signal in
  // that case: scripts cannot forge `Sec-Fetch-Site: same-origin`. The route's
  // server middleware performs the same sibling/cross-site isolation check.
  return fetchSite === "same-origin";
}
