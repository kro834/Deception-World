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
   back into it; nothing flies anywhere else.

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
  /** The torrent's streams (SkinTorrent). */
  torrent: number;
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
  if (!media("(pointer: coarse), (any-pointer: coarse)")) return { samples: 6000, ratio: 2, torrent: 420 };
  const memory = environment.navigator?.deviceMemory;
  const cores = environment.navigator?.hardwareConcurrency ?? 0;
  if ((memory !== undefined && memory <= 4) || (cores > 0 && cores <= 4))
    return { samples: 1200, ratio: 1.5, torrent: 110 };
  const short = Math.min(environment.innerWidth || 0, environment.innerHeight || 0);
  return short >= 700
    ? { samples: 3600, ratio: 2, torrent: 260 }
    : { samples: 2500, ratio: 2, torrent: 180 };
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
};

/** The entry, in the call's canonical ms: the fire's burst (420) is the
 * trigger, the helmet's clamp (1890) the close, the light (1980) after it. */
export const SKIN_ENTRY: SkinTimeline = {
  body: [470, 1600],
  head: [1380, 1880],
  ease: 2,
  leave: [470, 600],
  back: [1880, 1900],
  fade: [1900, 1975],
  lag: 60,
  // The call's light has run out through the body by 1980 + 380.
  glow: [2360, 2440],
};
/** The scroll scene, in its progress: after the fire's end (0.14), closed
 * before the seal (0.86) and the light (0.9). */
export const SKIN_SCROLL: SkinTimeline = {
  body: [0.15, 0.66],
  head: [0.6, 0.852],
  ease: 1.3,
  leave: [0.15, 0.165],
  back: [0.853, 0.858],
  fade: [0.858, 0.872],
  // 60 ms of the auto movie's 24 s, and a little for a slow hand.
  lag: 0.004,
  // The scene's light (0.9 – 0.915) is all but out through the body.
  glow: [0.906, 0.915],
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
  // Accelerating: drawn in.
  const u = spanOf(t, SKIN_RETRACT.body);
  out.body = gone + (SKIN_WHOLE - gone) * (1 - Math.pow(u, SKIN_RETRACT_PULL));
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
      const size = (1 + 1.6 * seed) * px * (0.6 + 0.4 * Math.sin(Math.PI * life));
      context.rect(x - size / 2, y - size / 2, size, size);
      bright = true;
    }
    if (bright) context.fill();
  };
  context.fillStyle = `rgb(226 240 250 / ${(0.9 * frame.alpha).toFixed(3)})`;
  pass(0, field.bodySamples, frame.body);
  pass(field.bodySamples, field.headSamples, frame.head);
}

/* ---------------- the torrent ---------------- */

/* REXONANCE TORRENT (owner, 2026-11-11: 「滑らかな変身」 and also a suit-up
   「ナノマシンの派手な奔流」 — both). The nanites that become the armour, seen:
   streams pour out of the reactor and the driver, swing wide round the body
   and wind in along the limbs, each a bright head on a trail, and land just
   ahead of the skin's front, where the lip takes them in: the torrent is
   what the liquid metal is made of. A few ride great arcs right round the
   figure (half of them behind it). As the suit closes, the charge calls
   every stream back into the reactor in one converging burst before the
   completion's flash; on a retract they run from the receding lip home.

   Drawn additively on the surge layer's two canvases, in figure px, as a few
   batched paths a frame (no sprite, no gradient, no shadow). The streams fly
   on wall time and each keeps its own flight (where from, where to, when),
   aimed when it is born at the front as it then stands, so the scroll can
   be scrubbed either way under it. Budgeted per device (skinBudget) and
   shed with the governor (SKIN_TORRENT_SHARE); nothing is allocated a
   frame. */

/** The share of the streams each governor level keeps. */
export const SKIN_TORRENT_SHARE = [1, 0.75, 0.55, 0.4] as const;
/** One stream in nine rides a great arc round the figure. */
export const SKIN_TORRENT_ARC = 9;
const STREAM = 10;
/** A stream's trail: this many points behind its head, over this share of
 * its path (the great arcs' longer). */
const TRAIL = 5;
const POSE = TRAIL * 2 + 1;
const TORRENT_TONES = ["rgb(150 236 255)", "rgb(255 143 216)", "rgb(244 251 255)"] as const;

export class SkinTorrent {
  /** Per stream: from x, y, to x, y, its life (ms), its bend and its
   * helix's radius (px), the helix's turns, a seed, its tone. */
  private streams: Float32Array;
  private born: Float64Array;
  /** Per stream, this frame: its trail from tail to head (x, y each), and
   * its presence (0: not drawn). */
  private pose: Float32Array;
  private state = 0x9e3779b9;
  readonly count: number;
  /** The streams drawn last frame. */
  live = 0;

  private core: readonly [number, number];
  private belt: readonly [number, number];

