import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  FIELD_BIRTH,
  FIELD_CAMERA,
  FIELD_FLASH_SHARE,
  FIELD_FRAGMENT_SHADER,
  FIELD_GL,
  FIELD_SEEDS,
  FIELD_SHAPE,
  FIELD_STATE,
  FIELD_VERTEX_SHADER,
  FIELD_WAKE,
  FIELD_WAKE_BIRTHS,
  FIELD_WAKE_RISE,
  REXONANCE_SCROLL_FLAME,
  createFieldLayer,
  drawFieldImpact,
  fieldCamera,
  fieldCameraBuffer,
  fieldCameraView,
  fieldContext,
  fieldFragment,
  fieldFragmentSeed,
  fieldHash,
  fieldIndices,
  fieldPose,
  fieldPunch,
  fieldScore,
  fieldSeeds,
  fieldState,
  fieldStateBuffer,
  fieldTake,
  fieldVertexBytes,
  fieldVisitSeed,
  scrollFlameAt,
  scrollFlamePhase,
} from "../src/lib/rexonance-field/index.js";
import { REXONANCE_FIELD_ENTRY, entryFieldScore } from "../src/lib/rexonance-field/field-entry.ts";
import {
  REXONANCE_CALL_BEATS,
  REXONANCE_ENTRY_TIMINGS,
  REXONANCE_SUIT_LIGHT,
  REXONANCE_SUIT_SNAP,
} from "../src/lib/rexonance-calls.ts";
import { REXONANCE_SUIT_MARKS, REXONANCE_SUIT_SIZE } from "../src/lib/rexonance-suit.ts";
import { NANITE_FIRE_PHASES, fireFragmentPose } from "../src/lib/rexonance-ignition.js";
import { ASSEMBLY_BEATS } from "../src/lib/rexonance-resonance.js";

/* RESONANCE FIELD (owner, 2026-10-21: 「装着方式はダイナミックでありつつ、何度
   見ても飽きない様な革新性や素晴らしさを追求して」; docs/rexonance-suitup-
   redesign-20261021.md). The field, its camera and its impacts are
   closed-form in each scene's clock and a visit's take: these pin that
   (exact scrubbing, exact identity around the pinned climax), the entry's
   score against the pinned call tables, the WebGL layer's contracts (feature
   detection, bounded buffers, a governor's prefix, context loss, release)
   and the composition in both scenes. */

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const F = FIELD_STATE;
const H = REXONANCE_SUIT_SIZE.height;
const W = REXONANCE_SUIT_SIZE.width;

const sampleScore = () =>
  fieldScore({
    wake: [100, 200],
    groups: [
      { x: 280, y: 800, sx: 100, sy: 200, from: 250, lock: 400, strength: 1 },
      { x: 280, y: 450, sx: 60, sy: 100, from: 410, lock: 520 },
      { x: 280, y: 160, sx: 20, sy: 60, from: 560, lock: 700, strength: 0.5 },
    ],
    collapse: [700, 800],
    detonate: [800, 900],
    end: 900,
    impulse: 100,
    origin: [284.2, 275.3],
  });

test("hashes and takes are pure functions of their seeds; a visit rolls a new one", () => {
  for (const [i, salt] of [
    [0, 0],
    [7, 11],
    [12000, 17],
    [-3, 2],
  ]) {
    const value = fieldHash(i, salt);
    assert.ok(value >= 0 && value < 1);
    assert.equal(fieldHash(i, salt), value);
  }
  assert.notEqual(fieldHash(1, 11), fieldHash(1, 12));
  assert.notEqual(fieldHash(1, 11), fieldHash(2, 11));
  const environment = { performance: { now: () => 1234.5 }, Date: { now: () => 1700000000000 } };
  const first = fieldVisitSeed(environment);
  const second = fieldVisitSeed(environment);
  assert.ok(Number.isInteger(first) && first >= 0 && first <= 0xffffffff);
  assert.notEqual(first, second, "the same clock on a later visit rolls a different seed");
  const takes = new Set();
  for (let seed = 0; seed < 400; seed += 1) {
    const take = fieldTake(seed);
    assert.ok(Object.isFrozen(take));
    assert.deepEqual(fieldTake(seed), take);
    assert.ok([3, 4, 5].includes(take.arms), String(take.arms));
    assert.ok(take.hand === 1 || take.hand === -1);
    assert.ok(take.twist >= 0.9 && take.twist <= 2.3);
    assert.ok(Math.abs(take.tilt) <= 0.25);
    assert.ok([0, 1, 2].includes(take.palette));
    assert.ok([0, 1, 2].includes(take.camera));
    assert.ok(take.phase >= 0 && take.phase < Math.PI * 2);
    takes.add(`${take.arms}${take.hand}${take.palette}${take.camera}${take.drift}`);
  }
  assert.ok(takes.size >= 40, `repeat viewings differ: ${takes.size} distinct takes`);
});

test("a score is validated and frozen; the entry's follows the pinned call tables", () => {
  assert.throws(() => fieldScore({ ...sampleScore(), wake: [2, 1] }), RangeError);
  assert.throws(
    () =>
      fieldScore({
        wake: [0, 1],
        groups: [
          { x: 0, y: 0, from: 2, lock: 5 },
          { x: 0, y: 0, from: 1, lock: 4 },
        ],
        collapse: [6, 7],
        end: 7,
        impulse: 1,
        origin: [0, 0],
      }),
    /out of order/,
  );
  const score = sampleScore();
  assert.ok(Object.isFrozen(score));
  assert.equal(score.count, 3);
  assert.deepEqual([...score.gstrength], [1, 1, 0.5]);

  const entry = entryFieldScore();
  assert.equal(entryFieldScore(), entry, "built once");
  // The wake is the burst (owner, 2026-10-21: the fire engulfs the undersuit
  // and bursts; its fragments are the nanites): the field's one window of
  // the fire's phase, from the detonation through every fragment's cooling
  // (materialStart → flameEnd, the births' share of it) to the last chip's
  // sweep onto its line; the charge is whole by the first cooling. On the
  // entry's canonical clock (t / 2400), before the chant's first accent.
  const P = NANITE_FIRE_PHASES;
  assert.deepEqual([...FIELD_WAKE], [P.burstStart, P.burstStart + (P.flameEnd - P.burstStart) / FIELD_WAKE_BIRTHS]);
  assert.equal(FIELD_WAKE_BIRTHS, FIELD_BIRTH.stagger);
  assert.ok(Math.abs(FIELD_WAKE[0] + FIELD_WAKE_RISE * (FIELD_WAKE[1] - FIELD_WAKE[0]) - P.materialStart) < 1e-12);
  assert.deepEqual([...entry.wake], [FIELD_WAKE[0] * 2400, FIELD_WAKE[1] * 2400]);
  assert.equal(entry.wake[0], 420);
  assert.equal(entry.wake[1], 780);
  assert.ok(entry.wake[1] > REXONANCE_CALL_BEATS[2].start && entry.wake[1] < REXONANCE_SUIT_SNAP.legs);
  // Legs, waist, arms, chest lock on the four DEUS！ accents, in the fixed
  // order; the shoulders, the tail (with its ribbons) and the helmet follow.
  const locks = [...entry.glock];
  assert.deepEqual(locks.slice(0, 4), [
    REXONANCE_SUIT_SNAP.legs,
    REXONANCE_SUIT_SNAP.waist,
    REXONANCE_SUIT_SNAP.arms,
    REXONANCE_SUIT_SNAP.chest,
  ]);
  assert.equal(locks.at(-1), REXONANCE_SUIT_SNAP.helm);
  for (let k = 1; k < locks.length; k += 1) assert.ok(locks[k] > locks[k - 1]);
  for (let k = 0; k < entry.count; k += 1) assert.ok(entry.gfrom[k] < entry.glock[k]);
  // The legs' centre is low on the body, the helmet's at the crown; every
  // centre lies inside the figure.
  assert.ok(entry.gy[0] > H * 0.7 && entry.gy[entry.count - 1] < H * 0.2);
  for (let k = 0; k < entry.count; k += 1)
    assert.ok(entry.gx[k] > 0 && entry.gx[k] < W && entry.gy[k] > 0 && entry.gy[k] < H);
  // The implosion starts on the helmet's clamp and ends on the light; the
  // detonation rides the light-up and is over before its bloom settles,
  // long before the cover.
  assert.deepEqual([...entry.collapse], [REXONANCE_SUIT_SNAP.helm, REXONANCE_SUIT_LIGHT.from]);
  assert.deepEqual([...entry.detonate], [...REXONANCE_FIELD_ENTRY.detonate]);
  assert.ok(entry.end <= REXONANCE_SUIT_LIGHT.from + REXONANCE_SUIT_LIGHT.bloom);
  assert.ok(entry.end < REXONANCE_ENTRY_TIMINGS.cover - 1000);
  assert.deepEqual([...entry.origin], [...REXONANCE_SUIT_MARKS.core]);
});

