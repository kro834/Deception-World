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

test("Ciel sequin release permits only the four attested artwork and Blender delivery paths", async () => {
  const paths = [
    "/ciel-sequin-20261028/ciel-768.webp",
    "/ciel-sequin-20261028/ciel-1536.webp",
    "/ciel-sequin-studio-20261028/studio.webp",
    "/ciel-sequin-studio-20261028/provenance.json",
  ];
  const bodies = new Map(
    paths.map((path) => [path, readFileSync(new URL(`../public${path}`, import.meta.url))]),
  );
  const assets = paths.map((path) => ({
    path,
    sha256: createHash("sha256").update(bodies.get(path)).digest("hex"),
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
        if (bodies.has(path)) return new Response(changed === path ? "changed" : bodies.get(path));
        return smokeResponse(path);
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
    "/ciel-sequin-20261028/ciel-1086.webp",
    "/ciel-sequin-studio-20261028/studio.png",
    "/ciel-sequin-studio-20261028/source.blend",
    ...paths.flatMap((path) =>
      [".bak", "/extra", "?x=1", "#x", "\n", "%2fextra"].map((suffix) => path + suffix),
    ),
  ]) {
    const { report, seen } = await run({ unknown });
    assert.equal(report.ok, false, unknown);
    assert.equal(
      seen.slice(1).some((path) => path.startsWith("/ciel-sequin")),
      false,
      unknown,
    );
    assert.ok(
      report.results.some((result) => result.error?.includes("Invalid release asset path")),
      unknown,
    );
  }
});

const flushTransport = async () => {
  for (let i = 0; i < 250; i++) await Promise.resolve();
};
const smokeResponse = (path) =>
  RETIRED_AI_ROUTES.includes(path)
    ? new Response("not found", { status: 404 })
    : new Response("Deception World");

test("the authenticated curl adapter forwards the per-attempt abort signal without changing delivered bytes", async () => {
  const source = readFileSync(new URL("./verify-public-deployment.mjs", import.meta.url), "utf8");
  const adapter = source
    .slice(
      source.indexOf("export async function vercelCurlFetch"),
      source.indexOf("export const PUBLIC_SMOKE_ROUTES"),
    )
    .replace("export async", "async");
  const exports = {},
    controller = new AbortController();
  let observed;
  runInNewContext(`${adapter}; exports.fetch = vercelCurlFetch;`, {
    exports,
    Response,
    runFile: async (command, args, options) => {
      observed = { command, args, options };
      return { stdout: Buffer.from("delivered bytes\n200") };
    },
  });
  const response = await exports.fetch("https://example.test/dream-chapter", {
    signal: controller.signal,
  });
  assert.equal(observed.options.signal, controller.signal);
  assert.equal(observed.command, "vercel");
  assert.ok(observed.args.includes("--max-time"));
  assert.equal(response.status, 200);
  assert.equal(await response.text(), "delivered bytes");
});

test("transient transport failures retry twice with bounded backoff and independent live signals", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const attempts = [];
  const pending = verifyPublicDeployment({
    baseUrl: "https://example.test",
    bypassToken: "preview-secret",
    timeoutMs: 100,
    fetchImpl: (url, init) => {
      const path = new URL(url).pathname;
      if (path === "/dream-chapter") {
        attempts.push(init);
        if (attempts.length <= 2) throw new Error("preview-secret: temporary failure");
      }
      return Promise.resolve(smokeResponse(path));
    },
  });
  await flushTransport();
  assert.equal(attempts.length, 1);
  t.mock.timers.tick(249);
  await flushTransport();
  assert.equal(attempts.length, 1, "no immediate retry loop");
  t.mock.timers.tick(1);
  await flushTransport();
  assert.equal(attempts.length, 2);
  t.mock.timers.tick(749);
  await flushTransport();
  assert.equal(attempts.length, 2);
  t.mock.timers.tick(1);
  await flushTransport();
  assert.equal(attempts.length, 3);
  assert.equal((await pending).ok, true);
  assert.equal(new Set(attempts.map(({ signal }) => signal)).size, 3);
  assert.ok(
    attempts.every(({ signal }) => !signal.aborted),
    "failed attempt timers were cleared",
  );
  assert.ok(
    attempts.every(({ headers }) => headers["x-vercel-protection-bypass"] === "preview-secret"),
  );
  t.mock.timers.tick(1000);
  assert.ok(
    attempts.every(({ signal }) => !signal.aborted),
    "success clears its timeout too",
  );
});

