/* REXONANCE SKIN (owner, 2026-11-11: the suit-up 「ナノテクのように滑らかで
   緻密に」). The armour no longer arrives as plates and tiles: it grows from
   the reactor as one continuous front of liquid nanite metal that runs over
   the torso, down the limbs to the hands and feet, along the tail and the
   ribbons, and last of all rises from the neck and closes over the face.
   Behind the front, four bands a few tens of pixels deep travel with it:

     the lip      dark chrome with a white-hot leading edge;
     the fibres   striations along the flow, still unpainted metal;
     the cells    a hexagonal micro-tessellation whose cells click solid one
                  by one and take the art's colour, while the panel lines
                  light and cool;
     the armour   the art itself, each of its emitters (the glow lines,
                  the gems, the reactor's details) lighting a moment after
                  the shell over it is whole; the reactor's first, the
                  trigger, and the eyes last, with the scene's own light.

   The front is a comparison against a field baked once from the art: the
   geodesic distance inside the armour's silhouette from the reactor (and the
   delayed satellite seeds at the driver, the shoulders and the knees), in
   regions taken from the suit's own plates so the helmet is last, with a
   fingered edge (noise) and veins that race ahead down each limb. One
   fragment shader draws it on a figure-sized WebGL canvas: one quad a frame,
   whatever the device. Droplets skim just ahead of the front and are drawn
   back into it, and the matter itself comes in from the air as hexagonal
   cells the front takes in (SkinCells).

   Everything is closed-form in the two fronts the caller passes (the body's
   and the head's), so the entry plays it on the call's clock and the scroll
   scene scrubs it both ways. This module imports nothing and is fetched on
   its own, lazily, only where Rexonance's suit-up plays; without WebGL (or
   if anything here fails) the classic nanite engines play instead. */

/** The bands' depth in field units (wider reads as a cross-fade). */
export const SKIN_BAND = 0.06;
/** A texel is finished armour this many bands behind the front. */
export const SKIN_BANDS = 5;
/** The front's value once every texel is finished. */
export const SKIN_WHOLE = 1 + (SKIN_BANDS + 0.4) * SKIN_BAND;

/* ---------------- the device budget ---------------- */

export type SkinBudget = {
  /** Droplet samples over the whole armour (about a tenth are live at once:
   * 600 on a desktop, 250 on a phone). */
  samples: number;
  /** The highest backing-store ratio of the skin's canvas. */
  ratio: number;
  /** The cells taken in from the air (SkinCells): the large plates and
   * the fine specks. */
  large: number;
  fine: number;
};

type BudgetEnvironment = {
  navigator?: { deviceMemory?: number; hardwareConcurrency?: number };
  matchMedia?: (query: string) => { matches: boolean };
  innerWidth?: number;
  innerHeight?: number;
};

/** The skin's budget by device; none under reduced motion. */
export function skinBudget(environment: BudgetEnvironment = globalThis): SkinBudget | null {
  const media = (query: string) => Boolean(environment.matchMedia?.(query).matches);
  if (media("(prefers-reduced-motion: reduce)")) return null;
  if (!media("(pointer: coarse), (any-pointer: coarse)")) return { samples: 6000, ratio: 2, large: 44, fine: 400 };
  const memory = environment.navigator?.deviceMemory;
  const cores = environment.navigator?.hardwareConcurrency ?? 0;
  if ((memory !== undefined && memory <= 4) || (cores > 0 && cores <= 4))
    return { samples: 1200, ratio: 1.5, large: 14, fine: 120 };
  const short = Math.min(environment.innerWidth || 0, environment.innerHeight || 0);
  return short >= 700
    ? { samples: 3600, ratio: 2, large: 34, fine: 300 }
    : { samples: 2500, ratio: 2, large: 25, fine: 220 };
}

/** The canvas's quality at each of the crescendo governor's levels. */
export const SKIN_QUALITY = [1, 1, 0.75, 0.55] as const;

/* ---------------- the field's picture ---------------- */

/** The baked field (scripts/build-rexonance-skin.mjs): an opaque RGB
 * picture, R the field, G the veins, B the armour's mask (128 the body, 255
 * the head; rexonance-suit-skin-field.ts SKIN_MASK). */
export const REXONANCE_SKIN_FIELD = "/rexonance-skin-20261111/field.png";

export type SkinField = {
  w: number;
  h: number;
  /** Droplet samples by field value, the body's then the head's: x, y
   * (cells), the field, the flow's direction x, y, a seed. */
  samples: Float32Array;
  bodySamples: number;
  headSamples: number;
};
export const SKIN_SAMPLE = 6;

const hash2 = (x: number, y: number) => {
  const h = Math.imul(Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263), 1274126177) >>> 0;
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
};

/** The droplets' samples from the field picture's pixels (RGBA, w x h): a
 * share of the armour's cells, `budget` in all, each with the flow's
 * direction there (the field's gradient), sorted by field value. */
export function skinSamples(
  rgba: Uint8ClampedArray | Uint8Array,
  w: number,
  h: number,
  budget: number,
): SkinField {
  const size = w * h;
  const part = (i: number) => (rgba[i * 4 + 2] === 255 ? 2 : rgba[i * 4 + 2] === 128 ? 1 : 0);
  const pick = (want: number, count: number) => {
    let total = 0;
    for (let i = 0; i < size; i += 1) if (part(i) === want) total += 1;
    const share = total ? Math.min(1, count / total) : 0;
    const rows: number[][] = [];
    for (let i = 0; i < size; i += 1) {
      if (part(i) !== want) continue;
      const x = i % w;
      const y = (i - x) / w;
      if (hash2(x + 31, y + 57) >= share) continue;
      const at = (dx: number, dy: number) => {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) return rgba[i * 4];
        const j = ny * w + nx;
        return part(j) === want ? rgba[j * 4] : rgba[i * 4];
      };
      const gx = at(2, 0) - at(-2, 0);
      const gy = at(0, 2) - at(0, -2);
      const length = Math.hypot(gx, gy);
      rows.push([
        x + 0.5,
        y + 0.5,
        rgba[i * 4] / 255,
        length > 0 ? gx / length : 0,
        length > 0 ? gy / length : 1,
        hash2(x + 3, y + 11),
      ]);
    }
    rows.sort((a, b) => a[2] - b[2]);
    return rows;
  };
  const headBudget = Math.round(budget * 0.18);
  const body = pick(1, budget - headBudget);
  const crown = pick(2, headBudget);
  const samples = new Float32Array((body.length + crown.length) * SKIN_SAMPLE);
  body.forEach((row, n) => samples.set(row, n * SKIN_SAMPLE));
  crown.forEach((row, n) => samples.set(row, (body.length + n) * SKIN_SAMPLE));
  return { w, h, samples, bodySamples: body.length, headSamples: crown.length };
}

/* ---------------- the two clocks ---------------- */

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth = (x: number) => {
  const t = clamp01(x);
  return t * t * (3 - 2 * t);
};

export type SkinFrame = {
  /** The body's and the head's fronts (0 → SKIN_WHOLE). */
  body: number;
  head: number;
  /** The skin's own opacity, and the classic engines' under it. */
  alpha: number;
  classic: number;
  /** Whether anything of the skin is on screen, and whether its armour is
   * (the emitters' light outlasts it: see `glow`). */
  on: boolean;
  shell: boolean;
  /** The fronts as they stood `lag` ago: an emitter lights once the shell
   * over it has been whole that long. */
  litBody: number;
  litHead: number;
  /** The lit emitters alone, over the classic engines once the armour has
   * faded, until their own light has run out through the suit. */
  glow: number;
  /** The emitters' light, the eyes', and the reactor's (0–1; the reactor's
   * last pulse a little over). Growing, the eyes are the scene's own to
   * light, last of all: 0. */
  lights: number;
  eyes: number;
  reactor: number;
  /** The droplets' way: 1 out along the flow, -1 back toward the reactor. */
  flow: 1 | -1;
};
export const createSkinFrame = (): SkinFrame => ({
  body: 0,
  head: 0,
  alpha: 0,
  classic: 1,
  on: false,
  shell: false,
  litBody: 0,
  litHead: 0,
  glow: 0,
  lights: 1,
  eyes: 0,
  reactor: 1,
  flow: 1,
});

/** The body's front: fast off the chest, easing as it reaches the hands and
 * feet, never linear and never stepped; then the bands' flush. */
const bodyFront = (u: number, ease: number) => SKIN_WHOLE * (1 - Math.pow(1 - clamp01(u), ease));
/** The head's: the skull rises (ease in and out), the face closes. */
const headFront = (u: number) => {
  const k = clamp01(u);
  return SKIN_WHOLE * (k * k * (3 - 2 * k) * 0.72 + k * 0.28);
};

