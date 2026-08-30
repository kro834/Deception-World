import { pathToFileURL } from "node:url";

export function assertProductionArchiveAiEnvironment(environment = process.env) {
  const required =
    environment.VERCEL_ENV === "production" || environment.ARCHIVE_AI_REQUIRED === "1";
  if (!required) {
    return { required: false, configured: Boolean(environment.OPENAI_API_KEY?.trim()) };
  }
  const failures = [];
  const apiKey = environment.OPENAI_API_KEY?.trim() ?? "";
  if (!/^sk-[A-Za-z0-9_-]{16,}$/u.test(apiKey)) {
    failures.push("OPENAI_API_KEY must be a non-empty OpenAI secret key");
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
  const encryptionKey = environment.ARCHIVE_RESULT_ENCRYPTION_KEY?.trim() ?? "";
  let encryptionKeyValid = /^[0-9a-f]{64}$/iu.test(encryptionKey);
  if (!encryptionKeyValid) {
    try {
      encryptionKeyValid =
        Buffer.from(encryptionKey.replace(/-/gu, "+").replace(/_/gu, "/"), "base64").length === 32;
    } catch {
      encryptionKeyValid = false;
    }
  }
  if (!encryptionKeyValid) {
    failures.push("ARCHIVE_RESULT_ENCRYPTION_KEY must decode to exactly 32 bytes");
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
