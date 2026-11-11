/* REXONANCE CRESCENDO (owner, 2026-11-11: 「レクソナンスのアニメーションを
   大幅に、劇的に強化して」). The suit-up's cinema pass, drawn onto the surge
   layer's own two canvases (no new compositor layer) after the surge has
   drawn, in the figure's coordinates (571 x 1040):

   - reactor streams: nanite cells born at the reactor that wind out along
     the neck, the arms and the legs in helices, carried by a curl-noise
     flow, and gather on whichever limb is being armoured (cohesion);
   - panel lock-in: every plate, as it seats, a micro-flash on its seat (a
     four-point glint, its corner ticks, a sweep along its seam);
   - energy lines: the armour's own panel lines (an edge map taken from the
     art once, in idle time) lit in a band that runs out from each group's
     lock, and from the reactor through the whole suit on completion;
   - anticipation: a charge-up on the reactor and the driver before the last
     lock (converging cells, contracting rings, a growing bloom);
   - impact: on completion a flash, a double shock shell with a chromatic
     fringe, a ground ring, rays, a scale-punch echo of the armour's lines
     (the body itself never moves), a lens glint on the visor;
   - the settle: a rim light on the silhouette (ice from the key side, pink
     from the fill) and the reactor's and driver's bloom easing to rest.

   Every value is closed-form in the ages the caller passes (ms since each
   event), so the entry plays it on the call's clock and the scroll scene can
   be scrubbed; only the streams and the charge flow on wall time. Nothing is
   allocated per frame. This module imports nothing: the suit's landmarks
   come in through `CrescendoSuit`, and it is fetched on its own, lazily,
   only where Rexonance's suit-up plays. */

export type CrescendoSuit = {
  width: number;
  height: number;
  core: readonly [number, number];
  visor: readonly [number, number];
  belt: readonly [number, number];
  /** Each group's anchor (figure px) and each group's limb (CRESCENDO_LIMBS). */
  anchors: ReadonlyArray<readonly [number, number]>;
  /** The plates: seat x, seat y, box x, y, w, h — six numbers each. */
  plates: Float32Array;
};

/* ---------------- small maths ---------------- */

export const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
export const smooth = (x: number) => {
  const t = clamp01(x);
  return t * t * (3 - 2 * t);
};
const outCubic = (x: number) => 1 - Math.pow(1 - clamp01(x), 3);
const span = (x: number, from: number, to: number) =>
  to > from ? clamp01((x - from) / (to - from)) : x >= to ? 1 : 0;
const hash = (a: number, b: number) => {
  const h = Math.imul(a * 374761393 + b * 668265263, 1274126177) >>> 0;
  return ((h ^ (h >>> 13)) % 10007) / 10007;
};

/* ---------------- the device budget ---------------- */

export type CrescendoTier = {
  name: "desktop" | "tablet" | "phone" | "low";
  /** Reactor-stream cells. */
  streams: number;
  /** Completion rays, and the charge's converging cells. */
  rays: number;
  converge: number;
  /** The edge map's width in px (0: no energy lines, no rim light). */
  edge: number;
  /** The highest backing-store ratio its canvases may use. */
  dpr: number;
  /** The governor's starting level. */
  level: number;
};

type TierEnvironment = {
  navigator?: { deviceMemory?: number; hardwareConcurrency?: number; connection?: unknown };
  matchMedia?: (query: string) => { matches: boolean };
  innerWidth?: number;
  innerHeight?: number;
  devicePixelRatio?: number;
};

/** The budget by device. Reduced motion has no crescendo at all (null). */
export function crescendoTier(environment: TierEnvironment = globalThis): CrescendoTier | null {
  const media = (query: string) => Boolean(environment.matchMedia?.(query).matches);
  if (media("(prefers-reduced-motion: reduce)")) return null;
  const coarse = media("(pointer: coarse), (any-pointer: coarse)");
  const ratio = environment.devicePixelRatio || 1;
  const memory = environment.navigator?.deviceMemory;
  const cores = environment.navigator?.hardwareConcurrency ?? 0;
  const connection = environment.navigator?.connection as { saveData?: boolean } | undefined;
  const short = Math.min(environment.innerWidth || 0, environment.innerHeight || 0);
  if (!coarse)
    return {
      name: "desktop",
      streams: 360,
      rays: 28,
      converge: 44,
      edge: 420,
      dpr: Math.min(ratio, 1.5),
      level: 0,
    };
  if (
    (memory !== undefined && memory <= 4) ||
    (cores > 0 && cores <= 4) ||
    connection?.saveData === true
  )
    return { name: "low", streams: 80, rays: 12, converge: 16, edge: 0, dpr: 1, level: 2 };
  if (short >= 700)
    return { name: "tablet", streams: 220, rays: 22, converge: 32, edge: 360, dpr: 1, level: 0 };
  return { name: "phone", streams: 150, rays: 18, converge: 26, edge: 300, dpr: 1, level: 0 };
}

/** The share of a tier's budget each governor level keeps. */
export const CRESCENDO_LEVELS = [
  { streams: 1, rays: 1, edges: true, echo: true, rim: true },
  { streams: 0.55, rays: 0.6, edges: true, echo: true, rim: true },
  { streams: 0.3, rays: 0.5, edges: true, echo: false, rim: false },
  { streams: 0, rays: 0.4, edges: false, echo: false, rim: false },
] as const;
export const CRESCENDO_SLOW_MS = 26;
const SLOW_SCORE = 8;
const RECOVER_FRAMES = 240;

/** Sheds work when frames run long, a level at a time; gives it back only
 * after a long clean run (never mid-flicker). */
