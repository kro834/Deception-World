import { createFileRoute } from "@tanstack/react-router";
import {
  archiveRateLimitSecretKeyring,
  archiveSecretsEqual,
  decryptArchiveValue,
  encryptArchiveValue,
} from "@/lib/archive-ai-crypto.server";
import { archiveAiJson } from "@/lib/archive-ai-http.server";
import { archiveDeploymentSha } from "@/lib/archive-ai-observability.server";
import { dbSource, getSql } from "@/lib/db";

function authorized(request: Request): boolean {
  const configured = process.env.ARCHIVE_MONITOR_TOKEN?.trim() ?? "";
  const supplied =
    request.headers
      .get("authorization")
      ?.replace(/^Bearer\s+/iu, "")
      .trim() ?? "";
  return (
    configured.length >= 32 && supplied.length >= 32 && archiveSecretsEqual(configured, supplied)
  );
}

function validDatabaseUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "postgres:" || parsed.protocol === "postgresql:";
  } catch {
    return false;
  }
}

export const Route = createFileRoute("/api/internal/archive-ai-health")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!authorized(request)) return archiveAiJson({ error: "not_found" }, 404);
        const deploymentSha = archiveDeploymentSha();
        let rateLimitSecret = false;
        try {
          rateLimitSecret = archiveRateLimitSecretKeyring().every(
            ({ value }) => Buffer.byteLength(value) >= 32,
          );
        } catch {
          rateLimitSecret = false;
        }
        let encryptionKey = false;
        let cryptoRoundTrip = false;
        try {
          const probe = { kind: "archive-ai-health", deploymentSha };
          const context = {
            requestId: deploymentSha || "unknown-deployment",
            sessionHash: "archive-ai-health",
            purpose: "health" as const,
          };
          const encrypted = encryptArchiveValue(probe, context);
          const decrypted = decryptArchiveValue<typeof probe>(encrypted, context);
          encryptionKey = true;
          cryptoRoundTrip =
            decrypted.kind === probe.kind && decrypted.deploymentSha === probe.deploymentSha;
        } catch {
          encryptionKey = false;
          cryptoRoundTrip = false;
        }
        const configured = {
          openaiKey: /^sk-[A-Za-z0-9_-]{16,}$/u.test(process.env.OPENAI_API_KEY?.trim() ?? ""),
          grokKey: /^xai-[A-Za-z0-9_-]{16,}$/u.test(process.env.XAI_API_KEY?.trim() ?? ""),
          databaseUrl:
            dbSource === "neon" && validDatabaseUrl(process.env.DATABASE_URL?.trim() ?? ""),
          strict: process.env.ARCHIVE_AI_REQUIRED === "1",
          rateLimitSecret,
          encryptionKey,
          monitorToken: Buffer.byteLength(process.env.ARCHIVE_MONITOR_TOKEN?.trim() ?? "") >= 32,
        };
        const database = {
          connected: false,
          tables: {
            requests: false,
            rateCharges: false,
            circuitBreakers: false,
          },
        };
        try {
          const sql = await getSql();
          const rows = await sql.query<{
            connected: number;
            requests: string | null;
            rate_charges: string | null;
            circuit_breakers: string | null;
          }>(`SELECT
              1 AS connected,
              to_regclass('public.archive_ai_requests')::text AS requests,
              to_regclass('public.archive_ai_rate_charges')::text AS rate_charges,
              to_regclass('public.archive_ai_circuit_breakers')::text AS circuit_breakers`);
          const row = rows[0];
          database.connected = row?.connected === 1;
          database.tables.requests = row?.requests === "archive_ai_requests";
          database.tables.rateCharges = row?.rate_charges === "archive_ai_rate_charges";
          database.tables.circuitBreakers = row?.circuit_breakers === "archive_ai_circuit_breakers";
        } catch {
          database.connected = false;
        }
        const healthy =
          Object.values(configured).every(Boolean) &&
          database.connected &&
          Object.values(database.tables).every(Boolean) &&
          cryptoRoundTrip;
        return archiveAiJson(
          {
            healthy,
            configured,
            database,
            crypto: { roundTrip: cryptoRoundTrip },
            deploymentSha,
          },
          healthy ? 200 : 503,
        );
      },
    },
  },
});