test("the state is a pure function of the clock: charge, attractor, tightness, impulses, flash", () => {
  const score = sampleScore();
  const out = fieldStateBuffer();
  const at = (t) => Float32Array.from(fieldState(score, t, out));
  // Before the wake: nothing. The burst (the wake's first share, to the
  // first fragment's cooling) brings the charge up whole; the wake itself
  // runs 0..1 over its window.
  assert.equal(at(50)[F.CHARGE], 0);
  assert.equal(at(100)[F.CHARGE], 0);
  assert.equal(at(100)[F.WAKE], 0);
  const rise = 100 + 100 * FIELD_WAKE_RISE;
  assert.ok(at(100 + 50 * FIELD_WAKE_RISE)[F.CHARGE] > 0.3 && at(100 + 50 * FIELD_WAKE_RISE)[F.CHARGE] < 0.7);
  assert.ok(at(rise - 0.5)[F.CHARGE] < 1);
  assert.equal(at(rise)[F.CHARGE], 1);
  assert.equal(at(125)[F.CHARGE], 1);
  assert.equal(at(150)[F.WAKE], 0.5);
  assert.equal(at(300)[F.CHARGE], 1);
  assert.equal(at(300)[F.WAKE], 1);
  // A streak's tail reads the wake it had: wake per unit of S.
  assert.ok(Math.abs(at(150)[F.WAKE_RATE] - 800 / 100) < 1e-6);
  // The collapse drains it; the detonation bursts and dies; nothing after.
  assert.ok(at(750)[F.CHARGE] > 0.4 && at(750)[F.CHARGE] < 0.6);
  assert.equal(at(800)[F.CHARGE], 0);
  assert.ok(at(812)[F.CHARGE] > 0.5, "the detonation flares right after the light");
  assert.ok(at(880)[F.CHARGE] < 0.1);
  assert.equal(at(900)[F.CHARGE], 0);
  assert.equal(at(5000)[F.CHARGE], 0);
  // The attractor: at the reactor until the first group, then on each
  // group's centre by the middle of its window, continuous throughout.
  assert.deepEqual([at(200)[F.AX], at(200)[F.AY]].map(Math.round), [284, 275]);
  assert.equal(Math.round(at(330)[F.AY]), 800);
  assert.equal(Math.round(at(470)[F.AY]), 450);
  assert.equal(Math.round(at(640)[F.AY]), 160);
  assert.equal(Math.round(at(800)[F.AY]), 275, "drawn back to the reactor by the collapse");
  let previous = at(0);
  for (let t = 1; t <= 950; t += 1) {
    const now = at(t);
    assert.ok(Math.abs(now[F.AY] - previous[F.AY]) < 12, `attractor step at ${t}`);
    // (The detonation flares fast on purpose: the light ignites at once.)
    assert.ok(Math.abs(now[F.CHARGE] - previous[F.CHARGE]) < 0.2, `charge step at ${t}`);
    previous = now;
  }
  // Tightness closes on the lock and releases over the impulse's span.
  assert.equal(at(250)[F.TIGHT], 0);
  assert.ok(at(399)[F.TIGHT] > 0.95);
  assert.ok(at(450)[F.TIGHT] < 0.6 && at(450)[F.TIGHT] > 0.3);
  assert.ok(at(499)[F.TIGHT] < 0.02 || at(499)[F.TIGHT] > 0.5, "released, or the next group's");
  // Impulses: none before a lock; the lock's, young, right after; aged out
  // after the span; the freshest first; the flash on the impact frame only.
  assert.equal(at(399)[F.IMPULSES], 0);
  const lock = at(401);
  assert.equal(lock[F.IMPULSES], 1);
  assert.equal(lock[F.IMPULSE], 280);
  assert.equal(lock[F.IMPULSE + 1], 800);
  assert.ok(lock[F.IMPULSE + 2] > 0 && lock[F.IMPULSE + 2] < 0.02);
  assert.equal(lock[F.IMPULSE + 3], 1);
  assert.ok(lock[F.FLASH] > 0.9);
  assert.equal(at(400 + 100 * FIELD_FLASH_SHARE + 1)[F.FLASH], 0);
  assert.equal(at(500)[F.IMPULSES], 0);
  const both = at(525);
  assert.equal(both[F.IMPULSES], 1, "the legs' impulse has aged out by the waist's lock");
  assert.equal(both[F.IMPULSE + 1], 450);
  const quick = fieldScore({
    wake: [100, 200],
    groups: [
      { x: 280, y: 800, from: 250, lock: 400 },
      { x: 280, y: 450, from: 410, lock: 520 },
    ],
    collapse: [700, 800],
    detonate: [800, 900],
    end: 900,
    impulse: 400,
    origin: [284.2, 275.3],
  });
  const stacked = fieldState(quick, 530, fieldStateBuffer());
  assert.equal(stacked[F.IMPULSES], 2);
  assert.equal(stacked[F.IMPULSE + 1], 450, "freshest first");
  assert.equal(stacked[F.IMPULSE + F.IMPULSE_STRIDE + 1], 800);
  // Scrubbing: the same clock gives the same bytes, in any order.
  const forward = [300, 401, 450, 520.5, 700, 760, 850].map(at);
  const backward = [850, 760, 700, 520.5, 450, 401, 300].map(at).reverse();
  forward.forEach((state, k) => assert.deepEqual([...state], [...backward[k]]));
  assert.equal(at(Number.NaN)[F.CHARGE], 0);
  // The groups locked so far, oldest first; the field thinning to the
  // score's settle floor from the first lock to the last.
  assert.equal(at(399)[F.LOCKED], 0);
  assert.equal(at(401)[F.LOCKED], 1);
  assert.deepEqual([...at(401).subarray(F.LOCK, F.LOCK + 4)], [280, 800, 100, 200]);
  assert.equal(at(701)[F.LOCKED], 3);
  assert.deepEqual([...at(701).subarray(F.LOCK + 8, F.LOCK + 12)], [280, 160, 20, 60]);
  assert.equal(at(300)[F.SETTLE], 1);
  const thinned = fieldScore({ ...score, groups: [
    { x: 280, y: 800, from: 250, lock: 400 },
    { x: 280, y: 160, from: 560, lock: 700 },
  ], wake: [100, 200], collapse: [700, 800], detonate: [800, 900], end: 900, origin: [284.2, 275.3], impulse: 100, settle: 0.3 });
  const thin = fieldStateBuffer();
  assert.equal(fieldState(thinned, 400, thin)[F.SETTLE], 1);
  assert.ok(Math.abs(fieldState(thinned, 550, thin)[F.SETTLE] - 0.65) < 1e-6);
  assert.ok(Math.abs(fieldState(thinned, 700, thin)[F.SETTLE] - 0.3) < 1e-6);
  assert.throws(() => fieldScore({ ...thinned, settle: 2 }), RangeError);
});

