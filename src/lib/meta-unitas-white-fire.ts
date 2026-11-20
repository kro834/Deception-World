/** META UNITAS SAGA — the change into ウルトラ by white fire (owner,
 * 2026-11-20: 「メタ・ウニタス及びイリュージョンクルムのウルトラへの切り替えも
 * 炎によって行います。それぞれ白い炎と赤い炎です」).
 *
 * The language is FAR FROM's form ignition (far-from-form-combustion.ts):
 * the old form is engulfed from the reactor out and burns, the fire peaks,
 * and ウルトラ is revealed from the flame; the embers start at the armour
 * that released them. Its fire is white-hot with pale violet and silver
 * fringes (the form's light, META_UNITAS_FORM_TONES.ultra), bright where it
 * is thin and hot and only mid-bright in its body, so a cell of the screen
 * rises once from the dark ミドル to the pale ウルトラ instead of flashing.
 *
 * Everything drawn is a closed form of `u` (0–1): forward, back and at rest
 * draw the same moment, and the same `u` is the same picture. u ≤ 0 is the
 * old form exactly and u ≥ 1 the new one exactly.
 *
 * Cost: one small RGBA raster a frame (FIRE_GRID's sizes, coarser on
 * touch), written into buffers made once; the fuel (the old form's body) is
 * read back once, when it is baked, never on a frame.
 */

import { sampleNoise } from "./far-from-fire-noise.ts";

/** The fire's raster: the same budget as FAR FROM's body fire. */
export const WHITE_FIRE_GRID = Object.freeze({
  desktop: [208, 266] as const,
  touch: [160, 204] as const,
});

/** The raster's box in figure units: air above the head and beside the
 * shoulders for the flames to rise into. */
export const WHITE_FIRE_BOUNDS = Object.freeze({ left: -0.14, top: -0.22, width: 1.28, height: 1.27 });

/** The fuel grid over the figure (its 2 : 3 frame). */
const FUEL_W = 72;
const FUEL_H = 108;
const EMBERS = 180;

/** The change's beats, as shares of `u`. */
export const WHITE_FIRE_BEATS = Object.freeze({
  /** The flame runs out from the reactor over the old form. */
  engulf: [0, 0.3] as const,
  /** ウルトラ is revealed from the flame, the reactor first. */
  reveal: [0.4, 0.8] as const,
  /** The old form, hidden in the fire, is gone by then. */
  consume: [0.46, 0.8] as const,
  /** The fire lifts off and is spent. */
  spent: [0.6, 0.94] as const,
});

export type WhiteFireFuel = {
  /** The old form's body (0–1) and the same carried upward (the air a
   * flame rises into above each part). */
  readonly body: Float32Array;
  readonly plume: Float32Array;
  /** Distance from the reactor, 0 at it, 1 at the farthest armour. */
  readonly arrival: Float32Array;
  /** Ember sources on the armour's edge: x, y (figure units), delay. */
  readonly embers: Float32Array;
};

const clamp = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const ramp = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

// The palette, from thin violet-grey smoke through pale violet and silver
// lilac to white. The table holds RGB with a zero alpha so the inner loop
// only ORs the coverage in.
const STOPS = [
  [52, 40, 82],
  [106, 86, 158],
  [168, 146, 222],
  [222, 206, 255],
  [242, 238, 255],
  [255, 255, 255],
] as const;
const PALETTE = new Uint32Array(256);
const LITTLE = new Uint8Array(new Uint32Array([1]).buffer)[0] === 1;
const ALPHA_SHIFT = LITTLE ? 24 : 0;
{
  const bytes = new Uint8Array(PALETTE.buffer);
  for (let k = 0; k < 256; k++) {
    const z = (5 * k) / 255;
    const a = Math.min(4, Math.floor(z));
    const t = z - a;
    for (let c = 0; c < 3; c++) {
      const value = STOPS[a][c] * (1 - t) + STOPS[a + 1][c] * t;
      bytes[k * 4 + (LITTLE ? c : 3 - c)] = Math.round(value);
    }
  }
}
const WHITE = LITTLE ? 0x00ffffff : 0xffffff00;

/** Bakes the old form's body from its cutout (alpha). One read-back, when
 * the change is prepared; null if the source cannot be read. */
