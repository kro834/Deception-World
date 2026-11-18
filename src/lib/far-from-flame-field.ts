/** The burning armour in cutout coordinates. A small optical-depth field follows
 * the suit itself and carries hot gas up into the air above each body part.
 * The same progress samples the same flow in either direction of the runway. */
import { inflateSync } from "fflate";
import { sampleNoise } from "./far-from-fire-noise.ts";
import { FIELD_D, FIELD_IN, FIELD_LIFT, FIRE_RECT } from "./rexonance-fire/fire-field.js";
import { FIELD_WIDTH as FW, FIELD_HEIGHT as FH, FIELD_LEFT as LEFT, FIELD_TOP as TOP,
  MASK_WIDTH, MASK_HEIGHT, FIRE_MASKS, FISSURES } from "./far-from-fire-masks.ts";

export const FIRE_BOUNDS = {
  left: -LEFT / MASK_WIDTH, top: -TOP / MASK_HEIGHT, width: FW / MASK_WIDTH, height: FH / MASK_HEIGHT,
};
export const FIRE_GRID = { desktop: [208, 266], touch: [160, 204] } as const;
const TAU = Math.PI * 2;
const clamp = (x: number) => x < 0 ? 0 : x > 1 ? 1 : x;
const ramp = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

type FormMask = keyof typeof FIRE_MASKS;
type BodyField = { surface: Float32Array; fissure: Float32Array; emitters: Float32Array };
const bodies = new Map<FormMask, BodyField>();
const cellCount = FW * FH;
let sharedGaps: Float32Array | undefined;

function unpack(encoded: string) {
  const raw = atob(encoded);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return inflateSync(bytes);
}

function getBody(form: string): BodyField {
  const key: FormMask = Object.hasOwn(FIRE_MASKS, form) ? form as FormMask : "middle";
  const cached = bodies.get(key);
  if (cached) return cached;

  if (!sharedGaps) {
    const bytes = unpack(FISSURES);
    const floats = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    sharedGaps = new Float32Array(cellCount);
    for (let i = 0; i < cellCount; i++) sharedGaps[i] = floats.getFloat32(i * 4, true);
  }
  const data = unpack(FIRE_MASKS[key]);
  // Integrate the mixed horizontal/vertical differences stored in each
  // channel. The first column has a zero left neighbour on every row.
  for (let plane = 0; plane < cellCount * 4; plane += cellCount) {
    let i = plane;
    for (let x = 1; x < FW; x++) data[plane + x] += data[plane + x - 1];
    i += FW;
    for (let y = 1; y < FH; y++) {
      let rowDelta = 0;
      for (let x = 0; x < FW; x++, i++) {
        rowDelta += data[i];
        data[i] = data[i - FW] + rowDelta;
      }
    }
  }
  const surface = new Float32Array(cellCount * 3);
  const fissure = new Float32Array(cellCount);
  const scale = (FW / FIRE_RECT.width) / MASK_HEIGHT / 255;
  for (let i = 0; i < cellCount; i++) {
    const d = (data[i] * FIELD_D - data[cellCount * 3 + i] * FIELD_IN) * scale;
    surface[i * 3] = d;
    surface[i * 3 + 1] = data[cellCount + i] / 255;
    surface[i * 3 + 2] = data[cellCount * 2 + i] * FIELD_LIFT * scale;
    fissure[i] = d > .007 ? .1 : sharedGaps[i] + Math.max(0, d) * 3;
  }

  // Rim texels whose gap rounded differently before the edge offset have
  // exact baked float overrides. Ember indices follow in original row order.
  const extra = new DataView(data.buffer, data.byteOffset + cellCount * 4, data.byteLength - cellCount * 4);
  const rimCount = extra.getUint16(0, true);
  let pos = 2;
  for (let j = 0; j < rimCount; j++, pos += 6)
    fissure[extra.getUint16(pos, true)] = extra.getFloat32(pos + 2, true);
  const emitters = new Float32Array((extra.byteLength - pos) / 2 * 3);
  for (let i = 0, j = 0; pos < extra.byteLength; pos += 2, j += 3) {
    i += extra.getUint16(pos, true);
    emitters[j] = (i % FW + .5 - LEFT) / MASK_WIDTH;
    emitters[j + 1] = ((i / FW | 0) + .5 - TOP) / MASK_HEIGHT;
    emitters[j + 2] = surface[i * 3 + 1];
  }
  const result = { surface, fissure, emitters };
  bodies.set(key, result);
  return result;
}

export function warmFarFromFireMask(form: string) {
  getBody(form);
}

export function farFromFractureOrigins(form: string) {
  return getBody(form).emitters;
}

