// FAR FROM SAGA's nanite swarm: the chips of both kits, born from the fire's
// fragments, gathered into an orbital cocoon round the body, and drained
// into the plates as their tiles fly (owner, 2026-10-22). Every chip's pose
// is a closed-form function of the entry clock and its own planned seeds
// (no state carried between frames, so a scrubbed clock replays the same
// frames); the plan is typed arrays made once, and a pose is written into a
// buffer the caller owns, so a frame allocates nothing.
import { NANITE_FIRE_PHASES, fireFragmentPose } from "./rexonance-ignition.js";
import {
  FAR_FROM_ENTRY_FIRE,
  farFromFlamePhase,
  farFromFlameTime,
} from "./far-from-entry-ignition.js";

const TAU = Math.PI * 2;
const clamp = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth = (x) => x * x * (3 - 2 * x);
// A pure function of a chip and a salt (no random state).
export function chipHash(c, salt) {
  const x = Math.sin(c * 12.9898 + salt * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

/** The pose buffer's slots (Float64Array(POSE_SLOTS)). */
export const CHIP_X = 0;
export const CHIP_Y = 1;
export const CHIP_SIZE = 2;
export const CHIP_FRAME = 3;
export const CHIP_ALPHA = 4;
export const CHIP_DEPTH = 5;
/** 0 unborn or spent, 1 gathering out of the fire, 2 on its ring, 3 draining
 * into its plate, 4 gathering round the reactor, 5 imploding into it. */
export const CHIP_STATE = 6;
export const CHIP_SLOTS = 7;

const FRAG = new Float64Array(6);

/**
 * Plans a swarm of `count` chips, the last `free` of them free (they gather
 * round the reactor and implode), the rest bound to plates in proportion to
 * their tiles. `tiles` is the plan's flat tile table: x, y (the point in
 * figure px a tile's flight starts from), start (when it starts, ms) and
 * `plateTiles` the index into it where each plate's tiles begin (length
 * plates + 1). `under` registers the undersuit's frame (the fragments' body
 * space) in the figure: x, y, w, h. `swarm` is FAR_FROM_ENTRY_SWARM; `kitB`
 * the share of chips that are kit B.
 */
export function planFarFromSwarm({ count, free, tiles, plateTiles, under, figure, swarm, kitB }) {
  const plan = {
    count,
    free,
    bound: count - free,
    seed: new Float32Array(count),
    born: new Float32Array(count),
    ring: new Uint8Array(count),
    angle: new Float32Array(count),
    omega: new Float32Array(count),
    radius: new Float32Array(count),
    height: new Float32Array(count),
    hover: new Float32Array(count),
    size: new Float32Array(count),
    tone: new Uint8Array(count),
    kit: new Uint8Array(count),
    tumble: new Float32Array(count),
    rate: new Float32Array(count),
    plate: new Int16Array(count),
    drainAt: new Float32Array(count),
    arriveAt: new Float32Array(count),
    tx: new Float32Array(count),
    ty: new Float32Array(count),
    under: Float64Array.of(under.x, under.y, under.w, under.h),
    centre: Float64Array.of(figure.width / 2, figure.height / 2),
    figW: figure.width,
    figH: figure.height,
    swarm,
    reactor: Float64Array.of(figure.core[0], figure.core[1]),
  };
  const P = NANITE_FIRE_PHASES;
  const plates = plateTiles.length - 1;
  const totalTiles = plateTiles[plates];
  const rings = swarm.rings;
  for (let c = 0; c < count; c += 1) {
    const seed = (c + 0.5) / count;
    plan.seed[c] = seed;
    // Born when its fragment has cooled (heat 0): the smallest phase past
    // the detonation at which fireFragmentPose reports no heat, by bisection.
    let lo = P.burstStart;
    let hi = P.flameEnd;
    for (let i = 0; i < 24; i += 1) {
      const mid = (lo + hi) / 2;
      fireFragmentPose(seed, mid, FRAG);
      if (FRAG[4] > 0) lo = mid;
      else hi = mid;
    }
    plan.born[c] = farFromFlameTime(hi);
    const ring = Math.floor(chipHash(c, 1) * rings);
    plan.ring[c] = ring;
    plan.angle[c] = chipHash(c, 2) * TAU;
    // Alternate rings turn the other way; each a little faster or slower.
    const direction = ring % 2 ? -1 : 1;
    plan.omega[c] = ((direction * swarm.orbit.spin * TAU) / 1000) * (0.85 + 0.3 * chipHash(c, 3));
    const ringAt = rings > 1 ? ring / (rings - 1) : 0.5;
    plan.radius[c] =
      figure.width *
      (swarm.orbit.inner + (swarm.orbit.outer - swarm.orbit.inner) * (1 - ringAt) * 0.7) *
      (0.92 + 0.16 * chipHash(c, 4));
    plan.height[c] =
      figure.height *
      (swarm.orbit.top + (swarm.orbit.bottom - swarm.orbit.top) * ringAt) *
      (0.97 + 0.06 * chipHash(c, 5));
    plan.hover[c] = chipHash(c, 6) * TAU;
    const h7 = chipHash(c, 7);
    plan.size[c] = swarm.size[0] + (swarm.size[1] - swarm.size[0]) * h7 * h7;
    // Tones: ice most, gold, white, a little pink (the kit's rows).
    const h8 = chipHash(c, 8);
    plan.tone[c] = h8 < 0.48 ? 0 : h8 < 0.78 ? 3 : h8 < 0.92 ? 2 : 1;
    plan.kit[c] = chipHash(c, 9) < kitB ? 1 : 0;
    plan.tumble[c] = chipHash(c, 10) * 24;
    plan.rate[c] = swarm.tumble * (0.7 + 0.6 * chipHash(c, 11));
    if (c >= plan.bound) {
      plan.plate[c] = -1;
      plan.drainAt[c] = Infinity;
      plan.arriveAt[c] = Infinity;
      continue;
    }
    // Its plate, by its share of the tiles; its tile, by hash.
    const share = ((c + 0.5) / plan.bound) * totalTiles;
    let p = 0;
    while (p < plates - 1 && plateTiles[p + 1] <= share) p += 1;
    const first = plateTiles[p];
    const n = plateTiles[p + 1] - first;
    const t = first + Math.min(n - 1, Math.floor(chipHash(c, 12) * n));
    plan.plate[c] = p;
    plan.arriveAt[c] = tiles.start[t];
    plan.drainAt[c] = tiles.start[t] - swarm.drain * (0.8 + 0.4 * chipHash(c, 13));
    plan.tx[c] = tiles.x[t];
    plan.ty[c] = tiles.y[t];
  }
  return plan;
}

// A chip's place on its ring at t: the ring seen from the front, tilted.
function orbit(plan, c, t, out) {
  const S = plan.swarm;
  const a = plan.angle[c] + plan.omega[c] * t + Math.sin(t * 0.0021 + plan.hover[c]) * 0.05;
  // The reactor's heartbeat breathes every ring out, reaching the farther
  // rings later.
  const beatFrom = S.heartbeat.from + plan.ring[c] * 40;
  let breath = 0;
  if (t > beatFrom) {
    const since = (t - beatFrom) % S.heartbeat.every;
    breath = S.heartbeat.breath * Math.exp(-since / 90);
  }
  const r = plan.radius[c] * (1 + breath);
  out[CHIP_X] = plan.centre[0] + Math.cos(a) * r;
  out[CHIP_Y] =
    plan.height[c] + Math.sin(a) * r * S.orbit.tilt + Math.sin(t * 0.004 + plan.hover[c]) * S.hover;
  out[CHIP_DEPTH] = (Math.sin(a) + 1) / 2;
}

/**
 * Writes chip `c`'s pose at entry `t` ms into `out` (CHIP_SLOTS): its place
 * (figure px), size (figure px), tumble frame, alpha, depth (0 behind the
 * body, 1 in front) and state. Closed-form in t.
 */
export function farFromChipPose(plan, c, t, out) {
  const S = plan.swarm;
  out[CHIP_STATE] = 0;
  out[CHIP_ALPHA] = 0;
  const born = plan.born[c];
  if (!(t >= born) || t >= plan.arriveAt[c]) return out;
  out[CHIP_SIZE] = plan.size[c];
  out[CHIP_FRAME] = Math.floor(plan.tumble[c] + plan.rate[c] * t) % 24;
  if (out[CHIP_FRAME] < 0) out[CHIP_FRAME] += 24;
  const free = plan.plate[c] < 0;
  const drainAt = plan.drainAt[c];
  if (free && t >= S.implode[0]) {
    // The implosion: the free chips spiral into the reactor and are spent.
    const u = clamp((t - S.implode[0]) / (S.implode[1] - S.implode[0]));
    if (u >= 1) return out;
    const e = smooth(u);
    const a = plan.angle[c] + plan.omega[c] * S.implode[0] * 1.6 + u * 4;
    const r = plan.figW * 0.13 * (1 - e);
    out[CHIP_X] = plan.reactor[0] + Math.cos(a) * r;
    out[CHIP_Y] = plan.reactor[1] + Math.sin(a) * r * 0.6;
    out[CHIP_ALPHA] = 1 - e * e;
    out[CHIP_DEPTH] = 1;
    out[CHIP_SIZE] = plan.size[c] * (1 - 0.5 * e);
    out[CHIP_STATE] = 5;
    return out;
  }
  if (free && t >= S.reactorGather[0]) {
    // Gathering round the reactor: the ring tightens to an orbit about it.
    const u = clamp((t - S.reactorGather[0]) / (S.reactorGather[1] - S.reactorGather[0]));
    const e = smooth(u);
    orbit(plan, c, t, out);
    const a = plan.angle[c] + plan.omega[c] * t * 1.6;
    const r = plan.figW * 0.13 * (1 + 0.3 * chipHash(c, 14));
    const gx = plan.reactor[0] + Math.cos(a) * r;
    const gy = plan.reactor[1] + Math.sin(a) * r * 0.6;
    out[CHIP_X] += (gx - out[CHIP_X]) * e;
    out[CHIP_Y] += (gy - out[CHIP_Y]) * e;
    out[CHIP_DEPTH] = out[CHIP_DEPTH] + (1 - out[CHIP_DEPTH]) * e;
    out[CHIP_ALPHA] = 1;
    out[CHIP_STATE] = 4;
    return out;
  }
  if (t >= drainAt) {
    // Draining: from where it left its ring to the point its tile flies from.
    const u = clamp((t - drainAt) / (plan.arriveAt[c] - drainAt));
    orbit(plan, c, drainAt, out);
    const e = u * u * (3 - 2 * u);
    const dx = plan.tx[c] - out[CHIP_X];
    const dy = plan.ty[c] - out[CHIP_Y];
    const bulge = Math.sin(u * Math.PI) * 18 * (chipHash(c, 15) - 0.5);
    out[CHIP_X] += dx * e - dy * 0.001 * bulge;
    out[CHIP_Y] += dy * e + dx * 0.001 * bulge;
    out[CHIP_DEPTH] = 1;
    out[CHIP_ALPHA] = u > 0.9 ? 1 - (u - 0.9) * 10 : 1;
    out[CHIP_STATE] = 3;
    return out;
  }
  orbit(plan, c, t, out);
  const since = t - born;
  if (since < S.gather) {
    // Out of the fire: its fragment's own flight blends into its ring.
    const u = since / S.gather;
    const e = smooth(u);
    fireFragmentPose(plan.seed[c], farFromFlamePhase(t), FRAG);
    const fx = plan.under[0] + FRAG[0] * plan.under[2];
    const fy = plan.under[1] + FRAG[1] * plan.under[3];
    out[CHIP_X] = fx + (out[CHIP_X] - fx) * e;
    out[CHIP_Y] = fy + (out[CHIP_Y] - fy) * e;
    out[CHIP_DEPTH] = 1 + (out[CHIP_DEPTH] - 1) * e;
    out[CHIP_ALPHA] = Math.min(1, u * 3);
    out[CHIP_STATE] = 1;
    return out;
  }
  out[CHIP_ALPHA] = 1;
  out[CHIP_STATE] = 2;
  return out;
}

/** The burst's phase window a firebrand chip burns in: from the detonation
 * to its birth (its fragment, drawn as a firebrand by the engine). */
export const FAR_FROM_FIREBRAND_FROM = FAR_FROM_ENTRY_FIRE.burst;