export type SkinTimeline = {
  /** The body's front runs over [from, to]; the head's over [from, to]. */
  body: readonly [number, number];
  head: readonly [number, number];
  /** The body's ease-out (1: linear; the call's is steeper than the
   * scroll's, whose reader sets the pace). */
  ease: number;
  /** The classic engines leave over `leave` and are back over `back`; the
   * skin is gone by the end of `fade`. */
  leave: readonly [number, number];
  back: readonly [number, number];
  fade: readonly [number, number];
  /** An emitter lights this long after the shell over it is whole, and the
   * lit emitters stay over the classic engines' held lights until those
   * have lit, fading over `glow`. */
  lag: number;
  glow: readonly [number, number];
  /** The scene's light: no cell is in the air from here on. */
  light: number;
  /** The cells (SkinCells), in this clock's units: a fine and a large
   * cell's flight, their absorption (fine, large), when the last wave
   * lands, and the cells' own entrance and exit. */
  cells: {
    fine: readonly [number, number];
    large: readonly [number, number];
    absorb: readonly [number, number];
    wave: readonly [number, number];
    from: readonly [number, number];
    out: readonly [number, number];
  };
};

/** The entry, in the call's canonical ms: the fire's burst (420) is the
 * trigger, the helmet's clamp (1890) the close, the light (1980) after it. */
export const SKIN_ENTRY: SkinTimeline = {
  // (The helmet starts to rise as the limbs' armour sets: nine tenths of
  // the body is finished by 1110, and no beat stands still between them.)
  body: [470, 1750],
  head: [1230, 1880],
  ease: 2,
  leave: [470, 600],
  back: [1880, 1900],
  fade: [1900, 1975],
  lag: 60,
  // The call's light has run out through the body by 1980 + 380.
  glow: [2360, 2440],
  light: 1980,
  cells: {
    fine: [380, 700],
    large: [560, 900],
    absorb: [110, 190],
    wave: [1800, 1945],
    from: [120, 300],
    out: [1958, 1978],
  },
};
/** The scroll scene, in its progress: after the fire's end (0.14), closed
 * before the seal (0.86) and the light (0.9). */
export const SKIN_SCROLL: SkinTimeline = {
  // (Nine tenths of the body is finished by 0.54, the helmet by 0.83, and
  // the last wave gathers from 0.8: no stretch of the scroll is still.)
  body: [0.15, 0.74],
  head: [0.535, 0.852],
  ease: 1.3,
  leave: [0.15, 0.165],
  back: [0.853, 0.858],
  fade: [0.858, 0.872],
  // 60 ms of the auto movie's 24 s, and a little for a slow hand.
  lag: 0.004,
  // The scene's light (0.9 – 0.915) is all but out through the body.
  glow: [0.906, 0.915],
  light: 0.9,
  cells: {
    fine: [0.03, 0.055],
    large: [0.045, 0.075],
    absorb: [0.006, 0.01],
    wave: [0.85, 0.8955],
    from: [0.1, 0.12],
    out: [0.8968, 0.8998],
  },
};

const spanOf = (x: number, [from, to]: readonly [number, number]) =>
  clamp01((x - from) / (to - from));

/** The skin at clock x (the entry's canonical ms or the scroll's progress).
 * Monotone and continuous in x, so a reversed clock retreats over the same
 * frames. */
export function skinFrame(out: SkinFrame, timeline: SkinTimeline, x: number) {
  out.body = bodyFront(spanOf(x, timeline.body), timeline.ease);
  out.head = headFront(spanOf(x, timeline.head));
  out.alpha =
    smooth(
      spanOf(x, [
        timeline.leave[0],
        timeline.leave[0] + (timeline.leave[1] - timeline.leave[0]) * 0.4,
      ]),
    ) *
    (1 - smooth(spanOf(x, timeline.fade)));
  out.classic = 1 - smooth(spanOf(x, timeline.leave)) * (1 - smooth(spanOf(x, timeline.back)));
  out.shell = x > timeline.leave[0] && x < timeline.fade[1];
  out.litBody = bodyFront(spanOf(x - timeline.lag, timeline.body), timeline.ease);
  out.litHead = headFront(spanOf(x - timeline.lag, timeline.head));
  out.glow =
    x > timeline.leave[0] && x < timeline.glow[1] ? 1 - smooth(spanOf(x, timeline.glow)) : 0;
  out.on = x > timeline.leave[0] && x < timeline.glow[1];
  out.lights = 1;
  out.eyes = 0;
  out.reactor = 1;
  out.flow = 1;
  return out;
}

/** When the lip of a front reaches field value `field` (the body's, or the
 * head's): the clock value, by bisection of the same closed forms. */
export function skinReach(timeline: SkinTimeline, field: number, head = false) {
  const [from, to] = head ? timeline.head : timeline.body;
  const front = (u: number) => (head ? headFront(u) : bodyFront(u, timeline.ease));
  let low = 0;
  let high = 1;
  for (let step = 0; step < 40; step += 1) {
    const middle = (low + high) / 2;
    if (front(middle) < field) low = middle;
    else high = middle;
  }
  return from + (to - from) * high;
}

/* ---------------- the retract ---------------- */

/** The suit leaves (owner, 2026-11-11): about 1.6 s, the build's reverse on
 * a clock of its own. The lights go out first (the eyes, then the emitters);
 * the face opens from the visor outward; the helmet sinks to the neck; the
 * limbs' armour is drawn back toward the chest, faster the nearer it gets;
 * the chest closes into the reactor, which dims last, on one last pulse. */
export const SKIN_RETRACT_MS = 1600;
/** Reduced motion and economy: a short fade instead. */
export const SKIN_RETRACT_FADE_MS = 250;
export const SKIN_RETRACT = {
  eyes: [0, 90],
  lights: [50, 220],
  face: [0, 300],
  helmet: [200, 600],
  body: [400, 1560],
  pulse: [1380, 1460],
  reactor: [1440, 1600],
} as const;
/** The pull toward the chest: the front recedes as this power of its time
 * (a cube held the limbs still for most of a second on a phone). */
export const SKIN_RETRACT_PULL = 2.4;
/** Before the pull the body's front falls from past the bands' flush to the
 * far end of the field, while the helmet sinks: the finished bands behind a
 * whole suit hold no armour, and receding through them on the pull's curve
 * left the body untouched for half a second (450 – 1000 ms). */
export const SKIN_RETRACT_FLUSH = [200, 560] as const;
const RETRACT_FROM = 1.02;
/** The head's field where the face begins (rexonance-suit-skin-field.ts
 * SKIN_FACE_FROM): the face is open once the front is back to it. */
const FACE_FROM = 0.72;

/** The retract at `ms` since it began. Closed-form and monotone: the fronts
 * only recede. The skin draws everything (the classic engines stand down). */
export function skinRetractFrame(out: SkinFrame, ms: number) {
  const t = ms < 0 ? 0 : ms > SKIN_RETRACT_MS ? SKIN_RETRACT_MS : ms;
  const gone = -SKIN_BAND;
  out.head =
    SKIN_WHOLE -
    (SKIN_WHOLE - FACE_FROM) * smooth(spanOf(t, SKIN_RETRACT.face)) -
    (FACE_FROM - gone) * smooth(spanOf(t, SKIN_RETRACT.helmet));
  // The bands' flush, then accelerating: drawn in.
  out.body = retractBody(t);
  out.litBody = SKIN_WHOLE;
  out.litHead = SKIN_WHOLE;
  out.alpha = 1;
  out.classic = 0;
  out.glow = 0;
  out.on = true;
  out.shell = true;
  out.eyes = 1 - spanOf(t, SKIN_RETRACT.eyes);
  out.lights = 1 - smooth(spanOf(t, SKIN_RETRACT.lights));
  out.reactor =
    (1 + 0.3 * Math.sin(Math.PI * spanOf(t, SKIN_RETRACT.pulse))) *
    (1 - smooth(spanOf(t, SKIN_RETRACT.reactor)));
  out.flow = -1;
  return out;
}

/* ---------------- the droplets ---------------- */

/** How far ahead of the front a droplet shows, and how far behind it is
 * drawn back in (bands). */
const DROPLET_AHEAD = 1.1;
const DROPLET_BEHIND = 0.5;

/** Draws the droplets at the two fronts into a 2D context in figure space
 * (`cell`: figure px per field cell). Each skims ahead of the lip along the
 * flow and is drawn back into the surface: matter conserved, no sparks. */
