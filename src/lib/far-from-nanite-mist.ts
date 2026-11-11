/** FAR FROM SAGA — the armour dissolving into nanites (owner, 2026-11-11).
 *
 * The form change's first beat (far-from-form-shift.ts): the form on screen
 * is taken as a picture, cut into cells, and released cell by cell along a
 * front that leaves the reactor and crosses the body (broken by a slow
 * noise, so it reads as a material giving way, never a wipe). A cell about
 * to go lights up; as it goes it is cut from the picture and, where it was
 * armour, flies off as a nanite in its own colour — thrown outward, lifted,
 * turned by one curl field its neighbours share so the cloud moves as a
 * stream — shrinking and thinning to nothing: mist. Under it the scene
 * shows the undersuit, so the picture's body cells simply give way to it.
 *
 * `draw` is a closed form of the mist's clock `u` (0–1 over the dissolve,
 * on past 1 while the mist thins), apart from the cut picture, which is
 * cut forward only (a capture starts it over). Nothing is allocated in a
 * frame: typed arrays made at the capture, one path per colour and age
 * band; no shadows, no filters.
 */

export type FarFromMistInput = {
  readonly document: Document;
  readonly size: { readonly width: number; readonly height: number };
  /** Where the front starts (the reactor), figure px. */
  readonly core: readonly [number, number];
  /** Touch screens: larger cells, fewer nanites. */
  readonly coarse: boolean;
  /** The undersuit (figure-sized): its cells never fly. */
  readonly undersuit?: CanvasImageSource | null;
};

/** The dissolve's shape. Times are shares of the dissolve (`u`). */
export const FAR_FROM_MIST = Object.freeze({
  /** A cell's side in figure px, and the most nanites, by pointer. */
  cell: Object.freeze({ fine: 7, coarse: 9 }),
  budget: Object.freeze({ fine: 3400, coarse: 1700 }),
  /** The front leaves at `from` and has crossed the body by `to`. */
  from: 0.03,
  to: 0.7,
  /** The front's noise, and a cell's own jitter (shares of the crossing). */
  noise: 0.3,
  jitter: 0.07,
  /** A cell lights this long before it goes. */
  warn: 0.07,
  /** The flash as it goes. */
  flash: 0.05,
  /** A nanite's life, shortest and longest. */
  life: Object.freeze([0.34, 0.66] as const),
  /** Thrown outward and lifted (figure px), turned by the curl field. */
  throw: Object.freeze([14, 64] as const),
  lift: Object.freeze([18, 96] as const),
  curl: 46,
  /** Where the picture ends for good (every nanite gone). */
  end: 1.45,
});

type Matrix = { readonly a: number; readonly d: number; readonly e: number; readonly f: number };

export type FarFromMist = {
  /** Takes the picture: `source` (the scene's canvas) as drawn through
   * `matrix` (figure px → its px). False when it cannot be read. */
  capture(source: CanvasImageSource, matrix: Matrix): boolean;
  /** The dissolve at `u`, on a context in figure px; `px` figure px per
   * CSS px. */
  draw(context: CanvasRenderingContext2D, u: number, px: number): void;
  /** True between a capture and the mist's end. */
  readonly live: boolean;
  /** For tests: the nanites of the last capture. */
  readonly count: number;
  release(): void;
};

const clamp01 = (value: number) => (value < 0 ? 0 : value > 1 ? 1 : value);
const hash = (i: number, salt: number) => {
  let h = (Math.imul(i + 1, 0x9e3779b1) ^ Math.imul(salt + 7, 0x85ebca6b)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d) >>> 0;
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39) >>> 0;
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
};
/** A slow value noise over the body (period ~`scale` figure px), 0–1. */
const noise = (x: number, y: number, scale: number) => {
  const gx = x / scale;
  const gy = y / scale;
  const x0 = Math.floor(gx);
  const y0 = Math.floor(gy);
  const fx = gx - x0;
  const fy = gy - y0;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const at = (cx: number, cy: number) => hash(cx * 7919 + cy * 104729, 3);
  const top = at(x0, y0) + (at(x0 + 1, y0) - at(x0, y0)) * sx;
  const bottom = at(x0, y0 + 1) + (at(x0 + 1, y0 + 1) - at(x0, y0 + 1)) * sx;
  return top + (bottom - top) * sy;
};

