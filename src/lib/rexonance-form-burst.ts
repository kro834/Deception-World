/* REXONANCE FORM BURST (owner, 2026-11-12): how Rexonance Saga changes form.

   「レクソナンスサーガ・マックスは緑の炎に焼かれて爆散して変身する。ウルトラは
   爆散しつつ大量のナノマシンを取り込みながら変身する。」

   MAX: green fire kindles at the reactor, runs out over the whole figure,
   chars the armour under it, and the armour explodes apart; MAX stands in
   the blast as the fire clears, cools, lights its emitters and glints.
   ULTRA: the armour explodes apart and, in the same moment, hexagonal cells
   pour in from all around; a front of liquid metal takes them in and builds
   ULTRA from the reactor out, and the completion lights it whole.
   RELEASE (back to the standard suit): the form's light dims and the front
   draws back into the reactor; a few cells are shed.

   This file is the play's score and its cast, with no DOM of its own: the
   beats (ms), the frame (every envelope a closed form of the play's clock,
   so a play can be scrubbed, paused or cut anywhere), the device budget and
   governor, the body's field for the fire, and the particles — armour
   shards, embers and cells — each one's pose a closed form of the clock
   too. Particles are sheet sprites placed with drawImage and nothing else:
   no path is built and nothing is stroked a frame, no canvas is left
   uncleared, and so nothing draws a trail or a streak (owner: 流線は不可).
   The stage (rexonance-form-burst-stage.ts) draws the figure and the fire
   in one WebGL pass. The fire is this change's alone: it burns for a second
   and a half and is gone with the blast — it never lingers on a figure. */

export type FormBurstKind = "max" | "ultra" | "release";

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth = (x: number) => {
  const u = clamp01(x);
  return u * u * (3 - 2 * u);
};
const span = (x: number, range: readonly [number, number]) =>
  clamp01((x - range[0]) / (range[1] - range[0]));

/* ---------------- the beats ---------------- */

/** The plays, in ms since each began. */
export const FORM_BURST_BEATS = {
  max: {
    /** The reactor kindles. */
    ignite: [0, 240],
    /** The fire's front runs out from the reactor over the whole figure. */
    engulf: [160, 1180],
    /** The armour chars under it, and its seams glow. */
    char: [480, 1540],
    /** White heat, just before it goes. */
    swell: [1430, 1640],
    /** It explodes apart. */
    burst: 1640,
    flash: [1640, 2020],
    shards: [1640, 2620],
    /** The green fire bursting out, and gone. */
    blast: [1640, 2440],
    /** MAX, from the blast's middle out. */
    reveal: [1690, 2240],
    /** The new armour cools from the fire's heat. */
    cool: [1740, 2500],
    /** Its emitters light, from the reactor out. */
    emit: [2400, 2900],
    glint: [2860, 3260],
    end: 3340,
  },
  ultra: {
    /** The reactor draws in. */
    gather: [0, 150],
    /** It explodes apart, and the cells are already on their way in. */
    burst: 150,
    shatter: [150, 540],
    shards: [150, 1100],
    /** The liquid front builds ULTRA from the reactor out. */
    build: [470, 2460],
    /** The completion: the last cells are in, and it lights whole. */
    close: 2540,
    flash: [2540, 2960],
    aura: [2540, 3520],
    glint: [3080, 3500],
    end: 3660,
  },
  release: {
    /** The form's emitters dim. */
    dim: [0, 240],
    /** The front draws back into the reactor. */
    front: [120, 840],
    /** The reactor answers once. */
    pulse: [780, 1060],
    end: 1100,
  },
} as const;

export const FORM_BURST_MS = {
  max: FORM_BURST_BEATS.max.end,
  ultra: FORM_BURST_BEATS.ultra.end,
  release: FORM_BURST_BEATS.release.end,
} as const;

/** The blast's and the completion's light is local (it falls off from the
 * reactor) and never more than this of white; ULTRA's opening burst is a
 * fifth of it — the page's card has only just flashed. */
export const FORM_BURST_FLASH = 0.6;
const FLASH_RISE_MS = 60;

/** The fronts run in the figure's reach from the reactor (0 at the reactor,
 * 1 at its farthest point); a front at this value has passed everything,
 * its ragged edge included. */
export const FORM_BURST_WHOLE = 1.4;
/** The liquid front's band, in the same reach. */
export const FORM_BURST_BAND = 0.05;
const ENGULF_EASE = 1.5;
const BUILD_EASE = 1.4;
const REVEAL_EASE = 1.6;
/** A front spends this share of its run on the body itself (0 → 1, eased
 * out from the reactor); the rest carries its ragged edge off it. */
const BODY_SHARE = 0.86;
const runFront = (u: number, ease: number) =>
  u < BODY_SHARE
    ? 1 - Math.pow(1 - u / BODY_SHARE, ease)
    : 1 + ((FORM_BURST_WHOLE - 1) * (u - BODY_SHARE)) / (1 - BODY_SHARE);
/** The share of its run at which such a front reaches `reach` on the body. */
const frontReaches = (reach: number, ease: number) =>
  BODY_SHARE * (1 - Math.pow(1 - clamp01(reach), 1 / ease));

/* ---------------- the frame ---------------- */

