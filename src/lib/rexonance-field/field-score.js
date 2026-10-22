/* RESONANCE FIELD: the score and its state. A score lists, on a scene's own
   clock (the entry's canonical ms, the scroll's progress q), when the field
   wakes, which group of plates it converges on and when that group locks,
   when it collapses into the reactor, and when it detonates with the
   light-up. `fieldState` turns a clock value into the field's state with no
   history: charge, attractor, tightness, the recent impulses (each lock's
   outward whip, played in reverse when scrubbing back), collapse and
   detonation. Positions are figure pixels. */

import { NANITE_FIRE_PHASES } from "../rexonance-ignition.js";
import { FIELD_WAKE } from "./field-clock.js";

const clamp01 = (value) => (value < 0 ? 0 : value > 1 ? 1 : value);
const smooth = (u) => u * u * (3 - 2 * u);
const span = (value, from, to) => (to > from ? clamp01((value - from) / (to - from)) : value >= to ? 1 : 0);

/** The state buffer's layout (Float32Array of FIELD_STATE.LENGTH). */
export const FIELD_STATE = Object.freeze({
  /** 0..1 across [wake.from, end]: the helix's phase driver. */
  S: 0,
  /** 0..1: how much field there is. */
  CHARGE: 1,
  /** The attractor (figure px). */
  AX: 2,
  AY: 3,
  /** 0..1: how tightly the ring hugs the attractor. */
  TIGHT: 4,
  /** The group's extent (figure px) the ring spreads over. */
  SPREAD_X: 5,
  SPREAD_Y: 6,
  /** 0..1: the ring drawn into the reactor. */
  COLLAPSE: 7,
  /** 0..1: the burst out of the reactor with the light. */
  DETONATE: 8,
  /** How many impulses are live (0..MAX_IMPULSES). */
  IMPULSES: 9,
  /** 0..1: the freshest impulse's flash (the impact frame). */
  FLASH: 10,
  /** Which group is converging (-1 none). */
  GROUP: 11,
  /** 0..1 over the wake: the burst's fragments becoming the field. */
  WAKE: 12,
  /** Wake per unit of S (a streak's tail reads the wake it had). */
  WAKE_RATE: 13,
  /** 0..1: how much of the field is left as the armour seats (the score's
   * settle floor by its end): the metal must read, not the swarm. */
  SETTLE: 14,
  /** How many groups have locked (each shades the particles over it). */
  LOCKED: 15,
  /** Impulses: x, y, age (0..1 over the impulse span), strength. */
  IMPULSE: 16,
  IMPULSE_STRIDE: 4,
  MAX_IMPULSES: 4,
  /** Locked groups: x, y, half extents (figure px), oldest first. */
  LOCK: 32,
  LOCK_STRIDE: 4,
  MAX_LOCKED: 8,
  LENGTH: 64,
});

/** The charge rises over this share of the wake: the burst itself, from
 * the detonation to the first fragment's cooling (materialStart), so every
 * chip is born into a whole field (a score's wake is FIELD_WAKE in its own
 * clock: field-clock.js). */
export const FIELD_WAKE_RISE =
  (NANITE_FIRE_PHASES.materialStart - FIELD_WAKE[0]) / (FIELD_WAKE[1] - FIELD_WAKE[0]);

/** The gather (photosensitivity, 2026-10-22): the wake's sweep brings every
 * chip in at once from the burst's throw onto its line, and the cloud packs
 * on the body for a few frames before the first group draws it down — one
 * more large-area pulse less than a second after the burst's. The score's
 * `gather` share of the light gives way over that sweep (wake shares
 * [dim from, dim full]) and comes back over `back` of the wake after it, so
 * the field never swings a whole cell's luminance on its own. */
export const FIELD_GATHER = Object.freeze({ from: 0.4, full: 0.7, back: 0.6 });

/** How far into an impulse the impact frame lasts (share of its span). */
export const FIELD_FLASH_SHARE = 0.18;

/**
 * Builds a score. `groups` lock in order; each is { x, y, sx, sy, from, lock,
 * strength?, ix?, iy? } (its centre, half extents, when the field starts
 * converging on it, when it locks; where its lock's impulse strikes, its
 * centre by default). `wake`, `collapse`, `detonate` are [from, to]; `end`
 * is when the field is wholly gone; `impulse` is one impulse's span;
 * `origin` is the reactor. Validated and frozen.
 *
 * (The impulse's own anchor, sweep 2, F30: a two-sided group's centre —
 * the legs', the arms', the shoulders' — is the body's midline, the empty
 * gap between them, and the lock's starburst sat there, on no plate.)
 */
