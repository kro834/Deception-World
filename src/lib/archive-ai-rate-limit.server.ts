import { createHmac } from "node:crypto";
import { isIP } from "node:net";
import type { ArchiveAiCostClass } from "./archive-model-config.ts";

export type { ArchiveAiCostClass } from "./archive-model-config.ts";

const MINUTE_MS = 60_000;
const DAY_MS = 86_400_000;
const DEFAULT_CLIENT_MINUTE_UNITS = 12;
const DEFAULT_CLIENT_DAILY_UNITS = 120;
const DEFAULT_GLOBAL_DAILY_UNITS = 250;

type AccessReason = "allowed" | "unconfigured" | "rate_limited" | "shared_limit_unavailable";

export type ArchiveAiAccess = {
  allowed: boolean;
  reason: AccessReason;
  safetyIdentifier?: string;
};

type MemoryBucket = { expiresAt: number; count: number };
type ArchiveDatabaseSource = "neon" | "pglite";
type MemoryFallbackReason = "database_unconfigured" | "shared_store_error";

const globalRef = globalThis as typeof globalThis & {
  __archiveAiRateBuckets__?: Map<string, MemoryBucket>;
  __archiveAiFallbackWarnings__?: Set<MemoryFallbackReason>;
};
const memoryBuckets = (globalRef.__archiveAiRateBuckets__ ??= new Map());
const emittedFallbackWarnings = (globalRef.__archiveAiFallbackWarnings__ ??= new Set());

function boundedLimit(
  environment: NodeJS.ProcessEnv,
  name: string,
  fallback: number,
  maximum: number,
): number {
  const configured = Number(environment[name]);
  return Number.isSafeInteger(configured) && configured >= 1 && configured <= maximum
    ? configured
    : fallback;
}

function firstValidForwardedAddress(request: Request, headerNames: readonly string[]) {
  for (const headerName of headerNames) {
    const address = request.headers.get(headerName)?.split(",", 1)[0]?.trim();
    if (address && address.length <= 96 && isIP(address)) return address.toLowerCase();
  }
  return undefined;
}

/**
 * Resolve only addresses asserted by a known trusted edge. A generic production
 * proxy can pass a user-controlled `x-forwarded-for`, so unknown hosts share a
 * deliberately conservative anonymous bucket instead of trusting that value or
 * disabling remote AI altogether.
 */
export function resolveArchiveRateIdentity(
  request: Request,
  environment: NodeJS.ProcessEnv = process.env,
): string {
  if (environment.VERCEL) {
    return (
      firstValidForwardedAddress(request, [
        "x-vercel-forwarded-for",
        "x-forwarded-for",
        "x-real-ip",
      ]) ?? "anonymous-vercel"
    );
  }

  if (environment.NODE_ENV === "production") return "anonymous-production";
  return firstValidForwardedAddress(request, ["x-forwarded-for", "x-real-ip"]) ?? "local-client";
}

function clientDigest(request: Request, apiKey: string, environment: NodeJS.ProcessEnv): string {
  return createHmac("sha256", apiKey)
    .update(resolveArchiveRateIdentity(request, environment))
    .digest("hex")
    .slice(0, 40);
}

function consumeMemoryBucket(
  key: string,
  limit: number,
  expiresAt: number,
  units: number,
  now: number,
): boolean {
  const bucket = memoryBuckets.get(key);
  if (!bucket || bucket.expiresAt <= now) {
    memoryBuckets.set(key, { expiresAt, count: units });
    if (memoryBuckets.size > 1024) {
      for (const [bucketKey, value] of memoryBuckets) {
        if (value.expiresAt <= now) memoryBuckets.delete(bucketKey);
      }
    }
    return units <= limit;
  }

  bucket.count = Math.min(bucket.count + units, limit + 1);
  return bucket.count <= limit;
}

function checkMemoryBuckets(
  clientKey: string,
  now: number,
  units: number,
  environment: NodeJS.ProcessEnv,
): boolean {
  const minute = Math.floor(now / MINUTE_MS);
  const day = Math.floor(now / DAY_MS);
  const clientMinuteLimit = boundedLimit(
    environment,
    "ARCHIVE_AI_CLIENT_MINUTE_LIMIT",
    DEFAULT_CLIENT_MINUTE_UNITS,
    120,
  );
  const clientDailyLimit = boundedLimit(
    environment,
    "ARCHIVE_AI_CLIENT_DAILY_LIMIT",
    DEFAULT_CLIENT_DAILY_UNITS,
    2_000,
  );
  const globalDailyLimit = boundedLimit(
    environment,
    "ARCHIVE_AI_GLOBAL_DAILY_LIMIT",
    DEFAULT_GLOBAL_DAILY_UNITS,
    10_000,
  );
  return (
    consumeMemoryBucket(
      `minute:${minute}:${clientKey}`,
      clientMinuteLimit,
      (minute + 1) * MINUTE_MS,
      units,
      now,
    ) &&
    consumeMemoryBucket(
      `day:${day}:${clientKey}`,
      clientDailyLimit,
      (day + 1) * DAY_MS,
      units,
      now,
    ) &&
    consumeMemoryBucket(`global:${day}`, globalDailyLimit, (day + 1) * DAY_MS, units, now)
  );
}

