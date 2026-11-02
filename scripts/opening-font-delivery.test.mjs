import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

const css = readFileSync(new URL("../src/styles-opening-fonts.css", import.meta.url), "utf8");

test("the opening font snapshot preserves reviewed faces and source URLs", () => {
  // November 1 Google CSS snapshot: original ranges, weights, swap and WOFF2 URLs.
  // The metric overrides are the only local addition; with them stripped the
  // snapshot is byte-for-byte Google's.
  const body = css.slice(css.indexOf("/* latin-ext */"))
    .replace(/ {2}(?:ascent|descent|line-gap)-override: [^;]+;\n/g, "");
  assert.equal(createHash("sha256").update(body).digest("hex"),
    "83fc34dfce4dfacea3da981c9859e150d1e532f412d90c5e819862fae4e0f08b");
  const faces = [...css.matchAll(/@font-face\s*\{([^}]+)\}/g)].map((match) => match[1]);
  assert.equal(faces.length, 129);
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
  // ascent + descent sum is Google's own, so no line box changes height.
  // Noto Sans JP is deliberately left alone: its kana and kanji already sit
  // centred and only its Latin capitals sit low, which one face cannot split.
  const caps = { Oxanium: [84.5, 15.5, 100], Cinzel: [102.5, 32.5, 135], Michroma: [109, 34, 143] };
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
    assert.equal(ascent + descent, sum, `${family}: the line box keeps Google's height`);
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
  assert.equal(faces.length, 242);
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