export type FormBurstFrame = {
  /** 0 MAX, 1 ULTRA, 2 RELEASE. */
  mode: number;
  /** The fire: its front, its strength, the char under it, the white heat. */
  cover: number;
  fire: number;
  char: number;
  swell: number;
  /** The old armour breaking up from the reactor out (0 → 1: gone). */
  shatter: number;
  /** The blast's fire: how far out (0 → 1), and how much is left of it. */
  blast: number;
  blastGain: number;
  /** The local flash (never over FORM_BURST_FLASH). */
  flash: number;
  /** The new form's front: the blast's reveal, the liquid build, or the
   * release's return (it falls). */
  front: number;
  /** The heat left on the new armour (1 → 0). */
  cool: number;
  /** The emitters: how far the lighting has run (the reach; negative: all
   * held dim), and the bloom on the ones just lit. */
  emit: number;
  bloom: number;
  /** The glint's place across the figure (-1: none). */
  glint: number;
  /** The unbuilt body standing in the blast (ULTRA). */
  ghost: number;
  /** The completion's light about the figure (ULTRA). */
  aura: number;
  /** The last moments: the picture is the new form's art exactly. */
  settle: number;
  /** The new form is the one on screen from here on (a cut hands on from
   * it; before, from the old). */
  swapped: boolean;
  done: boolean;
};

export const createFormBurstFrame = (): FormBurstFrame => ({
  mode: 0,
  cover: 0,
  fire: 0,
  char: 0,
  swell: 0,
  shatter: 0,
  blast: 0,
  blastGain: 0,
  flash: 0,
  front: 0,
  cool: 0,
  emit: -1,
  bloom: 0,
  glint: -1,
  ghost: 0,
  aura: 0,
  settle: 0,
  swapped: false,
  done: false,
});

/** A light that is up in a moment and falls away over the rest of its span. */
const pulse = (ms: number, range: readonly [number, number]) => {
  if (ms < range[0] || ms >= range[1]) return 0;
  const t = ms - range[0];
  return t < FLASH_RISE_MS
    ? t / FLASH_RISE_MS
    : 1 - smooth((t - FLASH_RISE_MS) / (range[1] - range[0] - FLASH_RISE_MS));
};
const glintAt = (ms: number, range: readonly [number, number]) =>
  ms <= range[0] || ms >= range[1] ? -1 : -0.25 + 1.75 * span(ms, range);

/** The play at `ms` since it began (closed-form: any ms, in any order). */
export function formBurstFrame(out: FormBurstFrame, kind: FormBurstKind, ms: number) {
  const t = ms > 0 ? ms : 0;
  out.cover = out.fire = out.char = out.swell = out.shatter = 0;
  out.blast = out.blastGain = out.flash = out.front = out.cool = 0;
  out.bloom = out.ghost = out.aura = 0;
  out.emit = -1;
  out.glint = -1;
  if (kind === "max") {
    const B = FORM_BURST_BEATS.max;
    out.mode = 0;
    out.cover = Math.max(0.07 * smooth(span(t, B.ignite)), runFront(span(t, B.engulf), ENGULF_EASE));
    // The blast tears the fire off the body: the skin's first, at once.
    out.fire = smooth(span(t, [0, 320])) * (1 - smooth(span(t, [B.burst, B.burst + 200])));
    out.char = smooth(span(t, B.char));
    out.swell = smooth(span(t, B.swell));
    out.shatter = span(t, [B.burst, B.burst + 240]);
    out.blast = span(t, B.blast);
    out.blastGain = t < B.burst ? 0 : Math.pow(1 - out.blast, 1.5);
    out.flash = FORM_BURST_FLASH * pulse(t, B.flash);
    out.front = runFront(span(t, B.reveal), REVEAL_EASE);
    out.cool = t < B.cool[0] ? 1 : 1 - smooth(span(t, B.cool));
    out.emit = t < B.emit[0] ? -1 : span(t, B.emit) * (FORM_BURST_WHOLE + 0.3);
    out.glint = glintAt(t, B.glint);
    out.settle = smooth(span(t, [B.end - 200, B.end - 40]));
    out.swapped = t >= B.reveal[0] + (B.reveal[1] - B.reveal[0]) * 0.4;
    out.done = t >= B.end;
  } else if (kind === "ultra") {
    const B = FORM_BURST_BEATS.ultra;
    out.mode = 1;
    out.swell = smooth(span(t, B.gather)) * (1 - smooth(span(t, [B.burst, B.burst + 220])));
    out.shatter = span(t, B.shatter);
    out.flash =
      FORM_BURST_FLASH * (0.2 * pulse(t, [B.burst, B.burst + 300]) + pulse(t, B.flash));
    out.front = runFront(span(t, B.build), BUILD_EASE);
    out.ghost = smooth(span(t, [B.burst + 40, B.burst + 330]));
    // Held dim while it builds; lit whole at the completion, with a bloom.
    out.emit = t < B.close ? -1 : FORM_BURST_WHOLE + 0.3;
    out.bloom = pulse(t, [B.close, B.close + 760]);
    out.aura = pulse(t, B.aura);
    out.glint = glintAt(t, B.glint);
    out.settle = smooth(span(t, [B.end - 200, B.end - 40]));
    out.swapped = t >= B.build[0] + (B.build[1] - B.build[0]) * 0.3;
    out.done = t >= B.end;
  } else {
    const B = FORM_BURST_BEATS.release;
    out.mode = 2;
    out.cool = smooth(span(t, B.dim));
    out.front = FORM_BURST_WHOLE * (1 - smooth(span(t, B.front)));
    out.swell = Math.sin(Math.PI * span(t, B.pulse));
    out.settle = smooth(span(t, [B.end - 120, B.end - 20]));
    out.swapped = t >= (B.front[0] + B.front[1]) / 2;
    out.done = t >= B.end;
  }
  return out;
}

