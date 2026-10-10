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

test("public verification hashes Blender frame and exhibition assets and rejects changed bytes or unknown paths", async () => {
  const paths = [
    "/ultra-materials/manifest.json",
    "/ultra-materials/brushed-alloy-normal.png",
    "/ultra-materials/brushed-alloy-roughness.png",
    "/ultra-materials/frame-rim.png",
    "/exhibition-studio/manifest.json",
    "/exhibition-studio/studio-light.hdr",
    "/exhibition-studio/plaster-normal.png",
    "/exhibition-studio/plaster-roughness.png",
    "/saga-cinema-assets/chapter-1.jpg",
    "/saga-cinema-assets/chapter-2.jpg",
    "/saga-cinema-assets/chapter-3.jpg",
    "/saga-cinema-assets/chapter-4.jpg",
    "/saga-cinema-assets/saga-logo-original.webp",
    "/saga-cinema-assets/menu-thumbnail.webp",
    "/saga-cinema-assets/michroma-latin.woff2",
  ];
  const bytes = new Map(
    paths.map((path) => [path, readFileSync(new URL(`../public${path}`, import.meta.url))]),
  );
  const assets = paths.map((path) => ({
    path,
    sha256: createHash("sha256").update(bytes.get(path)).digest("hex"),
  }));
  const run = async ({ changed, unknown } = {}) => {
    const seen = [];
    const report = await verifyPublicDeployment({
      baseUrl: "https://example.test",
      expectedSha: "a".repeat(40),
      fetchImpl: async (input) => {
        const path = new URL(input).pathname;
        seen.push(path);
        if (path === "/release-identity.json")
          return Response.json({
            sha: "a".repeat(40),
            assets: unknown ? [{ path: unknown, sha256: "0".repeat(64) }] : assets,
          });
        if (bytes.has(path))
          return new Response(changed === path ? Buffer.from("changed") : bytes.get(path));
        if (RETIRED_AI_ROUTES.includes(path)) return new Response("Not Found", { status: 404 });
        return new Response("Deception World");
      },
    });
    return { report, seen };
  };
  const valid = await run();
  assert.equal(valid.report.ok, true);
  assert.deepEqual(
    valid.report.results.filter(({ kind }) => kind === "asset").map(({ path }) => path),
    paths,
  );
  for (const changed of paths) assert.equal((await run({ changed })).report.ok, false, changed);
  for (const unknown of [
    "/ultra-materials/unknown.png",
    "/ultra-materials/frame-rim.png/extra",
    "/ultra-materials/../secret.png",
    "/exhibition-studio/unknown.hdr",
    "/exhibition-studio/studio-light.hdr/extra",
    "/exhibition-studio/../secret.png",
    "/saga-cinema-assets/unknown.jpg",
    "/saga-cinema-assets/chapter-5.jpg",
    "/saga-cinema-assets/chapter-1.jpg/extra",
    "/saga-cinema-assets/../secret.png",
  ]) {
    const invalid = await run({ unknown });
    assert.equal(invalid.report.ok, false, unknown);
    assert.equal(
      invalid.seen.some(
        (path) =>
          path.startsWith("/ultra-materials/") ||
          path.startsWith("/exhibition-studio/") ||
          path.startsWith("/saga-cinema-assets/"),
      ),
      false,
    );
  }
});