test("the camera is exact identity throughout: the body never moves (owner, 2026-10-21)", () => {
  const score = entryFieldScore();
  const state = fieldStateBuffer();
  const out = fieldCameraBuffer();
  const identity = (t, take) => {
    fieldState(score, t, state);
    fieldCamera(state, take, H, out);
    return out[0] === 1 && out[1] === 0 && out[2] === 0;
  };
  for (const seed of [1, 2, 3, 99, 4242]) {
    const take = fieldTake(seed);
    for (let t = 0; t <= REXONANCE_CALL_BEATS[1].start; t += 10) assert.ok(identity(t, take), `${t}`);
    // From the light on (the pixel squares, the light, the finished frame):
    // identity, exactly.
    for (let t = REXONANCE_SUIT_LIGHT.from; t <= REXONANCE_ENTRY_TIMINGS.cover; t += 5)
      assert.ok(identity(t, take), `identity at ${t} for take ${seed}`);
    // Bounded throughout.
    for (let t = 0; t <= 2730; t += 3) {
      fieldState(score, t, state);
      fieldCamera(state, take, H, out);
      assert.ok(out[0] >= 1 && out[0] <= FIELD_CAMERA.maxZoom, `zoom at ${t}`);
      assert.ok(Math.abs(out[1]) <= FIELD_CAMERA.maxPan && Math.abs(out[2]) <= FIELD_CAMERA.maxPan);
    }
    // Owner (2026-10-21): 「全身が上下するのも治して」 — charged, on a DEUS！,
    // on the burst, following a group: identity, every frame, every take.
    for (const t of [421, 850, 870, REXONANCE_SUIT_SNAP.legs + 30, REXONANCE_SUIT_SNAP.chest - 10, 1500])
      assert.ok(identity(t, take), `identity at ${t} for take ${seed}`);
  }
  assert.deepEqual([...FIELD_CAMERA.push], [0, 0, 0]);
  assert.equal(FIELD_CAMERA.punch + FIELD_CAMERA.burst + FIELD_CAMERA.follow + FIELD_CAMERA.drift, 0);
  assert.equal(fieldPunch(0), 0);
  assert.equal(fieldPunch(1), 0);
  assert.equal(fieldPunch(1.5), 0);
  assert.ok(fieldPunch(FIELD_CAMERA.attack) > 0.85);
  assert.ok(fieldPunch(0.5) < fieldPunch(0.2));
  // The view: identity leaves the scene's view as it was; a zoom is about
  // the pivot on the body's axis.
  // (A double buffer: identity must hand the scene's view back exactly.)
  const view = new Float64Array(3);
  fieldCameraView(Float32Array.of(1, 0, 0, FIELD_CAMERA.pivotY), W, H, 0.7, 100, 50, view);
  assert.deepEqual([...view], [0.7, 100, 50]);
  fieldCameraView(Float32Array.of(1.05, 0, 0, FIELD_CAMERA.pivotY), W, H, 1, 0, 0, view);
  const pivotX = (W / 2) * 1.05 + view[1];
  const pivotY = FIELD_CAMERA.pivotY * H * 1.05 + view[2];
  assert.ok(Math.abs(pivotX - W / 2) < 1e-3 && Math.abs(pivotY - FIELD_CAMERA.pivotY * H) < 1e-3);
});

test("the impact grammar draws on a lock only, about the lock, with no box", () => {
  const score = sampleScore();
  const state = fieldStateBuffer();
  const record = () => {
    const calls = [];
    const context = new Proxy(
      { globalCompositeOperation: "source-over", globalAlpha: 1 },
      {
        get: (target, key) =>
          key in target ? target[key] : (...args) => void calls.push([key, ...args]),
        set: (target, key, value) => {
          target[key] = value;
          calls.push([`set ${String(key)}`, value]);
          return true;
        },
      },
    );
    return { context, calls };
  };
  fieldState(score, 300, state);
  const quiet = record();
  assert.equal(drawFieldImpact(quiet.context, state, W, H, fieldHash), false);
  assert.equal(quiet.calls.length, 0);
  fieldState(score, 402, state);
  const hit = record();
  assert.equal(drawFieldImpact(hit.context, state, W, H, fieldHash, true, true), true);
  const names = hit.calls.map(([name]) => name);
  assert.ok(names.includes("set globalCompositeOperation"));
  assert.equal(names.filter((name) => name === "arc").length, 3, "three discs about the lock");
  assert.ok(!names.includes("fillRect"), "no box: a canvas's edge must never show");
  assert.ok(names.includes("stroke"), "the rays");
  for (const call of hit.calls.filter(([name]) => name === "arc"))
    assert.deepEqual(call.slice(1, 3), [280, 800]);
  // The entry's engine: no composite operation, so no disc pop (a grey
  // plate under source-over); the rays alone, and nothing at all on touch.
  const plain = record();
  assert.equal(drawFieldImpact(plain.context, state, W, H, fieldHash, true, false), true);
  const plainNames = plain.calls.map(([name]) => name);
  assert.ok(!plainNames.includes("set globalCompositeOperation"));
  assert.ok(plainNames.includes("stroke"));
  assert.equal(plainNames.filter((name) => name === "arc").length, 0);
  const touch = record();
  assert.equal(drawFieldImpact(touch.context, state, W, H, fieldHash, false, false), false);
  assert.equal(touch.calls.length, 0);
});