export class CrescendoGovernor {
  level: number;
  private floor: number;
  private score = 0;
  private clean = 0;
  constructor(level = 0) {
    this.level = level;
    this.floor = level;
  }
  /** One frame's interval (ms). Paced frames (the scene's own 30 fps rest
   * cadence) and gaps (a hidden tab, a stopped scroll) are not samples. */
  sample(dt: number, paced = false) {
    if (paced || !(dt > 0) || dt > 200) return this.level;
    if (dt > CRESCENDO_SLOW_MS) {
      this.clean = 0;
      this.score += dt > CRESCENDO_SLOW_MS * 2 ? 2 : 1;
      if (this.score >= SLOW_SCORE && this.level < CRESCENDO_LEVELS.length - 1) {
        this.level += 1;
        this.score = 0;
      }
    } else {
      this.score = Math.max(0, this.score - 0.34);
      this.clean += 1;
      if (this.clean >= RECOVER_FRAMES && this.level > this.floor) {
        this.level -= 1;
        this.clean = 0;
      }
    }
    return this.level;
  }
}

/* ---------------- the choreography ---------------- */

/** The completion's play, ms. */
export const CRESCENDO_FINALE_MS = 1600;
/** A plate's micro-flash and a group's line pulse, ms. */
export const CRESCENDO_PLATE_MS = 260;
export const CRESCENDO_GROUP_MS = 620;
/** The limbs the streams wind along (CRESCENDO_LIMBS index) per surge group:
 * legs, waist, arms, chest, shoulders, tail, ribbon, helm. */
export const CRESCENDO_GROUP_LIMB = [3, 1, 2, 1, 2, 1, 1, 0] as const;

export type CrescendoFrame = {
  /** Wall clock, ms. */
  now: number;
  /** The streams' presence, 0–1, and each limb class's gather, 0–1
   * (head, torso, arms, legs). */
  flow: number;
  gather: Float32Array;
  /** The charge before completion, 0–1. */
  charge: number;
  /** ms since completion (< 0: not yet). */
  finale: number;
  /** ms since each group's lock and each plate's seat (< 0: idle). */
  groups: Float32Array;
  plates: Float32Array;
};

export function createCrescendoFrame(groups: number, plates: number): CrescendoFrame {
  return {
    now: 0,
    flow: 0,
    gather: new Float32Array(4),
    charge: 0,
    finale: -1,
    groups: new Float32Array(groups).fill(-1),
    plates: new Float32Array(plates).fill(-1),
  };
}

const gatherFrom = (frame: CrescendoFrame, pull: Float32Array) => {
  frame.gather.fill(0);
  for (let g = 0; g < pull.length && g < CRESCENDO_GROUP_LIMB.length; g += 1) {
    const limb = CRESCENDO_GROUP_LIMB[g];
    if (pull[g] > frame.gather[limb]) frame.gather[limb] = pull[g];
  }
};

/** The entry's finale runs faster: the cover closes 750 ms after the light. */
export const CRESCENDO_ENTRY_PACE = 1.45;

/** The entry's charge before the light (0–1; over with the light), at
 * canonical time t: the torrent's call back into the reactor. */
export const entryCharge = (t: number, final: number) =>
  smooth(span(t, final - 300, final - 20)) * (t < final ? 1 : 0);

/** The entry at canonical time t (ms). `fits` are the plates' fit times,
 * `windows` each group's [from, to], `final` the light's start; `swarm`,
 * `implode` and `pull` are the surge frame's. */
export function entryCrescendoFrame(
  frame: CrescendoFrame,
  t: number,
  now: number,
  fits: Float32Array,
  windows: Float32Array,
  final: number,
  swarm: number,
  implode: number,
  pull: Float32Array,
) {
  frame.now = now;
  frame.flow = swarm * (1 - smooth(implode));
  gatherFrom(frame, pull);
  frame.charge = smooth(span(t, final - 300, final - 20));
  frame.finale = t >= final ? (t - final) * CRESCENDO_ENTRY_PACE : -1;
  for (let g = 0; g < frame.groups.length; g += 1) {
    const at = windows[g * 2 + 1];
    const age = t - at;
    frame.groups[g] = at > 0 && age >= 0 && age < CRESCENDO_GROUP_MS ? age : -1;
  }
  for (let n = 0; n < frame.plates.length; n += 1) {
    const age = t - fits[n];
    frame.plates[n] = fits[n] > 0 && age >= 0 && age < CRESCENDO_PLATE_MS ? age : -1;
  }
  return frame;
}

/** The scroll scene's light (rexonance-resonance.js ASSEMBLY_BEATS.light). */
export const CRESCENDO_SCROLL_LIGHT = 0.9;
export const CRESCENDO_SCROLL_CHARGE = [0.835, 0.898] as const;
/** A jump further than this is a seek: nothing strikes. */
const SEEK = 0.2;

/** The scroll's events: a plate, a group or the completion strikes as the
 * reader passes it going forward and plays on wall time; scrolling back
 * over it re-arms it. */
