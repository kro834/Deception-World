// The per-frame state both kernels consume, derived in closed form from the
// shared ignition phase: no simulation state, so scrubbing is exact.
import {
  NANITE_FIRE_FRAGMENTS,
  NANITE_FIRE_PHASES,
  fireFragmentPose,
  naniteCombustion,
  naniteEngulf,
} from "../rexonance-ignition.js";
import { FIRE_TUNING } from "./fire-tuning.js";

/** Slots of the pose buffer. */
export const POSE_COVER = 0;
export const POSE_MIX = 1;
export const POSE_BURST = 2;
export const POSE_FLASH = 3;
export const POSE_RING_RADIUS = 4;
export const POSE_RING_STRENGTH = 5;
export const POSE_TIME = 6;
export const POSE_STRENGTH = 7;
export const POSE_DETAIL = 8;
export const POSE_PHASE = 9;
// The part of the fire rect the destination canvas shows, in rect uv
// (x0, y0, x1, y1; the whole rect unless poseView narrows it): the flash
// and the ring fade out at whichever edge clips first, the rect's or the
// canvas's, so neither scene's canvas edge ever shows as a lit panel.
export const POSE_VIEW_X0 = 10;
export const POSE_VIEW_Y0 = 11;
export const POSE_VIEW_X1 = 12;
export const POSE_VIEW_Y1 = 13;
// The clock's drifts, each a constant speed times the clock wrapped into
// the noise's unit period (so no kernel ever sees a large time, and the
// GPU's precision never decides the look), and the global flicker.
export const POSE_FLOW_A = 14;
export const POSE_FLOW_B = 15;
export const POSE_WARP = 16;
export const POSE_REACH = 17;
export const POSE_EDGE = 18;
export const POSE_LOCAL = 19;
export const POSE_PATCH = 20;
export const POSE_FLICKER = 21;
export const POSE_FLOW_S = 22;
// The tears of the 爆散: how far open (0 a hairline, 1 tearWidth) and how
// bright (0 none) they are.
export const POSE_TEAR_OPEN = 23;
export const POSE_TEAR_GLOW = 24;
// The fire's end tone (fire-tuning.js FIRE_TONES): 0 clean cyan-blue, 1 gold.
export const POSE_TONE = 25;
export const POSE_SLOTS = 26;

const clamp = (x) => Math.max(0, Math.min(1, x));
const smooth = (x) => x * x * (3 - 2 * x);
const wrap = (x) => x - Math.floor(x);

/** Fills `out` (POSE_SLOTS doubles) for a frame of the fire. `tone` is the
 * fire's end tone (FIRE_TONES: 0 clean cyan-blue, the default; 1 gold). */
export function poseFire(phase, strength, clock, detail, out, tone = 0) {
  const P = NANITE_FIRE_PHASES;
  const T = FIRE_TUNING;
  const burst = clamp((phase - P.burstStart) / (P.burstEnd - P.burstStart));
  const bursting = phase >= P.burstStart;
  const t = Number.isFinite(clock) ? clock : 0;
  out[POSE_COVER] = naniteEngulf(phase);
  out[POSE_MIX] = naniteCombustion(phase);
  out[POSE_BURST] = burst;
  out[POSE_FLASH] = bursting ? Math.exp(-burst * T.flashDecay) : 0;
  out[POSE_RING_RADIUS] = burst * T.ringSpeed;
  out[POSE_RING_STRENGTH] = bursting ? Math.exp(-burst * T.ringDecay) * (1 - burst) : 0;
  out[POSE_TIME] = t;
  out[POSE_STRENGTH] = clamp(strength);
  out[POSE_DETAIL] = detail;
  out[POSE_PHASE] = phase;
  out[POSE_VIEW_X0] = 0;
  out[POSE_VIEW_Y0] = 0;
  out[POSE_VIEW_X1] = 1;
  out[POSE_VIEW_Y1] = 1;
  out[POSE_FLOW_A] = wrap((t * T.flowA * T.scaleA) / T.stretchA);
  out[POSE_FLOW_B] = wrap((t * T.flowB * T.scaleB) / T.stretchB);
  out[POSE_WARP] = wrap(t * T.warpSpeed);
  out[POSE_REACH] = wrap(t * T.reachSpeed);
  out[POSE_EDGE] = wrap(t * T.edgeSpeed);
  out[POSE_LOCAL] = wrap(t * T.localSpeed);
  out[POSE_PATCH] = wrap(t * T.patchSpeed);
  out[POSE_FLOW_S] = wrap((t * T.flowS * T.scaleS) / T.stretchS);
  out[POSE_FLICKER] = T.flickerGlobal * (Math.sin(t * 60.9) + 0.6 * Math.sin(t * 83.6 + 1.7));
  out[POSE_TEAR_OPEN] = bursting ? smooth(clamp(burst / T.tearOpen)) : 0;
  out[POSE_TEAR_GLOW] = bursting
    ? 1 - smooth(clamp((burst - T.tearHold) / (T.tearFade - T.tearHold)))
    : 0;
  out[POSE_TONE] = Number.isFinite(tone) ? clamp(tone) : 0;
  return out;
}

/** Narrows the pose's view to the visible part of the rect (rect uv,
 * clamped into it); an empty or non-finite view keeps the whole rect. */
export function poseView(out, x0, y0, x1, y1) {
  const a = clamp(x0);
  const b = clamp(y0);
  const c = clamp(x1);
  const d = clamp(y1);
  // NaN fails both comparisons; infinities clamp into the rect.
  const ok = c > a && d > b;
  out[POSE_VIEW_X0] = ok ? a : 0;
  out[POSE_VIEW_Y0] = ok ? b : 0;
  out[POSE_VIEW_X1] = ok ? c : 1;
  out[POSE_VIEW_Y1] = ok ? d : 1;
  return out;
}

/** Floats per fragment in the fragment buffer: x, y (rect uv), heat, size
 * (widths), direction x, y (widths per phase unit, y down). */
export const FRAGMENT_STRIDE = 6;
const fragmentScratch = new Float64Array(6);

/** Poses every burst fragment into `out` (NANITE_FIRE_FRAGMENTS * stride)
 * in the fire rect's uv space; returns the number of still-hot fragments.
 * `rect` is FIRE_RECT in normalized body units. */
export function poseFragments(phase, rect, out) {
  let hot = 0;
  for (let i = 0; i < NANITE_FIRE_FRAGMENTS; i += 1) {
    fireFragmentPose((i + 0.5) / NANITE_FIRE_FRAGMENTS, phase, fragmentScratch);
    const k = i * FRAGMENT_STRIDE;
    out[k] = (fragmentScratch[0] - rect.x) / rect.width;
    out[k + 1] = (fragmentScratch[1] - rect.y) / rect.height;
    out[k + 2] = fragmentScratch[4];
    out[k + 3] = fragmentScratch[5];
    out[k + 4] = fragmentScratch[2];
    out[k + 5] = fragmentScratch[3] * (1040 / 571);
    if (fragmentScratch[4] > 0) hot += 1;
  }
  return hot;
}
