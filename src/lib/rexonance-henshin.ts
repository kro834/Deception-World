/* REXONANCE HENSHIN — the suit-up's bank direction (owner, 2026-11-01:
   「装着アニメーションを大きく改善して」). Rexonance and Meta Unitas share
   the suit-up engine (rexonance-resonance.js); this module stages it as a
   tokusatsu henshin bank — the omen, the nanite torrent, each part flying in
   and LOCKING, the whole-body seal, the afterglow and the held pose — with:

   - a stepped clock (scroll only): each DEUS！ part's window of the scroll is
     split into a gather (the engine creeps), the fly-in (the engine runs the
     part's whole flight) and a lock hold (the part stays seated while the
     camera and the clamp land). The engine only receives this clock through
     its own `config.progress` option: FAR FROM, ILLUSIONCULUM and
     /transformation-lab never mount the director and play as before;
   - a camera: a push on the driver for the omen, a whip out with a roll for
     the torrent, a cut to each part (legs, arms, chest, waist; in the
     Rexonance entry a ratchet tilt up the body, one notch per DEUS！), an
     inhale before each lock and a punch after it, a push to the helmet, a
     whip back to the whole body for the seal and a slow push into the held
     pose that ends exactly on the rest frame (identity);
   - one overlay canvas: the omen's vignette and the driver's heartbeat, the
     torrent's inflow, the anime focus lines while a part flies in, the
     lock's clamp (four brackets closing on the part, a hex lock ring,
     sparks), the seal's two light blades closing on the driver over a hex
     shell, and the pose's eye glint.

   Everything is closed-form in the clock the caller passes (scrubbing back
   plays it backwards), small-area light only (no red, no full-screen
   white; the seal ring is the one larger light and comes once). The camera
   writes one matrix per moved layer only when it changes; the overlay sizes
   by the device's tier. Reduced motion, economy and the still tiers never
   start it (the scene is never live there). */

import { hasConstrainedResources } from "./rendering-profile.js";

export type HenshinTone = readonly [number, number, number];
export type HenshinPalette = {
  /** The lock's and the torrent's main light. */
  readonly a: HenshinTone;
  /** The second light (the focus lines' accents, the blades' rim). */
  readonly b: HenshinTone;
  /** The sparks' hot tone. */
  readonly c: HenshinTone;
};
export const REXONANCE_HENSHIN_PALETTE: HenshinPalette = {
  a: [121, 232, 255],
  b: [255, 143, 216],
  c: [242, 216, 150],
};
export const META_UNITAS_HENSHIN_PALETTE: HenshinPalette = {
  a: [86, 226, 214],
  b: [255, 168, 92],
  c: [255, 214, 150],
};

type Piece = {
  readonly group: string;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
};
export type HenshinFigure = {
  readonly size: { readonly width: number; readonly height: number };
  readonly pieces: readonly Piece[];
  readonly core: readonly [number, number];
  readonly visor: readonly [number, number];
  readonly belt: readonly [number, number];
};

/** A lock: the part's box (figure px), when its fly-in starts, when it seats. */
export type HenshinLock = {
  readonly box: readonly [number, number, number, number];
  readonly from: number;
  readonly at: number;
  readonly zoom: number;
  readonly weight: number;
};
/** A camera key: at, zoom, focus (figure px), roll (deg). */
type Key = readonly [number, number, number, number, number];
export type HenshinSheet = {
  /** The clock's units per millisecond (1 for the entry's ms). */
  readonly perMs: number;
  readonly keys: readonly Key[];
  readonly locks: readonly HenshinLock[];
  readonly omen: readonly [number, number];
  readonly torrent: readonly [number, number];
  /** The blades start, meet at the driver, the shell has faded. */
  readonly seal: readonly [number, number, number];
  /** The pose's glint. */
  readonly glint: number;
  /** The omen's vignette (off for an entry whose clock starts late: its
   * sudden arrival would read as a flash). */
  readonly vignette: boolean;
};

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth = (x: number) => {
  const u = clamp01(x);
  return u * u * (3 - 2 * u);
};
const easeOut = (x: number) => 1 - (1 - clamp01(x)) ** 3;
const easeIn = (x: number) => clamp01(x) ** 2;
const span = (t: number, from: number, to: number) => clamp01((t - from) / (to - from));
const hash = (n: number) => {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
};

/* ---------------- the part boxes ---------------- */

const BEAT_GROUPS: readonly (readonly string[])[] = [
  ["legs"],
  ["arms"],
  ["chest", "shoulders"],
  ["waist"],
  ["tail", "ribbon", "bits"],
  ["helm"],
];
function groupBox(figure: HenshinFigure, groups: readonly string[]) {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const piece of figure.pieces) {
    if (!groups.includes(piece.group)) continue;
    x0 = Math.min(x0, piece.x);
    y0 = Math.min(y0, piece.y);
    x1 = Math.max(x1, piece.x + piece.w);
    y1 = Math.max(y1, piece.y + piece.h);
  }
  if (!Number.isFinite(x0)) {
    const [cx, cy] = figure.core;
    return [cx - 60, cy - 60, 120, 120] as const;
  }
  return [x0, y0, x1 - x0, y1 - y0] as const;
}
const centre = (box: readonly [number, number, number, number]) =>
  [box[0] + box[2] / 2, box[1] + box[3] / 2] as const;

/* ---------------- the scroll's stepped clock ---------------- */

/** The engine's DEUS！ windows (rexonance-resonance.js ASSEMBLY_BEATS.deus). */
const DEUS: readonly [number, number] = [0.16, 0.62];
const DEUS_STEP = (DEUS[1] - DEUS[0]) / 4;
/** Within a part's window: the gather ends, the fly-in has seated it. */
export const HENSHIN_GATHER = 0.3;
export const HENSHIN_SEAT = 0.62;
const GATHER_SHARE = 0.2;
/** The plates seated by the clamp; the rest settle until HENSHIN_LOCKED. */
const SEATED = 0.95;
export const HENSHIN_LOCKED = 0.8;

/** The scroll's progress as the engine receives it: each DEUS！ part creeps
 * through its gather, flies in at once and holds while it locks. Elsewhere
 * (the scan, the fire, the tail, the helmet, the seal, the light) unchanged.
 * Continuous and monotonic. */
