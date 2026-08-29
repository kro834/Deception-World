import { createHmac } from "node:crypto";
import { isIP } from "node:net";
import { dbSource, getSql } from "./db";

const MINUTE_MS = 60_000;
const DAY_MS = 86_400_000;
const CLIENT_MINUTE_UNITS = 6;
const CLIENT_DAILY_UNITS = 40;
const DEFAULT_GLOBAL_DAILY_UNITS = 250;

type AccessReason = "allowed" | "unconfigured" | "rate_limited" | "shared_limit_unavailable";

export type ArchiveAiAccess = {
  allowed: boolean;
  reason: AccessReason;
};

type MemoryBucket = { expiresAt: number; count: number };
const globalRef = globalThis as typeof globalThis & {
  __archiveAiRateBuckets__?: Map<string, MemoryBucket>;
};
const memoryBuckets = (globalRef.__archiveAiRateBuckets__ ??= new Map());

function boundedDailyLimit(): number {
  const configured = Number(process.env.ARCHIVE_AI_GLOBAL_DAILY_LIMIT);
  return Number.isSafeInteger(configured) && configured >= 1 && configured <= 10_000
    ? configured
    : DEFAULT_GLOBAL_DAILY_UNITS;
}

function clientAddress(request: Request): string | null {
  const vercelAddress = request.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim();
  if (process.env.VERCEL) {
    return vercelAddress && vercelAddress.length <= 96 && isIP(vercelAddress)
      ? vercelAddress.toLowerCase()
      : null;
  }

  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return (forwarded || request.headers.get("x-real-ip")?.trim() || "local-client")
    .slice(0, 96)
    .toLowerCase();
}

function clientDigest(request: Request, apiKey: string): string | null {
  const address = clientAddress(request);
  if (!address) return null;
  return createHmac("sha256", apiKey).update(address).digest("hex").slice(0, 40);
}

function consumeMemoryBucket(
  key: string,
  limit: number,
  expiresAt: number,
  units: number,
): boolean {
  const now = Date.now();
  const bucket = memoryBuckets.get(key);
  if (!bucket || bucket.expiresAt <= now) {
    memoryBuckets.set(key, { expiresAt, count: units });
    if (memoryBuckets.size > 1024) {
      for (const [bucketKey, value] of memoryBuckets) {
        if (value.expiresAt <= now) memoryBuckets.delete(bucketKey);
      }
    }
    return true;
  }

  bucket.count = Math.min(bucket.count + units, limit + 1);
  return bucket.count <= limit;
}

function checkDevelopmentBuckets(clientKey: string, now: number, units: number): boolean {
  const minute = Math.floor(now / MINUTE_MS);
  const day = Math.floor(now / DAY_MS);
  return (
    consumeMemoryBucket(
      `minute:${minute}:${clientKey}`,
      CLIENT_MINUTE_UNITS,
      (minute + 1) * MINUTE_MS,
      units,
    ) &&
    consumeMemoryBucket(`day:${day}:${clientKey}`, CLIENT_DAILY_UNITS, (day + 1) * DAY_MS, units) &&
    consumeMemoryBucket(`global:${day}`, boundedDailyLimit(), (day + 1) * DAY_MS, units)
  );
}

async function consumeSharedBucket(
  key: string,
  limit: number,
  expiresAt: number,
  units: number,
): Promise<{ allowed: boolean; count: number }> {
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

async function checkSharedBuckets(clientKey: string, now: number, units: number): Promise<boolean> {
  const minute = Math.floor(now / MINUTE_MS);
  const day = Math.floor(now / DAY_MS);
  const minuteResult = await consumeSharedBucket(
    `minute:${minute}:${clientKey}`,
    CLIENT_MINUTE_UNITS,
    (minute + 1) * MINUTE_MS,
    units,
  );
  if (!minuteResult.allowed) return false;

  const clientDayResult = await consumeSharedBucket(
    `day:${day}:${clientKey}`,
    CLIENT_DAILY_UNITS,
    (day + 1) * DAY_MS,
    units,
  );
  if (!clientDayResult.allowed) return false;

  const globalDayResult = await consumeSharedBucket(
    `global:${day}`,
    boundedDailyLimit(),
    (day + 1) * DAY_MS,
    units,
  );
  if (globalDayResult.count === units) {
    const sql = await getSql();
    await sql.query("DELETE FROM archive_ai_rate_limits WHERE expires_at < NOW()");
  }
  return globalDayResult.allowed;
}

/**
 * Remote inference is fail-closed in production unless a shared Postgres rate
 * limit is available. Local development keeps a bounded in-memory equivalent.
 */
export async function checkArchiveAiAccess(
  request: Request,
  mode: "normal" | "pro",
): Promise<ArchiveAiAccess> {
  const apiKey = process.env.XAI_API_KEY?.trim();
  if (!apiKey) return { allowed: false, reason: "unconfigured" };

  const now = Date.now();
  const clientKey = clientDigest(request, apiKey);
  if (!clientKey) return { allowed: false, reason: "shared_limit_unavailable" };
  const units = mode === "pro" ? 3 : 1;
  if (process.env.VERCEL && process.env.VERCEL_ENV !== "production") {
    return { allowed: false, reason: "shared_limit_unavailable" };
  }
  if (dbSource !== "neon") {
    if (process.env.NODE_ENV === "production") {
      return { allowed: false, reason: "shared_limit_unavailable" };
    }
    const allowed = checkDevelopmentBuckets(clientKey, now, units);
    return {
      allowed,
      reason: allowed ? "allowed" : "rate_limited",
    };
  }

  try {
    const allowed = await checkSharedBuckets(clientKey, now, units);
    return { allowed, reason: allowed ? "allowed" : "rate_limited" };
  } catch {
    return { allowed: false, reason: "shared_limit_unavailable" };
  }
}