export function drawSkinDroplets(
  context: CanvasRenderingContext2D,
  field: SkinField,
  frame: SkinFrame,
  cell: number,
  now: number,
  px: number,
  share = 1,
) {
  const s = field.samples;
  const way = frame.flow;
  const pass = (first: number, count: number, front: number) => {
    if (front <= 0 || front >= SKIN_WHOLE || !count) return;
    const low = front - DROPLET_BEHIND * SKIN_BAND;
    const high = front + DROPLET_AHEAD * SKIN_BAND;
    // The first sample at or after `low`.
    let a = 0;
    let b = count;
    while (a < b) {
      const m = (a + b) >> 1;
      if (s[(first + m) * SKIN_SAMPLE + 2] < low) a = m + 1;
      else b = m;
    }
    context.beginPath();
    let bright = false;
    for (let n = a; n < count; n += 1) {
      const o = (first + n) * SKIN_SAMPLE;
      const t = s[o + 2];
      if (t > high) break;
      const seed = s[o + 5];
      if (seed > share) continue;
      // -DROPLET_AHEAD (far ahead) … 0 (the lip) … DROPLET_BEHIND (absorbed).
      const k = (front - t) / SKIN_BAND;
      const life = (k + DROPLET_AHEAD) / (DROPLET_AHEAD + DROPLET_BEHIND);
      // It leaves the lip, leads it, and is drawn back in.
      // (Receding, it runs the other way: back toward the reactor.)
      const lead = way * Math.sin(Math.PI * Math.min(1, life * 1.15)) * (7 + 13 * seed);
      const sway = Math.sin(now * 0.006 + seed * 40) * 2.2;
      const x = s[o] * cell + s[o + 3] * lead - s[o + 4] * sway;
      const y = s[o + 1] * cell + s[o + 4] * lead + s[o + 3] * sway;
      // (Round: squares read as confetti in a close look.)
      const r = (0.56 + 0.9 * seed) * px * (0.6 + 0.4 * Math.sin(Math.PI * life));
      context.moveTo(x + r, y);
      context.arc(x, y, r, 0, 6.2832);
      bright = true;
    }
    if (bright) context.fill();
  };
  context.fillStyle = `rgb(226 240 250 / ${(0.9 * frame.alpha).toFixed(3)})`;
  pass(0, field.bodySamples, frame.body);
  pass(field.bodySamples, field.headSamples, frame.head);
}

/* ---------------- the cells ---------------- */

/* REXONANCE CELLS (owner, 2026-11-11: the streams 「気持ち悪い」 — 「大きな
   セル状のものや細かいものが周囲から吸収されていくように」). The armour's
   matter arrives as hexagonal cells, the skin's own tessellation seen loose:
   a few large plates (a bevelled metal face, a thin bright rim, a fine
   honeycomb inside) and many fine glinting specks. They come out of the air all round
   the figure, some from past the canvas's edge: each flickers in, drifts,
   and is drawn to a point of the armour just ahead of the front on a short
   spiral, quickening on its last approach, its size and its turn settling
   until it lies flat on the surface as the lip reaches it. There it is taken
   in: a rim flash, and it shrinks into the hex grid (a plate breaks into
   seven micro-cells on the shader's own lattice). Before the light a last
   wave from all round lands over the whole body, and nothing is left in the
   air at the light. On a retract the receding lip sheds them: each forms on
   the surface, lifts off and dissolves outward.

   No trail, no line, no streak: every cell is one sprite from a sheet drawn
   once (buildSkinCellSheet); a frame is drawImage calls only. Stateless and
   closed-form in the scene's clock (the entry's ms, the scroll's progress,
   the retract's ms): each slot flies again and again, each flight's landing
   chosen from where the front will be when it lands (skinReach), so the
   scroll scrubs it both ways and a seek leaves nothing behind. Wall time
   only makes them glint. Budgeted per device (skinBudget) and shed with the
   governor (SKIN_CELL_SHARE); nothing is allocated a frame. */

/** The share of the cells each governor level keeps. */
export const SKIN_CELL_SHARE = [1, 0.75, 0.55, 0.4] as const;
/** The cells' widths in figure px (flat to flat), and their least width in
 * CSS px whatever the figure's scale. */
export const SKIN_CELL_SIZE = {
  large: [46, 92],
  fine: [4.5, 11],
  largeMin: 16,
  fineMin: 2,
} as const;
/** The retract's cells, in its ms: flight lives, and the forming on the
 * surface before each lifts off. */
export const SKIN_RETRACT_CELLS = {
  fine: [340, 620],
  large: [460, 760],
  absorb: [90, 150],
} as const;
/** The helmet's plates are this share of the body's (the helmet is small),
 * and so are the plates that pass behind the figure. */
const CELL_SMALL = 0.62;
/** The lip reaches a landed cell this far into its absorption. */
const CELL_LEAD = 0.35;
/** A cell's way in at flight share p: slow out of the air, quickening onto
 * the surface. The distance left is 1 - cellEase(p): it only falls. */
export const cellEase = (p: number) => {
  const u = clamp01(p);
  const v = u * u;
  return 0.25 * u + 0.75 * v * v;
};

/* The sheet: the plates (128 px, four rims), the absorb flash (64 px), a
   micro-cell (32 px) and the specks (24 px: three tones, eight turns of the
   hexagon's 60 degrees). */
const SHEET = { width: 512, height: 264, plate: 128, flash: 64, micro: 32, speck: 24, turns: 8 };
const PLATE_R = 58;
const FLASH_R = 24;
const MICRO_R = 14;
const SPECK_R = 9;
const ROOT3 = 1.7320508;
/** The plates' rims: ice, pink, white and the armour's gold. */
const CELL_RIMS = ["214 246 255", "255 190 232", "246 250 255", "250 224 168"] as const;
/** Each plate's honeycomb: the cells' rings about its middle (0: the one
 * cell; 1: seven; 2: nineteen), and whether the middle cells are left out. */
const PLATE_COMBS = [
  [2, false],
  [1, false],
  [2, true],
  [2, false],
] as const;
const CELL_FILLS = ["178 238 255", "255 170 224", "246 251 255"] as const;

