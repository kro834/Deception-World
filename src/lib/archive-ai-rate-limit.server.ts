import { createHmac } from "node:crypto";
import { isIP } from "node:net";
import { archiveAiApiKey } from "./archive-ai-credentials.server.ts";
import { archiveRateLimitSecret, archiveSecretsEqual } from "./archive-ai-crypto.server.ts";
import type { ArchiveAiCostClass } from "./archive-model-config.ts";
import type { Sql } from "./db.ts";

export type { ArchiveAiCostClass } from "./archive-model-config.ts";

const MINUTE_MS = 60_000;
const DAY_MS = 86_400_000;
const DEFAULT_CLIENT_MINUTE_UNITS = 12;
const DEFAULT_CLIENT_DAILY_UNITS = 120;
const DEFAULT_GLOBAL_DAILY_UNITS = 250;
const DEFAULT_MONITOR_MINUTE_UNITS = 120;
const DEFAULT_MONITOR_DAILY_UNITS = 1_500;

type AccessReason = "allowed" | "unconfigured" | "rate_limited" | "shared_state_unavailable";

export type ArchiveAiAccess = {
  allowed: boolean;
  reason: AccessReason;
  safetyIdentifier?: string;
};

type MemoryBucket = { expiresAt: number; count: number };
type ArchiveDatabaseSource = "neon" | "pglite";
type MemoryFallbackReason = "database_unconfigured" | "shared_store_error";

function sharedDatabaseRequired(environment: NodeJS.ProcessEnv): boolean {
  return Boolean(
    environment.NODE_ENV === "production" ||
    environment.VERCEL ||
    environment.ARCHIVE_AI_REQUIRED === "1",
  );
}

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

function clientDigest(
  request: Request,
  identitySecret: string,
  environment: NodeJS.ProcessEnv,
  trustedSessionHash?: string,
): string {
  // The ledger supplies the server-HMACed session hash after validating request
  // ownership. Prefer it so carrier NAT and shared Wi-Fi do not merge unrelated
  // users into one client budget. The global bucket remains the abuse ceiling.
  if (trustedSessionHash && /^[0-9a-f]{64}$/u.test(trustedSessionHash)) {
    return trustedSessionHash;
  }
  const identity = resolveArchiveRateIdentity(request, environment);
  return createHmac("sha256", identitySecret).update(identity).digest("hex").slice(0, 40);
}

function isArchiveMonitorProbe(request: Request, environment: NodeJS.ProcessEnv): boolean {
  const configured = environment.ARCHIVE_MONITOR_TOKEN?.trim() ?? "";
  const supplied = request.headers.get("x-archive-monitor-token")?.trim() ?? "";
  return (
    Buffer.byteLength(configured) >= 32 &&
    Buffer.byteLength(supplied) >= 32 &&
    archiveSecretsEqual(configured, supplied)
  );
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
  monitorProbe = false,
): boolean {
  const minute = Math.floor(now / MINUTE_MS);
  const day = Math.floor(now / DAY_MS);
  if (monitorProbe) {
    return (
      consumeMemoryBucket(
        `monitor:minute:${minute}`,
        boundedLimit(
          environment,
          "ARCHIVE_AI_MONITOR_MINUTE_LIMIT",
          DEFAULT_MONITOR_MINUTE_UNITS,
          2_000,
        ),
        (minute + 1) * MINUTE_MS,
        units,
        now,
      ) &&
      consumeMemoryBucket(
        `monitor:day:${day}`,
        boundedLimit(
          environment,
          "ARCHIVE_AI_MONITOR_DAILY_LIMIT",
          DEFAULT_MONITOR_DAILY_UNITS,
          20_000,
        ),
        (day + 1) * DAY_MS,
        units,
        now,
      )
    );
  }
  return (
    consumeMemoryBucket(
      `minute:${minute}:${clientKey}`,
      boundedLimit(environment, "ARCHIVE_AI_CLIENT_MINUTE_LIMIT", DEFAULT_CLIENT_MINUTE_UNITS, 120),
      (minute + 1) * MINUTE_MS,
      units,
      now,
    ) &&
    consumeMemoryBucket(
      `day:${day}:${clientKey}`,
      boundedLimit(environment, "ARCHIVE_AI_CLIENT_DAILY_LIMIT", DEFAULT_CLIENT_DAILY_UNITS, 2_000),
      (day + 1) * DAY_MS,
      units,
      now,
    ) &&
    consumeMemoryBucket(
      `global:${day}`,
      boundedLimit(
        environment,
        "ARCHIVE_AI_GLOBAL_DAILY_LIMIT",
        DEFAULT_GLOBAL_DAILY_UNITS,
        10_000,
      ),
      (day + 1) * DAY_MS,
      units,
      now,
    )
  );
}