export function henshinProgress(q: number) {
  if (!(q > DEUS[0]) || q >= DEUS[1]) return q;
  const beat = Math.min(3, Math.floor((q - DEUS[0]) / DEUS_STEP));
  const from = DEUS[0] + beat * DEUS_STEP;
  const u = (q - from) / DEUS_STEP;
  const e =
    u < HENSHIN_GATHER
      ? GATHER_SHARE * smooth(u / HENSHIN_GATHER)
      : u < HENSHIN_SEAT
        ? GATHER_SHARE +
          (SEATED - GATHER_SHARE) * smooth((u - HENSHIN_GATHER) / (HENSHIN_SEAT - HENSHIN_GATHER))
        : u < HENSHIN_LOCKED
          ? SEATED + (1 - SEATED) * ((u - HENSHIN_SEAT) / (HENSHIN_LOCKED - HENSHIN_SEAT))
          : 1;
  // The last few plates settle through the clamp (the engine never rests
  // mid-call: at rest it clears its transient squares, a dip in the light),
  // then the part holds. Written as the engine writes its windows
  // (from + (beat + 1) · step), so a layer's `p >= window end` holds there.
  return DEUS[0] + (beat + e) * DEUS_STEP;
}

/** The scroll scene's sheet, in its progress (0–1). */
export function henshinScrollSheet(
  figure: HenshinFigure,
  options: { omenPush?: boolean; steppedClock?: boolean } = {},
): HenshinSheet {
  // On the stepped clock a part seats at HENSHIN_SEAT of its window; on the
  // engine's own (an entry) its plates are in near the window's end.
  const seat = options.steppedClock === false ? 0.9 : HENSHIN_SEAT;
  const gather = options.steppedClock === false ? 0.45 : HENSHIN_GATHER;
  const perMs = DEUS_STEP / 360;
  const box = BEAT_GROUPS.map((groups) => groupBox(figure, groups));
  const [cx] = figure.core;
  const [bx, by] = figure.belt;
  const [vx, vy] = figure.visor;
  const H = figure.size.height;
  const midY = H * 0.5;
  // The omen's push lets go as the fire lights (q 0.02): a blaze moved or
  // enlarged by the camera reads as flashing, so the fire burns in the
  // still, whole frame; the torrent then rushes in with a roll.
  // An entry under a cover (Meta Unitas) starts its clock when the engine
  // joins, a moment before the fire: there the omen is the vignette and the
  // driver's heartbeat on the whole frame (omenPush: false).
  const push = options.omenPush === false ? 0 : 1;
  const keys: Key[] = [
    [0, 1 + 0.32 * push, push ? bx : cx, push ? by : midY, 0],
    [0.012, 1 + 0.36 * push, push ? bx : cx, push ? by : midY, 0],
    [0.034, 1, cx, midY, 0],
    [0.09, 1, cx, midY, 0],
    [0.128, 1 + 0.07 * push, cx, midY, -1.4 * push],
    [0.158, 1, cx, midY, 0],
  ];
  const locks: HenshinLock[] = [];
  const zooms = [1.3, 1.34, 1.42, 1.5];
  for (let beat = 0; beat < 4; beat += 1) {
    const from = DEUS[0] + beat * DEUS_STEP;
    const [fx, fy] = centre(box[beat]);
    const zoom = zooms[beat];
    keys.push([from + DEUS_STEP * 0.26, zoom, fx, fy, beat % 2 ? 0.6 : -0.6]);
    keys.push([from + DEUS_STEP * seat, zoom + 0.05, fx, fy, 0]);
    keys.push([from + DEUS_STEP * 0.97, zoom * 0.98, fx, fy, 0]);
    locks.push({
      box: box[beat],
      from: from + DEUS_STEP * gather,
      at: from + DEUS_STEP * seat,
      zoom,
      weight: 1,
    });
  }
  // REXONANCE！: the tail and the ribbons sweep round — a wide shot with a
  // roll; then a slow push up to the helmet, which clamps last.
  const [tx, ty] = centre(box[4]);
  keys.push([0.66, 1.06, (tx + cx) / 2, (ty + midY) / 2, 1.6]);
  keys.push([0.74, 1.12, cx, midY * 0.9, 0.4]);
  keys.push([0.835, 1.5, vx, vy + 70, 0]);
  locks.push({ box: box[4], from: 0.72, at: 0.8, zoom: 1.1, weight: 0.8 });
  locks.push({ box: box[5], from: 0.8, at: 0.846, zoom: 1.5, weight: 1.25 });
  // The seal: whip back to the whole body; then the pose's slow push that
  // ends on the rest frame.
  keys.push([0.852, 1.52, vx, vy + 70, 0]);
  keys.push([0.872, 0.92, cx, midY, -0.8]);
  keys.push([0.905, 0.95, cx, midY, 0]);
  keys.push([1, 1, cx, midY, 0]);
  return {
    perMs,
    keys,
    locks,
    omen: [0, 0.03],
    torrent: [0.09, 0.16],
    seal: [0.85, 0.874, 0.905],
    glint: 0.915,
    vignette: push === 1,
  };
}

/** The Rexonance entry's sheet, in its canonical ms (rexonance-calls.ts:
 * Ultra DEUS！ REXONANCE！ 0, RIDER！ 330, the chant 650 with a DEUS！ every
 * 120 ms from 880, the response 1300, REXONANCE DEUS！ 1980). */
export function henshinEntrySheet(
  figure: HenshinFigure,
  beats: {
    readonly rider: number;
    readonly chant: number;
    readonly snaps: readonly number[];
    readonly response: number;
    readonly tail: number;
    readonly helm: number;
    readonly final: number;
  },
): HenshinSheet {
  const box = BEAT_GROUPS.map((groups) => groupBox(figure, groups));
  const [cx] = figure.core;
  const [bx, by] = figure.belt;
  const [vx, vy] = figure.visor;
  const midY = figure.size.height * 0.5;
  // The chant's ratchet: legs, waist, arms, chest — up the body.
  const order = [0, 3, 1, 2];
  const zooms = [1.32, 1.46, 1.3, 1.42];
  // The omen's push lets go as RIDER！ lights the fire (a blaze moved or
  // enlarged by the camera reads as flashing): the fire burns in the still,
  // whole frame; the nanites' burst then rushes in with a roll.
  const burst = beats.rider + 230;
  const keys: Key[] = [
    [0, 1.32, bx, by, 0],
    [beats.rider - 70, 1.38, bx, by, 0],
    [beats.rider + 10, 1, cx, midY, 0],
    [burst, 1, cx, midY, 0],
    [burst + 120, 1.07, cx, midY, -1.4],
    [beats.chant + 60, 1, cx, midY, 0],
  ];
  const locks: HenshinLock[] = [];
  let previous = beats.chant;
  beats.snaps.forEach((at, index) => {
    const beat = order[index];
    const [fx, fy] = centre(box[beat]);
    const zoom = zooms[index];
    const from = index === 0 ? beats.chant + 70 : previous + 14;
    keys.push([from + Math.min(60, (at - from) * 0.4), zoom, fx, fy, 0]);
    keys.push([at, zoom + 0.04, fx, fy, 0]);
    locks.push({ box: box[beat], from, at, zoom, weight: index === 0 ? 1.15 : 0.9 });
    previous = at;
  });
  const [tx, ty] = centre(box[4]);
  keys.push([beats.response + 60, 1.04, cx, midY, 1.2]);
  keys.push([beats.tail, 1.08, (tx + cx) / 2, (ty + midY) / 2, 1.4]);
  keys.push([beats.helm - 40, 1.46, vx, vy + 70, 0]);
  keys.push([beats.final, 1.5, vx, vy + 70, 0]);
  keys.push([beats.final + 110, 0.93, cx, midY, -0.8]);
  keys.push([beats.final + 260, 0.95, cx, midY, 0]);
  keys.push([beats.final + 760, 1, cx, midY, 0]);
  locks.push({
    box: box[2],
    from: beats.response,
    at: beats.response + 150,
    zoom: 1.04,
    weight: 0.6,
  });
  locks.push({ box: box[4], from: beats.response + 170, at: beats.tail, zoom: 1.08, weight: 0.7 });
  locks.push({ box: box[5], from: beats.tail + 60, at: beats.helm, zoom: 1.46, weight: 1.2 });
  return {
    perMs: 1,
    keys,
    locks,
    omen: [0, beats.rider],
    torrent: [burst, beats.chant + 60],
    seal: [beats.final - 10, beats.final + 90, beats.final + 330],
    glint: beats.final + 360,
    vignette: true,
  };
}

