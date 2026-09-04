import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import test from "node:test";

const readSource = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

const optimizedAssets = [
  ["logo-title.webp", 150_000],
  ["deception-world-poster.webp", 650_000],
  ["deception-world-poster-delivery.webp", 480_000],
  ["character-james-20260829.webp", 100_000],
  ["rider-saga-rexonance-thumbnail-20260827.webp", 160_000],
  ["rider-realm.webp", 160_000],
  ["rider-loa.webp", 160_000],
  ["rider-vandal-thumbnail-20260827.webp", 160_000],
  ["rider-leddic-home.webp", 160_000],
  ["rider-algenome.webp", 160_000],
  ["rider-over-zeztz-thumbnail-20260829.webp", 160_000],
  ["rider-cipher-thumbnail-20260825.webp", 160_000],
  ["character-terra.webp", 180_000],
  ["character-luna.webp", 300_000],
  ["manager-rex-loi.webp", 240_000],
  ["manager-shuza.webp", 270_000],
  ["manager-reemu.webp", 420_000],
  ["manager-zeus-detail.webp", 190_000],
  ["manager-opus.webp", 130_000],
  ["manager-lejas.webp", 110_000],
  ["manager-lejas-portrait.webp", 110_000],
];

test("critical and rider images ship as bounded, valid WebP assets", () => {
  for (const [name, budget] of optimizedAssets) {
    const asset = new URL(`../public/${name}`, import.meta.url);
    const bytes = readFileSync(asset);
    assert.equal(bytes.subarray(0, 4).toString("ascii"), "RIFF", `${name} must be RIFF`);
    assert.equal(bytes.subarray(8, 12).toString("ascii"), "WEBP", `${name} must be WebP`);
    assert.ok(statSync(asset).size < budget, `${name} should stay below ${budget} bytes`);
  }
});

test("critical images expose explicit priority and responsive delivery hints", () => {
  const indexRoute = readSource("../src/routes/index.tsx");
  const titleSequence = readSource("../src/components/cinematic/title-sequence.tsx");
  const openingHandoff = readSource("../src/components/cinematic/opening-handoff.tsx");
  const worldHome = readSource("../src/components/world/world-home.tsx");
  const assetLoader = readSource("../src/lib/asset-loader.ts");
  const riderPage = readSource("../src/components/world/rider-page.tsx");

  assert.match(indexRoute, /type: "image\/webp"[\s\S]*?href: "\/logo-title\.webp"/);
  assert.match(titleSequence, /src="\/logo-title\.webp"[\s\S]*?width=\{1200\}[\s\S]*?height=\{800\}/);
  assert.match(openingHandoff, /DEFAULT_LOGO_SRC = "\/logo-title\.webp"/);
  assert.match(assetLoader, /WORLD_ENTER_ASSETS = \[[\s\S]*?"\/deception-world-poster-delivery\.webp"/);
  assert.match(worldHome, /srcSet=\{r\.img\.replace\(\/\\\.jpe\?g\$\/i, "\.webp"\)\}/);
  assert.match(worldHome, /src="\/deception-world-poster-delivery\.webp"[\s\S]*?loading="lazy"/);
  assert.match(riderPage, /rider\.id === "over-zeztz" \? "\/character-james-20260829\.webp"/);
});

test("world preload and first poster use the same lightweight URL", () => {
  const route = readSource("../src/routes/world.tsx");
  const home = readSource("../src/components/world/world-home.tsx");
  assert.match(route, /href: WORLD_ENTER_ASSETS\[0\]/);
  assert.match(home, /src: "\/deception-world-poster-delivery\.webp"/);
  assert.doesNotMatch(home, /["']\/deception-world-poster\.webp["']/);
  const original = statSync(new URL("../public/deception-world-poster.webp", import.meta.url)).size;
  const delivery = statSync(new URL("../public/deception-world-poster-delivery.webp", import.meta.url)).size;
  assert.ok(delivery < original * 0.85);
});

test("the user supplied Over Zeztz JPEG remains available as the canonical fallback", () => {
  const source = new URL(
    "../public/rider-over-zeztz-thumbnail-20260829.jpg",
    import.meta.url,
  );
  assert.ok(statSync(source).size > 100_000);
  assert.equal(readFileSync(source).subarray(0, 3).toString("hex"), "ffd8ff");
});
