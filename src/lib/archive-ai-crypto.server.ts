import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import {
  ARCHIVE_AI_REQUEST_ID_PATTERN,
  ARCHIVE_AI_SESSION_ID_PATTERN,
} from "./archive-ai-request.ts";

type LegacyEncryptedArchiveValue = {
  version: 1;
  iv: string;
  tag: string;
  data: string;
};

type BoundEncryptedArchiveValue = {
  version: 2;
  iv: string;
  tag: string;
  data: string;
};

type KeyedEncryptedArchiveValue = {
  version: 3;
  keyId: string;
  iv: string;
  tag: string;
  data: string;
};

type EncryptedArchiveValue =
  LegacyEncryptedArchiveValue | BoundEncryptedArchiveValue | KeyedEncryptedArchiveValue;

export type ArchiveSecretKey<T> = {
  id: string;
  value: T;
};

export type ArchiveEncryptionPurpose = "request" | "result" | "health";

export type ArchiveEncryptionContext = {
  requestId: string;
  sessionHash: string;
  purpose: ArchiveEncryptionPurpose;
};

function productionRequired(environment: NodeJS.ProcessEnv): boolean {
  return (
    environment.ARCHIVE_AI_REQUIRED === "1" ||
    environment.VERCEL_ENV === "production" ||
    environment.NODE_ENV === "production"
  );
}

function decodeKey(value: string): Buffer | null {
  const trimmed = value.trim();
  if (/^[0-9a-f]{64}$/iu.test(trimmed)) return Buffer.from(trimmed, "hex");
  try {
    const decoded = Buffer.from(trimmed.replace(/-/gu, "+").replace(/_/gu, "/"), "base64");
    return decoded.length === 32 ? decoded : null;
  } catch {
    return null;
  }
}

function previousSecretValues(value: string | undefined, name: string): string[] {
  const trimmed = value?.trim();
  if (!trimmed) return [];
  if (trimmed.startsWith("[")) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed) as unknown;
    } catch {
      throw new Error(`${name} must be a string or JSON array of strings`);
    }
    if (!Array.isArray(parsed) || parsed.some((item) => typeof item !== "string" || !item.trim())) {
      throw new Error(`${name} must be a string or JSON array of strings`);
    }
    return parsed.map((item) => item.trim());
  }
  return trimmed
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function secretKeyId(domain: "encryption" | "rate-limit", value: string | Buffer): string {
  return createHash("sha256")
    .update(`archive-ai-${domain}-key-id\0`)
    .update(value)
    .digest()
    .subarray(0, 12)
    .toString("base64url");
}

function uniqueKeyring<T>(keys: ArchiveSecretKey<T>[]): ArchiveSecretKey<T>[] {
  const seen = new Map<string, T>();
  return keys.filter((key) => {
    if (!seen.has(key.id)) {
      seen.set(key.id, key.value);
      return true;
    }
    const existing = seen.get(key.id);
    const sameValue =
      Buffer.isBuffer(existing) && Buffer.isBuffer(key.value)
        ? existing.equals(key.value)
        : existing === key.value;
    if (!sameValue) throw new Error("archive_secret_key_id_collision");
    // Repeating the same key in the previous list is harmless but unnecessary.
    return false;
  });
}

export function archiveRateLimitSecret(environment: NodeJS.ProcessEnv = process.env): string {
  const configured = environment.ARCHIVE_RATE_LIMIT_SECRET?.trim();
  if (configured && Buffer.byteLength(configured) >= 32) return configured;
  if (productionRequired(environment)) {
    throw new Error("ARCHIVE_RATE_LIMIT_SECRET must contain at least 32 bytes");
  }
  return `archive-local-rate-secret:${environment.OPENAI_API_KEY?.trim() || "development"}`;
}

