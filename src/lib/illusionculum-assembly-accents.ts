/** ILLUSIONCULUM SAGA — the suit-up's director (round 2, 2026-11-01, owner:
 * 「装着アニメーションを大きく改善して」).
 *
 * The Rexonance nanite engine still generates every plate from nanite cells
 * on its lifted stage and seats it (illusionculum-assembly-engine.ts, owner
 * 2026-10-23: 「ナノマシンで生成された装甲をしてから装着する方式」); the stage
 * is now far off the body (ILLUSIONCULUM_ARMOUR_STAGING), so every plate is
 * seen built in the air and then driven home. These are the scene's
 * `accents` (RexonanceAssemblyAccents), drawn behind and over the figure in
 * figure px (693 x 1040), staged as a henshin bank in beats:
 *
 * 1. OMEN (0 – .07): the driver wakes — rings of light pulse out of the belt,
 *    a pillar of light rises through the body, the sigil draws on the floor.
 * 2. TORRENT (.06 – .16): the nanites erupt from the driver as two
 *    counter-wound helices that climb and fall round the body.
 * 3. PARTS (.16 – .85): each plate's nanites leave the helices on streaks and
 *    pour into the plate where it hovers (the engine builds it there), so the
 *    torrent thins as the armour grows; as a plate is driven home, speed
 *    lines trail it; at its exact contact (ILLUSIONCULUM_FLIGHTS, the
 *    engine's own plan) its outline goes white-hot, a shock ring and sparks
 *    leave it and the camera takes the hit. When a group is whole, power runs
 *    once round all its seams (a small local glow for the legs, arms and chest, ≥ 600 ms apart on
 *    the entry clock). The helmet closes with a slit of light over the visor.
 * 4. SEAL (.86): the one larger bloom from the reactor, a shock ring through
 *    the body, every seam lit once, the reserve nanites thrown out.
 * 5. AFTERGLOW (.88 – .97): embers rise, a halo ring settles behind the
 *    figure while the camera holds the pose.
 *
 * The camera (`illusionculumCamera`): a closed-form framing per beat — tight
 * on the driver for the omen, a whip out for the torrent, close on the legs,
 * the arms, the chest, wide for the cape, slammed in on the helmet, snapped
 * back at the seal and a slow push on the finished pose — plus a decaying
 * shake at each contact (live frames only). The scene's owner applies it as
 * a CSS transform (no canvas re-raster), so it costs a style write a frame.
 *
 * Contracts (the engine's): closed-form in the progress (a resting frame is
 * the same however it was reached; `calm` drops every transient: streaks,
 * rims, rings, sparks, glows, shake), nothing allocated in a frame (typed
 * arrays made once, the glows' gradients once per context), the context's
 * transform never set. Counts scale with the device
 * (`illusionculumAccentBudget`).
 */

import type { RexonanceAssemblyAccents, RexonanceAssemblyPiece } from "./rexonance-resonance.js";
import { ILLUSIONCULUM_FLIGHTS } from "./illusionculum-flights.ts";

const TAU = Math.PI * 2;
const clamp01 = (value: number) => (value < 0 ? 0 : value > 1 ? 1 : value);
const smooth = (u: number) => u * u * (3 - 2 * u);
const easeOut = (u: number) => 1 - (1 - u) * (1 - u) * (1 - u);
const easeInOut = (u: number) => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2);

/** The engine's beats (rexonance-resonance.js ASSEMBLY_BEATS), as this
 * scene reads them. */
export const ILLUSIONCULUM_ACCENT_BEATS = Object.freeze({
  omen: [0, 0.07] as const,
  torrent: [0.06, 0.16] as const,
  deus: [0.16, 0.62] as const,
  rexonance: [0.62, 0.82] as const,
  clamp: 0.86,
  /** Everything of the accents is gone by here (the form changes' end). */
  end: 0.972,
});

/** The plate groups as they lock, in order; a group is whole at its last
 * plate's contact, when its power runs round its seams (`bloom`: a small
 * local glow — the legs, arms and chest, ≥ 600 ms apart on the entry clock;
 * the waist locks too soon after the chest; the cape and the helmet are too close
 * to the seal's bloom and the head's own slit of light). */
export const ILLUSIONCULUM_ACCENT_GROUPS = Object.freeze(
  [
    { groups: ["legs"], bloom: true, shake: 5 },
    { groups: ["arms"], bloom: true, shake: 4 },
    { groups: ["chest", "shoulders"], bloom: true, shake: 6 },
    { groups: ["waist"], bloom: false, shake: 4 },
    { groups: ["tail", "ribbon", "bits"], bloom: false, shake: 3 },
    { groups: ["helm"], bloom: false, shake: 7 },
  ].map((group) => Object.freeze({ ...group, groups: Object.freeze(group.groups) })),
);

/** How many motes and sparks a device draws. */
export type IllusionculumAccentBudget = { motes: number; sparks: number; embers: number };

/** The device's budget: desktop full; touch / narrow screens about 40%,
 * less for the short entry beside the departing page; a low-core or
 * low-memory device 60% of that. */
export function illusionculumAccentBudget(
  environment: typeof globalThis,
  options: { compact: boolean; entry: boolean },
): IllusionculumAccentBudget {
  const navigator = environment.navigator as Navigator & { deviceMemory?: number };
  const cores = navigator?.hardwareConcurrency || 8;
  const memory = navigator?.deviceMemory || 8;
  const low = cores <= 4 || memory <= 3 ? 0.6 : 1;
  const base = options.compact ? (options.entry ? 340 : 440) : 1100;
  return {
    motes: Math.round(base * low),
    sparks: options.compact ? 9 : 14,
    embers: Math.round((options.compact ? 36 : 80) * low),
  };
}