export function bakeWhiteFireFuel(
  document: Document,
  source: CanvasImageSource,
  core: readonly [number, number],
): WhiteFireFuel | null {
  const canvas = document.createElement("canvas");
  canvas.width = FUEL_W;
  canvas.height = FUEL_H;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return null;
  let alpha: Uint8ClampedArray;
  try {
    context.drawImage(source, 0, 0, FUEL_W, FUEL_H);
    alpha = context.getImageData(0, 0, FUEL_W, FUEL_H).data;
  } catch {
    return null;
  }
  const n = FUEL_W * FUEL_H;
  const body = new Float32Array(n);
  for (let i = 0; i < n; i++) body[i] = ramp(0.08, 0.7, alpha[i * 4 + 3] / 255);
  // The air above each part: the body carried up a column, thinning.
  const plume = new Float32Array(n);
  for (let x = 0; x < FUEL_W; x++) {
    let carried = 0;
    for (let y = FUEL_H - 1; y >= 0; y--) {
      const i = y * FUEL_W + x;
      carried = Math.max(body[i], carried * 0.935);
      plume[i] = carried;
    }
  }
  // Soften the columns sideways (a 1-2-1 pass, twice): a flame's air is
  // continuous, never the fuel grid's bars.
  const row = new Float32Array(FUEL_W);
  for (let pass = 0; pass < 2; pass++) {
    for (let y = 0; y < FUEL_H; y++) {
      const o = y * FUEL_W;
      for (let x = 0; x < FUEL_W; x++)
        row[x] = (plume[o + Math.max(0, x - 1)] + 2 * plume[o + x] + plume[o + Math.min(FUEL_W - 1, x + 1)]) / 4;
      plume.set(row, o);
    }
  }
  // The reactor's distance over the figure (its 2 : 3 frame).
  const arrival = new Float32Array(n);
  let far = 1e-6;
  for (let y = 0; y < FUEL_H; y++) {
    for (let x = 0; x < FUEL_W; x++) {
      const dx = ((x + 0.5) / FUEL_W - core[0]) * 2;
      const dy = ((y + 0.5) / FUEL_H - core[1]) * 3;
      const d = Math.hypot(dx * 1.12, dy);
      arrival[y * FUEL_W + x] = d;
      if (body[y * FUEL_W + x] > 0.4) far = Math.max(far, d);
    }
  }
  for (let i = 0; i < n; i++) arrival[i] = Math.min(1.2, arrival[i] / far);
  // Ember sources: the armour's rim, picked in a fixed scatter.
  const rim: number[] = [];
  for (let y = 1; y < FUEL_H - 1; y++) {
    for (let x = 1; x < FUEL_W - 1; x++) {
      const i = y * FUEL_W + x;
      if (body[i] < 0.5) continue;
      if (Math.min(body[i - 1], body[i + 1], body[i - FUEL_W], body[i + FUEL_W]) < 0.3) rim.push(i);
    }
  }
  const embers = new Float32Array(EMBERS * 3);
  for (let k = 0; k < EMBERS; k++) {
    const i = rim.length ? rim[(k * 7919 + 13) % rim.length] : (FUEL_H >> 1) * FUEL_W + (FUEL_W >> 1);
    embers[k * 3] = ((i % FUEL_W) + 0.5) / FUEL_W;
    embers[k * 3 + 1] = (Math.floor(i / FUEL_W) + 0.5) / FUEL_H;
    embers[k * 3 + 2] = arrival[i];
  }
  return { body, plume, arrival, embers };
}

// One ember's fixed character (angle, speed, delay, drift).
const EMBER_SHAPE = new Float32Array(EMBERS * 4);
for (let k = 0; k < EMBERS; k++) {
  EMBER_SHAPE[k * 4] = Math.PI * 2 * sampleNoise(k * 3.31 + 0.5, 17.2);
  EMBER_SHAPE[k * 4 + 1] = 0.45 + 0.6 * sampleNoise(k * 7.93 + 0.5, 88.4);
  EMBER_SHAPE[k * 4 + 2] = sampleNoise(k * 4.61 + 0.5, 46.7);
  EMBER_SHAPE[k * 4 + 3] = sampleNoise(k * 2.71 + 0.5, 29.3);
}

