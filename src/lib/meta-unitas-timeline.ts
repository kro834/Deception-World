/** META UNITAS SAGA — the suit-up's score (2026-10-23).
 *
 * Pure numbers and pure functions, no DOM: when each beat of the partition
 * suit-up happens along the runway's progress p (0 … 1), and where a plate
 * stands at a given p. The scene (src/lib/meta-unitas-partition.ts) draws
 * from these; the scroll runway and the entry transition only choose p.
 *
 * The generation method is the form's own ability, 可分性付与 — separation
 * without destruction: the wearer (Rexonance's undersuit) is drawn through
 * by the UNITAS HALO's light axis; one single glowing whole rises over him;
 * orange boundaries run out from the helix across it; along them the whole
 * partitions into independent plates (SAM's cut of the art), which drift
 * apart, each its own state, turn from light into armour, and settle back
 * whole; then, one per SA-GA！DEUS！, the four META UNITAS BITs fly out on
 * halo orbits, the QUINT CAUDIA unfolds from its root, and on META UNITAS！
 * the boundaries cool into the armour's light paths and the helix lights.
 * ウルトラ partitions the finished ミドル again: every plate turns over into
 * its crystal counterpart from the helix out, the bits re-form as crystal
 * units, the tail re-grows, and the four TETRA MANUS unfold from behind the
 * shoulders and ribs.
 */

export type Span = readonly [start: number, end: number];

/** The beats on the runway's progress (p). */
export const META_UNITAS_BEATS = Object.freeze({
  /** The halo draws itself over the head. */
  halo: [0.03, 0.13] as Span,
  /** Its light axis runs down through the wearer. */
  axis: [0.05, 0.16] as Span,
  /** The single glowing whole rises over him (from the axis outward). */
  whole: [0.1, 0.22] as Span,
  /** The boundaries run out from the helix across the whole. */
  seams: [0.18, 0.32] as Span,
  /** Plate by plate (from the helix out) the whole becomes independent plates. */
  partition: [0.24, 0.36] as Span,
  /** Each plate turns from light into its armour. */
  armour: [0.36, 0.54] as Span,
  /** The plates settle back into one figure. */
  settle: [0.46, 0.6] as Span,
  /** The four bits, one per SA-GA！DEUS！. */
  bits: [0.58, 0.76] as Span,
  /** The tail, segment by segment from its root. */
  tail: [0.6, 0.78] as Span,
  /** The boundaries cool, the halo and the helix light: META UNITAS！ */
  seal: [0.78, 0.87] as Span,
  /** ウルトラ (only when the selector chose it). */
  ultra: [0.88, 0.98] as Span,
});

/** Where ミドル is complete (the figure stands finished). */
export const META_UNITAS_MIDDLE_DONE = 0.87;

/** The five calls' cues (the record's order), the fourth one per SA-GA！DEUS！. */
export const META_UNITAS_CALL_CUES = Object.freeze([
  0.02,
  0.1,
  0.22,
  [0.58, 0.62, 0.66, 0.7] as const,
  0.8,
] as const);

/** When the bit of index k (0 … 3) leaves the helix, and how long it flies. */
export const bitLaunch = (k: number) => META_UNITAS_BEATS.bits[0] + k * 0.04;
export const BIT_FLIGHT = 0.1;

export const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
/** 0 before a, 1 after b, smooth between. */
export function smoothstep(a: number, b: number, v: number) {
  const t = clamp01((v - a) / (b - a));
  return t * t * (3 - 2 * t);
}
export const easeOutCubic = (t: number) => 1 - (1 - clamp01(t)) ** 3;
export const easeInOut = (t: number) => {
  const c = clamp01(t);
  return c < 0.5 ? 4 * c * c * c : 1 - (-2 * c + 2) ** 3 / 2;
};
/** A one-shot bell: 0 at a, 1 at the middle, 0 at b. */
export function bell(a: number, b: number, v: number) {
  if (v <= a || v >= b) return 0;
  return Math.sin(((v - a) / (b - a)) * Math.PI);
}

/** A body plate's place on the partition's clock: `order` is its distance
 * from the helix (0 … 1). Returns where it is at p: drawn or not, how far it
 * has drifted out (0 … 1), how much it is armour rather than light. */
export function plateState(order: number, p: number) {
  const take = META_UNITAS_BEATS.partition[0] + order * 0.12;
  const drawn = p >= take;
  const out = smoothstep(take, take + 0.08, p);
  const back = smoothstep(0.46 + order * 0.04, 0.56 + order * 0.04, p);
  const armour = smoothstep(0.36 + order * 0.08, 0.44 + order * 0.08, p);
  return { drawn, drift: out * (1 - back), armour };
}

/** A tail segment's unfolding (index along its chain from the root). */
export function tailState(
  index: number,
  p: number,
  start = META_UNITAS_BEATS.tail[0],
  step = 0.024,
) {
  const at = start + index * step;
  return smoothstep(at, at + 0.04, p);
}

/** ウルトラ's local clock (0 … 1) at p. */
export const ultraClock = (p: number) =>
  clamp01(
    (p - META_UNITAS_BEATS.ultra[0]) / (META_UNITAS_BEATS.ultra[1] - META_UNITAS_BEATS.ultra[0]),
  );

/** A body plate turning over into its crystal counterpart (u: ウルトラ's clock). */
export function flipState(order: number, u: number) {
  const start = 0.04 + order * 0.5;
  return clamp01((u - start) / 0.16);
}

/** Which call (0 … 4) is lit at p, and how many of the four SA-GA！DEUS！. */
export function callsAt(p: number) {
  let line = -1;
  let chant = 0;
  META_UNITAS_CALL_CUES.forEach((cue, index) => {
    const first = typeof cue === "number" ? cue : cue[0];
    if (p >= first) line = index;
    if (typeof cue !== "number") chant = cue.filter((at) => p >= at).length;
  });
  return { line, chant };
}