/** A seam string (base64 Int16 LE: the loop count, then each loop's point
 * count and points, quarter figure px) as loops of figure px. */
export function decodeIllusionculumSeam(encoded: string | undefined): Float32Array[] {
  if (!encoded) return [];
  let bytes: Uint8Array;
  try {
    bytes = Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0));
  } catch {
    return [];
  }
  const words = new Int16Array(bytes.buffer, 0, bytes.length >> 1);
  const loops: Float32Array[] = [];
  let at = 1;
  for (let loop = 0; loop < words[0] && at < words.length; loop += 1) {
    const n = words[at];
    at += 1;
    if (n < 2 || at + n * 2 > words.length) break;
    const points = new Float32Array(n * 2);
    for (let k = 0; k < n * 2; k += 1) points[k] = words[at + k] / 4;
    loops.push(points);
    at += n * 2;
  }
  return loops;
}

/** A staged plate's distance from its seat as a share of its lifted offset
 * (rexonance-assembly-nanites.js armorSeatLift, for this table's fields):
 * built on its stage, a dwell, then the seating stroke to contact. */
export function illusionculumSeatLift(
  flight: readonly [string, number, number, number, number, ...unknown[]],
  q: number,
): number {
  const [, from, to, depart, contact] = flight;
  const seatHold = flight[7] as number;
  const catchAt = flight[8] as number;
  const catchLift = flight[9] as number;
  const ornament = flight[10] === 1;
  if (q < from) return 1;
  if (q < to) return 1 - seatHold * smooth(clamp01((q - from) / (to - from)));
  if (q >= contact) return 0;
  if (q < depart) return 1 - seatHold;
  const u = clamp01((q - depart) / (contact - depart));
  if (ornament) return (1 - seatHold) * (1 - smooth(u));
  return (
    (1 - seatHold) *
    (u < catchAt
      ? 1 - (1 - catchLift) * smooth(u / catchAt)
      : catchLift * (1 - smooth((u - catchAt) / (1 - catchAt))))
  );
}

/** The camera's framing per beat: [progress, focus x, focus y, where the
 * focus sits (the rest position of figure point gx, gy), scale, roll°].
 * Short spans are whips; long ones are slow pushes. */
export const ILLUSIONCULUM_CAMERA_KEYS = Object.freeze([
  [0, 347, 462, 347, 470, 1.1, 0],
  [0.065, 347, 458, 347, 470, 1.17, 0],
  [0.1, 347, 520, 347, 520, 0.985, -1.1],
  [0.17, 347, 560, 347, 520, 1, 0],
  [0.225, 347, 800, 347, 640, 1.22, 0.5],
  [0.325, 347, 790, 347, 640, 1.22, 0],
  [0.35, 347, 430, 347, 470, 1.14, -0.7],
  [0.43, 347, 430, 347, 470, 1.17, 0],
  [0.46, 347, 310, 347, 390, 1.24, 0.5],
  [0.545, 347, 305, 347, 390, 1.27, 0],
  [0.57, 347, 520, 347, 500, 1.12, 0],
  [0.625, 347, 520, 347, 500, 1.1, 0],
  [0.665, 347, 600, 347, 560, 0.99, 0],
  [0.79, 347, 560, 347, 540, 1.02, 0],
  [0.818, 347, 178, 347, 330, 1.32, 0],
  [0.852, 347, 180, 347, 330, 1.35, 0],
  [0.864, 347, 520, 347, 520, 1, 0],
  [0.95, 347, 400, 347, 420, 1.05, 0],
  [0.975, 347, 520, 347, 520, 1, 0],
] as const);

/** The camera at a progress: focus (fx, fy) figure px drawn at the rest
 * position of (gx, gy), scale s, roll (radians) — written into `out`
 * [fx, fy, gx, gy, s, roll]. `amount` scales the move toward rest (1 the
 * entry's full framing; the scroll's is gentler). Closed-form. */
export function illusionculumCamera(progress: number, amount: number, out: Float32Array) {
  const keys = ILLUSIONCULUM_CAMERA_KEYS;
  let a: readonly number[] = keys[0];
  let b: readonly number[] = keys[0];
  let u = 0;
  if (progress >= keys[keys.length - 1][0]) {
    a = b = keys[keys.length - 1];
  } else if (progress > keys[0][0]) {
    for (let i = 1; i < keys.length; i += 1) {
      if (progress <= keys[i][0]) {
        a = keys[i - 1];
        b = keys[i];
        u = easeInOut(clamp01((progress - a[0]) / (b[0] - a[0])));
        break;
      }
    }
  }
  const mix = (k: number) => a[k] + (b[k] - a[k]) * u;
  const fx = mix(1);
  const fy = mix(2);
  const gx = mix(3);
  const gy = mix(4);
  out[0] = fx;
  out[1] = fy;
  out[2] = fx + (gx - fx) * amount;
  out[3] = fy + (gy - fy) * amount;
  out[4] = 1 + (mix(5) - 1) * amount;
  out[5] = ((mix(6) * Math.PI) / 180) * amount;
  return out;
}

/** Where the camera writes: called once a frame with the framing and the
 * shake (figure px), only when it changed. */
export type IllusionculumCameraSink = (frame: Float32Array, shakeX: number, shakeY: number) => void;