/* ---------------- the camera ---------------- */

export type HenshinCamera = {
  zoom: number;
  fx: number;
  fy: number;
  roll: number;
  /** The weight's drop after a lock (figure px). */
  dropY: number;
};
export function createHenshinCamera(): HenshinCamera {
  return { zoom: 1, fx: 0, fy: 0, roll: 0, dropY: 0 };
}

/** The camera at clock t (closed-form). */
export function henshinCamera(sheet: HenshinSheet, t: number, out: HenshinCamera) {
  const keys = sheet.keys;
  let k = 0;
  while (k < keys.length - 1 && t >= keys[k + 1][0]) k += 1;
  const a = keys[k];
  const b = keys[Math.min(k + 1, keys.length - 1)];
  const u = b[0] > a[0] ? smooth((t - a[0]) / (b[0] - a[0])) : 1;
  const mix = t <= keys[0][0] ? 0 : u;
  out.zoom = a[1] + (b[1] - a[1]) * mix;
  out.fx = a[2] + (b[2] - a[2]) * mix;
  out.fy = a[3] + (b[3] - a[3]) * mix;
  out.roll = a[4] + (b[4] - a[4]) * mix;
  out.dropY = 0;
  // Each lock: an inhale before it (the camera eases back), then the punch
  // (in, overshooting and settling), a small roll jolt and the weight's drop.
  let punch = 0;
  for (const lock of sheet.locks) {
    const d = (t - lock.at) / sheet.perMs;
    if (d < -90 || d >= 360) continue;
    if (d < 0) punch -= 0.03 * lock.weight * Math.sin((Math.PI * (d + 90)) / 90);
    else {
      // Damped, and gone by 360 ms (the next part's gather starts clean).
      const decay = Math.exp(-d / 120) * (1 - smooth((d - 200) / 160));
      punch += 0.085 * lock.weight * decay * Math.cos(d / 52);
      out.roll += 0.9 * lock.weight * Math.exp(-d / 90) * decay * Math.sin(d / 26);
      out.dropY += 7 * lock.weight * Math.exp(-d / 80) * decay * Math.sin(d / 34);
    }
  }
  out.zoom *= 1 + punch;
  return out;
}

/* ---------------- the stage: the figure's placement and the layers ---------------- */

export type HenshinView = {
  /** The figure's box in the host's px (top-left, scale). */
  x: number;
  y: number;
  s: number;
  /** The host's size (px). */
  width: number;
  height: number;
};
export type HenshinTarget = { element: HTMLElement; x: number; y: number };

/** How far the sheets' pushes reach on screen (the flash audit's bound: a
 * push moves the lit armour across the frame, so its cells' light swings). */
export const HENSHIN_DEPTH = 0.68;

/** The camera's map (host px → host px): a 2 × 3 matrix [a b c d e f]. */
export function henshinMatrix(
  camera: HenshinCamera,
  view: HenshinView,
  figure: HenshinFigure,
  shakeX: number,
  shakeY: number,
  out: Float64Array,
) {
  // Portrait stages (phones) hold the figure over the calls' band: the
  // pushes are shallower there, the cuts the same.
  const portrait = view.height > view.width * 1.1;
  const z = 1 + (camera.zoom - 1) * (portrait ? HENSHIN_DEPTH * 0.8 : HENSHIN_DEPTH);
  const r = (camera.roll * Math.PI) / 180;
  const cos = Math.cos(r) * z;
  const sin = Math.sin(r) * z;
  // The focus on screen, and where the camera brings it: toward the
  // figure's own centre as it pushes in (the subject stays in its zone).
  const fx = view.x + camera.fx * view.s;
  const fy = view.y + camera.fy * view.s;
  const gx = view.x + (figure.size.width / 2) * view.s;
  const gy = view.y + figure.size.height * 0.48 * view.s;
  const k = clamp01((z - 1) / 0.5) * 0.75;
  const tx = fx + (gx - fx) * k + shakeX;
  const ty = fy + (gy - fy) * k + shakeY + camera.dropY * view.s;
  // p' = T + zR (p - F)
  out[0] = cos;
  out[1] = sin;
  out[2] = -sin;
  out[3] = cos;
  out[4] = tx - (cos * fx - sin * fy);
  out[5] = ty - (sin * fx + cos * fy);
  return out;
}

/** A figure point (figure px) on screen (host px) through the camera. */
const project = (m: Float64Array, view: HenshinView, fx: number, fy: number, out: Float64Array) => {
  const x = view.x + fx * view.s;
  const y = view.y + fy * view.s;
  out[0] = m[0] * x + m[2] * y + m[4];
  out[1] = m[1] * x + m[3] * y + m[5];
  return out;
};

/* ---------------- the overlay ---------------- */

export type HenshinTier = { lines: number; sparks: number; dpr: number; lattice: boolean };
export function henshinTier(environment: typeof globalThis = globalThis): HenshinTier {
  const coarse = Boolean(
    environment.matchMedia?.("(pointer: coarse), (any-pointer: coarse)").matches,
  );
  const nav = environment.navigator as Navigator | undefined;
  const constrained = Boolean(nav && hasConstrainedResources(nav));
  const dpr = environment.devicePixelRatio || 1;
  if (constrained) return { lines: 22, sparks: 5, dpr: 1, lattice: false };
  if (coarse) return { lines: 34, sparks: 8, dpr: Math.min(dpr, 1.5), lattice: true };
  return { lines: 56, sparks: 12, dpr: Math.min(dpr, 1.5), lattice: true };
}