const thermalColors = [
  [[12,28,21], [18,89,39], [11,177,76], [53,242,107], [176,255,135], [248,255,216]],
  [[37,8,14], [130,17,22], [225,31,29], [255,75,31], [255,173,68], [255,246,186]],
  [[43,17,6], [128,49,6], [222,102,12], [255,168,26], [255,221,92], [255,254,206]],
];
// The lookup table includes the mixed temperatures between the three Ultra
// streams. The inner loop only copies a single, native-endian RGBA word.
const palette = new Uint32Array(96 * 256);
{
  const bytes = new Uint8ClampedArray(palette.buffer);
  for (let band = 0; band < 96; band++) {
    const first = band >> 5, next = (first + 1) % 3, mix = (band & 31) / 32;
    for (let k = 0; k < 256; k++) {
      const z = 5 * k / 255, a = Math.min(4, Math.floor(z)), t = z - a;
      const offset = (band * 256 + k) * 4;
      for (let c = 0; c < 3; c++) {
        const left = thermalColors[first][a][c] * (1 - t) + thermalColors[first][a + 1][c] * t;
        const right = thermalColors[next][a][c] * (1 - t) + thermalColors[next][a + 1][c] * t;
        bytes[offset + c] = left + (right - left) * mix;
      }
      bytes[offset + 3] = 255;
    }
  }
}