export function fieldScore({
  wake,
  groups,
  collapse,
  detonate = null,
  end,
  impulse,
  origin,
  // The whole body's extent the woken field spreads over before the first
  // group draws it in (figure px, half extents).
  spread = [0, 0],
  // The field left by the time the last group locks (1: none of it goes).
  settle = 1,
  // How much of the field's light gives way while the wake sweeps its chips
  // in onto their lines (0: none). See FIELD_GATHER.
  gather = 0,
}) {
  const pair = (value, name) => {
    if (!Array.isArray(value) || value.length !== 2 || !(value[0] < value[1]))
      throw new RangeError(`field score: ${name} must be [from, to]`);
    return Object.freeze([value[0], value[1]]);
  };
  if (!Array.isArray(origin) || origin.length < 2) throw new RangeError("field score: origin");
  if (!Array.isArray(groups) || !groups.length) throw new RangeError("field score: groups");
  const W = pair(wake, "wake");
  const C = pair(collapse, "collapse");
  const D = detonate ? pair(detonate, "detonate") : null;
  if (!Number.isFinite(impulse) || impulse <= 0) throw new RangeError("field score: impulse");
  if (!Number.isFinite(end) || end < C[1]) throw new RangeError("field score: end");
  if (!Array.isArray(spread) || spread.length < 2 || !spread.every(Number.isFinite))
    throw new RangeError("field score: spread");
  if (!Number.isFinite(settle) || settle < 0 || settle > 1)
    throw new RangeError("field score: settle");
  if (!Number.isFinite(gather) || gather < 0 || gather >= 1)
    throw new RangeError("field score: gather");
  const n = groups.length;
  const gx = new Float32Array(n);
  const gy = new Float32Array(n);
  const gsx = new Float32Array(n);
  const gsy = new Float32Array(n);
  const gfrom = new Float64Array(n);
  const glock = new Float64Array(n);
  const gstrength = new Float32Array(n);
  const gix = new Float32Array(n);
  const giy = new Float32Array(n);
  let previous = -Infinity;
  groups.forEach((group, k) => {
    const { x, y, sx = 0, sy = 0, from, lock, strength = 1, ix = x, iy = y } = group;
    if (![x, y, sx, sy, from, lock, strength, ix, iy].every(Number.isFinite) || !(from < lock))
      throw new RangeError(`field score: group ${k}`);
    if (lock < previous) throw new RangeError(`field score: group ${k} locks out of order`);
    previous = lock;
    gx[k] = x;
    gy[k] = y;
    gix[k] = ix;
    giy[k] = iy;
    gsx[k] = sx;
    gsy[k] = sy;
    gfrom[k] = from;
    glock[k] = lock;
    gstrength[k] = strength;
  });
  return Object.freeze({
    wake: W,
    collapse: C,
    detonate: D,
    end,
    impulse,
    origin: Object.freeze([origin[0], origin[1]]),
    spread: Object.freeze([spread[0], spread[1]]),
    settle,
    gather,
    count: n,
    gx,
    gy,
    gsx,
    gsy,
    gfrom,
    glock,
    gstrength,
    gix,
    giy,
  });
}

/** A new, zeroed state buffer. */
export const fieldStateBuffer = () => new Float32Array(FIELD_STATE.LENGTH);

/**
 * The field's state at `clock`, written into `out` (a fieldStateBuffer).
 * Pure: the same score and clock always give the same bytes.
 */
