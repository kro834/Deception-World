import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import sharp from "sharp";
import {
  NANITE_FIRE_FRAGMENTS,
  NANITE_FIRE_PHASES,
  REXONANCE_ENTRY_VORTEX_HOLD_MS,
  entryCanonicalTime,
  entryElapsedTime,
  fireFragmentPose,
  naniteCombustion,
  naniteEngulf,
  naniteFlameEnvelope,
  naniteFlameScatter,
  naniteMaterialLanding,
  paintBodySilhouette,
  sampleFlameBirth,
} from "../src/lib/rexonance-ignition.js";

const ASPECT = 1040 / 571;

test("the entry stretches the fire's whole run uniformly over one extra second before preserving every material clock", () => {
  assert.equal(REXONANCE_ENTRY_VORTEX_HOLD_MS, 1000);
  for (const [canonical, elapsed] of [
    [0, 0],
    [210, 710],
    [420, 1420],
    [468, 1468],
    [560, 1560],
    [600, 1600],
    [2730, 3730],
  ]) {
    assert.ok(Math.abs(entryElapsedTime(canonical) - elapsed) < 1e-9);
    assert.ok(Math.abs(entryCanonicalTime(elapsed) - canonical) < 1e-9);
  }
  let previous = -Infinity;
  for (let elapsed = 0; elapsed <= 4500; elapsed++) {
    const canonical = entryCanonicalTime(elapsed);
    assert.ok(canonical >= previous, "the real entry clock never runs its painter backwards");
    assert.ok(Math.abs(entryElapsedTime(canonical) - elapsed) < 1e-9, "exact inverses");
    if (elapsed < 1600)
      assert.ok(canonical < 600, "the extra flame interval cannot release material early");
    previous = canonical;
  }
  // One pace: the engulf's phase advances linearly in elapsed time.
  const rate = (a, b) => (entryCanonicalTime(b) - entryCanonicalTime(a)) / (b - a);
  assert.ok(Math.abs(rate(100, 200) - rate(1200, 1300)) < 1e-9, "uniform stretch");
  assert.ok(Math.abs(rate(100, 200) - 420 / 1420) < 1e-9);
  assert.equal(naniteFlameEnvelope(entryCanonicalTime(900) / 2400), 1);
  assert.equal(naniteFlameEnvelope(entryCanonicalTime(1600) / 2400), 0);
});

test("the fire's phases keep their causal order: kindle, engulf, colour, torch, burst, material, end", () => {
  assert.deepEqual(NANITE_FIRE_PHASES, {
    kindle: 0.025,
    cleanFrom: 0.095,
    cleanTo: 0.165,
    cover: 0.16,
    burstStart: 0.175,
    burstEnd: 7 / 30,
    materialStart: 0.195,
    flameEnd: 0.25,
  });
  assert.ok(Object.isFrozen(NANITE_FIRE_PHASES));
  const P = NANITE_FIRE_PHASES;
  assert.ok(P.kindle < P.cleanFrom && P.cleanFrom < P.cover && P.cover < P.cleanTo);
  assert.ok(P.cleanTo < P.burstStart && P.burstStart < P.materialStart);
  assert.ok(P.materialStart < P.burstEnd && P.burstEnd < P.flameEnd);
  assert.equal(P.burstStart * 2400, 420);
  assert.equal(P.burstEnd * 2400, 560);
  assert.equal(P.materialStart * 2400, 468);
  assert.equal(P.flameEnd * 2400, 600);
  assert.ok(Math.abs(0.015 + 0.285 * P.materialStart - 0.070575) < 1e-10);
});