export function rasterFarFromFire(pixels: Uint32Array, width: number, height: number, u: number, tone: number, sourceForm = "middle") {
  const { surface, fissure } = getBody(sourceForm);
  const rgba = new Uint8Array(pixels.buffer, pixels.byteOffset, pixels.byteLength);
  const burst = ramp(.49, .85, u), liftOff = ramp(.49, .67, u);
  const fade = ramp(0, .055, u) * (1 - ramp(.58, .88, u));
  const spread = 1.24 * ramp(.002, .285, u);
  const tearGlow = ramp(.44, .52, u) * (1 - ramp(.55, .69, u));
  const complete = ramp(.22, .44, u);
  const invW = 1 / (1 + .68 * burst), invH = 1 / (1 + .23 * burst);
  const at = u * 8.2;
  const commonBand = Math.max(0, tone) * 32;
  for (let row = 0, i = 0; row < height; row++) {
    const fy = FIRE_BOUNDS.top + (row + .5) * FIRE_BOUNDS.height / height;
    const y = .39 + (fy - .39 + .066 * burst) * invH;
    const trimY = ramp(FIRE_BOUNDS.top, -.27, fy) * (1 - ramp(.997, 1.075, fy));
    const gy = Math.max(0, Math.min(FH - 1.001, y * MASK_HEIGHT + TOP - .5));
    const sy = gy | 0, ty = gy - sy;
    const by = Math.max(0, Math.min(FH - 1.001, fy * MASK_HEIGHT + TOP - .5));
    const bodyRow = (by | 0) * FW, bodyTy = by - (by | 0);
    for (let col = 0; col < width; col++, i++) {
      const fx = FIRE_BOUNDS.left + (col + .5) * FIRE_BOUNDS.width / width;
      const x = .5 + (fx - .5) * invW;
      const gx = Math.max(0, Math.min(FW - 1.001, x * MASK_WIDTH + LEFT - .5));
      const sx = gx | 0, tx = gx - sx;
      const fi = 3 * (sy * FW + sx), low = fi + 3 * FW;
      const ul = (1 - tx) * (1 - ty), ur = tx * (1 - ty), ll = (1 - tx) * ty, lr = tx * ty;
      const d = surface[fi] * ul + surface[fi+3] * ur + surface[low] * ll + surface[low+3] * lr;
      const arrival = surface[fi+1] * ul + surface[fi+4] * ur + surface[low+1] * ll + surface[low+4] * lr;
      const lift = surface[fi+2] * ul + surface[fi+5] * ur + surface[low+2] * ll + surface[low+5] * lr;
      const heightOff = Math.min(lift, Math.max(0, d) * 2.55);
      if (heightOff > .46 || arrival > spread + .17) { pixels[i] = 0; continue; }
      const q = sampleNoise(x * 5.3 + 17, y * 3.2 + at);
      const roll = sampleNoise(x * 8.4 + q * 2.1 + 41, y * 5.1 + at * 1.2);
      const reach = .15 + .14 * q + .074 * (1 - Math.min(1, Math.abs(x - .5) * 2));
      const fall = clamp(heightOff / reach);
      const flutter = (q - .5) * (.092 + .36 * fall) + (roll - .5) * (.056 + .15 * fall);
      const rise = y + heightOff * fall * .39 + (roll - .5) * .054;
      const shear = sampleNoise((x + flutter) * 19 + roll * 2.65, rise * 5.5 + at * 1.50);
      const detail = sampleNoise((x + flutter * 1.34) * 41 + shear * 3.7, rise * 13 + at * 2.13);
      const fine = sampleNoise(x * 74 + shear * 6 + detail * 4.4, y * 30 + at * 2.75);
      const draft = (shear * .58 + detail * .26 + roll * .16 - .5) * 1.85 + .5;
      const sheetFlow = detail * .45 + shear * .21 + fine * .25 + q * .09;
      const fresh = ramp(-.018, .14, spread - arrival + (q - .5) * .17 + (draft - .4) * .08 - heightOff * .64);
      if (!fresh) { pixels[i] = 0; continue; }
      const skin = 1 - ramp(-.005, .005, d);
      const rim = skin * (1 - ramp(.002, .023, -d)) * (.42 + .58 * ramp(.27, .72, draft));
      const clean = complete * ramp(0, .30, spread - arrival);
      const sheet = skin * (.26 + .21 * clean + (.69 - .16 * clean) * ramp(.35, .71, sheetFlow));
      // A dark folded channel borders each incandescent lip. Both run up the
      // body with the flow and become finer at the end of complete combustion.
      const fold = shear + .35 * detail + .12 * fine;
      const lip = 1 - ramp(.013, .084, Math.abs(fold - .73));
      const channel = 1 - ramp(.018, .13, Math.abs(fold - .615));
      // A hot tongue is a thin folded surface. The coarser rising noise
      // supplies its lift, but the broad interior stays optically thin.
      const billow = sampleNoise(x * 40 + shear * 5.5 + roll * 4.3, y * 21 + detail * 4.1 + at * 2.35);
      const strands = shear * .42 + detail * .29 + billow * .20 + fine * .09;
      const curledEdge = 1 - ramp(.012, .094, Math.abs(strands - .58));
      const threshold = .30 + .62 * fall + (1 - fresh) * .30;
      const core = ramp(threshold, threshold + .22, draft);
      const halo = ramp(threshold - .18, threshold + .21, draft);
      const below = Math.max(0, (surface[low] - surface[fi]) * MASK_HEIGHT);
      const heel = ramp(.84, .945, y) * clamp(below * 1.2);
      const ground = 1 - heel * ramp(.001, .035, d + (roll - .5) * .019);
      const peel = (1 - liftOff) + liftOff * ramp(-.001, .073, d + (shear - .5) * .085);
      // The departing skin falls into sparse bright strands. The filament
      // briefly holds its temperature as the surrounding gas loses density.
      const strand = (1 - ramp(.009, .060, Math.abs(strands - .595))) * ramp(.34, .72, shear);
      const breakup = 1 - liftOff * (.34 + .60 * ramp(.29, .71, billow * .52 + fine * .48)) * (1 - .84 * strand);
      const depth = .19 + .37 * ramp(.22, .80, strands) + .44 * curledEdge;
      const plume = (1 - skin) * (.69 * core + .31 * halo) * depth * (1 - .42 * fall)
        * (1 - ramp(.71, 1, fall)) * ground * peel * breakup;
      const attached = 1 - liftOff;
      let density = (plume * (1 + .4 * liftOff * strand) + (sheet * .89 + rim * .56) * attached) * fresh * fade;
      let temp = (.23 + .39 * strands + .42 * curledEdge + .15 * lip - .22 * channel - .16 * fall)
        * (1 - skin) * (.45 + .55 * core)
        + (sheet * (.32 + .30 * sheetFlow + .50 * lip - .34 * channel) + rim * .50) * attached;
      temp = temp * (.92 + .17 * clean) + .055 * fresh;
      if (tearGlow > 0) {
        // The glowing fissures stay on the original armour while its fire flies outward.
        const bx = Math.max(0, Math.min(FW - 1.001, fx * MASK_WIDTH + LEFT - .5));
        const cell = bodyRow + (bx | 0), bodyTx = bx - (bx | 0);
        const upper = fissure[cell] * (1 - bodyTx) + fissure[cell + 1] * bodyTx;
        const lower = fissure[cell + FW] * (1 - bodyTx) + fissure[cell + FW + 1] * bodyTx;
        const gap = upper * (1 - bodyTy) + lower * bodyTy;
        const crack = tearGlow * (1 - ramp(.002, .008 + .009 * tearGlow, gap));
        temp += crack;
        density += crack * .87;
      }
      const trimX = Math.min(1, col / (width * .045), (width - 1 - col) / (width * .045));
      const temperature = clamp(temp + .19 * liftOff * strand * plume);
      // Emission and absorption are distinct, as in the Rexonance kernel.
      // The cool gas absorbs the background; clean hot threads glow through
      // their thin edges. Encode the result for source-over canvas blending.
      const emission = clamp(density * (.47 + temperature * .74));
      const absorption = clamp(density * (.24 + .25 * (1 - clean) + .51 * (1 - temperature)));
      const weight = Math.max(emission, absorption);
      const opacity = weight * trimY * trimX;
      if (opacity <= .004) { pixels[i] = 0; continue; }
      const swirl = x * 1.61 + y * .34 + q * .40 + roll * .19 - .52;
      const band = tone >= 0 ? commonBand : ((swirl * 96 + 192) | 0) % 96;
      pixels[i] = palette[band * 256 + (temperature * 255 | 0)];
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

export function farFromEmberPosition(seed: number) {
  const angle = TAU * sampleNoise(seed * 3.33, 17);
  return { angle, speed: .5 + sampleNoise(seed * 7.91, 88) * .65, delay: sampleNoise(seed * 4.6, 46) * .19,
    drift: sampleNoise(seed * 2.7, 29) };
}