/** When MAX's fire reaches a point `reach` from the reactor (0 – 1), ms. */
export function formBurstLit(reach: number) {
  const [from, to] = FORM_BURST_BEATS.max.engulf;
  return from + (to - from) * frontReaches(reach, ENGULF_EASE);
}

/** When ULTRA's liquid front reaches a point `reach` from the reactor, ms. */
export function formBurstBuilt(reach: number) {
  const [from, to] = FORM_BURST_BEATS.ultra.build;
  return from + (to - from) * frontReaches(reach, BUILD_EASE);
}

/* ---------------- the device budget ---------------- */

export type FormBurstBudget = {
  /** The armour's shards, and MAX's embers. */
  shards: number;
  embers: number;
  /** ULTRA's cells: the plates and the specks (about three times the
   * suit-up skin's own budget). */
  large: number;
  fine: number;
  /** The highest backing-store ratio of the figure's canvas, and of the
   * particles'. */
  ratio: number;
  air: number;
};

type BudgetEnvironment = {
  navigator?: { deviceMemory?: number; hardwareConcurrency?: number };
  matchMedia?: (query: string) => { matches: boolean };
  innerWidth?: number;
  innerHeight?: number;
};

/** The play's budget by device; none under reduced motion. */
export function formBurstBudget(
  environment: BudgetEnvironment = globalThis,
): FormBurstBudget | null {
  const media = (query: string) => Boolean(environment.matchMedia?.(query).matches);
  if (media("(prefers-reduced-motion: reduce)")) return null;
  if (!media("(pointer: coarse), (any-pointer: coarse)"))
    return { shards: 150, embers: 96, large: 140, fine: 1500, ratio: 2, air: 2 };
  const memory = environment.navigator?.deviceMemory;
  const cores = environment.navigator?.hardwareConcurrency ?? 0;
  if ((memory !== undefined && memory <= 4) || (cores > 0 && cores <= 4))
    return { shards: 56, embers: 32, large: 44, fine: 420, ratio: 1.25, air: 1.25 };
  const short = Math.min(environment.innerWidth || 0, environment.innerHeight || 0);
  return short >= 700
    ? { shards: 124, embers: 72, large: 112, fine: 1150, ratio: 1.5, air: 1.5 }
    : { shards: 96, embers: 56, large: 88, fine: 900, ratio: 2, air: 2 };
}

/** What each of the governor's levels keeps: the canvas's quality and the
 * particles' share. */
export const FORM_BURST_QUALITY = [1, 0.8, 0.62, 0.5] as const;
export const FORM_BURST_SHARE = [1, 0.75, 0.55, 0.4] as const;
export const FORM_BURST_SLOW_MS = 26;

/** Sheds work when frames run long, a level at a time, and gives it back
 * only after a long clean run (a play is a few seconds: it mostly sheds). */
export class FormBurstGovernor {
  level: number;
  private score = 0;
  private clean = 0;
  constructor(level = 0) {
    this.level = level;
  }
  sample(dt: number) {
    if (!(dt > 0) || dt > 200) return this.level;
    if (dt > FORM_BURST_SLOW_MS) {
      this.clean = 0;
      this.score += dt > 40 ? 2 : 1;
      if (this.score >= 6 && this.level < FORM_BURST_QUALITY.length - 1) {
        this.level += 1;
        this.score = 0;
      }
    } else {
      this.score = Math.max(0, this.score - 0.25);
      this.clean += 1;
      if (this.clean >= 150 && this.level > 0) {
        this.level -= 1;
        this.clean = 0;
      }
    }
    return this.level;
  }
}

/* ---------------- the body's field ---------------- */

/** The field's ranges, in figure widths (as the suit-up's fire reads its
 * own, rexonance-fire/fire-field.js). */
export const FORM_BURST_FIELD = { D: 0.6, LIFT: 1.2, IN: 0.12 } as const;

export type FormBurstField = {
  w: number;
  h: number;
  /** RGBA: R the distance outside the body, G the lift (how far straight
   * up from the body below), B the distance inside, A the body itself. */
  bytes: Uint8Array;
  /** Points on the body (u, v pairs in the art), for the particles. */
  points: Float32Array;
};

/** The body's coverage from capsules ([x0, y0, x1, y1, r], x and r in the
 * picture's widths, y in its heights): the panel's art is a whole painting
 * (no alpha), and the forms stand alike in it. */
export function capsuleCover(w: number, h: number, capsules: readonly (readonly number[])[]) {
  const cover = new Float32Array(w * h);
  const aspect = h / w;
  for (let y = 0; y < h; y += 1)
    for (let x = 0; x < w; x += 1) {
      const px = (x + 0.5) / w;
      const py = ((y + 0.5) / h) * aspect;
      let best = 0;
      for (const [x0, y0, x1, y1, r] of capsules) {
        const ax = x0;
        const ay = y0 * aspect;
        const bx = x1 - ax;
        const by = y1 * aspect - ay;
        const length = bx * bx + by * by;
        const k = length > 0 ? clamp01(((px - ax) * bx + (py - ay) * by) / length) : 0;
        const dx = px - ax - bx * k;
        const dy = py - ay - by * k;
        const value = clamp01((r - Math.sqrt(dx * dx + dy * dy)) * w * 0.7 + 0.5);
        if (value > best) best = value;
      }
      cover[y * w + x] = best;
    }
  return cover;
}

