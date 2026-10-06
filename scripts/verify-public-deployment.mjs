import { pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const runFile = promisify(execFile);

// The CLI supplies authenticated protection access without disabling protection.
export async function vercelCurlFetch(url) {
  const { stdout } = await runFile("vercel", [
    "curl", String(url), "--", "--silent", "--show-error", "--location",
    "--max-time", "30", "--write-out", "\\n%{http_code}",
  ], { encoding: "buffer", maxBuffer: 64 * 1024 * 1024 });
  const status = Number(stdout.subarray(-3).toString());
  if (!Number.isInteger(status) || status < 100) throw new Error("Vercel curl returned no HTTP status");
  return new Response(stdout.subarray(0, -4), { status });
}

export const PUBLIC_SMOKE_ROUTES = [
  "/",
  "/world",
  "/characters",
  "/characters/terra",
  "/characters/ciel",
  "/riders",
  "/riders/saga",
  "/dream-chapter",
  "/rexonance-saga",
  "/extreme-saga",
  "/gallery",
  "/final-stage",
];

export const RETIRED_AI_ROUTES = [
  "/intelligence",
  "/api/archive-search",
  "/api/archive-intelligence",
  "/api/archive-ai/client-contract",
  "/api/archive-ai/requests/00000000-0000-4000-8000-000000000000",
  "/api/internal/archive-ai-health",
  "/api/internal/archive-ai-maintenance",
];

function normalizedOrigin(value) {
  const url = new URL(value);
  if (!/^https?:$/u.test(url.protocol) || url.username || url.password) {
    throw new Error("base URL must be an HTTP(S) origin without credentials");
  }
  return url.origin;
}

async function request(fetchImpl, url, bypassToken, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchImpl(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        accept: "text/html,application/json;q=0.8",
        ...(bypassToken
          ? {
              "x-vercel-protection-bypass": bypassToken,
              "x-vercel-set-bypass-cookie": "true",
            }
          : {}),
      },
    });
  } finally {
    clearTimeout(timer);
  }
}

export async function verifyPublicDeployment({
  baseUrl,
  bypassToken,
  fetchImpl = globalThis.fetch,
  timeoutMs = 30_000,
  expectedSha,
} = {}) {
  if (!baseUrl) throw new Error("base URL is required");
  const origin = normalizedOrigin(baseUrl);
  const results = [];

  if (expectedSha) {
    try {
      const response = await request(fetchImpl, new URL('/release-identity.json', origin), bypassToken, timeoutMs);
      const identity = await response.json();
      if (!response.ok || identity.sha !== expectedSha || !Array.isArray(identity.assets)) {
        throw new Error('Public release does not match the expected main commit');
      }
      results.push({ path: '/release-identity.json', ok: true, status: response.status, kind: 'identity' });
      for (const asset of identity.assets) {
        if (!/^\/(gallery\/|saga-extreme-)/u.test(asset.path) || asset.path.includes('..')) throw new Error('Invalid release asset path');
        const delivered = await request(fetchImpl, new URL(asset.path, origin), bypassToken, timeoutMs);
        const digest = createHash('sha256').update(Buffer.from(await delivered.arrayBuffer())).digest('hex');
        results.push({ path: asset.path, ok: delivered.ok && digest === asset.sha256, status: delivered.status, kind: 'asset' });
      }
    } catch (error) {
      results.push({ path: '/release-identity.json', ok: false, status: null, kind: 'identity', error: String(error) });
    }
  }

  for (const path of PUBLIC_SMOKE_ROUTES) {
    try {
      const response = await request(fetchImpl, new URL(path, origin), bypassToken, timeoutMs);
      const body = await response.text();
      const ok = response.ok && /Deception World|DECEPTION WORLD/u.test(body);
      results.push({ path, ok, status: response.status, kind: "public" });
    } catch (error) {
      results.push({ path, ok: false, status: null, kind: "public", error: String(error) });
    }
  }

  for (const path of RETIRED_AI_ROUTES) {
    try {
      const response = await request(fetchImpl, new URL(path, origin), bypassToken, timeoutMs);
      const body = await response.text();
      const removed =
        response.status === 404 &&
        !/AIに聞く|ARCHIVE INTELLIGENCE|archive-ai-pending|OPENAI_API_KEY/u.test(body);
      results.push({ path, ok: removed, status: response.status, kind: "retired" });
    } catch (error) {
      results.push({ path, ok: false, status: null, kind: "retired", error: String(error) });
    }
  }

  return { ok: results.every(({ ok }) => ok), origin, results };
}

async function main() {
  const args = process.argv.slice(2);
  const valueAfter = (name) => {
    const index = args.indexOf(name);
    return index >= 0 ? args[index + 1] : undefined;
  };
  const report = await verifyPublicDeployment({
    baseUrl: valueAfter("--base-url") ?? process.env.PUBLIC_BASE_URL,
    bypassToken: valueAfter("--vercel-bypass-token") ?? process.env.VERCEL_PROTECTION_BYPASS,
    expectedSha: valueAfter("--expected-sha"),
    fetchImpl: args.includes("--vercel-curl") ? vercelCurlFetch : globalThis.fetch,
  });
  console.log(`Public deployment smoke test: ${report.origin}`);
  for (const result of report.results) {
    console.log(`${result.ok ? "PASS" : "FAIL"} ${result.path} (${result.status ?? "network"})`);
  }
  if (!report.ok) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