  constructor(count: number, core: readonly [number, number], belt: readonly [number, number]) {
    this.core = core;
    this.belt = belt;
    this.count = Math.max(0, Math.floor(count));
    this.streams = new Float32Array(this.count * STREAM);
    this.born = new Float64Array(this.count).fill(-1);
    this.pose = new Float32Array(this.count * POSE);
  }

  private random() {
    this.state = (Math.imul(this.state, 1664525) + 1013904223) >>> 0;
    return this.state / 4294967296;
  }

  /** A sample of the armour near field value `at` of a front's list. */
  private aim(field: SkinField, head: boolean, at: number, out: Float32Array, o: number, cell: number) {
    const first = head ? field.bodySamples : 0;
    const count = head ? field.headSamples : field.bodySamples;
    if (!count) return false;
    const s = field.samples;
    let a = 0;
    let b = count;
    while (a < b) {
      const m = (a + b) >> 1;
      if (s[(first + m) * SKIN_SAMPLE + 2] < at) a = m + 1;
      else b = m;
    }
    const spread = Math.max(1, Math.floor(count * 0.035));
    let index = a + Math.floor(this.random() * spread);
    if (index >= count) index = count - 1 - Math.floor(this.random() * Math.min(spread, count));
    if (index < 0) index = 0;
    // (Where the armour is thin on samples, never far past the lip.)
    while (index > a && s[(first + index) * SKIN_SAMPLE + 2] > at + 1.5 * SKIN_BAND) index -= 1;
    const at0 = (first + index) * SKIN_SAMPLE;
    out[o] = s[at0] * cell;
    out[o + 1] = s[at0 + 1] * cell;
    return true;
  }

  /** A stream's next flight, or false if there is nowhere to fly. */
  private launch(i: number, field: SkinField, frame: SkinFrame, cell: number, converge: number) {
    const v = this.streams;
    const o = i * STREAM;
    const arc = i % SKIN_TORRENT_ARC === 0;
    const side = this.random() < 0.5 ? -1 : 1;
    const origin = this.random() < 0.3 ? this.belt : this.core;
    let life = 380 + 260 * this.random();
    if (converge > 0.02) {
      // The charge: in from all round the figure, into the reactor.
      const angle = this.random() * Math.PI * 2;
      const reach = 250 + 190 * this.random();
      v[o] = this.core[0] + Math.cos(angle) * reach * 0.8;
      v[o + 1] = this.core[1] + Math.sin(angle) * reach;
      v[o + 2] = origin[0];
      v[o + 3] = origin[1];
      life = 230 + 170 * this.random();
    } else {
      const body = frame.body > 0 && frame.body < 1.02;
      const crown = frame.head > 0 && frame.head < 1.02;
      if (!frame.shell || (!body && !crown)) return false;
      const head = crown && (!body || this.random() < 0.45);
      const front = head ? frame.head : frame.body;
      if (frame.flow > 0) {
        // Out of the reactor (or the driver), to land just ahead of the lip.
        // (From anywhere on the reactor's disc, or along the driver.)
        const wide = origin === this.belt ? 46 : 18;
        v[o] = origin[0] + (this.random() * 2 - 1) * wide;
        v[o + 1] = origin[1] + (this.random() * 2 - 1) * (origin === this.belt ? 8 : 18);
        if (!this.aim(field, head, front + (0.6 + 2.6 * this.random()) * SKIN_BAND, v, o + 2, cell))
          return false;
      } else {
        // The retract: from the receding lip, home.
        if (!this.aim(field, head, front - (0.4 + 1.2 * this.random()) * SKIN_BAND, v, o, cell))
          return false;
        v[o + 2] = this.core[0];
        v[o + 3] = this.core[1];
        life *= 0.8;
      }
    }
    v[o + 4] = arc ? life * 1.55 : life;
    // (The call back runs straighter: an implosion, not a tangle.)
    const calm = converge > 0.02 ? 0.4 : 1;
    v[o + 5] = side * calm * (arc ? 170 + 90 * this.random() : 26 + 74 * this.random());
    v[o + 6] = arc || calm < 1 ? 0 : 7 + 14 * this.random();
    v[o + 7] = 1 + 1.6 * this.random();
    v[o + 8] = this.random();
    v[o + 9] = i % 7 === 0 ? 2 : this.random() < 0.72 ? 0 : 1;
    return true;
  }