test("the envelope fades in with the kindle, holds through the torch and dies away through the detonation", () => {
  const P = NANITE_FIRE_PHASES;
  assert.equal(naniteFlameEnvelope(0), 0);
  assert.equal(naniteFlameEnvelope(P.kindle), 1);
  assert.equal(naniteFlameEnvelope(0.1), 1);
  assert.equal(naniteFlameEnvelope(P.burstStart), 1);
  assert.ok(naniteFlameEnvelope(P.materialStart) <= 0.83, "metal overlaps only the decline");
  assert.ok(naniteFlameEnvelope(P.materialStart) > 0.8);
  assert.equal(naniteFlameEnvelope(P.flameEnd), 0);
  assert.equal(naniteFlameEnvelope(1), 0);
  let previous = 0;
  for (let i = 0; i <= 420; i++) {
    const value = naniteFlameEnvelope(i / 2400);
    assert.ok(value >= previous && value <= 1);
    previous = value;
  }
  for (let i = 420; i <= 2400; i++) {
    const value = naniteFlameEnvelope(i / 2400);
    assert.ok(value <= previous && value >= 0);
    previous = value;
    if (i >= 600) assert.equal(value, 0, "nothing burns over the assembly");
  }
  for (const boundary of [0, P.kindle, P.burstStart, P.burstEnd, P.materialStart, P.flameEnd, 1]) {
    assert.ok(
      Math.abs(naniteFlameEnvelope(boundary - 1e-8) - naniteFlameEnvelope(boundary)) < 1e-6,
    );
    assert.ok(
      Math.abs(naniteFlameEnvelope(boundary + 1e-8) - naniteFlameEnvelope(boundary)) < 1e-6,
    );
  }
  const reference = Array.from({ length: 101 }, (_, i) => naniteFlameEnvelope(i / 100));
  for (let i = 100; i >= 0; i--) assert.equal(naniteFlameEnvelope(i / 100), reference[i]);
  for (const phase of [NaN, Infinity, -Infinity, -1, 2])
    assert.equal(naniteFlameEnvelope(phase), 0);
});

test("the engulf front climbs monotonically and continuously from the soles past the farthest body point, then creeps", () => {
  const P = NANITE_FIRE_PHASES;
  assert.equal(naniteEngulf(0), 0);
  assert.equal(naniteEngulf(-1), 0);
  assert.equal(naniteEngulf(NaN), 0);
  assert.ok(
    naniteEngulf(P.kindle) > 0.03 && naniteEngulf(P.kindle) < 0.1,
    "the kindle lights only the feet",
  );
  assert.ok(naniteEngulf(P.cover) > 1.05, "the whole body, hands and crown included, is covered");
  assert.ok(naniteEngulf(P.burstStart) > naniteEngulf(P.cover), "still creeping over the torch");
  let previous = 0;
  for (let i = 1; i <= 2000; i++) {
    const value = naniteEngulf((i / 2000) * P.burstStart);
    assert.ok(value >= previous, `monotone at ${i}`);
    assert.ok(value - previous < 0.01, `continuous at ${i}`);
    previous = value;
  }
  // The climb between the kindle and the cover is linear in phase: one
  // steady pace (the entry's uniform stretch keeps it steady in time).
  const slope = (a, b) => (naniteEngulf(b) - naniteEngulf(a)) / (b - a);
  assert.ok(Math.abs(slope(0.03, 0.05) - slope(0.12, 0.15)) < 1e-9);
});

test("complete combustion arrives continuously before the detonation, which is clean by definition", () => {
  const P = NANITE_FIRE_PHASES;
  assert.equal(naniteCombustion(0), 0);
  assert.equal(naniteCombustion(P.cleanFrom), 0);
  const midway = naniteCombustion((P.cleanFrom + P.cleanTo) / 2);
  assert.ok(midway > 0.4 && midway < 0.6);
  assert.equal(naniteCombustion(P.cleanTo), 1);
  assert.equal(naniteCombustion(P.burstStart), 1);
  assert.equal(naniteCombustion(1), 1);
  assert.equal(naniteCombustion(NaN), 0);
  let previous = 0;
  for (let i = 1; i <= 1000; i++) {
    const value = naniteCombustion((i / 1000) * P.burstStart);
    assert.ok(value >= previous && value - previous < 0.01, `no hue pop at ${i}`);
    previous = value;
  }
});