export class CrescendoScrollClock {
  private last = -1;
  private finaleAt = -Infinity;
  private groupAt: Float64Array;
  private plateAt: Float64Array;
  private windows: Float32Array;
  private pieceWindows: Float32Array;
  constructor(windows: Float32Array, pieceWindows: Float32Array) {
    this.windows = windows;
    this.pieceWindows = pieceWindows;
    this.groupAt = new Float64Array(windows.length / 2).fill(-Infinity);
    this.plateAt = new Float64Array(pieceWindows.length / 2).fill(-Infinity);
  }
  reset() {
    this.last = -1;
    this.finaleAt = -Infinity;
    this.groupAt.fill(-Infinity);
    this.plateAt.fill(-Infinity);
  }
  /** Fills the frame at progress q; `swarm`, `implode`, `pull` are the surge
   * frame's. */
  frame(
    frame: CrescendoFrame,
    q: number,
    now: number,
    swarm: number,
    implode: number,
    pull: Float32Array,
  ) {
    const last = this.last;
    const forward = last >= 0 && q > last && q - last <= SEEK;
    const crossed = (at: number) => forward && at > last && at <= q;
    if (crossed(CRESCENDO_SCROLL_LIGHT)) this.finaleAt = now;
    else if (q < CRESCENDO_SCROLL_LIGHT - 0.004) this.finaleAt = -Infinity;
    for (let g = 0; g < this.groupAt.length; g += 1) {
      const at = this.windows[g * 2 + 1];
      if (crossed(at)) this.groupAt[g] = now;
      else if (q < at) this.groupAt[g] = -Infinity;
    }
    for (let n = 0; n < this.plateAt.length; n += 1) {
      const at = this.pieceWindows[n * 2 + 1];
      if (crossed(at)) this.plateAt[n] = now;
      else if (q < at) this.plateAt[n] = -Infinity;
    }
    this.last = q;
    frame.now = now;
    frame.flow = swarm * (1 - smooth(implode));
    gatherFrom(frame, pull);
    frame.charge =
      smooth(span(q, CRESCENDO_SCROLL_CHARGE[0], CRESCENDO_SCROLL_CHARGE[1])) *
      (q < CRESCENDO_SCROLL_LIGHT ? 1 : 0);
    const finale = now - this.finaleAt;
    frame.finale = finale >= 0 && finale < CRESCENDO_FINALE_MS ? finale : -1;
    for (let g = 0; g < this.groupAt.length; g += 1) {
      const age = now - this.groupAt[g];
      frame.groups[g] = age >= 0 && age < CRESCENDO_GROUP_MS ? age : -1;
    }
    for (let n = 0; n < this.plateAt.length; n += 1) {
      const age = now - this.plateAt[n];
      frame.plates[n] = age >= 0 && age < CRESCENDO_PLATE_MS ? age : -1;
    }
    return frame;
  }
}

/** While the skin grows the armour (rexonance-suit-skin.ts) there are no
 * plates to flash and no streams in the air: only the charge and the
 * completion remain. */
export function quietCrescendo(frame: CrescendoFrame) {
  frame.flow = 0;
  frame.groups.fill(-1);
  frame.plates.fill(-1);
  return frame;
}

/** Whether a frame still has anything of the crescendo's to animate while
 * the caller's own inputs are still. */
export function crescendoBusy(frame: CrescendoFrame) {
  if (frame.finale >= 0 || frame.charge > 0.02) return true;
  for (let g = 0; g < frame.groups.length; g += 1) if (frame.groups[g] >= 0) return true;
  for (let n = 0; n < frame.plates.length; n += 1) if (frame.plates[n] >= 0) return true;
  return false;
}

/* The completion's envelopes, each 0 outside its window and continuous
   inside it, in ms since completion. Exported for the tests: nothing pops in
   and nothing is left on when the play ends. */
export const finale = {
  /** The reactor's flash: the charge's bloom carried over, then gone. */
  flash: (a: number) => (a < 0 || a >= 300 ? 0 : Math.pow(1 - a / 300, 2)),
  /** The shock shells' reach (0–1) and light. */
  shockReach: (a: number, ms: number) => (a < 0 ? 0 : outCubic(a / ms)),
  shockLight: (a: number, ms: number) =>
    a < 0 || a >= ms ? 0 : smooth(a / 40) * Math.pow(1 - a / ms, 1.5),
  /** The scale-punch echo of the armour's lines: its scale and light. */
  echoScale: (a: number) => 1 + 0.085 * outCubic(a / 460),
  echoLight: (a: number) => (a < 0 || a >= 460 ? 0 : smooth(a / 50) * Math.pow(1 - a / 460, 2)),
  /** The line wave from the reactor: its reach and light. */
  waveReach: (a: number) => (a < 0 ? 0 : outCubic(a / 780)),
  waveLight: (a: number) => (a < 0 || a >= 780 ? 0 : smooth(a / 60) * (1 - Math.pow(a / 780, 3))),
  /** The whole suit's lines, glowing, then settling. */
  linesGlow: (a: number) => smooth(span(a, 60, 380)) * (1 - smooth(span(a, 480, 1500))),
  /** The rim light on the silhouette. */
  rim: (a: number) => smooth(span(a, 0, 220)) * (1 - smooth(span(a, 620, CRESCENDO_FINALE_MS))),
  /** The visor's lens glint. */
  glint: (a: number) => smooth(span(a, 170, 270)) * (1 - smooth(span(a, 330, 900))),
  /** The reactor's and driver's bloom, easing to rest. */
  settle: (a: number) =>
    smooth(span(a, 0, 120)) *
    (1 - smooth(span(a, 300, CRESCENDO_FINALE_MS))) *
    (0.82 + 0.18 * Math.cos(a / 150)),
} as const;

/* ---------------- the armour's lines, from the art ---------------- */

/** From the figure's pixels (straight RGBA, w x h): the panel lines as an
 * ice-white edge map, and the silhouette's rim (ice where the key light
 * from the upper left catches it, pink where the fill from the right
 * does). Both straight RGBA, w x h. */
