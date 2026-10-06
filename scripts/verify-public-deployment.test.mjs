import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";

test("public verification rejects an old commit or changed delivered artwork", async () => {
  const expectedSha = "a".repeat(40);
  const image = Buffer.from("current artwork");
  const sha256 = createHash("sha256").update(image).digest("hex");
  const fetchFor = (sha, delivered) => async (url) => {
    const path = new URL(url).pathname;
    if (path === "/release-identity.json")
      return Response.json({ sha, assets: [{ path: "/gallery/g69-1536.webp", sha256 }] });
    if (path.startsWith("/gallery/")) return new Response(delivered);
    if (RETIRED_AI_ROUTES.includes(path)) return new Response("not found", { status: 404 });
    return new Response("Deception World");
  };
  assert.equal(
    (
      await verifyPublicDeployment({
        baseUrl: "https://example.test",
        expectedSha,
        fetchImpl: fetchFor(expectedSha, image),
      })
    ).ok,
    true,
  );
  assert.equal(
    (
      await verifyPublicDeployment({
        baseUrl: "https://example.test",
        expectedSha,
        fetchImpl: fetchFor("b".repeat(40), image),
      })
    ).ok,
    false,
  );
  assert.equal(
    (
      await verifyPublicDeployment({
        baseUrl: "https://example.test",
        expectedSha,
        fetchImpl: fetchFor(expectedSha, "old artwork"),
      })
    ).ok,
    false,
  );
});

import {
  PUBLIC_SMOKE_ROUTES,
  RETIRED_AI_ROUTES,
  verifyPublicDeployment,
} from "./verify-public-deployment.mjs";

test("publication covers the new shared search and personal library routes", () => {
  assert.ok(PUBLIC_SMOKE_ROUTES.includes("/search"));
  assert.ok(PUBLIC_SMOKE_ROUTES.includes("/library"));
});

test("public smoke routes pass while all retired AI routes remain 404", async () => {
  const seen = [];
  const report = await verifyPublicDeployment({
    baseUrl: "https://example.test",
    bypassToken: "preview-token",
    fetchImpl: async (input, init) => {
      const path = new URL(input).pathname;
      seen.push({ path, headers: init.headers });
      return RETIRED_AI_ROUTES.includes(path)
        ? new Response("Not Found", { status: 404 })
        : new Response("<title>Deception World</title>", { status: 200 });
    },
  });
  assert.equal(report.ok, true);
  assert.equal(seen.length, PUBLIC_SMOKE_ROUTES.length + RETIRED_AI_ROUTES.length);
  assert.ok(seen.every(({ headers }) => headers["x-vercel-protection-bypass"] === "preview-token"));
});

test("a resurrected AI endpoint fails the release gate", async () => {
  const report = await verifyPublicDeployment({
    baseUrl: "https://example.test",
    fetchImpl: async (input) => {
      const path = new URL(input).pathname;
      if (path === "/intelligence") return new Response("AIに聞く", { status: 200 });
      return RETIRED_AI_ROUTES.includes(path)
        ? new Response("Not Found", { status: 404 })
        : new Response("Deception World", { status: 200 });
    },
  });
  assert.equal(report.ok, false);
  assert.equal(report.results.find(({ path }) => path === "/intelligence")?.ok, false);
});

const SHA = "a".repeat(40);
const POST_ID = "u-12345678-1234-4123-8123-123456789abc";
const galleryConfig = () => ({
  ready: true,
  url: "https://gallery.supabase.co",
  publishableKey: "sb_publishable_public_test",
});
const galleryCollection = () => ({
  posts: [
    {
      id: POST_ID,
      sequence: 1,
      width: 800,
      height: 1200,
      url: `https://gallery.supabase.co/storage/v1/object/sign/gallery-images/${POST_ID}.webp?token=public-image-token`,
      createdAt: "2026-10-06T00:00:00.000Z",
      deletedAt: null,
      canDelete: false,
    },
  ],
  titles: {
    g79: { title: "共有の作品名", version: 1 },
    [POST_ID]: { title: "来訪者の作品", version: 2 },
  },
});

async function sharedGalleryReport({
  config = galleryConfig(),
  collection = galleryCollection(),
  sharedGallery = true,
  configStatus = 200,
  galleryStatus = 200,
  invalidJsonPath,
  networkErrorPath,
} = {}) {
  const seen = [];
  const report = await verifyPublicDeployment({
    baseUrl: "https://example.test",
    expectedSha: SHA,
    bypassToken: "preview-only-bypass",
    fetchImpl: async (input, init) => {
      const path = new URL(input).pathname;
      seen.push({ path, init });
      if (path === networkErrorPath) throw new Error("network failure with secret internals");
      if (path === invalidJsonPath) return new Response("Deception World", { status: 200 });
      if (path === "/release-identity.json")
        return Response.json({
          sha: SHA,
          assets: [],
          ...(sharedGallery !== "omit" ? { sharedGallery } : {}),
        });
      if (path === "/api/gallery/config") return Response.json(config, { status: configStatus });
      if (path === "/api/gallery") return Response.json(collection, { status: galleryStatus });
      if (RETIRED_AI_ROUTES.includes(path)) return new Response("Not Found", { status: 404 });
      return new Response("Deception World");
    },
  });
  return { report, seen };
}