/** Draws the cells' sheet into a canvas the caller makes (once a mount). */
export function buildSkinCellSheet(
  make: (width: number, height: number) => HTMLCanvasElement | null,
): HTMLCanvasElement | null {
  const canvas = make(SHEET.width, SHEET.height);
  const context = canvas?.getContext("2d");
  if (!canvas || !context) return null;
  // A pointy-top hexagon (the shader's cells), turned by `turn`.
  const hex = (x: number, y: number, r: number, turn = 0) => {
    context.beginPath();
    for (let n = 0; n < 6; n += 1) {
      const angle = turn + Math.PI / 6 + (n * Math.PI) / 3;
      const px = x + Math.cos(angle) * r;
      const py = y + Math.sin(angle) * r;
      if (n) context.lineTo(px, py);
      else context.moveTo(px, py);
    }
    context.closePath();
  };
  context.lineJoin = "round";
  for (let tone = 0; tone < CELL_RIMS.length; tone += 1) {
    const x = tone * SHEET.plate + SHEET.plate / 2;
    const y = SHEET.plate / 2;
    const across = () =>
      context.createLinearGradient(x - PLATE_R, y - PLATE_R, x + PLATE_R, y + PLATE_R);
    // The plate: dark metal, its bevel lit from the upper left.
    const bevel = across();
    bevel.addColorStop(0, "rgb(150 170 194 / 0.97)");
    bevel.addColorStop(0.4, "rgb(50 61 80 / 0.96)");
    bevel.addColorStop(1, "rgb(6 9 15 / 0.97)");
    hex(x, y, PLATE_R);
    context.fillStyle = bevel;
    context.fill();
    // Its face, set in: lit the other way (the bevel reads as depth).
    const face = across();
    face.addColorStop(0, "rgb(9 13 21 / 0.96)");
    face.addColorStop(0.62, "rgb(24 31 44 / 0.96)");
    face.addColorStop(1, "rgb(58 72 94 / 0.96)");
    hex(x, y, PLATE_R - 10);
    context.fillStyle = face;
    context.fill();
    // A broad, soft sheen (never a hard band: that read as glass).
    const sheen = across();
    sheen.addColorStop(0.16, "rgb(210 232 250 / 0)");
    sheen.addColorStop(0.4, "rgb(210 232 250 / 0.15)");
    sheen.addColorStop(0.66, "rgb(210 232 250 / 0)");
    hex(x, y, PLATE_R - 10);
    context.fillStyle = sheen;
    context.fill();
    // The honeycomb inside: the skin's own cells, fine and faint.
    const [rings, open] = PLATE_COMBS[tone];
    const inner = PLATE_R * 0.168;
    context.lineWidth = 1.1;
    context.strokeStyle = `rgb(${CELL_RIMS[tone]} / 0.24)`;
    for (let q = -rings; q <= rings; q += 1)
      for (let r = Math.max(-rings, -q - rings); r <= Math.min(rings, -q + rings); r += 1) {
        if (open && Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r)) < 2) continue;
        hex(x + inner * ROOT3 * (q + r / 2), y + inner * 1.5 * r, inner);
        context.stroke();
      }
    // The rim: thin and bright, with a soft inner light.
    hex(x, y, PLATE_R - 3.5);
    context.lineWidth = 6;
    context.strokeStyle = `rgb(${CELL_RIMS[tone]} / 0.16)`;
    context.stroke();
    hex(x, y, PLATE_R - 1.4);
    context.lineWidth = 2.4;
    context.strokeStyle = `rgb(${CELL_RIMS[tone]} / 0.96)`;
    context.stroke();
  }
  // The flash: a hexagonal ring of light.
  {
    const x = SHEET.flash / 2;
    const y = SHEET.plate + SHEET.flash / 2;
    for (const [width, alpha] of [
      [11, 0.07],
      [6, 0.16],
      [1.8, 0.85],
    ]) {
      hex(x, y, FLASH_R);
      context.lineWidth = width;
      context.strokeStyle = `rgb(226 246 255 / ${alpha})`;
      context.stroke();
    }
  }
  // The micro-cell: one cell of the skin's grid, clicking in.
  {
    const x = SHEET.flash + SHEET.micro / 2;
    const y = SHEET.plate + SHEET.micro / 2;
    hex(x, y, MICRO_R);
    context.fillStyle = "rgb(150 214 246 / 0.3)";
    context.fill();
    context.lineWidth = 1.4;
    context.strokeStyle = "rgb(236 250 255 / 0.9)";
    context.stroke();
  }
  // The specks: a bright hexagon with a white heart.
  for (let tone = 0; tone < 3; tone += 1)
    for (let turn = 0; turn < SHEET.turns; turn += 1) {
      const x = turn * SHEET.speck + SHEET.speck / 2;
      const y = SHEET.plate + SHEET.flash + tone * SHEET.speck + SHEET.speck / 2;
      const angle = (turn / SHEET.turns) * (Math.PI / 3);
      hex(x, y, SPECK_R, angle);
      context.fillStyle = `rgb(${CELL_FILLS[tone]} / 0.9)`;
      context.fill();
      hex(x, y, SPECK_R * 0.5, angle);
      context.fillStyle = "rgb(255 255 255 / 0.95)";
      context.fill();
    }
  return canvas;
}

/** The retract's fronts at ms t (skinRetractFrame's). */
const retractHead = (t: number) =>
  SKIN_WHOLE -
  (SKIN_WHOLE - FACE_FROM) * smooth(spanOf(t, SKIN_RETRACT.face)) -
  (FACE_FROM + SKIN_BAND) * smooth(spanOf(t, SKIN_RETRACT.helmet));
function retractBody(t: number) {
  return (
    SKIN_WHOLE -
    (SKIN_WHOLE - RETRACT_FROM) * smooth(spanOf(t, SKIN_RETRACT_FLUSH)) -
    (RETRACT_FROM + SKIN_BAND) * Math.pow(spanOf(t, SKIN_RETRACT.body), SKIN_RETRACT_PULL)
  );
}
/** When the retract's lip falls back to field value `field`, ms. */
export function skinRetractReach(field: number, head = false) {
  let low = 0;
  let high = SKIN_RETRACT_MS;
  for (let step = 0; step < 32; step += 1) {
    const middle = (low + high) / 2;
    if ((head ? retractHead(middle) : retractBody(middle)) > field) low = middle;
    else high = middle;
  }
  return high;
}

const hash3 = (a: number, b: number, c: number) => hash2(a * 7 + c * 131, b * 13 + c * 31 + 7);
const SLOT = 10;
const MEMO = 8;
const POSE = 8;
/** A cell's pose: x, y, width, alpha, turn, tilt, its absorption (-1 in
 * flight, else 0 → 1), its flight's share. */
export const SKIN_CELL_POSE = POSE;
type CellContext = Pick<
  CanvasRenderingContext2D,
  "drawImage" | "save" | "restore" | "translate" | "rotate" | "scale"
> & { globalAlpha: number; globalCompositeOperation: string };

export class SkinCells {
  /** The large plates' slots come first, then the fine specks'. */
  readonly large: number;
  readonly fine: number;
  readonly count: number;
  /** The cells drawn last frame. */
  live = 0;
  private sheet: CanvasImageSource | null;
  private cell: number;
  private width: number;
  private height: number;
  /** Per slot: life, gap, offset, size (shares), spin, first turn, tone
   * (a plate's rim), behind the figure, a phase, from past the edge. */
  private slots: Float32Array;
  /** Per slot and lane (its flights; the last wave): whether it flies (its
   * plate's share of its size; 0: no), its
   * landing (figure px), where it came from, and its three times. A pure
   * cache of closed forms, keyed by the flight. */
  private memo: Float64Array;
  private memoKey: Float64Array;
  private memoFor: SkinTimeline | null | undefined = undefined;
  private memoField: SkinField | null = null;
  private pose = new Float32Array(POSE);
  private burst: Float32Array;

  /** `cell`: figure px per field cell; `figure`: the figure's size. */
  constructor(
    large: number,
    fine: number,
    sheet: CanvasImageSource | null,
    cell: number,
    figure: readonly [number, number],
  ) {
    this.large = Math.max(0, Math.floor(large));
    this.fine = Math.max(0, Math.floor(fine));
    this.count = this.large + this.fine;
    this.sheet = sheet;
    this.cell = cell;
    [this.width, this.height] = figure;
    this.slots = new Float32Array(this.count * SLOT);
    for (let i = 0; i < this.count; i += 1) {
      const o = i * SLOT;
      const s = this.slots;
      s[o] = hash3(i, 1, 1);
      s[o + 1] = hash3(i, 2, 1);
      s[o + 2] = hash3(i, 3, 1);
      s[o + 3] = hash3(i, 4, 1);
      // Under half a turn of spiral, either way.
      s[o + 4] = (hash3(i, 5, 1) < 0.5 ? -1 : 1) * (0.25 + 0.55 * hash3(i, 6, 1));
      s[o + 5] = (hash3(i, 7, 1) < 0.5 ? -1 : 1) * (0.7 + 1.5 * hash3(i, 8, 1));
      // (A plate's rim: ice for two in five, then pink, white, gold.)
      s[o + 6] =
        i < this.large
          ? [0, 1, 0, 3, 2][i % 5]
          : i % 7 === 3
            ? 1
            : i % 5 === 2
              ? 2
              : 0;
      // Behind the figure: a speck in five, a plate in three or so.
      s[o + 7] = hash3(i, 9, 1) < (i < this.large ? 0.32 : 0.22) ? 1 : 0;
      s[o + 8] = hash3(i, 10, 1) * 6.2832;
      s[o + 9] = hash3(i, 11, 1) < 0.14 ? 1 : 0;
    }
    this.memo = new Float64Array(this.count * 2 * MEMO);
    this.memoKey = new Float64Array(this.count * 2).fill(Number.NaN);
    this.burst = new Float32Array(Math.max(1, this.large) * 4);
  }

  /** Nothing is in the air (the scene stopped, sought, or moved on). The
   * cells keep no flight of their own: the next frame is its clock's. */
  clear() {
    this.live = 0;
  }

  /** A sample at field value `at` of a front's list (at or just past it),
   * as an offset into the samples, or -1. */
  private sampleAt(field: SkinField, head: boolean, at: number, pick: number) {
    const first = head ? field.bodySamples : 0;
    const count = head ? field.headSamples : field.bodySamples;
    if (!count) return -1;
    const s = field.samples;
    let a = 0;
    let b = count;
    while (a < b) {
      const m = (a + b) >> 1;
      if (s[(first + m) * SKIN_SAMPLE + 2] < at) a = m + 1;
      else b = m;
    }
    // Any of the cells the lip takes in the same moment.
    const from = a;
    b = count;
    while (a < b) {
      const m = (a + b) >> 1;
      if (s[(first + m) * SKIN_SAMPLE + 2] < at + 0.012) a = m + 1;
      else b = m;
    }
    const index = Math.min(count - 1, from + Math.floor(pick * Math.max(1, a - from)));
    return (first + index) * SKIN_SAMPLE;
  }

