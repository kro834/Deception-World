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
  const rows = [...fire.matchAll(/^ {2}\[(\d+), (\d+), (\d+)\],$/gm)].map((m) => m.slice(1).map(Number));
  assert.equal(rows.length, 6);
  for (const [r, g, b] of rows.slice(0, 4)) assert.ok(r > 2 * g && r > 2 * b, `${r},${g},${b}`);
});

test("the scroll chain's step into ウルトラ burns; the other changes keep their look", () => {
  const change = read("src/lib/illusionculum-form-change.ts");
  const ultra = change.slice(change.indexOf("if (ultraIn) {"), change.indexOf("if (orbsIn) {"));
  assert.match(ultra, /drawIllusionculumFire\(context, u, W, H, coarse, body\)/);
  // At rest (the engine's calm frame) the same moment burns: no calm gate.
  assert.match(ultra, /if \(u <= 0 \|\| u >= 1\)/);
  assert.doesNotMatch(ultra, /calm \|\||\|\| calm|if \(calm|!calm/);
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

test("the runway at rest on its finished figure: a choice into ウルトラ burns too", () => {
  const suitup = read("src/components/illusionculum-saga/illusionculum-suitup.tsx");
  assert.match(suitup, /isUltra\(form\) &&\s*!isUltra\(previous\) &&\s*runwayProgress\(runway!\) >= CHAIN_END/);
  assert.match(suitup, /runway!\.dataset\.rznState === "live"/);
  const ignition = read("src/lib/illusionculum-form-ignition.ts");
  // The burn hands the frame back to the engine on the same picture.
  assert.match(ignition, /delete runway\.dataset\.icsBurning;/);
  assert.match(read("src/styles-illusionculum-suitup.css"), /\.rzn-suitup\[data-ics-burning\]\s*> \.rzn-frame\s*> \.rzn-canvas \{\s*visibility: hidden;/);
});

// A fake panel picture: an EventTarget with the <img> fields the hand-off reads.
function fakeDestination({ complete = false, naturalWidth = 0, decode = () => Promise.resolve() } = {}) {
  const image = new EventTarget();
  image.complete = complete;
  image.naturalWidth = naturalWidth;
  image.currentSrc = "/illusionculum-saga-20261023/ultra-1280.webp";
  image.decode = decode;
  return image;
}
// No 2D context: the burn ends at once and waits only for the new picture.
const noContextCanvas = () => ({ getContext: () => null, parentElement: { style: {} } });
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

test("the panel's overlay never outstays a new picture that failed to load", async () => {
  const { mountIllusionculumFormIgnition } = await import("../src/lib/illusionculum-form-ignition.ts");
  // The picture errors after the burn: the overlay hands off.
  const destination = fakeDestination();
  let done = 0;
  const dispose = mountIllusionculumFormIgnition(noContextCanvas(), {}, destination, "standard", "ultra", () => done++);
  assert.equal(done, 0);
  destination.dispatchEvent(new Event("error"));
  assert.equal(done, 1);
  dispose();
  // Already broken when the burn mounts.
  let broken = 0;
  mountIllusionculumFormIgnition(
    noContextCanvas(),
    {},
    fakeDestination({ complete: true, naturalWidth: 0 }),
    "standard",
    "ultra",
    () => broken++,
  )();
  assert.equal(broken, 1);
});

test("a loaded panel picture whose decode() rejects still takes the frame", async () => {
  const { mountIllusionculumFormIgnition } = await import("../src/lib/illusionculum-form-ignition.ts");
  let done = 0;
  const destination = fakeDestination({
    complete: true,
    naturalWidth: 1280,
    decode: () => Promise.reject(new Error("EncodingError")),
  });
  mountIllusionculumFormIgnition(noContextCanvas(), {}, destination, "standard", "ultra", () => done++);
  await flush();
  assert.equal(done, 1);
  // A disposed overlay never calls back.
  let late = 0;
  const pending = fakeDestination();
  mountIllusionculumFormIgnition(noContextCanvas(), {}, pending, "standard", "ultra", () => late++)();
  pending.dispatchEvent(new Event("error"));
  assert.equal(late, 0);
});

test("the runway burn keeps the engine's pixel budget and leaves the chain to the scroll", () => {
  const ignition = read("src/lib/illusionculum-form-ignition.ts");
  const runway = ignition.slice(ignition.indexOf("export function mountIllusionculumRunwayIgnition"));
  assert.match(ignition, /const RUNWAY_PIXEL_BUDGET = 2_600_000;/);
  assert.match(runway, /Math\.sqrt\(RUNWAY_PIXEL_BUDGET \/ \(w \* h\)\)/);
  // The figure box is read on a size change, not every frame.
  const tick = runway.slice(runway.indexOf("const tick"), runway.indexOf("const start"));
  assert.match(tick, /if \(w !== width \|\| h !== height\) \{[\s\S]*getComputedStyle\(canvas\)[\s\S]*\n {4}\}/);
  // Scrolled back into the chain mid-burn, the engine's frame returns.
  const suitup = read("src/components/illusionculum-saga/illusionculum-suitup.tsx");
  assert.match(suitup, /if \(runwayProgress\(runway\) < CHAIN_END\) onDone\(\);/);
  assert.match(suitup, /window\.removeEventListener\("scroll", onScroll\);/);
});