test("new release identity requires shared gallery readiness and preserves artwork identity", () => {
  const source = readFileSync(
    new URL("./build-release-identity.mjs", import.meta.url),
    "utf8",
  ).replace(/^import .*;\n/gmu, "");
  let written;
  runInNewContext(source, {
    process: { env: { PUBLIC_RELEASE_SHA: SHA } },
    createHash,
    execFileSync: () => {
      throw new Error("Expected exact supplied release SHA");
    },
    readFileSync: (path, encoding) =>
      encoding === "utf8" ? JSON.stringify({ items: Array(79).fill({}) }) : Buffer.from(path),
    writeFileSync: (path, value) => {
      assert.equal(path, "public/release-identity.json");
      written = JSON.parse(value);
    },
    console: { log() {} },
  });
  assert.equal(written.sharedGallery, true);
  assert.equal(written.sha, SHA);
  assert.equal(written.artworks, 79);
  assert.ok(written.assets.some((asset) => asset.path === "/gallery/g79-1672.webp"));
});

test("an attested shared-gallery release checks config and public data using only unauthenticated GETs", async () => {
  const { report, seen } = await sharedGalleryReport();
  assert.equal(report.ok, true);
  assert.deepEqual(
    report.results
      .filter((item) => item.kind === "gallery")
      .map(({ path, ok, status }) => ({ path, ok, status })),
    [
      { path: "/api/gallery/config", ok: true, status: 200 },
      { path: "/api/gallery", ok: true, status: 200 },
    ],
  );
  const requests = seen.filter(({ path }) => path.startsWith("/api/gallery"));
  assert.equal(requests.length, 2);
  assert.ok(
    requests.every(
      ({ init }) =>
        (init.method === undefined || init.method === "GET") &&
        init.body === undefined &&
        !Object.hasOwn(init.headers, "authorization") &&
        !Object.hasOwn(init.headers, "cookie"),
    ),
  );
  assert.ok(
    requests.every(
      ({ init }) => init.headers["x-vercel-protection-bypass"] === "preview-only-bypass",
    ),
  );
  const empty = await sharedGalleryReport({ collection: { posts: [], titles: {} } });
  assert.equal(empty.report.ok, true);
});

test("legacy release identities skip the new shared-gallery gate", async () => {
  for (const sharedGallery of ["omit", false, null, "true"]) {
    const { report, seen } = await sharedGalleryReport({
      sharedGallery,
      config: { ready: false },
      galleryStatus: 503,
    });
    assert.equal(report.ok, true);
    assert.ok(!seen.some(({ path }) => path.startsWith("/api/gallery")));
  }
});

test("shared-gallery gate rejects unready config, secret keys and unsafe URLs without printing credentials", async () => {
  const jwt = (role) =>
    `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ role })).toString("base64url")}.signature`;
  for (const config of [
    { ready: false },
    { ...galleryConfig(), publishableKey: "sb_secret_never_print_me" },
    { ...galleryConfig(), publishableKey: jwt("service_role") },
    { ...galleryConfig(), secretKey: "never_print_me" },
    { ...galleryConfig(), url: "http://gallery.supabase.co" },
    { ...galleryConfig(), url: "https://password:never_print_me@gallery.supabase.co" },
    { ...galleryConfig(), url: "https://gallery.supabase.co/path" },
  ]) {
    const { report } = await sharedGalleryReport({ config });
    assert.equal(report.ok, false);
    assert.equal(report.results.find(({ path }) => path === "/api/gallery/config").ok, false);
    assert.doesNotMatch(JSON.stringify(report), /never_print_me|service_role/);
  }
  assert.equal(
    (await sharedGalleryReport({ config: { ...galleryConfig(), publishableKey: jwt("anon") } }))
      .report.ok,
    true,
  );
});

test("shared-gallery gate rejects malformed, unavailable or private public data", async () => {
  const valid = galleryCollection();
  const post = valid.posts[0];
  for (const collection of [
    { posts: [], titles: [] },
    { posts: [post], titles: { g80: { title: "invalid", version: 0 } } },
    { posts: [post], titles: { g79: { title: "stale", version: -1 } } },
    { posts: [{ ...post, ownerId: "private-session-id" }], titles: valid.titles },
    { posts: [{ ...post, canDelete: true }], titles: valid.titles },
    { posts: [{ ...post, width: 2401 }], titles: valid.titles },
    { posts: [{ ...post, deletedAt: "2026-10-06T00:00:00.000Z" }], titles: valid.titles },
    { posts: [{ ...post, url: "javascript:alert(1)" }], titles: valid.titles },
    { posts: [{ ...post, url: "https://other.example/image.webp" }], titles: valid.titles },
    { posts: [post, post], titles: valid.titles },
  ]) {
    const { report } = await sharedGalleryReport({ collection });
    assert.equal(report.ok, false);
    assert.equal(report.results.find(({ path }) => path === "/api/gallery").ok, false);
  }
  for (const failure of [
    { configStatus: 503 },
    { galleryStatus: 503 },
    { invalidJsonPath: "/api/gallery/config" },
    { invalidJsonPath: "/api/gallery" },
    { networkErrorPath: "/api/gallery" },
  ])
    assert.equal((await sharedGalleryReport(failure)).report.ok, false);
});
