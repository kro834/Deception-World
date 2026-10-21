// The CPU kernel: the same fire as the fragment shader, pixel by pixel,
// at a small resolution. It is the fallback when WebGL is unavailable or
// lost, and the oracle the unit tests inspect. No allocation per frame:
// every sample lands in module-level scratch.
import {
  BODY_ASPECT,
  FIELD_D,
  FIELD_LIFT,
  FIELD_H,
  FIELD_IN,
  FIELD_W,
  FIRE_RECT,
  sampleFireField,
} from "./fire-field.js";
import { NOISE_SIZE, sampleNoise } from "./fire-noise.js";
import {
  POSE_BURST,
  POSE_COVER,
  POSE_DETAIL,
  POSE_EDGE,
  POSE_FLASH,
  POSE_FLICKER,
  POSE_FLOW_A,
  POSE_FLOW_B,
  POSE_FLOW_S,
  POSE_LOCAL,
  POSE_MIX,
  POSE_PATCH,
  POSE_REACH,
  POSE_RING_RADIUS,
  POSE_RING_STRENGTH,
  POSE_STRENGTH,
  POSE_WARP,
} from "./fire-pose.js";
import { FIRE_TUNING as T, RAMP_CLEAN, RAMP_SOOTY } from "./fire-tuning.js";

export const RASTER_W = 96;
export const RASTER_H = 150;
export const RASTER_TOUCH_W = 64;
export const RASTER_TOUCH_H = 100;

const RX = FIRE_RECT.x;
const RY = FIRE_RECT.y * BODY_ASPECT;
const RW = FIRE_RECT.width;
const RH = FIRE_RECT.height * BODY_ASPECT;
const flatten = (stops) => {
  const out = new Float64Array(stops.length * 4);
  for (let i = 0; i < stops.length; i += 1) out.set(stops[i], i * 4);
  return out;
};
const SOOTY = flatten(RAMP_SOOTY);
const CLEAN = flatten(RAMP_CLEAN);
const FS = new Float64Array(4);
// Eight noise reads of a pixel, four channels each, in the shader's order:
// reach (0), flutter (4), tongues (8), turbulence (12), edge (16),
// flicker (20), sheet streaks (24), patch (28).
const NS = new Float64Array(32);
const C = new Float64Array(6);

const clamp = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const ramp = (stops, t, out, at) => {
  let r = stops[1];
  let g = stops[2];
  let b = stops[3];
  for (let i = 4; i < stops.length; i += 4) {
    const k = smoothstep(stops[i - 4], stops[i], t);
    r += (stops[i + 1] - r) * k;
    g += (stops[i + 2] - g) * k;
    b += (stops[i + 3] - b) * k;
  }
  out[at] = r;
  out[at + 1] = g;
  out[at + 2] = b;
};

/**
 * Evaluates the fire at rect coordinates (u, v in 0..1, v down) for the
 * pose: writes premultiplied emission and alpha of the back layer into
 * out[0..3] and of the front layer into out[4..7]. Line for line the
 * fragment shader of fire-shaders.js.
 */
