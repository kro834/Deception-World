/** ILLUSIONCULUM SAGA — the red fire that carries every change into ウルトラ
 * (owner, 2026-11-20: 「イリュージョンクルムのウルトラへの切り替えも炎によって
 * 行います。…赤い炎」).
 *
 * The same language as FAR FROM's form ignition (far-from-form-combustion.ts,
 * far-from-flame-field.ts): the old form is engulfed from the soles up, the
 * fire peaks, the armour tears along its fissures and the Ultra form is
 * revealed from the flame while embers leave the armour that released them.
 * This is the page's own module (Far From's files stay untouched); it reuses
 * the shared pieces: the body field builder (rexonance-fire/fire-field.js)
 * and the periodic noise (far-from-fire-noise.ts).
 *
 * Differences from FAR FROM, all for this page:
 * - the body field is built at runtime from the source form's own cutout
 *   alpha (one 96 x 144 read, once per form, warmed in idle time before a
 *   change can start) instead of a baked mask table;
 * - the fissures follow this armour (crest, reactor, belt, limbs, cape);
 * - one red palette: deep crimson → scarlet → orange → an orange-white core.
 *   Its churn is slower than FAR FROM's and its crimson body stays dim and
 *   absorbing: the bright, saturated reds are thin threads, so no screen
 *   cell takes a rapid swing of saturated red (WCAG 2.3.1, no red flashes).
 *
 * Closed-form in `u` (forward, back and at rest draw the same moment), no
 * allocation in a frame (the raster and its ImageData are reused per
 * context), no filters or shadows.
 */

import { buildFireField, FIELD_D, FIELD_IN, FIELD_LIFT, FIRE_RECT } from "./rexonance-fire/fire-field.js";
import { fireGridStepped, fireRasterTook, sampleNoise } from "./far-from-fire-noise.ts";

// FAR FROM's field layout: the 96 x 144 cutout inside a 160 x 204 field with
// air above and beside it (the same FIRE_RECT scale, so the same kernel).
const MASK_WIDTH = 96;
const MASK_HEIGHT = 144;
const FW = 160;
const FH = 204;
const LEFT = 32;
const TOP = 48;
const cellCount = FW * FH;

export const IC_FIRE_BOUNDS = {
  left: -LEFT / MASK_WIDTH,
  top: -TOP / MASK_HEIGHT,
  width: FW / MASK_WIDTH,
  height: FH / MASK_HEIGHT,
} as const;
/** The raster's size: coarse on touch (as FAR FROM's FIRE_GRID). */
export const IC_FIRE_GRID = { desktop: [208, 266], touch: [160, 204] } as const;

const TAU = Math.PI * 2;
const clamp = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const ramp = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

export type IllusionculumFireBody = {
  surface: Float32Array;
  fissure: Float32Array;
  emitters: Float32Array;
};

// This armour's fissures in cutout units (x over width, y over height):
// crest to visor to reactor to belt, down each leg, out each arm, the cape's
// two hems and the halo's two spokes.
const FRACTURES = [
  [0.5, 0.05, 0.5, 0.2],
  [0.48, 0.2, 0.52, 0.29],
  [0.52, 0.29, 0.47, 0.44],
  [0.47, 0.44, 0.38, 0.66],
  [0.38, 0.66, 0.33, 0.93],
  [0.53, 0.45, 0.62, 0.66],
  [0.62, 0.66, 0.68, 0.93],
  [0.45, 0.27, 0.27, 0.3],
  [0.27, 0.3, 0.21, 0.53],
  [0.55, 0.27, 0.73, 0.29],
  [0.73, 0.29, 0.79, 0.53],
  [0.2, 0.62, 0.13, 0.88],
  [0.8, 0.6, 0.87, 0.86],
  [0.3, 0.08, 0.42, 0.15],
  [0.7, 0.08, 0.58, 0.15],
].map(([x, y, ex, ey]) => {
  const dx = ((ex - x) * 2) / 3;
  const dy = ey - y;
  return { x, y, dx, dy, length: Math.hypot(dx, dy) };
});