  /** Where a cell comes from (or goes to), out in the air. */
  private origin(i: number, key: number, tx: number, ty: number, wave: boolean, m: number) {
    const big = i < this.large;
    const cx = this.width / 2;
    const cy = Math.min(this.height * 0.8, Math.max(this.height * 0.22, ty));
    const dx = tx - cx;
    const dy = ty - cy;
    // Outward from the body's axis, widely spread; anywhere for the wave
    // and for the middle of the chest.
    const angle =
      wave || Math.hypot(dx, dy) < 24
        ? hash3(i, key, 21) * 6.2832
        : Math.atan2(dy, dx) + (hash3(i, key, 21) - 0.5) * 2.4;
    // (The wave from a ring close round the figure: seen whole, closing.)
    const reach = wave
      ? 190 + 150 * hash3(i, key, 22)
      : this.slots[i * SLOT + 9]
        ? 420 + 150 * hash3(i, key, 22)
        : (big ? 170 : 110) + 220 * hash3(i, key, 22);
    this.memo[m + 3] = tx + Math.cos(angle) * reach;
    this.memo[m + 4] = ty + Math.sin(angle) * reach;
  }

  /** The slot's flight at clock x into the memo; false: none. */
  private flight(
    i: number,
    wave: boolean,
    field: SkinField,
    timeline: SkinTimeline | null,
    x: number,
  ) {
    const s = this.slots;
    const o = i * SLOT;
    const big = i < this.large;
    const clock = timeline ? timeline.cells : SKIN_RETRACT_CELLS;
    const [low, high] = big ? clock.large : clock.fine;
    const life = low + (high - low) * s[o];
    const absorb = clock.absorb[big ? 1 : 0];
    const gap = life * (big ? 0.3 + 0.5 * s[o + 1] : 0.08 + 0.14 * s[o + 1]);
    const period = life + absorb + gap;
    const key = wave ? 0 : Math.floor((x - s[o + 2] * period) / period);
    const lane = i * 2 + (wave ? 1 : 0);
    const m = lane * MEMO;
    const memo = this.memo;
    if (this.memoKey[lane] === key) return memo[m] > 0;
    this.memoKey[lane] = key;
    memo[m] = 0;
    const cell = this.cell;
    const samples = field.samples;
    const most = (head: boolean) => {
      const count = head ? field.headSamples : field.bodySamples;
      const first = head ? field.bodySamples : 0;
      return count ? samples[(first + count - 1) * SKIN_SAMPLE + 2] : -1;
    };
    if (wave) {
      // (Four specks in five join it and no plate: on finished armour a
      // plate sat like a sticker. A retract has none.)
      if (!timeline || big || i % 5 > 3) return false;
      // The last wave: one landing each, anywhere on the armour.
      const [from, to] = timeline.cells.wave;
      const land = from + (to - from) * hash3(i, 31, 3);
      const total = field.bodySamples + field.headSamples;
      if (!total) return false;
      const at = Math.min(total - 1, Math.floor(hash3(i, 32, 3) * total)) * SKIN_SAMPLE;
      memo[m + 1] = samples[at] * cell;
      memo[m + 2] = samples[at + 1] * cell;
      this.origin(i, 0, memo[m + 1], memo[m + 2], true, m);
      // (They form together and hang in the air before they close.)
      memo[m + 5] = land - (clock.fine[0] + clock.fine[1]) * 0.62;
      memo[m + 6] = land;
      // (All of it over before the light.)
      memo[m + 7] = Math.min(absorb, (timeline.light - land) * 0.8);
      memo[m] = 1;
      return true;
    }
    const start = s[o + 2] * period + key * period;
    if (timeline) {
      // Landing where the lip will be as the cell is taken in.
      const lip = start + life + CELL_LEAD * absorb;
      const body =
        lip > timeline.body[0] ? bodyFront(spanOf(lip, timeline.body), timeline.ease) : -1;
      const crown = lip > timeline.head[0] ? headFront(spanOf(lip, timeline.head)) : -1;
      const bodyOn = body >= 0 && body <= most(false);
      const crownOn = crown >= 0 && crown <= most(true);
      if (!bodyOn && !crownOn) return false;
      const head = crownOn && (!bodyOn || hash3(i, key, 12) < 0.5);
      const at = this.sampleAt(field, head, head ? crown : body, hash3(i, key, 13));
      if (at < 0) return false;
      memo[m + 1] = samples[at] * cell;
      memo[m + 2] = samples[at + 1] * cell;
      this.origin(i, key, memo[m + 1], memo[m + 2], false, m);
      // …and landing when the lip is in fact due at that very cell.
      const due = skinReach(timeline, samples[at + 2], head) - CELL_LEAD * absorb;
      memo[m + 5] = start;
      memo[m + 6] = Math.min(start + life + gap, Math.max(start + life * 0.6, due));
      memo[m + 7] = absorb;
      memo[m] = head ? CELL_SMALL : 1;
    } else {
      // The retract: shed where the receding lip then is.
      const lip = start + 0.4 * absorb;
      const body = lip > SKIN_RETRACT_FLUSH[0] ? retractBody(lip) : -1;
      const crown = retractHead(lip);
      const bodyOn = body >= 0 && body <= most(false);
      const crownOn = crown >= 0 && crown <= most(true);
      if (!bodyOn && !crownOn) return false;
      const head = crownOn && (!bodyOn || hash3(i, key, 12) < 0.5);
      const at = this.sampleAt(field, head, head ? crown : body, hash3(i, key, 13));
      if (at < 0) return false;
      memo[m + 1] = samples[at] * cell;
      memo[m + 2] = samples[at + 1] * cell;
      this.origin(i, key, memo[m + 1], memo[m + 2], false, m);
      const due = skinRetractReach(samples[at + 2], head) - 0.4 * absorb;
      // It forms from memo[5], lifts off at memo[6], and has dissolved by
      // the retract's end however late it was shed.
      memo[m + 5] = Math.min(start + gap, Math.max(start, due));
      memo[m + 6] = memo[m + 5] + absorb;
      memo[m + 7] = Math.min(life, SKIN_RETRACT_MS - 20 - memo[m + 6]);
      if (memo[m + 7] < 40) return false;
      memo[m] = head ? CELL_SMALL : 1;
    }
    return true;
  }