test("persistent transport failures stop at three attempts and report no raw secrets", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let attempts = 0;
  const pending = verifyPublicDeployment({
    baseUrl: "https://example.test",
    bypassToken: "never-print-token",
    fetchImpl: async (url) => {
      const path = new URL(url).pathname;
      if (path === "/dream-chapter") {
        attempts++;
        throw new Error("url?token=never-print-token; headers=secret-header");
      }
      return smokeResponse(path);
    },
  });
  await flushTransport();
  t.mock.timers.tick(250);
  await flushTransport();
  t.mock.timers.tick(750);
  await flushTransport();
  const report = await pending;
  assert.equal(attempts, 3);
  assert.equal(report.ok, false);
  assert.deepEqual(
    report.results.find(({ path }) => path === "/dream-chapter"),
    {
      path: "/dream-chapter",
      ok: false,
      status: null,
      kind: "public",
      error: "Error: Network request failed after 3 attempts",
    },
  );
  assert.doesNotMatch(JSON.stringify(report), /never-print-token|secret-header/);
  assert.equal(report.results.at(-1).path, RETIRED_AI_ROUTES.at(-1), "remaining checks still run");
  t.mock.timers.tick(100000);
  await flushTransport();
  assert.equal(attempts, 3);
});

test("each timed-out attempt aborts independently and bounded retries end as a failure", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const signals = [];
  const pending = verifyPublicDeployment({
    baseUrl: "https://example.test",
    timeoutMs: 10,
    fetchImpl: async (url, { signal }) => {
      const path = new URL(url).pathname;
      if (path !== "/dream-chapter") return smokeResponse(path);
      signals.push(signal);
      return new Promise((_, reject) =>
        signal.addEventListener("abort", () => reject(new Error("private timeout internals")), {
          once: true,
        }),
      );
    },
  });
  await flushTransport();
  for (const [index, delay] of [250, 750, null].entries()) {
    assert.equal(signals.length, index + 1);
    assert.equal(signals[index].aborted, false);
    t.mock.timers.tick(10);
    await flushTransport();
    assert.equal(signals[index].aborted, true);
    if (delay !== null) {
      t.mock.timers.tick(delay);
      await flushTransport();
    }
  }
  const report = await pending;
  assert.equal(signals.length, 3);
  assert.equal(report.ok, false);
  assert.equal(
    report.results.find(({ path }) => path === "/dream-chapter").error,
    "Error: Request timed out after 3 attempts",
  );
  assert.doesNotMatch(JSON.stringify(report), /private timeout internals/);
});

test("HTTP failures and incorrect content, identity, JSON or artwork never retry", async () => {
  for (const failure of ["http", "content", "identity", "json", "hash"]) {
    const seen = new Map();
    const expectedSha = "a".repeat(40);
    const report = await verifyPublicDeployment({
      baseUrl: "https://example.test",
      expectedSha,
      fetchImpl: async (url) => {
        const path = new URL(url).pathname;
        seen.set(path, (seen.get(path) || 0) + 1);
        if (path === "/release-identity.json") {
          if (failure === "json") return new Response("invalid JSON");
          return Response.json({
            sha: failure === "identity" ? "b".repeat(40) : expectedSha,
            assets:
              failure === "hash"
                ? [{ path: "/gallery/g69-1536.webp", sha256: "0".repeat(64) }]
                : [],
          });
        }
        if (path === "/gallery/g69-1536.webp") return new Response("wrong artwork");
        if (path === "/dream-chapter" && failure === "http")
          return new Response("Deception World", { status: 503 });
        if (path === "/dream-chapter" && failure === "content")
          return new Response("wrong document");
        return smokeResponse(path);
      },
    });
    assert.equal(report.ok, false, failure);
    assert.ok(
      [...seen.values()].every((count) => count === 1),
      failure,
    );
  }
});