const seededRandom = (seed: number) => {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

// The light paths' colours: ice, pink, gold; and the glows' white.
const TONE_CSS = ["rgb(166 230 255)", "rgb(255 143 210)", "rgb(240 204 130)"] as const;
const WHITE = "rgb(236 248 255)";
// The helices' tilt (their ellipse's height over its width).
const TILT = 0.2;
// A mote's streak (progress looked back).
const STREAK = 0.0035;
// The impact's length (progress) after a plate's contact.
const HIT = 0.016;
// A group's power run round its seams after its last contact.
const POWER = 0.03;
const FREE = -1;
const PLANES = [
  { width: 1.1, alpha: 0.38 },
  { width: 1.8, alpha: 0.62 },
  { width: 2.8, alpha: 0.82 },
] as const;

type Piece = Pick<RexonanceAssemblyPiece, "id" | "group" | "x" | "y" | "w" | "h">;

/** The scene's director for this suit (RexonanceAssemblyAccents), plus its
 * camera (`camera`, given the scene's owner's sink). */
export function createIllusionculumAccents(options: {
  size: { readonly width: number; readonly height: number };
  pieces: readonly Piece[];
  core: readonly [number, number];
  seams: Readonly<Record<string, string>>;
  budget: IllusionculumAccentBudget;
  /** The camera's sink and its amount (1 entry, less on the scroll). */
  camera?: { sink: IllusionculumCameraSink; amount: number };
  /** The driver's centre (figure px): the omen's source. */
  belt?: readonly [number, number];
}): RexonanceAssemblyAccents {
  const { width: W, height: H } = options.size;
  const [coreX, coreY] = options.core;
  const [beltX, beltY] = options.belt ?? [W / 2, H * 0.44];
  const random = seededRandom(1101);
  const CX = W / 2;

  // ---- The flights: each plate's box, seams, lifted offset and contact. ----
  const byId = new Map(options.pieces.map((piece) => [piece.id, piece]));
  const flights = ILLUSIONCULUM_FLIGHTS.filter(([id]) => byId.has(id));
  const F = flights.length;
  const fBox = new Float32Array(F * 4); // cx, cy, half w, half h
  const fGroup = new Int8Array(F);
  const fLoops: Float32Array[][] = [];
  const groupCount = ILLUSIONCULUM_ACCENT_GROUPS.length;
  const groupWhole = new Float32Array(groupCount); // its last contact
  const groupFirst = new Float32Array(groupCount).fill(1);
  const groupLoops: Float32Array[][] = Array.from({ length: groupCount }, () => []);
  const groupLengths: number[][] = Array.from({ length: groupCount }, () => []);
  const groupBox = new Float32Array(groupCount * 4);
  const allLoops: Float32Array[] = [];
  for (let f = 0; f < F; f += 1) {
    const piece = byId.get(flights[f][0]) as Piece;
    fBox[f * 4] = piece.x + piece.w / 2;
    fBox[f * 4 + 1] = piece.y + piece.h / 2;
    fBox[f * 4 + 2] = piece.w / 2;
    fBox[f * 4 + 3] = piece.h / 2;
    const g = Math.max(
      0,
      ILLUSIONCULUM_ACCENT_GROUPS.findIndex((spec) => spec.groups.includes(piece.group)),
    );
    fGroup[f] = g;
    groupWhole[g] = Math.max(groupWhole[g], flights[f][4]);
    groupFirst[g] = Math.min(groupFirst[g], flights[f][1]);
    const loops = decodeIllusionculumSeam(options.seams[piece.id]);
    fLoops.push(loops);
    for (const loop of loops) {
      let length = 0;
      const n = loop.length >> 1;
      for (let k = 0; k < n; k += 1) {
        const j = (k + 1) % n;
        length += Math.hypot(loop[j * 2] - loop[k * 2], loop[j * 2 + 1] - loop[k * 2 + 1]);
      }
      groupLoops[g].push(loop);
      groupLengths[g].push(length);
      allLoops.push(loop);
    }
  }
  for (let g = 0; g < groupCount; g += 1) {
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (let f = 0; f < F; f += 1) {
      if (fGroup[f] !== g) continue;
      x0 = Math.min(x0, fBox[f * 4] - fBox[f * 4 + 2]);
      x1 = Math.max(x1, fBox[f * 4] + fBox[f * 4 + 2]);
      y0 = Math.min(y0, fBox[f * 4 + 1] - fBox[f * 4 + 3]);
      y1 = Math.max(y1, fBox[f * 4 + 1] + fBox[f * 4 + 3]);
    }
    if (!Number.isFinite(x0)) {
      x0 = coreX - 40;
      x1 = coreX + 40;
      y0 = coreY - 40;
      y1 = coreY + 40;
    }
    groupBox[g * 4] = (x0 + x1) / 2;
    groupBox[g * 4 + 1] = (y0 + y1) / 2;
    groupBox[g * 4 + 2] = (x1 - x0) / 2;
    groupBox[g * 4 + 3] = (y1 - y0) / 2;
  }
  const groupLengthArrays = groupLengths.map((lengths) => Float32Array.from(lengths));
  const lifted = (f: number, q: number) => illusionculumSeatLift(flights[f], q);

  // ---- The motes: the helices, each mote poured into one plate or kept. ----
  const N = Math.max(0, options.budget.motes | 0);
  const A0 = new Float32Array(N);
  const SPIN = new Float32Array(N);
  const R0 = new Float32Array(N);
  const H0 = new Float32Array(N);
  const RISE = new Float32Array(N);
  const DELAY = new Float32Array(N);
  const PLANE = new Int8Array(N);
  const TONE = new Int8Array(N);
  const FLIGHT = new Int16Array(N);
  const TX = new Float32Array(N);
  const TY = new Float32Array(N);
  const TD = new Float32Array(N);
  const TA = new Float32Array(N);
  const BEND = new Float32Array(N);
  // Buckets by plane and tone: one fill/stroke per bucket.
  const ORDER = new Int32Array(N);
  const BUCKET_START = new Int32Array(10);
  {
    const keys = new Int8Array(N);
    for (let i = 0; i < N; i += 1) {
      const pr = random();
      const plane = pr < 0.3 ? 0 : pr < 0.78 ? 1 : 2;
      const tr = random();
      const tone = tr < 0.55 ? 0 : tr < 0.82 ? 1 : 2;
      PLANE[i] = plane;
      TONE[i] = tone;
      keys[i] = plane * 3 + tone;
      const strand = random() < 0.5 ? 1 : -1;
      A0[i] = random() * TAU;
      SPIN[i] = strand * (7 + 6 * random());
      R0[i] = (W / 2) * (0.42 + 0.62 * random()) * (plane === 0 ? 1.35 : plane === 2 ? 1.1 : 1);
      H0[i] = random();
      RISE[i] = strand * (0.35 + 0.45 * random());
      DELAY[i] = 0.05 * random();
      // A plate takes about 4 in 5 of the motes; the rest wait for the seal.
      FLIGHT[i] = FREE;
      if (F && plane !== 0 && random() < 0.8) {
        const f = Math.floor(random() * F);
        FLIGHT[i] = f;
        const [, from, to] = flights[f];
        const arrive = from + (to - from) * (0.08 + 0.86 * random());
        const flight = 0.018 + 0.022 * random();
        TA[i] = arrive;
        TD[i] = Math.max(0.07, arrive - flight);
        // A point of the plate's outline where it hovers at the arrival.
        const lam = lifted(f, arrive);
        const loops = fLoops[f];
        let x = fBox[f * 4] + (random() - 0.5) * fBox[f * 4 + 2];
        let y = fBox[f * 4 + 1] + (random() - 0.5) * fBox[f * 4 + 3];
        if (loops.length) {
          const loop = loops[Math.floor(random() * loops.length)];
          const k = Math.floor(random() * (loop.length >> 1));
          x = loop[k * 2];
          y = loop[k * 2 + 1];
        }
        TX[i] = x + flights[f][5] * lam;
        TY[i] = y + flights[f][6] * lam;
        BEND[i] = (random() - 0.5) * W * 0.6;
      } else {
        // The reserve's burst at the seal: its direction and reach.
        TX[i] = random() * TAU;
        TY[i] = 160 + 560 * random();
        TA[i] = ILLUSIONCULUM_ACCENT_BEATS.clamp + 0.004 * random();
        BEND[i] = 0.6 + 0.8 * random();
      }
    }
    const counts = new Int32Array(10);
    for (let i = 0; i < N; i += 1) counts[keys[i]] += 1;
    let at = 0;
    for (let k = 0; k < 9; k += 1) {
      BUCKET_START[k] = at;
      at += counts[k];
    }
    BUCKET_START[9] = N;
    const fill = BUCKET_START.slice(0, 9);
    for (let i = 0; i < N; i += 1) ORDER[fill[keys[i]]++] = i;
  }

  // ---- One mote's place at a progress (scratch, no allocation). ----
  let px = 0;
  let py = 0;
  let pz = 0;
  let pk = 0; // its size factor (0: not drawn)
  let flying = false;
  const TOP = -0.08 * H;
  const SPAN = 1.16 * H;
  const helix = (i: number, p: number) => {
    // Erupting from the driver: out from the belt along the helix.
    const born = easeOut(clamp01((p - 0.055 - DELAY[i]) / 0.07));
    const tighten = 1 - 0.3 * smooth(clamp01(p / ILLUSIONCULUM_ACCENT_BEATS.clamp));
    const r = R0[i] * tighten * born;
    const th = A0[i] + SPIN[i] * p;
    const c = Math.cos(th);
    const s = Math.sin(th);
    let y = TOP + H0[i] * SPAN + RISE[i] * H * p - TOP;
    y = TOP + (((y % SPAN) + SPAN) % SPAN);
    y = beltY + (y - beltY) * born;
    const edge = Math.min(1, (y - TOP) / (0.08 * H), (TOP + SPAN - y) / (0.08 * H));
    px = beltX + (CX - beltX) * born + r * c;
    py = y + r * TILT * s;
    pz = s;
    pk = born * clamp01(edge);
  };
  const place = (i: number, p: number) => {
    flying = false;
    const f = FLIGHT[i];
    if (f === FREE) {
      const t = TA[i];
      if (p < t) {
        helix(i, p);
        return;
      }
      // The burst from the reactor, rising and fading.
      const v = clamp01((p - t) / (ILLUSIONCULUM_ACCENT_BEATS.end - 0.008 - t));
      const reach = TY[i] * easeOut(v) * BEND[i];
      px = coreX + Math.cos(TX[i]) * reach;
      py = coreY + Math.sin(TX[i]) * reach * 0.7 - 160 * v * v;
      pz = 1;
      pk = (1 - v) * (1 - v);
      return;
    }
    const td = TD[i];
    const ta = TA[i];
    if (p < td) {
      helix(i, p);
      return;
    }
    if (p >= ta) {
      pk = 0;
      return;
    }
    helix(i, td);
    const u = clamp01((p - td) / (ta - td));
    // Accelerating into the plate (the pour), on a bent path.
    const e = u * u * (0.4 + 0.6 * u);
    const dx = TX[i] - px;
    const dy = TY[i] - py;
    const len = Math.hypot(dx, dy) || 1;
    const arc = Math.sin(Math.PI * u) * BEND[i] * (1 - u);
    px += dx * e + (-dy / len) * arc;
    py += dy * e + (dx / len) * arc;
    pz = pz + (1 - pz) * smooth(u);
    flying = true;
  };

  // ---- Drawing helpers. ----
  const drawMotes = (context: CanvasRenderingContext2D, p: number, front: boolean) => {
    for (let bucket = 0; bucket < 9; bucket += 1) {
      const plane = (bucket / 3) | 0;
      const tone = bucket % 3;
      if (plane === 0 && front) continue;
      const from = BUCKET_START[bucket];
      const to = BUCKET_START[bucket + 1];
      if (from >= to) continue;
      context.strokeStyle = TONE_CSS[tone];
      context.lineWidth = PLANES[plane].width;
      context.globalAlpha = PLANES[plane].alpha;
      context.beginPath();
      let any = false;
      for (let o = from; o < to; o += 1) {
        const i = ORDER[o];
        place(i, p);
        if (pk <= 0.03) continue;
        const isFront = plane === 2 || flying ? true : plane === 0 ? false : pz >= 0;
        if (isFront !== front) continue;
        const x1 = px;
        const y1 = py;
        const k = pk;
        // A streak from a moment ago: the torrent's speed (longer in flight).
        place(i, p - (flying ? STREAK * 1.6 : STREAK));
        const sx = px + (x1 - px) * (1 - k);
        const sy = py + (y1 - py) * (1 - k);
        context.moveTo(sx, sy);
        context.lineTo(x1 + 0.01, y1);
        any = true;
      }
      if (any) context.stroke();
    }
  };

  const traceLoop = (
    context: CanvasRenderingContext2D,
    loop: Float32Array,
    total: number,
    a: number,
    b: number,
  ) => {
    if (b - a <= 0.5 || total <= 0) return;
    const n = loop.length >> 1;
    let start = ((a % total) + total) % total;
    let remain = Math.min(total, b - a);
    let k = 0;
    let along = 0;
    for (; k < n; k += 1) {
      const j = (k + 1) % n;
      const seg = Math.hypot(loop[j * 2] - loop[k * 2], loop[j * 2 + 1] - loop[k * 2 + 1]);
      if (along + seg >= start) {
        const t = seg > 0 ? (start - along) / seg : 0;
        context.moveTo(
          loop[k * 2] + (loop[j * 2] - loop[k * 2]) * t,
          loop[k * 2 + 1] + (loop[j * 2 + 1] - loop[k * 2 + 1]) * t,
        );
        start -= along;
        const left = seg - start;
        if (left >= remain) {
          const t2 = seg > 0 ? (start + remain) / seg : 0;
          context.lineTo(
            loop[k * 2] + (loop[j * 2] - loop[k * 2]) * t2,
            loop[k * 2 + 1] + (loop[j * 2 + 1] - loop[k * 2 + 1]) * t2,
          );
          return;
        }
        context.lineTo(loop[j * 2], loop[j * 2 + 1]);
        remain -= left;
        k = j;
        break;
      }
      along += seg;
    }
    if (k >= n) return;
    for (let step = 0; step < n && remain > 0; step += 1) {
      const j = (k + 1) % n;
      const seg = Math.hypot(loop[j * 2] - loop[k * 2], loop[j * 2 + 1] - loop[k * 2 + 1]);
      if (seg >= remain) {
        const t = seg > 0 ? remain / seg : 0;
        context.lineTo(
          loop[k * 2] + (loop[j * 2] - loop[k * 2]) * t,
          loop[k * 2 + 1] + (loop[j * 2 + 1] - loop[k * 2 + 1]) * t,
        );
        return;
      }
      context.lineTo(loop[j * 2], loop[j * 2 + 1]);
      remain -= seg;
      k = j;
    }
  };

  const wholeLoop = (context: CanvasRenderingContext2D, loop: Float32Array) => {
    const n = loop.length >> 1;
    context.moveTo(loop[0], loop[1]);
    for (let k = 1; k < n; k += 1) context.lineTo(loop[k * 2], loop[k * 2 + 1]);
    context.closePath();
  };

  // The glows' gradients, made once per context (fixed in figure px).
  let glowContext: CanvasRenderingContext2D | null = null;
  const glows: (CanvasGradient | null)[] = new Array(groupCount + 1).fill(null);
  const glowRadius = new Float32Array(groupCount + 1);
  const makeGlows = (context: CanvasRenderingContext2D) => {
    if (glowContext === context) return;
    glowContext = context;
    for (let g = 0; g < groupCount; g += 1) {
      const r = Math.max(groupBox[g * 4 + 2], groupBox[g * 4 + 3]) * 0.62;
      glowRadius[g] = r;
      const cx = groupBox[g * 4];
      const cy = groupBox[g * 4 + 1];
      const gradient = context.createRadialGradient(cx, cy, 0, cx, cy, r);
      gradient.addColorStop(0, "rgb(236 248 255 / 0.85)");
      gradient.addColorStop(0.35, "rgb(166 230 255 / 0.4)");
      gradient.addColorStop(1, "rgb(169 131 255 / 0)");
      glows[g] = gradient;
    }
    const r = W * 0.6;
    glowRadius[groupCount] = r;
    const seal = context.createRadialGradient(coreX, coreY, 0, coreX, coreY, r);
    seal.addColorStop(0, "rgb(240 250 255 / 0.95)");
    seal.addColorStop(0.22, "rgb(166 230 255 / 0.55)");
    seal.addColorStop(0.6, "rgb(169 131 255 / 0.16)");
    seal.addColorStop(1, "rgb(169 131 255 / 0)");
    glows[groupCount] = seal;
  };

  const SPARKS = Math.max(0, options.budget.sparks | 0);

  /** OMEN: the driver's rings and the pillar (front); the floor sigil (back). */
  const drawOmen = (context: CanvasRenderingContext2D, p: number, front: boolean) => {
    if (!front) {
      // The floor sigil: two ellipses drawing round, held faint through the
      // build, pulsing out at the seal and gone with the accents.
      const draw = easeOut(clamp01(p / 0.08));
      if (draw <= 0) return;
      const fade =
        p < 0.86
          ? 1 - 0.55 * smooth(clamp01((p - 0.1) / 0.1))
          : 0.45 + 0.55 * clamp01((0.9 - p) / 0.04);
      const out = 1 + 0.25 * easeOut(clamp01((p - 0.86) / 0.08));
      const end = clamp01((ILLUSIONCULUM_ACCENT_BEATS.end - p) / 0.04);
      const floorY = H - 6;
      context.strokeStyle = TONE_CSS[0];
      context.globalAlpha = 0.7 * fade * end;
      context.lineWidth = 2;
      context.beginPath();
      context.ellipse(
        CX,
        floorY,
        W * 0.42 * out,
        W * 0.075 * out,
        0,
        -Math.PI / 2,
        -Math.PI / 2 + TAU * draw,
      );
      context.stroke();
      context.strokeStyle = TONE_CSS[2];
      context.globalAlpha = 0.55 * fade * end;
      context.lineWidth = 1.2;
      context.beginPath();
      context.ellipse(
        CX,
        floorY,
        W * 0.3 * out,
        W * 0.052 * out,
        0,
        Math.PI / 2,
        Math.PI / 2 - TAU * draw,
        true,
      );
      context.stroke();
      return;
    }
    if (p > 0.14) return;
    // Three rings out of the driver, one after another.
    context.lineWidth = 2;
    for (let k = 0; k < 3; k += 1) {
      const u = clamp01((p - k * 0.022) / 0.06);
      if (u <= 0 || u >= 1) continue;
      const r = 18 + 300 * easeOut(u);
      context.strokeStyle = k === 1 ? TONE_CSS[1] : TONE_CSS[0];
      context.globalAlpha = 0.85 * (1 - u) * (1 - u);
      context.beginPath();
      context.ellipse(beltX, beltY, r, r * 0.42, 0, 0, TAU);
      context.stroke();
    }
    // The power climbing the body: a bright head running up from the feet
    // to the crown with a fading tail, a glint where it tops out.
    const rise = clamp01(p / 0.065);
    if (rise > 0 && rise < 1) {
      const head = H - (H + 30) * easeOut(rise);
      const tail = 240;
      const fade = 1 - rise * rise;
      context.fillStyle = TONE_CSS[0];
      context.globalAlpha = 0.16 * fade;
      context.fillRect(CX - 18, head, 36, tail);
      context.fillStyle = WHITE;
      context.globalAlpha = 0.6 * fade;
      context.fillRect(CX - 1, head, 2, tail * 0.55);
      context.globalAlpha = 0.85 * fade;
      context.fillRect(CX - 26 * fade, head - 1, 52 * fade, 2);
    }
  };

  /** A plate driven home: speed lines behind it (live frames). */
  const drawFlights = (context: CanvasRenderingContext2D, p: number) => {
    context.strokeStyle = WHITE;
    context.lineWidth = 1.4;
    context.globalAlpha = 0.55;
    context.beginPath();
    let any = false;
    for (let f = 0; f < F; f += 1) {
      const flight = flights[f];
      const depart = flight[3];
      const contact = flight[4];
      if (flight[11] === 1 || p < depart || p >= contact) continue;
      const lam = lifted(f, p);
      const ox = flight[5];
      const oy = flight[6];
      const travel = Math.hypot(ox, oy);
      if (travel < 8) continue;
      const ux = ox / travel;
      const uy = oy / travel;
      const cx = fBox[f * 4] + ox * lam;
      const cy = fBox[f * 4 + 1] + oy * lam;
      // Longest mid-stroke, gone at contact.
      const u = clamp01((p - depart) / (contact - depart));
      const length = travel * (0.5 + 1.4 * Math.sin(Math.PI * u));
      const hw = fBox[f * 4 + 2];
      const hh = fBox[f * 4 + 3];
      for (let k = -2; k <= 2; k += 1) {
        // Across the motion, spread over the plate's width.
        const sx = cx + -uy * k * hw * 0.42 + ux * hh * 0.4;
        const sy = cy + ux * k * hh * 0.42 + uy * hw * 0.2;
        const l = length * (0.6 + 0.4 * Math.cos(k * 1.7 + f));
        context.moveTo(sx, sy);
        context.lineTo(sx + ux * l, sy + uy * l);
        any = true;
      }
    }
    if (any) context.stroke();
  };

  /** Each plate's contact: its outline white-hot, a ring and sparks. */
  const drawHits = (context: CanvasRenderingContext2D, p: number) => {
    for (let f = 0; f < F; f += 1) {
      const contact = flights[f][4];
      if (p < contact || p >= contact + HIT) continue;
      const u = (p - contact) / HIT;
      const loops = fLoops[f];
      const heat = (1 - u) * (1 - u);
      if (loops.length) {
        context.strokeStyle = TONE_CSS[0];
        context.globalAlpha = 0.5 * heat;
        context.lineWidth = 2 + 6 * heat;
        context.beginPath();
        for (let k = 0; k < loops.length; k += 1) wholeLoop(context, loops[k]);
        context.stroke();
        context.strokeStyle = WHITE;
        context.globalAlpha = 0.95 * heat;
        context.lineWidth = 1.3 + 1.6 * heat;
        context.stroke();
      }
      const cx = fBox[f * 4];
      const cy = fBox[f * 4 + 1];
      const hw = Math.max(fBox[f * 4 + 2], 26);
      const hh = Math.max(fBox[f * 4 + 3], 26);
      const ring = easeOut(clamp01(u * 1.4));
      if (ring < 1) {
        context.strokeStyle = TONE_CSS[0];
        context.globalAlpha = 0.75 * (1 - ring) * (1 - ring);
        context.lineWidth = 1 + 3 * (1 - ring);
        context.beginPath();
        context.ellipse(cx, cy, hw * (0.7 + 1.1 * ring), hh * (0.7 + 1.1 * ring), 0, 0, TAU);
        context.stroke();
      }
      // Sparks thrown off the contact, against the stroke's direction.
      const flight = flights[f];
      const travel = Math.hypot(flight[5], flight[6]) || 1;
      const ux = flight[5] / travel;
      const uy = flight[6] / travel;
      context.strokeStyle = TONE_CSS[2];
      context.globalAlpha = 0.95 * (1 - u);
      context.lineWidth = 1.6;
      context.beginPath();
      const reach = Math.max(hw, hh) * 1.1;
      for (let k = 0; k < SPARKS; k += 1) {
        const spread = (k / Math.max(1, SPARKS - 1) - 0.5) * 2.6 + Math.sin(k * 12.9898 + f) * 0.25;
        const base = Math.atan2(uy, ux);
        const angle = travel > 8 ? base + spread : (k / SPARKS) * TAU + f;
        const r0 = reach * (0.35 + 0.9 * easeOut(u));
        const r1 = r0 + reach * 0.3 * (1 - u);
        const c = Math.cos(angle);
        const s = Math.sin(angle);
        context.moveTo(cx + c * r0 * 0.8, cy + s * r0);
        context.lineTo(cx + c * r1 * 0.8, cy + s * r1);
      }
      context.stroke();
    }
  };

  /** A group whole: power runs once round all its seams; one local glow. */
  const drawPower = (context: CanvasRenderingContext2D, g: number, p: number, calm: boolean) => {
    const at = groupWhole[g];
    if (p < at || p > at + POWER) return;
    const u = clamp01((p - at) / POWER);
    const loops = groupLoops[g];
    const lengths = groupLengthArrays[g];
    // The run: two heads from each outline's start, round it and gone.
    const reach = easeOut(u);
    context.strokeStyle = TONE_CSS[0];
    context.globalAlpha = 0.6 * (1 - u);
    context.lineWidth = 1.8;
    context.beginPath();
    for (let k = 0; k < loops.length; k += 1) {
      const half = (lengths[k] / 2) * reach;
      traceLoop(context, loops[k], lengths[k], -half, half);
    }
    context.stroke();
    if (calm) return;
    context.strokeStyle = WHITE;
    context.globalAlpha = 0.95 * (1 - u * 0.6);
    context.lineWidth = 2.6;
    context.beginPath();
    for (let k = 0; k < loops.length; k += 1) {
      const half = (lengths[k] / 2) * reach;
      const head = Math.min(half, lengths[k] * 0.08);
      traceLoop(context, loops[k], lengths[k], half - head, half);
      traceLoop(context, loops[k], lengths[k], -half, -half + head);
    }
    context.stroke();
    const w = clamp01(u / 0.6);
    if (ILLUSIONCULUM_ACCENT_GROUPS[g].bloom && glows[g] && w < 1) {
      context.fillStyle = glows[g] as CanvasGradient;
      context.globalAlpha = 0.34 * (1 - w) * (1 - w);
      const r = glowRadius[g];
      const cx = groupBox[g * 4];
      const cy = groupBox[g * 4 + 1];
      context.fillRect(cx - r, cy - r, r * 2, r * 2);
    }
  };

  /** The helmet closing: a slit of light across the visor (live frames). */
  const visor = flights.findIndex(([id]) => id === "helmet-visor");
  const drawVisor = (context: CanvasRenderingContext2D, p: number) => {
    if (visor < 0) return;
    const at = flights[visor][4];
    const u = (p - (at - 0.004)) / 0.02;
    if (u <= 0 || u >= 1) return;
    const open = easeOut(clamp01(u * 2.2));
    const cx = fBox[visor * 4];
    const cy = fBox[visor * 4 + 1] - fBox[visor * 4 + 3] * 0.32;
    const half = fBox[visor * 4 + 2] * 1.5 * open;
    context.fillStyle = WHITE;
    context.globalAlpha = 0.95 * (1 - u);
    context.fillRect(cx - half, cy - 1.5, half * 2, 3);
    context.fillStyle = TONE_CSS[0];
    context.globalAlpha = 0.4 * (1 - u);
    context.fillRect(cx - half * 0.7, cy - 7, half * 1.4, 14);
  };

  const drawSeal = (context: CanvasRenderingContext2D, p: number, calm: boolean) => {
    const at = ILLUSIONCULUM_ACCENT_BEATS.clamp;
    if (p < at || p > at + 0.09) return;
    const v = clamp01((p - at) / 0.09);
    // Every seam lit with the seal and fading (the build's afterglow).
    if (allLoops.length) {
      const fade = (1 - v) * (1 - v);
      context.strokeStyle = TONE_CSS[0];
      context.globalAlpha = 0.65 * fade;
      context.lineWidth = 1 + 2 * fade;
      context.beginPath();
      for (let k = 0; k < allLoops.length; k += 1) wholeLoop(context, allLoops[k]);
      context.stroke();
    }
    if (calm) return;
    const w = clamp01((p - at) / 0.035);
    if (w < 1 && glows[groupCount]) {
      // The seal's bloom, from the reactor: the one larger glow, once.
      context.fillStyle = glows[groupCount] as CanvasGradient;
      context.globalAlpha = 0.36 * Math.pow(1 - w, 1.6);
      const r = glowRadius[groupCount];
      context.fillRect(coreX - r, coreY - r, r * 2, r * 2);
    }
    // The shock ring through the whole body, out past the frame.
    const s = clamp01((p - at) / 0.05);
    if (s < 1) {
      const r = 30 + 820 * easeOut(s);
      context.strokeStyle = WHITE;
      context.globalAlpha = 0.85 * (1 - s);
      context.lineWidth = 2 + 5 * (1 - s);
      context.beginPath();
      context.ellipse(coreX, coreY, r, r * 0.9, 0, 0, TAU);
      context.stroke();
      context.strokeStyle = TONE_CSS[0];
      context.globalAlpha = 0.5 * (1 - s);
      context.lineWidth = 12 * (1 - s) + 1;
      context.beginPath();
      context.ellipse(coreX, coreY, r * 0.92, r * 0.83, 0, 0, TAU);
      context.stroke();
    }
  };

  // ---- The afterglow's embers and halo. ----
  const E = Math.max(0, options.budget.embers | 0);
  const EX = new Float32Array(E);
  const EY = new Float32Array(E);
  const ES = new Float32Array(E);
  const ED = new Float32Array(E);
  for (let e = 0; e < E; e += 1) {
    EX[e] = W * (0.18 + 0.64 * random());
    EY[e] = H * (0.12 + 0.82 * random());
    ES[e] = 1.2 + 2.4 * random();
    ED[e] = 0.03 * random();
  }
  const drawAfter = (context: CanvasRenderingContext2D, p: number, front: boolean) => {
    const from = ILLUSIONCULUM_ACCENT_BEATS.clamp + 0.01;
    const end = ILLUSIONCULUM_ACCENT_BEATS.end;
    if (p < from || p >= end) return;
    const out = clamp01((end - p) / 0.03);
    if (!front) {
      // The halo ring behind the figure, settling from wide to its place.
      const u = easeOut(clamp01((p - from) / 0.06));
      const r = W * (0.62 - 0.12 * u);
      context.strokeStyle = TONE_CSS[2];
      context.globalAlpha = 0.5 * u * out;
      context.lineWidth = 1.6;
      context.beginPath();
      context.ellipse(coreX, coreY - 30, r, r, 0, 0, TAU);
      context.stroke();
      context.strokeStyle = TONE_CSS[0];
      context.globalAlpha = 0.3 * u * out;
      context.lineWidth = 1;
      context.beginPath();
      context.ellipse(coreX, coreY - 30, r * 1.12, r * 1.12, 0, 0, TAU);
      context.stroke();
      return;
    }
    context.fillStyle = TONE_CSS[2];
    context.beginPath();
    let any = false;
    for (let e = 0; e < E; e += 1) {
      const u = clamp01((p - from - ED[e]) / 0.08);
      if (u <= 0 || u >= 1) continue;
      const s = ES[e] * (1 - u);
      const x = EX[e] + Math.sin(u * 6 + e) * 8;
      const y = EY[e] - 220 * u;
      context.rect(x - s / 2, y - s / 2, s, s);
      any = true;
    }
    if (any) {
      context.globalAlpha = 0.8 * out;
      context.fill();
    }
  };

  // ---- The camera: the framing, a shake at each contact, written once. ----
  const cameraFrame = new Float32Array(6);
  const lastCamera = new Float32Array(8).fill(Number.NaN);
  const SHAKE_HIT = 0.014;
  const shakeAt = (p: number, axis: number) => {
    let sum = 0;
    for (let f = 0; f < F; f += 1) {
      const t = p - flights[f][4];
      if (t < 0 || t >= SHAKE_HIT) continue;
      const u = t / SHAKE_HIT;
      const a = ILLUSIONCULUM_ACCENT_GROUPS[fGroup[f]].shake * (flights[f][11] ? 0.5 : 1);
      sum += a * (1 - u) * (1 - u) * Math.sin(u * Math.PI * (axis ? 5 : 4) + f * 1.3 + axis);
    }
    const t = p - ILLUSIONCULUM_ACCENT_BEATS.clamp;
    if (t >= 0 && t < 0.03) {
      const u = t / 0.03;
      sum += 10 * (1 - u) * (1 - u) * Math.sin(u * Math.PI * 5 + axis * 1.7);
    }
    return Math.max(-12, Math.min(12, sum));
  };
  const runCamera = (p: number, calm: boolean) => {
    const camera = options.camera;
    if (!camera) return;
    illusionculumCamera(p, camera.amount, cameraFrame);
    // A kick of scale at the seal (the camera takes the lock).
    const kick = p - ILLUSIONCULUM_ACCENT_BEATS.clamp;
    if (!calm && kick >= 0 && kick < 0.03)
      cameraFrame[4] *= 1 + 0.035 * camera.amount * (1 - kick / 0.03) ** 2;
    const sx = calm ? 0 : shakeAt(p, 0) * camera.amount;
    const sy = calm ? 0 : shakeAt(p, 1) * camera.amount;
    let same = sx === lastCamera[6] && sy === lastCamera[7];
    for (let k = 0; k < 6 && same; k += 1) same = cameraFrame[k] === lastCamera[k];
    if (same) return;
    for (let k = 0; k < 6; k += 1) lastCamera[k] = cameraFrame[k];
    lastCamera[6] = sx;
    lastCamera[7] = sy;
    camera.sink(cameraFrame, sx, sy);
  };

  return {
    back(context, progress, calm) {
      if (progress <= 0 || progress >= ILLUSIONCULUM_ACCENT_BEATS.end) return;
      context.globalCompositeOperation = "lighter";
      drawOmen(context, progress, false);
      if (N && progress < ILLUSIONCULUM_ACCENT_BEATS.end) drawMotes(context, progress, false);
      drawAfter(context, progress, false);
      context.globalAlpha = 1;
      context.globalCompositeOperation = "source-over";
      void calm;
    },
    front(context, progress, calm) {
      runCamera(progress, calm);
      if (progress <= 0 || progress >= ILLUSIONCULUM_ACCENT_BEATS.end) return;
      makeGlows(context);
      context.globalCompositeOperation = "lighter";
      drawOmen(context, progress, true);
      if (N) drawMotes(context, progress, true);
      if (!calm) {
        drawFlights(context, progress);
        drawHits(context, progress);
        drawVisor(context, progress);
      }
      for (let g = 0; g < groupCount; g += 1) drawPower(context, g, progress, calm);
      drawSeal(context, progress, calm);
      drawAfter(context, progress, true);
      context.globalAlpha = 1;
      context.globalCompositeOperation = "source-over";
    },
  };
}