  /** A slot's cell at clock x (the timeline's; null: the retract's ms) into
   * `out` (SKIN_CELL_POSE numbers); false: nothing of it is in the air.
   * `scale`: CSS px per figure px; `bounds`: the canvas's reach (left, top,
   * right, bottom), figure px. */
  poseAt(
    out: Float32Array,
    i: number,
    wave: boolean,
    field: SkinField,
    timeline: SkinTimeline | null,
    x: number,
    now: number,
    scale: number,
    bounds?: ArrayLike<number>,
  ) {
    if (timeline ? x >= timeline.light : x >= SKIN_RETRACT_MS || x < 0) return false;
    if (this.memoFor !== timeline || this.memoField !== field) {
      this.memoFor = timeline;
      this.memoField = field;
      this.memoKey.fill(Number.NaN);
    }
    if (!this.flight(i, wave, field, timeline, x)) return false;
    const s = this.slots;
    const o = i * SLOT;
    const big = i < this.large;
    const m = (i * 2 + (wave ? 1 : 0)) * MEMO;
    const memo = this.memo;
    if (x < memo[m + 5]) return false;
    const clock = timeline ? timeline.cells : SKIN_RETRACT_CELLS;
    const [low, high] = big ? clock.large : clock.fine;
    const life = low + (high - low) * s[o];
    const phase = s[o + 8];
    // The air's flicker (wall time): now and then a cell dims as it forms.
    const flicker = hash3(i, Math.floor(now / 70), 41) < 0.4 ? 0.3 : 1;
    let p = 1;
    let k = -1;
    let alpha = 1;
    if (timeline) {
      if (x < memo[m + 6]) {
        p = (x - memo[m + 5]) / (memo[m + 6] - memo[m + 5]);
        alpha = smooth(p / 0.22) * (p < 0.16 ? flicker : 1);
      } else {
        k = (x - memo[m + 6]) / memo[m + 7];
        if (!(k < 1)) return false;
      }
      // The cells' own entrance and exit: none before the scene's matter
      // is in the air, none at the light.
      alpha *=
        smooth(spanOf(x, timeline.cells.from)) * (1 - smooth(spanOf(x, timeline.cells.out)));
    } else if (x < memo[m + 6]) {
      k = 1 - (x - memo[m + 5]) / (memo[m + 6] - memo[m + 5]);
    } else {
      const u = (x - memo[m + 6]) / memo[m + 7];
      if (!(u < 1)) return false;
      p = 1 - u * (memo[m + 7] / life);
      alpha = (1 - smooth(u)) * (u > 0.7 ? flicker : 1);
    }
    if (alpha <= 0.004) return false;
    const left = 1 - cellEase(p);
    let sx = memo[m + 3];
    let sy = memo[m + 4];
    if (bounds) {
      // From the canvas's edge at the farthest (it fades in from there).
      sx = Math.min(bounds[2] + 30, Math.max(bounds[0] - 30, sx));
      sy = Math.min(bounds[3] + 30, Math.max(bounds[1] - 30, sy));
    }
    // The spiral: the way in turns as it shortens (and breathes a little on
    // wall time); the turn never changes the distance left.
    const turn = (s[o + 4] + 0.05 * Math.sin(now * 0.0021 + phase)) * left;
    const cos = Math.cos(turn);
    const sin = Math.sin(turn);
    const dx = (sx - memo[m + 1]) * left;
    const dy = (sy - memo[m + 2]) * left;
    out[0] = memo[m + 1] + dx * cos - dy * sin;
    out[1] = memo[m + 2] + dx * sin + dy * cos;
    const range = big ? SKIN_CELL_SIZE.large : SKIN_CELL_SIZE.fine;
    const least = (big ? SKIN_CELL_SIZE.largeMin : SKIN_CELL_SIZE.fineMin) / Math.max(0.05, scale);
    // (Most are small; the wave's specks are the larger ones.)
    const share = wave && !big ? 0.55 + 0.45 * s[o + 3] : s[o + 3] * s[o + 3];
    const size = Math.max(least, (range[0] + (range[1] - range[0]) * share) * (big ? memo[m] : 1));
    // Its size settles: small as it forms, a little large in the air, true
    // on the surface.
    out[2] = size * (0.5 + 0.5 * smooth(p / 0.3)) * (1 + 0.16 * left);
    // No cell meets the canvas's edge while it shows.
    if (bounds) {
      alpha *= smooth(
        (Math.min(out[0] - bounds[0], bounds[2] - out[0], out[1] - bounds[1], bounds[3] - out[1]) -
          out[2] * 0.6) /
          (out[2] * 0.5 + 24),
      );
      if (alpha <= 0.004) return false;
    }
    out[3] = alpha * (big ? 1 : 0.72 + 0.28 * Math.sin(now * 0.009 + phase * 7));
    out[4] = left > 0 ? s[o + 5] * left * left : 0;
    out[5] = 1 - 0.42 * left * (0.4 + 0.6 * s[o + 1]);
    out[6] = k;
    out[7] = p;
    return true;
  }

  /** Draws the cells at clock x (`timeline` null: the retract at x ms).
   * `now`: wall ms (the glints only); `scale`: CSS px per figure px; `hex`:
   * the skin's hex cell, figure px; `share`: the governor's; `gain`: the
   * whole layer's opacity (the call raises it as the skin engages). Both contexts
   * are in figure space; they are left compositing additively. */
  draw(
    back: CellContext,
    front: CellContext,
    field: SkinField,
    timeline: SkinTimeline | null,
    x: number,
    now: number,
    scale: number,
    hex: number,
    bounds?: ArrayLike<number>,
    share = 1,
    gain = 1,
  ) {
    const sheet = this.sheet;
    this.live = 0;
    front.globalCompositeOperation = "lighter";
    back.globalCompositeOperation = "lighter";
    if (!sheet || gain <= 0.004) return;
    const keep = share < 0 ? 0 : share > 1 ? 1 : share;
    const large = Math.floor(this.large * keep);
    const fine = Math.floor(this.fine * keep);
    const pose = this.pose;
    const burst = this.burst;
    const lanes = timeline ? 2 : 1;
    let bursts = 0;
    let live = 0;
    // The plates: metal, over the scene, or passing behind the figure
    // (smaller and dimmer there: depth).
    front.globalCompositeOperation = "source-over";
    back.globalCompositeOperation = "source-over";
    const plate = SHEET.plate;
    const plateDraw = plate / (ROOT3 * PLATE_R);
    for (let i = 0; i < large; i += 1) {
      if (!this.poseAt(pose, i, false, field, timeline, x, now, scale, bounds)) continue;
      live += 1;
      const behind = this.slots[i * SLOT + 7] > 0;
      const context = behind ? back : front;
      const k = pose[6];
      let width = pose[2] * plateDraw * (behind ? CELL_SMALL : 1);
      let alpha = pose[3] * gain * (behind ? 0.62 : 1);
      if (k >= 0) {
        // Taken in: it shrinks into the surface under its own flash (a
        // plate behind the figure has gone under its edge: no flash).
        width *= 1 - 0.22 * smooth(k);
        alpha *= 1 - smooth(k / 0.55);
        if (!behind) {
          const b = bursts * 4;
          burst[b] = pose[0];
          burst[b + 1] = pose[1];
          burst[b + 2] = pose[2];
          burst[b + 3] = k;
          bursts += 1;
        }
      }
      if (alpha <= 0.004) continue;
      context.save();
      context.translate(pose[0], pose[1]);
      context.rotate(pose[4]);
      context.scale(1, pose[5]);
      context.globalAlpha = alpha;
      context.drawImage(
        sheet,
        this.slots[i * SLOT + 6] * plate,
        0,
        plate,
        plate,
        -width / 2,
        -width / 2,
        width,
        width,
      );
      context.restore();
    }
    front.globalCompositeOperation = "lighter";
    back.globalCompositeOperation = "lighter";
    // The plates' absorption: the rim's flash, and seven micro-cells that
    // spread onto the skin's own lattice and click out.
    const flashDraw = SHEET.flash / (ROOT3 * FLASH_R);
    const microDraw = SHEET.micro / (ROOT3 * MICRO_R);
    const row = hex * ROOT3;
    for (let n = 0; n < bursts; n += 1) {
      const b = n * 4;
      const bx = burst[b];
      const by = burst[b + 1];
      const size = burst[b + 2];
      const k = burst[b + 3];
      const ring = size * (1 + 0.24 * k) * flashDraw;
      // (A glint, not a flare: the ring, the micro-cells and the specks'
      // own flashes add up on one spot.)
      front.globalAlpha = 0.6 * Math.pow(1 - k, 1.5) * gain;
      front.drawImage(
        sheet,
        0,
        plate,
        SHEET.flash,
        SHEET.flash,
        bx - ring / 2,
        by - ring / 2,
        ring,
        ring,
      );
      // The nearest centre of the shader's lattice (its two offset grids).
      const ax = (Math.floor(bx / hex) + 0.5) * hex;
      const ay = (Math.floor(by / row) + 0.5) * row;
      const ox = Math.round(bx / hex) * hex;
      const oy = Math.round(by / row) * row;
      const first = Math.hypot(bx - ax, by - ay) < Math.hypot(bx - ox, by - oy);
      const gx = first ? ax : ox;
      const gy = first ? ay : oy;
      const set = smooth(k);
      const from = size * 0.36;
      const width = (from + (hex - from) * set) * microDraw;
      for (let j = 0; j < 7; j += 1) {
        const light = smooth(k / 0.22) * (1 - smooth((k - (0.36 + 0.05 * j)) / 0.3));
        if (light <= 0.01) continue;
        const angle = ((j - 1) * Math.PI) / 3;
        const ux = j ? Math.cos(angle) : 0;
        const uy = j ? Math.sin(angle) : 0;
        const mx = bx + ux * from + (gx + ux * hex - (bx + ux * from)) * set;
        const my = by + uy * from + (gy + uy * hex - (by + uy * from)) * set;
        front.globalAlpha = 0.62 * light * gain;
        front.drawImage(
          sheet,
          SHEET.flash,
          plate,
          SHEET.micro,
          SHEET.micro,
          mx - width / 2,
          my - width / 2,
          width,
          width,
        );
      }
    }
    // The specks: one sprite each, a glint; a small flash as each is taken.
    const speck = SHEET.speck;
    const speckDraw = speck / (ROOT3 * SPECK_R);
    const sixth = Math.PI / 3;
    for (let n = 0; n < fine; n += 1) {
      const i = this.large + n;
      const o = i * SLOT;
      const context = this.slots[o + 7] ? back : front;
      for (let lane = 0; lane < lanes; lane += 1) {
        if (!this.poseAt(pose, i, lane === 1, field, timeline, x, now, scale, bounds)) continue;
        live += 1;
        const k = pose[6];
        let size = pose[2];
        let alpha = pose[3] * gain;
        if (k >= 0) {
          const ring = hex * (1.1 + 0.9 * k) * flashDraw;
          context.globalAlpha = 0.45 * (1 - k) * (1 - k) * gain;
          context.drawImage(
            sheet,
            0,
            plate,
            SHEET.flash,
            SHEET.flash,
            pose[0] - ring / 2,
            pose[1] - ring / 2,
            ring,
            ring,
          );
          size += (hex - size) * smooth(k);
          alpha *= 1 - k;
        }
        const turn = pose[4] - Math.floor(pose[4] / sixth) * sixth;
        const width = size * speckDraw;
        context.globalAlpha = alpha;
        context.drawImage(
          sheet,
          Math.min(SHEET.turns - 1, Math.floor((turn / sixth) * SHEET.turns)) * speck,
          plate + SHEET.flash + this.slots[o + 6] * speck,
          speck,
          speck,
          pose[0] - width / 2,
          pose[1] - width / 2,
          width,
          width,
        );
      }
    }
    back.globalAlpha = 1;
    front.globalAlpha = 1;
    this.live = live;
  }
}

