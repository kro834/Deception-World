import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import sharp from "sharp";
import {
  NANITE_AFTERBURN,
  NANITE_FIRE_PHASES,
  REXONANCE_ENTRY_AFTERBURN,
  REXONANCE_ENTRY_VORTEX_HOLD_MS,
  REXONANCE_SCROLL_AFTERBURN,
  naniteAfterburnEnvelope,
  naniteAfterburnProgress,
  naniteAfterburnQuench,
  entryCanonicalTime,
  entryElapsedTime,
  naniteFlameEnvelope,
  naniteFlameScatter,
  naniteMaterialLanding,
  sampleFlameBirth,
} from "../src/lib/rexonance-ignition.js";

test("the entry sustains its flame for one extra second before preserving every material clock", () => {
  assert.equal(REXONANCE_ENTRY_VORTEX_HOLD_MS, 1000);
  for (const [canonical, elapsed] of [
    [0, 0],
    [180, 180],
    [280, 280],
    [420, 1420],
    [468, 1468],
    [560, 1560],
    [528, 1528],
    [588, 1588],
    [600, 1600],
    [2730, 3730],
  ]) {
    assert.equal(entryElapsedTime(canonical), elapsed);
    assert.equal(entryCanonicalTime(elapsed), canonical);
  }
  let previous = -Infinity;
  for (let elapsed = 0; elapsed <= 4500; elapsed++) {
    const canonical = entryCanonicalTime(elapsed);
    assert.ok(canonical >= previous, "the real entry clock never runs its painter backwards");
    assert.ok(
      Math.abs(entryElapsedTime(canonical) - elapsed) < 1e-9,
      "real/canonical clocks are exact inverses",
    );
    if (elapsed < 1600)
      assert.ok(canonical < 600, "the extra flame interval cannot release material early");
    previous = canonical;
  }
  for (const elapsed of [280, 1420]) {
    const at = entryCanonicalTime(elapsed);
    assert.ok(Math.abs(entryCanonicalTime(elapsed - 1e-7) - at) < 1e-6);
    assert.ok(Math.abs(entryCanonicalTime(elapsed + 1e-7) - at) < 1e-6);
  }
  assert.ok(
    naniteFlameEnvelope(entryCanonicalTime(900) / 2400) > 0.6,
    "a visible flame survives the extended middle",
  );
  assert.ok(
    naniteFlameEnvelope(entryCanonicalTime(1250) / 2400) > 0.9,
    "the vortex remains strong near the end of the added second",
  );
  assert.equal(
    naniteFlameEnvelope(entryCanonicalTime(1600) / 2400),
    0,
    "the material floor still follows complete clearing",
  );
});

