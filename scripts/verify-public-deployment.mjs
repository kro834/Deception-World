import { pathToFileURL } from "node:url";

export const PUBLIC_SMOKE_ROUTES = [
  "/",
  "/world",
  "/characters",
  "/characters/terra",
  "/riders",
  "/riders/saga",
  "/dream-chapter",
  "/rexonance-saga",
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
} = {}) {
  if (!baseUrl) throw new Error("base URL is required");
  const origin = normalizedOrigin(baseUrl);
  const results = [];

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
    bypassToken:
      valueAfter("--vercel-bypass-token") ?? process.env.VERCEL_PROTECTION_BYPASS,
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
