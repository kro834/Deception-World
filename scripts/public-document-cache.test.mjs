import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  cachePublicDocumentResponse,
  isPublicDocumentRequest,
  PUBLIC_DOCUMENT_PATHS,
} from "../server/lib/public-document-cache.ts";
import publicDocumentCacheMiddleware from "../server/middleware/public-document-cache.ts";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const request = (path = "/", { method = "GET", headers = {} } = {}) => ({
  url: new URL(path, "https://deception-world.vercel.app"),
  req: { method, headers: new Headers({ accept: "text/html", ...headers }) },
});
const html = (headers = {}, status = 200) =>
  new Response("<html><body>Public story</body></html>", {
    status,
    headers: { "content-type": "text/html; charset=utf-8", ...headers },
  });

test("only exact anonymous public document GETs enter the shared cache", () => {
  for (const path of PUBLIC_DOCUMENT_PATHS)
    assert.equal(isPublicDocumentRequest(request(path)), true);
  for (const path of [
    "/gallery",
    "/search",
    "/library",
    "/api/gallery",
    "/api/auth/get-session",
    "/auth/popup",
    "/sign-in",
    "/__grok/manifest.webmanifest",
    "/release-identity.json",
    "/world/unknown",
    "/world?install=1&platform=ios",
    "/world?guide=forms",
    "/world?from=cast-roster",
    "/world?_serverFnId=private",
  ])
    assert.equal(isPublicDocumentRequest(request(path)), false, path);
  for (const method of ["POST", "PUT", "DELETE", "HEAD", "OPTIONS"])
    assert.equal(isPublicDocumentRequest(request("/world", { method })), false, method);
});

test("all cookie, authorization, range and non-document requests cannot populate the cache", () => {
  for (const headers of [
    { cookie: "session=private" },
    { cookie: "unknown-future-cookie=1" },
    { cookie: "" },
    { authorization: "Bearer secret" },
    { authorization: "" },
    { range: "bytes=0-100" },
    { accept: "application/json" },
    { accept: "text/x-component" },
    { accept: "" },
  ])
    assert.equal(isPublicDocumentRequest(request("/", { headers })), false);
});

test("edge-only TTL leaves browsers revalidating and preserves streamed bytes", async () => {
  const source = html({ "x-custom": "preserved", "cache-control": "max-age=0" });
  const response = cachePublicDocumentResponse(source);
  assert.notEqual(response, source);
  assert.equal(response.body, source.body);
  assert.equal(response.headers.get("cache-control"), "public, max-age=0, must-revalidate");
  assert.equal(
    response.headers.get("vercel-cdn-cache-control"),
    "max-age=60, stale-while-revalidate=300",
  );
  assert.equal(response.headers.get("x-custom"), "preserved");
  assert.equal(source.bodyUsed, false);
  assert.equal(await response.text(), "<html><body>Public story</body></html>");
});

test("private, cookie-setting, variant and unsuccessful responses remain untouched", () => {
  for (const headers of [
    { "set-cookie": "private=1" },
    { "cache-control": "private, max-age=0" },
    { "cache-control": "public, no-store" },
    { "cache-control": "no-cache" },
    { "cdn-cache-control": "private, max-age=0" },
    { "vercel-cdn-cache-control": "no-store" },
    { "content-disposition": "attachment" },
    { vary: "Cookie" },
    { vary: "Authorization" },
    { vary: "Accept-Encoding, x-session" },
    { vary: "*" },
    { "content-security-policy": "script-src 'nonce-per-request'" },
    { "content-security-policy-report-only": "script-src 'nonce-per-request'" },
    { "content-type": "application/json" },
  ]) {
    const source = html(headers);
    assert.equal(cachePublicDocumentResponse(source), source, JSON.stringify(headers));
  }
  for (const status of [301, 302, 401, 404, 500]) {
    const source = html({}, status);
    assert.equal(cachePublicDocumentResponse(source), source);
  }
  const encodingVariant = html({ vary: "Accept-Encoding" });
  assert.notEqual(cachePublicDocumentResponse(encodingVariant), encodingVariant);
});

test("middleware caches only eligible HTML and calls the next handler exactly once", async () => {
  for (const event of [
    request("/world"),
    request("/gallery"),
    request("/world", { headers: { cookie: "private=1" } }),
  ]) {
    let calls = 0;
    const source = html();
    const response = await publicDocumentCacheMiddleware(event, async () => {
      calls += 1;
      return source;
    });
    assert.equal(calls, 1);
    if (isPublicDocumentRequest(event)) assert.notEqual(response, source);
    else assert.equal(response, source);
  }
  const nonResponse = { privateData: "not-a-document" };
  assert.equal(await publicDocumentCacheMiddleware(request("/"), () => nonResponse), nonResponse);
});

test("consumed and locked streams are left alone", async () => {
  const used = html();
  await used.text();
  assert.equal(cachePublicDocumentResponse(used), used);
  const locked = html();
  const reader = locked.body.getReader();
  assert.equal(cachePublicDocumentResponse(locked), locked);
  reader.releaseLock();
});

test("cache stays scoped to the Nitro middleware rather than broad route/asset headers", () => {
  const middleware = read("server/middleware/public-document-cache.ts");
  assert.match(middleware, /isPublicDocumentRequest\(event\)/);
  assert.match(middleware, /result instanceof Response \? cachePublicDocumentResponse\(result\)/);
  assert.match(read("vite.config.ts"), /serverDir: "\.\/server"/);
  assert.doesNotMatch(
    JSON.stringify(JSON.parse(read("vercel.json"))),
    /s-maxage|immutable|31536000/,
  );
});

test("cached shells have no server session or request-scoped loader", () => {
  const provider = read("src/lib/auth/provider.tsx").split("export function AuthProvider")[1];
  assert.match(provider, /return <>{children}<\/>/);
  assert.doesNotMatch(provider, /getRequest\(|getSession\(|csrf|initialSession|useSession\(/);
  for (const route of [
    "__root",
    "index",
    "world",
    "dream-chapter",
    "saga-cinema",
    "final-stage",
    "rexonance-saga",
    "extreme-saga",
  ]) {
    const source = read(`src/routes/${route}.tsx`);
    assert.doesNotMatch(
      source,
      /\b(?:loader|beforeLoad)\s*:|createServerFn\(|getRequest\(|getSession\(|initialSession|csrf/,
    );
  }
});
