/* FAR FROM SAGA — the suit-up scene (2026-10-22).

   One scene, two drivers: the #suitup runway scrubs it by scroll
   (far-from-assembly.ts) and the entry transition plays it on a clock
   (far-from-entry-transition.tsx). Every frame is a closed-form function of
   the progress p (0..1), the visit's take (a seed rolled once per mount) and
   the stage's size — no history, so scrubbing in either direction lands on
   the same pixels. The one cache (the landed cells) is a prefix of a fixed
   order and is rebuilt under a per-frame budget when the scroll runs back.

   What it draws (the owner's look: 黒銀と黄金の装甲, 水色の透明な結晶, 胸部の
   虹色の中枢, the ファーフロムビット and their 光輪):
   - the ミドル artwork cut into cells; each cell flies in from one of a few
     distant points (「離れた機構も拳の一部」) and lands on its place, the
     legs first, then the waist, arms, chest and head;
   - the resonance field (src/lib/rexonance-field: the shared WebGL helix
     layer, its own palette here — ice, gold, white) converging on each
     group as it lands and collapsing into the chest's core; without WebGL
     a few hundred CPU motes on the same poses;
   - a crystal light sweep up the finished armour and the rainbow core;
   - the bits (a crystal core in a sharp shell) docking into orbit from far
     points, then settling onto the halo rings that form behind the body.

   Contracts: no per-frame allocation (every buffer, path colour and sprite
   is made at creation or resize); draw budgets by pointer; a quality
   governor on frame cost; WebGL feature-detected, released on release();
   a plain 2D context is enough for the whole scene. Never imported on the
   page's startup path: far-from-assembly.ts imports it when the runway is
   near, the entry when it plays. */

import { FAR_FROM_SAGA_ARTWORK } from "./far-from-saga-artwork";
import { fieldHash, fieldTake } from "./rexonance-field/field-seed.js";
import { FIELD_STATE, fieldScore, fieldState, fieldStateBuffer } from "./rexonance-field/field-score.js";
import { FIELD_SEEDS, FIELD_SHAPE, fieldPose, fieldSeeds } from "./rexonance-field/field-pose.js";
import { createFieldLayer } from "./rexonance-field/field-gl.js";
import type { FieldLayer, FieldScore, FieldTake } from "./rexonance-field/index.js";

const TAU = Math.PI * 2;
const clamp01 = (value: number) => (value < 0 ? 0 : value > 1 ? 1 : value);
const span = (value: number, from: number, to: number) => clamp01((value - from) / (to - from));
const smooth = (u: number) => u * u * (3 - 2 * u);
const easeOut = (u: number) => 1 - (1 - u) * (1 - u) * (1 - u);
const bell = (u: number) => (u <= 0 || u >= 1 ? 0 : Math.sin(u * Math.PI));

/** The figure: the ミドル delivery file's intrinsic size (figure px). */
export const FAR_FROM_FIGURE = Object.freeze({
  width: FAR_FROM_SAGA_ARTWORK.middle.width,
  height: FAR_FROM_SAGA_ARTWORK.middle.height,
});
const ASPECT = FAR_FROM_FIGURE.width / FAR_FROM_FIGURE.height;

/** Where the figure stands in a stage (shares of the stage's box). */
export const FAR_FROM_STAGE = Object.freeze({ height: 0.86, width: 0.92, bottom: 0.035 });

/** The chest's rainbow core and the visor (shares of the figure's box). */
export const FAR_FROM_MARKS = Object.freeze({
  core: Object.freeze([0.5, 0.345] as const),
  visor: Object.freeze([0.5, 0.12] as const),
});

/** The beats, as shares of the progress: when each part forms. */
export const FAR_FROM_WINDOWS = Object.freeze({
  gather: Object.freeze([0, 0.1] as const),
  legs: Object.freeze([0.08, 0.3] as const),
  waist: Object.freeze([0.26, 0.4] as const),
  arms: Object.freeze([0.36, 0.52] as const),
  chest: Object.freeze([0.48, 0.62] as const),
  head: Object.freeze([0.58, 0.7] as const),
  crystal: Object.freeze([0.68, 0.8] as const),
  core: Object.freeze([0.76, 0.9] as const),
  bits: Object.freeze([0.74, 0.92] as const),
  halo: Object.freeze([0.88, 1] as const),
});

/** The cell regions, in the order the field converges on them. */
export const FAR_FROM_REGIONS = ["legs", "waist", "arms", "chest", "head", "bits"] as const;
export type FarFromRegion = (typeof FAR_FROM_REGIONS)[number];

/** The budgets by pointer: the grid's columns, the cells drawn into the
 * landed cache a frame, the bits, the CPU motes (no WebGL) and the device
 * ratio cap. */
export const FAR_FROM_BUDGET = Object.freeze({
  columns: Object.freeze({ fine: 40, coarse: 26 }),
  cache: Object.freeze({ fine: 420, coarse: 240 }),
  bits: Object.freeze({ fine: 8, coarse: 6 }),
  motes: Object.freeze({ fine: 300, coarse: 140 }),
  ratio: Object.freeze({ fine: 1.5, coarse: 1.25 }),
  /** The field's particle count (the shared layer's own by default). */
  field: Object.freeze({ fine: 9000, coarse: 2600 }),
});

/** A cell's flight (progress units) and its landing flash. */
export const FAR_FROM_FLIGHT = 0.07;
export const FAR_FROM_LAND_FLASH = 0.014;
/** The distant points the nanites and the bits come from. */
export const FAR_FROM_FAR_POINTS = 5;
/** A bit's flight (progress units). */
export const FAR_FROM_BIT_FLIGHT = 0.1;

/** The field's palette here: 水色, gold, white. */
export const FAR_FROM_TONES = Object.freeze({
  ice: Object.freeze([0.56, 0.92, 1]),
  pink: Object.freeze([1, 0.84, 0.5]),
  white: Object.freeze([0.97, 0.99, 1]),
  leads: Object.freeze([
    Object.freeze([0.62, 0.84]),
    Object.freeze([0.4, 0.86]),
    Object.freeze([0.5, 0.66]),
  ]),
});

