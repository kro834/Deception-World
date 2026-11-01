import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

const css = readFileSync(new URL("../src/styles-opening-fonts.css", import.meta.url), "utf8");

test("the opening font snapshot preserves reviewed faces and source URLs", () => {
  // November 1 Google CSS snapshot: original ranges, weights, swap and WOFF2 URLs.
  const body = css.slice(css.indexOf("/* latin-ext */"));
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