/* ---------------- the shader ---------------- */

const VERTEX = `attribute vec2 aPosition;
varying vec2 vUv;
void main() {
  vUv = vec2(aPosition.x * 0.5 + 0.5, 0.5 - aPosition.y * 0.5);
  gl_Position = vec4(aPosition, 0.0, 1.0);
}`;

const FRAGMENT = `#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
varying vec2 vUv;
uniform sampler2D uArt;
uniform sampler2D uField;
uniform sampler2D uBase;
uniform vec2 uFront;
uniform vec2 uLit;
uniform vec4 uGlow;
uniform vec4 uEyes;
uniform vec3 uCore;
uniform vec2 uFigure;
uniform vec2 uCell;
uniform float uTime;
uniform float uAlpha;
uniform float uBase01;
uniform float uHex;
const float BAND = ${SKIN_BAND.toFixed(3)};
const vec3 ICE = vec3(0.59, 0.925, 1.0);
const vec3 PINK = vec3(1.0, 0.56, 0.85);
float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
// The armour's emitters: its ice and pink light (never its gold).
float emitter(vec3 c) {
  float hi = max(c.r, max(c.g, c.b));
  float lo = min(c.r, min(c.g, c.b));
  float sat = hi - lo;
  float gold = step(c.b, c.g) * step(c.g, c.r);
  return smoothstep(0.16, 0.42, sat) * (1.0 - gold) * smoothstep(0.3, 0.6, hi);
}
// The armour with its lights held: they stand cold and dim.
vec3 held(vec3 c, float lit) {
  vec3 cold = vec3(luma(c)) * vec3(0.5, 0.56, 0.66);
  return mix(c, cold, lit * 0.86);
}
void main() {
  vec4 base = uBase01 > 0.0 ? texture2D(uBase, vUv) * uBase01 : vec4(0.0);
  vec4 art = texture2D(uArt, vUv);
  vec4 fld = texture2D(uField, vUv);
  // Blue: the head from 224 up (its dilated edge and itself), the body below.
  float crown = step(0.69, fld.b);
  float front = mix(uFront.x, uFront.y, crown);
  float a = (front - fld.r) / BAND;
  if (art.a < 0.004 || a < -0.6) {
    gl_FragColor = base * uAlpha;
    return;
  }
  vec3 colour = art.rgb / max(art.a, 0.001);
  float light = luma(colour);
  vec2 p = vUv * uFigure;
  // The emitters: each lights once the shell over it has been whole a
  // moment (the lagged front, the bands behind it), with a bloom that
  // settles; the reactor's as soon as its cells set (the trigger); the
  // eyes' on their own gain (growing: the scene lights them, last).
  float glowing = emitter(colour);
  float since = (mix(uLit.x, uLit.y, crown) - fld.r) / BAND - ${SKIN_BANDS.toFixed(1)};
  float eyes = step(uEyes.x, vUv.x) * step(vUv.x, uEyes.z) * step(uEyes.y, vUv.y) * step(vUv.y, uEyes.w);
  float lamp = smoothstep(0.0, 0.6, since);
  float gain = mix(uGlow.y, uGlow.z, eyes);
  float disc = (1.0 - smoothstep(uCore.z * 0.8, uCore.z, distance(p, uCore.xy))) * (1.0 - crown);
  float lit = max(lamp * gain * (1.0 - disc), disc * smoothstep(1.0, 2.5, a) * min(uGlow.w, 1.0));
  float bloom = lamp * gain * (1.0 - smoothstep(0.6, 3.2, since)) * 0.35 + disc * max(uGlow.w - 1.0, 0.0);
  vec3 lamps = colour * glowing * (1.0 + bloom);
  vec3 armour = held(colour, glowing * (1.0 - lit)) + colour * glowing * bloom * lit;
  // The flow's direction: the field's gradient.
  vec2 g = vec2(
    texture2D(uField, vUv + vec2(uCell.x, 0.0)).r - texture2D(uField, vUv - vec2(uCell.x, 0.0)).r,
    texture2D(uField, vUv + vec2(0.0, uCell.y)).r - texture2D(uField, vUv - vec2(0.0, uCell.y)).r);
  vec2 flow = length(g) > 0.0005 ? normalize(g) : vec2(0.0, 1.0);
  if (a < 0.0) {
    // The lip's shadow, just ahead of it.
    float shade = smoothstep(-0.6, 0.0, a);
    gl_FragColor = vec4(base.rgb * (1.0 - 0.5 * shade * art.a), max(base.a, 0.42 * shade * art.a)) * uAlpha;
    return;
  }
  // Liquid chrome: a raised bead, lit from the upper left, with the room's
  // reflection sliding over it.
  float bead = cos(clamp(a, 0.0, 1.0) * 3.14159);
  float facing = 0.5 + 0.5 * bead * dot(flow, normalize(vec2(-0.5, -0.8)));
  float room = 0.5 + 0.5 * sin(p.y * 0.11 + p.x * 0.05 + uTime * 2.6 + fld.r * 40.0);
  vec3 chrome = mix(vec3(0.085, 0.095, 0.115), vec3(0.6, 0.64, 0.68), facing * (0.55 + 0.45 * room));
  chrome = mix(chrome, chrome * (0.6 + 0.9 * light), 0.5);
  // The fibres: striations along the flow.
  float stripe = smoothstep(0.4, 0.5, abs(fract(dot(p, vec2(-flow.y, flow.x)) * 0.33) - 0.5) * 2.0);
  vec3 fibre = mix(vec3(0.1, 0.11, 0.13), vec3(light) * vec3(0.8, 0.87, 0.95), 0.42) * (0.66 + 0.5 * stripe);
  fibre += ICE * 0.1 * fld.g;
  vec3 metal = mix(chrome, fibre, smoothstep(0.8, 1.5, a));
  // The cells: a hexagonal micro-tessellation, each cell clicking solid on
  // its own threshold and taking the art's colour.
  vec2 hs = vec2(1.0, 1.7320508);
  vec2 hp = p / uHex;
  vec4 hc = floor(vec4(hp, hp - vec2(0.5, 1.0)) / hs.xyxy) + 0.5;
  vec4 hh = vec4(hp - hc.xy * hs, hp - (hc.zw + 0.5) * hs);
  vec4 cell = dot(hh.xy, hh.xy) < dot(hh.zw, hh.zw) ? vec4(hh.xy, hc.xy) : vec4(hh.zw, hc.zw + 0.5);
  vec2 q = abs(cell.xy);
  float rim = max(dot(q, hs * 0.5), q.x);
  float threshold = hash(cell.zw);
  float k = (a - 2.4) / 2.5;
  float age = (k - threshold * 0.82) / 0.18;
  float solid = step(0.0, age);
  float paint = smoothstep(0.0, 1.0, age);
  float tilt = hash(cell.zw + 7.31) - 0.5;
  vec3 facet = metal * (0.9 + 0.7 * tilt) + vec3(0.07, 0.09, 0.11);
  float tess = smoothstep(1.7, 2.4, a);
  float edge = smoothstep(0.4, 0.5, rim);
  // Still liquid: the tessellation shows through as facets and dark seams.
  vec3 liquid = mix(metal, facet, 0.5 * tess);
  liquid = mix(liquid, liquid * 0.5, edge * tess * 0.7);
  vec3 celled = mix(facet, armour * (1.0 + 0.1 * tilt * (1.0 - smoothstep(1.0, 3.0, age))), paint);
  // The click: a brightness pop that decays.
  celled += (0.35 * exp(-max(age, 0.0) * 2.6)) * mix(vec3(0.8, 0.9, 1.0), armour, 0.4);
  // The cells' seams, until the paint has set.
  celled = mix(celled, celled * 0.42 + ICE * 0.12, edge * (1.0 - smoothstep(0.6, 2.4, age)));
  vec3 outc = mix(liquid, celled, solid);
  // The panel lines draw in as the cells set, light, and cool.
  float glow = smoothstep(3.0, 4.2, a) * (1.0 - smoothstep(4.8, 7.5, a));
  if (glow > 0.01) {
    vec2 e = 1.2 / uFigure;
    float lx = luma(texture2D(uArt, vUv + vec2(e.x, 0.0)).rgb) - luma(texture2D(uArt, vUv - vec2(e.x, 0.0)).rgb);
    float ly = luma(texture2D(uArt, vUv + vec2(0.0, e.y)).rgb) - luma(texture2D(uArt, vUv - vec2(0.0, e.y)).rgb);
    float line = smoothstep(0.1, 0.42, length(vec2(lx, ly)));
    outc += mix(ICE, vec3(1.0), 0.35) * line * glow * 0.75;
  }
  // The lip: white-hot at the very edge.
  float lip = 1.0 - smoothstep(0.0, 0.2, a);
  outc += vec3(0.91, 0.95, 1.0) * lip * 0.95;
  outc += mix(ICE, PINK, hash(floor(p / 9.0))) * lip * 0.22;
  // The veins, bright while liquid.
  outc += vec3(0.8, 0.9, 1.0) * fld.g * (1.0 - smoothstep(0.3, 1.6, a)) * 0.5;
  float alpha = art.a * smoothstep(0.0, 0.06, a);
  // Once the armour has faded: the lit emitters alone, over the scene's own.
  float lone = art.a * glowing * lit * step(${SKIN_BANDS.toFixed(1)}, a) * uGlow.x * (1.0 - uAlpha);
  gl_FragColor = vec4(outc * alpha + base.rgb * (1.0 - alpha), alpha + base.a * (1.0 - alpha)) * uAlpha
    + vec4(lamps * lone, lone);
}`;

