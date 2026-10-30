import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";
import { getRouteFamily } from "../src/lib/route-family.js";
import { getMenuPageContext } from "../src/lib/menu-page-context.ts";
import { SITE_PAGE_ENTRIES } from "../src/lib/site-page-registry.ts";
import {
  REXONANCE_DEFAULT_VIEW,
  REXONANCE_VIEWS,
  rexonanceFitDistance,
  rexonanceFrameInsets,
  rexonanceOrbitLimits,
  rexonanceView,
  rexonanceViewDirection,
} from "../src/lib/rexonance-3d/views.ts";
import {
  isRexonanceRibbon,
  readRexonanceGlint,
  rexonanceBendAxis,
  rexonanceFamilyOf,
  rexonancePivotAxis,
  rexonanceTailPivotIndex,
} from "../src/lib/rexonance-3d/contract.ts";
import {
  createAdaptiveScale,
  detectRexonanceQualityTier,
  REXONANCE_QUALITY,
  rexonancePixelRatio,
} from "../src/lib/rexonance-3d/quality.ts";
import {
  PUBLIC_SMOKE_ROUTES,
  RETIRED_AI_ROUTES,
  verifyPublicDeployment,
} from "./verify-public-deployment.mjs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const route = read("src/routes/rexonance-3d.tsx");
const viewer = read("src/components/rexonance-3d/rexonance-viewer.tsx");
const scene = read("src/lib/rexonance-3d/scene.ts");
const ASSETS = [
  "/rexonance-3d-20261030/rexonance.glb",
  "/rexonance-3d-20261030/model-manifest.json",
  "/rexonance-3d-20261030/textures/scale-normal.webp",
];

test("/rexonance-3d is a registered route with its title, its stage and a way to the saga", () => {
  assert.match(route, /createFileRoute\("\/rexonance-3d"\)/u);
  assert.ok(route.includes('title: "REXONANCE 3D｜Deception World"'));
  assert.ok(route.includes('id="rexonance-3d-stage"'));
  assert.match(route, /<GuardedLink\s+to="\/rexonance-saga"/u);
  assert.match(read("src/routeTree.gen.ts"), /path: '\/rexonance-3d'/u);
  assert.equal(getRouteFamily("/rexonance-3d"), "archive");
  assert.equal(getRouteFamily("/rexonance-3d/"), "archive");
});

test("the global menu lists REXONANCE 3D right after DOGS ARCHIVE", () => {
  const chrome = read("src/components/world/world-chrome.tsx");
  const dogs = chrome.indexOf("<span>DOGS ARCHIVE</span>");
  const rexonance = chrome.indexOf("<span>REXONANCE 3D</span>");
  assert.ok(dogs > 0 && rexonance > dogs, "after DOGS ARCHIVE");
  assert.match(
    chrome.slice(dogs, rexonance),
    /<GuardedLink\s+to="\/rexonance-3d"\s+assets=\{\[\]\}\s+beforeNavigate=\{close\}\s+aria-current=\{pathname === "\/rexonance-3d" \? "page" : undefined\}\s*>\s*$/u,
  );
});

test("search, library and the menu reach the page's real sections", () => {
  const entry = SITE_PAGE_ENTRIES.find((page) => page.path === "/rexonance-3d");
  assert.ok(entry, "registered for library and search");
  assert.equal(entry.title, "REXONANCE 3D");
  assert.ok(route.includes(`id="${entry.searchHash}"`), "the search anchor exists");
  const menu = getMenuPageContext("/rexonance-3d");
  assert.deepEqual(
    menu.sections.map(([id]) => id),
    ["rexonance-3d-stage", "rexonance-3d-views", "rexonance-3d-reference"],
  );
  for (const [id] of menu.sections)
    assert.ok(`${route}${viewer}`.includes(`id="${id}"`), `#${id} is on the page`);
  const art = read("src/lib/record-art.ts");
  assert.ok(art.includes('"/rexonance-3d": { src: "/rexonance-3d-20261030/rexonance-3d-480.webp"'));
});

test("the viewer loads three.js lazily, behind visibility, with status, retry and a poster", () => {
  assert.match(viewer, /import\("@\/lib\/rexonance-3d\/scene\.ts"\)/u, "dynamic import");
  assert.doesNotMatch(viewer, /^import .* from "three"/mu, "no static three.js import");
  assert.match(viewer, /new IntersectionObserver/u);
  assert.match(viewer, /watchGuardianSceneVisibility\(sync, document\)/u);
  assert.match(viewer, /data-viewer-status=\{status\}/u);
  assert.ok(viewer.includes("再読み込み"), "retry after an error");
  assert.match(viewer, /REXONANCE_3D_POSTER = "\/rexonance-3d-20261030\/rexonance-3d-480\.webp"/u);
  for (const label of ["正面", "右側面", "背面", "左側面", "斜め"])
    assert.ok(
      REXONANCE_VIEWS.some((view) => view.label === label),
      label,
    );
  assert.ok(viewer.includes("参照画像") && viewer.includes('id="rexonance-3d-reference"'));
  assert.ok(viewer.includes("自動回転") && viewer.includes("一時停止"));
  // The scene owns reduced motion, the decoder and full disposal.
  assert.match(scene, /prefers-reduced-motion: reduce/u);
  assert.match(scene, /setMeshoptDecoder\(MeshoptDecoder\)/u);
  assert.match(scene, /import\("three\/addons\/libs\/meshopt_decoder\.module\.js"\)/u);
  assert.match(scene, /setDRACOLoader\(draco\)/u);
  assert.match(
    scene,
    /REXONANCE_DRACO_DECODER_PATH = "\/dogs-archive-20261028\/decoders\/draco\/"/u,
  );
  assert.match(scene, /renderer\.forceContextLoss\(\)/u);
  assert.match(scene, /abort\.abort\(\)/u);
});