test("publication covers the new shared search and personal library routes", () => {
  assert.ok(PUBLIC_SMOKE_ROUTES.includes("/search"));
  assert.ok(PUBLIC_SMOKE_ROUTES.includes("/library"));
  assert.ok(PUBLIC_SMOKE_ROUTES.includes("/exhibition"));
  assert.ok(PUBLIC_SMOKE_ROUTES.includes("/saga-cinema"));
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
  uploadProtocol: 2,
  maxFileBytes: 19 * 1024 * 1024,
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
    g80: { title: "追加の作品名", version: 1 },
    g99: { title: "二桁の最後", version: 1 },
    g100: { title: "三桁の初め", version: 1 },
    g113: { title: "追加の最後", version: 1 },
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

test("shared gallery release gate accepts each lossless upload format with the exact signed object path", async () => {
  for (const format of ["jpeg", "png", "webp"]) {
    const collection = galleryCollection();
    collection.posts[0].url = `https://gallery.supabase.co/storage/v1/object/sign/gallery-images/${POST_ID}.${format}?token=public-image-token`;
    assert.equal((await sharedGalleryReport({ collection })).report.ok, true, format);
  }
  for (const suffix of ["jpg", "gif", "svg", "png/extra", "png%2fextra"]) {
    const collection = galleryCollection();
    collection.posts[0].url = `https://gallery.supabase.co/storage/v1/object/sign/gallery-images/${POST_ID}.${suffix}?token=public-image-token`;
    assert.equal((await sharedGalleryReport({ collection })).report.ok, false, suffix);
  }
});

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
      encoding === "utf8"
        ? JSON.stringify({
            items: Array.from({ length: 113 }, (_, index) => {
              const id = `g${String(index + 1).padStart(2, "0")}`;
              const width = index === 78 ? 1672 : 1800;
              return {
                id,
                variants: [
                  { path: `/gallery/${id}-480.webp`, width: 480 },
                  { path: `/gallery/${id}-${width}.webp`, width },
                ],
              };
            }),
          })
        : Buffer.from(path),
    writeFileSync: (path, value) => {
      assert.equal(path, "public/release-identity.json");
      written = JSON.parse(value);
    },
    console: { log() {} },
  });
  assert.equal(written.sharedGallery, true);
  assert.equal(written.sha, SHA);
  assert.equal(written.artworks, 113);
  assert.ok(written.assets.some((asset) => asset.path === "/gallery/g79-1672.webp"));
  assert.ok(written.assets.some((asset) => asset.path === "/gallery/g113-1800.webp"));
  for (const path of [
    "/ultra-materials/manifest.json",
    "/ultra-materials/brushed-alloy-normal.png",
    "/ultra-materials/brushed-alloy-roughness.png",
    "/ultra-materials/frame-rim.png",
    "/exhibition-studio/manifest.json",
    "/exhibition-studio/studio-light.hdr",
    "/exhibition-studio/plaster-normal.png",
    "/exhibition-studio/plaster-roughness.png",
  ]) {
    const asset = written.assets.find((item) => item.path === path);
    assert.ok(asset, `${path} must be attested before production promotion`);
    assert.equal(
      asset.sha256,
      createHash("sha256")
        .update(Buffer.from(`public${path}`))
        .digest("hex"),
    );
  }
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
    {
      ready: true,
      url: "https://gallery.supabase.co",
      publishableKey: "sb_publishable_public_test",
    },
    { ...galleryConfig(), uploadProtocol: 1 },
    { ...galleryConfig(), maxFileBytes: 20 * 1024 * 1024 },
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
    ...["g00", "g001", "g0113", "g114", "g999"].map((id) => ({
      posts: [post],
      titles: { [id]: { title: "invalid", version: 0 } },
    })),
    { posts: [post], titles: { g79: { title: "stale", version: -1 } } },
    { posts: [{ ...post, ownerId: "private-session-id" }], titles: valid.titles },
    { posts: [{ ...post, canDelete: true }], titles: valid.titles },
    { posts: [{ ...post, width: 40_000_001, height: 1 }], titles: valid.titles },
    { posts: [{ ...post, width: 10_000, height: 4001 }], titles: valid.titles },
    { posts: [{ ...post, width: Number.MAX_SAFE_INTEGER, height: 1 }], titles: valid.titles },
    { posts: [{ ...post, width: 5000.5, height: 8000 }], titles: valid.titles },
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

test("shared-gallery gate accepts exact 40 MP originals without a 2400px edge cap", async () => {
  const valid = galleryCollection();
  const post = valid.posts[0];
  for (const dimensions of [
    { width: 5000, height: 8000 },
    { width: 8000, height: 5000 },
    { width: 40_000_000, height: 1 },
  ]) {
    const collection = {
      ...valid,
      posts: [{ ...post, ...dimensions }],
    };
    assert.equal((await sharedGalleryReport({ collection })).report.ok, true);
  }
});

test("shared-gallery gate accepts all 113 static titles together with the 1000-post quota", async () => {
  const template = galleryCollection().posts[0];
  const posts = Array.from({ length: 1000 }, (_, index) => {
    const id = `u-00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`;
    return {
      ...template,
      id,
      sequence: index + 1,
      url: `https://gallery.supabase.co/storage/v1/object/sign/gallery-images/${id}.webp?token=public-image-token`,
    };
  });
  const titles = Object.fromEntries(
    [
      ...Array.from({ length: 113 }, (_, index) => `g${String(index + 1).padStart(2, "0")}`),
      ...posts.map((post) => post.id),
    ].map((id) => [id, { title: "共有の作品名", version: 1 }]),
  );
  assert.equal(Object.keys(titles).length, 1113);
  assert.equal((await sharedGalleryReport({ collection: { posts, titles } })).report.ok, true);
  assert.equal(
    (
      await sharedGalleryReport({
        collection: {
          posts,
          titles: { ...titles, g114: { title: "対象外", version: 0 } },
        },
      })
    ).report.ok,
    false,
  );
});
