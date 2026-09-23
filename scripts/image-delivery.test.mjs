import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import test from "node:test";

const readSource = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

const optimizedAssets = [
  ["logo-title-ice-20260924-delivery-640.webp", 90_000],
  ["logo-title-ice-20260924-delivery-960.webp", 160_000],
  ["logo-title-ice-20260924-delivery-1280.webp", 240_000],
  ["logo-title-ice-20260924-delivery-1536.webp", 320_000],
  ["logo-title-prism-20260924-delivery-640.webp", 90_000],
  ["logo-title-prism-20260924-delivery-960.webp", 160_000],
  ["logo-title-prism-20260924-delivery-1280.webp", 240_000],
  ["logo-title-prism-20260924-delivery-1536.webp", 320_000],
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

  const openingLogo = readSource("../src/lib/opening-logo.ts");
  // The first (ice) logo is preloaded with the srcset and sizes its <img> layers use.
  assert.match(indexRoute, /type: "image\/webp",\s*href: OPENING_LOGO_FIRST\.src,\s*imageSrcSet: OPENING_LOGO_FIRST\.srcSet,\s*imageSizes: OPENING_LOGO_SIZES/);
  assert.match(indexRoute, /fetchPriority: "high"/);
  assert.match(openingLogo, /const WIDTHS = \[640, 960, 1280, 1536\] as const;/);
  assert.match(openingLogo, /OPENING_LOGO_FIRST = delivery\("logo-title-ice-20260924"\)/);
  assert.match(openingLogo, /OPENING_LOGO_FINAL = delivery\("logo-title-prism-20260924"\)/);
  assert.match(openingLogo, /OPENING_LOGO_SIZES = "min\(1120px, 92vw, 117vh\)"/);
  assert.match(titleSequence, /srcSet=\{logo\.srcSet\}[\s\S]*?sizes=\{OPENING_LOGO_SIZES\}[\s\S]*?width=\{OPENING_LOGO_WIDTH\}[\s\S]*?height=\{OPENING_LOGO_HEIGHT\}/);
  assert.match(openingHandoff, /DEFAULT_LOGO_SRC = "\/logo-title-prism-20260924-delivery-1536\.webp"/);
  assert.match(assetLoader, /WORLD_ENTER_ASSETS = \[[\s\S]*?"\/deception-world-poster-delivery\.webp"/);
  assert.match(worldHome, /srcSet=\{r\.img\.replace\(\/\\\.jpe\?g\$\/i, "\.webp"\)\}/);
  assert.match(worldHome, /src="\/deception-world-poster-delivery\.webp"[\s\S]*?loading="lazy"/);
  assert.match(riderPage, /rider\.id === "over-zeztz"\s*\?\s*"\/character-james-20260829\.webp"/);
});

test("the supplied logos are preserved and their alpha-keyed files serve every opening layer", () => {
  const september = readFileSync(new URL("../public/logo-title-20260915.png", import.meta.url));
  assert.equal(
    createHash("sha256").update(september).digest("hex"),
    "62717decd5513c51604d747a0f7544aa5170b903d0bdb1f15654e73190715e39",
    "Keep the exact supplied September artwork",
  );
  // The 2026-09-24 pair, exactly as supplied (glow on black, 1536x1024): the
  // delivery files are keyed from them by scripts/build-opening-logos.mjs.
  for (const [name, hash] of [
    ["logo-title-ice-20260924.webp", "8ab44b33f62ad3790a962d6fadac66c2b0de2d88e566a53cd6b527f6ffaef3a0"],
    ["logo-title-prism-20260924.webp", "0a290bbaf2a56180d67c94ab54e04fb9ef4acf43e69fe3929b6b982e9ef75b9b"],
  ]) {
    const original = readFileSync(new URL(`../public/${name}`, import.meta.url));
    assert.equal(createHash("sha256").update(original).digest("hex"), hash, `Keep ${name} as supplied`);
  }
  // Delivery files carry alpha (VP8X with the alpha flag): no black matte.
  for (const width of [640, 960, 1280, 1536]) {
    for (const stem of ["logo-title-ice-20260924", "logo-title-prism-20260924"]) {
      const bytes = readFileSync(new URL(`../public/${stem}-delivery-${width}.webp`, import.meta.url));
      assert.equal(bytes.subarray(12, 16).toString("ascii"), "VP8X", `${stem} ${width}`);
      assert.ok((bytes[20] & 0x10) !== 0, `${stem}-delivery-${width} must have alpha`);
      assert.equal(bytes.readUIntLE(24, 3) + 1, width);
    }
  }
  const titleSequence = readSource("../src/components/cinematic/title-sequence.tsx");
  const css = readSource("../src/styles.css");
  assert.equal(titleSequence.match(/<LogoLayer\s+logo=\{OPENING_LOGO_FIRST\}/g)?.length, 5);
  assert.equal(titleSequence.match(/<LogoLayer\s+logo=\{OPENING_LOGO_FINAL\}/g)?.length, 3);
  assert.equal(css.match(/mask-image: var\(--cine-logo-mask, linear-gradient\(transparent, transparent\)\)/g)?.length, 2);
  for (const path of ["../src/routes/index.tsx", "../src/components/cinematic/title-sequence.tsx", "../src/components/cinematic/opening-handoff.tsx", "../src/styles.css", "../src/lib/opening-logo.ts"]) {
    assert.doesNotMatch(readSource(path), /["'(]\/logo-title(?:-20260915)?\.(?:webp|jpg|png)["')]/, `${path} must not load a boxed logo`);
  }
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
