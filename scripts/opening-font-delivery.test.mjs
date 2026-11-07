import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

const css = readFileSync(new URL("../src/styles-opening-fonts.css", import.meta.url), "utf8");
const NON_NOTO_HASH = "30d9d0e19d92f84aa4e62e3b807a2961e4955967fd4d9aba03b2f8cc55a4597e";

test("the opening font snapshot preserves reviewed faces and source URLs", () => {
  // November 1 Google CSS snapshot: original ranges, weights, swap and WOFF2 URLs.
  // The metric overrides are the only local addition; with them stripped the
  // snapshot is byte-for-byte Google's.
  // Owner (2026-11-06): the Noto faces keep Google's ranges minus the characters
  // the site's own subsets carry (scripts/build-font-subsets.mjs), so they are
  // left out of the byte-for-byte check; the other families are untouched.
  const body = css.slice(css.indexOf("/* latin-ext */"))
    .replace(/ {2}(?:ascent|descent|line-gap)-override: [^;]+;\n/g, "")
    .replace(/(\/\*[^*]*\*\/\n)?@font-face \{[^}]*'Noto Sans JP'[^}]*\}\n?/g, "");
  assert.equal(createHash("sha256").update(body).digest("hex"), NON_NOTO_HASH);
  const faces = [...css.matchAll(/@font-face\s*\{([^}]+)\}/g)].map((match) => match[1]);
  assert.equal(faces.filter((face) => !face.includes("'Noto Sans JP'")).length, 5);
  assert.ok(faces.length > 100 && faces.length <= 129);
  assert.deepEqual([...new Set(faces.map((face) => face.match(/font-family: '([^']+)'/)[1]))].sort(),
    ["Cinzel", "Michroma", "Noto Sans JP", "Oxanium"]);
  for (const face of faces) {
    assert.match(face, /font-display: swap;/);
    assert.match(face, /src: url\(https:\/\/fonts\.gstatic\.com\/[^)]+\) format\('woff2'\);/);
  }
  assert.doesNotMatch(css, /@import|fonts\.googleapis\.com/);
});

test("the opening route reuses the root-owned local font stylesheet", () => {
  const route = readFileSync(new URL("../src/routes/index.tsx", import.meta.url), "utf8");
  assert.match(route, /import openingFontsCssUrl from "\.\.\/styles-opening-fonts\.css\?url"/);
  assert.match(route, /rel: "stylesheet", href: openingFontsCssUrl/);
  assert.doesNotMatch(route, /DOSSIER_HUD_FONTS_URL|fonts\.googleapis\.com/);
});

const faceBlocks = (text) => [...text.matchAll(/@font-face\s*\{([^}]+)\}/g)].map((match) => match[1]);

test("Cinzel, Oxanium and Michroma carry the metric overrides that centre their capitals", () => {
  // Measured with canvas fontBoundingBox vs the glyph ink (see the font audit):
  // Google's metrics leave Michroma ~7% of the em low and Oxanium and Cinzel
  // ~5% high. The overrides put the ink on the line-box centre at 11-24px once
  // Blink's integer rounding of ascent and descent is accounted for; the
  // ascent + descent sum of Oxanium and Cinzel is Google's own, so their line
  // boxes keep their height.
  // Noto Sans JP is deliberately left alone. Round 2 tried the owner's idea of a
  // Latin-range face with its own overrides: Blink takes the line box from the
  // face that covers the space character, which is that Latin face, so the
  // override moved the kana of the same element exactly as far (measured: -1px
  // for both at 12px) and no face can split them. Blink also rounds a face's
  // ascent and descent in whole pixels, so a family-wide shift is a full pixel
  // and puts the many controls that are already centred a pixel high.
  // Michroma's 103/24 (sum 127, not Google's 143) is the pair that keeps the
  // title's ENTER THE WORLD closest to centre across the 12-15px the clamp
  // reaches (worst 0.75px over 1133, 1194 and 1280 wide at dpr 2 and 1.5;
  // Google's pair left it a pixel high at 13-13.75px) while leaving the other
  // Michroma ink (the DW sigil, the dossier brand) where round 1 put it. No pair
  // does better everywhere: the baseline also snaps to the box's fractional top.
  const caps = { Oxanium: [84.5, 15.5, 100], Cinzel: [102.5, 32.5, 135], Michroma: [103, 24, 127] };
  const faces = faceBlocks(css);
  for (const face of faces) {
    const family = face.match(/font-family: '([^']+)'/)[1];
    if (family === "Noto Sans JP") {
      assert.doesNotMatch(face, /-override:/);
      continue;
    }
    const [ascent, descent, sum] = caps[family];
    assert.equal(Number(face.match(/ascent-override: ([\d.]+)%;/)?.[1]), ascent, family);
    assert.equal(Number(face.match(/descent-override: ([\d.]+)%;/)?.[1]), descent, family);
    assert.match(face, /line-gap-override: 0%;/);
    assert.equal(ascent + descent, sum, `${family}: ascent + descent as documented above`);
  }
});

