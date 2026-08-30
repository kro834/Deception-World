import type { ArchiveDeliveryReason } from "./archive-delivery.ts";
import { getSql } from "./db.ts";

type CircuitState = "closed" | "open" | "half_open";

type CircuitRow = {
  state: CircuitState;
  failure_timestamps: unknown;
  success_timestamps: unknown;
  consecutive_opens: number;
  probe_claimed: boolean;
  probe_lease_expires_at_text: string | null;
  opened_until_text: string | null;
};

export type ArchiveAiCircuitDecision = {
  allowed: boolean;
  retryAfterMs: number;
  probe: boolean;
};

const WINDOW_MS = 2 * 60 * 1_000;
const MIN_FAILURES = 5;
const SAMPLE_SIZE = 20;
const BASE_OPEN_MS = 30_000;
const MAX_OPEN_MS = 5 * 60 * 1_000;
const PROBE_LEASE_MS = 45_000;

function timestamps(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is number => typeof item === "number" && Number.isFinite(item));
}

function prune(values: number[], now: number): number[] {
  return values.filter((value) => value >= now - WINDOW_MS).slice(-SAMPLE_SIZE);
}

function openDurationMs(consecutiveOpens: number): number {
  return Math.min(MAX_OPEN_MS, BASE_OPEN_MS * 2 ** Math.max(0, consecutiveOpens));
}

export async function acquireArchiveAiCircuit(
  breakerKey: string,
  now = Date.now(),
): Promise<ArchiveAiCircuitDecision> {
  const sql = await getSql();
  return sql.transaction(async (transaction) => {
    await transaction.query(
      `INSERT INTO archive_ai_circuit_breakers (breaker_key)
       VALUES ($1) ON CONFLICT (breaker_key) DO NOTHING`,
      [breakerKey],
    );
    const rows = await transaction.query<CircuitRow>(
      `SELECT state, failure_timestamps, success_timestamps, consecutive_opens,
              probe_claimed,
              probe_lease_expires_at::text AS probe_lease_expires_at_text,
              opened_until::text AS opened_until_text
       FROM archive_ai_circuit_breakers
       WHERE breaker_key = $1
       FOR UPDATE`,
      [breakerKey],
    );
    const row = rows[0];
    if (!row) throw new Error("archive_circuit_missing");
    if (row.state === "closed") return { allowed: true, retryAfterMs: 0, probe: false };

    const openedUntil = row.opened_until_text ? new Date(row.opened_until_text).getTime() : 0;
    if (row.state === "open" && openedUntil > now) {
      return { allowed: false, retryAfterMs: Math.max(500, openedUntil - now), probe: false };
    }
    const probeLeaseExpiresAt = row.probe_lease_expires_at_text
      ? new Date(row.probe_lease_expires_at_text).getTime()
      : 0;
    if (row.probe_claimed && probeLeaseExpiresAt > now) {
      return { allowed: false, retryAfterMs: 1_000, probe: false };
    }
    const probeLeaseExpiresAtText = new Date(now + PROBE_LEASE_MS).toISOString();
    await transaction.query(
      `UPDATE archive_ai_circuit_breakers
       SET state = 'half_open', probe_claimed = TRUE,
           probe_lease_expires_at = $2::timestamptz, updated_at = NOW()
       WHERE breaker_key = $1`,
      [breakerKey, probeLeaseExpiresAtText],
    );
    return { allowed: true, retryAfterMs: 0, probe: true };
  });
}

const BREAKER_FAILURE_REASONS = new Set<ArchiveDeliveryReason>([
  "provider_authentication",
  "provider_permission",
  "provider_model_unavailable",
  "provider_quota",
  "provider_rate_limited",
  "provider_model_mismatch",
  "provider_timeout",
  "provider_invalid_response",
  "provider_unavailable",
]);

export async function recordArchiveAiCircuitOutcome({
  breakerKey,
  success,
  reason,
  now = Date.now(),
}: {
  breakerKey: string;
  success: boolean;
  reason?: ArchiveDeliveryReason;
  now?: number;
}): Promise<void> {
  if (!success && (!reason || !BREAKER_FAILURE_REASONS.has(reason))) return;
  const sql = await getSql();
  await sql.transaction(async (transaction) => {
    await transaction.query(
      `INSERT INTO archive_ai_circuit_breakers (breaker_key)
       VALUES ($1) ON CONFLICT (breaker_key) DO NOTHING`,
      [breakerKey],
    );
    const rows = await transaction.query<CircuitRow>(
      `SELECT state, failure_timestamps, success_timestamps, consecutive_opens,
              probe_claimed,
              probe_lease_expires_at::text AS probe_lease_expires_at_text,
              opened_until::text AS opened_until_text
       FROM archive_ai_circuit_breakers
       WHERE breaker_key = $1
       FOR UPDATE`,
      [breakerKey],
    );
    const row = rows[0];
    if (!row) throw new Error("archive_circuit_missing");
    if (success) {
      if (row.state === "half_open" || row.state === "open") {
        await transaction.query(
          `UPDATE archive_ai_circuit_breakers
           SET state = 'closed', failure_timestamps = '[]'::jsonb,
               success_timestamps = $2::jsonb, consecutive_opens = 0,
               probe_claimed = FALSE, probe_lease_expires_at = NULL,
               opened_until = NULL, updated_at = NOW()
           WHERE breaker_key = $1`,
          [breakerKey, JSON.stringify([now])],
        );
        return;
      }
      const successes = prune([...timestamps(row.success_timestamps), now], now);
      await transaction.query(
        `UPDATE archive_ai_circuit_breakers
         SET success_timestamps = $2::jsonb, updated_at = NOW()
         WHERE breaker_key = $1`,
        [breakerKey, JSON.stringify(successes)],
      );
      return;
    }

    const failures = prune([...timestamps(row.failure_timestamps), now], now);
    const successes = prune(timestamps(row.success_timestamps), now);
    const recent = [
      ...failures.map((at) => ({ at, failed: true })),
      ...successes.map((at) => ({ at, failed: false })),
    ]
      .sort((left, right) => right.at - left.at)
      .slice(0, SAMPLE_SIZE);
    const recentFailures = recent.filter((event) => event.failed).length;
    const mustOpen =
      row.state === "half_open" ||
      row.state === "open" ||
      (recentFailures >= MIN_FAILURES && recentFailures / Math.max(1, recent.length) > 0.5);
    if (mustOpen) {
      const nextConsecutive = row.consecutive_opens + 1;
      const openedUntil = new Date(now + openDurationMs(row.consecutive_opens)).toISOString();
      await transaction.query(
        `UPDATE archive_ai_circuit_breakers
         SET state = 'open', failure_timestamps = $2::jsonb,
             success_timestamps = $3::jsonb, consecutive_opens = $4,
             probe_claimed = FALSE, probe_lease_expires_at = NULL,
             opened_until = $5::timestamptz, updated_at = NOW()
         WHERE breaker_key = $1`,
        [
          breakerKey,
          JSON.stringify(failures),
          JSON.stringify(successes),
          nextConsecutive,
          openedUntil,
        ],
      );
      return;
    }
    await transaction.query(
      `UPDATE archive_ai_circuit_breakers
       SET failure_timestamps = $2::jsonb, success_timestamps = $3::jsonb,
           probe_claimed = FALSE, probe_lease_expires_at = NULL, updated_at = NOW()
       WHERE breaker_key = $1`,
      [breakerKey, JSON.stringify(failures), JSON.stringify(successes)],
    );
  });
}