export function crescendoLines(rgba: Uint8ClampedArray, w: number, h: number) {
  const size = w * h;
  const luma = new Float32Array(size);
  for (let i = 0; i < size; i += 1) {
    const o = i * 4;
    luma[i] = ((rgba[o] * 0.299 + rgba[o + 1] * 0.587 + rgba[o + 2] * 0.114) * rgba[o + 3]) / 255;
  }
  const edge = new Uint8ClampedArray(size * 4);
  const rim = new Uint8ClampedArray(size * 4);
  const d = Math.max(2, Math.round(w / 110));
  const alphaAt = (x: number, y: number) =>
    x < 0 || y < 0 || x >= w || y >= h ? 0 : rgba[(y * w + x) * 4 + 3];
  for (let y = 0; y < h; y += 1)
    for (let x = 0; x < w; x += 1) {
      const i = y * w + x;
      const o = i * 4;
      if (x > 0 && y > 0 && x < w - 1 && y < h - 1) {
        const gx =
          luma[i - w + 1] +
          2 * luma[i + 1] +
          luma[i + w + 1] -
          luma[i - w - 1] -
          2 * luma[i - 1] -
          luma[i + w - 1];
        const gy =
          luma[i + w - 1] +
          2 * luma[i + w] +
          luma[i + w + 1] -
          luma[i - w - 1] -
          2 * luma[i - w] -
          luma[i - w + 1];
        const g = Math.sqrt(gx * gx + gy * gy);
        if (g > 110) {
          edge[o] = 196;
          edge[o + 1] = 244;
          edge[o + 2] = 255;
          edge[o + 3] = Math.min(255, (g - 110) * 0.7);
        }
      }
      const a = rgba[o + 3];
      if (a > 40) {
        const key = 1 - alphaAt(x - d, y - d) / 255;
        const fill = 1 - alphaAt(x + d, y) / 255;
        const light = Math.max(key, fill);
        if (light > 0.04) {
          const total = key + fill;
          const k = key / total;
          rim[o] = 150 * k + 255 * (1 - k);
          rim[o + 1] = 236 * k + 143 * (1 - k);
          rim[o + 2] = 255 * k + 216 * (1 - k);
          rim[o + 3] = light * a;
        }
      }
    }
  return { edge, rim };
}

/* ---------------- the engine ---------------- */

/** head/neck, torso, arms (left, right), legs (left, right): root x, y,
 * tip x, tip y, half width at the root and the tip, and the limb's class
 * (0 head, 1 torso, 2 arms, 3 legs). Figure fractions (x of 571, y of 1040,
 * widths of 571). */
export const CRESCENDO_LIMBS = [
  [0.498, 0.235, 0.498, 0.075, 0.075, 0.06, 0],
  [0.498, 0.27, 0.498, 0.47, 0.2, 0.16, 1],
  [0.36, 0.25, 0.14, 0.56, 0.085, 0.06, 2],
  [0.636, 0.25, 0.856, 0.56, 0.085, 0.06, 2],
  [0.42, 0.45, 0.3, 0.965, 0.105, 0.08, 3],
  [0.576, 0.45, 0.696, 0.965, 0.105, 0.08, 3],
] as const;

const TONES = ["150 236 255", "255 143 216", "242 216 150"] as const;
const STREAM = 8;

export type CrescendoLayers = {
  back: CanvasRenderingContext2D;
  front: CanvasRenderingContext2D;
  /** The figure's scale in CSS px (for hairlines) and how far the canvas
   * reaches left/right of the figure's axis and above/below the reactor,
   * in figure px (so nothing meets a canvas edge while still lit). */
  scale: number;
  reachX: number;
  reachUp: number;
  reachDown: number;
};

export type CrescendoArt = {
  edge: CanvasImageSource | null;
  rim: CanvasImageSource | null;
};

const P = new Float32Array(3);
const Q = new Float32Array(3);

export class CrescendoEngine {
  readonly governor: CrescendoGovernor;
  private suit: CrescendoSuit;
  private tier: CrescendoTier;
  /** limb, phase, speed, angle, turns, radius share, tone, seed. */
  private streams: Float32Array;
  private sprites: HTMLCanvasElement[] = [];
  private flare: HTMLCanvasElement | null = null;
  private art: CrescendoArt = { edge: null, rim: null };
  private lastNow = 0;

  constructor(suit: CrescendoSuit, tier: CrescendoTier) {
    this.suit = suit;
    this.tier = tier;
    this.governor = new CrescendoGovernor(tier.level);
    this.streams = new Float32Array(tier.streams * STREAM);
    for (let i = 0; i < tier.streams; i += 1) {
      const o = i * STREAM;
      // The limbs by length: the legs and arms carry most of the cells.
      const pick = hash(i, 3);
      const limb =
        pick < 0.08 ? 0 : pick < 0.2 ? 1 : pick < 0.4 ? 2 : pick < 0.6 ? 3 : pick < 0.8 ? 4 : 5;
      this.streams[o] = limb;
      this.streams[o + 1] = hash(i, 5);
      this.streams[o + 2] = 0.00042 + 0.00046 * hash(i, 7);
      this.streams[o + 3] = hash(i, 11) * Math.PI * 2;
      this.streams[o + 4] = (limb === 1 ? 1.2 : 2.4) + 1.6 * hash(i, 13);
      this.streams[o + 5] = 0.92 + 0.5 * hash(i, 17);
      this.streams[o + 6] = i % 7 === 0 ? 2 : i % 3 === 0 ? 1 : 0;
      this.streams[o + 7] = hash(i, 19);
    }
    if (typeof document !== "undefined") {
      this.sprites = [
        glow("236 252 255", TONES[0]),
        glow("255 240 250", TONES[1]),
        glow("255 246 216", TONES[2]),
      ];
      this.flare = streak();
    }
  }

  /** The armour's lines (crescendoLines, as canvases), once they are ready. */
  setArt(art: CrescendoArt) {
    this.art = art;
  }

  get wantsArt() {
    return this.tier.edge > 0 && !this.art.edge;
  }