test("view presets look at the suit from the sheet's sides (glTF: faces +Z, left hand +X)", () => {
  const near = (a, b) => a.every((value, i) => Math.abs(value - b[i]) < 0.06);
  const flat = (id) => {
    const view = rexonanceView(id);
    return rexonanceViewDirection(view.azimuth, 0);
  };
  assert.ok(near(flat("front"), [0, 0, 1]));
  assert.ok(near(flat("back"), [0, 0, -1]));
  assert.ok(near(flat("left"), [1, 0, 0]), "左側面: the suit's own left, +X");
  assert.ok(near(flat("right"), [-1, 0, 0]), "右側面: the camera on the suit's right");
  assert.equal(rexonanceView("front").reference, "front-10");
  assert.equal(rexonanceView("right").reference, "right-07");
  assert.equal(rexonanceView("nonsense").id, REXONANCE_DEFAULT_VIEW);
});

test("the fitted camera keeps the whole figure inside the band left by the toolbar", () => {
  const box = { min: [-0.7, 0, -0.5], max: [0.7, 2.05, 0.6] };
  const target = [0, 1.025, 0];
  for (const [width, height] of [
    [1440, 820],
    [390, 700],
  ]) {
    const insets = rexonanceFrameInsets(width, height);
    for (const view of REXONANCE_VIEWS) {
      const direction = rexonanceViewDirection(view.azimuth, view.elevation);
      const distance = rexonanceFitDistance(box, target, direction, 30, width / height, insets);
      const camera = target.map((value, i) => value + direction[i] * distance);
      // Project every corner (camera looks at the target, world up +Y).
      const forward = direction.map((value) => -value);
      const right = [forward[2] * -1, 0, forward[0]];
      const rightLength = Math.hypot(...right);
      const r = right.map((value) => value / rightLength);
      const up = [
        r[1] * forward[2] - r[2] * forward[1],
        r[2] * forward[0] - r[0] * forward[2],
        r[0] * forward[1] - r[1] * forward[0],
      ];
      const tan = Math.tan((30 * Math.PI) / 360);
      for (const x of [box.min[0], box.max[0]])
        for (const y of [box.min[1], box.max[1]])
          for (const z of [box.min[2], box.max[2]]) {
            const d = [x - camera[0], y - camera[1], z - camera[2]];
            const depth = d[0] * forward[0] + d[1] * forward[1] + d[2] * forward[2];
            const ny = (d[0] * up[0] + d[1] * up[1] + d[2] * up[2]) / depth / tan;
            const nx = (d[0] * r[0] + d[1] * r[1] + d[2] * r[2]) / depth / (tan * (width / height));
            assert.ok(
              Math.abs(ny) <= 1 - insets.top - insets.bottom + 1e-6,
              `${view.id} ${width}: ${ny}`,
            );
            assert.ok(Math.abs(nx) <= 1 - insets.side * 2 + 1e-6, `${view.id} ${width}: ${nx}`);
          }
    }
  }
  const limits = rexonanceOrbitLimits(6);
  assert.ok(limits.minDistance < 6 && limits.maxDistance > 6);
  assert.ok(limits.maxPolarAngle < Math.PI * 0.75, "never under the floor");
});

test("the export contract is read tolerantly", () => {
  assert.equal(rexonanceFamilyOf("RX_Gold"), "Gold");
  assert.equal(rexonanceFamilyOf("RX_GoldDark"), "GoldDark");
  assert.equal(rexonanceFamilyOf("RX_Crystal.001"), "Crystal");
  assert.equal(rexonanceFamilyOf(undefined, "RX_Helmet_Visor"), "Visor");
  assert.equal(rexonanceFamilyOf("Material", "RX_Body"), null);
  assert.deepEqual(readRexonanceGlint("RX_Glint_Belt", {}), { size: 0.03, hue: 0.5 });
  assert.deepEqual(readRexonanceGlint("RX_Glint_Belt", { rx_glint_size: 9, rx_glint_hue: -2 }), {
    size: 0.4,
    hue: 0,
  });
  assert.equal(readRexonanceGlint("RX_Belt", {}), null);
  assert.equal(rexonanceTailPivotIndex("RX_Tail_Pivot07"), 7);
  assert.equal(rexonanceTailPivotIndex("RX_Tail_Seg07"), null);
  assert.ok(isRexonanceRibbon("RX_Ribbon_1_L") && isRexonanceRibbon("RX_Ribbons_Crystal"));
  // Blender (Z up, faces -Y) to glTF (Y up, faces +Z): (x, y, z) -> (x, z, -y).
  assert.deepEqual(rexonanceBendAxis("Z"), [0, 1, 0]);
  assert.deepEqual(rexonanceBendAxis("-y"), [0, 0, 1]);
  assert.deepEqual(rexonanceBendAxis([2, 0, 0]), [1, 0, 0]);
  assert.equal(rexonanceBendAxis("sideways"), null);
  assert.deepEqual(
    rexonancePivotAxis({ rx_bend_axis: "X", rx_bend_axis_gltf: [0, 0, 3] }, "rx_bend_axis"),
    [0, 0, 1],
    "the glTF-frame copy wins",
  );
});