export function archiveRateLimitSecretKeyring(
  environment: NodeJS.ProcessEnv = process.env,
): ArchiveSecretKey<string>[] {
  const active = archiveRateLimitSecret(environment);
  const previous = previousSecretValues(
    environment.ARCHIVE_RATE_LIMIT_SECRET_PREVIOUS,
    "ARCHIVE_RATE_LIMIT_SECRET_PREVIOUS",
  );
  for (const secret of previous) {
    if (Buffer.byteLength(secret) < 32) {
      throw new Error("ARCHIVE_RATE_LIMIT_SECRET_PREVIOUS entries must contain at least 32 bytes");
    }
  }
  return uniqueKeyring(
    [active, ...previous].map((value) => ({
      id: secretKeyId("rate-limit", value),
      value,
    })),
  );
}

export function archiveEncryptionKey(environment: NodeJS.ProcessEnv = process.env): Buffer {
  const configured = environment.ARCHIVE_RESULT_ENCRYPTION_KEY?.trim();
  if (configured) {
    const decoded = decodeKey(configured);
    if (decoded) return decoded;
    throw new Error(
      "ARCHIVE_RESULT_ENCRYPTION_KEY must be a 32-byte base64 or 64-character hex key",
    );
  }
  if (productionRequired(environment)) {
    throw new Error("ARCHIVE_RESULT_ENCRYPTION_KEY is required");
  }
  return createHash("sha256")
    .update(`archive-local-ledger:${environment.OPENAI_API_KEY?.trim() || "development"}`)
    .digest();
}

export function archiveEncryptionKeyring(
  environment: NodeJS.ProcessEnv = process.env,
): ArchiveSecretKey<Buffer>[] {
  const active = archiveEncryptionKey(environment);
  const previous = previousSecretValues(
    environment.ARCHIVE_RESULT_ENCRYPTION_KEY_PREVIOUS,
    "ARCHIVE_RESULT_ENCRYPTION_KEY_PREVIOUS",
  ).map((value) => {
    const decoded = decodeKey(value);
    if (!decoded) {
      throw new Error(
        "ARCHIVE_RESULT_ENCRYPTION_KEY_PREVIOUS entries must be 32-byte base64 or 64-character hex keys",
      );
    }
    return decoded;
  });
  return uniqueKeyring(
    [active, ...previous].map((value) => ({
      id: secretKeyId("encryption", value),
      value,
    })),
  );
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, canonicalize(item)]),
  );
}

export function canonicalArchiveJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

export function archivePayloadHash(
  value: unknown,
  environment: NodeJS.ProcessEnv = process.env,
): string {
  return createHmac("sha256", archiveRateLimitSecret(environment))
    .update(canonicalArchiveJson(value))
    .digest("hex");
}

export function archivePayloadHashes(
  value: unknown,
  environment: NodeJS.ProcessEnv = process.env,
): string[] {
  const canonical = canonicalArchiveJson(value);
  return archiveRateLimitSecretKeyring(environment).map(({ value: secret }) =>
    createHmac("sha256", secret).update(canonical).digest("hex"),
  );
}

export function archiveSessionHash(
  sessionId: string,
  environment: NodeJS.ProcessEnv = process.env,
): string {
  if (!ARCHIVE_AI_SESSION_ID_PATTERN.test(sessionId)) throw new Error("invalid_archive_session");
  return createHmac("sha256", archiveRateLimitSecret(environment)).update(sessionId).digest("hex");
}

export function archiveSessionHashes(
  sessionId: string,
  environment: NodeJS.ProcessEnv = process.env,
): string[] {
  if (!ARCHIVE_AI_SESSION_ID_PATTERN.test(sessionId)) throw new Error("invalid_archive_session");
  return archiveRateLimitSecretKeyring(environment).map(({ value: secret }) =>
    createHmac("sha256", secret).update(sessionId).digest("hex"),
  );
}

export function readArchiveRequestIdentity(
  request: Request,
  environment: NodeJS.ProcessEnv = process.env,
): { requestId: string; sessionHash: string; sessionHashes: string[] } {
  const requestId = request.headers.get("x-archive-request-id")?.trim().toLowerCase() ?? "";
  const sessionId = request.headers.get("x-archive-session-id")?.trim().toLowerCase() ?? "";
  if (!ARCHIVE_AI_REQUEST_ID_PATTERN.test(requestId)) throw new Error("invalid_archive_request_id");
  const sessionHashes = archiveSessionHashes(sessionId, environment);
  return { requestId, sessionHash: sessionHashes[0], sessionHashes };
}