export function fireKernel(u0, v0, pose, field, noise, out) {
  const expand = 1 + T.burstExpand * pose[POSE_BURST];
  const u = T.burstCentreU + (u0 - T.burstCentreU) / expand;
  const v = T.burstCentreV + (v0 - T.burstCentreV) / expand;
  sampleFireField(field, FIELD_W, FIELD_H, u, v, FS, 0);
  const d = FS[0] * FIELD_D;
  const arrival = FS[1];
  const lift = FS[2] * FIELD_LIFT;
  const din = FS[3] * FIELD_IN;
  const skin = 1 - smoothstep(-T.edgeSoft, T.edgeSoft, d - din);
  const air = 1 - skin;
  const pwx = RX + u * RW;
  const pwy = RY + v * RH;
  const cover = pose[POSE_COVER];
  const m = pose[POSE_MIX];
  const b = pose[POSE_BURST];
  // Height above the burning surface and the plume's drifting reach.
  const height =
    (Math.min(lift, d * T.sideWeight) + Math.max(0, pwy - BODY_ASPECT) * T.floorWeight) * air;
  sampleNoise(
    noise,
    NOISE_SIZE,
    pwx * T.reachScale,
    pwy * T.reachScale * 0.5 + pose[POSE_REACH],
    NS,
    0,
  );
  const column = (pwx - 0.5) * (1 / T.columnWidth);
  const reach =
    (T.reachBase + T.reachVar * NS[0]) *
    (1 + T.columnBoost * Math.exp(-column * column)) *
    (1 + T.burstReach * b);
  const fall = clamp(height / reach);
  // The rise: two layers flowing up at different speeds, accelerating
  // through a static remapping of height, with a flutter toward the tips.
  sampleNoise(
    noise,
    NOISE_SIZE,
    pwx * T.warpScale,
    pwy * T.warpScale * 0.5 + pose[POSE_WARP],
    NS,
    4,
  );
  const flutter = (NS[4] - 0.5) * T.warpAmp * (T.warpBase + fall);
  const rise =
    pwy + height - Math.log(1 + T.accel * height) * (1 / T.accel) + (NS[5] - 0.5) * T.warpLift;
  sampleNoise(
    noise,
    NOISE_SIZE,
    (pwx + flutter) * T.scaleA,
    rise * (T.scaleA / T.stretchA) + pose[POSE_FLOW_A],
    NS,
    8,
  );
  sampleNoise(
    noise,
    NOISE_SIZE,
    (pwx + flutter * 1.4) * T.scaleB + 0.31,
    rise * (T.scaleB / T.stretchB) + pose[POSE_FLOW_B],
    NS,
    12,
  );
  const nB = pose[POSE_DETAIL] > 0.5 ? NS[13] * 0.55 + NS[14] * 0.45 : NS[13];
  const n = ((NS[8] * 0.62 + NS[9] * 0.38) * 0.68 + nB * 0.32 - 0.5) * T.gain + 0.5;
  // The engulf front, its branching edge and the tongues licking past it.
  sampleNoise(noise, NOISE_SIZE, pwx * T.edgeScale, pwy * T.edgeScale + pose[POSE_EDGE], NS, 16);
  const edge = NS[16] * 0.6 + NS[17] * 0.4 - 0.5;
  const aEff = arrival + edge * T.edgeAmp - Math.max(0, n - 0.5) * T.tongueRise + height * T.climb;
  const fresh = clamp((cover - aEff) / T.frontWidth);
  const lit = fresh * fresh * (3 - 2 * fresh);
  const age = clamp((cover - aEff) / T.ageSpan);
  const mLocal = m * (age + (1 - age) * m * m);
  const flare = 1 + T.flareGain * lit * (1 - lit) * (1 - mLocal);
  // Flicker.
  sampleNoise(noise, NOISE_SIZE, pwx * T.localScale, pwy * T.localScale + pose[POSE_LOCAL], NS, 20);
  const calm = 1 - 0.6 * mLocal;
  const flick =
    (1 + calm * pose[POSE_FLICKER]) *
    (1 - T.flickerLocal * 0.5 * calm + T.flickerLocal * calm * NS[21]);
  // Plume, rim and sheet.
  const thr = T.thrBase + (T.thrTop - T.thrBase) * Math.pow(fall, T.thrCurve);
  const core = smoothstep(thr, thr + T.coreSoft, n);
  const halo = smoothstep(thr - T.haloSoft, thr + T.coreSoft, n);
  const plume =
    (core * T.coreWeight + halo * (1 - T.coreWeight)) * air * (1 - smoothstep(T.tipFade, 1, fall));
  const plumeHeat = (0.4 + 0.6 * clamp((n - thr) / T.hotSpan)) * (1 - T.tipCool * fall);
  // The sheet on the skin is torn off first; the tongues fly on.
  const bare = 1 - smoothstep(0, T.burstSkin, b);
  const rim = Math.exp(-din / T.rimWidth) * skin * (0.3 + 0.7 * smoothstep(0.3, 0.75, n)) * bare;
  sampleNoise(
    noise,
    NOISE_SIZE,
    pwx * T.scaleS + 0.53,
    pwy * (T.scaleS / T.stretchS) + pose[POSE_FLOW_S],
    NS,
    24,
  );
  const nS =
    ((NS[25] * 0.6 + NS[26] * 0.4) * T.sheetStreak +
      (NS[8] * 0.62 + NS[9] * 0.38) * (1 - T.sheetStreak) -
      0.5) *
      T.gain +
    0.5;
  const sheet =
    (T.sheetHaze + (1 - T.sheetHaze) * smoothstep(T.sheetThr, T.sheetThr + T.sheetSoft, nS)) *
    skin *
    bare;
  const dissolve = 1 - smoothstep(0, T.burstDissolve, b);
  const dens = Math.min(1, plume + rim * T.rimGain + sheet * T.sheetGain) * lit * dissolve;
  // Temperature and colour.
  sampleNoise(noise, NOISE_SIZE, pwx * T.patchScale, pwy * T.patchScale + pose[POSE_PATCH], NS, 28);
  const patch = 1 - T.patchAmp + T.patchAmp * NS[28];
  const temp = clamp(
    (plume * plumeHeat + rim * T.rimHeat + sheet * T.sheetHeat) * lit * flare * flick * patch,
  );
  ramp(SOOTY, temp, C, 0);
  ramp(CLEAN, temp, C, 3);
  const cr = C[0] + (C[3] - C[0]) * mLocal;
  const cg = C[1] + (C[4] - C[1]) * mLocal;
  const cb = C[2] + (C[5] - C[2]) * mLocal;
  const emit = clamp(dens * flick);
  const strength = pose[POSE_STRENGTH];
  const absorbUnit = dens * (1 - 0.5 * temp) * (T.absorbSooty * (1 - mLocal) + T.absorbClean);
  for (let layer = 0; layer < 2; layer += 1) {
    const share = layer ? T.frontShare * skin : 1 - T.frontShare * skin;
    let er = cr * emit * share;
    let eg = cg * emit * share;
    let eb = cb * emit * share;
    if (!layer) {
      const bloom = pose[POSE_FLASH] * Math.exp(-d / T.flashReach) * T.flashGain;
      er += 0.75 * bloom;
      eg += 0.92 * bloom;
      eb += bloom;
      const ringW = T.ringWidth + T.ringWiden * b;
      const rd = (d - pose[POSE_RING_RADIUS]) / ringW;
      const ring =
        d >= 0.001 ? Math.exp(-rd * rd) * pose[POSE_RING_STRENGTH] * (0.3 + 0.9 * NS[2]) : 0;
      er += (0.6 + 0.3 * ring) * ring * T.ringGain;
      eg += (0.85 + 0.12 * ring) * ring * T.ringGain;
      eb += ring * T.ringGain;
    }
    er = Math.min(1, er * strength);
    eg = Math.min(1, eg * strength);
    eb = Math.min(1, eb * strength);
    const maxE = Math.max(er, Math.max(eg, eb));
    const absorb = Math.min(1, absorbUnit * share * strength);
    const k = layer * 4;
    out[k] = er;
    out[k + 1] = eg;
    out[k + 2] = eb;
    out[k + 3] = maxE > absorb ? maxE : absorb;
  }
}

const PIXEL = new Float64Array(8);

/**
 * Rasterizes both layers of a w×h fire into two straight-alpha RGBA byte
 * buffers (ImageData.data): back and front.
 */
export function rasterFire(pose, field, noise, w, h, back, front) {
  for (let y = 0; y < h; y += 1) {
    const v = (y + 0.5) / h;
    for (let x = 0; x < w; x += 1) {
      fireKernel((x + 0.5) / w, v, pose, field, noise, PIXEL);
      const k = (y * w + x) * 4;
      for (let layer = 0; layer < 2; layer += 1) {
        const at = layer * 4;
        const alpha = PIXEL[at + 3];
        const target = layer ? front : back;
        if (alpha <= 0.002) {
          target[k] = target[k + 1] = target[k + 2] = target[k + 3] = 0;
          continue;
        }
        target[k] = Math.round((PIXEL[at] / alpha) * 255);
        target[k + 1] = Math.round((PIXEL[at + 1] / alpha) * 255);
        target[k + 2] = Math.round((PIXEL[at + 2] / alpha) * 255);
        target[k + 3] = Math.round(alpha * 255);
      }
    }
  }
}