test("quality tiers cap the pixel ratio and the adaptive scale steps down and back", () => {
  assert.equal(detectRexonanceQualityTier({ hardwareConcurrency: 8 }, false), "high");
  assert.equal(
    detectRexonanceQualityTier({ hardwareConcurrency: 8, deviceMemory: 8 }, true),
    "mobile",
  );
  assert.equal(
    detectRexonanceQualityTier({ hardwareConcurrency: 4, userAgent: "Android 14" }, true),
    "low",
  );
  assert.equal(detectRexonanceQualityTier({ connection: { saveData: true } }, false), "low");
  assert.ok(rexonancePixelRatio(3, 390, 700, REXONANCE_QUALITY.mobile) <= 1.75);
  assert.ok(390 * 700 * rexonancePixelRatio(3, 390, 700, REXONANCE_QUALITY.low) ** 2 <= 1_000_001);
  const adaptive = createAdaptiveScale(0.6, 1);
  for (let i = 0; i < 40; i++) adaptive.sample(1 / 20);
  assert.ok(adaptive.scale < 1, "slow frames lower the scale");
  const low = adaptive.scale;
  for (let i = 0; i < 400; i++) adaptive.sample(1 / 60);
  assert.ok(adaptive.scale > low, "quick frames raise it again");
  assert.equal(adaptive.sample(2), false, "a long gap says nothing");
});

test("the release attests the model's files and the deploy check accepts exactly them", async () => {
  assert.ok(PUBLIC_SMOKE_ROUTES.includes("/rexonance-3d"));
  const source = read("scripts/build-release-identity.mjs").replace(/^import .*;\n/gmu, "");
  let written;
  runInNewContext(source, {
    process: { env: { PUBLIC_RELEASE_SHA: "c".repeat(40) } },
    createHash,
    execFileSync: () => {
      throw new Error("Expected the supplied release SHA");
    },
    readFileSync: (path, encoding) =>
      encoding === "utf8" ? JSON.stringify({ items: [] }) : Buffer.from(path),
    writeFileSync: (_path, value) => {
      written = JSON.parse(value);
    },
    console: { log() {} },
  });
  for (const path of ASSETS)
    assert.ok(
      written.assets.some((asset) => asset.path === path),
      `${path} is attested before promotion`,
    );
  const payloads = new Map(ASSETS.map((path) => [path, Buffer.from(`asset:${path}`)]));
  const run = async ({ changed, unknown } = {}) => {
    const seen = [];
    const report = await verifyPublicDeployment({
      baseUrl: "https://example.test",
      expectedSha: "c".repeat(40),
      fetchImpl: async (input) => {
        const path = new URL(input).pathname;
        seen.push(path);
        if (path === "/release-identity.json")
          return Response.json({
            sha: "c".repeat(40),
            assets: unknown
              ? [{ path: unknown, sha256: "0".repeat(64) }]
              : ASSETS.map((asset) => ({
                  path: asset,
                  sha256: createHash("sha256").update(payloads.get(asset)).digest("hex"),
                })),
          });
        if (payloads.has(path))
          return new Response(path === changed ? "another model" : payloads.get(path));
        if (RETIRED_AI_ROUTES.includes(path)) return new Response("not found", { status: 404 });
        return new Response("Deception World");
      },
    });
    return { report, seen };
  };
  const valid = await run();
  assert.equal(valid.report.ok, true);
  assert.ok(valid.seen.includes("/rexonance-3d"), "the page is smoke-tested before promotion");
  for (const changed of ASSETS) assert.equal((await run({ changed })).report.ok, false, changed);
  for (const unknown of [
    "/rexonance-3d-20261030/other.glb",
    "/rexonance-3d-20261030/reference/front-10.webp",
    "/rexonance-3d-20261030/../secret",
    `${ASSETS[0]}?v=1`,
    `${ASSETS[0]}/extra`,
  ]) {
    const { report, seen } = await run({ unknown });
    assert.equal(report.ok, false, unknown);
    assert.ok(
      seen.every((path) => !path.startsWith("/rexonance-3d-2026")),
      "rejected before fetch",
    );
  }
});