test("a particle is born as the fire's burst fragment cools: at its position, with its velocity, the frame after its heat is gone", () => {
  const score = sampleScore();
  const take = fieldTake(5);
  const state = fieldStateBuffer();
  const seeds = new Float64Array(FIELD_SEEDS.LENGTH);
  const out = new Float64Array(6);
  const S = FIELD_SEEDS;
  const B = FIELD_BIRTH;
  const P = NANITE_FIRE_PHASES;
  const aspect = REXONANCE_SUIT_SIZE.width / REXONANCE_SUIT_SIZE.height;
  const wakeSpan = FIELD_WAKE[1] - FIELD_WAKE[0];
  const step = (B.stagger * wakeSpan) / 255;
  // The fragment source is the fire's own fireFragmentPose: the particle's
  // fragment (its periodic seed), sampled at the particle's birth — the
  // first byte of the births' share of the wake at which the fragment has
  // cooled (heat 0: the fire no longer draws it); a byte earlier it is still
  // hot. Position (figure heights) and velocity (the pose's flight units)
  // are the fragment's own, so the streak leaves where and as the spark
  // faded; the whole set lies in the vertex words' range.
  const birth = new Float64Array(5);
  const fragment = new Float64Array(6);
  let earliest = 1;
  let latest = 0;
  let still = 0;
  for (let i = 0; i < 2000; i += 1) {
    fieldFragment(i, birth);
    const share = birth[4];
    assert.ok(share > 0 && share <= 1, `${i}: a share of the births`);
    const stagger = share * B.stagger;
    const phase = FIELD_WAKE[0] + stagger * wakeSpan;
    assert.ok(phase >= P.materialStart - 1e-12 && phase <= P.flameEnd + 1e-12, `${i}: born as the chips form`);
    const seed = fieldFragmentSeed(i);
    fireFragmentPose(seed, phase, fragment);
    assert.equal(fragment[4], 0, `${i}: its fragment has cooled`);
    assert.ok(Math.abs(birth[0] - fragment[0] * aspect) < 1e-12 && birth[1] === fragment[1], `${i}: at its fragment`);
    const flight = (wakeSpan * (1 - stagger)) / B.drift;
    assert.ok(
      Math.abs(birth[2] - fragment[2] * aspect * flight) < 1e-12 && Math.abs(birth[3] - fragment[3] * flight) < 1e-12,
      `${i}: with its velocity`,
    );
    if (share < 1) {
      fireFragmentPose(seed, phase - step, fragment);
      assert.ok(fragment[4] > 0, `${i}: still hot a byte earlier`);
      assert.ok(Math.hypot(birth[2], birth[3]) > 0, `${i}: flying`);
    } else still += 1;
    assert.ok(birth[0] > -0.5 && birth[0] < 1.5 && birth[1] > -0.5 && birth[1] < 1.5, `${i}: in range`);
    assert.ok(Math.abs(birth[2]) < 2 && Math.abs(birth[3]) < 2, `${i}: velocity in range`);
    assert.deepEqual([...fieldFragment(i, new Float64Array(5))], [...birth], "pure");
    earliest = Math.min(earliest, share);
    latest = Math.max(latest, share);
  }
  const first = (P.materialStart - FIELD_WAKE[0]) / wakeSpan / B.stagger;
  assert.ok(earliest < first + 0.01 && latest === 1, "births from the first chips to the fire's end");
  assert.ok(still < 40, `${still} born at rest at the fire's very end`);
  // The seeds carry the birth and its stagger (a byte); a caller's fragment
  // source takes the fire's place, with or without a share of its own.
  fieldSeeds(3, take.arms, seeds);
  fieldFragment(3, birth);
  assert.deepEqual([seeds[S.BX], seeds[S.BY], seeds[S.BVX], seeds[S.BVY]], [...birth.subarray(0, 4)]);
  assert.equal(seeds[S.STAGGER], Math.round(birth[4] * 255) / 255);
  fieldSeeds(3, take.arms, seeds, (index, o) => {
    o[0] = 0.25 * index;
    o[1] = 0.25;
    o[2] = 0.5;
    o[3] = -0.5;
    o[4] = 0.6;
    return o;
  });
  assert.deepEqual([seeds[S.BX], seeds[S.BY], seeds[S.BVX], seeds[S.BVY]], [0.75, 0.25, 0.5, -0.5]);
  assert.equal(seeds[S.STAGGER], Math.round(0.6 * 255) / 255);
  fieldSeeds(3, take.arms, seeds, (index, o) => {
    o[0] = 0.25 * index;
    o[1] = 0.25;
    o[2] = 0.5;
    o[3] = -0.5;
    return o;
  });
  assert.ok(seeds[S.STAGGER] >= 0 && seeds[S.STAGGER] < 1 && seeds[S.STAGGER] * 255 === Math.round(seeds[S.STAGGER] * 255));
  const pose = (i, t, wake) => {
    fieldSeeds(i, take.arms, seeds);
    fieldState(score, t, state);
    return Float64Array.from(
      fieldPose(seeds, state[F.S], state, take, H, out, wake ?? state[F.WAKE]),
    );
  };
  let checked = 0;
  for (let i = 0; i < 300; i += 1) {
    fieldSeeds(i, take.arms, seeds);
    const stagger = seeds[S.STAGGER] * FIELD_BIRTH.stagger;
    const t0 = 100 + 100 * stagger;
    // Before its birth: nothing (no light); at it: its fragment's handoff
    // position, hot, its light rising from nothing as the spark has faded;
    // then flying along its velocity, cooling; swept onto its line by the
    // wake's end, where the pose is the helix's exactly.
    assert.equal(pose(i, t0 - 0.5)[4], 0, `${i}: unborn`);
    const born = pose(i, t0 + 0.01);
    assert.ok(
      Math.hypot(born[0] - seeds[S.BX], born[1] - seeds[S.BY]) < 0.01,
      `${i}: born at the handoff`,
    );
    assert.ok(born[5] > 0.95 && born[4] > 0 && born[4] < 0.05, `${i}: hot, its light just kindling`);
    const later = pose(i, t0 + 0.01 + (100 - 100 * stagger) * 0.12);
    const dx = later[0] - born[0];
    const dy = later[1] - born[1];
    if (Math.hypot(seeds[S.BVX], seeds[S.BVY]) > 0)
      assert.ok(dx * seeds[S.BVX] + dy * seeds[S.BVY] > 0, `${i}: flies along its velocity`);
    assert.ok(later[5] < born[5], `${i}: cooling`);
    assert.ok(later[4] > born[4] && later[4] > 0.5, `${i}: lit`);
    const swept = pose(i, 200);
    const helix = pose(i, 200, 1);
    assert.deepEqual([...swept], [...helix], `${i}: on its line by the wake's end`);
    assert.equal(swept[5], 0, `${i}: cold`);
    checked += 1;
  }
  assert.ok(checked === 300);
  // The velocity is continuous through the handoff: the streak's speed just
  // after its birth is the fragment's just before its cooling, on the
  // wake's own clock (the fire's phase).
  const fire = fieldScore({
    wake: [...FIELD_WAKE],
    groups: [{ x: 280, y: 800, sx: 100, sy: 200, from: 0.4, lock: 0.5 }],
    collapse: [0.6, 0.7],
    end: 0.7,
    impulse: 0.05,
    origin: [284.2, 275.3],
  });
  const dt = 1e-4;
  let worst = 0;
  let compared = 0;
  for (let i = 0; i < 400; i += 1) {
    fieldSeeds(i, take.arms, seeds);
    if (seeds[S.STAGGER] === 1) continue;
    const t0 = FIELD_WAKE[0] + seeds[S.STAGGER] * B.stagger * wakeSpan;
    fieldState(fire, t0 + dt, state);
    const a = Float64Array.from(fieldPose(seeds, state[F.S], state, take, H, out));
    fieldState(fire, t0 + 2 * dt, state);
    const b = Float64Array.from(fieldPose(seeds, state[F.S], state, take, H, out));
    const seed = fieldFragmentSeed(i);
    fireFragmentPose(seed, t0 - 2 * dt, fragment);
    const fx = fragment[0] * aspect;
    const fy = fragment[1];
    fireFragmentPose(seed, t0 - dt, fragment);
    const vx = (fragment[0] * aspect - fx) / dt;
    const vy = (fragment[1] - fy) / dt;
    const speed = Math.hypot(vx, vy);
    if (speed < 0.05) continue;
    worst = Math.max(worst, Math.hypot((b[0] - a[0]) / dt - vx, (b[1] - a[1]) / dt - vy) / speed);
    compared += 1;
  }
  assert.ok(compared > 300 && worst < 0.08, `velocity through the handoff: worst ${worst} over ${compared}`);
});

