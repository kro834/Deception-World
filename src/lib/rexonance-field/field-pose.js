/* RESONANCE FIELD: a particle's pose. The reference the shader is written
   from (field-gl.js inlines the same constants and arithmetic), used for the
   tests and for any 2D fallback.

   Owner (2026-10-21): 「炎がアンダースーツを段々と覆っていき、爆散。ナノマシン
   と化し、そこから装着シークエンスが始まります。」 Every particle is a
   fragment of the burst: born at its fragment's handoff position with its
   velocity (the fire's own `fireFragmentPose` once it lands; until then the
   model below, thrown off the burning body), still hot in the combustion's
   pale cyan with a pink-violet fringe, it flies out under drag, cools into
   its spark tone (pink / cyan — the nanites), and is swept onto its helical
   field line about the attractor. From there: the angle advances with the
   score's phase, the radius closes as the group tightens, the height
   spreads over the group, each lock's impulse flings it outward and lets
   it settle, the collapse draws it into the reactor, the detonation throws
   it out. Units: figure heights (x from the figure's left edge, y from the
   crown, z toward the viewer); the wake is 0..1 over the score's wake. */

import { fieldHash } from "./field-seed.js";
import { FIELD_STATE } from "./field-score.js";
import { sampleFlameBirth } from "../rexonance-ignition.js";

const TAU = Math.PI * 2;
const clamp01 = (value) => (value < 0 ? 0 : value > 1 ? 1 : value);
const smooth = (u) => u * u * (3 - 2 * u);

export const FIELD_SHAPE = Object.freeze({
  /** The ring's radius (figure heights) open and tight. */
  radiusWide: 0.44,
  radiusTight: 0.1,
  /** The body is narrower than it is tall: x is squashed by this. */
  aspect: 0.62,
  /** Orbits over the whole score, at speed 1. */
  orbits: 2.4,
  /** The ring's vertical spread at a group with no extent (figure heights). */
  spreadBase: 0.16,
  /** A gentle vertical wobble along the line. */
  wobble: 0.028,
  /** A tight ring packs its particles: their light is cut by this much at
   * full tightness, so the convergence glows instead of washing out white. */
  pack: 0.62,
  /** A lock's flash on the nearby particles' light. */
  flashGain: 1.4,
  /** An impulse's fling (figure heights) and its reach (figure heights). */
  push: 0.16,
  pushReach: 0.26,
  /** The detonation's throw (figure heights). */
  throw: 0.5,
  /** The streak: how far back along the line a trail reaches (phase units);
   * a line marker's trail is this many times longer. */
  streak: 0.0045,
  marker: 3,
  /** Depth: how much bigger and dimmer a particle gets behind the body. */
  bokeh: 0.8,
  bokehDim: 0.45,
  /** Over a locked group's plates (its box, grown by this margin in figure
   * heights) a particle's light is cut to this share: seated metal reads. */
  lockMargin: 0.05,
  lockShade: 0.12,
});

/** The birth: how a burst fragment becomes a particle of the field. */
export const FIELD_BIRTH = Object.freeze({
  /** Each particle is born within this share of the wake (staggered). */
  stagger: 0.35,
  /** Its ballistic flight (figure heights per wake) and its drag. */
  drift: 0.55,
  drag: 3,
  /** From this share of its life to that, it is swept onto its line. */
  sweep: Object.freeze([0.3, 1]),
  /** It cools from combustion to its spark tone over this share. */
  heat: 0.55,
  /** How much brighter a hot fragment burns. */
  glow: 1.2,
  /** The charge rises over this share of the wake (the burst itself). */
  rise: 0.25,
  /** The thrown speed of the model fragments (figure heights per wake). */
  speed: Object.freeze([0.5, 1]),
  /** Their swirl off the normal (rad) and their lift. */
  swirl: 0.35,
  lift: 0.2,
  /** Combustion, nearly out: pale cyan, a pink-violet fringe on this share. */
  hot: Object.freeze([0.8, 0.96, 1]),
  fringe: Object.freeze([0.93, 0.72, 1]),
  fringeShare: 0.18,
});

/** The figure's width over its height (the suit's 571 × 1040), for the
 * model fragments' normalized body x. */
export const FIELD_FIGURE_ASPECT = 571 / 1040;

