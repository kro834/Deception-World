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

test("every face carries the metric overrides that centre its capitals in the line box", () => {
  // Measured with canvas fontBoundingBox vs the capital height (see the font
  // audit): Google's metrics leave Noto Sans JP and Michroma ~7% of the em
  // low and Oxanium and Cinzel ~5% high. ascent - descent is set to the cap
  // height; the sum of the two is kept so line boxes do not change height.
  const caps = { "Noto Sans JP": [110, 35, 75], Oxanium: [84.5, 15.5, 69], Cinzel: [102.5, 32.5, 70], Michroma: [109, 34, 75] };
  const faces = [...css.matchAll(/@font-face\s*\{([^}]+)\}/g)].map((match) => match[1]);
  for (const face of faces) {
    const family = face.match(/font-family: '([^']+)'/)[1];
    const [ascent, descent, cap] = caps[family];
    assert.equal(Number(face.match(/ascent-override: ([\d.]+)%;/)?.[1]), ascent, family);
    assert.equal(Number(face.match(/descent-override: ([\d.]+)%;/)?.[1]), descent, family);
    assert.match(face, /line-gap-override: 0%;/);
    assert.equal(ascent - descent, cap, `${family}: ascent - descent equals the cap height`);
  }
});

test("other routes load the corrected twins after the remote sheets", () => {
  const root = readFileSync(new URL("../src/routes/__root.tsx", import.meta.url), "utf8");
  const hud = root.indexOf('{ rel: "stylesheet", href: DOSSIER_HUD_FONTS_URL }');
  const twins = root.indexOf('[{ rel: "stylesheet", href: openingFontsCss }]');
  assert.ok(hud > 0 && twins > hud, "the corrected faces come after the remote Google sheets");
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