  /** A stream cell at wall time t: x, y, depth into out. Returns its light
   * (0: not drawn). */
  private place(i: number, t: number, out: Float32Array) {
    const p = this.streams;
    const o = i * STREAM;
    const limb = CRESCENDO_LIMBS[p[o]];
    const W = this.suit.width;
    const H = this.suit.height;
    const seed = p[o + 7];
    const u = (p[o + 1] + t * p[o + 2]) % 1;
    const x0 = limb[0] * W;
    const y0 = limb[1] * H;
    const dx = limb[2] * W - x0;
    const dy = limb[3] * H - y0;
    const length = Math.hypot(dx, dy) || 1;
    const nx = -dy / length;
    const ny = dx / length;
    const angle = p[o + 3] + u * p[o + 4] * Math.PI * 2 + t * 0.0011;
    const half = (limb[4] + (limb[5] - limb[4]) * u) * W * p[o + 5];
    const c = Math.cos(angle);
    const z = Math.sin(angle);
    let x = x0 + dx * u + nx * c * half + (dx / length) * z * half * 0.2;
    let y = y0 + dy * u + ny * c * half + (dy / length) * z * half * 0.2;
    // Curl of the potential sin(ax + pt) cos(by - qt): divergence-free, so
    // the cells swirl without bunching.
    const a = x * 0.013 + t * 0.0007 + seed * 6.28;
    const b = y * 0.0105 - t * 0.0005 + seed * 3.1;
    const amp = 11 + 9 * seed;
    x += -Math.sin(a) * Math.sin(b) * amp;
    y += -Math.cos(a) * Math.cos(b) * amp;
    out[0] = x;
    out[1] = y;
    out[2] = z;
    // Born at the root, spent at the tip.
    return Math.min(1, u * 7, (1 - u) * 5);
  }

  draw(layers: CrescendoLayers, frame: CrescendoFrame, paced = false) {
    const dt = frame.now - this.lastNow;
    this.lastNow = frame.now;
    const level = CRESCENDO_LEVELS[this.governor.sample(dt, paced)];
    const { back, front } = layers;
    const px = 1 / Math.max(0.05, layers.scale);
    back.globalCompositeOperation = "lighter";
    front.globalCompositeOperation = "lighter";
    if (frame.flow > 0.01 && level.streams > 0)
      this.drawStreams(back, front, frame, level.streams, px);
    this.drawPlates(front, frame, px);
    if (level.edges && this.art.edge) this.drawGroupLines(front, frame);
    if (frame.charge > 0.01 && frame.finale < 0) this.drawCharge(back, front, frame, layers, px);
    if (frame.finale >= 0) this.drawFinale(back, front, frame, layers, level, px);
    back.globalAlpha = 1;
    front.globalAlpha = 1;
    back.globalCompositeOperation = "source-over";
    front.globalCompositeOperation = "source-over";
  }

  private drawStreams(
    back: CanvasRenderingContext2D,
    front: CanvasRenderingContext2D,
    frame: CrescendoFrame,
    share: number,
    px: number,
  ) {
    const t = frame.now;
    const count = Math.floor(this.tier.streams * share);
    const p = this.streams;
    // Tone by tone: the far half behind the figure (dim, thin), the near
    // half in front (bright, with a head).
    for (let tone = 0; tone < 3; tone += 1) {
      for (let side = 0; side < 2; side += 1) {
        const context = side ? front : back;
        context.beginPath();
        let any = false;
        for (let i = 0; i < count; i += 1) {
          const o = i * STREAM;
          if (p[o + 6] !== tone) continue;
          // Cohesion: a limb being armoured keeps all its cells; the rest
          // thin out to a third.
          const gather = frame.gather[CRESCENDO_LIMBS[p[o]][6]];
          if (p[o + 7] > 0.34 + 0.66 * gather) continue;
          const light = this.place(i, t, P);
          if (light <= 0.02 || P[2] >= 0 !== (side === 1)) continue;
          this.place(i, t - 46, Q);
          if (Math.abs(P[0] - Q[0]) > 60 || Math.abs(P[1] - Q[1]) > 60) continue;
          context.moveTo(Q[0], Q[1]);
          context.lineTo(P[0], P[1]);
          any = true;
        }
        if (!any) continue;
        context.lineCap = "round";
        context.lineWidth = (side ? 2.1 : 1.3) * px;
        context.strokeStyle = `rgb(${TONES[tone]} / ${((side ? 0.78 : 0.34) * frame.flow).toFixed(3)})`;
        context.stroke();
        context.lineCap = "butt";
      }
    }
    // The near cells' heads, on the limbs being armoured.
    front.fillStyle = `rgb(244 252 255 / ${(0.85 * frame.flow).toFixed(3)})`;
    front.beginPath();
    const head = 2.4 * px;
    for (let i = 0; i < count; i += 2) {
      const o = i * STREAM;
      const gather = frame.gather[CRESCENDO_LIMBS[p[o]][6]];
      if (gather < 0.2 || p[o + 7] > gather) continue;
      if (this.place(i, t, P) <= 0.3 || P[2] < 0.2) continue;
      front.rect(P[0] - head / 2, P[1] - head / 2, head, head);
    }
    front.fill();
  }