async function consumeSharedBucket(
  key: string,
  limit: number,
  expiresAt: number,
  units: number,
): Promise<{ allowed: boolean; count: number }> {
  const { getSql } = await import("./db.ts");
  const sql = await getSql();
  const rows = await sql.query<{ request_count: number }>(
    `INSERT INTO archive_ai_rate_limits (bucket_key, request_count, expires_at, updated_at)
     VALUES ($1, $3, to_timestamp($2 / 1000.0), NOW())
     ON CONFLICT (bucket_key) DO UPDATE
       SET request_count = LEAST(archive_ai_rate_limits.request_count + EXCLUDED.request_count, $4 + 1),
           expires_at = EXCLUDED.expires_at,
           updated_at = NOW()
     RETURNING request_count`,
    [key, expiresAt, units, limit],
  );
  const count = rows[0]?.request_count ?? limit + 1;
  return { allowed: count <= limit, count };
}

async function checkSharedBuckets(
  clientKey: string,
  now: number,
  units: number,
  environment: NodeJS.ProcessEnv,
): Promise<boolean> {
  const minute = Math.floor(now / MINUTE_MS);
  const day = Math.floor(now / DAY_MS);
  const clientMinuteLimit = boundedLimit(
    environment,
    "ARCHIVE_AI_CLIENT_MINUTE_LIMIT",
    DEFAULT_CLIENT_MINUTE_UNITS,
    120,
  );
  const clientDailyLimit = boundedLimit(
    environment,
    "ARCHIVE_AI_CLIENT_DAILY_LIMIT",
    DEFAULT_CLIENT_DAILY_UNITS,
    2_000,
  );
  const globalDailyLimit = boundedLimit(
    environment,
    "ARCHIVE_AI_GLOBAL_DAILY_LIMIT",
    DEFAULT_GLOBAL_DAILY_UNITS,
    10_000,
  );
  const minuteResult = await consumeSharedBucket(
    `minute:${minute}:${clientKey}`,
    clientMinuteLimit,
    (minute + 1) * MINUTE_MS,
    units,
  );
  if (!minuteResult.allowed) return false;

  const clientDayResult = await consumeSharedBucket(
    `day:${day}:${clientKey}`,
    clientDailyLimit,
    (day + 1) * DAY_MS,
    units,
  );
  if (!clientDayResult.allowed) return false;

  const globalDayResult = await consumeSharedBucket(
    `global:${day}`,
    globalDailyLimit,
    (day + 1) * DAY_MS,
    units,
  );
  if (globalDayResult.count === units) {
    const { getSql } = await import("./db.ts");
    const sql = await getSql();
    await sql.query("DELETE FROM archive_ai_rate_limits WHERE expires_at < NOW()");
  }
  return globalDayResult.allowed;
}

function warnMemoryFallback(reason: MemoryFallbackReason): void {
  if (emittedFallbackWarnings.has(reason)) return;
  emittedFallbackWarnings.add(reason);
  console.warn("[archive-ai] shared rate limit unavailable; using bounded memory fallback", {
    reason,
  });
}

type ArchiveAiAccessDependencies = {
  apiKey: string;
  databaseSource: ArchiveDatabaseSource;
  environment: NodeJS.ProcessEnv;
  now: number;
  checkShared: (clientKey: string, now: number, units: number) => Promise<boolean>;
  reportFallback: (reason: MemoryFallbackReason) => void;
};

/** Dependency-injected core used by environment-matrix tests. */
export async function checkArchiveAiAccessWithDependencies(
  request: Request,
  costClass: ArchiveAiCostClass,
  dependencies: ArchiveAiAccessDependencies,
): Promise<ArchiveAiAccess> {
  const { apiKey, databaseSource, environment, now, checkShared, reportFallback } = dependencies;
  if (!apiKey.trim()) return { allowed: false, reason: "unconfigured" };

  const clientKey = clientDigest(request, apiKey, environment);
  const units = costClass === "pro" ? 3 : costClass === "advanced" ? 2 : 1;
  if (databaseSource === "neon") {
    try {
      const allowed = await checkShared(clientKey, now, units);
      return {
        allowed,
        reason: allowed ? "allowed" : "rate_limited",
        safetyIdentifier: allowed ? clientKey : undefined,
      };
    } catch {
      reportFallback("shared_store_error");
    }
  } else if (environment.NODE_ENV === "production" || environment.VERCEL) {
    reportFallback("database_unconfigured");
  }

  const allowed = checkMemoryBuckets(clientKey, now, units, environment);
  return {
    allowed,
    reason: allowed ? "allowed" : "rate_limited",
    safetyIdentifier: allowed ? clientKey : undefined,
  };
}

/**
 * Prefer the shared Postgres limit whenever it is configured and healthy. An
 * unavailable limiter must not make a valid OpenAI connection appear offline:
 * production and preview requests fall back to bounded process-local buckets.
 */
export async function checkArchiveAiAccess(
  request: Request,
  costClass: ArchiveAiCostClass,
): Promise<ArchiveAiAccess> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return { allowed: false, reason: "unconfigured" };
  const environment = process.env;
  return checkArchiveAiAccessWithDependencies(request, costClass, {
    apiKey,
    databaseSource: environment.DATABASE_URL?.trim() ? "neon" : "pglite",
    environment,
    now: Date.now(),
    checkShared: (clientKey, now, units) => checkSharedBuckets(clientKey, now, units, environment),
    reportFallback: warnMemoryFallback,
  });
}
