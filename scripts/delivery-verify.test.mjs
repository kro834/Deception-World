import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import test from "node:test";
import {
  DREAM_CHAPTER_ENTER_ASSETS,
  DREAM_CHAPTER_HERO_ART,
  DREAM_CHAPTER_LOGO,
  MANAGER_ASSETS,
} from "../src/lib/asset-loader.ts";
import {
  DOSSIER_HERO_IMAGES,
  FORM_PICKUP_SIZES,
  dossierHeroSizes,
  dossierImage,
  formPickupImage,
} from "../src/lib/dossier-images.ts";
import { rexonanceImage } from "../src/lib/rexonance-images.ts";
import {
  CIEL_PORTRAIT,
  POSTER_IMAGES,
  TITLE_LOGO_IMAGES,
  cielPortrait,
  posterImage,
} from "../src/lib/thumbnail-images.ts";

/* The delivery-verify pass of 2026-09-30: the Dream Chapter's hero art and
   logo as right-sized WebPs that the dive warms and the page then shows, the
   character files' hero portraits and the Rexonance pickup with width
   candidates that their navigation warm-ups ask for with the same srcset and
   sizes, and the stale browser verifies repaired. */

const read = (path) =>
  readFileSync(new URL(`../${path}`, import.meta.url), "utf8").replaceAll("\r\n", "\n");
const file = (path) => new URL(`../public${path.split("?")[0]}`, import.meta.url);
const sha = (path) =>
  createHash("sha256")
    .update(readFileSync(file(path)))
    .digest("hex");

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
function jpegSize(bytes) {
  for (let i = 2; i < bytes.length;) {
    const marker = bytes[i + 1];
    const length = bytes.readUInt16BE(i + 2);
    if (marker >= 0xc0 && marker <= 0xc2)
      return [bytes.readUInt16BE(i + 7), bytes.readUInt16BE(i + 5)];
    i += 2 + length;
  }
  throw new Error("no SOF");
}