  /** Each seating plate's micro-flash. */
  private drawPlates(front: CanvasRenderingContext2D, frame: CrescendoFrame, px: number) {
    const plates = this.suit.plates;
    let any = false;
    for (let n = 0; n < frame.plates.length; n += 1) {
      const age = frame.plates[n];
      if (age < 0) continue;
      const k = age / CRESCENDO_PLATE_MS;
      const o = n * 6;
      const sx = plates[o];
      const sy = plates[o + 1];
      const light = smooth(k * 6) * (1 - k) * (1 - k);
      // The glint: a four-point star on the seat.
      const reach = (10 + 26 * outCubic(k * 1.6)) * (0.8 + 0.4 * hash(n, 61));
      const thin = 1.6 + 2.2 * (1 - k);
      front.globalAlpha = light;
      front.fillStyle = "rgb(244 252 255)";
      front.beginPath();
      front.moveTo(sx - reach, sy);
      front.lineTo(sx, sy - thin);
      front.lineTo(sx + reach, sy);
      front.lineTo(sx, sy + thin);
      front.closePath();
      front.moveTo(sx, sy - reach * 0.7);
      front.lineTo(sx + thin, sy);
      front.lineTo(sx, sy + reach * 0.7);
      front.lineTo(sx - thin, sy);
      front.closePath();
      front.fill();
      if (this.sprites.length) {
        const r = 16 + 22 * k;
        front.globalAlpha = 0.8 * light;
        front.drawImage(this.sprites[n % 3 === 2 ? 2 : 0], sx - r, sy - r, r * 2, r * 2);
      }
      any = true;
    }
    if (!any) return;
    // The plates' corner ticks, closing in as they seat (one path).
    front.globalAlpha = 1;
    front.beginPath();
    let lit = 0;
    for (let n = 0; n < frame.plates.length; n += 1) {
      const age = frame.plates[n];
      if (age < 0) continue;
      const k = age / CRESCENDO_PLATE_MS;
      const o = n * 6;
      const grow = 7 * (1 - outCubic(k * 2));
      const x = plates[o + 2] - grow;
      const y = plates[o + 3] - grow;
      const w = plates[o + 4] + grow * 2;
      const h = plates[o + 5] + grow * 2;
      const tick = Math.min(9, w * 0.2, h * 0.2);
      front.moveTo(x, y + tick);
      front.lineTo(x, y);
      front.lineTo(x + tick, y);
      front.moveTo(x + w - tick, y);
      front.lineTo(x + w, y);
      front.lineTo(x + w, y + tick);
      front.moveTo(x + w, y + h - tick);
      front.lineTo(x + w, y + h);
      front.lineTo(x + w - tick, y + h);
      front.moveTo(x + tick, y + h);
      front.lineTo(x, y + h);
      front.lineTo(x, y + h - tick);
      lit = Math.max(lit, (1 - k) * smooth(k * 5));
    }
    front.lineWidth = 1.4 * px;
    front.strokeStyle = `rgb(190 245 255 / ${(0.8 * lit).toFixed(3)})`;
    front.stroke();
  }

  /** The armour's lines inside a band about (x, y): radius r, width w. */
  private band(
    context: CanvasRenderingContext2D,
    image: CanvasImageSource,
    x: number,
    y: number,
    r: number,
    w: number,
    alpha: number,
  ) {
    if (alpha <= 0.01) return;
    context.save();
    context.beginPath();
    context.arc(x, y, r + w / 2, 0, Math.PI * 2);
    if (r > w / 2) context.arc(x, y, r - w / 2, 0, Math.PI * 2, true);
    context.clip();
    context.globalAlpha = alpha;
    context.drawImage(image, 0, 0, this.suit.width, this.suit.height);
    context.restore();
  }

  /** A group's lock: its light runs out along the panel lines. */
  private drawGroupLines(front: CanvasRenderingContext2D, frame: CrescendoFrame) {
    const edge = this.art.edge;
    if (!edge) return;
    for (let g = 0; g < frame.groups.length; g += 1) {
      const age = frame.groups[g];
      if (age < 0) continue;
      const k = age / CRESCENDO_GROUP_MS;
      const [x, y] = this.suit.anchors[g];
      const r = 20 + 300 * outCubic(k);
      this.band(front, edge, x, y, r, 70, smooth(k * 8) * (1 - k) * (1 - k));
      this.band(front, edge, x, y, r * 0.5, r, 0.4 * smooth(k * 8) * Math.pow(1 - k, 3));
    }
  }

  /** The charge: cells and rings converge on the reactor; it and the driver
   * bloom. */
  private drawCharge(
    back: CanvasRenderingContext2D,
    front: CanvasRenderingContext2D,
    frame: CrescendoFrame,
    layers: CrescendoLayers,
    px: number,
  ) {
    const c = frame.charge;
    const t = frame.now;
    const [cx, cy] = this.suit.core;
    const reach = Math.min(layers.reachX * 0.92, this.suit.height * 0.34);
    // Converging cells: streaks along their spokes, quickening as they near.
    for (let tone = 0; tone < 3; tone += 1) {
      front.beginPath();
      for (let i = tone; i < this.tier.converge; i += 3) {
        const u = (hash(i, 71) + t * (0.0011 + 0.0007 * hash(i, 73))) % 1;
        const angle = hash(i, 79) * Math.PI * 2 + u * 1.3;
        const r0 = reach * Math.pow(1 - u, 1.5);
        const r1 = reach * Math.pow(1 - Math.min(1, u + 0.07), 1.5);
        if (r0 < 10) continue;
        front.moveTo(cx + Math.cos(angle) * r0, cy + Math.sin(angle) * r0);
        front.lineTo(cx + Math.cos(angle + 0.09) * r1, cy + Math.sin(angle + 0.09) * r1);
      }
      front.lineWidth = 1.7 * px;
      front.strokeStyle = `rgb(${TONES[tone]} / ${(0.72 * c).toFixed(3)})`;
      front.stroke();
    }
    // Two rings drawing in.
    for (let ring = 0; ring < 2; ring += 1) {
      const u = (t / 460 + ring * 0.5) % 1;
      const r = 14 + reach * 0.7 * (1 - u) * (1 - u);
      back.lineWidth = (1 + 2.4 * u) * px;
      back.strokeStyle = `rgb(150 236 255 / ${(0.55 * c * smooth(u * 4) * (1 - u * 0.3)).toFixed(3)})`;
      back.beginPath();
      back.arc(cx, cy, r, 0, Math.PI * 2);
      back.stroke();
    }
    if (this.art.edge) this.band(front, this.art.edge, cx, cy, 0, 150 + 190 * c, 0.5 * c);
    this.bloom(front, c * (0.5 + 0.12 * Math.sin(t / 37)), 0.6 + 0.5 * c);
  }

