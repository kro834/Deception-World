import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL("../" + path, import.meta.url), "utf8");

test("opening and Rising use the owner's forest-green flame body in both rendering tiers", async () => {
  for (const path of [
    "src/components/cinematic/opening-noise.glsl",
    "src/components/cinematic/opening-burn.frag.glsl",
    "src/components/world/rising.frag.glsl",
    "scripts/render-rising-calm-sprites.mjs",
  ]) {
    assert.match(await read(path), /vec3\(0\.1333, 0\.5451, 0\.1333\)/, path);
  }
  // Owner (2026-10-19, docs/forest-green-fire-20261019.md): the opening's
  // single-logo trace (2026-10-21) keeps the green fire body in the WebGL
  // tier too; its flames are the shared ramp.
  const burn = await read("src/components/cinematic/opening-burn.frag.glsl");
  assert.match(burn, /vec3 fire = fireRamp\(heat\);/);
  const css = await read("src/styles-world-rising.css");
  assert.match(css, /--rw-ember: #228b22;/);
  const opening = await read("src/styles.css");
  assert.match(opening, /hue-rotate\(72deg\)/);
  const flames = opening.slice(opening.indexOf(".cine-burn-flame > i {"), opening.indexOf(".cine-burn-embers > i:nth-child"));
  assert.doesNotMatch(flames, /rgb\(255 (?:120|132|146|170)/);
  // The CSS tier renders styles.css's green: no sheet loaded on "/" after it
  // repaints the flame band, the embers, the hot copy or the light pool.
  for (const path of [
    "src/styles-opening-elevation.css",
    "src/styles-opening-cinema.css",
    "src/styles-opening-refinement.css",
  ]) {
    const sheet = await read(path);
    assert.doesNotMatch(sheet, /\.cine-burn-(?:flame|embers|hot|light)\b[^{}]*\{/, path);
  }
});