function fractureGap(i: number) {
  const x = ((i % FW) + 0.5 - LEFT) / MASK_WIDTH;
  const y = (((i / FW) | 0) + 0.5 - TOP) / MASK_HEIGHT;
  const jag = (sampleNoise(x * 14, y * 17) - 0.5) * 0.034 + (sampleNoise(x * 39, y * 53) - 0.5) * 0.012;
  let gap = 0.1;
  for (const branch of FRACTURES) {
    const px = ((x - branch.x) * 2) / 3;
    const py = y - branch.y;
    const along = (px * branch.dx + py * branch.dy) / (branch.length * branch.length);
    if (along < -0.03 || along > 1.03) continue;
    const taper = Math.max(0.05, Math.min(1, (along + 0.03) * 12, (1.03 - along) * 12));
    gap = Math.min(gap, Math.abs((px * branch.dy - py * branch.dx) / branch.length + jag) / taper);
  }
  return gap;
}

const bodies = new Map<string, IllusionculumFireBody>();

/** The cached field of a source form, or null before it is built. */
export function illusionculumFireBody(form: string) {
  return bodies.get(form) ?? null;
}

/** Builds (once) the field of `form` from its full-frame figure (any image
 * in the owner's 2:3 cutout frame). One small alpha read; never per frame.
 * The first build of a form is kept, so every later frame samples the same
 * field whatever image warmed it. */
export function buildIllusionculumFireBody(
  form: string,
  image: CanvasImageSource,
  document: Document,
): IllusionculumFireBody | null {
  const cached = bodies.get(form);
  if (cached) return cached;
  // Two halving steps before the last: one large canvas downscale skips
  // texels and leaves a jagged silhouette, which shows as stepped fire edges.
  const mid = document.createElement("canvas");
  mid.width = MASK_WIDTH * 4;
  mid.height = MASK_HEIGHT * 4;
  const half = document.createElement("canvas");
  half.width = MASK_WIDTH * 2;
  half.height = MASK_HEIGHT * 2;
  const canvas = document.createElement("canvas");
  canvas.width = MASK_WIDTH;
  canvas.height = MASK_HEIGHT;
  const midContext = mid.getContext("2d");
  const halfContext = half.getContext("2d");
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context || !midContext || !halfContext) return null;
  for (const c of [midContext, halfContext, context]) {
    c.imageSmoothingEnabled = true;
    c.imageSmoothingQuality = "high";
  }
  midContext.drawImage(image, 0, 0, mid.width, mid.height);
  halfContext.drawImage(mid, 0, 0, half.width, half.height);
  context.drawImage(half, 0, 0, MASK_WIDTH, MASK_HEIGHT);
  mid.width = mid.height = half.width = half.height = 0;
  let pixels: Uint8ClampedArray;
  try {
    pixels = context.getImageData(0, 0, MASK_WIDTH, MASK_HEIGHT).data;
  } catch {
    return null;
  }
  const alpha = new Uint8Array(cellCount);
  for (let y = 0; y < MASK_HEIGHT; y++)
    for (let x = 0; x < MASK_WIDTH; x++)
      alpha[(y + TOP) * FW + LEFT + x] = pixels[(y * MASK_WIDTH + x) * 4 + 3];
  const rgba = new Uint8Array(cellCount * 4);
  if (!buildFireField(alpha, FW, FH, rgba)) return null;
  const surface = new Float32Array(cellCount * 3);
  const fissure = new Float32Array(cellCount);
  const scale = FW / FIRE_RECT.width / MASK_HEIGHT / 255;
  const origins: number[] = [];
  for (let i = 0; i < cellCount; i++) {
    const d = (rgba[i * 4] * FIELD_D - rgba[i * 4 + 3] * FIELD_IN) * scale;
    surface[i * 3] = d;
    surface[i * 3 + 1] = rgba[i * 4 + 1] / 255;
    surface[i * 3 + 2] = rgba[i * 4 + 2] * FIELD_LIFT * scale;
    if (d > 0.007) {
      fissure[i] = 0.1;
      continue;
    }
    const gap = fractureGap(i);
    fissure[i] = gap + Math.max(0, d) * 3;
    if (d < 0 && gap < 0.006)
      origins.push(
        ((i % FW) + 0.5 - LEFT) / MASK_WIDTH,
        (((i / FW) | 0) + 0.5 - TOP) / MASK_HEIGHT,
        surface[i * 3 + 1],
      );
  }
  // A silhouette without a fissure under it still sheds embers from its rim.
  if (!origins.length) origins.push(0.5, 0.3, 0.5);
  const body = { surface, fissure, emitters: Float32Array.from(origins) };
  bodies.set(form, body);
  return body;
}

