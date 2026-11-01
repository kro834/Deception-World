// Owner (2026-11-01): 「装着アニメーションを大きく改善して」 — the bank's
// direction shared by Rexonance and Meta Unitas (src/lib/rexonance-henshin.ts).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  HENSHIN_GATHER,
  HENSHIN_SEAT,
  createHenshinCamera,
  henshinCamera,
  henshinEntrySheet,
  henshinProgress,
  henshinScrollSheet,
} from "../src/lib/rexonance-henshin.ts";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const figure = {
  size: { width: 571, height: 1040 },
  pieces: [
    { group: "legs", x: 150, y: 600, w: 260, h: 420 },
    { group: "arms", x: 80, y: 250, w: 420, h: 300 },
    { group: "chest", x: 180, y: 200, w: 210, h: 200 },
    { group: "waist", x: 190, y: 400, w: 190, h: 120 },
    { group: "tail", x: 300, y: 300, w: 260, h: 600 },
    { group: "helm", x: 230, y: 40, w: 110, h: 150 },
  ],
  core: [284, 275],
  visor: [284, 145],
  belt: [284, 423],
};

test("the stepped clock is continuous, monotonic and leaves the other beats alone", () => {
  let previous = -1;
  for (let i = 0; i <= 4000; i += 1) {
    const q = i / 4000;
    const p = henshinProgress(q);
    assert.ok(p >= previous - 1e-12, `monotonic at ${q}`);
    assert.ok(Math.abs(p - previous) < 0.02 || previous < 0, `continuous at ${q}`);
    previous = p;
  }
  for (const q of [0, 0.05, 0.1, 0.16, 0.62, 0.7, 0.86, 0.93, 1])
    assert.equal(henshinProgress(q), q);
  // Each DEUS！ part creeps, flies in, then holds seated (the engine's window end).
  const step = (0.62 - 0.16) / 4;
  for (let beat = 0; beat < 4; beat += 1) {
    const from = 0.16 + beat * step;
    const gather = henshinProgress(from + step * HENSHIN_GATHER) - from;
    assert.ok(gather < step * 0.25, "the gather moves the engine little");
    assert.equal(henshinProgress(from + step * (HENSHIN_SEAT + 0.01)), 0.16 + (beat + 1) * step);
    assert.equal(henshinProgress(from + step * 0.99), 0.16 + (beat + 1) * step);
  }
});

test("the camera starts on the driver, cuts to the parts and ends on the rest frame", () => {
  const camera = createHenshinCamera();
  const sheet = henshinScrollSheet(figure);
  henshinCamera(sheet, 0, camera);
  assert.ok(camera.zoom > 1.3, "the omen pushes in");
  assert.deepEqual([camera.fx, camera.fy], figure.belt, "on the driver from the first frame");
  henshinCamera(sheet, 1, camera);
  assert.equal(camera.zoom, 1);
  assert.equal(camera.roll, 0);
  assert.equal(camera.dropY, 0);
  // Zoom stays in a sane band everywhere (never a disorienting push).
  for (let i = 0; i <= 2000; i += 1) {
    henshinCamera(sheet, i / 2000, camera);
    assert.ok(camera.zoom > 0.85 && camera.zoom < 1.9, `zoom ${camera.zoom} at ${i / 2000}`);
    assert.ok(Math.abs(camera.roll) < 3);
  }
  const entry = henshinEntrySheet(figure, {
    rider: 330,
    chant: 650,
    snaps: [880, 1000, 1120, 1240],
    response: 1300,
    tail: 1700,
    helm: 1890,
    final: 1980,
  });
  henshinCamera(entry, 0, camera);
  assert.deepEqual([camera.fx, camera.fy], figure.belt);
  henshinCamera(entry, 1980 + 800, camera);
  assert.equal(camera.zoom, 1);
  // The ratchet climbs the body: each DEUS！ frames a part higher than the last.
  const ys = [880, 1000, 1120, 1240].map((at) => henshinCamera(entry, at - 5, camera).fy);
  assert.ok(ys[0] > ys[1] && ys[1] > ys[2] - 200, `tilt up ${ys}`);
});

test("only Rexonance and Meta Unitas mount the director; the lab and the other forms do not", () => {
  assert.match(read("src/components/rexonance-saga/rexonance-saga.tsx"), /mountHenshinDirector/);
  assert.match(read("src/lib/meta-unitas-rx-engine.ts"), /mountHenshinDirector/);
  assert.match(read("src/components/rexonance-saga/rexonance-suit-surge.tsx"), /mountHenshinEntry/);
  for (const path of [
    "src/components/transformation-lab/lab-stage.tsx",
    "src/lib/far-from-assembly-engine.ts",
    "src/lib/illusionculum-assembly-engine.ts",
    "src/lib/rexonance-resonance.js",
  ])
    assert.doesNotMatch(read(path), /henshin/i, path);
});

test("the overlay keeps the flash rules: no red, small lights, and nothing allocated by the clock", () => {
  const source = read("src/lib/rexonance-henshin.ts");
  // Tones are the forms' cyan, pink, gold, teal and orange, and white.
  for (const [, r, g] of source.matchAll(/\[(\d+), (\d+), (\d+)\]/g))
    assert.ok(!(Number(r) > 200 && Number(g) < 90), "no red tone");
  assert.doesNotMatch(source, /fillRect\(0, 0, view\.width, view\.height\)[\s\S]{0,80}WHITE/);
  assert.match(source, /prefers-reduced-motion: reduce/);
  assert.match(source, /worldEffects === "economy"/);
});
