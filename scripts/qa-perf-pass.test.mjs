import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import test from "node:test";
import {
  PORTRAIT_THUMBNAILS,
  PORTRAIT_THUMBNAIL_SIZES,
  POSTER_IMAGES,
  portraitThumbnail,
  posterImage,
} from "../src/lib/thumbnail-images.ts";

/* The QA, delivery and accessibility pass of 2026-09-30: right-sized cast
   wall portraits, the 12px floor on the dossier brand and the World rails,
   an opaque dossier reader bar, 12px arms on the list return, the Rexonance
   pickup's loops stilled under economy rendering, and forced colours without
   the ambient ring through a file's name. */

const read = (path) =>
  readFileSync(new URL(`../${path}`, import.meta.url), "utf8").replaceAll("\r\n", "\n");
const strip = (css) => css.replace(/\/\*[\s\S]*?\*\//g, "");
const file = (path) => new URL(`../public${path}`, import.meta.url);

// Width and height of a WebP (lossy VP8, lossless VP8L or extended VP8X).
function webpSize(bytes) {
  assert.equal(bytes.subarray(0, 4).toString("ascii"), "RIFF");
  assert.equal(bytes.subarray(8, 12).toString("ascii"), "WEBP");
  const chunk = bytes.subarray(12, 16).toString("ascii");
  if (chunk === "VP8 ") return [bytes.readUInt16LE(26) & 0x3fff, bytes.readUInt16LE(28) & 0x3fff];
  if (chunk === "VP8L") {
    const bits = bytes.readUInt32LE(21);
    return [1 + (bits & 0x3fff), 1 + ((bits >> 14) & 0x3fff)];
  }
  if (chunk === "VP8X") return [1 + bytes.readUIntLE(24, 3), 1 + bytes.readUIntLE(27, 3)];
  throw new Error(`unknown WebP chunk ${chunk}`);
}
const webpWidth = (bytes) => webpSize(bytes)[0];

test("cast wall portraits: WebP candidates of their stated widths, each smaller than the next", () => {
  assert.equal(Object.keys(PORTRAIT_THUMBNAILS).length, 10);
  for (const [key, set] of Object.entries(PORTRAIT_THUMBNAILS)) {
    let previous = 0;
    let previousBytes = 0;
    for (const variant of set.variants) {
      const bytes = readFileSync(file(variant.path));
      assert.equal(webpWidth(bytes), variant.width, variant.path);
      assert.ok(variant.width > previous, `${variant.path} ascending`);
      assert.ok(bytes.length > previousBytes, `${variant.path} larger than the step below`);
      previous = variant.width;
      previousBytes = bytes.length;
    }
    // The smallest step serves a 2x phone tile; the largest keeps the full
    // resolution the tile loaded before (a 3x landscape phone needs it).
    assert.equal(set.variants[0].width, 360, key);
    const sourceWidth = webpWidth(readFileSync(file(set.variants.at(-1).path)));
    assert.ok(sourceWidth >= 720, key);
  }
});

test("the portraits' sources stay exactly as supplied", () => {
  const supplied = {
    "/civilian-yuma-20260826.jpeg": "2f6aa15a18da44c1adac41b520622927e89f1b2a486172486504cad503024d4e",
    "/civilian-bell-20260826.jpeg": "29475d030015c7b131df1d6e109001936c735a8c8d7d386efdf7e21047a6cca0",
    "/civilian-lore.jpeg": "4e8eb62fe27320b7c5ace51ea6c2be12e3399d7a2f03a882c065986590c5370f",
    "/civilian-leddic.jpeg": "d334a4290e78c0a5f58e0716b634218dfa68cbf66d11f8b85cb2bcf5b05b003d",
    "/civilian-naikami-chigiri.jpeg": "bb07970a7df556bc87fc46559e3b72c3842b562cc73d853c3eb51d44630bd6c8",
    "/civilian-argenome.jpeg": "88f2ef5d5dca8b7aebac08a591e9714b2bf58ca21801ad4bc1390d8c5f74b087",
    "/character-james-20260829.jpg": "8cd498d105a1951bb698ff314e0728cefce1ec6cb3ad1649b08a4889bafcb0d9",
    "/character-luna.jpeg": "c2687852ed8ef23244ecb21c7e54c52474058ac253e3aa7268647e4a20955dd6",
    "/character-terra.jpeg": "6d48828c402fa86515a58b9fb877c791c3f3aa05874270844d8e95ff83593641",
    "/character-yoake-mamori.jpeg": "13c6d8e85e2a1c39ebac11c5fb7106707e9a048f99ec3289fa5aaecf8f86654a",
  };
  for (const set of Object.values(PORTRAIT_THUMBNAILS)) {
    const hash = createHash("sha256").update(readFileSync(file(set.source))).digest("hex");
    assert.equal(hash, supplied[set.source], set.source);
  }
  // The 360 px step is a fraction of what the tile used to load.
  const lore = statSync(file("/civilian-lore-delivery-360.webp")).size;
  assert.ok(lore < statSync(file("/civilian-lore.jpeg")).size * 0.1);
});

test("the wall, its quote chips and the ID photo ask for the same candidates", () => {
  const annex = read("src/components/world/world-annex.tsx");
  assert.doesNotMatch(annex, /dossierImage/);
  assert.match(annex, /const civilian = [^;]*\.\.\.portraitThumbnail\(src\)/);
  for (const key of [
    "/character-james-20260829.webp",
    "/character-luna.webp",
    "/character-terra.webp",
    "/character-yoake-mamori.jpeg",
  ]) {
    assert.ok(annex.includes(`...portraitThumbnail("${key}")`), key);
  }
  // 六詠 faces keep the cards' own candidates and sizes (cache hits).
  assert.match(annex, /src: `\/manager-\$\{key\}-thumb\.jpeg`,\s*\.\.\.managerThumbnail\(key\),/);
  assert.match(annex, /srcSet=\{portrait\.srcSet\}\s*sizes=\{portrait\.sizes\}/);
  assert.match(annex, /srcSet=\{voice\.srcSet\}\s*sizes=\{voice\.sizes\}/);
  assert.match(
    annex,
    /src="\/character-james-20260829\.webp"\s*\{\.\.\.portraitThumbnail\("\/character-james-20260829\.webp"\)\}/,
  );
  assert.equal(
    PORTRAIT_THUMBNAIL_SIZES,
    "(max-width: 559px) 56vw, (max-width: 899px) 37vw, (max-width: 1099px) 29vw, min(28.3vw, 480px)",
  );
  assert.deepEqual(portraitThumbnail("/unknown.jpeg"), {});
  assert.equal(
    portraitThumbnail("/civilian-lore.jpeg").srcSet,
    "/civilian-lore-delivery-360.webp 360w, /civilian-lore-delivery-720.webp 720w, /civilian-lore-delivery.webp 1200w",
  );
});

// Width and height of a baseline or progressive JPEG (the first SOFn marker).
function jpegSize(bytes) {
  for (let i = 2; i < bytes.length; ) {
    const marker = bytes[i + 1];
    const length = bytes.readUInt16BE(i + 2);
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      return [bytes.readUInt16BE(i + 7), bytes.readUInt16BE(i + 5)];
    }
    i += 2 + length;
  }
  throw new Error("no SOF marker");
}

