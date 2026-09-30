import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

/* Three small layout fixes left over from the recent passes (2026-09-30).
   - Back/Forward to /world: the router restores the reader's offset before
     the World measures its bar, so the hero's padding briefly used the
     fallback. An 80px fallback against the bar's real 76px made the hero
     4px taller for that moment and the page settled 4px off.
   - RE DIVE at 1024-1279px: the title grows with the width but its column
     holds at 240px; it is capped so SIX SIGNALS keeps one line.
   - Dream Chapter on landscape phones: the three cast arches share their
     row's tracks (subgrid), so the longest banner sets every portrait. */

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const strip = (css) => css.replace(/\/\*[\s\S]*?\*\//g, "");
const flat = (css) => strip(css).replace(/\s+/g, " ");

test("the World hero's bar fallback is the bar's real height", async () => {
  const programme = flat(await read("src/styles-world-programme.css"));
  const neo = flat(await read("src/styles-world-neo.css"));
  assert.match(
    programme,
    /\.site-shell\.film-edition > \.hero \{[^}]*padding: calc\(var\(--film-topbar-height, 76px\) \+ 32px\) 6vw 56px;/,
  );
  assert.match(neo, /inset: calc\(var\(--film-topbar-height, 76px\) \+ 14px\) 18px 18px;/);
  // No World rule guesses a desktop bar taller than it is.
  for (const [name, css] of [
    ["programme", programme],
    ["neo", neo],
  ]) {
    assert.doesNotMatch(css, /--film-topbar-height, 80px/, name);
  }
});

test("RE DIVE's title keeps SIX SIGNALS on one line beside the tablet spread", async () => {
  const css = flat(await read("src/styles-world-re-dive.css"));
  const at = css.indexOf("@media (min-width: 1024px) and (max-width: 1279px) {");
  assert.ok(at >= 0);
  const block = css.slice(at, css.indexOf("@media", at + 10));
  assert.match(
    block,
    /\.re-dive-section \.threat-copy h3 \{ font-size: min\(3\.2vw, 37\.5px\); \}/,
  );
});

test("Dream's landscape arches share their row's tracks", async () => {
  const css = flat(await read("src/styles-dream-elevation.css"));
  const at = css.indexOf("@media (max-height: 520px) and (orientation: landscape) {");
  assert.ok(at >= 0);
  const block = css.slice(at, css.indexOf("@media (forced-colors: active)", at));
  assert.match(block, /@supports \(grid-template-rows: subgrid\) \{/);
  assert.match(block, /\.dream-character-grid \{ row-gap: 0; \}/);
  assert.match(
    block,
    /\.dream-character-grid > article \{ display: grid; grid-row: span 4; grid-template-rows: subgrid; row-gap: 0; \}/,
  );
  assert.match(
    block,
    /\.dream-character-grid button\.ios26-glass \{ grid-row: 1 \/ -1; grid-template-rows: subgrid; row-gap: 0; \}/,
  );
});
