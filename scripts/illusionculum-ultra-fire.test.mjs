// ILLUSIONCULUM SAGA: every change into ウルトラ is carried by red fire
// (owner, 2026-11-20: 「イリュージョンクルムのウルトラへの切り替えも炎によって行います。…赤い炎」).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const fire = read("src/lib/illusionculum-fire.ts");

test("the fire's timeline is exact at both ends: the old form, then the owner's Ultra art", async () => {
  const { illusionculumFireFades } = await import("../src/lib/illusionculum-fire.ts");
  assert.deepEqual(illusionculumFireFades(0), { from: 1, to: 0 });
  assert.deepEqual(illusionculumFireFades(1), { from: 0, to: 1 });
  // Nothing of the fire is drawn outside (0, 1).
  assert.match(fire, /if \(!body \|\| !\(u > 0 && u < 1\)/);
});

test("the burn allocates nothing in a frame and reads no pixels back", () => {
  for (const name of ["function rasterFire", "function drawEmbers", "export function drawIllusionculumFire"]) {
    const start = fire.indexOf(name);
    const body = fire.slice(start, fire.indexOf("\n}\n", start));
    assert.ok(body.length > 200, name);
    assert.doesNotMatch(body, /\bnew\b|Array\.from|getImageData|filter|shadowBlur|Math\.random|performance\.now|Date\.now/, name);
  }
  // The raster's buffers are made once per context.
  assert.match(fire, /const buffers = new WeakMap<CanvasRenderingContext2D, Raster>\(\);/);
  // Coarse grid on touch, as FAR FROM's.
  assert.match(fire, /IC_FIRE_GRID = \{ desktop: \[208, 266\], touch: \[160, 204\] \}/);
});

test("the fire is red: crimson to scarlet with orange-white cores", () => {
  const rows = [...fire.matchAll(/^  \[(\d+), (\d+), (\d+)\],$/gm)].map((m) => m.slice(1).map(Number));
  assert.equal(rows.length, 6);
  for (const [r, g, b] of rows.slice(0, 4)) assert.ok(r > 2 * g && r > 2 * b, `${r},${g},${b}`);
});

test("the scroll chain's step into ウルトラ burns; the other changes keep their look", () => {
  const change = read("src/lib/illusionculum-form-change.ts");
  const ultra = change.slice(change.indexOf("if (ultraIn) {"), change.indexOf("if (orbsIn) {"));
  assert.match(ultra, /drawIllusionculumFire\(context, u, W, H, coarse, body\)/);
  assert.match(ultra, /if \(calm \|\| u <= 0 \|\| u >= 1\)/);
  assert.match(change, /const ultraIn = options\.ultraForms\.includes\(toKey\) && !options\.ultraForms\.includes\(fromKey\);/);
  // The field is warmed in idle time ahead of the chain.
  const engine = read("src/lib/illusionculum-assembly-engine.ts");
  assert.match(engine, /prepare: \(\) => warmIllusionculumFire\(\[\["standard", ILLUSIONCULUM_SUIT_FIGURE\]\]\)/);
});

test("the forms panel burns only a seen switch into ウルトラ, where motion is allowed", () => {
  const page = read("src/components/illusionculum-saga/illusionculum-saga.tsx");
  assert.match(page, /panelAnchor\.current !== null && motionAllowed\(\) && isUltra\(next\) && !isUltra\(previous\)/);
  assert.match(page, /<IllusionculumFormIgnition/);
  const component = read("src/components/illusionculum-saga/illusionculum-form-ignition.tsx");
  // A lazy chunk.
  assert.match(component, /import\("@\/lib\/illusionculum-form-ignition"\)/);
  const css = read("src/styles-illusionculum-saga.css");
  assert.match(css, /@media \(prefers-reduced-motion: reduce\), \(forced-colors: active\) \{\s*\.rxs-page\.rxs-page\.ics-page \.ics-form-panel > figure > \.ics-ignition \{\s*display: none;/);
});