  /** The reactor's and the driver's bloom. */
  private bloom(front: CanvasRenderingContext2D, light: number, size: number) {
    if (!this.sprites.length || light <= 0.01) return;
    const H = this.suit.height;
    const [cx, cy] = this.suit.core;
    const [bx, by] = this.suit.belt;
    const r = 0.085 * H * size;
    front.globalAlpha = Math.min(1, light);
    front.drawImage(this.sprites[0], cx - r, cy - r, r * 2, r * 2);
    const d = r * 0.62;
    front.globalAlpha = Math.min(1, light * 0.8);
    front.drawImage(this.sprites[2], bx - d * 1.5, by - d * 0.8, d * 3, d * 1.6);
    front.globalAlpha = 1;
  }

  private drawFinale(
    back: CanvasRenderingContext2D,
    front: CanvasRenderingContext2D,
    frame: CrescendoFrame,
    layers: CrescendoLayers,
    level: (typeof CRESCENDO_LEVELS)[number],
    px: number,
  ) {
    const a = frame.finale;
    const W = this.suit.width;
    const H = this.suit.height;
    const [cx, cy] = this.suit.core;
    const rx = layers.reachX * 0.97;
    const up = Math.min(layers.reachUp * 0.97, H * 0.62);
    const down = Math.min(layers.reachDown * 0.97, H * 0.62);
    // The settle first (under the impact): the silhouette's rim, the lines.
    if (level.rim && this.art.rim) {
      const rim = finale.rim(a);
      if (rim > 0.01) {
        front.globalAlpha = 0.5 * rim;
        front.drawImage(this.art.rim, 0, 0, W, H);
      }
    }
    if (level.edges && this.art.edge) {
      const glowing = finale.linesGlow(a);
      if (glowing > 0.01) {
        front.globalAlpha = 0.2 * glowing;
        front.drawImage(this.art.edge, 0, 0, W, H);
      }
      this.band(
        front,
        this.art.edge,
        cx,
        cy,
        finale.waveReach(a) * H * 0.8,
        130,
        0.75 * finale.waveLight(a),
      );
      // The punch: the lines' echo swells off the armour (the body is still).
      if (level.echo) {
        const light = finale.echoLight(a);
        if (light > 0.01) {
          const k = finale.echoScale(a);
          front.globalAlpha = 0.45 * light;
          front.drawImage(this.art.edge, cx - cx * k, cy - cy * k, W * k, H * k);
        }
      }
      front.globalAlpha = 1;
    }
    // The shock: a fast thin shell, then a broad one with a pink fringe.
    const shell = (
      context: CanvasRenderingContext2D,
      ms: number,
      share: number,
      width: number,
      tone: string,
      light: number,
    ) => {
      const alpha = finale.shockLight(a, ms) * light;
      if (alpha <= 0.01) return;
      const k = finale.shockReach(a, ms) * share;
      context.lineWidth = width * px * (1.2 - 0.6 * (a / ms));
      context.strokeStyle = `rgb(${tone} / ${alpha.toFixed(3)})`;
      // An egg about the standing body: taller than wide, the canvas's own
      // reach on each side.
      context.beginPath();
      context.ellipse(cx, cy, 6 + rx * k, 6 + up * k, 0, Math.PI, Math.PI * 2);
      context.ellipse(cx, cy, 6 + rx * k, 6 + down * k, 0, 0, Math.PI);
      context.stroke();
    };
    shell(front, 620, 1, 2.4, "244 252 255", 0.95);
    shell(front, 960, 0.9, 9, "255 143 216", 0.34);
    shell(front, 960, 0.88, 6, "150 236 255", 0.6);
    shell(back, 1180, 0.8, 16, "121 232 255", 0.22);
    // The ground ring, under the feet.
    const ground = finale.shockLight(a, 860);
    if (ground > 0.01) {
      const g = finale.shockReach(a, 860);
      const gy = H * 0.972;
      back.lineWidth = 3 * px;
      back.strokeStyle = `rgb(190 245 255 / ${(0.7 * ground).toFixed(3)})`;
      back.beginPath();
      back.ellipse(cx, gy, 20 + rx * 0.95 * g, (20 + rx * 0.95 * g) * 0.13, 0, 0, Math.PI * 2);
      back.stroke();
      back.lineWidth = 9 * px;
      back.strokeStyle = `rgb(255 143 216 / ${(0.22 * ground).toFixed(3)})`;
      back.beginPath();
      back.ellipse(cx, gy, 12 + rx * 0.8 * g, (12 + rx * 0.8 * g) * 0.13, 0, 0, Math.PI * 2);
      back.stroke();
    }
    // The rays.
    if (a < 560) {
      const k = a / 560;
      const count = Math.max(6, Math.floor(this.tier.rays * level.rays));
      const grow = outCubic(k);
      back.beginPath();
      for (let i = 0; i < count; i += 1) {
        const angle = (i / count) * Math.PI * 2 + hash(i, 83) * 0.4;
        const inner = 30 + rx * 0.5 * grow * (0.5 + 0.5 * hash(i, 89));
        const outer = inner + rx * (0.16 + 0.34 * hash(i, 97)) * (1 - k * 0.5);
        const c = Math.cos(angle);
        const s = Math.sin(angle) * (up / Math.max(1, rx)) * 0.8;
        back.moveTo(cx + c * inner, cy + s * inner);
        back.lineTo(cx + c * Math.min(outer, rx * 0.96), cy + s * Math.min(outer, rx * 0.96));
      }
      back.lineWidth = 2 * px;
      back.strokeStyle = `rgb(236 252 255 / ${(0.62 * smooth(k * 8) * (1 - k) * (1 - k)).toFixed(3)})`;
      back.stroke();
    }
    // The reactor and the driver: the flash, then the bloom easing to rest.
    const flash = finale.flash(a);
    if (flash > 0.01 && this.sprites.length) {
      const r = H * (0.12 + 0.2 * outCubic(a / 300));
      front.globalAlpha = 0.95 * flash;
      front.drawImage(this.sprites[0], cx - r, cy - r, r * 2, r * 2);
      front.globalAlpha = 1;
    }
    this.bloom(front, 0.8 * finale.settle(a), 1.25 - 0.35 * span(a, 0, CRESCENDO_FINALE_MS));
    // The visor's lens glint: a long anamorphic streak, a short cross, the
    // lens's ghosts toward the frame's centre.
    const glint = finale.glint(a);
    if (glint > 0.01 && this.flare && this.sprites.length) {
      const [vx, vy] = this.suit.visor;
      const k = span(a, 170, 900);
      const long = Math.min(
        rx * 0.98,
        W * (0.34 + 0.6 * Math.sin(Math.PI * Math.min(1, k * 1.5) * 0.5)),
      );
      const thick = 9 + 12 * glint;
      front.globalAlpha = glint;
      front.drawImage(this.flare, vx - long, vy - thick / 2, long * 2, thick);
      front.globalAlpha = 0.7 * glint;
      front.drawImage(this.flare, vx - long * 0.45, vy - thick * 0.22, long * 0.9, thick * 0.44);
      front.save();
      front.translate(vx, vy);
      front.rotate(Math.PI / 2);
      front.globalAlpha = 0.6 * glint;
      front.drawImage(this.flare, -long * 0.2, -thick * 0.3, long * 0.4, thick * 0.6);
      front.restore();
      const r = 20 + 20 * glint;
      front.globalAlpha = glint;
      front.drawImage(this.sprites[0], vx - r, vy - r, r * 2, r * 2);
      // Ghosts, down the line from the visor through the reactor.
      for (let ghost = 0; ghost < 3; ghost += 1) {
        const along = 0.42 + ghost * 0.5;
        const gr = (9 + ghost * 7) * (0.7 + 0.3 * glint);
        front.globalAlpha = (0.3 - ghost * 0.07) * glint;
        front.drawImage(
          this.sprites[ghost === 1 ? 1 : 2],
          vx - gr + (ghost - 1) * 5,
          vy + (cy - vy) * along * 2 - gr,
          gr * 2,
          gr * 2,
        );
      }
      front.globalAlpha = 1;
    }
  }