test("a particle's pose is closed-form: depth both sides, tightening, impulses outward, collapse inward", () => {
  const score = sampleScore();
  const take = fieldTake(7);
  const state = fieldStateBuffer();
  const seeds = new Float64Array(FIELD_SEEDS.LENGTH);
  const out = new Float64Array(6);
  const pose = (i, t) => {
    fieldSeeds(i, take.arms, seeds);
    fieldState(score, t, state);
    return Float64Array.from(fieldPose(seeds, state[F.S], state, take, H, out));
  };
  let behind = 0;
  let radius = 0;
  const n = 600;
  for (let i = 0; i < n; i += 1) {
    const p = pose(i, 300);
    assert.deepEqual([...pose(i, 300)], [...p], "pure");
    if (p[2] < 0) behind += 1;
    radius += Math.hypot((p[0] - state[F.AX] / H) / FIELD_SHAPE.aspect, p[2]);
    assert.ok(p[3] > 0 && p[3] < 4 && p[4] >= 0 && p[4] < 8);
  }
  assert.ok(behind > n * 0.35 && behind < n * 0.65, `${behind} of ${n} behind the body`);
  const open = radius / n;
  let tightRadius = 0;
  for (let i = 0; i < n; i += 1) {
    const p = pose(i, 399);
    tightRadius += Math.hypot((p[0] - state[F.AX] / H) / FIELD_SHAPE.aspect, p[2]);
  }
  assert.ok(tightRadius / n < open * 0.5, `tight ${tightRadius / n} < open ${open}`);
  // An impulse flings the near particles away from the lock.
  let farther = 0;
  for (let i = 0; i < n; i += 1) {
    const before = pose(i, 399.9);
    const after = pose(i, 425);
    const lockX = 280 / H;
    const lockY = 800 / H;
    if (Math.hypot(before[0] - lockX, before[1] - lockY) > 0.3) continue;
    if (Math.hypot(after[0] - lockX, after[1] - lockY) > Math.hypot(before[0] - lockX, before[1] - lockY))
      farther += 1;
  }
  assert.ok(farther > 0, "particles near the lock are flung outward");
  // The collapse draws everything to the reactor.
  let collapsed = 0;
  for (let i = 0; i < n; i += 1) {
    const p = pose(i, 799);
    collapsed += Math.hypot(p[0] - 284.2 / H, p[1] - 275.3 / H);
  }
  assert.ok(collapsed / n < 0.08, String(collapsed / n));
  // Over a locked group's plates the light is shaded (the metal reads);
  // outside its box it is not.
  fieldState(score, 450, state);
  const o = F.LOCK;
  let over = 0;
  let overN = 0;
  let off = 0;
  let offN = 0;
  for (let i = 0; i < n; i += 1) {
    fieldSeeds(i, take.arms, seeds);
    const p = fieldPose(seeds, state[F.S], state, take, H, out);
    const inX = Math.abs(p[0] - state[o] / H) < state[o + 2] / H;
    const inY = Math.abs(p[1] - state[o + 1] / H) < state[o + 3] / H;
    const far =
      Math.abs(p[0] - state[o] / H) > state[o + 2] / H + 0.12 ||
      Math.abs(p[1] - state[o + 1] / H) > state[o + 3] / H + 0.12;
    const bare = p[4] / (seeds[FIELD_SEEDS.SIZE] > 0 ? 1 : 1);
    if (inX && inY) {
      over += bare;
      overN += 1;
    } else if (far) {
      off += bare;
      offN += 1;
    }
  }
  assert.ok(overN > 10 && offN > 10);
  assert.ok(over / overN < (off / offN) * 0.5, `${over / overN} over the plates, ${off / offN} off`);
});

