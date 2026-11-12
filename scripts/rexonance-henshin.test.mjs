// Owner (2026-11-01): 「装着アニメーションを大きく改善して」 — the bank's
// direction shared by Rexonance and Meta Unitas (src/lib/rexonance-henshin.ts).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  HenshinOverlay,
  HENSHIN_GATHER,
  HENSHIN_LOCKED,
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
    assert.ok(
      henshinProgress(from + step * HENSHIN_SEAT) - from > step * 0.9,
      "seated by the clamp",
    );
    assert.equal(henshinProgress(from + step * (HENSHIN_LOCKED + 0.01)), 0.16 + (beat + 1) * step);
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
  // Owner (2026-11-03): 「スクロール変身アニメーションは、もとの体がガタガタしない
  // タイプにもどして。」 — the scroll suit-ups play without the director; only
  // the entries (Rexonance's call, Meta Unitas' .mus-entry runway) keep it.
  assert.doesNotMatch(read("src/components/rexonance-saga/rexonance-saga.tsx"), /henshin/i);
  assert.match(
    read("src/lib/meta-unitas-rx-engine.ts"),
    /runway\.closest\("\.mus-entry"\)\s*\?\s*mountHenshinDirector\(/,
  );
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

test("Rexonance's call draws none of the overlay's linework; every other mount keeps all of it", () => {
  // Owner (2026-11-11): no line effects on Rexonance's suit-up. Its armour
  // grows as one front (rexonance-suit-skin.ts): the torrent's streaks, the
  // focus lines, the brackets, the hex ring, the sparks, the seal's bars and
  // ring and the pose's streak have no plate to belong to. The soft light
  // stays (each lock's glow and the seal's). The option is the
  // call's alone: Meta Unitas' director never passes it.
  const sheet = henshinEntrySheet(figure, {
    rider: 240,
    chant: 760,
    snaps: [880, 1000, 1120, 1240],
    response: 1500,
    tail: 1900,
    helm: 1890,
    final: 1980,
  });
  const play = (linework) => {
    const calls = { stroke: 0, lineTo: 0, fill: 0, fillRect: 0 };
    const store = {};
    const context = new Proxy(store, {
      get: (target, key) =>
        key in calls
          ? () => (calls[key] += 1)
          : key === "createRadialGradient" || key === "createLinearGradient"
            ? () => ({ addColorStop() {} })
            : key in target
              ? target[key]
              : () => {},
      set: (target, key, value) => {
        target[key] = value;
        return true;
      },
    });
    const canvas = { width: 1, height: 1, getContext: () => context };
    const tier = { lines: 22, sparks: 5, dpr: 1, lattice: false };
    const overlay =
      linework === undefined
        ? new HenshinOverlay(canvas, figure, { a: [121, 232, 255], b: [255, 143, 216], c: [242, 216, 150] }, tier)
        : new HenshinOverlay(canvas, figure, { a: [121, 232, 255], b: [255, 143, 216], c: [242, 216, 150] }, tier, linework);
    overlay.resize(390, 700);
    const camera = createHenshinCamera();
    const view = { x: 40, y: 20, s: 0.55, width: 390, height: 700 };
    // (After the omen: its heartbeat on the driver is soft light, kept.)
    for (let t = sheet.omen[1] + 80; t < 1980 + 1100; t += 10) {
      henshinCamera(sheet, t, camera);
      overlay.draw(sheet, t, camera, view);
    }
    return calls;
  };
  const all = play(undefined);
  assert.ok(all.stroke > 100 && all.lineTo > 100, "the bank's linework, as ever");
  const none = play(false);
  assert.equal(none.stroke, 0);
  assert.equal(none.lineTo, 0);
  assert.equal(none.fill, 0);
  assert.ok(none.fillRect > 20 && none.fillRect < all.fillRect, "the locks' and the seal's glow stays");
  assert.deepEqual(play(true), all);
  assert.match(
    read("src/components/rexonance-saga/rexonance-suit-surge.tsx"),
    /mountHenshinEntry\(figure, suit, \{\s*figure: REXONANCE_HENSHIN_FIGURE,\s*palette: REXONANCE_HENSHIN_PALETTE,\s*\/\/ [^\n]*\n\s*linework: false,/,
  );
  const source = read("src/lib/rexonance-henshin.ts");
  assert.match(source, /options\.linework !== false,/);
  // The director (Meta Unitas' entry) builds its overlay without the option.
  assert.match(source, /const overlay = new HenshinOverlay\(canvas, figure, options\.palette, tier\);/);
  assert.doesNotMatch(read("src/lib/meta-unitas-rx-engine.ts"), /linework/);
});