// Deep crimson → scarlet → orange → orange-white. The cool end is dark and
// mostly absorbing; the saturated scarlet sits in the middle of the ramp,
// where only the thin hot threads reach it.
const THERMAL = [
  [20, 4, 8],
  [100, 9, 21],
  [184, 18, 34],
  [234, 42, 40],
  [255, 110, 62],
  [255, 214, 172],
] as const;
const palette = new Uint32Array(256);
{
  const bytes = new Uint8ClampedArray(palette.buffer);
  for (let k = 0; k < 256; k++) {
    // Most of the burn sits in crimson and scarlet; only the hottest
    // threads climb into orange and the orange-white core.
    const z = 5 * (k / 255) ** 1.3;
    const a = Math.min(4, Math.floor(z));
    const t = z - a;
    for (let c = 0; c < 3; c++) bytes[k * 4 + c] = THERMAL[a][c] * (1 - t) + THERMAL[a + 1][c] * t;
    bytes[k * 4 + 3] = 255;
  }
}

/** The burning armour, adapted from FAR FROM's kernel (far-from-flame-field.ts
 * rasterFarFromFire): the same optical-depth sheet, tongues, peel and tears,
 * one red palette and a slower churn. */
function rasterFire(
  pixels: Uint32Array,
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  u: number,
  body: IllusionculumFireBody,
) {
  const { surface, fissure } = body;
  const burst = ramp(0.49, 0.85, u);
  const liftOff = ramp(0.49, 0.67, u);
  // A slow rise and a slow fall: the burn is sustained, never a pulse.
  const fade = ramp(0, 0.16, u) * (1 - ramp(0.56, 0.9, u));
  const spread = 1.24 * ramp(0.002, 0.3, u);
  // The tears glow and cool over a long stretch (no short pulse of red).
  const tearGlow = 0.8 * ramp(0.36, 0.52, u) * (1 - ramp(0.56, 0.8, u));
  const complete = ramp(0.22, 0.44, u);
  const invW = 1 / (1 + 0.68 * burst);
  const invH = 1 / (1 + 0.23 * burst);
  const at = u * 6.2;
  const attached = 1 - liftOff;
  // (2026-11-23: the same picture for less work, so a phone can draw the
  // desktop grid. Every shortcut below leaves each pixel's value exactly as
  // the full expression gives it: only terms multiplied by an exact 0 are
  // skipped.)
  // Before the fire has risen and after it has faded, with no tears glowing,
  // every density is 0: nothing is drawn.
  if (fade === 0 && !(tearGlow > 0)) {
    pixels.fill(0, 0, width * height);
    return;
  }
  for (let row = 0, i = 0; row < height; row++) {
    const fy = IC_FIRE_BOUNDS.top + ((row + 0.5) * IC_FIRE_BOUNDS.height) / height;
    const y = 0.39 + (fy - 0.39 + 0.066 * burst) * invH;
    const trimY = ramp(IC_FIRE_BOUNDS.top, -0.27, fy) * (1 - ramp(0.997, 1.075, fy));
    // A row the trim takes whole.
    if (trimY === 0) {
      pixels.fill(0, i, i + width);
      i += width;
      continue;
    }
    const gy = Math.max(0, Math.min(FH - 1.001, y * MASK_HEIGHT + TOP - 0.5));
    const sy = gy | 0;
    const ty = gy - sy;
    const by = Math.max(0, Math.min(FH - 1.001, fy * MASK_HEIGHT + TOP - 0.5));
    const bodyRow = (by | 0) * FW;
    const bodyTy = by - (by | 0);
    for (let col = 0; col < width; col++, i++) {
      const fx = IC_FIRE_BOUNDS.left + ((col + 0.5) * IC_FIRE_BOUNDS.width) / width;
      const x = 0.5 + (fx - 0.5) * invW;
      const gx = Math.max(0, Math.min(FW - 1.001, x * MASK_WIDTH + LEFT - 0.5));
      const sx = gx | 0;
      const tx = gx - sx;
      const fi = 3 * (sy * FW + sx);
      const low = fi + 3 * FW;
      const ul = (1 - tx) * (1 - ty);
      const ur = tx * (1 - ty);
      const ll = (1 - tx) * ty;
      const lr = tx * ty;
      const d = surface[fi] * ul + surface[fi + 3] * ur + surface[low] * ll + surface[low + 3] * lr;
      const arrival =
        surface[fi + 1] * ul + surface[fi + 4] * ur + surface[low + 1] * ll + surface[low + 4] * lr;
      const lift = surface[fi + 2] * ul + surface[fi + 5] * ur + surface[low + 2] * ll + surface[low + 5] * lr;
      const heightOff = Math.min(lift, Math.max(0, d) * 2.55);
      if (heightOff > 0.46 || arrival > spread + 0.17) {
        pixels[i] = 0;
        continue;
      }
      // 1 inside the armour, 0 in the air, between them only on its edge.
      const skin = 1 - ramp(-0.005, 0.005, d);
      // Inside the armour only the attached sheet and the tears draw.
      if (skin === 1 && attached === 0 && !(tearGlow > 0)) {
        pixels[i] = 0;
        continue;
      }
      const q = sampleNoise(x * 5.3 + 17, y * 3.2 + at);
      const roll = sampleNoise(x * 8.4 + q * 2.1 + 41, y * 5.1 + at * 1.2);
      const reach = 0.15 + 0.14 * q + 0.074 * (1 - Math.min(1, Math.abs(x - 0.5) * 2));
      const fall = clamp(heightOff / reach);
      const flutter = (q - 0.5) * (0.092 + 0.36 * fall) + (roll - 0.5) * (0.056 + 0.15 * fall);
      const rise = y + heightOff * fall * 0.39 + (roll - 0.5) * 0.054;
      const shear = sampleNoise((x + flutter) * 19 + roll * 2.65, rise * 5.5 + at * 1.5);
      const detail = sampleNoise((x + flutter * 1.34) * 41 + shear * 3.7, rise * 13 + at * 2.13);
      const fine = sampleNoise(x * 74 + shear * 6 + detail * 4.4, y * 30 + at * 2.75);
      const draft = (shear * 0.58 + detail * 0.26 + roll * 0.16 - 0.5) * 1.85 + 0.5;
      const sheetFlow = detail * 0.45 + shear * 0.21 + fine * 0.25 + q * 0.09;
      const fresh = ramp(
        -0.018,
        0.14,
        spread - arrival + (q - 0.5) * 0.17 + (draft - 0.4) * 0.08 - heightOff * 0.64,
      );
      if (!fresh) {
        pixels[i] = 0;
        continue;
      }
      const clean = complete * ramp(0, 0.3, spread - arrival);
      const fold = shear + 0.35 * detail + 0.12 * fine;
      const lip = 1 - ramp(0.013, 0.084, Math.abs(fold - 0.73));
      const channel = 1 - ramp(0.018, 0.13, Math.abs(fold - 0.615));
      let density: number;
      let temp: number;
      let plume = 0;
      let strand = 0;
      if (skin === 1) {
        // The armour's own surface: the sheet and its rim (no plume).
        const rim = (1 - ramp(0.002, 0.023, -d)) * (0.42 + 0.58 * ramp(0.27, 0.72, draft));
        const sheet = 0.26 + 0.21 * clean + (0.69 - 0.16 * clean) * ramp(0.35, 0.71, sheetFlow);
        density = (sheet * 0.89 + rim * 0.56) * attached * fresh * fade;
        temp = (sheet * (0.32 + 0.3 * sheetFlow + 0.5 * lip - 0.34 * channel) + rim * 0.5) * attached;
      } else {
        const rim =
          skin === 0
            ? 0
            : skin * (1 - ramp(0.002, 0.023, -d)) * (0.42 + 0.58 * ramp(0.27, 0.72, draft));
        const sheet =
          skin === 0
            ? 0
            : skin * (0.26 + 0.21 * clean + (0.69 - 0.16 * clean) * ramp(0.35, 0.71, sheetFlow));
        const billow = sampleNoise(x * 40 + shear * 5.5 + roll * 4.3, y * 21 + detail * 4.1 + at * 2.35);
        const strands = shear * 0.42 + detail * 0.29 + billow * 0.2 + fine * 0.09;
        const curledEdge = 1 - ramp(0.012, 0.094, Math.abs(strands - 0.58));
        const threshold = 0.3 + 0.62 * fall + (1 - fresh) * 0.3;
        const core = ramp(threshold, threshold + 0.22, draft);
        const halo = ramp(threshold - 0.18, threshold + 0.21, draft);
        const below = Math.max(0, (surface[low] - surface[fi]) * MASK_HEIGHT);
        const heel = ramp(0.84, 0.945, y) * clamp(below * 1.2);
        const ground = 1 - heel * ramp(0.001, 0.035, d + (roll - 0.5) * 0.019);
        const peel = 1 - liftOff + liftOff * ramp(-0.001, 0.073, d + (shear - 0.5) * 0.085);
        strand = (1 - ramp(0.009, 0.06, Math.abs(strands - 0.595))) * ramp(0.34, 0.72, shear);
        const breakup =
          1 - liftOff * (0.34 + 0.6 * ramp(0.29, 0.71, billow * 0.52 + fine * 0.48)) * (1 - 0.84 * strand);
        const depth = 0.19 + 0.37 * ramp(0.22, 0.8, strands) + 0.44 * curledEdge;
        plume =
          (1 - skin) *
          (0.69 * core + 0.31 * halo) *
          depth *
          (1 - 0.42 * fall) *
          (1 - ramp(0.71, 1, fall)) *
          ground *
          peel *
          breakup;
        density = (plume * (1 + 0.4 * liftOff * strand) + (sheet * 0.89 + rim * 0.56) * attached) * fresh * fade;
        temp =
          (0.23 + 0.39 * strands + 0.42 * curledEdge + 0.15 * lip - 0.22 * channel - 0.16 * fall) *
            (1 - skin) *
            (0.45 + 0.55 * core) +
          (sheet * (0.32 + 0.3 * sheetFlow + 0.5 * lip - 0.34 * channel) + rim * 0.5) * attached;
      }
      temp = temp * (0.92 + 0.17 * clean) + 0.055 * fresh;
      if (tearGlow > 0) {
        // The fissures glow on the old armour while its fire flies outward.
        const bx = Math.max(0, Math.min(FW - 1.001, fx * MASK_WIDTH + LEFT - 0.5));
        const cell = bodyRow + (bx | 0);
        const bodyTx = bx - (bx | 0);
        const upper = fissure[cell] * (1 - bodyTx) + fissure[cell + 1] * bodyTx;
        const lower = fissure[cell + FW] * (1 - bodyTx) + fissure[cell + FW + 1] * bodyTx;
        const gap = upper * (1 - bodyTy) + lower * bodyTy;
        const crack = tearGlow * (1 - ramp(0.002, 0.008 + 0.009 * tearGlow, gap));
        temp += crack;
        density += crack * 0.87;
      }
      const trimX = Math.min(1, col / (width * 0.045), (width - 1 - col) / (width * 0.045));
      const temperature = clamp(temp + 0.19 * liftOff * strand * plume);
      // Emission and absorption, as in FAR FROM's kernel: the cool crimson
      // gas mostly darkens what is behind it; hot threads glow through.
      const emission = clamp(density * (0.4 + temperature * 0.7));
      const absorption = clamp(density * (0.26 + 0.25 * (1 - clean) + 0.51 * (1 - temperature)));
      const weight = Math.max(emission, absorption);
      const opacity = weight * trimY * trimX;
      if (opacity <= 0.004) {
        pixels[i] = 0;
        continue;
      }
      pixels[i] = palette[(temperature * 255) | 0];
      if (absorption > emission) {
        const transmission = emission / absorption;
        rgba[i * 4] *= transmission;
        rgba[i * 4 + 1] *= transmission;
        rgba[i * 4 + 2] *= transmission;
      }
      rgba[i * 4 + 3] = opacity * 255;
    }
  }
}