/** The curl of a two-octave stream function at (x, y), drifting with `t`:
 * a divergence-free flow, so neighbours travel together and never bunch.
 * Writes [vx, vy] (about ±1.5) into `out`. */
export function farFromMistCurl(x: number, y: number, t: number, out: Float32Array | number[]) {
  const a = x * 0.0112 + t * 1.7;
  const b = y * 0.0096 - t * 1.1;
  const c = x * 0.027 - y * 0.011 + t * 2.3;
  const d = y * 0.031 + x * 0.008 - t * 1.9;
  // ψ = sin a · cos b + ½ sin c · cos d; v = (∂ψ/∂y, −∂ψ/∂x).
  const dy =
    -Math.sin(a) * Math.sin(b) * 0.0096 +
    0.5 * (Math.cos(c) * Math.cos(d) * -0.011 - Math.sin(c) * Math.sin(d) * 0.031);
  const dx =
    Math.cos(a) * Math.cos(b) * 0.0112 +
    0.5 * (Math.cos(c) * Math.cos(d) * 0.027 - Math.sin(c) * Math.sin(d) * 0.008);
  out[0] = dy * 62;
  out[1] = -dx * 62;
}

// The nanites' colours: the armour's own, lifted toward the ice, in a few
// levels a channel so each bucket is one path.
const LEVELS = 3;
const BUCKETS = LEVELS * LEVELS * LEVELS;
const BANDS = 3;
const BAND_ALPHA = [0.95, 0.62, 0.3];
const WHITE = "rgb(244 251 255)";
const ICE = "rgb(150 236 255)";

