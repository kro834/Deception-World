import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const styles = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
const rules = styles.replace(/\/\*[\s\S]*?\*\//g, "");
const body = (selector) => {
  const start = rules.indexOf(`${selector} {`);
  assert.ok(start >= 0, selector);
  return rules.slice(start, rules.indexOf("}", start));
};

// Measured on a Galaxy profile (412 x 915 at DPR 3.5, 4x CPU): once the title
// held, 120 compositor and main frames a second, 262 MB of tiles and 10
// render passes; with these rules 0 frames a second, 105 MB and 4 passes.
test("Android drops the grain and the bloom's blur on the opening", () => {
  assert.match(body("html[data-android-renderer] .cine-grain"), /display: none;/);
  assert.match(body("html[data-android-renderer] .cine-impact-bloom::before"), /filter: none;/);
});

test("the held title is still on Android: HUD rotations pause, scene layers merge", () => {
  assert.match(
    rules,
    /html\[data-android-renderer\]\s*\.cine-stage\.is-complete\s*:is\(\.cine-hud-spin, \.cine-hud-spin-rev, \.cine-hud-orbits\) \{\s*animation-play-state: paused;/,
  );
  const merge = rules.match(
    /html\[data-android-renderer\]\s*\.cine-stage\.is-complete\s*:is\(([^)]*)\) \{\s*will-change: auto;/,
  );
  assert.ok(merge, "will-change is released once the title holds");
  for (const layer of [".cine-camera", ".cine-depth-field", ".cine-depth-grid", ".cine-aperture", ".cine-orbit", ".cine-hud"])
    assert.match(merge[1], new RegExp(layer.replace(".", "\\.")));
  // The burn and the dive keep their own engines and layers.
  assert.doesNotMatch(merge[1], /cine-logo-burn|cine-dive|cine-logo-first/);
});

test("finished, transparent layers of the held title cost no pass or frame anywhere", () => {
  assert.match(body(".is-complete .cine-logo-shine"), /display: none;/);
  assert.match(body(".is-complete .cine-scanline"), /display: none;/);
  // The controls' blur transition ends on no filter (blur(0) kept a render pass).
  assert.match(body(".is-complete .cine-chrome"), /filter: none;/);
  assert.match(body(".is-complete .cine-chrome"), /transition:[\s\S]*filter 0\.35s ease 0\.05s/);
  assert.match(rules, /\.is-playing \.cine-pulse,\s*\.is-complete \.cine-pulse \{\s*animation-play-state: paused;/);
});
