import assert from "node:assert/strict";
import test from "node:test";
import { assertProductionArchiveAiEnvironment } from "./assert-production-ai-env.mjs";

const validProduction = {
  VERCEL: "1",
  VERCEL_ENV: "production",
  OPENAI_API_KEY: "sk-proj-" + "production-test-secret-123456789",
  DATABASE_URL: "postgresql://archive:secret@example.test/archive",
  ARCHIVE_AI_REQUIRED: "1",
  ARCHIVE_RATE_LIMIT_SECRET: "rate-limit-secret-with-at-least-32-bytes",
  ARCHIVE_RESULT_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64"),
  ARCHIVE_MONITOR_TOKEN: "monitor-token-with-at-least-32-random-bytes",
};

test("production AI environment check does not block local, CI, or Vercel Preview builds", () => {
  for (const environment of [
    {},
    { CI: "true" },
    { VERCEL: "1", VERCEL_ENV: "preview" },
    { VERCEL: "1", VERCEL_ENV: "development" },
  ]) {
    assert.deepEqual(assertProductionArchiveAiEnvironment(environment), {
      required: false,
      configured: false,
    });
  }
});

test("production AI environment check rejects every missing required setting without leaking values", () => {
  for (const name of [
    "OPENAI_API_KEY",
    "DATABASE_URL",
    "ARCHIVE_AI_REQUIRED",
    "ARCHIVE_RATE_LIMIT_SECRET",
    "ARCHIVE_RESULT_ENCRYPTION_KEY",
    "ARCHIVE_MONITOR_TOKEN",
  ]) {
    const environment = { ...validProduction, [name]: "" };
    assert.throws(
      () => assertProductionArchiveAiEnvironment(environment),
      (error) => {
        assert.match(error.message, new RegExp(name));
        assert.doesNotMatch(error.message, /sk-proj-production|archive:secret/);
        return true;
      },
    );
  }
});

test("production AI environment check validates formats", () => {
  for (const environment of [
    { ...validProduction, OPENAI_API_KEY: "not-a-key" },
    { ...validProduction, DATABASE_URL: "https://example.test" },
    { ...validProduction, ARCHIVE_RESULT_ENCRYPTION_KEY: "too-short" },
  ]) {
    assert.throws(() => assertProductionArchiveAiEnvironment(environment));
  }
});

test("production AI environment check accepts a complete configuration without returning secrets", () => {
  const result = assertProductionArchiveAiEnvironment(validProduction);
  assert.deepEqual(result, { required: true, configured: true });
  assert.doesNotMatch(JSON.stringify(result), /sk-proj|archive:secret|monitor-token/);
});

test("production AI environment check accepts valid retained keyrings", () => {
  assert.deepEqual(
    assertProductionArchiveAiEnvironment({
      ...validProduction,
      ARCHIVE_RATE_LIMIT_SECRET_PREVIOUS: JSON.stringify([
        "previous-rate-secret-with-at-least-32-random-bytes",
        "older-rate-secret-with-at-least-32-random-bytes",
      ]),
      ARCHIVE_RESULT_ENCRYPTION_KEY_PREVIOUS: [
        Buffer.alloc(32, 5).toString("base64url"),
        "44".repeat(32),
      ].join(","),
    }),
    { required: true, configured: true },
  );
});

test("production AI environment check rejects malformed retained keyrings", () => {
  for (const environment of [
    { ...validProduction, ARCHIVE_RATE_LIMIT_SECRET_PREVIOUS: '["short"]' },
    { ...validProduction, ARCHIVE_RATE_LIMIT_SECRET_PREVIOUS: "[not-json" },
    { ...validProduction, ARCHIVE_RESULT_ENCRYPTION_KEY_PREVIOUS: "too-short" },
    { ...validProduction, ARCHIVE_RESULT_ENCRYPTION_KEY_PREVIOUS: '["also-too-short"]' },
  ]) {
    assert.throws(
      () => assertProductionArchiveAiEnvironment(environment),
      /(?:ARCHIVE_RATE_LIMIT_SECRET_PREVIOUS|ARCHIVE_RESULT_ENCRYPTION_KEY_PREVIOUS)/u,
    );
  }
});