test("the Dream dive warms exactly the files the hero, its preloads and the console show", () => {
  assert.deepEqual([...DREAM_CHAPTER_ENTER_ASSETS], [DREAM_CHAPTER_LOGO, DREAM_CHAPTER_HERO_ART]);
  assert.equal(
    DREAM_CHAPTER_HERO_ART,
    POSTER_IMAGES["/dream-chapter-poster-05.jpeg"].variants[0].path,
  );
  assert.equal(DREAM_CHAPTER_LOGO, TITLE_LOGO_IMAGES["/dream-chapter-logo.jpeg"].variants[0].path);
  const page = read("src/components/dream-chapter/dream-chapter.tsx");
  assert.match(page, /className="dream-hero-art"\s+src=\{DREAM_CHAPTER_HERO_ART\}/);
  assert.match(page, /className="dream-title-logo"\s+src=\{DREAM_CHAPTER_LOGO\}/);
  assert.doesNotMatch(page, /src="\/dream-chapter-(?:logo|poster-05)\.jpeg"/);
  const route = read("src/routes/dream-chapter.tsx");
  assert.match(route, /rel: "preload", as: "image", href: DREAM_CHAPTER_HERO_ART/);
  assert.match(route, /rel: "preload",\s*as: "image",\s*href: DREAM_CHAPTER_LOGO/);
  assert.doesNotMatch(route, /href: "\/dream-chapter-(?:logo|poster-05)/);
  // The console's poster 05 asks for the hero's own WebP (a cache hit).
  assert.deepEqual(posterImage("/dream-chapter-poster-05.jpeg"), {
    src: DREAM_CHAPTER_HERO_ART,
    srcSet: DREAM_CHAPTER_HERO_ART,
  });
  // The loader's byte estimates match the files it warms.
  const loader = read("src/lib/asset-loader.ts");
  for (const asset of DREAM_CHAPTER_ENTER_ASSETS) {
    assert.match(loader, new RegExp(`"${asset}": ${statSync(file(asset)).size},`), asset);
  }
});

test("the Dream hero's WebPs keep the art's pixels and ratio; the JPEGs stay as supplied", () => {
  const poster = readFileSync(file("/dream-chapter-poster-05.jpeg"));
  const posterWebp = readFileSync(file(DREAM_CHAPTER_HERO_ART));
  assert.deepEqual(webpSize(posterWebp), jpegSize(poster));
  assert.deepEqual(jpegSize(poster), [1448, 1086]);
  const logo = readFileSync(file("/dream-chapter-logo.jpeg"));
  const logoWebp = readFileSync(file(DREAM_CHAPTER_LOGO));
  const [lw, lh] = webpSize(logoWebp);
  const [jw, jh] = jpegSize(logo);
  // Twice the widest slot (480 px on portrait tablets).
  assert.equal(lw, 960);
  assert.ok(Math.abs(lw / lh - jw / jh) < 0.001, `${lw}x${lh} vs ${jw}x${jh}`);
  // The markup keeps the supplied intrinsic size (it sets the aspect ratio).
  const page = read("src/components/dream-chapter/dream-chapter.tsx");
  assert.match(page, /src=\{DREAM_CHAPTER_HERO_ART\}\s+alt=""\s+width=\{1448\}\s+height=\{1086\}/);
  assert.match(page, /src=\{DREAM_CHAPTER_LOGO\}[\s\S]{0,80}width="1280"\s+height="731"/);
  assert.ok(posterWebp.length + logoWebp.length < (poster.length + logo.length) * 0.4);
  assert.equal(
    sha("/dream-chapter-poster-05.jpeg"),
    "e8daa3d13d92b5253ba20ddbefc6cb70508e0781ee929b57f2f0c6580da157f9",
  );
  assert.equal(
    sha("/dream-chapter-logo.jpeg"),
    "e68cdeacfbed77067efb2a9fe152aeb3d28afea7bdf7b092527fdcb5192fa675",
  );
});

// テラ's set ends on a 1470 px step drawn from her supplied JPEG (wider than her old 1080 px file).
test("dossier heroes: width candidates of their stated widths, the old file still the largest", () => {
  assert.deepEqual(Object.keys(DOSSIER_HERO_IMAGES).sort(), [
    "/character-luna.jpeg",
    "/character-terra.jpeg",
    "/manager-opus.jpeg",
    "/manager-reemu.jpeg",
    "/manager-rex-loi.jpeg",
    "/manager-shuza.jpeg",
    "/manager-zeus-detail.jpeg",
  ]);
  for (const [key, set] of Object.entries(DOSSIER_HERO_IMAGES)) {
    let previous = 0;
    let previousBytes = 0;
    const full = webpSize(readFileSync(file(set.variants.at(-1).path)));
    for (const variant of set.variants) {
      const bytes = readFileSync(file(variant.path));
      const [w, h] = webpSize(bytes);
      assert.equal(w, variant.width, variant.path);
      assert.ok(Math.abs(w / h - full[0] / full[1]) < 0.01, `${variant.path} keeps the crop`);
      assert.ok(w > previous && bytes.length > previousBytes, `${variant.path} ascending`);
      previous = w;
      previousBytes = bytes.length;
    }
    assert.ok(Math.abs(set.aspect - full[0] / full[1]) < 0.001, key);
    // A 1x desktop's frame (re-measured 2026-10-15: 662 x 824 at 1440 x 900) needs at most 720 px.
    assert.ok(Math.max(662, 824 * set.aspect) <= 720, key);
    assert.ok(
      set.variants.some((variant) => variant.width === 720),
      key,
    );
  }
  // The 720 px files are drawn from the managers' JPEGs, which stay as supplied.
  for (const [source, hash] of Object.entries({
    "/manager-zeus-detail.jpeg": "d8b9fcbe8914068c478e166dc0bcf03bea4ef1dab40e38c99abc7bc7a722db15",
    "/manager-opus.jpeg": "260e32fa6cb6f9b0ce9781e14f8d3a5241f046fe203053849311e48f80f9045c",
    "/manager-rex-loi.jpeg": "c3440458301099cb8e6371bc89d487929e916949a2e51e8806401624f85ba019",
    "/manager-shuza.jpeg": "078f4c901c13583f383b9f7023847c8fdd9d1d7cfd1694d0d7bf0aaf34cc8241",
    "/manager-reemu.jpeg": "e53917a3207ae38b30077e3a336553c8a0c7ac6ada4a49f1ab591107a290621a",
  })) {
    assert.equal(sha(source), hash, source);
  }
});

test("dossier hero sizes never ask for less than the frame's cover crop needs", () => {
  // Re-measured 2026-10-15 for the STAGE dossier (the old table had 517 px desktop frames).
  // Hero frames at rest: [viewport width, height, frame width, height] in CSS px.
  const frames = [
    [320, 844, 320, 456],
    [390, 844, 390, 456],
    [430, 844, 430, 456],
    [700, 900, 449, 488],
    [760, 1366, 754, 820],
    [768, 1024, 456, 495],
    [820, 900, 383, 416],
    [1024, 1366, 657, 714],
    [844, 390, 288, 274],
    [844, 600, 288, 312],
    [900, 700, 414, 624],
    [932, 600, 429, 532],
    [1024, 900, 471, 824],
    [1100, 560, 506, 484],
    [1100, 900, 506, 824],
    [1280, 500, 346, 376],
    [1280, 900, 589, 824],
    [1440, 530, 298, 324],
    [1440, 900, 662, 824],
    [1680, 1080, 773, 1004],
    [1920, 1080, 820, 1004],
    [2560, 1366, 820, 1290],
  ];
  // The subset of sizes that dossierHeroSizes writes: width, height and
  // orientation conditions; px, vw and vh lengths in min(), max() and calc().
  const split = (text) => {
    const parts = [];
    let depth = 0;
    let start = 0;
    for (let i = 0; i < text.length; i++) {
      if (text[i] === "(") depth++;
      else if (text[i] === ")") depth--;
      else if (text[i] === "," && depth === 0) {
        parts.push(text.slice(start, i).trim());
        start = i + 1;
      }
    }
    return [...parts, text.slice(start).trim()];
  };
  const length = (expression, vw, vh) => {
    const value = expression.trim();
    const call = value.match(/^(min|max|calc)\((.*)\)$/);
    if (call) {
      if (call[1] === "calc") {
        const product = call[2].match(/^\((.*)\) \* ([\d.]+)$/);
        if (product) return length(`calc(${product[1]})`, vw, vh) * Number(product[2]);
        const difference = call[2].match(/^(.*) - (.*)$/);
        if (difference) return length(difference[1], vw, vh) - length(difference[2], vw, vh);
        return length(call[2], vw, vh);
      }
      const values = split(call[2]).map((part) => length(part, vw, vh));
      return call[1] === "min" ? Math.min(...values) : Math.max(...values);
    }
    const unit = value.match(/^([\d.]+)(px|vw|vh)$/);
    assert.ok(unit, `unsupported length ${value}`);
    const number = Number(unit[1]);
    return unit[2] === "px" ? number : (number * (unit[2] === "vw" ? vw : vh)) / 100;
  };
  const evaluate = (sizes, vw, vh) => {
    for (const entry of split(sizes)) {
      const conditions = [
        ...entry.matchAll(/\((max-width|min-width|min-height|orientation): ([^)]+)\)/g),
      ];
      const matches = conditions.every(([, feature, value]) => {
        if (feature === "orientation") return (vw > vh ? "landscape" : "portrait") === value;
        const limit = Number.parseFloat(value);
        if (feature === "max-width") return vw <= limit;
        if (feature === "min-width") return vw >= limit;
        return vh >= limit;
      });
      if (!matches) continue;
      return length(entry.replace(/^(?:\([^)]+\)(?: and )?)+/, ""), vw, vh);
    }
    throw new Error(sizes);
  };
  for (const [key, set] of Object.entries(DOSSIER_HERO_IMAGES)) {
    const sizes = dossierHeroSizes(set.aspect);
    for (const [vw, vh, w, h] of frames) {
      const need = Math.max(w, h * set.aspect);
      // Phones' full-bleed frame is asked for at 92vw (the site's 0.9 rule), so a 2x phone
      // keeps the 720 px file and a 3x phone the full one; elsewhere the full need.
      const floor = vw <= 760 ? need * 0.9 : need - 0.5;
      assert.ok(evaluate(sizes, vw, vh) >= floor, `${key} at ${vw}x${vh}: ${sizes}`);
    }
  }
});