const rgba = (tone: HenshinTone, alpha: number) =>
  `rgba(${tone[0]},${tone[1]},${tone[2]},${alpha.toFixed(3)})`;
const WHITE: HenshinTone = [244, 251, 255];

export class HenshinOverlay {
  readonly canvas: HTMLCanvasElement;
  private readonly context: CanvasRenderingContext2D | null;
  private readonly matrix = new Float64Array(6);
  private readonly point = new Float64Array(2);
  private readonly corner = new Float64Array(2);
  private lattice: CanvasPattern | null = null;
  private ratio = 1;
  private dirty = false;
  private lines: number;

  private readonly figure: HenshinFigure;
  private readonly palette: HenshinPalette;
  private readonly tier: HenshinTier;
  /** Whether the overlay draws its linework: the torrent's streaks, the
   * focus lines, the clamp's brackets, the lock's hex ring and sparks, the
   * seal's blades, lattice and ring, the pose's streak and star. Off (owner,
   * 2026-11-11: no line effects on Rexonance's suit-up, whose armour grows
   * as one front and has no plate to clamp), only the soft light stays: the
   * omen, each lock's glow and the seal's. */
  private readonly linework: boolean;

  constructor(
    canvas: HTMLCanvasElement,
    figure: HenshinFigure,
    palette: HenshinPalette,
    tier: HenshinTier,
    linework = true,
  ) {
    this.linework = linework;
    this.canvas = canvas;
    this.figure = figure;
    this.palette = palette;
    this.tier = tier;
    this.context = canvas.getContext("2d");
    this.lines = tier.lines;
  }

  /** A slow frame trims the focus lines; a quick run restores them. */
  govern(slow: boolean) {
    this.lines = slow
      ? Math.max(12, Math.floor(this.lines * 0.8))
      : Math.min(this.tier.lines, this.lines + 1);
  }

  resize(width: number, height: number) {
    const ratio = this.tier.dpr;
    const w = Math.max(1, Math.round(width * ratio));
    const h = Math.max(1, Math.round(height * ratio));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    this.ratio = ratio;
    this.dirty = true;
  }

  clear() {
    if (!this.context || !this.dirty) return;
    this.context.setTransform(1, 0, 0, 1, 0, 0);
    this.context.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.dirty = false;
  }

  dispose() {
    this.canvas.width = 0;
    this.canvas.height = 0;
    this.lattice = null;
  }

  /** Whether anything is drawn at clock t. */
  active(sheet: HenshinSheet, t: number) {
    const ms = sheet.perMs;
    if (t < sheet.torrent[1] + 160 * ms) return true;
    if (t >= sheet.seal[0] - 40 * ms && t <= sheet.glint + 700 * ms) return true;
    for (const lock of sheet.locks)
      if (t >= lock.from - 20 * ms && t <= lock.at + 560 * ms) return true;
    return false;
  }

