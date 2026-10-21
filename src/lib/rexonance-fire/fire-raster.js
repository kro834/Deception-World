// The CPU kernel: the same fire as the fragment shader, pixel by pixel,
// at a small resolution. It is the fallback when WebGL is unavailable or
// lost, and the oracle the unit tests inspect. No allocation per frame:
// every sample lands in module-level scratch.
import {
  BODY_ASPECT,
  FIELD_D,
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
  POSE_FLASH,
  POSE_MIX,
  POSE_RING_RADIUS,
  POSE_RING_STRENGTH,
  POSE_STRENGTH,
  POSE_TIME,
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
const NS = new Float64Array(20);
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
 * out[0..3] and of the front layer into out[4..7].
 */
export function fireKernel(u, v, pose, field, noise, out) {
  sampleFireField(field, FIELD_W, FIELD_H, u, v, FS, 0);
  const d = FS[0] * FIELD_D;
  const arrival = FS[1];
  const lift = FS[2] * FIELD_D;
  const din = FS[3] * FIELD_IN;
  const skin = smoothstep(0, 0.02, FS[3]);
  const pwx = RX + u * RW;
  const pwy = RY + v * RH;
  const t = pose[POSE_TIME];
  const cover = pose[POSE_COVER];
  const m = pose[POSE_MIX];
  const b = pose[POSE_BURST];
  sampleNoise(noise, NOISE_SIZE, pwx * T.edgeScale, pwy * T.edgeScale + t * T.edgeSpeed, NS, 0);
  const aEff = arrival + (NS[1] - 0.5) * T.edgeAmp;
  const fresh = clamp((cover - aEff) / T.frontWidth);
  const lit = fresh * fresh * (3 - 2 * fresh);
  const age = clamp((cover - aEff) / T.ageSpan);
  const mLocal = m * (age + (1 - age) * m * m);
  const flare = 1 + 4 * lit * (1 - lit) * (1 - mLocal);
  const height = Math.min(Math.max(lift, d), d * T.sideWeight) * (1 - skin);
  sampleNoise(noise, NOISE_SIZE, pwx * 0.7, pwy * 0.7 + t * 0.3, NS, 4);
  const reach = (T.reachUp + T.reachUpNoise * NS[4]) * (1 + T.burstReach * b);
  const fall = clamp(height / reach);
  const speed = (T.flowBase + T.flowAccel * fall) * (1 - 0.3 * mLocal);
  const wx = pwx * T.warpScale;
  const wy = pwy * T.warpScale + t * T.warpSpeed;
  sampleNoise(noise, NOISE_SIZE, wx, wy, NS, 8);
  sampleNoise(noise, NOISE_SIZE, wx + 0.37, wy + 0.61, NS, 12);
  const wa = T.warpAmp * (1 - 0.5 * mLocal);
  const pnx = (pwx + (NS[8] - 0.5) * wa) * T.noiseScale;
  const pny = ((pwy + (NS[12] - 0.5) * wa) * T.noiseScale + t * speed * T.noiseScale) / T.stretch;
  sampleNoise(noise, NOISE_SIZE, pnx, pny, NS, 16);
  const nAll =
    pose[POSE_DETAIL] > 0.5
      ? NS[16] * 0.6 + NS[17] * 0.3 + NS[18] * 0.1
      : NS[16] * 0.7 + NS[17] * 0.3;
  const nLow = NS[16] * 0.6667 + NS[17] * 0.3333;
  const n = (nAll + (nLow - nAll) * 0.6 * mLocal - 0.5) * T.gain + 0.5;
  const shaped = n - (T.bias + (T.biasSkin - T.bias) * skin) - fall * T.fall;
  const soft = (T.softBase + (T.softTop - T.softBase) * fall) * (1 + 0.6 * mLocal);
  const dissolve = 1 - smoothstep(0, T.burstDissolve, b);
  const dens = smoothstep(0, soft, shaped) * lit * dissolve;
  sampleNoise(noise, NOISE_SIZE, pwx * T.localScale, pwy * T.localScale + t * T.localSpeed, NS, 0);
  const calm = 1 - 0.65 * mLocal;
  const flick =
    (1 + T.flickerGlobal * calm * (Math.sin(t * 60.9) + 0.6 * Math.sin(t * 83.6 + 1.7))) *
    (1 - T.flickerLocal * calm * 0.5 + T.flickerLocal * calm * NS[2]);
  sampleNoise(noise, NOISE_SIZE, pwx * T.patchScale, pwy * T.patchScale + t * T.patchSpeed, NS, 8);
  const rim = Math.exp(-(din + d) / T.rim) * T.rimGain;
  const temp = clamp(
    dens * (1 - T.tipCool * fall) * (1 - T.patch + T.patch * NS[11]) * flare * (1 + rim) * flick,
  );
  ramp(SOOTY, temp, C, 0);
  ramp(CLEAN, temp, C, 3);
  const cr = C[0] + (C[3] - C[0]) * mLocal;
  const cg = C[1] + (C[4] - C[1]) * mLocal;
  const cb = C[2] + (C[5] - C[2]) * mLocal;
  const emit = clamp(dens * flick * (1 + rim)) * (1 - 0.15 * mLocal);
  const strength = pose[POSE_STRENGTH];
  const absorbUnit = dens * (1 - 0.5 * temp) * (T.absorbSooty * (1 - mLocal) + T.absorbClean);
  for (let layer = 0; layer < 2; layer += 1) {
    const share = layer ? T.frontShare * skin : 1 - T.frontShare * skin;
    let er = cr * emit * share;
    let eg = cg * emit * share;
    let eb = cb * emit * share;
    if (!layer) {
      const bloom = pose[POSE_FLASH] * Math.exp(-d / T.flashReach) * 1.2;
      er += 0.75 * bloom;
      eg += 0.92 * bloom;
      eb += bloom;
      const ringW = T.ringWidth + T.ringWiden * b;
      const rd = (d - pose[POSE_RING_RADIUS]) / ringW;
      const ring =
        d > 0.001 ? Math.exp(-rd * rd) * pose[POSE_RING_STRENGTH] * (0.55 + 0.6 * NS[6]) : 0;
      er += (0.6 + 0.3 * ring) * ring * 0.9;
      eg += (0.85 + 0.12 * ring) * ring * 0.9;
      eb += ring * 0.9;
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
