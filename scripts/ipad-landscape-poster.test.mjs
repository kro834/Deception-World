import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const css = readFileSync(new URL("../src/styles-stage-world.css", import.meta.url), "utf8");

test("landscape poster gets a definite viewport budget, not a circular percentage width", () => {
  const block = css.slice(css.indexOf("/* Landscape tablets:"), css.indexOf("/* Portrait tablets"));
  assert.match(block, /min-width: 981px/);
  assert.match(block, /max-width: 1440px/);
  assert.match(block, /min-height: 650px/);
  assert.match(block, /orientation: landscape/);
  assert.match(block, /html\[data-family="world"\]/);
  assert.match(
    block,
    /--poster-width: min\(\s*36vw,\s*440px,\s*calc\(\(100svh - var\(--film-topbar-height, 76px\) - 230px\) \* 2 \/ 3\)\s*\)/,
  );
  assert.match(block, /width: var\(--poster-width\)/);
  assert.match(block, /grid-template-columns: minmax\(0, 1fr\) minmax\(0, 1\.4fr\)/);
  assert.doesNotMatch(block, /--poster-width:[^;]*100%/);
});

test("common iPad landscape sizes leave room for the full poster and touch controls", () => {
  for (const [width, height] of [
    [1024, 768],
    [1133, 744],
    [1194, 834],
    [1366, 1024],
    [1024, 650],
  ]) {
    const posterWidth = Math.min(width * 0.36, 440, ((height - 76 - 230) * 2) / 3);
    assert.ok(posterWidth > 220);
    assert.ok(posterWidth * 1.5 + 156 + 76 + 40 <= height, `${width}x${height} preserves controls`);
  }
});

test("the active World frame budgets room for controls independently of image format", () => {
  const stage = readFileSync(
    new URL("../src/styles-world-artwork-stage.css", import.meta.url),
    "utf8",
  );
  assert.match(stage, /@media \(min-width: 900px\) and \(orientation: landscape\)\s*\{/);
  assert.match(
    stage.replace(/\s+/g, " "),
    /100svh - var\(--film-topbar-height, 76px\) - var\(--world-stage-top\) - var\(--world-stage-bottom\) -\s*64px/,
  );
  assert.doesNotMatch(stage, /data-format\s*=/);
  for (const [width, height] of [
    [1024, 650],
    [1024, 768],
    [1133, 744],
    [1194, 834],
    [1366, 1024],
  ]) {
    const top = Math.min(44, Math.max(18, width * 0.026));
    const bottom = Math.min(60, Math.max(22, width * 0.034));
    const frame = Math.min(740, Math.max(320, height - 76 - top - bottom - 64));
    assert.ok(frame + 76 + top + bottom + 58 <= height, `${width}×${height}`);
  }
});
