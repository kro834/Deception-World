import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("neo interface is delivered last, and only by the World route", async () => {
  const route = await read("src/routes/world.tsx");
  const shared = await read("src/lib/world-head.ts");
  assert.match(route, /styles-world-neo\.css\?url/);
  assert.ok(
    route.indexOf("href: worldProgrammeSectionsCssUrl") < route.indexOf("href: worldNeoCssUrl"),
  );
  assert.doesNotMatch(shared, /worldNeo/);
});

test("neo interface is a static skin: no motion, media, blur or gesture ownership", async () => {
  const css = await read("src/styles-world-neo.css");
  assert.doesNotMatch(
    css,
    /touch-action:|overscroll-behavior:|scroll-snap-|animation:|@keyframes|url\(|(?<!-)filter\s*:\s*(?!none)/,
  );
  assert.doesNotMatch(css, /backdrop-filter:\s*(?!none)[a-z]+\(/);
  assert.match(css, /\.site-shell\.film-edition/);
  assert.match(css, /focus-visible/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /@media \(prefers-contrast: more\), \(prefers-reduced-transparency: reduce\)/);
});

test("chamfered controls keep their focus ring inside the clip", async () => {
  const css = await read("src/styles-world-neo.css");
  const clipped =
    css.match(/^[^{}]*\{[^}]*clip-path: var\(--neo-chamfer(?:-small)?\)[^}]*\}/gm) ?? [];
  assert.ok(clipped.length >= 5);
  assert.match(css, /\.primary-action:focus-visible \{\s*outline: none;\s*box-shadow:\s*inset/);
  assert.match(
    css,
    /\.poster-control-cluster > button:focus-visible \{\s*outline: none;\s*box-shadow: inset/,
  );
});

test("neo interface recolours the programme layer without touching rail geometry", async () => {
  const css = await read("src/styles-world-neo.css");
  assert.match(css, /--programme-red: var\(--neo-cyan\)/);
  assert.match(css, /--programme-paper: var\(--neo-text\)/);
  const riderTabs = css.match(/\.rider-tabs[^{]*\{([^}]*)\}/g) ?? [];
  for (const block of riderTabs) {
    assert.doesNotMatch(
      block,
      /\b(?:width|height|scale|transform|padding|margin|border-radius)\s*:/,
    );
  }
  assert.doesNotMatch(css, /\.liquid-selection-lens|\.liquid-rail-surface/);
});