type Surface = {
  canvas: HTMLCanvasElement;
  context: CanvasRenderingContext2D;
  image: ImageData;
  words: Uint32Array;
};

function surface(document: Document, width: number, height: number): Surface | null {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) return null;
  const image = context.createImageData(width, height);
  return { canvas, context, image, words: new Uint32Array(image.data.buffer) };
}

function sample(field: Float32Array, x: number, y: number) {
  const gx = x * FUEL_W - 0.5;
  const gy = y * FUEL_H - 0.5;
  if (gx < 0 || gy < 0 || gx >= FUEL_W - 1 || gy >= FUEL_H - 1) {
    const cx = Math.max(0, Math.min(FUEL_W - 1, Math.round(gx)));
    const cy = Math.max(0, Math.min(FUEL_H - 1, Math.round(gy)));
    return field[cy * FUEL_W + cx];
  }
  const sx = gx | 0;
  const sy = gy | 0;
  const tx = gx - sx;
  const ty = gy - sy;
  const i = sy * FUEL_W + sx;
  const top = field[i] + (field[i + 1] - field[i]) * tx;
  const low = field[i + FUEL_W] + (field[i + FUEL_W + 1] - field[i + FUEL_W]) * tx;
  return top + (low - top) * ty;
}

/** The fire (`fire`) and ウルトラ's reveal (`mask`, alpha only) at `u`,
 * both over WHITE_FIRE_BOUNDS. Returns whether any of the fire is drawn. */
export function rasterWhiteFire(
  fire: Uint32Array,
  mask: Uint32Array,
  width: number,
  height: number,
  fuel: WhiteFireFuel,
  u: number,
): boolean {
  const { body, plume, arrival } = fuel;
  const B = WHITE_FIRE_BEATS;
  const spread = 1.18 * ramp(B.engulf[0], B.engulf[1], u);
  const strength = ramp(0, 0.07, u) * (1 - ramp(B.spent[0], B.spent[1], u));
  const front = -0.1 + 1.36 * ramp(B.reveal[0], B.reveal[1], u);
  const revealing = u > B.reveal[0];
  const lift = ramp(0.42, 0.9, u);
  // The armour is wrapped in the fire as the change turns over (it hides
  // the swap of the two forms beneath it), then bared again.
  const veil = ramp(0.16, 0.4, u) * (1 - ramp(0.6, 0.86, u));
  const at = u * 6.2;
  const box = WHITE_FIRE_BOUNDS;
  let drawn = false;
  for (let row = 0, i = 0; row < height; row++) {
    const y = box.top + ((row + 0.5) * box.height) / height;
    for (let col = 0; col < width; col++, i++) {
      const x = box.left + ((col + 0.5) * box.width) / width;
      // The burn's key: ウルトラ shows where the front has passed it.
      const a = sample(arrival, x, y);
      const grain = sampleNoise(x * 7.3 + 11, y * 6.1 + 5);
      const key = a * 0.8 + grain * 0.2;
      const shown = revealing ? ramp(key - 0.035, key + 0.035, front) : 0;
      mask[i] = shown > 0 ? WHITE | ((shown * 255) << ALPHA_SHIFT) : 0;
      if (strength <= 0) {
        fire[i] = 0;
        continue;
      }
      // The flame's sway and its rising turbulence (the noise scrolls up).
      const q = sampleNoise(x * 4.1 + 3, y * 2.6 + at);
      const sway = (q - 0.5) * 0.075;
      const sx = x + sway + (sampleNoise(x * 9.2 + q * 2.3, y * 6.4 + at * 1.4) - 0.5) * 0.034;
      const sy = y + 0.035 * lift + (q - 0.5) * 0.02;
      const p = sample(plume, sx, sy);
      if (p < 0.02) {
        fire[i] = 0;
        continue;
      }
      const lit = ramp(-0.03, 0.09, spread - a + (q - 0.5) * 0.12);
      if (lit <= 0) {
        fire[i] = 0;
        continue;
      }
      const b = sample(body, sx, sy);
      const n1 = sampleNoise(x * 11.5 + q * 2.2, y * 7.4 + at * 2.1);
      const n2 = sampleNoise(x * 24 + n1 * 3.1, y * 15.5 + at * 2.9);
      const turb = n1 * 0.62 + n2 * 0.38;
      // Tongues: noise stretched upright and scrolling up; a tongue reaches
      // as high above the armour as its noise is strong. `e` is the height
      // above the fuel (0 on it).
      const e = (1 - p) * (1.2 - 0.35 * lift);
      const t1 = sampleNoise(x * 17 + q * 1.6 + 7, y * 4.6 + at * 2.5);
      const t2 = sampleNoise(x * 36 + t1 * 2.4, y * 9.5 + at * 3.4);
      const tn = t1 * 0.64 + t2 * 0.36;
      const tongue = ramp(e - 0.06, e + 0.2, tn);
      const tongueCore = ramp(e + 0.12, e + 0.42, tn);
      // On the armour the fire is patchy and thin, so the plates read
      // through it; above it, the tongues carry it up.
      const sheet = b * (0.3 + 0.7 * ramp(0.38, 0.78, turb)) * (0.8 + 0.25 * veil) + b * 0.3 * veil;
      // The front's white-hot lip on the armour, and the revealed armour's
      // fire thinning to its edges as it lifts off.
      const lip = revealing ? (1 - ramp(0.0, 0.085, Math.abs(front - key))) * ramp(0.15, 0.6, b) : 0;
      const thin = 1 - 0.7 * shown * (1 - lip);
      const above = tongue * (1 - 0.55 * b);
      const trim = ramp(box.top, box.top + 0.16, y) * ramp(box.left, box.left + 0.08, x)
        * (1 - ramp(box.left + box.width - 0.08, box.left + box.width, x));
      const density = clamp((Math.max(above, sheet) + lip * 0.75) * lit * strength * thin * trim);
      if (density <= 0.01) {
        fire[i] = 0;
        continue;
      }
      // White in the tongues' cores and on the lip; violet as they thin.
      const temp = clamp(0.16 + 0.5 * tongueCore + 0.22 * turb * sheet + 0.06 * veil * b + 0.2 * tongue * (1 - e) + 0.6 * lip - 0.1 * lift);
      const alpha = clamp(density * (0.28 + 0.5 * temp));
      fire[i] = PALETTE[(temp * 255) | 0] | ((alpha * 255) << ALPHA_SHIFT);
      drawn = true;
    }
  }
  return drawn;
}