type Raster = {
  surface: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  image: ImageData;
  words: Uint32Array;
};
const buffers = new WeakMap<CanvasRenderingContext2D, Raster>();

function drawMantle(context: CanvasRenderingContext2D, u: number, coarse: boolean, body: IllusionculumFireBody) {
  // The lightweight renderer's touch grid, or a touch screen that could not
  // hold the desktop grid (far-from-fire-noise.ts: the governor).
  const view = context.canvas.ownerDocument.defaultView;
  const small = coarse || fireGridStepped(view);
  const [w, h] = small ? IC_FIRE_GRID.touch : IC_FIRE_GRID.desktop;
  let buffer = buffers.get(context);
  if (!buffer || buffer.surface.width !== w || buffer.surface.height !== h) {
    // Made once per drawing context (and size), never per frame.
    const surface = context.canvas.ownerDocument.createElement("canvas");
    surface.width = w;
    surface.height = h;
    const ctx = surface.getContext("2d");
    if (!ctx) return;
    const image = ctx.createImageData(w, h);
    buffer = { surface, ctx, image, words: new Uint32Array(image.data.buffer) };
    buffers.set(context, buffer);
  }
  const began = small ? 0 : performance.now();
  rasterFire(buffer.words, buffer.image.data, w, h, u, body);
  if (!small) fireRasterTook(performance.now() - began);
  buffer.ctx.putImageData(buffer.image, 0, 0);
  context.imageSmoothingEnabled = true;
  context.drawImage(
    buffer.surface,
    IC_FIRE_BOUNDS.left,
    IC_FIRE_BOUNDS.top,
    IC_FIRE_BOUNDS.width,
    IC_FIRE_BOUNDS.height,
  );
}