test("the poster deck: one WebP per poster, the same pixels as the JPEG, a fraction of its bytes", () => {
  const home = read("src/components/world/world-home.tsx");
  const posters = [...home.slice(home.indexOf("const POSTERS = ["), home.indexOf("const RIDERS = [")).matchAll(/src: "([^"]+)"/g)].map((m) => m[1]);
  assert.equal(posters.length, 33);
  // Every poster but the first (the handoff's shared delivery file) has one.
  assert.deepEqual(posterImage(posters[0]), {});
  let jpeg = 0;
  let webp = 0;
  for (const source of posters.slice(1)) {
    const set = POSTER_IMAGES[source];
    assert.ok(set, source);
    assert.equal(set.variants.length, 1, source);
    const delivery = readFileSync(file(set.variants[0].path));
    const original = readFileSync(file(source));
    assert.equal(webpWidth(delivery), set.variants[0].width, source);
    if (set.variants[0].build) {
      assert.deepEqual(webpSize(delivery), jpegSize(original), `${source} keeps its pixels`);
      jpeg += original.length;
      webp += delivery.length;
    }
    // A 1x srcset keeps the JPEG's intrinsic size; the JPEG stays the src.
    assert.equal(posterImage(source).srcSet, set.variants[0].path);
  }
  assert.ok(webp < jpeg * 0.45, `${webp} of ${jpeg}`);
  // The deck, the backdrop and the warm-ups all ask through the helpers.
  assert.equal(home.match(/\{\.\.\.posterImage\((?:current|previous|nextPoster)\.src\)\}/g)?.length, 8);
  // Four preload call sites: autoplay next, low-priority next, shuffle final,
  // and at-most-four preview candidates (sharing finalImage if it overlaps).
  assert.equal(home.match(/preparePosterImage\(/g)?.length, 4);
  assert.doesNotMatch(home, /\.src = POSTERS\[/);
});

test("the Dream Chapter's poster console asks for the same WebP copies", async () => {
  const { DREAM_POSTERS } = await import("../src/components/dream-chapter/dream-chapter-data.ts");
  const dream = read("src/components/dream-chapter/dream-chapter.tsx");
  let jpeg = 0;
  let webp = 0;
  for (const poster of DREAM_POSTERS) {
    // Poster 05 is also the hero and a warmed route asset: since the
    // delivery-verify pass the console asks for the hero's own WebP.
    if (poster.src === "/dream-chapter-poster-05.jpeg") {
      assert.deepEqual(posterImage(poster.src), {
        srcSet: "/dream-chapter-poster-05-delivery.webp",
      });
    }
    const set = POSTER_IMAGES[poster.src];
    assert.ok(set, poster.src);
    const delivery = readFileSync(file(set.variants[0].path));
    const original = readFileSync(file(poster.src));
    assert.deepEqual(webpSize(delivery), jpegSize(original), poster.src);
    assert.deepEqual(webpSize(delivery), [poster.width, poster.height], poster.src);
    jpeg += original.length;
    webp += delivery.length;
  }
  assert.ok(webp < jpeg * 0.6, `${webp} of ${jpeg}`);
  assert.equal(dream.match(/\{\.\.\.posterImage\((?:activePoster|previousPoster)\.src\)\}/g)?.length, 2);
  assert.equal(dream.match(/preparePosterImage\(/g)?.length, 2);
  assert.doesNotMatch(dream, /\.src = DREAM_POSTERS\[/);
});

test("the Saga file's nightmare art comes as its delivery WebP", async () => {
  const { dossierImage } = await import("../src/lib/dossier-images.ts");
  assert.equal(
    dossierImage("/nightmare-machiavel-gore.jpeg").srcSet,
    "/nightmare-machiavel-gore-delivery.webp",
  );
  const original = readFileSync(file("/nightmare-machiavel-gore.jpeg"));
  const delivery = readFileSync(file("/nightmare-machiavel-gore-delivery.webp"));
  assert.deepEqual(webpSize(delivery), jpegSize(original));
  // The supplied file stays as it is.
  assert.equal(
    createHash("sha256").update(original).digest("hex"),
    "fe760641ed88a9b3eafb1df5aaa8d3c6cc3e3b973ca6bde3b00056f993ee5da0",
  );
  const rider = read("src/components/world/rider-page.tsx");
  assert.equal(rider.match(/src=\{rider\.nightmare\.img\}\s*\{\.\.\.dossierImage\(rider\.nightmare\.img\)\}/g)?.length, 2);
});

test("dossier chrome: a 12px brand, an opaque reader bar, 12px arms on the list return", () => {
  const css = strip(read("src/styles-dossier-edition.css"));
  assert.match(
    css,
    /main\.manager-page:not\(\.is-sovereign\) \.manager-topbar \.brand-sigil i,\s*main\.manager-page:not\(\.is-sovereign\) \.manager-topbar \.brand b,\s*main\.manager-page:not\(\.is-sovereign\) \.manager-topbar \.brand small \{\s*font-size: 12px;/,
  );
  const reader = css.match(/main\.manager-page:not\(\.is-sovereign\) \.dossier-reader \{([^}]*)\}/)[1];
  assert.match(reader, /background-color: #080e18;/);
  // The list return spells out its 12px bracket list: a local --dm-arm cannot
  // reach --dm-brackets, which is resolved on <main>.
  const ret = css.match(
    /\.manager-pagination \.dossier-index-return::after \{([^}]*)\}/,
  )[1];
  assert.doesNotMatch(ret, /--dm-arm|var\(--dm-brackets\)/);
  assert.equal(ret.match(/ 12px 2px| 2px 12px/g)?.length, 8);
  // Forced colours: the ambient ring would be a line through the name.
  const forced = css.slice(css.indexOf("@media (forced-colors: active)"));
  assert.match(forced, /main\.manager-page:not\(\.is-sovereign\) \.manager-glow \{\s*display: none;/);
});

test("the World rails and HOLD + SLIDE labels meet the 12px floor without moving", () => {
  const mirage = strip(read("src/styles-world-mirage.css"));
  const block = mirage.slice(mirage.indexOf(".manager-archive-tabs button small {\n  font-size: 12px;"));
  assert.ok(block.length > 0);
  // Codes and names take 12px in the 11px labels' line boxes.
  assert.match(block, /button small \{\s*font-size: 12px;\s*line-height: 16\.5px;/);
  assert.match(block, /@media \(min-width: 561px\) \{\s*[^{]*button b \{\s*font-size: 12px;\s*line-height: 14\.85px;/);
  assert.match(
    block,
    /@media \(max-width: 899px\) \{[^{]*:is\(small, b\) \{\s*font-size: 12px;\s*line-height: 16\.5px;/,
  );
  const frosted = read("src/styles-frosted-controls.css");
  assert.match(
    frosted,
    /html body \.rider-tabs\.liquid-swipe-tabs > button\[role="tab"\] span \{\s*font-size: clamp\(12px, 0\.85vw, 13px\);\s*white-space: nowrap;/,
  );
  assert.doesNotMatch(frosted, /clamp\(11px/);
  assert.match(
    read("src/styles-pickup-stability.css"),
    /html\[data-mode="world"\] \.ios-slide-open \.ios-slide-open-label small \{\s*font-size: 12px;/,
  );
  // These sheets set no label under 12px (the stability sheet's older 10px
  // labels are overridden by the pickup and dossier sheets).
  for (const path of [
    "src/styles-world-mirage.css",
    "src/styles-frosted-controls.css",
    "src/styles-dossier-edition.css",
  ]) {
    for (const [, size] of strip(read(path)).matchAll(/font-size:\s*(\d+(?:\.\d+)?)px/g)) {
      assert.ok(Number(size) >= 12, `${path}: ${size}px`);
    }
  }
});

test("the dream dive back to the World opens onto the World, not its old ground", () => {
  const css = strip(read("src/styles-world-mirage.css"));
  // Full tier only, once the World is mounted under the shutter; the ground
  // it clears is the legacy one, left in place for every other phase.
  assert.match(
    css,
    /html\[data-mode="world"\]:not\(\[data-world-effects="economy"\]\)\s*body:has\(\.site-shell\.film-edition\.mirage-edition\)\s*\.load-gate\.has-cine\.is-cine-full\.rider-route-dive\.is-dream-dive\.is-revealing \{\s*background: transparent;\s*\}/,
  );
  assert.match(
    read("src/styles-route-transitions.css"),
    /\.load-gate\.rider-route-dive\.is-dream-dive \{[^}]*background:/,
  );
  // The audit covers the return (flat frames after the hand-over, flashes).
  assert.match(
    read("scripts/verify-route-transitions.mjs"),
    /"dream-world": \{ start: "\/dream-chapter", dest: "\/world", target: "\.dream-back-link" \}/,
  );
});

test("the opening does not preload the Zeus button it never shows", () => {
  const root = read("src/routes/__root.tsx");
  assert.match(root, /head: \(\{ matches \}\) => \(\{/);
  assert.match(
    root,
    /\.\.\.\(matches\.some\(\(match\) => \(match\.routeId as string\) === "\/"\)\s*\? \[\]\s*: \[\s*\{\s*rel: "preload",\s*as: "image",\s*type: "image\/webp",\s*href: "\/zeus-button-360\.webp",/,
  );
  // The button itself still never renders on the opening.
  assert.match(read("src/components/zeus-button.tsx"), /enabled && pathname !== "\/" && portalTarget/);
});

test("economy rendering stills the Rexonance pickup card's loops", () => {
  const css = strip(read("src/styles-world/rexonance-pickup.css"));
  for (const target of [
    ".form-pickup.is-rexonance-pickup::after",
    ".is-rexonance-pickup .form-pickup-visual img",
    ".rexonance-card-ornaments i",
    ".rexonance-panel-ambient i",
  ]) {
    assert.ok(css.includes(`html[data-world-effects="economy"] ${target}`), target);
  }
  assert.match(
    css,
    /html\[data-world-effects="economy"\] \.rexonance-weapon-grid figure > div::after \{\s*animation: none !important;/,
  );
});