  draw(sheet: HenshinSheet, t: number, camera: HenshinCamera, view: HenshinView) {
    const context = this.context;
    if (!context) return;
    this.clear();
    if (!this.active(sheet, t)) return;
    this.dirty = true;
    const m = henshinMatrix(camera, view, this.figure, 0, 0, this.matrix);
    context.setTransform(this.ratio, 0, 0, this.ratio, 0, 0);
    const ms = sheet.perMs;
    const { a, b, c } = this.palette;
    const z = camera.zoom * view.s;

    /* The omen: the frame closes in on the driver, which beats twice. */
    const omenFade = 1 - smooth(span(t, sheet.omen[1] - 80 * ms, sheet.omen[1] + 60 * ms));
    if (omenFade > 0.01 && sheet.vignette) {
      const [px, py] = project(m, view, this.figure.belt[0], this.figure.belt[1], this.point);
      const reach = Math.hypot(view.width, view.height) * 0.62;
      const vignette = context.createRadialGradient(px, py, reach * 0.18, px, py, reach);
      vignette.addColorStop(0, "rgba(0,0,0,0)");
      vignette.addColorStop(1, `rgba(1,4,8,${(0.62 * omenFade).toFixed(3)})`);
      context.fillStyle = vignette;
      context.fillRect(0, 0, view.width, view.height);
      const beat = span(t, sheet.omen[0], sheet.omen[1]) * 2;
      for (let n = 0; n < 2; n += 1) {
        const f = beat - n * 0.5;
        if (f <= 0 || f >= 1.4) continue;
        const g = clamp01(f / 1.4);
        context.strokeStyle = rgba(n ? b : a, 0.55 * (1 - g) * omenFade);
        context.lineWidth = 2;
        context.beginPath();
        context.ellipse(
          px,
          py,
          (24 + 150 * easeOut(g)) * z,
          (10 + 60 * easeOut(g)) * z,
          0,
          0,
          Math.PI * 2,
        );
        context.stroke();
      }
    }

    /* The torrent: streaks pouring in to the core, curling as they come. */
    const torrent =
      smooth(span(t, sheet.torrent[0] - 40 * ms, sheet.torrent[0] + 80 * ms)) *
      (1 - smooth(span(t, sheet.torrent[1] - 60 * ms, sheet.torrent[1] + 160 * ms)));
    if (torrent > 0.01 && this.linework) {
      const [px, py] = project(m, view, this.figure.core[0], this.figure.core[1], this.point);
      const reach = Math.hypot(view.width, view.height) * 0.55;
      const clock = (t - sheet.torrent[0]) / (ms * 420);
      context.lineCap = "round";
      for (let n = 0; n < this.lines; n += 1) {
        const f = (clock + hash(n * 3.1)) % 1;
        const angle = hash(n * 7.7) * Math.PI * 2 + (1 - f) * 0.9;
        const r0 = reach * (1 - f) ** 1.3 + 30 * z;
        const r1 = r0 + reach * 0.16 * (1 - f) + 12;
        const swirl = 0.25 * (1 - f);
        context.strokeStyle = rgba(n % 3 === 0 ? b : n % 3 === 1 ? a : WHITE, 0.5 * torrent * f);
        context.lineWidth = 1 + 1.6 * f;
        context.beginPath();
        context.moveTo(px + Math.cos(angle) * r0, py + Math.sin(angle) * r0);
        context.lineTo(px + Math.cos(angle - swirl) * r1, py + Math.sin(angle - swirl) * r1);
        context.stroke();
      }
    }

    /* Each part: the focus lines while it flies in, then the clamp. */
    for (const lock of sheet.locks) {
      const d = (t - lock.at) / ms;
      if (t < lock.from - 20 * ms || d > 560) continue;
      const [bx, by, bw, bh] = lock.box;
      const [px, py] = project(m, view, bx + bw / 2, by + bh / 2, this.point);
      const half = Math.max(bw, bh) * 0.5 * z;
      // The focus lines (集中線): from the frame's edge toward the part,
      // re-dealt every 40 ms of the clock like an anime bank's.
      const fly =
        smooth(span(t, lock.from, lock.from + (lock.at - lock.from) * 0.35)) *
        (1 - smooth(span(d, -20, 200)));
      if (fly > 0.01 && this.linework) {
        const deal = Math.floor(t / (40 * ms));
        const outer = Math.hypot(view.width, view.height);
        const count = Math.round(this.lines * lock.weight);
        for (let n = 0; n < count; n += 1) {
          const seed = n * 13.7 + deal * 0.37;
          const angle = (n / count) * Math.PI * 2 + hash(seed) * 0.22;
          const inner = half * (1.25 + hash(seed + 1.1) * 0.9) + 24;
          const width = (1.5 + hash(seed + 2.3) * 4.5) * (0.6 + 0.4 * fly);
          const cos = Math.cos(angle);
          const sin = Math.sin(angle);
          const ox = px + cos * outer;
          const oy = py + sin * outer;
          context.fillStyle = rgba(n % 7 === 0 ? b : WHITE, (0.05 + hash(seed + 4.2) * 0.1) * fly);
          context.beginPath();
          context.moveTo(px + cos * inner, py + sin * inner);
          context.lineTo(ox - sin * width, oy + cos * width);
          context.lineTo(ox + sin * width, oy - cos * width);
          context.closePath();
          context.fill();
        }
      }
      if (d < -80) continue;
      // The clamp: four brackets close on the part and bite.
      const close =
        d < 0 ? 1.5 - 0.5 * easeIn((d + 80) / 80) : 1 + 0.05 * Math.exp(-d / 60) * Math.cos(d / 30);
      const fade = d < 0 ? clamp01((d + 80) / 50) : 1 - smooth(span(d, 260, 520));
      if (fade > 0.01 && this.linework) {
        const [x0, y0] = project(m, view, bx, by, this.point);
        const [x1, y1] = project(m, view, bx + bw, by + bh, this.corner);
        const cx = (x0 + x1) / 2;
        const cy = (y0 + y1) / 2;
        const hw = (Math.abs(x1 - x0) / 2) * close + 6;
        const hh = (Math.abs(y1 - y0) / 2) * close + 6;
        const arm = Math.min(hw, hh) * 0.36 + 6;
        const bite = d >= 0 && d < 90;
        context.lineCap = "square";
        for (const pass of bite ? [0, 1] : [1]) {
          context.strokeStyle = pass ? rgba(a, 0.85 * fade) : rgba(WHITE, 0.9 * (1 - d / 90));
          context.lineWidth = pass ? 2 : 4.5;
          context.beginPath();
          for (const [sx, sy] of [
            [-1, -1],
            [1, -1],
            [1, 1],
            [-1, 1],
          ] as const) {
            const qx = cx + sx * hw;
            const qy = cy + sy * hh;
            context.moveTo(qx - sx * arm, qy);
            context.lineTo(qx, qy);
            context.lineTo(qx, qy - sy * arm);
          }
          context.stroke();
        }
      }
      if (d < 0) continue;
      // The lock: a hex ring turning shut, a small hot core and sparks.
      const ring = 1 - d / 380;
      if (ring > 0) {
        const r = half * (0.55 + 0.75 * easeOut(d / 300)) + 10;
        const turn = (Math.PI / 6) * easeOut(d / 260);
        if (this.linework) {
          context.strokeStyle = rgba(a, 0.7 * ring * lock.weight);
          context.lineWidth = 1.5 + 2 * ring;
          context.beginPath();
          for (let v = 0; v <= 6; v += 1) {
            const angle = turn + (v * Math.PI) / 3;
            const vx = px + Math.cos(angle) * r;
            const vy = py + Math.sin(angle) * r * 0.86;
            if (v) context.lineTo(vx, vy);
            else context.moveTo(vx, vy);
          }
          context.stroke();
        }
        const hot = Math.exp(-d / 90);
        const glow = context.createRadialGradient(
          px,
          py,
          0,
          px,
          py,
          (26 + 30 * lock.weight) * Math.sqrt(z),
        );
        glow.addColorStop(0, rgba(WHITE, 0.3 * hot));
        glow.addColorStop(0.4, rgba(a, 0.16 * hot));
        glow.addColorStop(1, rgba(a, 0));
        context.fillStyle = glow;
        context.fillRect(px - 120, py - 120, 240, 240);
      }
      const sparks = Math.round(this.tier.sparks * lock.weight);
      const life = 1 - d / 340;
      if (life > 0 && this.linework) {
        context.lineCap = "round";
        for (let n = 0; n < sparks; n += 1) {
          const seed = n * 5.3 + lock.at * 0.01;
          const angle = hash(seed) * Math.PI * 2;
          const speed = 0.35 + hash(seed + 1.7) * 0.55;
          const reach = half * 0.4 + speed * d;
          const sx = px + Math.cos(angle) * reach;
          const sy = py + Math.sin(angle) * reach + 0.0009 * d * d;
          const tail = 6 + 12 * speed * life;
          context.strokeStyle = rgba(n % 2 ? c : WHITE, 0.9 * life);
          context.lineWidth = 1.6;
          context.beginPath();
          context.moveTo(sx, sy);
          context.lineTo(sx - Math.cos(angle) * tail, sy - Math.sin(angle) * tail);
          context.stroke();
        }
      }
    }

    /* The seal: two blades run from the crown and the soles to the driver
       over a hex shell, which closes there in one ring. */
    const [s0, sm, s1] = sheet.seal;
    if (t >= s0 && t <= s1 + 260 * ms) {
      const W = this.figure.size.width;
      const H = this.figure.size.height;
      const beltY = this.figure.belt[1];
      const run = easeIn(span(t, s0, sm));
      const topY = beltY * run;
      const footY = H - (H - beltY) * run;
      const after = 1 - smooth(span(t, sm, s1));
      const [lx, ty] = project(m, view, W * 0.06, 0, this.point);
      const [rx, fy] = project(m, view, W * 0.94, H, this.corner);
      const shell = (t < sm ? 1 : after) * 0.9;
      if (shell > 0.01 && this.tier.lattice && this.linework) {
        const pattern = this.hexes(context);
        if (pattern) {
          const [, sy0] = project(m, view, 0, topY, this.point);
          const [, sy1] = project(m, view, 0, footY, this.corner);
          context.save();
          context.globalAlpha = 0.14 * shell;
          context.fillStyle = pattern;
          // The swept bands: the crown's down to its blade, the soles' up to theirs.
          if (t < sm) {
            context.fillRect(lx, ty, rx - lx, Math.max(0, sy0 - ty));
            context.fillRect(lx, sy1, rx - lx, Math.max(0, fy - sy1));
          } else context.fillRect(lx, ty, rx - lx, fy - ty);
          context.restore();
        }
      }
      if (t < sm + 40 * ms && this.linework) {
        for (const y of [topY, footY]) {
          const [, sy] = project(m, view, 0, y, this.point);
          const band = context.createLinearGradient(0, sy - 18, 0, sy + 18);
          band.addColorStop(0, rgba(a, 0));
          band.addColorStop(0.5, rgba(a, 0.45));
          band.addColorStop(1, rgba(a, 0));
          context.fillStyle = band;
          context.fillRect(lx - 30, sy - 18, rx - lx + 60, 36);
          context.fillStyle = rgba(WHITE, 0.85);
          context.fillRect(lx - 10, sy - 1, rx - lx + 20, 2);
        }
      }
      const d = (t - sm) / ms;
      if (d >= 0 && d < 520) {
        const [px, py] = project(m, view, this.figure.belt[0], beltY, this.point);
        const g = d / 520;
        const reach = H * view.s * camera.zoom * 0.62;
        if (this.linework) {
          context.strokeStyle = rgba(b, 0.7 * (1 - g));
          context.lineWidth = 3 * (1 - g) + 1;
          context.beginPath();
          context.ellipse(px, py, reach * easeOut(g), reach * easeOut(g) * 0.42, 0, 0, Math.PI * 2);
          context.stroke();
        }
        const glow = context.createRadialGradient(px, py, 0, px, py, 90);
        glow.addColorStop(0, rgba(WHITE, 0.22 * Math.exp(-d / 110)));
        glow.addColorStop(1, rgba(a, 0));
        context.fillStyle = glow;
        context.fillRect(px - 90, py - 90, 180, 180);
      }
    }

    /* The pose: the eyes' glint, a horizontal streak and a four-point star. */
    const g = (t - sheet.glint) / ms;
    if (g >= 0 && g < 700 && this.linework) {
      const [px, py] = project(m, view, this.figure.visor[0], this.figure.visor[1], this.point);
      const env = Math.sin(Math.PI * clamp01(g / 700)) ** 1.5;
      const length = this.figure.size.width * view.s * camera.zoom * (0.5 + 0.5 * easeOut(g / 400));
      const streak = context.createLinearGradient(px - length, 0, px + length, 0);
      streak.addColorStop(0, rgba(a, 0));
      streak.addColorStop(0.5, rgba(WHITE, 0.8 * env));
      streak.addColorStop(1, rgba(a, 0));
      context.fillStyle = streak;
      context.fillRect(px - length, py - 1.5, length * 2, 3);
      const star = 26 * env * Math.sqrt(camera.zoom * view.s * 1.6);
      context.fillStyle = rgba(WHITE, 0.9 * env);
      context.beginPath();
      context.moveTo(px, py - star);
      context.lineTo(px + star * 0.12, py);
      context.lineTo(px, py + star);
      context.lineTo(px - star * 0.12, py);
      context.closePath();
      context.moveTo(px - star * 1.4, py);
      context.lineTo(px, py - star * 0.1);
      context.lineTo(px + star * 1.4, py);
      context.lineTo(px, py + star * 0.1);
      context.closePath();
      context.fill();
    }
  }

