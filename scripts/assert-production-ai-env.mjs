import { pathToFileURL } from "node:url";

function previousValues(value, name, failures) {
  const trimmed = value?.trim();
  if (!trimmed) return [];
  if (!trimmed.startsWith("[")) {
    return trimmed
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }
  try {
    const parsed = JSON.parse(trimmed);
    if (!Array.isArray(parsed) || parsed.some((item) => typeof item !== "string" || !item.trim())) {
      throw new Error();
    }
    return parsed.map((item) => item.trim());
  } catch {
    failures.push(`${name} must be a string or JSON array of strings`);
    return [];
  }
}

function validEncryptionKey(value) {
  if (/^[0-9a-f]{64}$/iu.test(value)) return true;
  try {
    return Buffer.from(value.replace(/-/gu, "+").replace(/_/gu, "/"), "base64").length === 32;
  } catch {
    return false;
  }
}

export function assertProductionArchiveAiEnvironment(environment = process.env) {
  const required =
    environment.VERCEL_ENV === "production" || environment.ARCHIVE_AI_REQUIRED === "1";
  if (!required) {
    return {
      required: false,
      configured: Boolean(environment.XAI_API_KEY?.trim() || environment.OPENAI_API_KEY?.trim()),
    };
  }
  const failures = [];
  const openaiKey = environment.OPENAI_API_KEY?.trim() ?? "";
  const xaiKey = environment.XAI_API_KEY?.trim() ?? "";
  const openaiOk = /^sk-[A-Za-z0-9_-]{16,}$/u.test(openaiKey);
  const xaiOk = /^xai-[A-Za-z0-9_-]{16,}$/u.test(xaiKey);
  if (!openaiOk && !xaiOk) {
    failures.push("XAI_API_KEY or OPENAI_API_KEY must be a valid remote inference key");
  }
  const databaseUrl = environment.DATABASE_URL?.trim() ?? "";
  try {
    const parsed = new URL(databaseUrl);
    if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") throw new Error();
  } catch {
    failures.push("DATABASE_URL must be a valid postgres:// or postgresql:// URL");
  }
  if (environment.ARCHIVE_AI_REQUIRED !== "1") {
    failures.push("ARCHIVE_AI_REQUIRED must equal 1");
  }
  if (Buffer.byteLength(environment.ARCHIVE_RATE_LIMIT_SECRET?.trim() ?? "") < 32) {
    failures.push("ARCHIVE_RATE_LIMIT_SECRET must contain at least 32 bytes");
  }
  const previousRateLimitSecrets = previousValues(
    environment.ARCHIVE_RATE_LIMIT_SECRET_PREVIOUS,
    "ARCHIVE_RATE_LIMIT_SECRET_PREVIOUS",
    failures,
  );
  if (previousRateLimitSecrets.some((value) => Buffer.byteLength(value) < 32)) {
    failures.push("ARCHIVE_RATE_LIMIT_SECRET_PREVIOUS entries must contain at least 32 bytes");
  }
  const encryptionKey = environment.ARCHIVE_RESULT_ENCRYPTION_KEY?.trim() ?? "";
  if (!validEncryptionKey(encryptionKey)) {
    failures.push("ARCHIVE_RESULT_ENCRYPTION_KEY must decode to exactly 32 bytes");
  }
  const previousEncryptionKeys = previousValues(
    environment.ARCHIVE_RESULT_ENCRYPTION_KEY_PREVIOUS,
    "ARCHIVE_RESULT_ENCRYPTION_KEY_PREVIOUS",
    failures,
  );
  if (previousEncryptionKeys.some((value) => !validEncryptionKey(value))) {
    failures.push("ARCHIVE_RESULT_ENCRYPTION_KEY_PREVIOUS entries must decode to exactly 32 bytes");
  }
  if (Buffer.byteLength(environment.ARCHIVE_MONITOR_TOKEN?.trim() ?? "") < 32) {
    failures.push("ARCHIVE_MONITOR_TOKEN must contain at least 32 bytes");
  }
  if (failures.length) {
    throw new Error(`Production Archive AI environment is invalid: ${failures.join("; ")}`);
  }
  return { required: true, configured: true };
}

const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectRun) {
  try {
    const result = assertProductionArchiveAiEnvironment();
    console.log(
      result.required
        ? "Archive AI Production environment is configured."
        : "Archive AI Production environment check skipped outside Vercel Production.",
    );
  } catch (error) {
    console.error(
      `Archive AI Production environment check failed: ${error instanceof Error ? error.message : "unknown error"}`,
    );
    process.exitCode = 1;
  }
}
