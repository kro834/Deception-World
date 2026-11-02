import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

// iPhone opening layout (2026-11-02). The elevation sheet re-skinned the meta
// row, the frame and the progress rail onto one gutter and one bar and lost
// the safe-area insets styles.css had: held sideways, a notched iPhone put the
// meta tags, the frame's sides and the rail's ends under the sensor housing,
// and a launch with a top inset put the meta tags under the status bar. On a
// short upright iPhone (an SE or a mini in Safari with its toolbars) SKIP
// covered the title caption and the motto ran across the logo. These pins keep
// both fixes; the measured layouts are in the opening Playwright sweeps.

const read = async (path) =>
  (await readFile(new URL(`../${path}`, import.meta.url), "utf8"))
    .replaceAll("\r\n", "\n")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\s+/g, " ");

test("the opening gutter clears the landscape side insets above 700 px", async () => {
  const css = await read("src/styles-opening-elevation.css");
  const block = css.match(
    /@media \(min-width: 701px\) \{ \.cine-stage \{ --cine-inset-x: max\(([^;]+)\); \} \}/,
  );
  assert.ok(block, "a min-width 701px gutter rule exists");
  assert.match(block[1], /4\.4vw/);
  assert.match(block[1], /env\(safe-area-inset-left, 0px\) \+ 10px/);
  assert.match(block[1], /env\(safe-area-inset-right, 0px\) \+ 10px/);
});

test("the top bar and the rows under it step down by the top inset", async () => {
  const css = await read("src/styles-opening-elevation.css");
  assert.match(
    css,
    /\.cine-letterbox\.top \{ height: calc\(var\(--cine-bar\) \+ env\(safe-area-inset-top, 0px\)\); \}/,
  );
  const shift = css.match(/([^{}]+)\{ margin-top: env\(safe-area-inset-top, 0px\); \}/);
  assert.ok(shift, "one rule shifts the rows by the top inset");
  for (const selector of [
    ".cine-sequence-meta",
    ".cine-editorial-frame",
    ".cine-editorial-type",
    ".cine-rails",
  ]) {
    assert.ok(shift[1].includes(selector), `${selector} steps down`);
  }
  // The ghost word keeps its centre on the picture.
  assert.match(
    css,
    /\.cine-editorial-word \{ margin-top: calc\(env\(safe-area-inset-top, 0px\) \/ -2\); \}/,
  );
});

test("short upright phones move SKIP into the empty ENTER row while playing", async () => {
  const css = await read("src/styles-opening-refinement.css");
  const query =
    "@media (min-width: 361px) and (max-width: 700px) and (max-height: 660px) and (orientation: portrait) {";
  const start = css.indexOf(query);
  assert.notEqual(start, -1, "the short portrait block exists");
  const block = css.slice(start, css.indexOf("@media", start + query.length));
  assert.match(block, /\.cine-stage \.cine-skip \{ bottom: calc\(max\(10vh, 72px\) \+ 6px\); \}/);
  assert.match(
    block,
    /\.cine-stage \.cine-editorial-caption \{ margin-bottom: calc\(max\(10vh, 72px\) \+ 52px \+ 6px - var\(--editorial-inset-y\)\); \}/,
  );
  assert.match(block, /\.cine-stage \.cine-cue \{ bottom: calc\(max\(10vh, 72px\) - 18px\); \}/);
  // ENTER THE WORLD and もう一度 keep their places.
  assert.doesNotMatch(block, /cine-replay-slot|cine-btn/);
});