class SharedRateLimitDenied extends Error {}

async function consumeBucket(
  sql: Sql,
  key: string,
  limit: number,
  expiresAt: number,
  units: number,
): Promise<void> {
  const rows = await sql.query<{ request_count: number }>(
    `INSERT INTO archive_ai_rate_limits (bucket_key, request_count, expires_at, updated_at)
     VALUES ($1, $3, to_timestamp($2 / 1000.0), NOW())
     ON CONFLICT (bucket_key) DO UPDATE
       SET request_count = CASE
             WHEN archive_ai_rate_limits.expires_at <= NOW() THEN EXCLUDED.request_count
             ELSE archive_ai_rate_limits.request_count + EXCLUDED.request_count
           END,
           expires_at = EXCLUDED.expires_at,
           updated_at = NOW()
     RETURNING request_count`,
    [key, expiresAt, units],
  );
  if ((rows[0]?.request_count ?? limit + 1) > limit) throw new SharedRateLimitDenied();
}

async function checkSharedBucketsInTransaction(
  transaction: Sql,
  clientKey: string,
  now: number,
  units: number,
  environment: NodeJS.ProcessEnv,
  requestId?: string,
  monitorProbe = false,
): Promise<boolean> {
  const minute = Math.floor(now / MINUTE_MS);
  const day = Math.floor(now / DAY_MS);
  const savepoint = "archive_ai_rate_buckets";
  if (requestId) {
    const inserted = await transaction.query<{ request_id: string }>(
      `INSERT INTO archive_ai_rate_charges (request_id, allowed, expires_at)
       VALUES ($1::uuid, FALSE, to_timestamp($2 / 1000.0))
       ON CONFLICT (request_id) DO NOTHING
       RETURNING request_id::text`,
      [requestId, (day + 2) * DAY_MS],
    );
    if (!inserted.length) {
      const existing = await transaction.query<{ allowed: boolean }>(
        "SELECT allowed FROM archive_ai_rate_charges WHERE request_id = $1::uuid",
        [requestId],
      );
      return existing[0]?.allowed ?? false;
    }
  }

  await transaction.query(`SAVEPOINT ${savepoint}`);
  try {
    if (monitorProbe) {
      await consumeBucket(
        transaction,
        `monitor:minute:${minute}`,
        boundedLimit(
          environment,
          "ARCHIVE_AI_MONITOR_MINUTE_LIMIT",
          DEFAULT_MONITOR_MINUTE_UNITS,
          2_000,
        ),
        (minute + 1) * MINUTE_MS,
        units,
      );
      await consumeBucket(
        transaction,
        `monitor:day:${day}`,
        boundedLimit(
          environment,
          "ARCHIVE_AI_MONITOR_DAILY_LIMIT",
          DEFAULT_MONITOR_DAILY_UNITS,
          20_000,
        ),
        (day + 1) * DAY_MS,
        units,
      );
    } else {
      await consumeBucket(
        transaction,
        `minute:${minute}:${clientKey}`,
        boundedLimit(
          environment,
          "ARCHIVE_AI_CLIENT_MINUTE_LIMIT",
          DEFAULT_CLIENT_MINUTE_UNITS,
          120,
        ),
        (minute + 1) * MINUTE_MS,
        units,
      );
      await consumeBucket(
        transaction,
        `day:${day}:${clientKey}`,
        boundedLimit(
          environment,
          "ARCHIVE_AI_CLIENT_DAILY_LIMIT",
          DEFAULT_CLIENT_DAILY_UNITS,
          2_000,
        ),
        (day + 1) * DAY_MS,
        units,
      );
      await consumeBucket(
        transaction,
        `global:${day}`,
        boundedLimit(
          environment,
          "ARCHIVE_AI_GLOBAL_DAILY_LIMIT",
          DEFAULT_GLOBAL_DAILY_UNITS,
          10_000,
        ),
        (day + 1) * DAY_MS,
        units,
      );
    }
    if (requestId) {
      await transaction.query(
        `UPDATE archive_ai_rate_charges
         SET allowed = TRUE, safety_identifier = $2
         WHERE request_id = $1::uuid`,
        [requestId, clientKey],
      );
    }
    await transaction.query(`RELEASE SAVEPOINT ${savepoint}`);
    await transaction.query("DELETE FROM archive_ai_rate_limits WHERE expires_at < NOW()");
    await transaction.query("DELETE FROM archive_ai_rate_charges WHERE expires_at < NOW()");
    return true;
  } catch (error) {
    // A rejection can occur after the minute or daily bucket was updated. Roll
    // the entire bucket group back while retaining the request-scoped FALSE
    // charge inserted before the savepoint. That durable latch makes a retry
    // with the same logical requestId return the same denial without consuming
    // any bucket again.
    await transaction.query(`ROLLBACK TO SAVEPOINT ${savepoint}`);
    await transaction.query(`RELEASE SAVEPOINT ${savepoint}`);
    if (error instanceof SharedRateLimitDenied) return false;
    throw error;
  }
}