test("first metal overlaps the final 132ms of the explosion", () => {
  assert.deepEqual(NANITE_FIRE_PHASES, {
    burstStart: 0.175,
    burstEnd: 7 / 30,
    materialStart: 0.195,
    flameEnd: 0.25,
  });
  assert.ok(Object.isFrozen(NANITE_FIRE_PHASES));
  assert.equal(NANITE_FIRE_PHASES.burstStart * 2400, 420);
  assert.equal(NANITE_FIRE_PHASES.burstEnd * 2400, 560);
  assert.equal(NANITE_FIRE_PHASES.materialStart * 2400, 468);
  assert.ok(Math.abs(0.015 + 0.285 * NANITE_FIRE_PHASES.materialStart - 0.070575) < 1e-10);
  assert.equal(NANITE_FIRE_PHASES.flameEnd * 2400, 600);
  assert.ok(
    Math.abs((NANITE_FIRE_PHASES.flameEnd - NANITE_FIRE_PHASES.materialStart) * 2400 - 132) < 1e-9,
  );
  assert.ok(
    naniteFlameEnvelope(NANITE_FIRE_PHASES.materialStart) > 0,
    "nanites start while the last explosion is still glowing",
  );
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
    NANITE_FIRE_PHASES.flameEnd,
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

test("early boot growth starts just before clearing without moving fit or late armour", () => {
  assert.equal(naniteMaterialLanding(610, 710), 528);
  assert.equal(naniteMaterialLanding(660, 710), 619);
  assert.equal(naniteMaterialLanding(710, 710), 710);
  assert.equal(naniteMaterialLanding(750, 850), 750);
  assert.ok(
    naniteMaterialLanding(610, 710) < NANITE_FIRE_PHASES.flameEnd * 2400,
    "the first armour growth starts before the last flame disappears",
  );
  for (const fit of [710, 720, 730, 740, 850, 1500, 2600]) {
    let previous = -Infinity;
    for (let i = 0; i <= 100; i++) {
      const before = fit - 100 + i;
      const actual = naniteMaterialLanding(before, fit);
      assert.ok(actual >= previous && actual <= fit && actual >= Math.min(fit, 528));
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

test("the afterburn takes over from the detonation and burns through the assembly", () => {
  // Both scenes start it at the burst, not before: the intact vortex alone
  // precedes metal, as before.
  assert.equal(REXONANCE_ENTRY_AFTERBURN.from, NANITE_FIRE_PHASES.burstStart * 2400);
  assert.equal(REXONANCE_SCROLL_AFTERBURN.from, 0.015 + 0.285 * NANITE_FIRE_PHASES.burstStart);
  // Far beyond the old flame end, yet out before the entry's extinction
  // check (elapsed 3,600 ms) and before the scroll's clamp/seal (.86).
  assert.ok(REXONANCE_ENTRY_AFTERBURN.to > NANITE_FIRE_PHASES.flameEnd * 2400 * 3);
  assert.ok(entryElapsedTime(REXONANCE_ENTRY_AFTERBURN.to) < 3600);
  assert.ok(REXONANCE_SCROLL_AFTERBURN.to > 0.015 + 0.285 * NANITE_FIRE_PHASES.flameEnd + 0.6);
  assert.ok(REXONANCE_SCROLL_AFTERBURN.to < 0.86);
  for (const window of [REXONANCE_ENTRY_AFTERBURN, REXONANCE_SCROLL_AFTERBURN]) {
    assert.equal(naniteAfterburnProgress(window.from, window), 0);
    assert.equal(naniteAfterburnProgress(window.to, window), 1);
  }
  assert.equal(naniteAfterburnProgress(NaN, REXONANCE_ENTRY_AFTERBURN), 0);

  for (const burn of [-1, 0, 1, 2, NaN, Infinity]) assert.equal(naniteAfterburnEnvelope(burn), 0);
  // Continuous through its rise, sustained middle and die-down.
  let previous = 0;
  for (let i = 1; i < 2000; i += 1) {
    const value = naniteAfterburnEnvelope(i / 2000);
    assert.ok(Math.abs(value - previous) < 0.03, `continuous at ${i / 2000}`);
    previous = value;
  }
  assert.ok(previous < 0.001, "dies down to nothing at its end");
  assert.equal(naniteAfterburnEnvelope(NANITE_AFTERBURN.rise), 1);
  for (const burn of [0.2, 0.4, 0.6, 0.79])
    assert.ok(naniteAfterburnEnvelope(burn) > 0.8, `still burning strongly at ${burn}`);

  // When the vortex has gone, the afterburn is already alight: no dark gap.
  for (let t = REXONANCE_ENTRY_AFTERBURN.from; t <= 1200; t += 5) {
    const fire =
      naniteFlameEnvelope(t / 2400) +
      naniteAfterburnEnvelope(naniteAfterburnProgress(t, REXONANCE_ENTRY_AFTERBURN));
    assert.ok(fire > 0.5, `fire at canonical ${t} ms`);
  }
});

test("seated armour quenches the afterburn from the legs up, leaving a low fire", () => {
  assert.equal(naniteAfterburnQuench(NaN, 0.5), 0);
  assert.equal(naniteAfterburnQuench(0.5, NaN), 0);
  for (const y of [0, 0.3, 0.6, 1]) {
    assert.equal(naniteAfterburnQuench(0.1, y), 0, "nothing is quenched before metal seats");
    assert.ok(naniteAfterburnQuench(1, y) <= 0.5, "half the fire survives on every part");
  }
  // At every moment the soles are at least as quenched as the crown.
  for (let burn = 0; burn <= 1; burn += 0.05)
    assert.ok(naniteAfterburnQuench(burn, 0.95) >= naniteAfterburnQuench(burn, 0.1));
  assert.ok(naniteAfterburnQuench(0.6, 0.95) > 0.4);
  assert.equal(naniteAfterburnQuench(0.6, 0.05), 0);
});
