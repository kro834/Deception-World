// Read-only policy for all HTTP requests in the probe context.
export function requestAllowed(method, url, navigation, baseOrigin) {
  if (method !== "GET" && method !== "HEAD") return false;
  if (!navigation) return true;
  try {
    return new URL(url).origin === baseOrigin;
  } catch {
    return false;
  }
}
