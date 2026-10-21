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
export const POSE_SLOTS = 10;

const clamp = (x) => Math.max(0, Math.min(1, x));

/** Fills `out` (POSE_SLOTS doubles) for a frame of the fire. */
export function poseFire(phase, strength, clock, detail, out) {
  const P = NANITE_FIRE_PHASES;
  const burst = clamp((phase - P.burstStart) / (P.burstEnd - P.burstStart));
  const bursting = phase >= P.burstStart;
  out[POSE_COVER] = naniteEngulf(phase);
  out[POSE_MIX] = naniteCombustion(phase);
  out[POSE_BURST] = burst;
  out[POSE_FLASH] = bursting ? Math.exp(-burst * FIRE_TUNING.flashDecay) : 0;
  out[POSE_RING_RADIUS] = burst * FIRE_TUNING.ringSpeed;
  out[POSE_RING_STRENGTH] = bursting ? Math.pow(1 - burst, 1.2) : 0;
  out[POSE_TIME] = clock;
  out[POSE_STRENGTH] = clamp(strength);
  out[POSE_DETAIL] = detail;
  out[POSE_PHASE] = phase;
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