  private hexes(context: CanvasRenderingContext2D) {
    if (this.lattice) return this.lattice;
    const size = 14;
    const w = Math.round(size * 3);
    const h = Math.round(size * Math.sqrt(3) * 2) / 1;
    const tile = this.canvas.ownerDocument.createElement("canvas");
    tile.width = w;
    tile.height = Math.round(h);
    const t = tile.getContext("2d");
    if (!t) return null;
    t.strokeStyle = rgba(this.palette.a, 1);
    t.lineWidth = 1;
    const hex = (cx: number, cy: number) => {
      t.beginPath();
      for (let v = 0; v <= 6; v += 1) {
        const angle = (v * Math.PI) / 3;
        const x = cx + Math.cos(angle) * size;
        const y = cy + Math.sin(angle) * size;
        if (v) t.lineTo(x, y);
        else t.moveTo(x, y);
      }
      t.stroke();
    };
    const rh = (size * Math.sqrt(3)) / 2;
    hex(0, 0);
    hex(0, rh * 2);
    hex(0, rh * 4);
    hex(size * 1.5, rh);
    hex(size * 1.5, rh * 3);
    hex(w, 0);
    hex(w, rh * 2);
    hex(w, rh * 4);
    this.lattice = context.createPattern(tile, "repeat");
    return this.lattice;
  }
}

/* ---------------- the scroll director ---------------- */

export type HenshinDirector = {
  /** The engine's clock: the stepped progress (rexonance-resonance.js
   * reads it through config.progress). */
  readonly progress: () => number;
  /** The raw progress → the stepped one (the layers that read their own). */
  readonly stepped: (raw: number) => number;
  /** A layer's own camera shake (px), added to the director's camera. */
  readonly shake: (x: number, y: number) => void;
  readonly dispose: () => void;
};

const directors = new WeakMap<Element, HenshinDirector>();
/** The director on a runway, if its page mounted one. */
export function henshinOf(runway: Element | null | undefined) {
  return runway ? (directors.get(runway) ?? null) : null;
}

const TARGETS =
  ":scope > :is(.rzn-canvas, .rzn-field, .rzn-surge, .rzn-under, .rzn-driver-standin, .mus-boost)";

/**
 * Mounts the bank's direction on a scroll runway (#assembly-runway, Meta
 * Unitas' #suitup and its entry's runway): returns the director, whose
 * `progress` the page passes to the engine as `config.progress`.
 */