export function createFarFromMist(input: FarFromMistInput): FarFromMist | null {
  const { document } = input;
  const W = input.size.width;
  const H = input.size.height;
  const cell = input.coarse ? FAR_FROM_MIST.cell.coarse : FAR_FROM_MIST.cell.fine;
  const budget = input.coarse ? FAR_FROM_MIST.budget.coarse : FAR_FROM_MIST.budget.fine;
  const cols = Math.ceil(W / cell);
  const rows = Math.ceil(H / cell);
  const total = cols * rows;
  const make = (width: number, height: number) =>
    Object.assign(document.createElement("canvas"), { width, height });
  // The picture (figure px at `k`), and the two cell-sized samples.
  let rest: HTMLCanvasElement | null = null;
  let restContext: CanvasRenderingContext2D | null = null;
  let k = 1;
  const probe = make(cols, rows);
  const probeContext = probe.getContext("2d", { willReadFrequently: true });
  if (!probeContext) return null;
  let under: Uint8ClampedArray | null = null;
  const sampleUnder = () => {
    if (under || !input.undersuit) return;
    try {
      probeContext.clearRect(0, 0, cols, rows);
      probeContext.drawImage(input.undersuit, 0, 0, cols, rows);
      under = new Uint8ClampedArray(probeContext.getImageData(0, 0, cols, rows).data);
    } catch {
      under = null;
    }
  };
  sampleUnder();

  // Every solid cell, in the order it goes: its place and when.
  const order = new Uint32Array(total);
  const cellAt = new Float32Array(total);
  let cells = 0;
  let cut = 0;
  // The nanites (armour cells within the budget), sorted by colour bucket.
  const px0 = new Float32Array(budget);
  const py0 = new Float32Array(budget);
  const born = new Float32Array(budget);
  const life = new Float32Array(budget);
  const dirX = new Float32Array(budget);
  const dirY = new Float32Array(budget);
  const turn = new Float32Array(budget);
  const bucketOf = new Uint8Array(budget);
  const bucketStart = new Uint16Array(BUCKETS + 1);
  const bucketStyle: string[] = Array.from({ length: BUCKETS }, () => WHITE);
  let count = 0;
  let live = false;
  const curl = new Float32Array(2);
  const [coreX, coreY] = input.core;
  const far = Math.max(
    Math.hypot(coreX, coreY),
    Math.hypot(W - coreX, coreY),
    Math.hypot(coreX, H - coreY),
    Math.hypot(W - coreX, H - coreY),
  );

  const capture = (source: CanvasImageSource, matrix: Matrix) => {
    live = false;
    const scale = Math.abs(matrix.a) || 1;
    k = Math.min(1, Math.max(0.35, scale));
    const width = Math.max(1, Math.round(W * k));
    const height = Math.max(1, Math.round(H * k));
    if (!rest) {
      rest = make(width, height);
      restContext = rest.getContext("2d");
    } else if (rest.width !== width || rest.height !== height) {
      rest.width = width;
      rest.height = height;
    }
    if (!restContext) return false;
    let data: Uint8ClampedArray;
    try {
      // The scene's canvas back into figure px.
      const f = k / scale;
      restContext.setTransform(f, 0, 0, f, -matrix.e * f, -matrix.f * f);
      restContext.globalCompositeOperation = "copy";
      restContext.drawImage(source, 0, 0);
      restContext.globalCompositeOperation = "source-over";
      restContext.setTransform(1, 0, 0, 1, 0, 0);
      probeContext.clearRect(0, 0, cols, rows);
      probeContext.drawImage(rest, 0, 0, cols, rows);
      data = probeContext.getImageData(0, 0, cols, rows).data;
    } catch {
      return false;
    }
    // Pass 1: the solid cells and when each goes; how many are armour.
    const span = FAR_FROM_MIST.to - FAR_FROM_MIST.from;
    const norm = 1 + FAR_FROM_MIST.noise + FAR_FROM_MIST.jitter;
    cells = 0;
    let armour = 0;
    for (let i = 0; i < total; i += 1) {
      cellAt[i] = -1;
      if (data[i * 4 + 3] < 36) continue;
      const cx = ((i % cols) + 0.5) * cell;
      const cy = (Math.floor(i / cols) + 0.5) * cell;
      const key =
        (Math.hypot(cx - coreX, (cy - coreY) * 0.82) / far +
          FAR_FROM_MIST.noise * noise(cx, cy, 86) +
          FAR_FROM_MIST.jitter * hash(i, 11)) /
        norm;
      cellAt[i] = FAR_FROM_MIST.from + span * key;
      order[cells++] = i;
      if (isArmour(data, i)) armour += 1;
    }
    if (!cells) return false;
    // (Sorted by when they go: the cut walks this once.)
    const sorted = Array.from(order.subarray(0, cells)).sort((p, q) => cellAt[p] - cellAt[q]);
    order.set(sorted);
    cut = 0;
    // Pass 2: the nanites, an even share of the armour's cells.
    const keep = armour > budget ? budget / armour : 1;
    const picks: number[] = [];
    for (let n = 0; n < cells; n += 1) {
      const i = sorted[n];
      if (!isArmour(data, i) || (keep < 1 && hash(i, 23) >= keep)) continue;
      if (picks.length >= budget) break;
      picks.push(i);
    }
    const bucket = (i: number) => {
      const level = (v: number) => Math.min(LEVELS - 1, Math.floor((v / 256) * LEVELS));
      return (
        (level(data[i * 4]) * LEVELS + level(data[i * 4 + 1])) * LEVELS + level(data[i * 4 + 2])
      );
    };
    picks.sort((p, q) => bucket(p) - bucket(q));
    bucketStart.fill(0);
    count = picks.length;
    for (let n = 0; n < count; n += 1) {
      const i = picks[n];
      const b = bucket(i);
      bucketOf[n] = b;
      bucketStart[b + 1] = n + 1;
      const cx = ((i % cols) + 0.5) * cell;
      const cy = (Math.floor(i / cols) + 0.5) * cell;
      px0[n] = cx;
      py0[n] = cy;
      born[n] = cellAt[i];
      const [l0, l1] = FAR_FROM_MIST.life;
      life[n] = l0 + (l1 - l0) * hash(i, 31);
      // Thrown away from the reactor, spread a little, and lifted.
      const away = Math.atan2(cy - coreY, cx - coreX) + (hash(i, 41) - 0.5) * 1.5;
      const [t0, t1] = FAR_FROM_MIST.throw;
      const reach = t0 + (t1 - t0) * hash(i, 43) ** 1.6;
      const [f0, f1] = FAR_FROM_MIST.lift;
      dirX[n] = Math.cos(away) * reach;
      dirY[n] = Math.sin(away) * reach * 0.7 - (f0 + (f1 - f0) * hash(i, 47));
      turn[n] = 0.55 + 0.9 * hash(i, 53);
    }
    for (let b = 1; b <= BUCKETS; b += 1)
      if (bucketStart[b] < bucketStart[b - 1]) bucketStart[b] = bucketStart[b - 1];
    // Each bucket's colour: its middle, lifted toward the ice.
    for (let b = 0; b < BUCKETS; b += 1) {
      const mid = (level: number) => ((level + 0.5) / LEVELS) * 255;
      const r = mid(Math.floor(b / (LEVELS * LEVELS)));
      const g = mid(Math.floor(b / LEVELS) % LEVELS);
      const bl = mid(b % LEVELS);
      const lift = (v: number, to: number) => Math.round(v + (to - v) * 0.38);
      bucketStyle[b] = `rgb(${lift(r, 190)} ${lift(g, 240)} ${lift(bl, 255)})`;
    }
    live = true;
    return true;
  };
  // A cell is armour where the picture differs from the undersuit under it.
  function isArmour(data: Uint8ClampedArray, i: number) {
    if (!under) return true;
    const o = i * 4;
    if (under[o + 3] < 36) return true;
    const d =
      Math.abs(data[o] - under[o]) +
      Math.abs(data[o + 1] - under[o + 1]) +
      Math.abs(data[o + 2] - under[o + 2]);
    return d > 54;
  }

  /* -- draw passes: allocation-free from here -- */

  const draw = (context: CanvasRenderingContext2D, u: number, px: number) => {
    if (!live || !rest || !restContext) return;
    if (u >= FAR_FROM_MIST.end) {
      live = false;
      return;
    }
    // The cut: every cell whose time has come leaves the picture, once.
    if (cut < cells) {
      const size = cell * k;
      while (cut < cells && cellAt[order[cut]] <= u) {
        const i = order[cut++];
        restContext.clearRect((i % cols) * size - 0.5, Math.floor(i / cols) * size - 0.5, size + 1, size + 1);
      }
    }
    context.globalCompositeOperation = "source-over";
    context.globalAlpha = 1;
    if (cut < cells) context.drawImage(rest, 0, 0, W, H);
    context.globalCompositeOperation = "lighter";
    // The front: cells about to go light up; those just gone flash.
    if (cut < cells) {
      context.beginPath();
      for (let n = cut; n < cells; n += 1) {
        const i = order[n];
        if (cellAt[i] - u > FAR_FROM_MIST.warn) break;
        const lead = 1 - (cellAt[i] - u) / FAR_FROM_MIST.warn;
        const s = cell * (0.35 + 0.65 * lead);
        context.rect((i % cols) * cell + (cell - s) / 2, Math.floor(i / cols) * cell + (cell - s) / 2, s, s);
      }
      context.globalAlpha = 0.5;
      context.fillStyle = ICE;
      context.fill();
    }
    context.beginPath();
    for (let n = cut - 1; n >= 0; n -= 1) {
      const i = order[n];
      const age = (u - cellAt[i]) / FAR_FROM_MIST.flash;
      if (age >= 1) break;
      const s = cell * (0.95 - 0.6 * age);
      context.rect((i % cols) * cell + (cell - s) / 2, Math.floor(i / cols) * cell + (cell - s) / 2, s, s);
    }
    context.globalAlpha = 0.6;
    context.fillStyle = WHITE;
    context.fill();
    // The nanites: by age band (young ones add light), one path a colour.
    const mote = Math.max(0.9 * px, 0.9);
    for (let band = 0; band < BANDS; band += 1) {
      context.globalCompositeOperation = band === 0 ? "lighter" : "source-over";
      context.globalAlpha = BAND_ALPHA[band];
      for (let b = 0; b < BUCKETS; b += 1) {
        const from = bucketStart[b];
        const to = bucketStart[b + 1];
        if (to <= from) continue;
        let any = false;
        for (let n = from; n < to; n += 1) {
          const age = (u - born[n]) / life[n];
          if (age < 0 || age >= 1 || Math.min(BANDS - 1, Math.floor(age * BANDS)) !== band) continue;
          // Ease out of the armour: quick away, then a slow drift.
          const e = 1 - (1 - age) * (1 - age) * (1 - age);
          const x = px0[n] + dirX[n] * e;
          const y = py0[n] + dirY[n] * e;
          farFromMistCurl(x, y, u * turn[n], curl);
          const swirl = FAR_FROM_MIST.curl * age * turn[n];
          const fx = x + curl[0] * swirl;
          const fy = y + curl[1] * swirl;
          const s = Math.max(mote, cell * (0.92 - 0.8 * age));
          if (!any) {
            context.beginPath();
            any = true;
          }
          context.rect(fx - s / 2, fy - s / 2, s, s);
          // Its dust: a finer mote trailing on the same stream.
          const lag = age * 0.8;
          const le = 1 - (1 - lag) * (1 - lag) * (1 - lag);
          const d = mote * 1.25;
          context.rect(
            px0[n] + dirX[n] * le * 1.25 - curl[1] * swirl * 0.7 - d / 2,
            py0[n] + dirY[n] * le * 1.25 + curl[0] * swirl * 0.7 - d / 2,
            d,
            d,
          );
        }
        if (any) {
          context.fillStyle = bucketStyle[b];
          context.fill();
        }
      }
    }
    context.globalCompositeOperation = "source-over";
    context.globalAlpha = 1;
  };

  /* -- end of the draw passes -- */

  return {
    capture,
    draw,
    get live() {
      return live;
    },
    get count() {
      return count;
    },
    release() {
      live = false;
      if (rest) rest.width = rest.height = 0;
      probe.width = probe.height = 0;
      rest = null;
      restContext = null;
    },
  };
}