/* ---------------- the WebGL layer, against a recording context ---------------- */
function mockGL({ version = "WebGL 1.0 (mock)", compile = true, link = true } = {}) {
  const calls = [];
  const constants = {
    VERTEX_SHADER: 1,
    FRAGMENT_SHADER: 2,
    COMPILE_STATUS: 3,
    LINK_STATUS: 4,
    ARRAY_BUFFER: 5,
    ELEMENT_ARRAY_BUFFER: 6,
    STATIC_DRAW: 7,
    UNSIGNED_BYTE: 8,
    DEPTH_TEST: 9,
    CULL_FACE: 10,
    BLEND: 11,
    ONE: 12,
    COLOR_BUFFER_BIT: 13,
    TRIANGLES: 14,
    UNSIGNED_SHORT: 15,
    VERSION: 16,
  };
  let lost = false;
  const gl = {
    ...constants,
    calls,
    getParameter: (name) => (name === constants.VERSION ? version : 0),
    createShader: () => ({ shader: true }),
    shaderSource: (shader, source) => calls.push(["shaderSource", source]),
    compileShader: () => {},
    getShaderParameter: () => compile,
    getShaderInfoLog: () => "",
    deleteShader: () => calls.push(["deleteShader"]),
    createProgram: () => ({ program: true }),
    attachShader: () => {},
    bindAttribLocation: (program, index, name) => calls.push(["bindAttribLocation", index, name]),
    linkProgram: () => {},
    getProgramParameter: () => link,
    deleteProgram: () => calls.push(["deleteProgram"]),
    getUniformLocation: (program, name) => ({ name }),
    createBuffer: () => ({ buffer: true }),
    bindBuffer: () => {},
    bufferData: (target, data) => calls.push(["bufferData", target, data.byteLength]),
    deleteBuffer: () => calls.push(["deleteBuffer"]),
    useProgram: () => {},
    enableVertexAttribArray: () => {},
    vertexAttribPointer: (...args) => calls.push(["vertexAttribPointer", ...args]),
    disable: () => {},
    enable: () => {},
    blendFunc: (...args) => calls.push(["blendFunc", ...args]),
    clearColor: () => {},
    viewport: (...args) => calls.push(["viewport", ...args]),
    clear: () => calls.push(["clear"]),
    uniform1f: (location, value) => calls.push(["uniform1f", location.name, value]),
    uniform2f: (location, ...values) => calls.push(["uniform2f", location.name, ...values]),
    uniform3f: (location, ...values) => calls.push(["uniform3f", location.name, ...values]),
    uniform4f: (location, ...values) => calls.push(["uniform4f", location.name, ...values]),
    uniform4fv: (location, values) => calls.push(["uniform4fv", location.name, values.length]),
    drawElements: (...args) => calls.push(["drawElements", ...args]),
    getExtension: (name) =>
      name === "WEBGL_lose_context"
        ? {
            loseContext: () => {
              lost = true;
              calls.push(["loseContext"]);
            },
          }
        : null,
    get isLost() {
      return lost;
    },
  };
  return gl;
}
function mockDocument(options = {}) {
  const canvases = [];
  const makeCanvas = () => {
    const listeners = new Map();
    const canvas = {
      width: 0,
      height: 0,
      className: "",
      dataset: {},
      style: {},
      removed: false,
      listeners,
      gl: options.noContext ? null : mockGL(options),
      getContext(kind) {
        if (kind !== "webgl2" && kind !== "webgl") return null;
        return this.gl;
      },
      addEventListener: (name, fn) => listeners.set(name, fn),
      removeEventListener: (name) => listeners.delete(name),
      remove() {
        this.removed = true;
      },
    };
    canvases.push(canvas);
    return canvas;
  };
  return { document: { createElement: () => makeCanvas() }, canvases };
}

test("the scroll's fire mapping is one place both the scene and the swarm read", () => {
  // The runway (owner, 2026-10-21: the fire covers the undersuit gradually,
  // then bursts into the nanites): the first licks at q .02, the engulf
  // climbing over the scan and the motes' beat, the detonation at ≈ .104–
  // .132, the first chips at ≈ .114, nothing of the fire by .14 — before
  // the first group lands (deus, .16); the beats themselves are unchanged.
  assert.deepEqual(REXONANCE_SCROLL_FLAME, { start: 0.02, span: 0.48 });
  const P = NANITE_FIRE_PHASES;
  assert.ok(Math.abs(scrollFlameAt(P.burstStart) - 0.104) < 1e-9);
  assert.ok(Math.abs(scrollFlameAt(P.burstEnd) - 0.132) < 1e-9);
  assert.ok(Math.abs(scrollFlameAt(P.materialStart) - 0.1136) < 1e-9);
  assert.ok(Math.abs(scrollFlameAt(P.flameEnd) - 0.14) < 1e-9);
  assert.ok(scrollFlameAt(0) > 0 && scrollFlameAt(P.kindle) < ASSEMBLY_BEATS.scan[1]);
  assert.ok(scrollFlameAt(P.cover) > ASSEMBLY_BEATS.scan[1] && scrollFlameAt(P.cover) < scrollFlameAt(P.burstStart));
  assert.ok(scrollFlameAt(P.flameEnd) < ASSEMBLY_BEATS.deus[0]);
  assert.deepEqual(ASSEMBLY_BEATS.scan, [0, 0.07]);
  assert.deepEqual(ASSEMBLY_BEATS.motes, [0.07, 0.16]);
  assert.equal(ASSEMBLY_BEATS.deus[0], 0.16);
  // The field's wake on the runway: the detonation to the last chip's
  // sweep, over the motes' beat and into the legs' convergence.
  assert.ok(Math.abs(scrollFlameAt(FIELD_WAKE[0]) - 0.104) < 1e-9);
  assert.ok(scrollFlameAt(FIELD_WAKE[1]) > ASSEMBLY_BEATS.motes[1] && scrollFlameAt(FIELD_WAKE[1]) < 0.2);
  assert.ok(Math.abs(scrollFlamePhase(scrollFlameAt(0.3)) - 0.3) < 1e-12);
  const scroll = read("src/lib/rexonance-resonance.js");
  const swarm = read("src/lib/rexonance-assembly-nanites.js");
  assert.match(scroll, /const NANITE_FLAME_START = REXONANCE_SCROLL_FLAME\.start;/);
  assert.match(scroll, /const NANITE_FLAME_SPAN = REXONANCE_SCROLL_FLAME\.span;/);
  assert.match(scroll, /wake: \[scrollFlameAt\(FIELD_WAKE\[0\]\), scrollFlameAt\(FIELD_WAKE\[1\]\)\],/);
  assert.match(swarm, /const FIRE_START = scrollFlameAt\(NANITE_FIRE_PHASES\.burstStart\);/);
  assert.match(swarm, /const MATERIAL_START = scrollFlameAt\(NANITE_FIRE_PHASES\.materialStart\);/);
  for (const text of [scroll, swarm]) {
    assert.doesNotMatch(text, /0\.015 \+ 0\.285/);
    assert.doesNotMatch(text, /0\.02 \+ 0\.48/);
  }
  const entry = read("src/lib/rexonance-field/field-entry.ts");
  assert.match(entry, /wake: \[FIELD_WAKE\[0\] \* ENTRY_FLAME_MS, FIELD_WAKE\[1\] \* ENTRY_FLAME_MS\],/);
});

