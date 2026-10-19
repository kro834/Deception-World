import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import sharp from "sharp";
import {
  naniteFlameEnvelope,
  naniteFlameScatter,
  sampleFlameBirth,
} from "../src/lib/rexonance-ignition.js";

test("one shared envelope ignites quietly, flares quickly, then hands off without a second ignition", () => {
  assert.equal(naniteFlameEnvelope(0), 0);
  assert.equal(naniteFlameEnvelope(280 / 2400), 0.09);
  assert.equal(naniteFlameEnvelope(420 / 2400), 1);
  assert.equal(naniteFlameEnvelope(960 / 2400), 1);
  assert.equal(naniteFlameEnvelope(1), 0);
  const slow = naniteFlameEnvelope(200 / 2400);
  assert.ok(slow > 0 && slow < 0.09);
  assert.ok(
    naniteFlameEnvelope(400 / 2400) > slow * 8,
    "an actual flare, not a steady global fade",
  );
  let previous = 0;
  for (let i = 0; i <= 960; i++) {
    const value = naniteFlameEnvelope(i / 2400);
    assert.ok(value >= previous && value <= 1, "kindling/flare/hold is monotonic and bounded");
    previous = value;
  }
  for (let i = 960; i <= 2400; i++) {
    const value = naniteFlameEnvelope(i / 2400);
    assert.ok(value <= previous && value >= 0, "the handoff cannot respawn a second blaze");
    previous = value;
  }
});

test("phase joins are continuous and preserve the same value after a reverse scrub", () => {
  for (const boundary of [0, 280 / 2400, 420 / 2400, 960 / 2400, 1]) {
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
  assert.equal(naniteFlameScatter(0.16), 0);
  assert.equal(naniteFlameScatter(0.36), 1);
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