const RAIN_CITY_ASSET_PATHS = [
  "/rain-city-materials/concrete-albedo.webp",
  "/rain-city-materials/concrete-normal.png",
  "/rain-city-materials/concrete-roughness.png",
  "/rain-city-materials/asphalt-albedo.webp",
  "/rain-city-materials/asphalt-normal.png",
  "/rain-city-materials/asphalt-roughness.png",
  "/rain-city-materials/manifest.json",
];
const DOGS_ARCHIVE_ASSET_PATHS = [
  // Owner (2026-10-29): v3 model and manifest in dogs-archive-20261029; decoders unchanged.
  "/dogs-archive-20261029/guardian-v3.glb",
  "/dogs-archive-20261029/model-manifest.json",
  "/dogs-archive-20261028/decoders/draco/draco_decoder.wasm",
  "/dogs-archive-20261028/decoders/draco/draco_wasm_wrapper.js",
  "/dogs-archive-20261028/decoders/draco/draco_decoder.js",
  "/dogs-archive-20261028/decoders/draco/asset-manifest.json",
];

test("guardian release verification checks the model and local decoders without broadening asset access", async () => {
  const payloads = new Map(
    DOGS_ARCHIVE_ASSET_PATHS.map((path) => [path, Buffer.from(`asset:${path}`)]),
  );
  const assets = DOGS_ARCHIVE_ASSET_PATHS.map((path) => ({
    path,
    sha256: createHash("sha256").update(payloads.get(path)).digest("hex"),
  }));
  const run = async ({ changed, unknown } = {}) => {
    const seen = [];
    const report = await verifyPublicDeployment({
      baseUrl: "https://example.test",
      expectedSha: SHA,
      fetchImpl: async (input) => {
        const path = new URL(input).pathname;
        seen.push(path);
        if (path === "/release-identity.json")
          return Response.json({
            sha: SHA,
            assets: unknown ? [{ path: unknown, sha256: "0".repeat(64) }] : assets,
          });
        if (payloads.has(path))
          return new Response(path === changed ? "wrong model or decoder" : payloads.get(path));
        return smokeResponse(path);
      },
    });
    return { report, seen };
  };
  const valid = await run();
  assert.equal(valid.report.ok, true);
  assert.deepEqual(
    valid.report.results.filter(({ kind }) => kind === "asset").map(({ path }) => path),
    DOGS_ARCHIVE_ASSET_PATHS,
  );
  assert.ok(valid.seen.includes("/dogs-archive"), "the new route is also checked before promotion");
  for (const changed of DOGS_ARCHIVE_ASSET_PATHS)
    assert.equal((await run({ changed })).report.ok, false, changed);
  for (const unknown of [
    "/dogs-archive-20261029/unknown.glb",
    "/dogs-archive-20261028/guardian-v.glb",
    "/dogs-archive-20261028/decoders/draco/unknown.js",
    "/dogs-archive-20261029/../secret",
    ...["/extra", "?extra=1", "#extra", "%2fextra", "\n"].map(
      (suffix) => `${DOGS_ARCHIVE_ASSET_PATHS[0]}${suffix}`,
    ),
  ]) {
    const { report, seen } = await run({ unknown });
    assert.equal(report.ok, false, unknown);
    assert.ok(
      report.results.some(
        ({ kind, ok, error }) =>
          kind === "identity" && !ok && error.includes("Invalid release asset path"),
      ),
      unknown,
    );
    assert.ok(
      seen.every((path) => !path.startsWith("/dogs-archive-2026")),
      "invalid paths are rejected before fetch",
    );
  }
});
const CIEL_BUTTON_PATHS = [144, 216, 360].map((width) => `/ciel-button-20261018-${width}.webp`);
const CIEL_INFERNO_PATHS = [
  ...[216, 720, 1080].map((width) => `/ciel-inferno-20261019/ciel-${width}.webp`),
  "/ciel-inferno-20261019/artwork-manifest.json",
  "/ciel-inferno-20261019/jet.webp",
  "/ciel-inferno-20261019/jet-manifest.json",
];