async function checkSharedBuckets(
  clientKey: string,
  now: number,
  units: number,
  environment: NodeJS.ProcessEnv,
  requestId?: string,
  monitorProbe = false,
): Promise<boolean> {
  const { getSql } = await import("./db.ts");
  const sql = await getSql();
  return sql.transaction((transaction) =>
    checkSharedBucketsInTransaction(
      transaction,
      clientKey,
      now,
      units,
      environment,
      requestId,
      monitorProbe,
    ),
  );
}

/**
 * Charge a configured shared Postgres budget using an existing transaction.
 * The request ledger calls this immediately after its INSERT, so the ledger,
 * idempotency latch, and all three user buckets share one commit boundary.
 * `undefined` means this environment does not have a configured shared DB; the
 * normal access check will fail closed in production or use the dev fallback.
 */
export async function chargeArchiveAiAccessInTransaction(
  transaction: Sql,
  request: Request,
  costClass: ArchiveAiCostClass,
  requestId: string,
  trustedSessionHash: string,
  environment: NodeJS.ProcessEnv = process.env,
  now = Date.now(),
): Promise<ArchiveAiAccess | undefined> {
  const apiKey = archiveAiApiKey(environment);
  if (!apiKey || (!environment.DATABASE_URL?.trim() && sharedDatabaseRequired(environment))) {
    return undefined;
  }
  let identitySecret: string;
  try {
    identitySecret = archiveRateLimitSecret(environment);
  } catch {
    return { allowed: false, reason: "shared_state_unavailable" };
  }
  const clientKey = clientDigest(request, identitySecret, environment, trustedSessionHash);
  const monitorProbe = isArchiveMonitorProbe(request, environment);
  const units = costClass === "pro" ? 3 : costClass === "advanced" ? 2 : 1;
  const allowed = await checkSharedBucketsInTransaction(
    transaction,
    clientKey,
    now,
    units,
    environment,
    requestId,
    monitorProbe,
  );
  return {
    allowed,
    reason: allowed ? "allowed" : "rate_limited",
    safetyIdentifier: allowed ? clientKey : undefined,
  };
}

function warnMemoryFallback(reason: MemoryFallbackReason): void {
  if (emittedFallbackWarnings.has(reason)) return;
  emittedFallbackWarnings.add(reason);
  console.warn("[archive-ai] shared rate limit unavailable", { reason });
}