export type WhiteFire = {
  /** Draws the change at `u` into a box of `width` × `height` at the
   * context's origin (the figure's frame): `from` engulfed, `to` revealed. */
  draw(
    context: CanvasRenderingContext2D,
    from: CanvasImageSource,
    to: CanvasImageSource,
    fuel: WhiteFireFuel,
    u: number,
    width: number,
    height: number,
  ): void;
  release(): void;
};

/** The white fire's buffers, made once for a scene (`coarse`: touch). */
export function createWhiteFire(document: Document, coarse: boolean): WhiteFire {
  const [gw, gh] = coarse ? WHITE_FIRE_GRID.touch : WHITE_FIRE_GRID.desktop;
  let fire: Surface | null = null;
  let mask: Surface | null = null;
  // ウルトラ cut by the reveal, at a resolution the fire covers.
  let stage: { canvas: HTMLCanvasElement; context: CanvasRenderingContext2D } | null = null;
  const stageHeight = coarse ? 600 : 820;

  const ensure = () => {
    if (!fire) fire = surface(document, gw, gh);
    if (!mask) mask = surface(document, gw, gh);
    if (!stage) {
      const canvas = document.createElement("canvas");
      canvas.width = Math.round((stageHeight * 2) / 3);
      canvas.height = stageHeight;
      const context = canvas.getContext("2d");
      if (context) stage = { canvas, context };
    }
    return Boolean(fire && mask && stage);
  };

  const embers = (context: CanvasRenderingContext2D, fuel: WhiteFireFuel, u: number) => {
    const count = coarse ? 96 : EMBERS;
    const fade = ramp(0.12, 0.3, u) * (1 - ramp(0.8, 0.98, u));
    if (fade <= 0) return;
    context.lineCap = "round";
    for (let pass = 0; pass < 2; pass++) {
      context.strokeStyle = pass ? "rgb(255 255 255)" : "rgb(226 210 255)";
      context.lineWidth = pass ? 0.0021 : 0.0034;
      context.globalAlpha = fade * (pass ? 0.9 : 0.62);
      context.beginPath();
      for (let k = pass; k < count; k += 2) {
        const x0 = fuel.embers[k * 3];
        const y0 = fuel.embers[k * 3 + 1];
        const reach = fuel.embers[k * 3 + 2];
        const angle = EMBER_SHAPE[k * 4];
        const speed = EMBER_SHAPE[k * 4 + 1];
        const delay = EMBER_SHAPE[k * 4 + 2];
        const drift = EMBER_SHAPE[k * 4 + 3];
        // Born where the flame has reached that part of the armour, each
        // rises in the draft and is spent before the fire is.
        const born = 0.1 + reach * 0.24 + delay * 0.36;
        const age = (u - born) / (0.26 + 0.2 * speed);
        if (age <= 0 || age >= 1) continue;
        const travel = (1 - (1 - age) * (1 - age)) * speed;
        const vx = (x0 - 0.5) * 0.5 + Math.cos(angle) * 0.1;
        const vy = -0.2 - 0.16 * drift + Math.sin(angle) * 0.05;
        const x = x0 + vx * travel + Math.sin(angle + age * 5) * 0.012;
        const y = y0 + vy * travel;
        const tail = 0.006 + 0.02 * drift * (1 - age);
        context.moveTo(x - vx * tail, y - vy * tail);
        context.lineTo(x, y);
      }
      context.stroke();
    }
    context.globalAlpha = 1;
  };

  return {
    draw(context, from, to, fuel, u, width, height) {
      context.save();
      context.globalCompositeOperation = "source-over";
      context.globalAlpha = 1;
      if (!(u > 0)) {
        context.drawImage(from, 0, 0, width, height);
        context.restore();
        return;
      }
      if (!(u < 1) || !ensure()) {
        context.drawImage(to, 0, 0, width, height);
        context.restore();
        return;
      }
      const f = fire!;
      const m = mask!;
      const s = stage!;
      const drawn = rasterWhiteFire(f.words, m.words, gw, gh, fuel, u);
      const B = WHITE_FIRE_BEATS;
      // The old form, burning away inside the fire.
      const old = 1 - ramp(B.consume[0], B.consume[1], u);
      if (old > 0) {
        context.globalAlpha = old;
        context.drawImage(from, 0, 0, width, height);
        context.globalAlpha = 1;
      }
      // ウルトラ where the flame has revealed it (whole once the front has
      // passed the farthest armour).
      const box = WHITE_FIRE_BOUNDS;
      if (u >= B.reveal[1]) {
        context.drawImage(to, 0, 0, width, height);
      } else if (u > B.reveal[0]) {
        m.context.putImageData(m.image, 0, 0);
        const sc = s.context;
        const sw = s.canvas.width;
        const sh = s.canvas.height;
        sc.globalCompositeOperation = "copy";
        sc.drawImage(to, 0, 0, sw, sh);
        sc.globalCompositeOperation = "destination-in";
        sc.drawImage(m.canvas, box.left * sw, box.top * sh, box.width * sw, box.height * sh);
        sc.globalCompositeOperation = "source-over";
        context.drawImage(s.canvas, 0, 0, width, height);
      }
      context.scale(width, height);
      if (drawn) {
        f.context.putImageData(f.image, 0, 0);
        context.drawImage(f.canvas, box.left, box.top, box.width, box.height);
        // The white-hot glow: the same field added once more, faintly.
        context.globalCompositeOperation = "lighter";
        context.globalAlpha = 0.1;
        context.drawImage(f.canvas, box.left, box.top, box.width, box.height);
        context.globalAlpha = 1;
      }
      context.globalCompositeOperation = "lighter";
      embers(context, fuel, u);
      context.restore();
    },
    release() {
      for (const held of [fire, mask, stage]) {
        if (held) {
          held.canvas.width = 0;
          held.canvas.height = 0;
        }
      }
      fire = mask = stage = null;
    },
  };
}