test("other routes load the same corrected faces after the remote sheets", () => {
  const root = readFileSync(new URL("../src/routes/__root.tsx", import.meta.url), "utf8");
  const hud = root.indexOf('{ rel: "stylesheet", href: DOSSIER_HUD_FONTS_URL }');
  const twins = root.indexOf('[{ rel: "stylesheet", href: siteMetricFacesCss }]');
  assert.ok(hud > 0 && twins > hud, "the corrected faces come after the remote Google sheets");
  const metric = readFileSync(new URL("../src/styles-site-metric-faces.css", import.meta.url), "utf8");
  const expected = faceBlocks(css).filter((face) => !face.includes("'Noto Sans JP'"));
  assert.equal(expected.length, 5);
  assert.deepEqual(faceBlocks(metric), expected, "the twin sheet is the snapshot's non-Noto faces, verbatim");
});

test("Zen Kaku Gothic New is served from this origin with the same overrides on every face", () => {
  const zen = readFileSync(new URL("../src/styles-site-display-fonts.css", import.meta.url), "utf8");
  const faces = [...zen.matchAll(/@font-face\s*\{([^}]+)\}/g)].map((match) => match[1]);
  // Google's 242 faces, less those whose whole range the subsets carry.
  assert.ok(faces.length > 200 && faces.length <= 242);
  for (const face of faces) {
    assert.match(face, /font-family: 'Zen Kaku Gothic New';/);
    assert.match(face, /font-weight: (500|700);/);
    assert.match(face, /font-display: swap;/);
    assert.match(face, /ascent-override: 109%;\n {2}descent-override: 36%;\n {2}line-gap-override: 0%;/);
    assert.match(face, /src: url\(https:\/\/fonts\.gstatic\.com\/[^)]+\) format\('woff2'\);/);
  }
  assert.doesNotMatch(zen, /@import|fonts\.googleapis\.com/);
  const root = readFileSync(new URL("../src/routes/__root.tsx", import.meta.url), "utf8");
  assert.match(root, /link\.href === SITE_DISPLAY_FONTS_URL \? \{ \.\.\.link, href: siteDisplayFontsCss \}/);
});

test("the optics sheet nudges layout only, so the button glass is never overridden", () => {
  // Round 2: icon+label pills, submits, chapter tabs and the gallery's chip row are
  // centred or un-clipped with margin and padding alone. No paint, filter or
  // transform property may appear, so glass on and off keep one geometry.
  const optics = readFileSync(new URL("../src/styles-control-optics.css", import.meta.url), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "");
  const props = new Set([...optics.matchAll(/([a-z-]+)\s*:[^;{}]+;/g)].map((match) => match[1]));
  assert.ok(props.size > 0);
  for (const prop of props)
    assert.match(prop, /^(margin|padding|scroll-padding)(-[a-z]+)*$/, `${prop} is not a layout nudge`);
  // Every rule outranks the route sheets that load after it (:not(#a) adds an id's weight).
  for (const rule of optics.matchAll(/([^{}]+)\{[^{}]*\}/g)) {
    const selector = rule[1].trim();
    if (selector.startsWith("@media")) continue;
    assert.match(selector, /:not\(#a\)/, selector);
  }
});

test("the title's skip plate is balanced where the key cap is absent", () => {
  const elevation = readFileSync(new URL("../src/styles-opening-elevation.css", import.meta.url), "utf8");
  assert.match(
    elevation,
    /@media \(pointer: coarse\) \{\s*html \.cine-skip:not\(#a\) \{\s*padding-inline: 14\.8px;/,
  );
});