test("the outward scatter is a single continuous detonation, not a respawning particle clock", () => {
  assert.equal(naniteFlameScatter(NANITE_FIRE_PHASES.burstStart), 0);
  assert.equal(naniteFlameScatter(NANITE_FIRE_PHASES.burstEnd), 1);
  let previous = 0;
  const reference = [];
  for (let i = 0; i <= 100; i++) {
    const value = naniteFlameScatter(i / 100);
    assert.ok(Number.isFinite(value) && value >= previous && value <= 1);
    reference.push(value);
    previous = value;
  }
  for (let i = 100; i >= 0; i--) assert.equal(naniteFlameScatter(i / 100), reference[i]);
  for (const phase of [NaN, Infinity, -Infinity]) assert.equal(naniteFlameScatter(phase), 0);
});

test("burst fragments: cold on the body before the burst, flung out white hot, cooled into chips between materialStart and flameEnd", () => {
  const P = NANITE_FIRE_PHASES;
  const out = new Float64Array(6);
  const birth = new Float64Array(4);
  const coolAt = [];
  const travel = (a, b) => Math.hypot(a[0] - b[0], (a[1] - b[1]) * ASPECT);
  for (let i = 0; i < NANITE_FIRE_FRAGMENTS; i++) {
    const seed = (i + 0.5) / NANITE_FIRE_FRAGMENTS;
    sampleFlameBirth(seed, birth);
    assert.equal(fireFragmentPose(seed, 0.1, out), out);
    assert.deepEqual([out[0], out[1], out[2], out[3], out[4]], [birth[0], birth[1], 0, 0, 0]);
    assert.ok(out[5] > 0.01 && out[5] < 0.05, "a visible droplet, in widths");
    // Continuous outward flight with drag: distance grows, speed falls.
    let previousDistance = 0;
    let launch = 0;
    let cooled = null;
    for (let u = 0.01; u <= 1.0001; u += 0.01) {
      const phase = P.burstStart + (P.flameEnd - P.burstStart) * u;
      fireFragmentPose(seed, phase, out);
      assert.ok([...out].every(Number.isFinite));
      const distance = travel(out, birth);
      assert.ok(distance >= previousDistance - 1e-9, "never pulled back");
      const speed = Math.hypot(out[2], out[3] * ASPECT);
      if (u < 0.02) launch = speed;
      else assert.ok(speed < launch * (u < 0.1 ? 0.995 : u < 0.5 ? 0.8 : 0.3), "drag slows it");
      if (u < 0.99) assert.ok(speed > 0, "still moving before the end");
      assert.ok(out[4] >= 0 && out[4] <= 1);
      if (out[4] === 0 && cooled === null) cooled = phase;
      previousDistance = distance;
    }
    assert.ok(previousDistance > 0.08 && previousDistance < 0.5, "lands within the fire rect");
    assert.ok(cooled !== null && cooled >= P.materialStart - 1e-9 && cooled <= P.flameEnd + 1e-9);
    coolAt.push(cooled);
    fireFragmentPose(seed, P.burstStart + 0.004, out);
    assert.ok(out[4] > 0.8, "white hot right after the burst");
    fireFragmentPose(seed, P.materialStart - 1e-6, out);
    assert.ok(out[4] > 0, "no chip before materialStart");
    fireFragmentPose(seed, P.flameEnd, out);
    assert.equal(out[4], 0, "a chip by flameEnd");
    fireFragmentPose(seed, 1, out);
    assert.equal(out[4], 0);
  }
  assert.ok(
    Math.min(...coolAt) < P.materialStart + 0.015,
    "the first chips are born with the material",
  );
  assert.ok(Math.max(...coolAt) > P.burstEnd, "the last fragments cool after the burst has passed");
  // Seeds are periodic and the pose is a pure function: exact reverse scrub.
  const a = [...fireFragmentPose(0.25, 0.2, out)];
  fireFragmentPose(0.75, 0.24, out);
  assert.deepEqual([...fireFragmentPose(1.25, 0.2, out)], a);
  assert.deepEqual([...fireFragmentPose(NaN, NaN, out)], [...fireFragmentPose(0, 0, out)]);
});

