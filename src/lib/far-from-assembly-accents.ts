/** FAR FROM SAGA — the suit-up's own accents: the 光輪 (2026-10-22).
 *
 * The record's halo rings (「背後の光輪が正面への斬撃を収束させ」) open behind
 * the figure as its output ignites, hold while the forms run through, and
 * are gone by the time the runway ends on マックス (the Ultra segment's first
 * frame is the figure alone). The scene calls `back` behind the figure and
 * `front` over it, each frame, with the context in figure px
 * (src/lib/far-from-suit.ts, 693 x 1040): every ring is an ellipse whose
 * far half is drawn behind and near half in front, swept open from its top.
 *
 * Contracts (the Rexonance engine's): closed-form in the progress, so a
 * resting frame is the same however it was reached; nothing allocated in a
 * frame (the rings' geometry is typed arrays made once); no transform set.
 */

import { FAR_FROM_SUIT_SIZE } from "./far-from-stage.ts";

const TAU = Math.PI * 2;
const HALF = Math.PI / 2;
const clamp01 = (value: number) => (value < 0 ? 0 : value > 1 ? 1 : value);
const smooth = (u: number) => u * u * (3 - 2 * u);

/** The rings (shares of the figure's box): behind the shoulders, behind the
 * head, the outer ring; each with its tone. */
export const FAR_FROM_HALO_RINGS = Object.freeze([
  Object.freeze({ cu: 0.5, cv: 0.33, ru: 0.72, rv: 0.19, tone: 0 }),
  Object.freeze({ cu: 0.5, cv: 0.135, ru: 0.34, rv: 0.08, tone: 1 }),
  Object.freeze({ cu: 0.5, cv: 0.44, ru: 0.96, rv: 0.44, tone: 2 }),
]);

/** When the rings open, hold and fade (progress): with the ignition, and
 * gone before the form window ends (ASSEMBLY_BEATS.light, .form). */
export const FAR_FROM_HALO_WINDOW = Object.freeze({
  open: Object.freeze([0.895, 0.95] as const),
  fade: Object.freeze([0.955, 0.974] as const),
});

const TONES = [
  ["rgb(127 230 255)", "rgb(127 230 255 / 0.5)"],
  ["rgb(255 215 122)", "rgb(255 215 122 / 0.5)"],
  ["rgb(222 206 255)", "rgb(201 155 255 / 0.5)"],
] as const;

// The rings' geometry in figure px, made once: cx, cy, rx, ry per ring.
const RINGS = new Float64Array(FAR_FROM_HALO_RINGS.length * 4);
for (let i = 0; i < FAR_FROM_HALO_RINGS.length; i += 1) {
  const ring = FAR_FROM_HALO_RINGS[i];
  RINGS[i * 4] = ring.cu * FAR_FROM_SUIT_SIZE.width;
  RINGS[i * 4 + 1] = ring.cv * FAR_FROM_SUIT_SIZE.height;
  RINGS[i * 4 + 2] = ring.ru * FAR_FROM_SUIT_SIZE.width;
  RINGS[i * 4 + 3] = ring.rv * FAR_FROM_SUIT_SIZE.height;
}

/** A ring's sweep at `progress` (0 closed, 1 whole), ring `i` opening a
 * little after the one before it. */
export function farFromHaloSweep(progress: number, i: number): number {
  const [from, to] = FAR_FROM_HALO_WINDOW.open;
  const lag = i * 0.012;
  return smooth(clamp01((progress - from - lag) / (to - from)));
}

/** The rings' light at `progress` (1 while they hold, 0 once faded). */
export function farFromHaloLight(progress: number): number {
  const [from, to] = FAR_FROM_HALO_WINDOW.fade;
  return 1 - smooth(clamp01((progress - from) / (to - from)));
}

/* -- draw passes: allocation-free from here -- */

// One stroke of the arcs of ring `i` within [a0, a1] that lie in the far
// (upper) half or the near (lower) half.
const strokeHalf = (
  context: CanvasRenderingContext2D,
  i: number,
  a0: number,
  a1: number,
  near: boolean,
) => {
  const cx = RINGS[i * 4];
  const cy = RINGS[i * 4 + 1];
  const rx = RINGS[i * 4 + 2];
  const ry = RINGS[i * 4 + 3];
  context.beginPath();
  if (!near) {
    // The upper half: angles in [-π, 0].
    const s = a0 > -Math.PI ? a0 : -Math.PI;
    const e = a1 < 0 ? a1 : 0;
    if (e <= s) return false;
    context.ellipse(cx, cy, rx, ry, 0, s, e, false);
    return true;
  }
  let any = false;
  // The lower half's right side: [0, a1].
  if (a1 > 0) {
    context.ellipse(cx, cy, rx, ry, 0, 0, a1 < Math.PI ? a1 : Math.PI, false);
    any = true;
  }
  // ...and its left side, reached past the top: [a0 + 2π, π].
  if (a0 < -Math.PI) {
    const s = a0 + TAU;
    context.moveTo(cx + Math.cos(s) * rx, cy + Math.sin(s) * ry);
    context.ellipse(cx, cy, rx, ry, 0, s, Math.PI, false);
    any = true;
  }
  return any;
};

const drawRings = (
  context: CanvasRenderingContext2D,
  progress: number,
  near: boolean,
  width: number,
) => {
  const light = farFromHaloLight(progress);
  // (The inner ring opens first: closed, every ring is.)
  if (light <= 0 || farFromHaloSweep(progress, 0) <= 0) return;
  context.globalCompositeOperation = "lighter";
  context.lineCap = "round";
  for (let i = 0; i < FAR_FROM_HALO_RINGS.length; i += 1) {
    const sweep = farFromHaloSweep(progress, i);
    if (sweep <= 0) continue;
    const a0 = -HALF - sweep * Math.PI;
    const a1 = -HALF + sweep * Math.PI;
    const tone = TONES[FAR_FROM_HALO_RINGS[i].tone];
    const alpha = light * (near ? 1 : 0.6);
    if (!strokeHalf(context, i, a0, a1, near)) continue;
    context.globalAlpha = alpha * 0.16;
    context.lineWidth = width * 0.02;
    context.strokeStyle = tone[1];
    context.stroke();
    context.globalAlpha = alpha * 0.45;
    context.lineWidth = width * 0.007;
    context.stroke();
    context.globalAlpha = alpha;
    context.lineWidth = width * 0.0024;
    context.strokeStyle = tone[0];
    context.stroke();
  }
  context.globalAlpha = 1;
  context.globalCompositeOperation = "source-over";
};

/** The scene's accent hooks (RexonanceAssemblyConfig.accents). */
export const farFromAccents = Object.freeze({
  back(context: CanvasRenderingContext2D, progress: number, _calm: boolean, width: number) {
    drawRings(context, progress, false, width);
  },
  front(context: CanvasRenderingContext2D, progress: number, _calm: boolean, width: number) {
    drawRings(context, progress, true, width);
  },
});

/* -- end of the draw passes -- */