  dispose() {
    for (const canvas of this.sprites) {
      canvas.width = 0;
      canvas.height = 0;
    }
    this.sprites = [];
    if (this.flare) {
      this.flare.width = 0;
      this.flare.height = 0;
      this.flare = null;
    }
    for (const image of [this.art.edge, this.art.rim])
      if (image && "width" in image && "getContext" in image) {
        image.width = 0;
        image.height = 0;
      }
    this.art = { edge: null, rim: null };
  }
}

/** A soft round glow: a white-hot centre in `core`, a halo in `tone`. */
function glow(core: string, tone: string) {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const context = canvas.getContext("2d");
  if (context) {
    const gradient = context.createRadialGradient(32, 32, 0, 32, 32, 32);
    gradient.addColorStop(0, `rgb(${core} / 0.95)`);
    gradient.addColorStop(0.14, `rgb(${tone} / 0.7)`);
    gradient.addColorStop(0.45, `rgb(${tone} / 0.16)`);
    gradient.addColorStop(1, `rgb(${tone} / 0)`);
    context.fillStyle = gradient;
    context.fillRect(0, 0, 64, 64);
  }
  return canvas;
}

/** The glint's streak: white along the middle, ice toward the ends. */
function streak() {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 16;
  const context = canvas.getContext("2d");
  if (context) {
    const along = context.createLinearGradient(0, 0, 256, 0);
    along.addColorStop(0, "rgb(150 236 255 / 0)");
    along.addColorStop(0.3, "rgb(150 236 255 / 0.5)");
    along.addColorStop(0.5, "rgb(255 255 255 / 1)");
    along.addColorStop(0.7, "rgb(255 143 216 / 0.5)");
    along.addColorStop(1, "rgb(255 143 216 / 0)");
    context.fillStyle = along;
    context.fillRect(0, 0, 256, 16);
    const across = context.createLinearGradient(0, 0, 0, 16);
    across.addColorStop(0, "rgb(0 0 0 / 0)");
    across.addColorStop(0.5, "rgb(0 0 0 / 1)");
    across.addColorStop(1, "rgb(0 0 0 / 0)");
    context.globalCompositeOperation = "destination-in";
    context.fillStyle = across;
    context.fillRect(0, 0, 256, 16);
  }
  return canvas;
}

/** The armour's lines as canvases, from a painter of the figure (it paints
 * the art into a w x h box and returns false if the art is not here yet).
 * Returns null until then, or where pixels cannot be read. */
export function buildCrescendoArt(
  tier: CrescendoTier,
  suit: CrescendoSuit,
  paint: (context: CanvasRenderingContext2D, w: number, h: number) => boolean,
): CrescendoArt | null {
  if (!tier.edge || typeof document === "undefined") return null;
  const w = tier.edge;
  const h = Math.round((w * suit.height) / suit.width);
  const scratch = document.createElement("canvas");
  scratch.width = w;
  scratch.height = h;
  const context = scratch.getContext("2d", { willReadFrequently: true });
  try {
    if (!context || !paint(context, w, h)) return null;
    const pixels = context.getImageData(0, 0, w, h);
    const { edge, rim } = crescendoLines(pixels.data, w, h);
    const make = (data: Uint8ClampedArray) => {
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const image = new ImageData(w, h);
      image.data.set(data);
      canvas.getContext("2d")?.putImageData(image, 0, 0);
      return canvas;
    };
    return { edge: make(edge), rim: make(rim) };
  } catch {
    return null;
  } finally {
    scratch.width = 0;
    scratch.height = 0;
  }
}