/** The finished form's flash (the change's last beat), on a context in
 * figure px over the finished figure: `canvas` (the scene's own, already
 * drawn) lit over itself, a ring leaving the reactor and a line of light
 * crossing the body, all easing out. `s` 0–1. */
export function drawFarFromSettle(
  context: CanvasRenderingContext2D,
  canvas: CanvasImageSource,
  s: number,
  size: { readonly width: number; readonly height: number },
  core: readonly [number, number],
  tone: string,
  px: number,
) {
  if (s < 0 || s >= 1) return;
  const out = 1 - (1 - s) * (1 - s) * (1 - s);
  const flash = (1 - s) * (1 - s);
  context.globalCompositeOperation = "lighter";
  // The armour itself, brighter for a moment.
  const matrix = context.getTransform();
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.globalAlpha = 0.5 * flash * clamp01(s / 0.08 + 0.35);
  context.drawImage(canvas, 0, 0);
  context.setTransform(matrix);
  // The ring from the reactor.
  const radius = 26 + size.height * 0.62 * out;
  context.beginPath();
  context.ellipse(core[0], core[1], radius, radius * 0.94, 0, 0, Math.PI * 2);
  context.strokeStyle = tone;
  context.globalAlpha = 0.16 * flash;
  context.lineWidth = 14 * px;
  context.stroke();
  context.globalAlpha = 0.85 * flash;
  context.lineWidth = 1.4 * px;
  context.stroke();
  // The line of light, crown to soles.
  const y = size.height * (0.04 + 0.96 * out);
  context.fillStyle = WHITE;
  context.globalAlpha = 0.5 * flash;
  context.fillRect(size.width * 0.08, y - 0.8 * px, size.width * 0.84, 1.6 * px);
  context.globalAlpha = 0.1 * flash;
  context.fillRect(size.width * 0.08, y - 16 * px, size.width * 0.84, 16 * px);
  context.globalCompositeOperation = "source-over";
  context.globalAlpha = 1;
}