function archiveEncryptionAad(
  context: ArchiveEncryptionContext,
  version: 2 | 3,
  keyId?: string,
): Buffer {
  if (
    !context.requestId ||
    context.requestId.length > 160 ||
    !context.sessionHash ||
    context.sessionHash.length > 160 ||
    !["request", "result", "health"].includes(context.purpose)
  ) {
    throw new Error("invalid_archive_encryption_context");
  }
  return Buffer.from(
    canonicalArchiveJson({
      domain: "archive-ai-ledger",
      version,
      ...(keyId ? { keyId } : {}),
      purpose: context.purpose,
      requestId: context.requestId,
      sessionHash: context.sessionHash,
    }),
    "utf8",
  );
}

export function encryptArchiveValue(
  value: unknown,
  context: ArchiveEncryptionContext,
  environment: NodeJS.ProcessEnv = process.env,
): string {
  const iv = randomBytes(12);
  const activeKey = archiveEncryptionKeyring(environment)[0];
  const cipher = createCipheriv("aes-256-gcm", activeKey.value, iv);
  cipher.setAAD(archiveEncryptionAad(context, 3, activeKey.id));
  const plaintext = Buffer.from(canonicalArchiveJson(value), "utf8");
  const data = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const payload: EncryptedArchiveValue = {
    version: 3,
    keyId: activeKey.id,
    iv: iv.toString("base64url"),
    tag: cipher.getAuthTag().toString("base64url"),
    data: data.toString("base64url"),
  };
  return JSON.stringify(payload);
}

export function decryptArchiveValue<T>(
  encrypted: string,
  context?: ArchiveEncryptionContext,
  environment: NodeJS.ProcessEnv = process.env,
): T {
  const parsed = JSON.parse(encrypted) as Partial<EncryptedArchiveValue>;
  if (
    (parsed.version !== 1 && parsed.version !== 2 && parsed.version !== 3) ||
    typeof parsed.iv !== "string" ||
    typeof parsed.tag !== "string" ||
    typeof parsed.data !== "string"
  ) {
    throw new Error("invalid_archive_ciphertext");
  }
  const expectedTag = Buffer.from(parsed.tag, "base64url");
  if (expectedTag.length !== 16) throw new Error("invalid_archive_ciphertext");
  if (parsed.version === 2 || parsed.version === 3) {
    if (!context) throw new Error("archive_encryption_context_required");
  }
  if (parsed.version === 3 && (typeof parsed.keyId !== "string" || !parsed.keyId)) {
    throw new Error("invalid_archive_ciphertext");
  }
  const keyring = archiveEncryptionKeyring(environment);
  const candidates =
    parsed.version === 3 ? keyring.filter((key) => key.id === parsed.keyId) : keyring;
  if (!candidates.length) throw new Error("archive_encryption_key_unavailable");
  for (const candidate of candidates) {
    try {
      const decipher = createDecipheriv(
        "aes-256-gcm",
        candidate.value,
        Buffer.from(parsed.iv, "base64url"),
      );
      if (parsed.version === 2) decipher.setAAD(archiveEncryptionAad(context!, 2));
      if (parsed.version === 3) {
        decipher.setAAD(archiveEncryptionAad(context!, 3, parsed.keyId));
      }
      decipher.setAuthTag(expectedTag);
      const plaintext = Buffer.concat([
        decipher.update(Buffer.from(parsed.data, "base64url")),
        decipher.final(),
      ]).toString("utf8");
      return JSON.parse(plaintext) as T;
    } catch {
      // Version 1 and 2 rows predate key IDs, so each retained key must be tried.
    }
  }
  throw new Error("invalid_archive_ciphertext");
}

export function archiveSecretsEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}
