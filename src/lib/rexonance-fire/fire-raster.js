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
  TEAR_LINES,
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
  POSE_TEAR_GLOW,
  POSE_TEAR_OPEN,
  POSE_TONE,
  POSE_VIEW_X0,
  POSE_VIEW_X1,
  POSE_VIEW_Y0,
  POSE_VIEW_Y1,
  POSE_WARP,
} from "./fire-pose.js";
import { FIRE_TUNING as T, RAMP_CLEAN, RAMP_GOLD, RAMP_SOOTY, TONE_TINTS } from "./fire-tuning.js";

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
const GOLD = flatten(RAMP_GOLD);
// The detonation's tints by tone (TONE_TINTS), each as its clean value and
// the gold value's difference from it: a tint at tone τ is clean + diff × τ,
// so at tone 0 it is the clean literal itself (clean + diff × 0 = clean).
const tint = (name, k) => TONE_TINTS[name][0][k];
const tintDiff = (name, k) => TONE_TINTS[name][1][k] - TONE_TINTS[name][0][k];
const FLASH = Float64Array.of(tint("flash", 0), tint("flash", 1), tint("flash", 2));
const FLASH_D = Float64Array.of(tintDiff("flash", 0), tintDiff("flash", 1), tintDiff("flash", 2));
const RING_B = Float64Array.of(tint("ringBase", 0), tint("ringBase", 1), tint("ringBase", 2));
const RING_BD = Float64Array.of(
  tintDiff("ringBase", 0),
  tintDiff("ringBase", 1),
  tintDiff("ringBase", 2),
);
const RING_S = Float64Array.of(tint("ringSlope", 0), tint("ringSlope", 1), tint("ringSlope", 2));
const RING_SD = Float64Array.of(
  tintDiff("ringSlope", 0),
  tintDiff("ringSlope", 1),
  tintDiff("ringSlope", 2),
);
const TEAR_W = Float64Array.of(tint("tearWhite", 0), tint("tearWhite", 1), tint("tearWhite", 2));
const TEAR_WD = Float64Array.of(
  tintDiff("tearWhite", 0),
  tintDiff("tearWhite", 1),
  tintDiff("tearWhite", 2),
);
const TEAR_H = Float64Array.of(tint("tearHalo", 0), tint("tearHalo", 1), tint("tearHalo", 2));
const TEAR_HD = Float64Array.of(
  tintDiff("tearHalo", 0),
  tintDiff("tearHalo", 1),
  tintDiff("tearHalo", 2),
);
const FS = new Float64Array(4);
// Eight noise reads of a pixel, four channels each, by slot:
// reach (0), flutter (4), tongues (8), turbulence (12), edge (16),
// flicker (20), sheet streaks (24), patch (28).
const NS = new Float64Array(32);
// The ramps' colours of a pixel: sooty (0), clean (3), gold (6).
const C = new Float64Array(9);
// The tears' static noise read.
const NT = new Float64Array(4);

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

/** The distance (figure widths) from (px, py) to the nearest tear, its
 * line moved across by `jag`, each tear tapering to nothing over its ends:
 * the shader's tearGap, path by path. */
export function tearGap(px, py, jag) {
  let best = 1e9;
  for (let k = 0; k < TEAR_LINES.length; k += 4) {
    const qx = px - TEAR_LINES[k];
    const qy = py - TEAR_LINES[k + 1];
    const rx = TEAR_LINES[k + 2];
    const ry = TEAR_LINES[k + 3];
    const length2 = rx * rx + ry * ry;
    const along = (qx * rx + qy * ry) / length2;
    const across = (qx * ry - qy * rx) / Math.sqrt(length2);
    const ends =
      smoothstep(-0.02, T.tearEnds, along) * (1 - smoothstep(1 - T.tearEnds, 1.02, along));
    const gap = Math.abs(across + jag) / Math.max(ends, 0.001);
    if (gap < best) best = gap;
  }
  return best;
}