/** A painting's figure matte: 1 bit a cell (row-major, most significant bit
 * first, base64), in the painting's frame. */
export type FormBurstMatte = { width: number; height: number; bits: string };

const decodeBase64 = (text: string) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0));

/** The body's coverage from a matte (bilinear between its cells), at the
 * field's size. */
export function matteCover(w: number, h: number, matte: FormBurstMatte) {
  const bytes = decodeBase64(matte.bits);
  const mw = matte.width;
  const mh = matte.height;
  const bit = (x: number, y: number) => {
    const cx = x < 0 ? 0 : x >= mw ? mw - 1 : x;
    const cy = y < 0 ? 0 : y >= mh ? mh - 1 : y;
    const n = cy * mw + cx;
    return (bytes[n >> 3] >> (7 - (n & 7))) & 1;
  };
  const cover = new Float32Array(w * h);
  for (let y = 0; y < h; y += 1)
    for (let x = 0; x < w; x += 1) {
      const u = ((x + 0.5) / w) * mw - 0.5;
      const v = ((y + 0.5) / h) * mh - 0.5;
      const x0 = Math.floor(u);
      const y0 = Math.floor(v);
      const fx = u - x0;
      const fy = v - y0;
      const top = bit(x0, y0) * (1 - fx) + bit(x0 + 1, y0) * fx;
      const bottom = bit(x0, y0 + 1) * (1 - fx) + bit(x0 + 1, y0 + 1) * fx;
      cover[y * w + x] = top * (1 - fy) + bottom * fy;
    }
  return cover;
}

/** The union of two coverages (a point of either form's body is body). */
export function unionCover(a: Float32Array, b: Float32Array) {
  const out = new Float32Array(a.length);
  for (let n = 0; n < a.length; n += 1) out[n] = a[n] > b[n] ? a[n] : b[n];
  return out;
}

/** Bakes the field from the body's coverage (0 – 1 a texel). `unit`: texels
 * a figure width. */
export function bakeFormBurstField(
  cover: Float32Array,
  w: number,
  h: number,
  unit: number,
): FormBurstField {
  const size = w * h;
  const far = w + h;
  const outside = new Float32Array(size);
  const inside = new Float32Array(size);
  for (let n = 0; n < size; n += 1) {
    const body = cover[n] >= 0.5;
    outside[n] = body ? 0 : far;
    inside[n] = body ? far : 0;
  }
  // Two chamfer passes each (1 across, 1.4 diagonally).
  const chamfer = (d: Float32Array) => {
    const at = (x: number, y: number) => (x < 0 || y < 0 || x >= w || y >= h ? far : d[y * w + x]);
    for (let y = 0; y < h; y += 1)
      for (let x = 0; x < w; x += 1) {
        const n = y * w + x;
        d[n] = Math.min(
          d[n],
          at(x - 1, y) + 1,
          at(x, y - 1) + 1,
          at(x - 1, y - 1) + 1.4,
          at(x + 1, y - 1) + 1.4,
        );
      }
    for (let y = h - 1; y >= 0; y -= 1)
      for (let x = w - 1; x >= 0; x -= 1) {
        const n = y * w + x;
        d[n] = Math.min(
          d[n],
          at(x + 1, y) + 1,
          at(x, y + 1) + 1,
          at(x + 1, y + 1) + 1.4,
          at(x - 1, y + 1) + 1.4,
        );
      }
  };
  chamfer(outside);
  chamfer(inside);
  const bytes = new Uint8Array(size * 4);
  const byte = (value: number) => Math.max(0, Math.min(255, Math.round(value * 255)));
  let count = 0;
  for (let x = 0; x < w; x += 1) {
    // The lift: up each column from the body below it.
    let lift = far;
    for (let y = h - 1; y >= 0; y -= 1) {
      const n = y * w + x;
      const body = cover[n] >= 0.5;
      lift = body ? 0 : lift + 1;
      if (body) count += 1;
      bytes[n * 4] = byte(outside[n] / unit / FORM_BURST_FIELD.D);
      bytes[n * 4 + 1] = byte(lift / unit / FORM_BURST_FIELD.LIFT);
      bytes[n * 4 + 2] = byte(Math.max(0, inside[n] - 0.5) / unit / FORM_BURST_FIELD.IN);
      bytes[n * 4 + 3] = byte(cover[n]);
    }
  }
  const points = new Float32Array(count * 2);
  let k = 0;
  for (let y = 0; y < h; y += 1)
    for (let x = 0; x < w; x += 1)
      if (cover[y * w + x] >= 0.5) {
        points[k] = (x + 0.5) / w;
        points[k + 1] = (y + 0.5) / h;
        k += 2;
      }
  return { w, h, bytes, points };
}

/* ---------------- the sheet ---------------- */

/** This play's own sprites: four charred shards of a hexagonal plate (the
 * whole plate, a half, a third, a sixth), each with its edge still burning;
 * an ember; a soft green glow. Filled once a page; nothing is stroked. */
export const FORM_BURST_SHEET = { width: 256, height: 128, shard: 64, shards: 4, ember: 32, glow: 64 } as const;

type SheetContext = Pick<
  CanvasRenderingContext2D,
  "beginPath" | "moveTo" | "lineTo" | "closePath" | "fill" | "fillRect" | "createRadialGradient" | "createLinearGradient"
> & { fillStyle: string | CanvasGradient | CanvasPattern };