test("rain-city release verification accepts exactly seven material paths and checks every delivered byte", async () => {
  const bytes = new Map(RAIN_CITY_ASSET_PATHS.map((path) => [path, Buffer.from(`asset:${path}`)]));
  const assets = RAIN_CITY_ASSET_PATHS.map((path) => ({
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
          return new Response(path === changed ? Buffer.from("changed material") : bytes.get(path));
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
    RAIN_CITY_ASSET_PATHS,
  );
  for (const changed of RAIN_CITY_ASSET_PATHS) {
    const { report } = await run({ changed });
    assert.equal(report.ok, false, changed);
    assert.equal(report.results.find(({ path }) => path === changed)?.ok, false, changed);
  }
  for (const unknown of [
    "/rain-city-materials/unknown.png",
    "/rain-city-materials/concrete-albedo.png",
    "/rain-city-materials/asphalt-normal.webp",
    "/rain-city-materials/../secret.png",
    "/rain-city-materials/%2e%2e/secret.png",
    "/rain-city-materials/%2E%2E/secret.png",
    "/rain-city-materials/concrete-normal.png/../../secret.png",
    "/rain-city-materials//concrete-normal.png",
    ...RAIN_CITY_ASSET_PATHS.flatMap((path) =>
      ["/extra", "%2fextra", ".bak", "?extra=1", "#extra", "\n", "\r\n"].map(
        (suffix) => `${path}${suffix}`,
      ),
    ),
  ]) {
    const { report, seen } = await run({ unknown });
    assert.equal(report.ok, false, unknown);
    assert.ok(
      report.results.some(
        ({ kind, ok, error }) =>
          kind === "identity" && !ok && error.includes("Invalid release asset path"),
      ),
      unknown,
    );
    assert.equal(
      report.results.some(({ kind }) => kind === "asset"),
      false,
      unknown,
    );
    assert.equal(
      seen.length,
      1 + PUBLIC_SMOKE_ROUTES.length + RETIRED_AI_ROUTES.length,
      `must reject before fetching ${unknown}`,
    );
  }
});

test("public verification hashes exhibition, cinema and authored Rexonance assets and rejects changed bytes or unknown paths", async () => {
  const paths = [
    ...CIEL_INFERNO_PATHS,
    "/rexonance-flame-20261019/flame.webp",
    "/rexonance-flame-20261019/manifest.json",
    "/rexonance-flame-natural-20261019/flame.webp",
    "/rexonance-flame-natural-20261019/manifest.json",
    ...CIEL_BUTTON_PATHS,
    "/rexonance-forms-20261011/excelsior-cutout-20261012.webp",
    "/rider-rexonance-excelsior-cutout-20261012.webp",
    "/rider-rexonance-excelsior-cutout-20261012-delivery-640.webp",
    "/rider-rexonance-excelsior-cutout-20261012-delivery-960.webp",
    "/rider-rexonance-excelsior-cutout-20261012-delivery-1022.webp",
    "/exhibition-metal/manifest.json",
    "/exhibition-metal/brushed-alloy-normal.png",
    "/exhibition-metal/brushed-alloy-roughness.png",
    "/exhibition-studio/manifest.json",
    "/exhibition-studio/studio-light.hdr",
    "/exhibition-studio/plaster-normal.png",
    "/exhibition-studio/plaster-roughness.png",
    "/saga-cinema-assets/chapter-1.jpg",
    "/saga-cinema-assets/chapter-2.jpg",
    "/saga-cinema-assets/chapter-3.jpg",
    "/saga-cinema-assets/chapter-4.jpg",
    "/saga-cinema-assets/saga-logo-original.webp",
    "/saga-cinema-assets/saga-logo-640.webp",
    "/saga-cinema-assets/menu-thumbnail.webp",
    "/saga-cinema-assets/menu-thumbnail-20261012.webp",
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
    "/ciel-inferno-20261019/unknown.webp",
    "/ciel-inferno-20261019/ciel-144.webp",
    "/ciel-inferno-20261020/jet.webp",
    "/ciel-inferno-20261019/../secret.png",
    ...CIEL_INFERNO_PATHS.flatMap((path) =>
      ["/extra", "%2fextra", ".bak", "?x=1", "#extra", "\n", "\r\n"].map((suffix) => path + suffix),
    ),
    "/rexonance-flame-20261019/unknown.webp",
    "/rexonance-flame-20261020/flame.webp",
    "/rexonance-flame-natural-20261019/unknown.webp",
    "/rexonance-flame-natural-20261020/flame.webp",
    ...["flame.webp", "manifest.json"].flatMap((name) =>
      ["/extra", "%2fextra", ".bak", "?x=1", "#extra", "\n", "\r\n"].map(
        (suffix) => `/rexonance-flame-natural-20261019/${name}${suffix}`,
      ),
    ),
    ...["flame.webp", "manifest.json"].flatMap((name) =>
      ["/extra", "%2fextra", ".bak", "?x=1", "#extra", "\n", "\r\n"].map(
        (suffix) => `/rexonance-flame-20261019/${name}${suffix}`,
      ),
    ),
    "/ciel-button-20261018-720.webp",
    "/ciel-button-20261019-144.webp",
    ...CIEL_BUTTON_PATHS.flatMap((path) =>
      ["/extra", "%2fextra", ".bak", "?x=1", "#extra", "\n", "\r\n"].map((suffix) => path + suffix),
    ),
    "/rexonance-forms-20261011/unknown.webp",
    "/rexonance-forms-20261011/excelsior-cutout-20261012.webp/extra",
    "/rider-rexonance-excelsior-cutout-20261012-delivery-2048.webp",
    "/rider-rexonance-excelsior-cutout-20261012.webp%2fextra",
    "/exhibition-metal/unknown.png",
    "/exhibition-metal/brushed-alloy-normal.png/extra",
    "/exhibition-metal/brushed-alloy-roughness.png%2fextra",
    "/exhibition-metal/../secret.png",
    "/exhibition-studio/unknown.hdr",
    "/exhibition-studio/studio-light.hdr/extra",
    "/exhibition-studio/../secret.png",
    "/saga-cinema-assets/unknown.jpg",
    "/saga-cinema-assets/saga-logo-960.webp",
    "/saga-cinema-assets/saga-logo-640.webp/extra",
    "/saga-cinema-assets/menu-thumbnail-20261013.webp",
    "/saga-cinema-assets/menu-thumbnail-20261012.webp/extra",
    "/saga-cinema-assets/chapter-5.jpg",
    "/saga-cinema-assets/chapter-1.jpg/extra",
    "/saga-cinema-assets/../secret.png",
  ]) {
    const invalid = await run({ unknown });
    assert.equal(invalid.report.ok, false, unknown);
    assert.equal(
      invalid.seen.some(
        (path) =>
          path.startsWith("/rexonance-forms-20261011/") ||
          path.startsWith("/rider-rexonance-excelsior-cutout-20261012") ||
          path.startsWith("/exhibition-metal/") ||
          path.startsWith("/exhibition-studio/") ||
          path.startsWith("/rexonance-flame-") ||
          path.startsWith("/ciel-button-") ||
          path.startsWith("/ciel-inferno-") ||
          path.startsWith("/saga-cinema-assets/"),
      ),
      false,
    );
  }
});

test("retired Ultra material paths and frame assets cannot be requested by a release identity", async () => {
  for (const retiredPath of [
    "/ultra-materials/manifest.json",
    "/ultra-materials/brushed-alloy-normal.png",
    "/ultra-materials/brushed-alloy-roughness.png",
    "/ultra-materials/frame-rim.png",
    "/exhibition-metal/frame-rim.png",
  ]) {
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
            assets: [{ path: retiredPath, sha256: "0".repeat(64) }],
          });
        if (RETIRED_AI_ROUTES.includes(path)) return new Response("Not Found", { status: 404 });
        return new Response("Deception World");
      },
    });
    assert.equal(report.ok, false, retiredPath);
    assert.equal(
      report.results.some(
        ({ kind, ok, error }) =>
          kind === "identity" && !ok && error.includes("Invalid release asset path"),
      ),
      true,
      retiredPath,
    );
    assert.equal(seen.includes(retiredPath), false, `must reject before fetching ${retiredPath}`);
    assert.equal(
      report.results.some(({ kind }) => kind === "asset"),
      false,
      retiredPath,
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
  assert.ok(written.assets.some((asset) => asset.path === "/saga-extreme-ultra-20261006.jpeg"));
  assert.ok(
    written.assets.every(
      ({ path }) => !path.startsWith("/ultra-materials/") && !path.endsWith("/frame-rim.png"),
    ),
  );
  for (const path of [
    ...CIEL_INFERNO_PATHS,
    ...CIEL_BUTTON_PATHS,
    "/saga-cinema-assets/saga-logo-original.webp",
    "/saga-cinema-assets/saga-logo-640.webp",
    "/exhibition-metal/manifest.json",
    "/exhibition-metal/brushed-alloy-normal.png",
    "/exhibition-metal/brushed-alloy-roughness.png",
    "/exhibition-studio/manifest.json",
    "/exhibition-studio/studio-light.hdr",
    "/exhibition-studio/plaster-normal.png",
    "/exhibition-studio/plaster-roughness.png",
    ...RAIN_CITY_ASSET_PATHS,
    ...DOGS_ARCHIVE_ASSET_PATHS,
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
  assert.deepEqual(
    written.assets
      .filter(({ path }) => path.startsWith("/rain-city-materials/"))
      .map(({ path }) => path),
    RAIN_CITY_ASSET_PATHS,
    "the release attests exactly the seven runtime material paths",
  );
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

test("renewal verifies both new routes and exact Blender asset paths with delivered hashes", async () => {
  assert.ok(PUBLIC_SMOKE_ROUTES.includes("/world-map"));
  assert.ok(PUBLIC_SMOKE_ROUTES.includes("/transformation-lab"));
  const paths = ["rexonance.webp", "far-from.webp", "illusionculum.webp", "provenance.json"].map(
    (name) => `/nanite-surface-20261031/${name}`,
  );
  const bytes = Buffer.from("material delivery");
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  for (const path of [
    ...paths,
    ...paths.map((path) => path + ".bak"),
    "/nanite-surface-20261031/source.blend",
  ]) {
    const seen = [];
    const report = await verifyPublicDeployment({
      baseUrl: "https://example.test",
      expectedSha: "a".repeat(40),
      fetchImpl: async (url) => {
        const requested = new URL(url).pathname;
        seen.push(requested);
        if (requested === "/release-identity.json")
          return Response.json({ sha: "a".repeat(40), assets: [{ path, sha256 }] });
        if (requested === path) return new Response(bytes);
        return smokeResponse(requested);
      },
    });
    assert.equal(report.ok, paths.includes(path), path);
    assert.equal(seen.includes(path), paths.includes(path), path);
  }
});
