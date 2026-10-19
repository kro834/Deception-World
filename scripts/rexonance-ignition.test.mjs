import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import sharp from "sharp";
import {
  NANITE_FIRE_PHASES,
  naniteFlameEnvelope,
  naniteFlameScatter,
  naniteMaterialLanding,
  sampleFlameBirth,
} from "../src/lib/rexonance-ignition.js";

test("shared phases keep the vortex, explosive clearing and first metal in that order", () => {
  assert.deepEqual(NANITE_FIRE_PHASES, {
    burstStart: 0.175,
    burstEnd: 7 / 30,
    materialStart: 0.25,
  });
  assert.ok(Object.isFrozen(NANITE_FIRE_PHASES));
  assert.equal(NANITE_FIRE_PHASES.burstStart * 2400, 420);
  assert.equal(NANITE_FIRE_PHASES.burstEnd * 2400, 560);
  assert.equal(NANITE_FIRE_PHASES.materialStart * 2400, 600);
  assert.equal(0.015 + 0.285 * NANITE_FIRE_PHASES.materialStart, 0.08625);
  assert.equal(naniteFlameEnvelope(0), 0);
  assert.equal(naniteFlameEnvelope(280 / 2400), 0.09);
  assert.equal(naniteFlameEnvelope(420 / 2400), 1);
  assert.equal(naniteFlameEnvelope(600 / 2400), 0);
  assert.equal(naniteFlameEnvelope(1), 0);
  const slow = naniteFlameEnvelope(200 / 2400);
  assert.ok(slow > 0 && slow < 0.09);
  assert.ok(
    naniteFlameEnvelope(400 / 2400) > slow * 8,
    "an actual flare, not a steady global fade",
  );
  let previous = 0;
  for (let i = 0; i <= 420; i++) {
    const value = naniteFlameEnvelope(i / 2400);
    assert.ok(value >= previous && value <= 1, "kindling/flare/hold is monotonic and bounded");
    previous = value;
  }
  for (let i = 420; i <= 2400; i++) {
    const value = naniteFlameEnvelope(i / 2400);
    assert.ok(value <= previous && value >= 0, "the handoff cannot respawn a second blaze");
    previous = value;
    if (i >= 600) assert.equal(value, 0, "the body blaze cannot remain over later metal formation");
  }
});

test("phase joins are continuous and preserve the same value after a reverse scrub", () => {
  for (const boundary of [
    0,
    280 / 2400,
    NANITE_FIRE_PHASES.burstStart,
    NANITE_FIRE_PHASES.burstEnd,
    NANITE_FIRE_PHASES.materialStart,
    1,
  ]) {
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

test("early boot growth is remapped after the clearing without moving fit or late armour", () => {
  assert.equal(naniteMaterialLanding(610, 710), 660);
  assert.equal(naniteMaterialLanding(660, 710), 685);
  assert.equal(naniteMaterialLanding(710, 710), 710);
  assert.equal(naniteMaterialLanding(750, 850), 750);
  for (const fit of [710, 720, 730, 740, 850, 1500, 2600]) {
    let previous = -Infinity;
    for (let i = 0; i <= 100; i++) {
      const before = fit - 100 + i;
      const actual = naniteMaterialLanding(before, fit);
      assert.ok(actual >= previous && actual <= fit && actual >= Math.min(fit, 660));
      previous = actual;
    }
    assert.equal(
      naniteMaterialLanding(fit, fit),
      fit,
      "the artwork keeps its original seating clock",
    );
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

test("every emitted nanite originates in the actual burning body rather than the halo or leg gap", async () => {
  const { data, info } = await sharp(
    readFileSync(new URL("../public/rexonance-suit-20261016/undersuit.webp", import.meta.url)),
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
    assert.ok(
      data[(y * info.width + x) * 4 + 3] > 16,
      `seed ${i}/1200 originates on the actual mask (${x},${y})`,
    );
    visited.add(`${Math.round(out[0] * 20)},${Math.round(out[1] * 20)}`);
  }
  assert.ok(visited.size > 35, "distributed body sources, not one central pump");
});
