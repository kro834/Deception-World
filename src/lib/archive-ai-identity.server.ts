import { createHmac, randomBytes } from "node:crypto";
import { archiveRateLimitSecret, archiveSecretsEqual } from "./archive-ai-crypto.server.ts";

const ARCHIVE_AI_IDENTITY_COOKIE = "__Host-archive_ai_identity";
const ARCHIVE_AI_IDENTITY_VERSION = "v1";
const ARCHIVE_AI_IDENTITY_MAX_AGE_SECONDS = 365 * 24 * 60 * 60;
const COOKIE_VALUE_PATTERN = /^v1\.([A-Za-z0-9_-]{32})\.([A-Za-z0-9_-]{43})$/u;

export type ArchiveAiCookieIdentity = {
  rateLimitHash: string;
  setCookie?: string;
};

function signature(value: string, secret: string): string {
  return createHmac("sha256", secret).update(value).digest("base64url");
}

function rateLimitHash(nonce: string, secret: string): string {
  return createHmac("sha256", secret).update(`archive-ai-rate:${nonce}`).digest("hex");
}

function requestCookie(request: Request): string | undefined {
  const header = request.headers.get("cookie");
  if (!header || header.length > 16_384) return undefined;
  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0) continue;
    if (part.slice(0, separator).trim() !== ARCHIVE_AI_IDENTITY_COOKIE) continue;
    return part.slice(separator + 1).trim();
  }
  return undefined;
}

function verifiedNonce(request: Request, secret: string): string | undefined {
  const match = requestCookie(request)?.match(COOKIE_VALUE_PATTERN);
  if (!match) return undefined;
  const unsigned = `${ARCHIVE_AI_IDENTITY_VERSION}.${match[1]}`;
  return archiveSecretsEqual(signature(unsigned, secret), match[2]) ? match[1] : undefined;
}

function newCookieIdentity(secret: string): ArchiveAiCookieIdentity {
  const nonce = randomBytes(24).toString("base64url");
  const unsigned = `${ARCHIVE_AI_IDENTITY_VERSION}.${nonce}`;
  const value = `${unsigned}.${signature(unsigned, secret)}`;
  return {
    rateLimitHash: rateLimitHash(nonce, secret),
    setCookie: `${ARCHIVE_AI_IDENTITY_COOKIE}=${value}; Path=/; Max-Age=${ARCHIVE_AI_IDENTITY_MAX_AGE_SECONDS}; HttpOnly; Secure; SameSite=Lax`,
  };
}

/**
 * Resolve the server-issued identity used only for rate limiting and OpenAI's
 * safety identifier. The browser session header remains the ledger ownership
 * key for backwards-compatible recovery, but cannot mint this identity.
 */
export function resolveArchiveAiCookieIdentity(
  request: Request,
  environment: NodeJS.ProcessEnv = process.env,
): ArchiveAiCookieIdentity {
  const secret = archiveRateLimitSecret(environment);
  const nonce = verifiedNonce(request, secret);
  return nonce ? { rateLimitHash: rateLimitHash(nonce, secret) } : newCookieIdentity(secret);
}

/** Add a freshly issued identity cookie without changing the response body. */
export function attachArchiveAiIdentityCookie(
  response: Response,
  identity: ArchiveAiCookieIdentity,
): Response {
  if (!identity.setCookie) return response;
  const headers = new Headers(response.headers);
  headers.append("set-cookie", identity.setCookie);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