const EMBER = "#e8363a";
const EMBER_CORE = "#ffc890";
type Spark = { angle: number; speed: number; delay: number; drift: number };
const sparks: Spark[] = Array.from({ length: 300 }, (_, i) => {
  const seed = i + 1;
  return {
    angle: TAU * sampleNoise(seed * 3.33, 17),
    speed: 0.5 + sampleNoise(seed * 7.91, 88) * 0.65,
    delay: sampleNoise(seed * 4.6, 46) * 0.19,
    drift: sampleNoise(seed * 2.7, 29),
  };
});

function drawEmbers(context: CanvasRenderingContext2D, u: number, coarse: boolean, body: IllusionculumFireBody) {
  const origins = body.emitters;
  const count = coarse ? 72 : 138;
  const burst = clamp((u - 0.48) / 0.47);
  const sources = origins.length / 3;
  context.lineCap = "round";
  for (let pass = 0; pass < 3; pass++) {
    context.strokeStyle = pass === 2 ? EMBER_CORE : EMBER;
    context.lineWidth = pass === 2 ? 0.002 : 0.0032;
    context.globalAlpha =
      ramp(0, 0.2, u) * (1 - ramp(0.7, 0.97, u)) * (pass === 2 ? 0.9 : 0.72);
    context.beginPath();
    for (let i = pass; i < count; i += 3) {
      const p = sparks[i];
      const source = 3 * ((i * 193 + 71) % sources);
      // Each fragment starts at the bit of armour that released it; before
      // the rupture the cinders rise in the same draft as the flame.
      const born = 0.48 + 0.3 * p.delay;
      const x0 = origins[source];
      const y0 = origins[source + 1];
      if (u < born) {
        const age = (u * (2.4 + p.drift) + p.speed * 3.2) % 1;
        if (u < 0.025 + origins[source + 2] * 0.205 || age > 0.92 || age < 0.08) continue;
        const x = x0 + Math.sin(p.angle + age * 4) * age * 0.07;
        const y = y0 - age * age * (0.16 + p.drift * 0.18);
        context.moveTo(x, y);
        context.lineTo(x + 0.0015 * Math.cos(p.angle), y + 0.002 + 0.007 * age);
        continue;
      }
      const age = clamp((u - born) / (0.49 - p.delay * 0.44));
      const travel = (1 - (1 - age) ** 2) * p.speed;
      const vx = (x0 - 0.5) * 1.35 + Math.cos(p.angle) * 0.34;
      const vy = (y0 - 0.43) * 0.39 + Math.sin(p.angle) * 0.19 - 0.12;
      const x = x0 + vx * travel;
      const y = y0 + vy * travel + age * age * 0.085;
      const trail = (0.005 + 0.045 * p.drift) * (1 - burst * 0.79);
      context.moveTo(x - trail * vx, y - trail * vy);
      context.lineTo(x, y);
    }
    context.stroke();
  }
}