test("the shaders carry the pose's constants and share no uniform between stages", () => {
  for (const [name, value] of Object.entries(FIELD_SHAPE)) {
    if (["streak", "marker"].includes(name)) continue;
    const text = Number.isInteger(value) ? `${value}.0` : String(value);
    assert.ok(FIELD_VERTEX_SHADER.includes(text), `${name} = ${text}`);
  }
  for (const [name, value] of Object.entries(FIELD_BIRTH)) {
    if (!Number.isFinite(value) || name === "fringeShare") continue;
    const text = Number.isInteger(value) ? `${value}.0` : String(value);
    assert.ok(FIELD_VERTEX_SHADER.includes(text), `birth ${name} = ${text}`);
  }
  assert.match(FIELD_VERTEX_SHADER, /attribute vec4 aSeed;/);
  assert.match(FIELD_VERTEX_SHADER, /attribute vec4 aKind;/);
  assert.match(FIELD_VERTEX_SHADER, /attribute vec4 aBirth;/);
  // The birth's stagger is the particle's own byte (its fragment's cooling),
  // not derived from its helix seeds; its light kindles over IGNITE.
  assert.match(FIELD_VERTEX_SHADER, /float stagger = aKind\.y \* STAGGER;/);
  assert.doesNotMatch(FIELD_VERTEX_SHADER, /fract\(a0 \* 13\.0/);
  assert.match(FIELD_VERTEX_SHADER, /lit = smoothstep\(0\.0, IGNITE, tau\);/);
  assert.match(FIELD_VERTEX_SHADER, /light = born \* lit \* uCharge/);
  assert.match(FIELD_VERTEX_SHADER, /uniform float uWake;/);
  assert.match(FIELD_VERTEX_SHADER, /uniform float uWakeRate;/);
  assert.match(FIELD_VERTEX_SHADER, /uniform vec4 uLock\[8\];/);
  assert.match(FIELD_VERTEX_SHADER, /uniform float uSettle;/);
  assert.match(FIELD_VERTEX_SHADER, /uniform vec4 uImpulse\[4\];/);
  // The fragment stage declares no uniform: a highp/mediump mismatch on a
  // shared uniform fails the link on real drivers (uSize did).
  assert.doesNotMatch(FIELD_FRAGMENT_SHADER, /uniform/);
  assert.match(FIELD_FRAGMENT_SHADER, /gl_FragColor = vColor \* /, "premultiplied, additive");
  assert.doesNotMatch(FIELD_VERTEX_SHADER, /\bsign\b\s*=/, "no shadowed built-in names");
});

test("the buffers are bounded: 16 bytes a vertex, four a particle, a prefix any governor can cut", () => {
  const bytes = fieldVertexBytes(50, 4);
  assert.equal(FIELD_GL.bytesPerVertex, 16);
  assert.equal(bytes.length, 50 * 4 * 16);
  const words = new Uint16Array(bytes.buffer);
  const seeds = new Float64Array(FIELD_SEEDS.LENGTH);
  for (let i = 0; i < 50; i += 1) {
    fieldSeeds(i, 4, seeds);
    for (let c = 0; c < 4; c += 1) {
      const o = (i * 4 + c) * 16;
      assert.equal(bytes[o + 5], Math.round(seeds[FIELD_SEEDS.STAGGER] * 255), "the birth's stagger");
      assert.ok(
        bytes[o + 6] === (i % 4) * 8 + c || bytes[o + 6] === (i % 4) * 8 + c + 4,
        "8 × arm + corner, a marker in bit 2",
      );
      assert.deepEqual([...bytes.slice(o, o + 6)], [...bytes.slice(i * 64, i * 64 + 6)]);
      // Its birth, as four 16-bit words the shader decodes back.
      const w = (i * 4 + c) * 8 + 4;
      assert.ok(Math.abs((words[w] / 65535) * 2 - 0.5 - seeds[FIELD_SEEDS.BX]) < 1e-4);
      assert.ok(Math.abs((words[w + 1] / 65535) * 2 - 0.5 - seeds[FIELD_SEEDS.BY]) < 1e-4);
      assert.ok(Math.abs((words[w + 2] / 65535) * 4 - 2 - seeds[FIELD_SEEDS.BVX]) < 1e-4);
      assert.ok(Math.abs((words[w + 3] / 65535) * 4 - 2 - seeds[FIELD_SEEDS.BVY]) < 1e-4);
    }
  }
  // A caller's fragment source takes the fire's place, its share the birth byte.
  const given = fieldVertexBytes(3, 3, (index, out) => {
    out[0] = 0.25 * index;
    out[1] = 0.5;
    out[2] = -1;
    out[3] = 1.5;
    out[4] = 0.4;
    return out;
  });
  const givenWords = new Uint16Array(given.buffer);
  // (Particle 1, its first vertex: word 4 × 8 + 4; byte 4 × 16 + 5.)
  assert.ok(Math.abs((givenWords[36] / 65535) * 2 - 0.5 - 0.25) < 1e-4);
  assert.ok(Math.abs((givenWords[38] / 65535) * 4 - 2 + 1) < 1e-4);
  assert.equal(given[69], Math.round(0.4 * 255));
  const indices = fieldIndices(50);
  assert.equal(indices.length, 300);
  assert.equal(Math.max(...indices), 199);
  assert.ok(FIELD_GL.count.fine <= FIELD_GL.maxCount && FIELD_GL.maxCount * 4 <= 65536);
  assert.ok(FIELD_GL.count.coarse <= FIELD_GL.count.fine / 3);
});

test("feature detection takes a real context only; a stand-in or a refusal leaves the scene alone", () => {
  assert.equal(fieldContext(null), null);
  assert.equal(fieldContext({}), null);
  assert.equal(fieldContext({ getContext: () => null }), null);
  const proxy = new Proxy({}, { get: () => () => ({}) });
  assert.equal(fieldContext({ getContext: () => proxy }), null, "a 2D stand-in is not WebGL");
  assert.equal(
    fieldContext({
      getContext: () => {
        throw new Error("refused");
      },
    }),
    null,
  );
  const real = mockGL();
  assert.equal(fieldContext({ getContext: () => real }), real);
  const take = fieldTake(3);
  assert.equal(createFieldLayer({ ...mockDocument({ noContext: true }), take }), null);
  assert.equal(createFieldLayer({ ...mockDocument({ compile: false }), take }), null);
  assert.equal(createFieldLayer({ ...mockDocument({ link: false }), take }), null);
  assert.equal(createFieldLayer({ document: null, take }), null);
  const noScene = mockDocument({ link: false });
  createFieldLayer({ ...noScene, take });
  assert.ok(noScene.canvases.every((canvas) => canvas.width === 0 && canvas.height === 0));
});

test("the layer draws a quality prefix through both surfaces, clears when uncharged, and releases everything", () => {
  const take = fieldTake(11);
  const fine = mockDocument();
  const layer = createFieldLayer({ ...fine, take, className: "rzn-field" });
  assert.ok(layer);
  assert.equal(layer.canvases.length, 2, "back and front on fine pointers");
  assert.deepEqual(
    layer.canvases.map((canvas) => canvas.className),
    ["rzn-field is-back", "rzn-field is-front"],
  );
  assert.equal(layer.count, FIELD_GL.count.fine);
  const [back] = fine.canvases;
  const built = back.gl.calls.filter(([name]) => name === "bufferData");
  assert.deepEqual(
    built.map(([, , bytes]) => bytes),
    [layer.count * 64, layer.count * 12],
  );
  assert.deepEqual(
    back.gl.calls.filter(([name]) => name === "vertexAttribPointer").map((call) => call.slice(1)),
    [
      [0, 4, 8, true, 16, 0],
      [1, 4, 8, true, 16, 4],
      [2, 4, 15, true, 16, 8],
    ],
  );
  assert.deepEqual(back.gl.calls.find(([name]) => name === "blendFunc").slice(1), [12, 12]);
  layer.resize(800, 600, 2);
  assert.equal(back.width, Math.round(800 * 2 * FIELD_GL.resolution.fine));
  assert.equal(back.height, Math.round(600 * 2 * FIELD_GL.resolution.fine));
  const score = sampleScore();
  const state = fieldStateBuffer();
  fieldState(score, 300, state);
  back.gl.calls.length = 0;
  assert.equal(layer.render(state, 0.5, 100, 20, H, 1), layer.count * 2);
  const draws = back.gl.calls.filter(([name]) => name === "drawElements");
  assert.equal(draws.length, 1);
  assert.equal(draws[0][2], layer.count * 6);
  const side = back.gl.calls.find(([name, uniform]) => name === "uniform1f" && uniform === "uSide");
  assert.equal(side[2], -1);
  const front = fine.canvases[1].gl.calls.find(
    ([name, uniform]) => name === "uniform1f" && uniform === "uSide",
  );
  assert.equal(front[2], 1);
  const view = back.gl.calls.find(([name]) => name === "uniform3f");
  const ratio = 2 * FIELD_GL.resolution.fine;
  assert.deepEqual(view.slice(2), [0.5 * H * ratio, 100 * ratio, 20 * ratio]);
  // The governor's prefix.
  back.gl.calls.length = 0;
  layer.render(state, 0.5, 100, 20, H, 0.5);
  assert.equal(
    back.gl.calls.find(([name]) => name === "drawElements")[2],
    Math.floor(layer.count * 0.5) * 6,
  );
  // Uncharged: a clear, no draw.
  fieldState(score, 10, state);
  back.gl.calls.length = 0;
  assert.equal(layer.render(state, 0.5, 100, 20, H, 1), 0);
  assert.ok(back.gl.calls.some(([name]) => name === "clear"));
  assert.ok(!back.gl.calls.some(([name]) => name === "drawElements"));
  // Context loss: the frame is skipped; a restore rebuilds the program.
  back.listeners.get("webglcontextlost")({ preventDefault() {} });
  assert.equal(layer.lost, false, "the front surface still stands");
  fieldState(score, 300, state);
  back.gl.calls.length = 0;
  layer.render(state, 0.5, 100, 20, H, 1);
  assert.ok(!back.gl.calls.some(([name]) => name === "drawElements"));
  back.listeners.get("webglcontextrestored")();
  back.gl.calls.length = 0;
  layer.render(state, 0.5, 100, 20, H, 1);
  assert.ok(back.gl.calls.some(([name]) => name === "drawElements"));
  // Release: buffers, program and context gone, canvases zeroed and removed.
  layer.release();
  for (const canvas of fine.canvases) {
    assert.ok(canvas.removed);
    assert.equal(canvas.width + canvas.height, 0);
    assert.equal(canvas.listeners.size, 0);
    assert.ok(canvas.gl.isLost);
    const names = canvas.gl.calls.map(([name]) => name);
    assert.equal(names.filter((name) => name === "deleteBuffer").length, 2);
    assert.ok(names.includes("deleteProgram"));
  }
  assert.equal(layer.ready, false);
  assert.equal(layer.render(state, 0.5, 100, 20, H, 1), 0);
  layer.release();
  // Touch: the back surface only, fewer particles, drawing every side.
  const coarse = mockDocument();
  const touch = createFieldLayer({ ...coarse, take, coarse: true });
  assert.equal(touch.canvases.length, 1);
  assert.equal(touch.count, FIELD_GL.count.coarse);
  touch.resize(390, 779, 2);
  fieldState(score, 300, state);
  coarse.canvases[0].gl.calls.length = 0;
  touch.render(state, 0.5, 0, 0, H, 1);
  const touchSide = coarse.canvases[0].gl.calls.find(
    ([name, uniform]) => name === "uniform1f" && uniform === "uSide",
  );
  assert.equal(touchSide[2], 0);
  touch.release();
});

test("both scenes compose the field lazily, through their own clocks, and release it", () => {
  const scroll = read("src/lib/rexonance-resonance.js");
  const entry = read("src/components/rexonance-saga/rexonance-suit-nanites.tsx");
  const calls = read("src/styles-rexonance-calls.css");
  const zenith = read("src/styles-rexonance-zenith.css");
  // The scroll scene: its module with the swarm's (optional), its take at
  // goLive, its camera on the whole frame, its layer on the first live
  // frame, released when still, hidden or disposed.
  assert.match(scroll, /import\("\.\/rexonance-field\/index\.js"\)\.catch\(\(\) => null\)/);
  assert.match(scroll, /fieldTake = fieldLib\.fieldTake\(fieldLib\.fieldVisitSeed\(environment\)\);/);
  assert.match(scroll, /fieldLib\.fieldCameraView\(fieldCamera, W, H, view\.scale, view\.x, view\.y, fieldView\);/);
  assert.match(scroll, /context\.setTransform\(vs, 0, 0, vs, vx, vy\);/);
  assert.match(scroll, /nanites\.view\(vs, vx, vy\);/);
  assert.match(scroll, /&& !field && !fieldFailed && progress < B\.complete\)\s*makeField\(\);/);
  assert.match(scroll, /const fielding = Boolean\(field && fieldScore && fieldTake && progress < B\.complete\);/, "the camera and the impacts are the layer's");
  assert.match(entry, /if \(field && fieldLib && fieldState && fieldCamera && fieldTake\) \{/);
  assert.match(scroll, /if \(fielding && !calm && fieldState\[fieldLib\.FIELD_STATE\.IMPULSES\] > 0\)/);
  assert.equal(scroll.match(/releaseField\(\);/g).length, 2, "still (and disposed through it), hidden");
  assert.match(scroll, /className: "rzn-field"/);
  assert.match(scroll, /settle: 0\.3,/);
  // The layer renders after the governor's measure: its GPU submit never
  // pushes the 2D band into its rect fallback.
  assert.ok(scroll.indexOf("lastDrawMs = (environment.performance") < scroll.indexOf("field.render("));
  // The entry's engine: the chunk imported lazily, the camera on the figure's
  // box through scale/translate (never transform, the figure's own, kept at
  // identity: the body never moves),
  // identity restored at the end, the layer released at finish and stop.
  assert.match(entry, /void import\("@\/lib\/rexonance-field\/index\.js"\)/);
  assert.match(entry, /figure\.style\.scale = /);
  assert.match(entry, /figure\.style\.translate =/);
  assert.doesNotMatch(entry, /figure\.style\.transform =/);
  assert.match(entry, /box\.insertBefore\(canvas, settledCanvas\);/);
  assert.equal(entry.match(/releaseField\(\);/g).length, 2, "finish and stop");
  assert.match(entry, /extras\?\.governed\(\) \? 0\.5 : 1/);
  assert.match(entry, /if \(!coarse && fieldState\[fieldLib\.FIELD_STATE\.IMPULSES\] > 0\)/);
  assert.match(entry, /fieldLib\.fieldHash,\s*true,\s*false,/, "rays, no composite operation");
  // The stylesheets: light only, never input; the front canvas over the engine's.
  assert.match(calls, /\.rx-call-sequence \.rx-suit-nanites > \.rx-suit-field \{\s*pointer-events: none;\s*\}/);
  assert.match(calls, /\.rx-suit-field\.is-front \{\s*z-index: 1;\s*\}/);
  assert.match(zenith, /> \.rzn-field \{[^}]*pointer-events: none;/);
});