/** The halo rings (shares of the figure's box): the bits' ring, the ring
 * behind the head, the outer ring; each with the window its sweep opens
 * over. */
export const FAR_FROM_RINGS = Object.freeze([
  Object.freeze({ cu: 0.5, cv: 0.33, ru: 0.74, rv: 0.2, from: 0.88, to: 0.975, tone: 0 }),
  Object.freeze({ cu: 0.5, cv: 0.14, ru: 0.36, rv: 0.085, from: 0.9, to: 0.985, tone: 1 }),
  Object.freeze({ cu: 0.5, cv: 0.44, ru: 0.98, rv: 0.46, from: 0.91, to: 1, tone: 2 }),
]);

/** Which region a cell at (u, v) (shares of the figure's box) belongs to. */
export function farFromCellRegion(u: number, v: number): number {
  const dx = Math.abs(u - 0.5);
  if ((v < 0.26 && dx > 0.33) || (dx > 0.4 && v < 0.7) || (v < 0.1 && dx > 0.25)) return 5;
  if (v < 0.21 && dx < 0.14) return 4;
  if (v < 0.46 && dx < 0.2) return 3;
  if (v < 0.2) return 3;
  if (v < 0.64 && dx >= 0.2) return 2;
  if (v < 0.56) return 1;
  return 0;
}

const REGION_WINDOW: readonly (readonly [number, number])[] = [
  FAR_FROM_WINDOWS.legs,
  FAR_FROM_WINDOWS.waist,
  FAR_FROM_WINDOWS.arms,
  FAR_FROM_WINDOWS.chest,
  FAR_FROM_WINDOWS.head,
  FAR_FROM_WINDOWS.bits,
];

/** A cell's order within its region (0 first): the legs from the soles up,
 * the waist from the buckle out, the arms from the shoulders to the fists,
 * the chest from the core out, the helmet from the chin up. */
function regionOrder(region: number, u: number, v: number, hash: number): number {
  const dx = Math.abs(u - 0.5);
  switch (region) {
    case 0:
      return clamp01((1 - v) / 0.44);
    case 1:
      return clamp01(dx / 0.2);
    case 2:
      return clamp01((dx - 0.2) / 0.3);
    case 3:
      return clamp01(Math.hypot(u - FAR_FROM_MARKS.core[0], v - FAR_FROM_MARKS.core[1]) / 0.25);
    case 4:
      return clamp01((0.21 - v) / 0.21);
    default:
      return hash;
  }
}

export type FarFromCellPlan = {
  readonly count: number;
  readonly columns: number;
  readonly rows: number;
  /** A cell's size (shares of the figure's box). */
  readonly su: number;
  readonly sv: number;
  /** Cell origins (shares), in landing order. */
  readonly u: Float32Array;
  readonly v: Float32Array;
  /** When each lands (progress), ascending. */
  readonly land: Float32Array;
  readonly region: Uint8Array;
  /** The flight: the far point's angle (rad), its distance (figure
   * heights), the path's bend and the tumble (rad). */
  readonly angle: Float32Array;
  readonly dist: Float32Array;
  readonly bend: Float32Array;
  readonly spin: Float32Array;
};

/** The far points' angles for a take (rad). */
export function farFromFarAngle(take: FieldTake, k: number): number {
  return take.phase + (k * TAU) / FAR_FROM_FAR_POINTS + (fieldHash(k + 1, 71) - 0.5) * 0.6;
}

/** The cells of the figure's grid at `columns`, planned for a take: their
 * places, landing times (sorted) and flights. Pure in (columns, take). */
export function farFromCellPlan(columns: number, take: FieldTake): FarFromCellPlan {
  const cols = Math.max(4, columns | 0);
  const rows = Math.max(4, Math.round(cols / ASPECT));
  const su = 1 / cols;
  const sv = 1 / rows;
  const count = cols * rows;
  const order = new Uint32Array(count);
  const landAt = new Float32Array(count);
  for (let i = 0; i < count; i += 1) {
    const col = i % cols;
    const row = (i - col) / cols;
    const cu = (col + 0.5) * su;
    const cv = (row + 0.5) * sv;
    const region = farFromCellRegion(cu, cv);
    const [a, b] = REGION_WINDOW[region];
    const o = regionOrder(region, cu, cv, fieldHash(i, 2));
    landAt[i] = a + (b - a) * clamp01(0.05 + 0.78 * o + 0.17 * fieldHash(i, 3));
    order[i] = i;
  }
  const sorted = Array.from(order).sort((p, q) => landAt[p] - landAt[q] || p - q);
  const u = new Float32Array(count);
  const v = new Float32Array(count);
  const land = new Float32Array(count);
  const region = new Uint8Array(count);
  const angle = new Float32Array(count);
  const dist = new Float32Array(count);
  const bend = new Float32Array(count);
  const spin = new Float32Array(count);
  sorted.forEach((i, k) => {
    const col = i % cols;
    const row = (i - col) / cols;
    u[k] = col * su;
    v[k] = row * sv;
    land[k] = landAt[i];
    region[k] = farFromCellRegion((col + 0.5) * su, (row + 0.5) * sv);
    const point = Math.floor(fieldHash(i, 5) * FAR_FROM_FAR_POINTS) % FAR_FROM_FAR_POINTS;
    angle[k] = farFromFarAngle(take, point) + (fieldHash(i, 9) - 0.5) * 0.7;
    dist[k] = 0.95 + 0.55 * fieldHash(i, 6);
    bend[k] = (fieldHash(i, 7) - 0.5) * 0.5;
    spin[k] = (fieldHash(i, 8) - 0.5) * 6;
  });
  return { count, columns: cols, rows, su, sv, u, v, land, region, angle, dist, bend, spin };
}

/** How many cells have landed at `p` (the first index whose landing is
 * after p). */
export function farFromLandedCount(plan: FarFromCellPlan, p: number): number {
  return upperBound(plan.land, p, plan.count);
}

