// META UNITAS SAGA — the changes into ウルトラ by white fire (owner,
// 2026-11-20: 「メタ・ウニタス…のウルトラへの切り替えも炎によって行います。…白い炎」).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { WHITE_FIRE_GRID, rasterWhiteFire } from "../src/lib/meta-unitas-white-fire.ts";
import { META_UNITAS_SHIFT, createMetaUnitasFormShift } from "../src/lib/meta-unitas-form-shift.ts";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

// A plain fuel: a body column in the middle of the figure.
function fuel() {
  const W = 72, H = 108;
  const body = new Float32Array(W * H);
  const plume = new Float32Array(W * H);
  const arrival = new Float32Array(W * H);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      body[i] = x > 24 && x < 48 && y > 10 && y < 100 ? 1 : 0;
      plume[i] = x > 24 && x < 48 && y < 100 ? Math.max(body[i], 0.6) : 0;
      arrival[i] = Math.min(1.2, Math.hypot((x / W - 0.5) * 2, (y / H - 0.29) * 3) / 2);
    }
  return { body, plume, arrival, embers: new Float32Array(180 * 3) };
}

test("the white fire is a closed form of u: the same u draws the same frame", () => {
  const [w, h] = WHITE_FIRE_GRID.touch;
  const f = fuel();
  const a = new Uint32Array(w * h), am = new Uint32Array(w * h);
  const b = new Uint32Array(w * h), bm = new Uint32Array(w * h);
  rasterWhiteFire(a, am, w, h, f, 0.47);
  rasterWhiteFire(b, bm, w, h, f, 0.9); // another moment between
  rasterWhiteFire(b, bm, w, h, f, 0.47);
  assert.deepEqual(b, a);
  assert.deepEqual(bm, am);
  assert.ok(a.some((v) => v !== 0), "it burns at its peak");
});

test("no fire before the change or once it is done; ウルトラ whole at the end", () => {
  const [w, h] = WHITE_FIRE_GRID.desktop;
  const f = fuel();
  const fire = new Uint32Array(w * h), mask = new Uint32Array(w * h);
  assert.equal(rasterWhiteFire(fire, mask, w, h, f, 0), false);
  assert.ok(fire.every((v) => v === 0) && mask.every((v) => v === 0));
  assert.equal(rasterWhiteFire(fire, mask, w, h, f, 1), false);
  assert.ok(fire.every((v) => v === 0));
});

test("the selector's burn plays only into ウルトラ, from a finished runway", () => {
  const beats = { form: [0.915, 0.975] };
  const shift = createMetaUnitasFormShift(beats);
  const base = { now: 0, shown: 1, scroll: 1, visible: true, motion: true };
  assert.equal(shift.request({ ...base, to: "standard" }), "ignore");
  assert.equal(shift.request({ ...base, to: "ultra", motion: false }), "ignore");
  assert.equal(shift.request({ ...base, to: "ultra", shown: 0.95 }), "ignore");
  assert.equal(shift.request({ ...base, to: "ultra" }), "start");
  assert.equal(shift.frame(100, 1).progress, 0.915);
  const mid = shift.frame(100 + META_UNITAS_SHIFT.burnMs / 2, 1);
  assert.ok(mid.progress > 0.915 && mid.progress < 0.975);
  // Back to ミドル while it burns: at once, the scroll's frame.
  assert.equal(shift.request({ ...base, to: "standard" }), "cancel");
  assert.equal(shift.frame(2000, 1), null);
  // It hands the frame back to the scroll once the window is played.
  shift.request({ ...base, to: "ultra" });
  let t = 0;
  while (shift.frame(t, 1)) t += 16;
  assert.ok(t >= META_UNITAS_SHIFT.burnMs && t < META_UNITAS_SHIFT.burnMs + 40);
});

test("every change into ウルトラ on the page is wired to the white fire", () => {
  const engine = read("src/lib/meta-unitas-rx-engine.ts");
  assert.match(engine, /if \(key !== "ultra"\) return skinForm\(/);
  assert.match(engine, /formShift: metaUnitasFormShiftKit,/);
  const page = read("src/components/meta-unitas-saga/meta-unitas-saga.tsx");
  assert.match(page, /const burn = animated && next === "ultra";/);
  assert.match(page, /<MetaUnitasIgnition destinationRef=\{stageArtRef\} onDone=\{endIgnition\} \/>/);
  const css = read("src/styles-meta-unitas-saga.css");
  assert.match(css, /@media \(prefers-reduced-motion: reduce\), \(forced-colors: active\) \{\n {2}\.mus-ignition \{\n {4}display: none;/);
  // The fire's palette has no red: white, silver and pale violet only.
  const fire = read("src/lib/meta-unitas-white-fire.ts");
  const stops = [...fire.matchAll(/^ {2}\[(\d+), (\d+), (\d+)\],$/gm)].map((m) => m.slice(1).map(Number));
  assert.equal(stops.length, 6);
  for (const [r, g, b] of stops) assert.ok(b >= r && b >= g, `${r} ${g} ${b}`);
});