/**
 * Evaluates the fire at rect coordinates (u, v in 0..1, v down) for the
 * pose: writes premultiplied emission and alpha of the back layer into
 * out[0..3] and of the front layer into out[4..7]. Line for line the
 * fragment shader of fire-shaders.js.
 */
export function fireKernel(u0, v0, pose, field, noise, out) {
  // 爆散: the envelope is thrown outward, fastest at the detonation.
  const thrownAt = clamp(pose[POSE_BURST] / T.burstDissolve);
  const thrown = 1 - (1 - thrownAt) * (1 - thrownAt);
  const u = T.burstCentreU + (u0 - T.burstCentreU) / (1 + T.burstExpand * thrown);
  const v = T.burstCentreV + (v0 - T.burstCentreV) / (1 + T.burstExpandY * thrown);
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
  // The rising turbulence that rags the envelope and carries the tips.
  sampleNoise(
    noise,
    NOISE_SIZE,
    pwx * T.warpScale,
    pwy * T.warpScale * 0.5 + pose[POSE_WARP],
    NS,
    4,
  );
  // The plume's drifting reach.
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
    (T.reachBase + T.reachVar * NS[0]) * (1 + T.columnBoost * Math.exp(-column * column));
  // Height above the burning surface, its envelope ragged by that rising
  // turbulence: nothing at the skin, and less toward the tips, so a tip
  // never breaks off as a round bead far above the fire.
  const depth = pwy - BODY_ASPECT;
  const surface = Math.min(lift, d * T.sideWeight);
  const rag =
    (NS[6] * 0.55 + NS[5] * 0.3 + NS[7] * 0.15 - 0.5) *
    T.ragAmp *
    smoothstep(0, T.ragRoot, surface) *
    (1 - smoothstep(T.ragTop, 1, surface / reach));
  const height = Math.max(0, surface + rag) * air;
  // Under the soles the floor only thins the plume (its threshold); it
  // never enters the rise, so it never squeezes the turbulence into bands.
  const fall = clamp((height + Math.max(0, depth) * T.floorWeight * air) / reach);
  // The rise: two layers flowing up at different speeds, accelerating
  // through a static remapping of height, with a flutter toward the tips.
  const flutter = (NS[4] - 0.5 + (NS[6] - 0.5) * T.warpFine) * T.warpAmp * (T.warpBase + fall);
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
  // The sheet's own streaks: the flames racing up the skin.
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
  // The engulf front: its branching edge, the tongues of the fire below
  // licking up past it and the streaks racing ahead of it up the skin.
  sampleNoise(
    noise,
    NOISE_SIZE,
    pwx * T.edgeScale,
    pwy * T.edgeScale * T.edgeStretch + pose[POSE_EDGE],
    NS,
    16,
  );
  const edge = NS[16] * 0.5 + NS[17] * 0.3 + NS[18] * 0.2 - 0.5;
  const aEff =
    arrival +
    edge * T.edgeAmp -
    Math.max(0, n - 0.5) * T.tongueRise -
    Math.max(0, nS - 0.5) * T.frontLick +
    height * T.climb;
  const fresh = clamp((cover - aEff) / T.frontWidth);
  const lit = fresh * fresh * (3 - 2 * fresh);
  const age = clamp((cover - aEff) / T.ageSpan);
  const mLocal = m * (age + (1 - age) * m * m);
  const flare = 1 + T.flareGain * lit * (1 - lit) * (1 - mLocal);
  // Where the front is still kindling only the turbulence's peaks burn.
  const kindling = (1 - fresh) * (1 - fresh) * T.frontThr;
  // Flicker.
  sampleNoise(noise, NOISE_SIZE, pwx * T.localScale, pwy * T.localScale + pose[POSE_LOCAL], NS, 20);
  const calm = 1 - 0.6 * mLocal;
  const flick =
    (1 + calm * pose[POSE_FLICKER]) *
    (1 - T.flickerLocal * 0.5 * calm + T.flickerLocal * calm * NS[21]);
  // Plume, rim and sheet.
  const thr = T.thrBase + (T.thrTop - T.thrBase) * Math.pow(fall, T.thrCurve) + kindling;
  const core = smoothstep(thr, thr + T.coreSoft, n);
  const halo = smoothstep(thr - T.haloSoft, thr + T.coreSoft, n);
  // The blast tears the tongues' roots off the skin, ragged and soft.
  const tear = smoothstep(0, T.burstTear, b);
  const torn = smoothstep(0, T.burstTearDepth, d - din + (n - 0.5) * T.burstTearJag);
  const rooted = air * (1 + (torn - 1) * tear);
  // Nothing hangs under the soles: the floor fades the plume out, soft
  // and a little ragged, over a few pixels of any backing.
  const ground = 1 - smoothstep(T.floorFrom, T.floorTo, depth + (NS[18] - 0.5) * T.floorJag);
  const plume =
    (core * T.coreWeight + halo * (1 - T.coreWeight)) *
    rooted *
    ground *
    (1 - smoothstep(T.tipFade, 1, fall));
  const plumeHeat = (0.4 + 0.6 * clamp((n - thr) / T.hotSpan)) * (1 - T.tipCool * fall);
  // The sheet on the skin is torn off first; the tongues fly on.
  const bare = 1 - smoothstep(0, T.burstSkin, b);
  const rim = Math.exp(-din / T.rimWidth) * skin * (0.3 + 0.7 * smoothstep(0.3, 0.75, n)) * bare;
  const sheet =
    (T.sheetHaze +
      (1 - T.sheetHaze) *
        smoothstep(T.sheetThr + kindling, T.sheetThr + T.sheetSoft + kindling, nS)) *
    skin *
    bare;
  // The thrown fire fades before whichever edge of the drawing clips first.
  const sideIn = Math.min(u0 - pose[POSE_VIEW_X0], pose[POSE_VIEW_X1] - u0) * RW;
  const topIn = (v0 - pose[POSE_VIEW_Y0]) * RH;
  const bottomIn = (pose[POSE_VIEW_Y1] - v0) * RH;
  const inView =
    smoothstep(0, T.throwFadeSide, sideIn) *
    smoothstep(0, T.throwFadeTop, topIn) *
    smoothstep(0, T.throwFadeBottom, bottomIn);
  const dissolve = (1 - smoothstep(0, T.burstDissolve, b)) * (1 + (inView - 1) * tear);
  const dens = Math.min(1, plume + rim * T.rimGain + sheet * T.sheetGain) * lit * dissolve;
  // Temperature and colour.
  sampleNoise(noise, NOISE_SIZE, pwx * T.patchScale, pwy * T.patchScale + pose[POSE_PATCH], NS, 28);
  const patch = 1 - T.patchAmp + T.patchAmp * NS[28];
  const temp = clamp(
    (plume * plumeHeat + rim * T.rimHeat + sheet * T.sheetHeat) * lit * flare * flick * patch,
  );
  ramp(SOOTY, temp, C, 0);
  ramp(CLEAN, temp, C, 3);
  ramp(GOLD, temp, C, 6);
  // Complete combustion in the fire's end tone: clean, gold, or between
  // (clean + (gold − clean) × 0 is clean exactly).
  const tone = pose[POSE_TONE];
  const er0 = C[3] + (C[6] - C[3]) * tone;
  const eg0 = C[4] + (C[7] - C[4]) * tone;
  const eb0 = C[5] + (C[8] - C[5]) * tone;
  const cr = C[0] + (er0 - C[0]) * mLocal;
  const cg = C[1] + (eg0 - C[1]) * mLocal;
  const cb = C[2] + (eb0 - C[2]) * mLocal;
  const emit = clamp(dens * flick);
  const strength = pose[POSE_STRENGTH];
  const absorbUnit = dens * (1 - 0.5 * temp) * (T.absorbSooty * (1 - mLocal) + T.absorbClean);
  for (let layer = 0; layer < 2; layer += 1) {
    const share = layer ? T.frontShare * skin : 1 - T.frontShare * skin;
    let er = cr * emit * share;
    let eg = cg * emit * share;
    let eb = cb * emit * share;
    if (!layer) {
      const edgeWindow =
        smoothstep(0, T.edgeFadeSide, sideIn) *
        smoothstep(0, T.edgeFadeTop, topIn) *
        smoothstep(0, T.edgeFadeBottom, bottomIn);
      const bloom = pose[POSE_FLASH] * Math.exp(-d / T.flashReach) * T.flashGain * edgeWindow;
      // The flash and the ring in the end tone (TONE_TINTS): at tone 0 the
      // clean tints exactly.
      er += (FLASH[0] + FLASH_D[0] * tone) * bloom;
      eg += (FLASH[1] + FLASH_D[1] * tone) * bloom;
      eb += (FLASH[2] + FLASH_D[2] * tone) * bloom;
      const ringW = T.ringWidth + T.ringWiden * b;
      const rd = (d - pose[POSE_RING_RADIUS]) / ringW;
      const ring =
        d >= 0.001
          ? Math.exp(-rd * rd) * pose[POSE_RING_STRENGTH] * (0.3 + 0.9 * NS[2]) * edgeWindow
          : 0;
      er +=
        (RING_B[0] + RING_BD[0] * tone + (RING_S[0] + RING_SD[0] * tone) * ring) *
        ring *
        T.ringGain;
      eg +=
        (RING_B[1] + RING_BD[1] * tone + (RING_S[1] + RING_SD[1] * tone) * ring) *
        ring *
        T.ringGain;
      eb +=
        (RING_B[2] + RING_BD[2] * tone + (RING_S[2] + RING_SD[2] * tone) * ring) *
        ring *
        T.ringGain;
    } else if (pose[POSE_TEAR_GLOW] > 0) {
      // The tears of the 爆散, on the body itself (never thrown outward):
      // white-hot ragged lines along the fragments' birth paths, their
      // shape fixed on the body (noise at its own coordinates, no drift),
      // so a tear never writhes as it opens.
      sampleFireField(field, FIELD_W, FIELD_H, u0, v0, FS, 0);
      const body = 1 - smoothstep(-T.edgeSoft, T.edgeSoft, FS[0] * FIELD_D - FS[3] * FIELD_IN);
      const bx = RX + u0 * RW;
      const by = RY + v0 * RH;
      sampleNoise(noise, NOISE_SIZE, bx * T.tearScale, by * T.tearScale * T.tearStretch, NT, 0);
      const jag =
        (NT[0] - 0.5) * T.tearMeander + (NT[2] - 0.5) * T.tearJag + (NT[3] - 0.5) * T.tearJag * 0.5;
      const gap = tearGap(bx, by, jag);
      const width =
        (T.tearHair + (T.tearWidth - T.tearHair) * pose[POSE_TEAR_OPEN]) *
        (1 - T.tearPinch * 0.5 + T.tearPinch * NT[1]);
      const r = gap / width;
      const h = gap / T.tearHalo;
      const glow = pose[POSE_TEAR_GLOW] * body;
      const white = Math.exp(-r * r) * glow * T.tearGain;
      const cyan = Math.exp(-h * h) * glow * T.tearHaloGain;
      er += (TEAR_W[0] + TEAR_WD[0] * tone) * white + (TEAR_H[0] + TEAR_HD[0] * tone) * cyan;
      eg += (TEAR_W[1] + TEAR_WD[1] * tone) * white + (TEAR_H[1] + TEAR_HD[1] * tone) * cyan;
      eb += (TEAR_W[2] + TEAR_WD[2] * tone) * white + (TEAR_H[2] + TEAR_HD[2] * tone) * cyan;
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