/** Draws the sheet into a canvas the caller makes (once a page). */
export function buildFormBurstSheet<Canvas extends { getContext(kind: "2d"): unknown }>(
  make: (width: number, height: number) => Canvas | null,
): Canvas | null {
  const canvas = make(FORM_BURST_SHEET.width, FORM_BURST_SHEET.height);
  const context = canvas?.getContext("2d") as SheetContext | null | undefined;
  if (!canvas || !context) return null;
  const S = FORM_BURST_SHEET.shard;
  // A pointy-top hexagon's corners (the site's cells), `from` to `to`.
  const corner = (x: number, y: number, r: number, n: number) =>
    [x + Math.cos(Math.PI / 6 + (n * Math.PI) / 3) * r, y + Math.sin(Math.PI / 6 + (n * Math.PI) / 3) * r] as const;
  const piece = (x: number, y: number, r: number, corners: readonly number[], middle: boolean) => {
    context.beginPath();
    corners.forEach((n, index) => {
      const [px, py] = corner(x, y, r, n);
      if (index) context.lineTo(px, py);
      else context.moveTo(px, py);
    });
    if (middle) context.lineTo(x, y);
    context.closePath();
  };
  const PIECES: readonly (readonly [readonly number[], boolean, number, number])[] = [
    [[0, 1, 2, 3, 4, 5], false, 0, 0],
    [[0, 1, 2, 3], false, 0, -7],
    [[0, 1, 2], true, 5, -9],
    [[0, 1], true, -7, -11],
  ];
  PIECES.forEach(([corners, middle, dx, dy], index) => {
    const x = index * S + S / 2 + dx;
    const y = S / 2 + dy;
    // The burning edge: green, hottest toward the upper left.
    const edge = context.createLinearGradient(x - 26, y - 26, x + 26, y + 26);
    edge.addColorStop(0, "rgb(214 255 190 / 0.98)");
    edge.addColorStop(0.45, "rgb(74 236 120 / 0.96)");
    edge.addColorStop(1, "rgb(12 110 48 / 0.94)");
    piece(x, y, 26, corners, middle);
    context.fillStyle = edge;
    context.fill();
    // The charred plate, set in: near black, a faint bevel.
    const face = context.createLinearGradient(x - 22, y - 22, x + 22, y + 22);
    face.addColorStop(0, "rgb(34 44 38 / 0.98)");
    face.addColorStop(0.5, "rgb(10 15 13 / 0.98)");
    face.addColorStop(1, "rgb(3 6 5 / 0.98)");
    piece(x + (middle ? 1.6 : 0), y + (middle ? 1.6 : 0), middle ? 20.5 : 22.5, corners, middle);
    context.fillStyle = face;
    context.fill();
  });
  // The ember: a white heart in green.
  {
    const E = FORM_BURST_SHEET.ember;
    const x = E / 2;
    const y = S + E / 2;
    const ember = context.createRadialGradient(x, y, 0, x, y, E / 2);
    ember.addColorStop(0, "rgb(244 255 232 / 1)");
    ember.addColorStop(0.22, "rgb(150 255 150 / 0.9)");
    ember.addColorStop(0.55, "rgb(40 214 96 / 0.34)");
    ember.addColorStop(1, "rgb(10 120 50 / 0)");
    context.fillStyle = ember;
    context.fillRect(0, S, E, E);
  }
  // The glow: what a burning shard lights about itself.
  {
    const G = FORM_BURST_SHEET.glow;
    const x = FORM_BURST_SHEET.ember + G / 2;
    const y = S + G / 2;
    const glow = context.createRadialGradient(x, y, 0, x, y, G / 2);
    glow.addColorStop(0, "rgb(170 255 170 / 0.5)");
    glow.addColorStop(0.4, "rgb(50 220 100 / 0.2)");
    glow.addColorStop(1, "rgb(10 120 50 / 0)");
    context.fillStyle = glow;
    context.fillRect(FORM_BURST_SHEET.ember, S, G, G);
  }
  return canvas;
}

/* ---------------- the particles ---------------- */

/** The suit-up's own cells' sheet (the skin's buildSkinCellSheet):
 * the plates' side, the specks' row, side, tones and turns. */
export type FormBurstCells = {
  plate: number;
  plates: number;
  speckY: number;
  speck: number;
  tones: number;
  turns: number;
};

/** The only calls a particle is ever drawn with: a sprite placed by a
 * transform. No path, no stroke, no gradient, no shadow. */
export type FormBurstContext = {
  setTransform(a: number, b: number, c: number, d: number, e: number, f: number): void;
  drawImage(
    image: CanvasImageSource,
    sx: number,
    sy: number,
    sw: number,
    sh: number,
    dx: number,
    dy: number,
    dw: number,
    dh: number,
  ): void;
  globalAlpha: number;
  globalCompositeOperation: string;
};

/** Where the art stands on the particles' canvas (backing px), the canvas's
 * px a CSS px, and the reactor in the art. */
export type FormBurstView = {
  x: number;
  y: number;
  w: number;
  h: number;
  px: number;
  origin: readonly [number, number];
};

const hash = (n: number, salt: number) => {
  let h = Math.imul(n + 1, 0x9e3779b1) ^ Math.imul(salt + 7, 0x85ebca6b);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  h = Math.imul(h, 0x297a2d39);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
};

const SHARD = 10;
const EMBER = 8;
const CELL = 10;
/** A shard's flight: how hard the air holds it (a second), in the art's
 * heights. */
const DRAG = 3.1;
/** A cell's way in at flight share p (the suit-up's own, cellEase): slow
 * out of the air, quickening onto the surface. */
