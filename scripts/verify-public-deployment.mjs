import { pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const runFile = promisify(execFile);

// The CLI supplies authenticated protection access without disabling protection.
export async function vercelCurlFetch(url) {
  const { stdout } = await runFile(
    "vercel",
    [
      "curl",
      String(url),
      "--",
      "--silent",
      "--show-error",
      "--location",
      "--max-time",
      "30",
      "--write-out",
      "\\n%{http_code}",
    ],
    { encoding: "buffer", maxBuffer: 64 * 1024 * 1024 },
  );
  const status = Number(stdout.subarray(-3).toString());
  if (!Number.isInteger(status) || status < 100)
    throw new Error("Vercel curl returned no HTTP status");
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
  "/library",
  "/search",
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

function publicGalleryOrigin(value) {
  if (typeof value !== "string") throw new Error("Shared gallery URL is missing");
  const url = new URL(value);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    throw new Error("Shared gallery URL must be a safe HTTPS origin");
  }
  return url.origin;
}

function safeGalleryPublicKey(value) {
  if (typeof value !== "string") return false;
  if (/^sb_publishable_[A-Za-z0-9_-]+$/u.test(value)) return true;
  if (!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/u.test(value)) return false;
  try {
    return (
      JSON.parse(Buffer.from(value.split(".")[1], "base64url").toString("utf8")).role === "anon"
    );
  } catch {
    return false;
  }
}

function object(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function validPublicGalleryCollection(collection, storageOrigin) {
  const validPostId = (id) =>
    typeof id === "string" &&
    /^u-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(id);
  const validArtworkId = (id) =>
    /^g(?:0[1-9]|[1-9][0-9]|10[0-9]|11[0-3])$/u.test(id) || validPostId(id);
  if (
    !object(collection) ||
    !Array.isArray(collection.posts) ||
    collection.posts.length > 1000 ||
    !object(collection.titles) ||
    Object.keys(collection.titles).length > 1113
  )
    return false;
  if (
    collection.deletedPosts !== undefined &&
    (!Array.isArray(collection.deletedPosts) || collection.deletedPosts.length !== 0)
  )
    return false;
  const ids = new Set();
  const sequences = new Set();
  const postKeys = new Set([
    "id",
    "sequence",
    "width",
    "height",
    "url",
    "createdAt",
    "deletedAt",
    "canDelete",
  ]);
  for (const post of collection.posts) {
    if (
      !object(post) ||
      Object.keys(post).some((key) => !postKeys.has(key)) ||
      !validPostId(post.id) ||
      ids.has(post.id) ||
      !Number.isSafeInteger(post.sequence) ||
      post.sequence <= 0 ||
      sequences.has(post.sequence) ||
      !Number.isSafeInteger(post.width) ||
      post.width < 1 ||
      post.width > 2400 ||
      !Number.isSafeInteger(post.height) ||
      post.height < 1 ||
      post.height > 2400 ||
      typeof post.createdAt !== "string" ||
      !Number.isFinite(Date.parse(post.createdAt)) ||
      post.canDelete !== false ||
      (post.deletedAt !== undefined && post.deletedAt !== null)
    )
      return false;
    try {
      const image = new URL(post.url);
      if (
        image.origin !== storageOrigin ||
        image.protocol !== "https:" ||
        image.username ||
        image.password ||
        image.pathname !== `/storage/v1/object/sign/gallery-images/${post.id}.webp` ||
        !image.searchParams.get("token")
      )
        return false;
    } catch {
      return false;
    }
    ids.add(post.id);
    sequences.add(post.sequence);
  }
  for (const [id, title] of Object.entries(collection.titles)) {
    if (
      !validArtworkId(id) ||
      (validPostId(id) && !ids.has(id)) ||
      !object(title) ||
      Object.keys(title).some((key) => key !== "title" && key !== "version") ||
      typeof title.title !== "string" ||
      title.title.length > 120 ||
      Array.from(title.title).some(
        (character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
      ) ||
      !Number.isSafeInteger(title.version) ||
      title.version < 0
    )
      return false;
  }
  return true;
}

async function verifySharedGallery(fetchImpl, origin, bypassToken, timeoutMs) {
  const results = [];
  let storageOrigin;
  for (const path of ["/api/gallery/config", "/api/gallery"]) {
    let status = null;
    try {
      const response = await request(fetchImpl, new URL(path, origin), bypassToken, timeoutMs);
      status = response.status;
      const body = await response.json();
      if (!response.ok) throw new Error("Shared gallery endpoint is unavailable");
      if (path === "/api/gallery/config") {
        if (
          !object(body) ||
          Object.keys(body).some((key) => !["ready", "url", "publishableKey"].includes(key)) ||
          body.ready !== true ||
          !safeGalleryPublicKey(body.publishableKey)
        )
          throw new Error("Shared gallery config is unready or contains unsafe credentials");
        storageOrigin = publicGalleryOrigin(body.url);
      } else if (!storageOrigin || !validPublicGalleryCollection(body, storageOrigin)) {
        throw new Error("Shared gallery public data is invalid or exposes private post metadata");
      }
      results.push({ path, ok: true, status, kind: "gallery" });
    } catch {
      // Never echo an untrusted config response or a potentially leaked key.
      results.push({
        path,
        ok: false,
        status,
        kind: "gallery",
        error: "Shared gallery readiness verification failed",
      });
    }
  }
  return results;
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
  let sharedGallery = false;

  if (expectedSha) {
    try {
      const response = await request(
        fetchImpl,
        new URL("/release-identity.json", origin),
        bypassToken,
        timeoutMs,
      );
      const identity = await response.json();
      if (!response.ok || identity.sha !== expectedSha || !Array.isArray(identity.assets)) {
        throw new Error("Public release does not match the expected main commit");
      }
      sharedGallery = identity.sharedGallery === true;
      results.push({
        path: "/release-identity.json",
        ok: true,
        status: response.status,
        kind: "identity",
      });
      for (const asset of identity.assets) {
        if (!/^\/(gallery\/|saga-extreme-)/u.test(asset.path) || asset.path.includes(".."))
          throw new Error("Invalid release asset path");
        const delivered = await request(
          fetchImpl,
          new URL(asset.path, origin),
          bypassToken,
          timeoutMs,
        );
        const digest = createHash("sha256")
          .update(Buffer.from(await delivered.arrayBuffer()))
          .digest("hex");
        results.push({
          path: asset.path,
          ok: delivered.ok && digest === asset.sha256,
          status: delivered.status,
          kind: "asset",
        });
      }
    } catch (error) {
      results.push({
        path: "/release-identity.json",
        ok: false,
        status: null,
        kind: "identity",
        error: String(error),
      });
    }
  }

  if (sharedGallery)
    results.push(...(await verifySharedGallery(fetchImpl, origin, bypassToken, timeoutMs)));

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