export function fieldState(score, clock, out) {
  const F = FIELD_STATE;
  const t = Number.isFinite(clock) ? clock : 0;
  out.fill(0);
  out[F.GROUP] = -1;
  const [wakeFrom, wakeTo] = score.wake;
  const [collapseFrom, collapseTo] = score.collapse;
  out[F.S] = span(t, wakeFrom, score.end);
  out[F.WAKE] = span(t, wakeFrom, wakeTo);
  out[F.WAKE_RATE] = (score.end - wakeFrom) / (wakeTo - wakeFrom);
  // Charge: rises with the burst (the first share of the wake: the
  // fragments are born hot and whole), holds, falls over the collapse. The
  // detonation has its own window after it.
  let charge = smooth(Math.min(1, out[F.WAKE] / FIELD_WAKE_RISE));
  const collapse = smooth(span(t, collapseFrom, collapseTo));
  charge *= 1 - collapse;
  out[F.COLLAPSE] = collapse;
  if (score.detonate) {
    const u = span(t, score.detonate[0], score.detonate[1]);
    if (u > 0 && u < 1) {
      out[F.DETONATE] = u;
      charge = Math.max(charge, (1 - u) * (1 - u) * smooth(Math.min(1, u * 8)));
    }
  }
  if (t >= score.end) charge = 0;
  out[F.CHARGE] = charge;
  // The attractor: the reactor until the first group, then each group's
  // centre, reached over the first half of its window; its spread likewise.
  let ax = score.origin[0];
  let ay = score.origin[1];
  let sx = score.spread[0];
  let sy = score.spread[1];
  let tight = 0;
  let group = -1;
  for (let k = 0; k < score.count; k += 1) {
    const from = score.gfrom[k];
    const lock = score.glock[k];
    if (t < from) break;
    const reach = smooth(span(t, from, from + (lock - from) * 0.5));
    ax += (score.gx[k] - ax) * reach;
    ay += (score.gy[k] - ay) * reach;
    sx += (score.gsx[k] - sx) * reach;
    sy += (score.gsy[k] - sy) * reach;
    group = k;
    // Tightness: closes over the window, releases after the lock.
    const rise = smooth(span(t, from, lock));
    const release = 1 - smooth(span(t, lock, lock + score.impulse));
    tight = Math.max(tight, rise * release);
  }
  // The collapse draws the attractor back to the reactor; the detonation
  // bursts from it.
  if (collapse > 0 || out[F.DETONATE] > 0) {
    const back = Math.max(collapse, out[F.DETONATE] > 0 ? 1 : 0);
    ax += (score.origin[0] - ax) * back;
    ay += (score.origin[1] - ay) * back;
    sx *= 1 - back;
    sy *= 1 - back;
    tight *= 1 - back;
  }
  out[F.AX] = ax;
  out[F.AY] = ay;
  out[F.SPREAD_X] = sx;
  out[F.SPREAD_Y] = sy;
  out[F.TIGHT] = tight;
  out[F.GROUP] = group;
  // Impulses: the locks within their span, freshest first, each where its
  // group's last plate seats (the attractor and the lock boxes keep the
  // group's centre).
  let count = 0;
  let flash = 0;
  for (let k = score.count - 1; k >= 0 && count < F.MAX_IMPULSES; k -= 1) {
    const lock = score.glock[k];
    if (t < lock) continue;
    const age = (t - lock) / score.impulse;
    if (age >= 1) continue;
    const o = F.IMPULSE + count * F.IMPULSE_STRIDE;
    out[o] = score.gix[k];
    out[o + 1] = score.giy[k];
    out[o + 2] = age;
    out[o + 3] = score.gstrength[k];
    if (count === 0) flash = Math.max(0, 1 - age / FIELD_FLASH_SHARE) * score.gstrength[k];
    count += 1;
  }
  out[F.IMPULSES] = count;
  // The groups locked so far (their boxes shade the particles over them),
  // and the field thinning from the first lock to the last.
  let locked = 0;
  for (let k = 0; k < score.count && locked < F.MAX_LOCKED; k += 1) {
    if (t < score.glock[k]) continue;
    const o = F.LOCK + locked * F.LOCK_STRIDE;
    out[o] = score.gx[k];
    out[o + 1] = score.gy[k];
    out[o + 2] = score.gsx[k];
    out[o + 3] = score.gsy[k];
    locked += 1;
  }
  out[F.LOCKED] = locked;
  const first = score.glock[0];
  const last = score.glock[score.count - 1];
  out[F.SETTLE] = 1 - (1 - score.settle) * smooth(span(t, first, last));
  if (score.gather > 0) {
    const G = FIELD_GATHER;
    const length = wakeTo - wakeFrom;
    const dim =
      smooth(span(t, wakeFrom + length * G.from, wakeFrom + length * G.full)) *
      (1 - smooth(span(t, wakeTo, wakeTo + length * G.back)));
    out[F.SETTLE] *= 1 - score.gather * dim;
  }
  out[F.FLASH] = Math.min(1, flash);
  return out;
}
