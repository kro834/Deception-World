import { createHmac, randomBytes } from "node:crypto";
import {
  archiveRateLimitSecretKeyring,
  archiveSecretsEqual,
  type ArchiveSecretKey,
} from "./archive-ai-crypto.server.ts";

const ARCHIVE_AI_IDENTITY_COOKIE = "__Host-archive_ai_identity";
const ARCHIVE_AI_IDENTITY_VERSION = "v2";
const ARCHIVE_AI_IDENTITY_MAX_AGE_SECONDS = 365 * 24 * 60 * 60;
const LEGACY_COOKIE_VALUE_PATTERN = /^v1\.([A-Za-z0-9_-]{32})\.([A-Za-z0-9_-]{43})$/u;
const KEYED_COOKIE_VALUE_PATTERN =
  /^v2\.([A-Za-z0-9_-]{16})\.([A-Za-z0-9_-]{32})\.([A-Za-z0-9_-]{43})$/u;

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

function verifiedIdentity(
  request: Request,
  keyring: ArchiveSecretKey<string>[],
): { nonce: string; secret: string } | undefined {
  const value = requestCookie(request);
  const keyed = value?.match(KEYED_COOKIE_VALUE_PATTERN);
  if (keyed) {
    const candidate = keyring.find((key) => key.id === keyed[1]);
    if (!candidate) return undefined;
    const unsigned = `${ARCHIVE_AI_IDENTITY_VERSION}.${keyed[1]}.${keyed[2]}`;
    return archiveSecretsEqual(signature(unsigned, candidate.value), keyed[3])
      ? { nonce: keyed[2], secret: candidate.value }
      : undefined;
  }
  const legacy = value?.match(LEGACY_COOKIE_VALUE_PATTERN);
  if (!legacy) return undefined;
  const unsigned = `v1.${legacy[1]}`;
  const candidate = keyring.find((key) =>
    archiveSecretsEqual(signature(unsigned, key.value), legacy[2]),
  );
  return candidate ? { nonce: legacy[1], secret: candidate.value } : undefined;
}

function newCookieIdentity(active: ArchiveSecretKey<string>): ArchiveAiCookieIdentity {
  const nonce = randomBytes(24).toString("base64url");
  const unsigned = `${ARCHIVE_AI_IDENTITY_VERSION}.${active.id}.${nonce}`;
  const value = `${unsigned}.${signature(unsigned, active.value)}`;
  return {
    rateLimitHash: rateLimitHash(nonce, active.value),
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
  const keyring = archiveRateLimitSecretKeyring(environment);
  const identity = verifiedIdentity(request, keyring);
  return identity
    ? { rateLimitHash: rateLimitHash(identity.nonce, identity.secret) }
    : newCookieIdentity(keyring[0]);
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