export const formBurstCellEase = (p: number) => {
  const u = clamp01(p);
  const v = u * u;
  return 0.25 * u + 0.75 * v * v;
};
/** The cells' sizes in the art's heights (the suit-up's are 46 – 92 and
 * 4.5 – 11 px of its 1040), and their least in CSS px. */
export const FORM_BURST_CELL_SIZE = {
  large: [0.03, 0.072],
  fine: [0.006, 0.014],
  largeMin: 14,
  fineMin: 2.6,
} as const;
/** A cell's flight (ms): the specks', the plates'; and how long the front
 * takes one in. */
export const FORM_BURST_CELL_FLIGHT = {
  fine: [420, 800],
  large: [620, 1020],
  absorb: [110, 190],
  /** A cell lands this long before the front is there. */
  lead: 50,
} as const;

export class FormBurstParticles {
  readonly budget: FormBurstBudget;
  private shards: Float32Array;
  private embers: Float32Array;
  private cells: Float32Array;
  private shed: Float32Array;
  /** Drawn in the last frame (0: nothing of the play is in the air). */
  live = 0;

  /** `points`: the body (u, v pairs); `aspect`: the art's width a height;
   * `origin`: the reactor in the art; `reach`: the body's farthest point
   * from it (heights). */
  constructor(
    budget: FormBurstBudget,
    points: Float32Array,
    aspect: number,
    origin: readonly [number, number],
    reach: number,
    seed = 1,
  ) {
    this.budget = budget;
    const count = points.length >> 1;
    const pick = (n: number, salt: number) => (count ? Math.floor(hash(n, salt) * count) * 2 : 0);
    const reachOf = (u: number, v: number) =>
      Math.hypot((u - origin[0]) * aspect, v - origin[1]) / (reach || 1);
    const ready = count > 0;
    // The shards: each leaves from a point on the armour, straight out from
    // the reactor (a little off it), the near ones first.
    this.shards = new Float32Array((ready ? budget.shards : 0) * SHARD);
    for (let n = 0; n < this.shards.length / SHARD; n += 1) {
      const at = pick(n, seed);
      const u = points[at];
      const v = points[at + 1];
      const dx = (u - origin[0]) * aspect;
      const dy = v - origin[1];
      const turn = Math.atan2(dy, dx) + (hash(n, seed + 1) - 0.5) * 1.1;
      const s = n * SHARD;
      this.shards[s] = u;
      this.shards[s + 1] = v;
      this.shards[s + 2] = Math.cos(turn);
      this.shards[s + 3] = Math.sin(turn);
      // Its speed (heights a second), its spin and tumble (radians a second).
      this.shards[s + 4] = 0.8 + 1.9 * hash(n, seed + 2) * hash(n, seed + 3);
      this.shards[s + 5] = (hash(n, seed + 4) - 0.5) * 11;
      this.shards[s + 6] = 3 + hash(n, seed + 5) * 6;
      // Its size (heights), its life (ms), when it leaves (ms after the burst).
      this.shards[s + 7] = 0.017 + 0.04 * Math.pow(hash(n, seed + 6), 1.7);
      this.shards[s + 8] = 520 + 400 * hash(n, seed + 7);
      this.shards[s + 9] = 90 * reachOf(u, v);
    }
    // The embers: the first two thirds rise off the burning armour; the
    // rest are thrown by the blast.
    this.embers = new Float32Array((ready ? budget.embers : 0) * EMBER);
    const burst = FORM_BURST_BEATS.max.burst;
    for (let n = 0; n < this.embers.length / EMBER; n += 1) {
      const at = pick(n, seed + 11);
      const u = points[at];
      const v = points[at + 1];
      const e = n * EMBER;
      const thrown = n % 3 === 2;
      this.embers[e] = u;
      this.embers[e + 1] = v;
      this.embers[e + 2] = thrown ? 1 : 0;
      // Born once the fire is there (never before), until the blast.
      const lit = formBurstLit(reachOf(u, v)) + 60;
      this.embers[e + 3] = thrown
        ? burst + 80 * hash(n, seed + 12)
        : lit + Math.max(0, burst - 200 - lit) * hash(n, seed + 12);
      this.embers[e + 4] = 520 + 620 * hash(n, seed + 13);
      // Its rise (or its throw), its sway, its size.
      this.embers[e + 5] = thrown ? 0.5 + 1.5 * hash(n, seed + 14) : 0.1 + 0.26 * hash(n, seed + 14);
      this.embers[e + 6] = thrown
        ? Math.atan2(v - origin[1], (u - origin[0]) * aspect) + (hash(n, seed + 15) - 0.5) * 1.6
        : hash(n, seed + 15) * 6.283;
      this.embers[e + 7] = 0.0035 + 0.0065 * hash(n, seed + 16);
    }
    // ULTRA's cells: each one's landing is where and when the liquid front
    // will be (formBurstBuilt), so the front takes it in as it arrives.
    const total = ready ? budget.large + budget.fine : 0;
    this.cells = new Float32Array(total * CELL);
    const F = FORM_BURST_CELL_FLIGHT;
    for (let n = 0; n < total; n += 1) {
      const large = n < budget.large;
      const at = pick(n, seed + 21);
      const u = points[at];
      const v = points[at + 1];
      const c = n * CELL;
      const flights = large ? F.large : F.fine;
      const lands = formBurstBuilt(reachOf(u, v)) - F.lead;
      let flight = flights[0] + (flights[1] - flights[0]) * hash(n, seed + 22);
      // (The first to land were already close when the armour went.)
      if (lands - flight < 0) flight = Math.max(260, lands);
      // From all around: most from beyond the frame, some out of the air.
      const turn = hash(n, seed + 23) * 6.283;
      const near = hash(n, seed + 24) < 0.3;
      const far = near ? 0.26 + 0.3 * hash(n, seed + 25) : 0.72 + 0.5 * hash(n, seed + 25);
      this.cells[c] = u;
      this.cells[c + 1] = v;
      this.cells[c + 2] = Math.cos(turn) * far;
      this.cells[c + 3] = Math.sin(turn) * far;
      this.cells[c + 4] = lands;
      this.cells[c + 5] = flight;
      const sizes = large ? FORM_BURST_CELL_SIZE.large : FORM_BURST_CELL_SIZE.fine;
      this.cells[c + 6] = sizes[0] + (sizes[1] - sizes[0]) * Math.pow(hash(n, seed + 26), large ? 1.6 : 1);
      // Its bow off the straight way in, and its turn.
      this.cells[c + 7] = (hash(n, seed + 27) - 0.5) * (near ? 0.05 : 0.16);
      this.cells[c + 8] = hash(n, seed + 28) * 6.283;
      this.cells[c + 9] = F.absorb[0] + (F.absorb[1] - F.absorb[0]) * hash(n, seed + 29);
    }
    // The release's cells: shed where the front draws back from.
    const R = FORM_BURST_BEATS.release;
    this.shed = new Float32Array((ready ? Math.min(90, Math.round(budget.fine * 0.1)) : 0) * EMBER);
    for (let n = 0; n < this.shed.length / EMBER; n += 1) {
      const at = pick(n, seed + 31);
      const u = points[at];
      const v = points[at + 1];
      const e = n * EMBER;
      const far = clamp01(reachOf(u, v));
      const turn = Math.atan2(v - origin[1], (u - origin[0]) * aspect) + (hash(n, seed + 32) - 0.5);
      this.shed[e] = u;
      this.shed[e + 1] = v;
      this.shed[e + 2] = Math.cos(turn);
      this.shed[e + 3] = Math.sin(turn);
      this.shed[e + 4] = R.front[0] + (R.front[1] - R.front[0]) * (1 - far) * 0.7;
      this.shed[e + 5] = 260 + 180 * hash(n, seed + 33);
      this.shed[e + 6] = 0.03 + 0.07 * hash(n, seed + 34);
      this.shed[e + 7] = 0.005 + 0.005 * hash(n, seed + 35);
    }
  }