/** The seeds' layout: the particle's helix seeds, then its birth (the
 * fragment's handoff: x, y in figure heights; velocity in figure heights per
 * wake). */
export const FIELD_SEEDS = Object.freeze({
  A0: 0,
  R0: 1,
  YP: 2,
  SPD: 3,
  PICK: 4,
  ARM: 5,
  SIZE: 6,
  MARKER: 7,
  STAGGER: 8,
  BX: 9,
  BY: 10,
  BVX: 11,
  BVY: 12,
  LENGTH: 13,
});

/** A byte's worth (the shader reads bytes). */
const byte = (value) => Math.round(clamp01(value) * 255) / 255;
const fract = (value) => value - Math.floor(value);

/**
 * The model fragment: thrown off the burning body's surface (the fire's
 * sampled skin, rexonance-ignition.js) along its normal with a swirl and a
 * lift. Writes [x, y, vx, vy] (figure heights; per wake) into `out`. The
 * fire's own `fireFragmentPose` replaces this once it lands.
 */
export function fieldFragment(index, out, aspect = FIELD_FIGURE_ASPECT) {
  const sample = fieldFragment.sample;
  sampleFlameBirth(fieldHash(index, 21), sample);
  const B = FIELD_BIRTH;
  const speed = B.speed[0] + (B.speed[1] - B.speed[0]) * fieldHash(index, 22);
  const swirl = (fieldHash(index, 24) - 0.5) * 2 * B.swirl;
  const cos = Math.cos(swirl);
  const sin = Math.sin(swirl);
  const nx = sample[2];
  const ny = sample[3];
  out[0] = sample[0] * aspect;
  out[1] = sample[1];
  out[2] = (nx * cos - ny * sin) * speed;
  out[3] = (nx * sin + ny * cos) * speed - B.lift * speed;
  return out;
}
fieldFragment.sample = new Float64Array(4);

/** A particle's seeds, as the shader reads them (0..1 except the arm and
 * the birth), from `fragment(index, out)` for its birth. */
export function fieldSeeds(index, arms, out, fragment = fieldFragment) {
  const S = FIELD_SEEDS;
  out[S.A0] = fieldHash(index, 11); // its angle on the ring (turns)
  out[S.R0] = 0.3 + 0.7 * Math.sqrt(fieldHash(index, 12)); // its radius share
  out[S.YP] = fieldHash(index, 13); // its height on the group
  out[S.SPD] = 0.55 + 0.9 * fieldHash(index, 14); // its speed
  out[S.PICK] = fieldHash(index, 16); // tone pick, and its lateral spread
  out[S.ARM] = index % arms;
  out[S.SIZE] = 0.6 + fieldHash(index, 15);
  out[S.MARKER] = fieldHash(index, 17) < 0.22 ? 1 : 0; // a line marker (a long trail)
  // Its birth's stagger, as the shader derives it from its byte seeds.
  out[S.STAGGER] = fract(byte(out[S.A0]) * 13 + byte(out[S.YP]) * 7);
  fragment(index, fieldFragment.birth);
  out[S.BX] = fieldFragment.birth[0];
  out[S.BY] = fieldFragment.birth[1];
  out[S.BVX] = fieldFragment.birth[2];
  out[S.BVY] = fieldFragment.birth[3];
  return out;
}
fieldFragment.birth = new Float64Array(4);

/** An impulse's fling by its age: a quick throw that settles. */
export function fieldFling(age) {
  if (!(age > 0) || age >= 1) return 0;
  return age * Math.exp(-4 * age) * 4 * (1 - age);
}

/**
 * The pose at phase `s` (the state's S, or S minus a streak for the tail;
 * `wake` is the wake at that phase: the state's WAKE, less the streak times
 * WAKE_RATE for the tail) for a particle's seeds under a state and a take.
 * Writes [x, y, z, size, light, heat] into `out`.
 */