/** The timeline both changes share (FAR FROM's): the old form holds through
 * the engulfing burn and goes as the fire peaks; the Ultra form comes
 * through the flame. Exact at both ends: u=0 is the old form, u=1 the art. */
export function illusionculumFireFades(u: number) {
  return { from: 1 - ramp(0.49, 0.65, u), to: ramp(0.54, 0.78, u) };
}

/** Draws the fire over a figure of `width` x `height` (the owner's whole
 * 2:3 cutout frame) at (0, 0) of the current transform. Nothing at u <= 0
 * or u >= 1. */
export function drawIllusionculumFire(
  context: CanvasRenderingContext2D,
  u: number,
  width: number,
  height: number,
  coarse: boolean,
  body: IllusionculumFireBody | null,
) {
  if (!body || !(u > 0 && u < 1) || width <= 0 || height <= 0) return;
  context.save();
  context.scale(width, height);
  if (u < 0.9) {
    context.globalCompositeOperation = "source-over";
    context.globalAlpha = 1;
    drawMantle(context, u, coarse, body);
  }
  context.globalCompositeOperation = "lighter";
  drawEmbers(context, u, coarse, body);
  context.restore();
}

/** Builds the fields of the given source forms in idle time, ahead of any
 * change into ウルトラ (a 4 GB phone never pays for it on the frame a change
 * starts). Returns the release (cancels what has not run yet). */
export function warmIllusionculumFire(sources: readonly (readonly [string, string])[]): () => void {
  if (typeof document === "undefined" || typeof Image !== "function") return () => {};
  let cancelled = false;
  const handles: number[] = [];
  const idle = typeof window.requestIdleCallback === "function";
  for (const [form, src] of sources) {
    if (bodies.has(form)) continue;
    const run = () => {
      if (cancelled || bodies.has(form)) return;
      const image = new Image();
      image.decoding = "async";
      image.src = src;
      void image.decode().then(
        () => {
          if (cancelled || bodies.has(form)) return;
          // The build itself in its own idle slice.
          const build = () => {
            if (!cancelled) buildIllusionculumFireBody(form, image, document);
          };
          if (idle) handles.push(window.requestIdleCallback(build, { timeout: 1500 }));
          else handles.push(window.setTimeout(build, 0));
        },
        () => {},
      );
    };
    if (idle) handles.push(window.requestIdleCallback(run, { timeout: 2000 }));
    else handles.push(window.setTimeout(run, 200));
  }
  return () => {
    cancelled = true;
    for (const handle of handles) {
      if (idle) window.cancelIdleCallback(handle);
      else window.clearTimeout(handle);
    }
  };
}