  /** The particles at `ms` of the play, onto a cleared canvas. `wall`: for
   * the embers' and the cells' glint only. `own`: this play's sheet;
   * `sheet`: the suit-up's cells'. `share`: the governor's (0 – 1). */
  draw(
    context: FormBurstContext,
    kind: FormBurstKind,
    ms: number,
    wall: number,
    view: FormBurstView,
    own: CanvasImageSource | null,
    sheet: CanvasImageSource | null,
    cells: FormBurstCells,
    share = 1,
  ) {
    let live = 0;
    const { x: left, y: top, w, h, px } = view;
    context.globalCompositeOperation = "source-over";
    if (kind === "max" || kind === "ultra") {
      const B = kind === "max" ? FORM_BURST_BEATS.max : FORM_BURST_BEATS.ultra;
      const source = kind === "max" ? own : sheet;
      const side = kind === "max" ? FORM_BURST_SHEET.shard : cells.plate;
      const kinds = kind === "max" ? FORM_BURST_SHEET.shards : cells.plates;
      const data = this.shards;
      const count = Math.floor((data.length / SHARD) * share);
      if (source && ms >= B.burst && ms < B.shards[1])
        for (let n = 0; n < count; n += 1) {
          const s = n * SHARD;
          const t = ms - B.burst - data[s + 9];
          const life = data[s + 8];
          if (t <= 0 || t >= life) continue;
          const seconds = t / 1000;
          // Thrown, and held by the air; the fire's draught lifts it a little.
          const far = (data[s + 4] * (1 - Math.exp(-DRAG * seconds))) / DRAG;
          const cx = left + data[s] * w + data[s + 2] * far * h;
          const cy = top + data[s + 1] * h + data[s + 3] * far * h + (kind === "max" ? -0.05 : 0.04) * seconds * seconds * h;
          const p = t / life;
          const size = Math.max(5 * px, data[s + 7] * h * (kind === "max" ? 1 : 1.25)) * (1 - 0.4 * p);
          const turn = data[s + 5] * seconds + n;
          // It tumbles: seen edge-on now and then, never thinner than a fifth.
          const tumble = 0.2 + 0.8 * Math.abs(Math.cos(data[s + 6] * seconds + n * 1.7));
          const cos = Math.cos(turn) * size;
          const sin = Math.sin(turn) * size;
          context.globalAlpha = Math.min(1, t / 40) * (p < 0.55 ? 1 : 1 - smooth((p - 0.55) / 0.45));
          context.setTransform(cos, sin, -sin * tumble, cos * tumble, cx, cy);
          context.drawImage(source, (n % kinds) * side, 0, side, side, -0.5, -0.5, 1, 1);
          live += 1;
        }
    }
    if (kind === "max" && own) {
      // The embers, as light.
      context.globalCompositeOperation = "lighter";
      const data = this.embers;
      const count = Math.floor((data.length / EMBER) * share);
      const E = FORM_BURST_SHEET.ember;
      for (let n = 0; n < count; n += 1) {
        const e = n * EMBER;
        const t = ms - data[e + 3];
        const life = data[e + 4];
        if (t <= 0 || t >= life) continue;
        const seconds = t / 1000;
        const p = t / life;
        let cx = left + data[e] * w;
        let cy = top + data[e + 1] * h;
        if (data[e + 2]) {
          const far = (data[e + 5] * (1 - Math.exp(-DRAG * seconds))) / DRAG;
          cx += Math.cos(data[e + 6]) * far * h;
          cy += Math.sin(data[e + 6]) * far * h - 0.09 * seconds * seconds * h;
        } else {
          // It rises, quickening, and sways as it goes.
          cy -= data[e + 5] * seconds * (1 + 1.6 * seconds) * h;
          cx += Math.sin(data[e + 6] + seconds * 5.2) * 0.012 * (0.4 + seconds) * h;
        }
        const size = Math.max(2.2 * px, data[e + 7] * h * (1 - 0.5 * p)) * 2.4;
        const glint = 0.7 + 0.3 * Math.sin(wall * 0.021 + n * 2.4);
        context.globalAlpha = Math.min(1, t / 70) * (1 - p * p) * glint;
        context.setTransform(size, 0, 0, size, cx, cy);
        context.drawImage(own, 0, FORM_BURST_SHEET.shard, E, E, -0.5, -0.5, 1, 1);
        live += 1;
      }
      context.globalCompositeOperation = "source-over";
    }
    if (kind === "ultra" && sheet && ms < FORM_BURST_BEATS.ultra.close) {
      const data = this.cells;
      const large = Math.floor(this.budget.large * share);
      const fine = Math.floor(this.budget.fine * share);
      const S = FORM_BURST_CELL_SIZE;
      for (let pass = 0; pass < 2; pass += 1) {
        // The specks first, the plates over them.
        const from = pass ? 0 : this.budget.large;
        const to = pass ? large : this.budget.large + fine;
        for (let n = from; n < to; n += 1) {
          const c = n * CELL;
          const lands = data[c + 4];
          const flight = data[c + 5];
          const t = ms - (lands - flight);
          const absorb = data[c + 9];
          if (t <= 0 || ms >= lands + absorb) continue;
          const p = t / flight;
          const eased = formBurstCellEase(p);
          const landed = ms > lands ? (ms - lands) / absorb : 0;
          const tx = left + data[c] * w;
          const ty = top + data[c + 1] * h;
          // Its way in bows a little and straightens onto the surface.
          const bow = data[c + 7] * Math.sin(Math.PI * eased) * (1 - eased) * h;
          const away = 1 - eased;
          const cx = tx + (data[c + 2] * away - data[c + 3] * bow / h) * h;
          const cy = ty + (data[c + 3] * away + data[c + 2] * bow / h) * h;
          const least = pass ? S.largeMin : S.fineMin;
          // Small as it forms in the air, true on its way, taken in.
          const size =
            Math.max(least * px, data[c + 6] * h) *
            (0.55 + 0.45 * smooth(p * 4)) *
            (1 - 0.55 * landed);
          const glint = pass ? 1 : 0.72 + 0.28 * Math.sin(wall * 0.013 + n * 1.9);
          context.globalAlpha = smooth(p * (pass ? 5 : 6)) * (1 - landed) * (pass ? 0.94 : glint);
          if (pass) {
            const turn = data[c + 8] + (1 - eased) * 1.4;
            const tilt = 0.45 + 0.55 * eased;
            const cos = Math.cos(turn) * size;
            const sin = Math.sin(turn) * size;
            context.setTransform(cos, sin, -sin * tilt, cos * tilt, cx, cy);
            context.drawImage(sheet, (n % cells.plates) * cells.plate, 0, cells.plate, cells.plate, -0.5, -0.5, 1, 1);
          } else {
            context.setTransform(size, 0, 0, size, cx, cy);
            context.drawImage(
              sheet,
              (n % cells.turns) * cells.speck,
              cells.speckY + (n % cells.tones) * cells.speck,
              cells.speck,
              cells.speck,
              -0.5,
              -0.5,
              1,
              1,
            );
          }
          live += 1;
        }
      }
    }
    if (kind === "release" && sheet) {
      const data = this.shed;
      const count = Math.floor((data.length / EMBER) * share);
      for (let n = 0; n < count; n += 1) {
        const e = n * EMBER;
        const t = ms - data[e + 4];
        const life = data[e + 5];
        if (t <= 0 || t >= life) continue;
        const p = t / life;
        const far = data[e + 6] * (1 - (1 - p) * (1 - p));
        const size = Math.max(FORM_BURST_CELL_SIZE.fineMin * px, data[e + 7] * h) * (1 - 0.4 * p);
        context.globalAlpha = smooth(p * 5) * (1 - p) * 0.9;
        context.setTransform(
          size,
          0,
          0,
          size,
          left + data[e] * w + data[e + 2] * far * h,
          top + data[e + 1] * h + data[e + 3] * far * h,
        );
        context.drawImage(
          sheet,
          (n % cells.turns) * cells.speck,
          cells.speckY + (n % cells.tones) * cells.speck,
          cells.speck,
          cells.speck,
          -0.5,
          -0.5,
          1,
          1,
        );
        live += 1;
      }
    }
    context.globalAlpha = 1;
    context.setTransform(1, 0, 0, 1, 0, 0);
    this.live = live;
    return live;
  }
}
