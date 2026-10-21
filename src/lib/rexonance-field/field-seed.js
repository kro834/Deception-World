/* RESONANCE FIELD (owner, 2026-10-21: 「装着方式はダイナミックでありつつ、何度
   見ても飽きない様な革新性や素晴らしさを追求して」): hashes and the per-visit
   seed. Every value the field, its camera and its impacts take from a seed
   is a hash of (index, salt) — never a stream — so a frame depends only on
   the clock and the seed, and scrubbing is exact within a visit. A new visit
   (a new live session of the scroll scene, a new call) rolls a new take, so
   repeat viewings differ: the field's arms, handedness, twist, palette lead
   and camera take. The fit order, the clocks and the finished frame never
   depend on it. */

const TAU = Math.PI * 2;

/** A hash of (index, salt) in [0, 1). Integer inputs only. */
export function fieldHash(index, salt) {
  let h = (Math.imul(index | 0, 374761393) + Math.imul(salt | 0, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h = Math.imul(h ^ (h >>> 15), 2246822519);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

let visits = 0;
/** The seed of a visit: a 32-bit integer from the visit's count and the
 * clock; the test environment can pass its own clock. Fixed once taken. */
export function fieldVisitSeed(environment = globalThis) {
  visits += 1;
  const now = Math.floor(environment.performance?.now?.() ?? 0) | 0;
  const date = environment.Date?.now?.() ?? Date.now();
  const stamp = Math.floor(date / 7) | 0;
  let seed = (Math.imul(visits, 2654435761) ^ Math.imul(now, 2246822519) ^ stamp) | 0;
  seed = Math.imul(seed ^ (seed >>> 15), 2654435761);
  return (seed ^ (seed >>> 13)) >>> 0;
}

/** The take: what a seed decides for one visit. Frozen. */
export function fieldTake(seed) {
  const s = (Number.isFinite(seed) ? seed : 0) >>> 0;
  const h = (salt) => fieldHash(s, salt);
  return Object.freeze({
    seed: s,
    /** Field lines come in 3, 4 or 5 arms (a 3-arm field reads sparse and
     * fast, a 5-arm one dense and slow). */
    arms: 3 + Math.floor(h(1) * 3),
    /** Handedness of the helix. */
    hand: h(2) < 0.5 ? -1 : 1,
    /** How far the helix winds up the body (rad per figure height). */
    twist: 0.9 + h(3) * 1.4,
    /** The ring plane's tilt toward the viewer (rad). */
    tilt: (h(4) - 0.5) * 0.26,
    /** Which tone leads: 0 ice, 1 pink, 2 white. */
    palette: Math.floor(h(5) * 3),
    /** The camera take: 0 restrained, 1 standard, 2 bold. */
    camera: Math.floor(h(6) * 3),
    /** The camera's lateral drift. */
    drift: h(7) < 0.5 ? -1 : 1,
    /** The field's global angular phase (rad). */
    phase: h(8) * TAU,
  });
}