export function mountHenshinDirector(
  runway: HTMLElement | null,
  options: {
    figure: HenshinFigure;
    palette: HenshinPalette;
    environment?: typeof globalThis;
  },
): HenshinDirector {
  const environment = options.environment ?? globalThis;
  const frameBox = runway?.querySelector<HTMLElement>(":scope > .rzn-frame") ?? null;
  const readRaw = () => {
    if (!runway || !frameBox) return 0;
    if (travel <= 0) measureRunway();
    if (travel <= 0) return 1;
    return clamp01((pinTop - runway.getBoundingClientRect().top) / travel);
  };
  let pinTop = 0;
  let travel = 0;
  const measureRunway = () => {
    if (!runway || !frameBox) return;
    pinTop = Number.parseFloat(environment.getComputedStyle(frameBox).top) || 0;
    travel = runway.offsetHeight - frameBox.offsetHeight;
  };
  const inert: HenshinDirector = {
    progress: () => henshinProgress(readRaw()),
    stepped: henshinProgress,
    shake: () => {},
    dispose: () => {},
  };
  if (!runway || !frameBox || typeof environment.requestAnimationFrame !== "function") return inert;
  const document = runway.ownerDocument;
  const figure = options.figure;
  const entry = Boolean(runway.closest(".mus-entry"));
  const sheet = henshinScrollSheet(figure, { omenPush: !entry, steppedClock: !entry });
  const tier = henshinTier(environment);
  const coarse = Boolean(environment.matchMedia?.("(pointer: coarse)").matches);
  const canvas = document.createElement("canvas");
  canvas.className = "rzn-henshin";
  canvas.setAttribute("aria-hidden", "true");
  canvas.width = 1;
  canvas.height = 1;
  Object.assign(canvas.style, {
    position: "absolute",
    inset: "0",
    width: "100%",
    height: "100%",
    zIndex: runway.closest(".mus-entry") ? "auto" : "1",
    pointerEvents: "none",
  });
  const overlay = new HenshinOverlay(canvas, figure, options.palette, tier);
  const camera = createHenshinCamera();
  const matrix = new Float64Array(6);
  const view: HenshinView = { x: 0, y: 0, s: 1, width: 0, height: 0 };
  let targets: HenshinTarget[] = [];
  let written = "";
  let measured = false;
  let placed = false;
  let raf = 0;
  let visible = true;
  let disposed = false;
  let shown = -1;
  let last = 0;
  let shakeX = 0;
  let shakeY = 0;
  let shakeAt = -Infinity;
  let ema = 16.7;

  const motionOff = () =>
    Boolean(environment.matchMedia?.("(prefers-reduced-motion: reduce)").matches) ||
    document.documentElement.dataset.worldEffects === "economy";
  // An entry's runway (Meta Unitas' .mus-entry) is staged from its cover's
  // first frame: the omen's push on the driver while the engine joins.
  const live = () =>
    (entry || runway.dataset.rznState === "live") && !document.hidden && visible && !motionOff();

  const place = () => {
    // Over the engine's canvas and the layers' front ones, under the calls.
    if (placed && canvas.isConnected) return;
    const anchor =
      frameBox.querySelector(":scope > .mus-boost-front") ??
      frameBox.querySelector(":scope > .rzn-surge.is-front") ??
      frameBox.querySelector(":scope > .rzn-canvas");
    if (!anchor) return;
    anchor.after(canvas);
    placed = true;
  };
  const rest = () => {
    for (const target of targets) {
      target.element.style.transform = "";
      target.element.style.transformOrigin = "";
      target.element.style.willChange = "";
    }
    targets = [];
    written = "";
  };
  const measure = () => {
    if (measured) return true;
    const scene = frameBox.querySelector<HTMLElement>(":scope > .rzn-canvas");
    if (!scene) return false;
    rest();
    const width = frameBox.clientWidth;
    const height = frameBox.clientHeight;
    if (!width || !height) return false;
    measureRunway();
    const style = environment.getComputedStyle(scene);
    const read = (name: string, fallback: number) =>
      Number.parseFloat(style.getPropertyValue(name)) || fallback;
    const W = figure.size.width;
    const H = figure.size.height;
    const sw = scene.clientWidth || width;
    const sh = scene.clientHeight || height;
    const figureHeight = Math.min(
      sh * read("--rzn-fig-h", 0.84),
      (sw * read("--rzn-fig-w", 0.9) * H) / W,
    );
    const s = figureHeight / H;
    const frameRect = frameBox.getBoundingClientRect();
    const sceneRect = scene.getBoundingClientRect();
    view.s = s;
    view.x = sceneRect.left - frameRect.left + sw * read("--rzn-fig-x", 0.5) - (W * s) / 2;
    view.y = sceneRect.top - frameRect.top + sh * (1 - read("--rzn-fig-b", 0.05)) - figureHeight;
    view.width = width;
    view.height = height;
    overlay.resize(width, height);
    for (const element of frameBox.querySelectorAll<HTMLElement>(TARGETS)) {
      const box = element.getBoundingClientRect();
      if (!box.width || !box.height) continue;
      element.style.transformOrigin = "0 0";
      element.style.willChange = "transform";
      targets.push({ element, x: box.left - frameRect.left, y: box.top - frameRect.top });
    }
    measured = true;
    return true;
  };
  const writeCamera = (identity: boolean) => {
    henshinMatrix(camera, view, figure, shakeX, shakeY, matrix);
    const key = identity ? "" : Array.from(matrix, (v) => v.toFixed(3)).join(",");
    if (key === written) return;
    written = key;
    for (const target of targets) {
      if (!key) {
        target.element.style.transform = "";
        continue;
      }
      // Each layer in its own box: l → M(E + l) − E.
      const [a, b, c, d, e, f] = matrix;
      const ex = a * target.x + c * target.y + e - target.x;
      const ey = b * target.x + d * target.y + f - target.y;
      target.element.style.transform = `matrix(${a.toFixed(5)},${b.toFixed(5)},${c.toFixed(5)},${d.toFixed(5)},${ex.toFixed(2)},${ey.toFixed(2)})`;
    }
  };
  const stop = () => {
    environment.cancelAnimationFrame(raf);
    raf = 0;
    rest();
    overlay.clear();
    measured = false;
    shown = -1;
  };
  const tick = (now: number) => {
    raf = 0;
    if (disposed) return;
    if (!live()) {
      stop();
      return;
    }
    place();
    if (!measure()) {
      raf = environment.requestAnimationFrame(tick);
      return;
    }
    const dt = Math.min(50, Math.max(1, last ? now - last : 16.7));
    last = now;
    ema += (dt - ema) * 0.1;
    overlay.govern(ema > 24);
    const target = readRaw();
    if (shown < 0 || Math.abs(target - shown) > 0.2) shown = target;
    else shown += (target - shown) * (1 - Math.exp(-dt * (coarse ? 0.044 : 0.032)));
    if (Math.abs(target - shown) < 0.0002) shown = target;
    if (now - shakeAt > 80) {
      shakeX = 0;
      shakeY = 0;
    }
    henshinCamera(sheet, shown, camera);
    const identity =
      Math.abs(camera.zoom - 1) < 0.0005 &&
      Math.abs(camera.roll) < 0.01 &&
      Math.abs(camera.dropY) < 0.05 &&
      Math.abs(shakeX) < 0.05 &&
      Math.abs(shakeY) < 0.05;
    writeCamera(identity);
    overlay.draw(sheet, shown, camera, view);
    const settled = shown === target && now - shakeAt > 120;
    if (!settled) raf = environment.requestAnimationFrame(tick);
  };
  const wake = () => {
    if (!raf && !disposed && live()) raf = environment.requestAnimationFrame(tick);
  };
  const onScroll = () => wake();
  const scroller = runway.closest(".mus-entry") ?? environment;
  scroller.addEventListener("scroll", onScroll, { passive: true });
  if (scroller !== environment) environment.addEventListener("scroll", onScroll, { passive: true });
  const intersection =
    typeof IntersectionObserver === "function"
      ? new IntersectionObserver((entries) => {
          visible = entries.some((entry) => entry.isIntersecting);
          if (visible) wake();
          else stop();
        })
      : null;
  intersection?.observe(runway);
  const state = new MutationObserver(() => {
    measured = false;
    wake();
  });
  state.observe(runway, { attributes: true, attributeFilter: ["data-rzn-state", "data-form"] });
  const resize =
    typeof ResizeObserver === "function"
      ? new ResizeObserver(() => {
          measured = false;
          travel = 0;
          wake();
        })
      : null;
  resize?.observe(frameBox);
  resize?.observe(runway);
  const onVisibility = () => (document.hidden ? stop() : wake());
  document.addEventListener("visibilitychange", onVisibility);
  // An entry's clock already runs each part in a fraction of a second; its
  // plates land as the engine spreads them (packing a part's landing into
  // a snap there lights the frame at once, past the flash rule). The page's
  // scroll takes the stepped clock.
  const clock = entry ? (q: number) => q : henshinProgress;
  const director: HenshinDirector = {
    progress: () => clock(readRaw()),
    stepped: clock,
    shake: (x, y) => {
      shakeX = x;
      shakeY = y;
      shakeAt = environment.performance?.now?.() ?? Date.now();
      wake();
    },
    dispose: () => {
      if (disposed) return;
      disposed = true;
      directors.delete(runway);
      environment.cancelAnimationFrame(raf);
      raf = 0;
      rest();
      scroller.removeEventListener("scroll", onScroll);
      if (scroller !== environment) environment.removeEventListener("scroll", onScroll);
      intersection?.disconnect();
      state.disconnect();
      resize?.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      overlay.dispose();
      canvas.remove();
    },
  };
  directors.set(runway, director);
  wake();
  return director;
}

