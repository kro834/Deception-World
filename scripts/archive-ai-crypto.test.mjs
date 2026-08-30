import assert from "node:assert/strict";
import { createCipheriv, randomBytes } from "node:crypto";
import test from "node:test";

import {
  archiveEncryptionKey,
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

test("new archive ciphertext is bound to request, session, and purpose", () => {
  const value = { answer: "bound", nested: { order: 1 } };
  const encrypted = encryptArchiveValue(value, requestContext, environment);

  assert.equal(JSON.parse(encrypted).version, 2);
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