test("each hero and its navigation warm-ups ask with one srcset and sizes", () => {
  const stub = read("src/components/world/manager-stub.tsx");
  const related = read("src/components/world/related-page.tsx");
  assert.match(stub, /src=\{profile\.image\}\s*\{\.\.\.dossierImage\(profile\.image\)\}/);
  assert.match(related, /src=\{person\.image\}\s*\{\.\.\.dossierImage\(person\.image\)\}/);
  // The full candidate is the WebP each hero loaded before.
  // (テラ's is followed by the 1470 px step drawn from her supplied JPEG.)
  for (const source of [stub, related]) {
    for (const [, image, webp] of source.matchAll(/image: "([^"]+)",\s*imageWebp: "([^"]+)",/g)) {
      const set = dossierImage(image);
      if (image.startsWith("/manager-lejas")) continue;
      assert.match(
        set.srcSet,
        new RegExp(`${webp} \\d+w(?:, /character-terra-1470\\.webp 1470w)?$`),
        image,
      );
      assert.ok(set.sizes, image);
    }
  }
  // The warm-ups name the same URLs (a query only busts the cache).
  for (const [name, [asset]] of Object.entries(MANAGER_ASSETS)) {
    if (name === "lejas") {
      // レジャス's page draws its own hero from the one WebP.
      assert.deepEqual(dossierImage(asset), { srcSet: "/manager-lejas.webp" });
      assert.match(read("src/components/world/lejas-page.tsx"), /srcSet="\/manager-lejas\.webp"/);
      continue;
    }
    assert.ok(DOSSIER_HERO_IMAGES[asset.split("?")[0]], name);
  }
  const nav = read("src/components/world/dossier-nav.tsx");
  for (const [, href, asset] of nav.matchAll(
    /href: "(\/(?:managers|characters)\/[^"]+)",[\s\S]*?assets: \["([^"]+)"\]/g,
  )) {
    if (href === "/characters/ciel") {
      assert.equal(asset, CIEL_PORTRAIT.source);
      assert.deepEqual(dossierImage(asset), cielPortrait());
      continue;
    }
    if (href === "/managers/lejas") continue;
    assert.ok(DOSSIER_HERO_IMAGES[asset.split("?")[0]], href);
  }
  // The warm-up takes both attributes, sizes first.
  assert.match(
    read("src/lib/asset-loader.ts"),
    /const responsive = responsiveImage\(url\);\s*if \(responsive\.srcSet\) \{\s*if \(responsive\.sizes\) image\.sizes = responsive\.sizes;\s*image\.srcset = responsive\.srcSet;/,
  );
});