  /** Draws the torrent at `now` (ms): `share` of the streams (the
   * governor's), `converge` the charge before completion (0–1), `cell` the
   * figure px per field cell, `px` one device px in figure px. Both contexts
   * are in figure space and composite additively. */
  draw(
    back: CanvasRenderingContext2D,
    front: CanvasRenderingContext2D,
    field: SkinField,
    frame: SkinFrame,
    cell: number,
    now: number,
    px: number,
    share = 1,
    converge = 0,
  ) {
    const v = this.streams;
    const pose = this.pose;
    const keep = Math.floor(this.count * (share < 0 ? 0 : share > 1 ? 1 : share));
    let live = 0;
    for (let i = 0; i < this.count; i += 1) {
      const o = i * STREAM;
      const q = i * POSE;
      pose[q + POSE - 1] = 0;
      let age = this.born[i] < 0 ? -1 : now - this.born[i];
      if (age < 0 || age >= v[o + 4]) {
        // Landed (or never flown): the next flight, staggered at first.
        if (i >= keep || !this.launch(i, field, frame, cell, converge)) {
          this.born[i] = -1;
          continue;
        }
        this.born[i] = this.born[i] < 0 ? now - this.random() * v[o + 4] * 0.9 : now;
        age = now - this.born[i];
      }
      const p = age / v[o + 4];
      const dx = v[o + 2] - v[o];
      const dy = v[o + 3] - v[o + 1];
      const length = Math.hypot(dx, dy) || 1;
      const nx = -dy / length;
      const ny = dx / length;
      const trail = v[o + 6] === 0 ? 0.26 : 0.17;
      for (let k = 0; k < TRAIL; k += 1) {
        const u = Math.max(0, p - (trail * (TRAIL - 1 - k)) / (TRAIL - 1));
        // Fast off the mark, slowing into the surface.
        const e = 1 - (1 - u) * (1 - u);
        const swell = Math.sin(Math.PI * u);
        const off =
          swell * v[o + 5] + Math.sin(u * v[o + 7] * 6.2832 + v[o + 8] * 6.2832) * v[o + 6] * swell;
        pose[q + k * 2] = v[o] + dx * e + nx * off;
        pose[q + k * 2 + 1] = v[o + 1] + dy * e + ny * off;
      }
      // Present from its first step until the surface takes it in.
      pose[q + POSE - 1] = Math.min(1, p * 5) * (p > 0.9 ? (1 - p) * 10 : 1) + 0.001;
      live += 1;
    }
    this.live = live;
    if (!live) return;
    const strong = frame.alpha > 0 ? frame.alpha : 1;
    back.lineCap = front.lineCap = "round";
    back.lineJoin = front.lineJoin = "round";
    // The trails, a tone at a time: each path stroked wide and faint (its
    // glow), then narrow and bright; the great arcs thicker, half behind.
    const unit = Math.max(1, px);
    for (let tone = 0; tone < 3; tone += 1)
      for (let pass = 0; pass < 3; pass += 1) {
        // 0: the streams; 1: the arcs in front; 2: the arcs behind.
        const context = pass === 2 ? back : front;
        let any = false;
        context.beginPath();
        for (let i = 0; i < this.count; i += 1) {
          const q = i * POSE;
          if (pose[q + POSE - 1] <= 0 || v[i * STREAM + 9] !== tone) continue;
          const arc = i % SKIN_TORRENT_ARC === 0;
          if (arc !== pass > 0 || (arc && v[i * STREAM + 5] < 0 !== (pass === 2))) continue;
          context.moveTo(pose[q], pose[q + 1]);
          for (let k = 1; k < TRAIL; k += 1) context.lineTo(pose[q + k * 2], pose[q + k * 2 + 1]);
          any = true;
        }
        if (!any) continue;
        context.strokeStyle = TORRENT_TONES[tone];
        context.globalAlpha = (pass ? 0.26 : 0.18) * strong;
        context.lineWidth = (pass ? 7 : 4.5) * unit;
        context.stroke();
        context.globalAlpha = (pass ? 0.95 : 0.85) * strong;
        context.lineWidth = (pass ? 2.8 : 1.7) * unit;
        context.stroke();
      }
    // The heads: white-hot, swelling as the surface takes them.
    for (let pass = 0; pass < 2; pass += 1) {
      const context = pass ? back : front;
      let any = false;
      context.beginPath();
      for (let i = 0; i < this.count; i += 1) {
        const q = i * POSE;
        const here = pose[q + POSE - 1];
        if (here <= 0) continue;
        const arc = i % SKIN_TORRENT_ARC === 0;
        if ((arc && v[i * STREAM + 5] < 0) !== (pass === 1)) continue;
        const size = (arc ? 5 : 3 + 1.8 * v[i * STREAM + 8]) * unit * (0.5 + 0.5 * here);
        const h = q + (TRAIL - 1) * 2;
        context.rect(pose[h] - size / 2, pose[h + 1] - size / 2, size, size);
        any = true;
      }
      if (!any) continue;
      context.fillStyle = "rgb(246 252 255)";
      context.globalAlpha = 0.95 * strong;
      context.fill();
    }
    back.globalAlpha = 1;
    front.globalAlpha = 1;
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
    gl.uniform1f(this.uniforms.uHex, Math.max(8.5, 4 / Math.max(0.1, this.scale)));
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
