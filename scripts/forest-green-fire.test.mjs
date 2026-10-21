import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL("../" + path, import.meta.url), "utf8");

test("opening and Rising use the owner's forest-green flame body in both rendering tiers", async () => {
  // Owner (2026-10-21): the opening's title is one logo now, so its burn
  // became the key visual's streamline trace (opening-burn.frag.glsl, no
  // flame body); the shared ramp, RISING and the CSS tier keep the green.
  for (const path of [
    "src/components/cinematic/opening-noise.glsl",
    "src/components/world/rising.frag.glsl",
    "scripts/render-rising-calm-sprites.mjs",
  ]) {
    assert.match(await read(path), /vec3\(0\.1333, 0\.5451, 0\.1333\)/, path);
  }
  const css = await read("src/styles-world-rising.css");
  assert.match(css, /--rw-ember: #228b22;/);
  const opening = await read("src/styles.css");
  assert.match(opening, /hue-rotate\(72deg\)/);
  const flames = opening.slice(opening.indexOf(".cine-burn-flame > i {"), opening.indexOf(".cine-burn-embers > i:nth-child"));
  assert.doesNotMatch(flames, /rgb\(255 (?:120|132|146|170)/);
});