export function fieldPose(seeds, s, state, take, height, out, wake = state[FIELD_STATE.WAKE]) {
  const F = FIELD_STATE;
  const P = FIELD_SHAPE;
  const B = FIELD_BIRTH;
  const S = FIELD_SEEDS;
  const a0 = seeds[S.A0] * TAU;
  const r0 = seeds[S.R0];
  const yp = seeds[S.YP];
  const spd = seeds[S.SPD];
  const pick = seeds[S.PICK];
  const arm = seeds[S.ARM];
  const tight = state[F.TIGHT];
  const collapse = state[F.COLLAPSE];
  const detonate = state[F.DETONATE];
  const theta =
    a0 +
    take.phase +
    take.hand * TAU * P.orbits * spd * s +
    (arm * TAU) / take.arms +
    take.twist * (yp - 0.5) * 2;
  let rho = r0 * (P.radiusWide + (P.radiusTight - P.radiusWide) * tight);
  rho *= 1 - collapse * 0.96;
  if (detonate > 0) rho = r0 * (0.04 + P.throw * (1 - (1 - detonate) * (1 - detonate)));
  const cx = state[F.AX] / height;
  const cy = state[F.AY] / height;
  const spreadX = state[F.SPREAD_X] / height;
  const spreadY = P.spreadBase + state[F.SPREAD_Y] / height;
  let z = rho * Math.sin(theta);
  let x =
    cx +
    rho * Math.cos(theta) * P.aspect +
    (pick - 0.5) * spreadX * 2 * (1 - tight * 0.6) * (1 - collapse);
  let y =
    cy +
    (yp - 0.5) * spreadY * (1 - collapse) +
    P.wobble * Math.sin(theta * 0.5 + yp * TAU) +
    take.tilt * z * (1 - collapse);
  // Its birth: not yet born, nothing; born, a fragment flying out under
  // drag, cooling, swept onto its line by the wake's end.
  const stagger = seeds[S.STAGGER] * B.stagger;
  let born = 1;
  let tau = 1;
  let heat = 0;
  if (wake < 1) {
    born = wake > stagger ? 1 : 0;
    tau = born ? clamp01((wake - stagger) / (1 - stagger)) : 0;
  }
  if (tau < 1) {
    const flight = ((1 - Math.exp(-B.drag * tau)) / B.drag) * B.drift;
    const bx = seeds[S.BX] + seeds[S.BVX] * flight;
    const by = seeds[S.BY] + seeds[S.BVY] * flight;
    const sweep = smooth(clamp01((tau - B.sweep[0]) / (B.sweep[1] - B.sweep[0])));
    x = bx + (x - bx) * sweep;
    y = by + (y - by) * sweep;
    z = 0.02 + (z - 0.02) * sweep;
    heat = 1 - smooth(clamp01(tau / B.heat));
  }
  // Impulses: an outward fling from each recent lock, settling.
  const count = state[F.IMPULSES];
  let flash = 0;
  for (let k = 0; k < count; k += 1) {
    const o = F.IMPULSE + k * F.IMPULSE_STRIDE;
    const age = state[o + 2];
    const strength = state[o + 3];
    const dx = x - state[o] / height;
    const dy = y - state[o + 1] / height;
    const d = Math.hypot(dx, dy);
    const near = Math.exp((-d * d) / (2 * P.pushReach * P.pushReach));
    const push = P.push * strength * fieldFling(age) * near;
    const inv = 1 / Math.max(d, 0.03);
    x += dx * inv * push;
    y += dy * inv * push;
    if (age < 0.2) flash += (1 - age / 0.2) * strength * near;
  }
  // Off the seated armour: shaded over every locked group's box.
  let shade = 1;
  const locks = state[F.LOCKED];
  for (let k = 0; k < locks; k += 1) {
    const o = F.LOCK + k * F.LOCK_STRIDE;
    const hx = state[o + 2] / height + P.lockMargin;
    const hy = state[o + 3] / height + P.lockMargin;
    const ix = 1 - clamp01((Math.abs(x - state[o] / height) - hx) / P.lockMargin);
    const iy = 1 - clamp01((Math.abs(y - state[o + 1] / height) - hy) / P.lockMargin);
    shade = Math.min(shade, 1 - (1 - P.lockShade) * ix * iy);
  }
  const depth = Math.max(0, -z);
  out[0] = x;
  out[1] = y;
  out[2] = z;
  out[3] = seeds[S.SIZE] * (1 + P.bokeh * depth);
  out[4] =
    born *
    state[F.CHARGE] *
    (0.55 + 0.45 * spd) *
    (1 - P.bokehDim * depth) *
    (1 - P.pack * tight) *
    (1 + P.flashGain * flash) *
    (1 + B.glow * heat) *
    shade *
    state[F.SETTLE];
  out[5] = heat;
  return out;
}