export type SkinSources = {
  /** The finished figure, what stands under it (the scroll scene), and the
   * field's picture and size. */
  art: TexImageSource;
  base: TexImageSource | null;
  field: TexImageSource;
  fieldSize: readonly [number, number];
  /** The eyes' box (x0, y0, x1, y1), and the reactor's centre and radius,
   * in figure px. */
  eyes: readonly [number, number, number, number];
  reactor: readonly [number, number, number];
};

/** The skin's canvas. Null where WebGL is not to be had. */
export class SkinRenderer {
  private gl: WebGLRenderingContext;
  private canvas: HTMLCanvasElement;
  private program: WebGLProgram;
  private textures: WebGLTexture[] = [];
  private uniforms: Record<string, WebGLUniformLocation | null> = {};
  private figure: readonly [number, number];
  private hasBase: boolean;
  private scale = 1;
  lost = false;
  private onLost: (event: Event) => void;

  static create(
    canvas: HTMLCanvasElement,
    sources: SkinSources,
    figure: readonly [number, number],
  ) {
    try {
      const gl = canvas.getContext("webgl", {
        alpha: true,
        premultipliedAlpha: true,
        antialias: false,
        depth: false,
        stencil: false,
        powerPreference: "low-power",
      });
      if (!gl) return null;
      return new SkinRenderer(canvas, gl, sources, figure);
    } catch {
      return null;
    }
  }

  private constructor(
    canvas: HTMLCanvasElement,
    gl: WebGLRenderingContext,
    sources: SkinSources,
    figure: readonly [number, number],
  ) {
    this.canvas = canvas;
    this.gl = gl;
    this.figure = figure;
    this.hasBase = Boolean(sources.base);
    const compile = (type: number, source: string) => {
      const shader = gl.createShader(type);
      if (!shader) throw new Error("shader");
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS))
        throw new Error(gl.getShaderInfoLog(shader) ?? "compile");
      return shader;
    };
    const program = gl.createProgram();
    if (!program) throw new Error("program");
    gl.attachShader(program, compile(gl.VERTEX_SHADER, VERTEX));
    gl.attachShader(program, compile(gl.FRAGMENT_SHADER, FRAGMENT));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS))
      throw new Error(gl.getProgramInfoLog(program) ?? "link");
    this.program = program;
    gl.useProgram(program);
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const position = gl.getAttribLocation(program, "aPosition");
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
    for (const name of [
      "uArt",
      "uField",
      "uBase",
      "uFront",
      "uLit",
      "uGlow",
      "uEyes",
      "uCore",
      "uFigure",
      "uCell",
      "uTime",
      "uAlpha",
      "uBase01",
      "uHex",
    ])
      this.uniforms[name] = gl.getUniformLocation(program, name);
    const texture = (unit: number, premultiply: boolean, upload: () => void) => {
      const made = gl.createTexture();
      if (!made) throw new Error("texture");
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, made);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, premultiply ? 1 : 0);
      gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
      upload();
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      this.textures.push(made);
    };
    texture(0, true, () =>
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, sources.art),
    );
    texture(1, false, () =>
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, sources.field),
    );
    const base = sources.base;
    if (base)
      texture(2, true, () =>
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, base),
      );
    gl.uniform1i(this.uniforms.uArt, 0);
    gl.uniform1i(this.uniforms.uField, 1);
    gl.uniform1i(this.uniforms.uBase, base ? 2 : 0);
    gl.uniform2f(this.uniforms.uFigure, figure[0], figure[1]);
    gl.uniform2f(this.uniforms.uCell, 1 / sources.fieldSize[0], 1 / sources.fieldSize[1]);
    gl.uniform4f(
      this.uniforms.uEyes,
      sources.eyes[0] / figure[0],
      sources.eyes[1] / figure[1],
      sources.eyes[2] / figure[0],
      sources.eyes[3] / figure[1],
    );
    gl.uniform3f(this.uniforms.uCore, sources.reactor[0], sources.reactor[1], sources.reactor[2]);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);
    gl.clearColor(0, 0, 0, 0);
    this.onLost = (event) => {
      event.preventDefault();
      this.lost = true;
    };
    canvas.addEventListener("webglcontextlost", this.onLost);
  }

  /** The backing store for a box of CSS px: the device's ratio up to
   * `maxRatio`, never past the art's own pixels, times the governor's
   * `quality` (1, or less when frames run long). */
  resize(cssWidth: number, cssHeight: number, ratio: number, maxRatio: number, quality = 1) {
    const k = Math.min(Math.min(ratio, maxRatio), this.figure[0] / Math.max(1, cssWidth)) * quality;
    const width = Math.max(1, Math.round(cssWidth * k));
    const height = Math.max(1, Math.round(cssHeight * k));
    this.scale = width / this.figure[0];
    if (this.canvas.width !== width) this.canvas.width = width;
    if (this.canvas.height !== height) this.canvas.height = height;
  }

  /** The hex cells' width, figure px (the loose cells merge into it). */
  get hex() {
    return Math.max(8.5, 4 / Math.max(0.1, this.scale));
  }

  render(frame: SkinFrame, seconds: number, base01: number) {
    const gl = this.gl;
    if (this.lost) return;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    if (!frame.on || (frame.alpha <= 0.002 && frame.glow <= 0.002)) {
      gl.clear(gl.COLOR_BUFFER_BIT);
      return;
    }
    gl.uniform2f(this.uniforms.uFront, frame.body, frame.head);
    gl.uniform2f(this.uniforms.uLit, frame.litBody, frame.litHead);
    gl.uniform4f(this.uniforms.uGlow, frame.glow, frame.lights, frame.eyes, frame.reactor);
    gl.uniform1f(this.uniforms.uTime, seconds % 1000);
    gl.uniform1f(this.uniforms.uAlpha, frame.alpha);
    gl.uniform1f(this.uniforms.uBase01, this.hasBase ? base01 : 0);
    // Cells of four backing px across at the least, 8.5 figure px.
    gl.uniform1f(this.uniforms.uHex, this.hex);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  clear() {
    if (this.lost) return;
    this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    this.gl.clear(this.gl.COLOR_BUFFER_BIT);
  }

  dispose() {
    this.canvas.removeEventListener("webglcontextlost", this.onLost);
    const gl = this.gl;
    for (const texture of this.textures) gl.deleteTexture(texture);
    this.textures = [];
    gl.deleteProgram(this.program);
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    this.canvas.width = 0;
    this.canvas.height = 0;
  }
}
