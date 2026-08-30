import assert from "node:assert/strict";
import { createCipheriv, randomBytes } from "node:crypto";
import test from "node:test";

import {
  archiveEncryptionKey,
  archivePayloadHash,
  archivePayloadHashes,
  archiveSessionHash,
  archiveSessionHashes,
  canonicalArchiveJson,
  decryptArchiveValue,
  encryptArchiveValue,
} from "../src/lib/archive-ai-crypto.server.ts";

const environment = {
  ARCHIVE_RESULT_ENCRYPTION_KEY: "11".repeat(32),
  ARCHIVE_RATE_LIMIT_SECRET: "archive-crypto-test-secret-that-is-at-least-32-bytes",
  NODE_ENV: "test",
};

const requestContext = {
  requestId: "00000000-0000-4000-8000-000000000001",
  sessionHash: "a".repeat(64),
  purpose: "request",
};

const rotatedEnvironment = {
  ...environment,
  ARCHIVE_RESULT_ENCRYPTION_KEY: "22".repeat(32),
  ARCHIVE_RESULT_ENCRYPTION_KEY_PREVIOUS: JSON.stringify([
    environment.ARCHIVE_RESULT_ENCRYPTION_KEY,
  ]),
  ARCHIVE_RATE_LIMIT_SECRET: "rotated-archive-crypto-secret-that-is-at-least-32-bytes",
  ARCHIVE_RATE_LIMIT_SECRET_PREVIOUS: environment.ARCHIVE_RATE_LIMIT_SECRET,
};

function legacyCiphertext(value) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", archiveEncryptionKey(environment), iv);
  const plaintext = Buffer.from(canonicalArchiveJson(value), "utf8");
  const data = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return JSON.stringify({
    version: 1,
    iv: iv.toString("base64url"),
    tag: cipher.getAuthTag().toString("base64url"),
    data: data.toString("base64url"),
  });
}

function boundCiphertext(value) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", archiveEncryptionKey(environment), iv);
  cipher.setAAD(
    Buffer.from(
      canonicalArchiveJson({
        domain: "archive-ai-ledger",
        version: 2,
        purpose: requestContext.purpose,
        requestId: requestContext.requestId,
        sessionHash: requestContext.sessionHash,
      }),
      "utf8",
    ),
  );
  const plaintext = Buffer.from(canonicalArchiveJson(value), "utf8");
  const data = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return JSON.stringify({
    version: 2,
    iv: iv.toString("base64url"),
    tag: cipher.getAuthTag().toString("base64url"),
    data: data.toString("base64url"),
  });
}

test("new keyed archive ciphertext is bound to request, session, and purpose", () => {
  const value = { answer: "bound", nested: { order: 1 } };
  const encrypted = encryptArchiveValue(value, requestContext, environment);

  assert.equal(JSON.parse(encrypted).version, 3);
  assert.match(JSON.parse(encrypted).keyId, /^[A-Za-z0-9_-]{16}$/u);
  assert.deepEqual(decryptArchiveValue(encrypted, requestContext, environment), value);

  for (const wrongContext of [
    { ...requestContext, requestId: "00000000-0000-4000-8000-000000000002" },
    { ...requestContext, sessionHash: "b".repeat(64) },
    { ...requestContext, purpose: "result" },
  ]) {
    assert.throws(() => decryptArchiveValue(encrypted, wrongContext, environment));
  }
  assert.throws(
    () => decryptArchiveValue(encrypted, undefined, environment),
    /archive_encryption_context_required/,
  );
});

test("request and result ciphertext cannot be interchanged in the same ledger row", () => {
  const resultContext = { ...requestContext, purpose: "result" };
  const encryptedRequest = encryptArchiveValue({ prompt: "private" }, requestContext, environment);
  const encryptedResult = encryptArchiveValue({ reply: "private" }, resultContext, environment);

  assert.throws(() => decryptArchiveValue(encryptedRequest, resultContext, environment));
  assert.throws(() => decryptArchiveValue(encryptedResult, requestContext, environment));
});

test("version 1 ciphertext remains readable during the 24-hour compatibility window", () => {
  const value = { legacy: true };
  const encrypted = legacyCiphertext(value);

  assert.deepEqual(decryptArchiveValue(encrypted, requestContext, environment), value);
  assert.deepEqual(decryptArchiveValue(encrypted, undefined, environment), value);
});

test("active and retained encryption keys bridge a rotation without weakening new writes", () => {
  const value = { rotation: "survives" };
  const oldEncrypted = encryptArchiveValue(value, requestContext, environment);
  const newEncrypted = encryptArchiveValue(value, requestContext, rotatedEnvironment);

  assert.deepEqual(decryptArchiveValue(oldEncrypted, requestContext, rotatedEnvironment), value);
  assert.deepEqual(decryptArchiveValue(newEncrypted, requestContext, rotatedEnvironment), value);
  assert.notEqual(JSON.parse(oldEncrypted).keyId, JSON.parse(newEncrypted).keyId);
  assert.throws(
    () => decryptArchiveValue(newEncrypted, requestContext, environment),
    /archive_encryption_key_unavailable/,
  );
});

test("pre-key-id version 1 and 2 rows try retained keys during rotation", () => {
  const value = { compatibility: "24h" };
  assert.deepEqual(
    decryptArchiveValue(legacyCiphertext(value), undefined, rotatedEnvironment),
    value,
  );
  assert.deepEqual(
    decryptArchiveValue(boundCiphertext(value), requestContext, rotatedEnvironment),
    value,
  );
});

test("session ownership and idempotency hashes include active and retained HMAC keys", () => {
  const sessionId = "00000000-0000-4000-8000-000000000099";
  const payload = { query: "same logical payload", nested: { stable: true } };
  const sessionCandidates = archiveSessionHashes(sessionId, rotatedEnvironment);
  const payloadCandidates = archivePayloadHashes(payload, rotatedEnvironment);

  assert.equal(sessionCandidates[0], archiveSessionHash(sessionId, rotatedEnvironment));
  assert.ok(sessionCandidates.includes(archiveSessionHash(sessionId, environment)));
  assert.equal(payloadCandidates[0], archivePayloadHash(payload, rotatedEnvironment));
  assert.ok(payloadCandidates.includes(archivePayloadHash(payload, environment)));
  assert.equal(new Set(sessionCandidates).size, sessionCandidates.length);
  assert.equal(new Set(payloadCandidates).size, payloadCandidates.length);
});

test("invalid retained keys fail closed instead of silently shrinking the keyring", () => {
  assert.throws(
    () =>
      encryptArchiveValue({ unsafe: true }, requestContext, {
        ...environment,
        ARCHIVE_RESULT_ENCRYPTION_KEY_PREVIOUS: "not-a-32-byte-key",
      }),
    /ARCHIVE_RESULT_ENCRYPTION_KEY_PREVIOUS/,
  );
  assert.throws(
    () =>
      archiveSessionHashes("00000000-0000-4000-8000-000000000099", {
        ...environment,
        ARCHIVE_RATE_LIMIT_SECRET_PREVIOUS: "short",
      }),
    /ARCHIVE_RATE_LIMIT_SECRET_PREVIOUS/,
  );
});