test("early boot growth starts just before clearing without moving fit or late armour", () => {
  assert.equal(naniteMaterialLanding(610, 710), 528);
  assert.equal(naniteMaterialLanding(660, 710), 619);
  assert.equal(naniteMaterialLanding(710, 710), 710);
  assert.equal(naniteMaterialLanding(750, 850), 750);
  assert.ok(naniteMaterialLanding(610, 710) < NANITE_FIRE_PHASES.flameEnd * 2400);
  for (const fit of [710, 720, 730, 740, 850, 1500, 2600]) {
    let previous = -Infinity;
    for (let i = 0; i <= 100; i++) {
      const actual = naniteMaterialLanding(fit - 100 + i, fit);
      assert.ok(actual >= previous && actual <= fit && actual >= Math.min(fit, 528));
      previous = actual;
    }
    assert.equal(naniteMaterialLanding(fit, fit), fit);
  }
});

test("emission samples reuse the supplied buffer and invalid/periodic seeds agree deterministically", () => {
  const out = new Float64Array(4);
  assert.equal(sampleFlameBirth(0, out), out);
  const first = [...out];
  for (const seed of [1, 2, -1, NaN, Infinity, -Infinity]) {
    assert.equal(sampleFlameBirth(seed, out), out);
    assert.deepEqual([...out], first);
  }
  sampleFlameBirth(0.427, out);
  const pose = [...out];
  sampleFlameBirth(0.89, out);
  sampleFlameBirth(0.02, out);
  sampleFlameBirth(0.427, out);
  assert.deepEqual([...out], pose, "no previous frame or particle history changes the source");
});

test("every emitted nanite originates in the actual burning body, and the authored silhouette stands in for it", async () => {
  const { data, info } = await sharp(
    readFileSync(new URL("../public/rexonance-suit-20261016/undersuit-20261021.webp", import.meta.url)),
  )
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const out = new Float64Array(4);
  const visited = new Set();
  for (let i = 0; i < 1200; i++) {
    sampleFlameBirth(i / 1200, out);
    assert.ok([...out].every(Number.isFinite));
    assert.ok(out[0] > 0 && out[0] < 1 && out[1] > 0 && out[1] < 1);
    assert.ok(Math.abs(Math.hypot(out[2], out[3]) - 1) < 0.001, "finite outward normal");
    const x = Math.round(out[0] * info.width);
    const y = Math.round(out[1] * info.height);
    assert.ok(data[(y * info.width + x) * 4 + 3] > 16, `seed ${i}/1200 originates on the mask`);
    visited.add(`${Math.round(out[0] * 20)},${Math.round(out[1] * 20)}`);
  }
  assert.ok(visited.size > 35, "distributed body sources, not one central pump");
  const w = 96;
  const h = 175;
  const alpha = paintBodySilhouette(new Uint8Array(w * h), w, h, 0, 0, w, h);
  for (let i = 0; i < 1200; i++) {
    sampleFlameBirth(i / 1200, out);
    assert.ok(
      alpha[Math.round(out[1] * h) * w + Math.round(out[0] * w)] > 96,
      `seed ${i} lies on the silhouette`,
    );
  }
  let inside = 0;
  let total = 0;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if (alpha[y * w + x] > 96) {
        total++;
        const sx = Math.round(((x + 0.5) / w) * info.width);
        const sy = Math.round(((y + 0.5) / h) * info.height);
        if (data[(sy * info.width + sx) * 4 + 3] > 16) inside++;
      }
  assert.ok(inside / total > 0.8, `the silhouette lies on the undersuit (${inside}/${total})`);
});