test("the Rexonance pickup: card, record and gate warm-up on one candidate", () => {
  const source = "/rider-rexonance-saga-pickup-20260922.webp";
  assert.deepEqual(formPickupImage(source), {
    srcSet: rexonanceImage(source).srcSet,
    sizes: FORM_PICKUP_SIZES,
  });
  assert.deepEqual(formPickupImage("/rider-profile-realm.jpeg"), {});
  for (const candidate of rexonanceImage(source).srcSet.split(", ")) {
    const [path, width] = candidate.split(" ");
    assert.equal(webpSize(readFileSync(file(path)))[0], Number.parseInt(width), path);
  }
  const stub = read("src/components/world/manager-stub.tsx");
  assert.equal(
    stub.match(
      /src=\{rider\.img\}\s*\{\.\.\.dossierImage\(rider\.img\)\}\s*\{\.\.\.formPickupImage\(rider\.img\)\}/g,
    )?.length,
    1,
  );
  // The record's figure takes the form's second visual when it has one
  // (オーバーゼッツ カスタム, 2026-10-24), on the same candidate path.
  assert.match(
    stub,
    /src=\{rider\.recordImg \?\? rider\.img\}\s*\{\.\.\.dossierImage\(rider\.recordImg \?\? rider\.img\)\}\s*\{\.\.\.formPickupImage\(rider\.recordImg \?\? rider\.img\)\}/,
  );
  assert.match(
    stub,
    /const \{ srcSet, sizes \} = formPickupImage\(rider\.img\);\s*if \(sizes\) preload\.sizes = sizes;\s*if \(srcSet\) preload\.srcset = srcSet;\s*preload\.src = rider\.img;/,
  );
  // The supplied art stays as it is.
  assert.equal(sha(source), "8b6d15ff7440595f0fe79fbea8eaacc616ab7a44c28c7deea4a92d706e889f80");
});

test("the stale browser verifies check what the site now intends", () => {
  const other = read("scripts/verify-other-artwork.mjs");
  assert.match(other, /a\[href="\/characters\/yoake-mamori"\]'\)\.count\(\), 1\)/);
  assert.match(other, /"\.archive-placeholder"\)\.count\(\), 1\)/);
  const ios = read("scripts/verify-ios27-enhancements.mjs");
  assert.match(ios, /addInitScript\(\(\) => performance\.setResourceTimingBufferSize\(\d{4,}\)\)/);
  assert.match(ios, /assert\.equal\(requested\.length, 1/);
  const artwork = read("scripts/verify-rexonance-artwork.mjs");
  assert.match(artwork, /animation\.timeline === document\.timeline &&/);
  const polish = read("scripts/verify-navigation-polish.mjs");
  assert.match(polish, /key\.startsWith\("__reactProps"\)[\s\S]*?await trigger\.focus\(\);/);
});