/** The first index whose value is > needle. */
function upperBound(values: Float32Array, needle: number, count: number): number {
  let lo = 0;
  let hi = count;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (values[mid] <= needle) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/**
 * A cell's pose at `p` while it flies: writes [cx, cy, scale, alpha,
 * rotation, tx, ty] into `out` (centre and trail tail in shares of the
 * figure's box, scale against its own size), or alpha 0 when it is not in
 * flight. Closed-form in p.
 */
export function farFromCellPose(
  plan: FarFromCellPlan,
  index: number,
  p: number,
  out: Float32Array,
): Float32Array {
  const land = plan.land[index];
  const t = (p - (land - FAR_FROM_FLIGHT)) / FAR_FROM_FLIGHT;
  if (!(t > 0) || t >= 1) {
    out[3] = 0;
    return out;
  }
  const tx = plan.u[index] + plan.su / 2;
  const ty = plan.v[index] + plan.sv / 2;
  const ox = 0.5 + Math.cos(plan.angle[index]) * plan.dist[index] * (1 / ASPECT);
  const oy = 0.5 + Math.sin(plan.angle[index]) * plan.dist[index];
  const dx = tx - ox;
  const dy = ty - oy;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const e = easeOut(t);
  const side = Math.sin(t * Math.PI) * plan.bend[index] * len;
  out[0] = ox + dx * e + nx * side;
  out[1] = oy + dy * e + ny * side;
  out[2] = 0.3 + 0.7 * e;
  out[3] = Math.min(1, t * 2.5);
  out[4] = plan.spin[index] * (1 - e);
  const t0 = Math.max(0, t - 0.18);
  const e0 = easeOut(t0);
  const side0 = Math.sin(t0 * Math.PI) * plan.bend[index] * len;
  out[5] = ox + dx * e0 + nx * side0;
  out[6] = oy + dy * e0 + ny * side0;
  return out;
}

/** When bit `k` of `n` docks (progress). */
export function farFromBitDock(k: number, n: number): number {
  return FAR_FROM_WINDOWS.bits[0] + 0.01 + (k / n) * 0.13 + fieldHash(k, 41) * 0.015;
}

/**
 * A bit's pose at `p`: writes [u, v, z, scale, alpha, rotation] into `out`
 * (u, v in shares of the figure's box — beyond it, as the bits float
 * outside the body; z −1..1, toward the viewer). From a far point it docks
 * into its orbit slot, then settles onto the halo ring. Closed-form in p.
 */
export function farFromBitPose(
  k: number,
  n: number,
  p: number,
  take: FieldTake,
  out: Float32Array,
): Float32Array {
  const dock = farFromBitDock(k, n);
  const t = (p - (dock - FAR_FROM_BIT_FLIGHT)) / FAR_FROM_BIT_FLIGHT;
  if (!(t > 0)) {
    out[4] = 0;
    return out;
  }
  const f = clamp01(t);
  const e = easeOut(f);
  // The orbit slot: an ellipse about the body's middle, slowly turning.
  const phi = take.phase + (k * TAU) / n + 1.6 * take.hand * (p - FAR_FROM_WINDOWS.bits[0]);
  const ou = 0.5 + Math.cos(phi) * 0.68;
  const ov = 0.47 + Math.sin(phi) * 0.4;
  const oz = Math.sin(phi);
  // The far point it comes from.
  const a = farFromFarAngle(take, k % FAR_FROM_FAR_POINTS) + 0.4 + (fieldHash(k, 43) - 0.5) * 0.5;
  const fu = 0.5 + Math.cos(a) * 1.3 * (1 / ASPECT);
  const fv = 0.5 + Math.sin(a) * 1.3;
  let u = fu + (ou - fu) * e;
  let v = fv + (ov - fv) * e;
  let z = oz * e;
  // The halo: each bit takes its slot on the ring behind the shoulders.
  const h = smooth(span(p, FAR_FROM_WINDOWS.halo[0], 0.96));
  if (h > 0) {
    const ring = FAR_FROM_RINGS[0];
    const psi = -Math.PI / 2 + ((k + 0.5) * TAU) / n;
    const hu = ring.cu + Math.cos(psi) * ring.ru;
    const hv = ring.cv + Math.sin(psi) * ring.rv;
    u += (hu - u) * h;
    v += (hv - v) * h;
    z += (Math.sin(psi) - z) * h;
  }
  const depth = (z + 1) / 2;
  out[0] = u;
  out[1] = v;
  out[2] = z;
  out[3] = (0.5 + 0.5 * e) * (0.78 + 0.32 * depth);
  out[4] = Math.min(1, t * 3) * (0.55 + 0.45 * depth);
  out[5] = Math.atan2(0.45 - v, (0.5 - u) * ASPECT) + (fieldHash(k, 45) - 0.5) * 2.4 * (1 - e);
  return out;
}

/** A ring's sweep at `p` (0 closed, 1 whole). */
export function farFromRingSweep(ring: { from: number; to: number }, p: number): number {
  return smooth(span(p, ring.from, ring.to));
}

/** The field's score on the progress clock: the wake while the nanites
 * gather, one group per part in the fit order, the collapse into the core
 * and the detonation with the crystal light. Built once. */
let SCORE: FieldScore | undefined;
export function farFromFieldScore(): FieldScore {
  if (SCORE) return SCORE;
  const W = FAR_FROM_FIGURE.width;
  const H = FAR_FROM_FIGURE.height;
  const group = (
    [u, v]: readonly [number, number],
    [sx, sy]: readonly [number, number],
    window: readonly [number, number],
    strength: number,
    [iu, iv]: readonly [number, number],
  ) => ({
    x: u * W,
    y: v * H,
    sx: sx * W,
    sy: sy * H,
    from: window[0],
    lock: window[1],
    strength,
    ix: iu * W,
    iy: iv * H,
  });
  SCORE = (fieldScore as (options: unknown) => FieldScore)({
    wake: [FAR_FROM_WINDOWS.gather[0], FAR_FROM_WINDOWS.gather[1] + 0.02],
    groups: [
      group([0.5, 0.78], [0.2, 0.2], FAR_FROM_WINDOWS.legs, 1, [0.57, 0.72]),
      group([0.5, 0.5], [0.18, 0.06], FAR_FROM_WINDOWS.waist, 0.85, [0.5, 0.5]),
      group([0.5, 0.42], [0.42, 0.16], FAR_FROM_WINDOWS.arms, 1, [0.84, 0.6]),
      group([0.5, 0.33], [0.2, 0.1], FAR_FROM_WINDOWS.chest, 1.1, FAR_FROM_MARKS.core),
      group([0.5, 0.12], [0.1, 0.08], FAR_FROM_WINDOWS.head, 0.6, FAR_FROM_MARKS.visor),
    ],
    collapse: [FAR_FROM_WINDOWS.head[1], FAR_FROM_WINDOWS.core[0]],
    detonate: [FAR_FROM_WINDOWS.core[0], FAR_FROM_WINDOWS.core[0] + 0.08],
    end: FAR_FROM_WINDOWS.halo[0],
    impulse: 0.05,
    origin: [FAR_FROM_MARKS.core[0] * W, FAR_FROM_MARKS.core[1] * H],
    spread: [W * 0.3, H * 0.34],
    settle: 0.5,
    gather: 0.4,
  });
  return SCORE;
}

/** A field particle's birth: from one of the far points, flying in
 * (figure heights from the figure's top-left; velocity per wake). Writes
 * [x, y, vx, vy, stagger share]. */
export function farFromFragment(index: number, out: Float64Array | Float32Array) {
  const point = index % FAR_FROM_FAR_POINTS;
  const a = (point * TAU) / FAR_FROM_FAR_POINTS + 0.7 + (fieldHash(index, 51) - 0.5) * 0.8;
  const d = 0.6 + 0.4 * fieldHash(index, 52);
  const cx = ASPECT / 2;
  out[0] = cx + Math.cos(a) * d;
  out[1] = 0.5 + Math.sin(a) * d;
  const speed = 1.2 + 0.7 * fieldHash(index, 53);
  out[2] = -Math.cos(a) * speed;
  out[3] = -Math.sin(a) * speed;
  out[4] = fieldHash(index, 54);
  return out;
}

export type FarFromSceneOptions = {
  stage: HTMLElement;
  canvas: HTMLCanvasElement;
  image: CanvasImageSource & { width?: number; height?: number };
  coarse?: boolean;
  seed?: number;
  /** Off: no WebGL layer (the CPU motes draw instead). */
  webgl?: boolean;
};

export type FarFromScene = {
  readonly take: FieldTake;
  /** The WebGL field is live (false: the 2D motes stand in). */
  readonly field: boolean;
  /** The stage's CSS box and the device ratio: sizes every surface. */
  resize(width: number, height: number, devicePixelRatio?: number): void;
  /** Draws the frame at progress p. Returns the cells still owed to the
   * landed cache (0 when the frame is whole). */
  render(p: number): number;
  release(): void;
};

const ICE = "rgb(143 240 255)";
const ICE_SOFT = "rgb(143 240 255 / 0.5)";
const GOLD = "rgb(255 217 138)";
const GOLD_SOFT = "rgb(255 217 138 / 0.5)";
const WHITE = "rgb(236 250 255)";
const VIOLET_SOFT = "rgb(201 155 255 / 0.5)";
const RING_TONES = [
  [ICE, ICE_SOFT],
  [GOLD, GOLD_SOFT],
  ["rgb(222 206 255)", VIOLET_SOFT],
] as const;
const MOTE_TONES = ["rgb(143 240 255)", "rgb(255 217 138)", "rgb(236 250 255)"] as const;

/** Creates the scene on `canvas` inside `stage`. The caller sizes it
 * (resize) and drives it (render); release() frees every surface. */
export function createFarFromScene(options: FarFromSceneOptions): FarFromScene {
  const { stage, canvas, image } = options;
  const coarse = Boolean(options.coarse);
  const doc = canvas.ownerDocument;
  const seed = options.seed ?? Math.floor(Math.random() * 4294967296) >>> 0;
  const take = fieldTake(seed);
  const tier = coarse ? "coarse" : "fine";
  const plan = farFromCellPlan(FAR_FROM_BUDGET.columns[tier], take);
  const cacheBudget = FAR_FROM_BUDGET.cache[tier];
  const bitCount = FAR_FROM_BUDGET.bits[tier];
  const context = canvas.getContext("2d", { alpha: true });
  // Reusable buffers (no per-frame allocation).
  const cellOut = new Float32Array(7);
  const bitOut = new Float32Array(6);
  const bitPoses = new Float32Array(bitCount * 6);
  const score = farFromFieldScore();
  const state = fieldStateBuffer();
  const moteOut = new Float64Array(6);
  const moteTail = new Float64Array(6);

  let W = 0;
  let H = 0;
  let ratio = 1;
  let figX = 0;
  let figY = 0;
  let figW = 0;
  let figH = 0;
  let released = false;

  // The plate (the artwork at the stage's resolution, its edges feathered),
  // its hologram, the landed cache and the sprites: made at resize.
  let plate: HTMLCanvasElement | null = null;
  let holo: HTMLCanvasElement | null = null;
  let cache: HTMLCanvasElement | null = null;
  let cacheContext: CanvasRenderingContext2D | null = null;
  let cacheCount = 0;
  let cacheW = 0;
  let cacheH = 0;
  let bitSprite: HTMLCanvasElement | null = null;
  let bitSize = 0;
  let coreSprite: HTMLCanvasElement | null = null;
  let coreSize = 0;
  let sweepGradient: CanvasGradient | null = null;
  let sweepHeight = 0;

  // The field: the shared WebGL layer, or the CPU motes.
  let layer: FieldLayer | null = null;
  let fieldFailed = options.webgl === false;
  const moteCount = FAR_FROM_BUDGET.motes[tier];
  let moteSeeds: Float64Array[] | null = null;

  // The governor: frame cost smoothed; quality halves the field and drops
  // the trails when frames run long, and comes back when they are quick.
  let cost = 8;
  let quality = 1;

  const makeCanvas = (w: number, h: number) => {
    const c = doc.createElement("canvas");
    c.width = Math.max(1, w | 0);
    c.height = Math.max(1, h | 0);
    return c;
  };

  const buildPlate = () => {
    const sourceW = (image as HTMLImageElement).naturalWidth || image.width || FAR_FROM_FIGURE.width;
    const sourceH =
      (image as HTMLImageElement).naturalHeight || image.height || FAR_FROM_FIGURE.height;
    const ph = Math.max(64, Math.min(sourceH, Math.round(figH * ratio)));
    const pw = Math.max(64, Math.round(ph * ASPECT));
    plate = makeCanvas(pw, ph);
    const c = plate.getContext("2d");
    if (!c) return;
    c.drawImage(image, 0, 0, sourceW, sourceH, 0, 0, pw, ph);
    // Feather the plate's edges: the artwork's own space blends into the
    // stage, and nothing meets a straight cut.
    c.globalCompositeOperation = "destination-in";
    const gx = c.createLinearGradient(0, 0, pw, 0);
    gx.addColorStop(0, "rgb(0 0 0 / 0)");
    gx.addColorStop(0.09, "rgb(0 0 0 / 1)");
    gx.addColorStop(0.91, "rgb(0 0 0 / 1)");
    gx.addColorStop(1, "rgb(0 0 0 / 0)");
    c.fillStyle = gx;
    c.fillRect(0, 0, pw, ph);
    const gy = c.createLinearGradient(0, 0, 0, ph);
    gy.addColorStop(0, "rgb(0 0 0 / 0)");
    gy.addColorStop(0.07, "rgb(0 0 0 / 1)");
    gy.addColorStop(0.9, "rgb(0 0 0 / 1)");
    gy.addColorStop(1, "rgb(0 0 0 / 0)");
    c.fillStyle = gy;
    c.fillRect(0, 0, pw, ph);
    c.globalCompositeOperation = "source-over";
    // The hologram: the plate tinted ice, in scanlines — the guide the
    // cells land on.
    holo = makeCanvas(pw, ph);
    const hc = holo.getContext("2d");
    if (!hc) return;
    hc.drawImage(plate, 0, 0);
    hc.globalCompositeOperation = "source-atop";
    hc.fillStyle = "rgb(96 214 255 / 0.86)";
    hc.fillRect(0, 0, pw, ph);
    hc.globalCompositeOperation = "destination-out";
    hc.fillStyle = "rgb(0 0 0 / 0.6)";
    const step = Math.max(2, Math.round(3 * ratio));
    for (let y = 0; y < ph; y += step) hc.fillRect(0, y, pw, Math.max(1, step >> 1));
    hc.globalCompositeOperation = "source-over";
  };

  const buildSprites = () => {
    // A bit: a crystal core in a sharp four-point shell, lit from within.
    bitSize = Math.max(18, Math.round(figW * 0.105 * ratio));
    const s = bitSize * 2;
    bitSprite = makeCanvas(s, s);
    const c = bitSprite.getContext("2d");
    if (c) {
      const r = bitSize / 2;
      c.translate(s / 2, s / 2);
      const glow = c.createRadialGradient(0, 0, 0, 0, 0, bitSize);
      glow.addColorStop(0, "rgb(143 240 255 / 0.55)");
      glow.addColorStop(0.5, "rgb(143 240 255 / 0.12)");
      glow.addColorStop(1, "rgb(143 240 255 / 0)");
      c.fillStyle = glow;
      c.fillRect(-s / 2, -s / 2, s, s);
      // The shell: a long blade forward, three shorter.
      const blade = (angle: number, length: number, width: number) => {
        c.save();
        c.rotate(angle);
        c.beginPath();
        c.moveTo(r * 0.55, 0);
        c.lineTo(r * 0.55 + length, 0);
        c.lineTo(r * 0.55, width);
        c.lineTo(r * 0.3, 0);
        c.lineTo(r * 0.55, -width);
        c.closePath();
        const metal = c.createLinearGradient(r * 0.3, -width, r * 0.55 + length, width);
        metal.addColorStop(0, "#1a1f29");
        metal.addColorStop(0.5, "#5d6778");
        metal.addColorStop(1, "#0b0e14");
        c.fillStyle = metal;
        c.fill();
        c.lineWidth = Math.max(1, r * 0.08);
        c.strokeStyle = "rgb(255 217 138 / 0.9)";
        c.stroke();
        c.restore();
      };
      blade(0, r * 1.45, r * 0.3);
      blade(Math.PI, r * 0.9, r * 0.26);
      blade(Math.PI / 2, r * 0.7, r * 0.22);
      blade(-Math.PI / 2, r * 0.7, r * 0.22);
      // The core: a gold rim round a 水色 crystal, a white heart.
      c.beginPath();
      c.arc(0, 0, r * 0.6, 0, TAU);
      c.fillStyle = "#15181f";
      c.fill();
      c.lineWidth = Math.max(1, r * 0.12);
      c.strokeStyle = GOLD;
      c.stroke();
      const core = c.createRadialGradient(-r * 0.12, -r * 0.14, 0, 0, 0, r * 0.5);
      core.addColorStop(0, "#ffffff");
      core.addColorStop(0.35, "#9ff2ff");
      core.addColorStop(0.75, "#3a8cff");
      core.addColorStop(1, "#1b2b6a");
      c.beginPath();
      c.arc(0, 0, r * 0.46, 0, TAU);
      c.fillStyle = core;
      c.fill();
    }
    // The chest's core: a white-ice heart in a rainbow ring.
    coreSize = Math.max(24, Math.round(figW * 0.34 * ratio));
    const cs = coreSize * 2;
    coreSprite = makeCanvas(cs, cs);
    const cc = coreSprite.getContext("2d");
    if (cc) {
      cc.translate(cs / 2, cs / 2);
      const rr = coreSize;
      const heart = cc.createRadialGradient(0, 0, 0, 0, 0, rr);
      heart.addColorStop(0, "rgb(255 255 255 / 0.95)");
      heart.addColorStop(0.12, "rgb(190 246 255 / 0.7)");
      heart.addColorStop(0.4, "rgb(143 240 255 / 0.16)");
      heart.addColorStop(1, "rgb(143 240 255 / 0)");
      cc.fillStyle = heart;
      cc.fillRect(-rr, -rr, cs, cs);
      const conic = (cc as CanvasRenderingContext2D & {
        createConicGradient?: (angle: number, x: number, y: number) => CanvasGradient;
      }).createConicGradient;
      if (typeof conic === "function") {
        const rainbow = conic.call(cc, 0, 0, 0);
        for (let k = 0; k <= 12; k += 1)
          rainbow.addColorStop(k / 12, `hsl(${(k * 30) % 360} 100% 72%)`);
        cc.beginPath();
        cc.arc(0, 0, rr * 0.5, 0, TAU);
        cc.arc(0, 0, rr * 0.4, 0, TAU, true);
        cc.fillStyle = rainbow;
        cc.globalAlpha = 0.7;
        cc.fill();
        cc.globalAlpha = 1;
      } else {
        cc.beginPath();
        cc.arc(0, 0, rr * 0.45, 0, TAU);
        cc.lineWidth = rr * 0.1;
        cc.strokeStyle = "rgb(201 155 255 / 0.7)";
        cc.stroke();
      }
    }
    // The crystal sweep's band, in its own box (translated into place).
    if (context) {
      sweepHeight = Math.max(24, figH * 0.2);
      sweepGradient = context.createLinearGradient(0, -sweepHeight / 2, 0, sweepHeight / 2);
      sweepGradient.addColorStop(0, "rgb(143 240 255 / 0)");
      sweepGradient.addColorStop(0.45, "rgb(190 246 255 / 0.55)");
      sweepGradient.addColorStop(0.55, "rgb(255 255 255 / 0.7)");
      sweepGradient.addColorStop(1, "rgb(143 240 255 / 0)");
    }
  };

  const buildCache = () => {
    cacheW = Math.max(1, Math.round(figW * ratio));
    cacheH = Math.max(1, Math.round(figH * ratio));
    cache = makeCanvas(cacheW, cacheH);
    cacheContext = cache.getContext("2d");
    cacheCount = 0;
  };

  const ensureField = () => {
    if (layer || fieldFailed || !stage) return;
    try {
      layer = createFieldLayer({
        document: doc,
        coarse,
        take,
        count: FAR_FROM_BUDGET.field[tier],
        front: !coarse,
        className: "ffs-field",
        fragment: farFromFragment,
        tones: FAR_FROM_TONES,
      });
    } catch {
      layer = null;
    }
    if (!layer) {
      fieldFailed = true;
      return;
    }
    // The back canvas under the scene's, the front one over it.
    for (const c of layer.canvases) {
      if (c.dataset.side === "front") canvas.after(c);
      else canvas.before(c);
    }
    layer.resize(W, H, ratio);
  };

  const ensureMotes = () => {
    if (moteSeeds) return;
    const all = new Float64Array(moteCount * FIELD_SEEDS.LENGTH);
    moteSeeds = [];
    for (let i = 0; i < moteCount; i += 1) {
      const sub = all.subarray(i * FIELD_SEEDS.LENGTH, (i + 1) * FIELD_SEEDS.LENGTH);
      fieldSeeds(i, take.arms, sub, farFromFragment);
      moteSeeds.push(sub);
    }
  };

  // Draws cell `i` of the plan from the plate into `c` at the figure's
  // box scaled by `k` (device px of the cache, or CSS px of the stage).
  const drawCell = (
    c: CanvasRenderingContext2D,
    i: number,
    x0: number,
    y0: number,
    w: number,
    h: number,
    snap: boolean,
  ) => {
    if (!plate) return;
    const pw = plate.width;
    const ph = plate.height;
    const u = plan.u[i];
    const v = plan.v[i];
    let dx = x0 + u * w;
    let dy = y0 + v * h;
    let dw = plan.su * w;
    let dh = plan.sv * h;
    if (snap) {
      const x1 = Math.round(x0 + (u + plan.su) * w);
      const y1 = Math.round(y0 + (v + plan.sv) * h);
      dx = Math.round(dx);
      dy = Math.round(dy);
      dw = x1 - dx;
      dh = y1 - dy;
    }
    c.drawImage(plate, u * pw, v * ph, plan.su * pw, plan.sv * ph, dx, dy, dw, dh);
  };

  const drawRing = (
    c: CanvasRenderingContext2D,
    ring: (typeof FAR_FROM_RINGS)[number],
    sweep: number,
    front: boolean,
    alpha: number,
  ) => {
    if (sweep <= 0) return;
    const cx = figX + ring.cu * figW;
    const cy = figY + ring.cv * figH;
    const rx = ring.ru * figW;
    const ry = ring.rv * figH;
    const s = sweep * Math.PI;
    const top = -Math.PI / 2;
    c.beginPath();
    if (!front) {
      c.ellipse(cx, cy, rx, ry, 0, top, top + s, false);
      c.moveTo(cx + Math.cos(top) * rx, cy + Math.sin(top) * ry);
      c.ellipse(cx, cy, rx, ry, 0, top, top - s, true);
    } else {
      if (s <= Math.PI / 2) return;
      c.ellipse(cx, cy, rx, ry, 0, 0, top + s, false);
      c.moveTo(cx + Math.cos(Math.PI) * rx, cy + Math.sin(Math.PI) * ry);
      c.ellipse(cx, cy, rx, ry, 0, Math.PI, top - s + TAU, true);
    }
    const [bright, soft] = RING_TONES[ring.tone];
    c.lineCap = "round";
    c.globalAlpha = alpha * 0.16;
    c.lineWidth = Math.max(6, figW * 0.022);
    c.strokeStyle = soft;
    c.stroke();
    c.globalAlpha = alpha * 0.45;
    c.lineWidth = Math.max(2.5, figW * 0.007);
    c.stroke();
    c.globalAlpha = alpha;
    c.lineWidth = Math.max(1, figW * 0.0022);
    c.strokeStyle = bright;
    c.stroke();
  };

  const drawBits = (c: CanvasRenderingContext2D, front: boolean) => {
    if (!bitSprite) return;
    const size = bitSize / ratio;
    for (let k = 0; k < bitCount; k += 1) {
      const o = k * 6;
      const alpha = bitPoses[o + 4];
      if (!(alpha > 0)) continue;
      const z = bitPoses[o + 2];
      if (front ? z < 0 : z >= 0) continue;
      const x = figX + bitPoses[o] * figW;
      const y = figY + bitPoses[o + 1] * figH;
      const s = bitPoses[o + 3] * size;
      c.globalAlpha = alpha;
      c.setTransform(ratio, 0, 0, ratio, 0, 0);
      c.translate(x, y);
      c.rotate(bitPoses[o + 5]);
      c.drawImage(bitSprite, -s, -s, s * 2, s * 2);
    }
    c.setTransform(ratio, 0, 0, ratio, 0, 0);
    c.globalAlpha = 1;
  };

  const drawMotes = (c: CanvasRenderingContext2D, p: number) => {
    if (!moteSeeds || !(state[FIELD_STATE.CHARGE] > 0)) return;
    const s = state[FIELD_STATE.S];
    const wake = state[FIELD_STATE.WAKE];
    const rate = state[FIELD_STATE.WAKE_RATE];
    const streak = FIELD_SHAPE.streak * 1.5;
    const unit = figH;
    const count = Math.floor(moteCount * quality);
    c.globalCompositeOperation = "lighter";
    c.lineCap = "round";
    for (let tone = 0; tone < 3; tone += 1) {
      c.beginPath();
      let any = false;
      for (let i = tone; i < count; i += 3) {
        const seeds = moteSeeds[i];
        fieldPose(seeds, s, state, take, FAR_FROM_FIGURE.height, moteOut, wake);
        const light = moteOut[4];
        if (!(light > 0.02)) continue;
        fieldPose(seeds, s - streak, state, take, FAR_FROM_FIGURE.height, moteTail, wake - streak * rate);
        const x1 = figX + moteOut[0] * unit;
        const y1 = figY + moteOut[1] * unit;
        const x0 = figX + moteTail[0] * unit;
        const y0 = figY + moteTail[1] * unit;
        c.moveTo(x0, y0);
        c.lineTo(x1, y1);
        any = true;
      }
      if (any) {
        c.globalAlpha = 0.5 * Math.min(1, state[FIELD_STATE.CHARGE]) * (0.6 + 0.4 * (1 - p));
        c.lineWidth = Math.max(1, figH * 0.0028) * (tone === 2 ? 0.8 : 1);
        c.strokeStyle = MOTE_TONES[tone];
        c.stroke();
      }
    }
    c.globalAlpha = 1;
    c.globalCompositeOperation = "source-over";
  };

  const scene: FarFromScene = {
    take,
    get field() {
      return Boolean(layer?.ready);
    },
    resize(width, height, devicePixelRatio = 1) {
      if (released || !(width > 0) || !(height > 0)) return;
      W = width;
      H = height;
      ratio = Math.min(FAR_FROM_BUDGET.ratio[tier], Math.max(1, devicePixelRatio || 1));
      figH = Math.min(H * FAR_FROM_STAGE.height, (W * FAR_FROM_STAGE.width) / ASPECT);
      figW = figH * ASPECT;
      figX = (W - figW) / 2;
      figY = H - figH - H * FAR_FROM_STAGE.bottom;
      const cw = Math.round(W * ratio);
      const ch = Math.round(H * ratio);
      if (canvas.width !== cw) canvas.width = cw;
      if (canvas.height !== ch) canvas.height = ch;
      buildPlate();
      buildSprites();
      buildCache();
      layer?.resize(W, H, ratio);
    },
    render(progress) {
      if (released || !context || !plate || !cache || !cacheContext) return 0;
      const started = performance.now();
      const p = clamp01(progress);
      const c = context;
      c.setTransform(ratio, 0, 0, ratio, 0, 0);
      c.globalAlpha = 1;
      c.globalCompositeOperation = "source-over";
      c.clearRect(0, 0, W, H);

      // The landed cache: a prefix of the plan; cleared when the scroll
      // runs back, filled under the budget.
      const target = farFromLandedCount(plan, p);
      if (target < cacheCount) {
        cacheContext.clearRect(0, 0, cacheW, cacheH);
        cacheCount = 0;
      }
      const fill = Math.min(target, cacheCount + cacheBudget);
      for (let i = cacheCount; i < fill; i += 1) drawCell(cacheContext, i, 0, 0, cacheW, cacheH, true);
      cacheCount = fill;
      const owed = target - cacheCount;
      const landedShare = target / plan.count;

      // The field's state on the progress clock.
      fieldState(score, p, state);

      // 1. The hologram the cells land on, with the gather's scan.
      const wake = smooth(span(p, 0, FAR_FROM_WINDOWS.gather[1]));
      const holoAlpha = 0.2 * wake * Math.pow(1 - landedShare, 1.5);
      if (holo && holoAlpha > 0.004) {
        c.globalAlpha = holoAlpha;
        c.drawImage(holo, figX, figY, figW, figH);
        c.globalAlpha = 1;
      }
      if (p < FAR_FROM_WINDOWS.legs[0] + 0.04) {
        const scan = span(p, 0, FAR_FROM_WINDOWS.legs[0] + 0.04);
        const y = figY + figH * (1 - scan);
        c.globalCompositeOperation = "lighter";
        c.globalAlpha = 0.5 * bell(scan);
        c.fillStyle = ICE;
        c.fillRect(figX, y - 1, figW, 2);
        c.globalAlpha = 1;
        c.globalCompositeOperation = "source-over";
      }

      // 2. Behind the body: the rings' far halves, the bits behind.
      for (let k = 0; k < bitCount; k += 1) {
        farFromBitPose(k, bitCount, p, take, bitOut);
        bitPoses.set(bitOut, k * 6);
      }
      c.globalCompositeOperation = "lighter";
      for (let r = 0; r < FAR_FROM_RINGS.length; r += 1)
        drawRing(c, FAR_FROM_RINGS[r], farFromRingSweep(FAR_FROM_RINGS[r], p), false, 0.55);
      c.globalCompositeOperation = "source-over";
      c.globalAlpha = 1;
      drawBits(c, false);

      // 3. The figure: the landed cells, those still owed to the cache,
      // the cells in flight with their trails, the landing flashes.
      c.drawImage(cache, 0, 0, cacheW, cacheH, figX, figY, figW, figH);
      for (let i = cacheCount; i < target; i += 1) drawCell(c, i, figX, figY, figW, figH, false);
      const flying = upperBound(plan.land, p + FAR_FROM_FLIGHT, plan.count);
      const trails = quality >= 1;
      if (flying > target) {
        if (trails) {
          c.beginPath();
          for (let i = target; i < flying; i += 1) {
            farFromCellPose(plan, i, p, cellOut);
            if (!(cellOut[3] > 0)) continue;
            c.moveTo(figX + cellOut[5] * figW, figY + cellOut[6] * figH);
            c.lineTo(figX + cellOut[0] * figW, figY + cellOut[1] * figH);
          }
          c.globalCompositeOperation = "lighter";
          c.globalAlpha = 0.28;
          c.lineWidth = Math.max(1, figH * 0.0022);
          c.lineCap = "round";
          c.strokeStyle = ICE;
          c.stroke();
          c.globalCompositeOperation = "source-over";
          c.globalAlpha = 1;
        }
        const cw = plan.su * figW;
        const ch = plan.sv * figH;
        for (let i = target; i < flying; i += 1) {
          farFromCellPose(plan, i, p, cellOut);
          const alpha = cellOut[3];
          if (!(alpha > 0)) continue;
          const s = cellOut[2];
          c.setTransform(ratio, 0, 0, ratio, 0, 0);
          c.translate(figX + cellOut[0] * figW, figY + cellOut[1] * figH);
          c.rotate(cellOut[4]);
          c.scale(s, s);
          c.globalAlpha = alpha;
          c.drawImage(
            plate,
            plan.u[i] * plate.width,
            plan.v[i] * plate.height,
            plan.su * plate.width,
            plan.sv * plate.height,
            -cw / 2,
            -ch / 2,
            cw,
            ch,
          );
          // A crystal edge on the chip as it flies.
          c.globalAlpha = alpha * 0.35 * (1 - s);
          c.fillStyle = ICE;
          c.fillRect(-cw / 2, -ch / 2, cw, ch);
        }
        c.setTransform(ratio, 0, 0, ratio, 0, 0);
        c.globalAlpha = 1;
      }
      const flashed = upperBound(plan.land, p - FAR_FROM_LAND_FLASH, plan.count);
      if (target > flashed) {
        const cw = plan.su * figW;
        const ch = plan.sv * figH;
        c.globalCompositeOperation = "lighter";
        c.fillStyle = WHITE;
        for (let i = flashed; i < target; i += 1) {
          const age = (p - plan.land[i]) / FAR_FROM_LAND_FLASH;
          c.globalAlpha = 0.55 * (1 - age);
          c.fillRect(figX + plan.u[i] * figW, figY + plan.v[i] * figH, cw, ch);
        }
        c.globalCompositeOperation = "source-over";
        c.globalAlpha = 1;
      }

      // 4. The crystal light: a band sweeping up the finished armour.
      const sweep = span(p, FAR_FROM_WINDOWS.crystal[0], FAR_FROM_WINDOWS.crystal[1]);
      if (sweep > 0 && sweep < 1 && sweepGradient) {
        c.globalCompositeOperation = "source-atop";
        c.globalAlpha = 0.85 * bell(sweep);
        c.translate(0, figY + figH * (1 - sweep));
        c.fillStyle = sweepGradient;
        c.fillRect(figX, -sweepHeight / 2, figW, sweepHeight);
        c.setTransform(ratio, 0, 0, ratio, 0, 0);
        c.globalAlpha = 1;
        c.globalCompositeOperation = "source-over";
      }

      // 5. The core: ignites with the field's detonation, then holds.
      const ignite = span(p, FAR_FROM_WINDOWS.core[0], FAR_FROM_WINDOWS.core[1]);
      if (ignite > 0 && coreSprite) {
        const hold = 0.34;
        const strength = hold + (1 - hold) * bell(Math.min(1, ignite * 1.25));
        const size = (coreSize / ratio) * (0.55 + 0.45 * easeOut(ignite));
        const cx = figX + FAR_FROM_MARKS.core[0] * figW;
        const cy = figY + FAR_FROM_MARKS.core[1] * figH;
        c.globalCompositeOperation = "lighter";
        c.globalAlpha = strength;
        c.translate(cx, cy);
        c.rotate(p * 3 * take.hand);
        c.drawImage(coreSprite, -size, -size, size * 2, size * 2);
        c.setTransform(ratio, 0, 0, ratio, 0, 0);
        c.globalAlpha = 1;
        c.globalCompositeOperation = "source-over";
      }

      // 6. In front: the rings' near halves and the bits in front.
      c.globalCompositeOperation = "lighter";
      for (let r = 0; r < FAR_FROM_RINGS.length; r += 1)
        drawRing(c, FAR_FROM_RINGS[r], farFromRingSweep(FAR_FROM_RINGS[r], p), true, 0.9);
      c.globalCompositeOperation = "source-over";
      c.globalAlpha = 1;
      drawBits(c, true);

      // 7. The field: the WebGL layer under and over the scene, or the
      // CPU motes on the same poses.
      ensureField();
      if (layer?.ready) {
        layer.render(state, figH / FAR_FROM_FIGURE.height, figX, figY, FAR_FROM_FIGURE.height, quality);
      } else {
        ensureMotes();
        drawMotes(c, p);
      }

      // 8. The last light: one brief wash as the halo closes.
      const close = span(p, 0.965, 1);
      if (close > 0) {
        c.globalCompositeOperation = "lighter";
        c.globalAlpha = 0.16 * bell(close);
        c.fillStyle = WHITE;
        c.fillRect(0, 0, W, H);
        c.globalAlpha = 1;
        c.globalCompositeOperation = "source-over";
      }

      // The governor.
      const elapsed = performance.now() - started;
      cost += (elapsed - cost) * 0.2;
      if (cost > 22 && quality > 0.5) quality = 0.5;
      else if (cost < 11 && quality < 1) quality = 1;
      return owed;
    },
    release() {
      if (released) return;
      released = true;
      layer?.release();
      layer = null;
      plate = holo = cache = bitSprite = coreSprite = null;
      cacheContext = null;
      moteSeeds = null;
      canvas.width = canvas.height = 0;
    },
  };
  return scene;
}