type ArchiveAiAccessDependencies = {
  apiKey: string;
  databaseSource: ArchiveDatabaseSource;
  environment: NodeJS.ProcessEnv;
  now: number;
  checkShared: (
    clientKey: string,
    now: number,
    units: number,
    requestId?: string,
    monitorProbe?: boolean,
  ) => Promise<boolean>;
  reportFallback: (reason: MemoryFallbackReason) => void;
};

export async function checkArchiveAiAccessWithDependencies(
  request: Request,
  costClass: ArchiveAiCostClass,
  dependencies: ArchiveAiAccessDependencies,
  requestId?: string,
): Promise<ArchiveAiAccess> {
  const { apiKey, databaseSource, environment, now, checkShared, reportFallback } = dependencies;
  if (!apiKey.trim()) return { allowed: false, reason: "unconfigured" };
  let identitySecret: string;
  try {
    identitySecret = archiveRateLimitSecret(environment);
  } catch {
    return { allowed: false, reason: "shared_state_unavailable" };
  }
  const clientKey = clientDigest(request, identitySecret, environment);
  const monitorProbe = isArchiveMonitorProbe(request, environment);
  const units = costClass === "pro" ? 3 : costClass === "advanced" ? 2 : 1;
  if (databaseSource === "neon") {
    try {
      const allowed = await checkShared(clientKey, now, units, requestId, monitorProbe);
      return {
        allowed,
        reason: allowed ? "allowed" : "rate_limited",
        safetyIdentifier: allowed ? clientKey : undefined,
      };
    } catch {
      reportFallback("shared_store_error");
      return { allowed: false, reason: "shared_state_unavailable" };
    }
  }

  if (sharedDatabaseRequired(environment)) {
    reportFallback("database_unconfigured");
    return { allowed: false, reason: "shared_state_unavailable" };
  }
  const allowed = checkMemoryBuckets(clientKey, now, units, environment, monitorProbe);
  return {
    allowed,
    reason: allowed ? "allowed" : "rate_limited",
    safetyIdentifier: allowed ? clientKey : undefined,
  };
}

export async function checkArchiveAiAccess(
  request: Request,
  costClass: ArchiveAiCostClass,
  requestId?: string,
  trustedSessionHash?: string,
): Promise<ArchiveAiAccess> {
  const apiKey = archiveAiApiKey();
  if (!apiKey) return { allowed: false, reason: "unconfigured" };
  const environment = process.env;
  if (trustedSessionHash && /^[0-9a-f]{64}$/u.test(trustedSessionHash)) {
    try {
      archiveRateLimitSecret(environment);
    } catch {
      return { allowed: false, reason: "shared_state_unavailable" };
    }
    const monitorProbe = isArchiveMonitorProbe(request, environment);
    const units = costClass === "pro" ? 3 : costClass === "advanced" ? 2 : 1;
    if (environment.DATABASE_URL?.trim() || !sharedDatabaseRequired(environment)) {
      try {
        const allowed = await checkSharedBuckets(
          trustedSessionHash,
          Date.now(),
          units,
          environment,
          requestId,
          monitorProbe,
        );
        return {
          allowed,
          reason: allowed ? "allowed" : "rate_limited",
          safetyIdentifier: allowed ? trustedSessionHash : undefined,
        };
      } catch {
        warnMemoryFallback("shared_store_error");
        return { allowed: false, reason: "shared_state_unavailable" };
      }
    }
  }
  return checkArchiveAiAccessWithDependencies(
    request,
    costClass,
    {
      apiKey,
      databaseSource: environment.DATABASE_URL?.trim() ? "neon" : "pglite",
      environment,
      now: Date.now(),
      checkShared: (clientKey, now, units, logicalRequestId, monitorProbe) =>
        checkSharedBuckets(clientKey, now, units, environment, logicalRequestId, monitorProbe),
      reportFallback: warnMemoryFallback,
    },
    requestId,
  );
}