/* ---------------- the entry director (a clock in ms) ---------------- */

export type HenshinEntry = {
  /** One frame at clock t (the sheet's units), with a layer's shake (px). */
  readonly frame: (t: number, shakeX: number, shakeY: number) => void;
  /** The rest frame: no camera, a clear overlay. */
  readonly rest: () => void;
  readonly dispose: () => void;
};

/**
 * Mounts the bank's direction on an entry's figure: `figureBox` (the art's
 * box, which the camera moves) inside `host` (the stage the overlay
 * covers). The caller drives it with its own clock.
 */
export function mountHenshinEntry(
  figureBox: HTMLElement,
  host: HTMLElement,
  options: {
    figure: HenshinFigure;
    palette: HenshinPalette;
    sheet: HenshinSheet;
    /** false: the overlay draws no linework (HenshinOverlay's `linework`). */
    linework?: boolean;
    environment?: typeof globalThis;
  },
): HenshinEntry {
  const environment = options.environment ?? globalThis;
  const document = host.ownerDocument;
  const canvas = document.createElement("canvas");
  canvas.className = "rx-suit-henshin";
  canvas.setAttribute("aria-hidden", "true");
  canvas.width = 1;
  canvas.height = 1;
  Object.assign(canvas.style, {
    position: "absolute",
    inset: "0",
    width: "100%",
    height: "100%",
    pointerEvents: "none",
  });
  figureBox.after(canvas);
  const overlay = new HenshinOverlay(
    canvas,
    options.figure,
    options.palette,
    henshinTier(environment),
    options.linework !== false,
  );
  const camera = createHenshinCamera();
  const matrix = new Float64Array(6);
  const view: HenshinView = { x: 0, y: 0, s: 1, width: 0, height: 0 };
  let size = "";
  let written = "";
  let last = 0;
  let ema = 16.7;
  const measure = () => {
    const width = host.clientWidth;
    const height = host.clientHeight;
    const w = figureBox.offsetWidth;
    const h = figureBox.offsetHeight;
    const key = `${width}x${height}|${w}x${h}|${figureBox.offsetLeft},${figureBox.offsetTop}`;
    if (key === size || !w || !width) return;
    size = key;
    // The box is centred on its offset (translate: -50% -50%).
    view.x = figureBox.offsetLeft - w / 2;
    view.y = figureBox.offsetTop - h / 2;
    view.s = w / options.figure.size.width;
    view.width = width;
    view.height = height;
    overlay.resize(width, height);
    figureBox.style.transformOrigin = "0 0";
    figureBox.style.willChange = "transform";
  };
  const rest = () => {
    if (written) {
      figureBox.style.transform = "";
      written = "";
    }
    figureBox.style.transformOrigin = "";
    figureBox.style.willChange = "";
    size = "";
    overlay.clear();
  };
  return {
    frame: (t, shakeX, shakeY) => {
      measure();
      const now = environment.performance?.now?.() ?? Date.now();
      if (last) {
        ema += (Math.min(80, now - last) - ema) * 0.1;
        overlay.govern(ema > 24);
      }
      last = now;
      henshinCamera(options.sheet, t, camera);
      henshinMatrix(camera, view, options.figure, shakeX, shakeY, matrix);
      const [a, b, c, d, e, f] = matrix;
      const ex = a * view.x + c * view.y + e - view.x;
      const ey = b * view.x + d * view.y + f - view.y;
      const identity =
        Math.abs(a - 1) < 0.0005 &&
        Math.abs(b) < 0.0002 &&
        Math.abs(ex) < 0.05 &&
        Math.abs(ey) < 0.05;
      const key = identity
        ? ""
        : `matrix(${a.toFixed(5)},${b.toFixed(5)},${c.toFixed(5)},${d.toFixed(5)},${ex.toFixed(2)},${ey.toFixed(2)})`;
      if (key !== written) {
        written = key;
        figureBox.style.transform = key;
      }
      overlay.draw(options.sheet, t, camera, view);
    },
    rest,
    dispose: () => {
      rest();
      overlay.dispose();
      canvas.remove();
    },
  };
}
