/** The nanite skin (owner, 2026-11-11: 「ナノマシン感が全くない」, then: the
 * suit-up as smooth and as fine as a nanotech suit growing over a body from
 * one housing on the chest).
 *
 * The armour is never laid as tiles. One front leaves the reactor and runs
 * over the body as a liquid — along the body, round the gaps between limb
 * and trunk, never across them — and behind it the surface resolves in four
 * bands, each a few hundredths of the suit-up wide:
 *
 *   lip      a bright, specular bead: the nanites' leading edge, its rim
 *            frayed below a pixel by the grain (the liquid wetting the body);
 *   liquid   dark chrome whose micro-grain streaks the way it flows,
 *            density waves running through it;
 *   settle   the chrome settling into the armour's own colours along one
 *            soft, ragged crystallisation front — no cells, no tiles: real
 *            nanomachines are ~100 nm, far below a pixel, so only their
 *            collective shows (owner, 2026-11-21: 「実際のナノマシンと同程度の
 *            大きさにして」);
 *   armour   the finished art, the grain's sheen lingering, then gone.
 *
 * Veins race ahead of the front along the limbs; droplets skim ahead of the
 * lip and are taken back into the surface (matter is conserved: nothing
 * flies off). The helmet is last: it rises from the neck and closes over
 * the face.
 *
 * How it stays cheap. Everything spatial is baked once, on a grid of
 * `NANITE_SKIN.grid` figure px: the geodesic distance from the reactor
 * (Dijkstra over the body's silhouette; air costs more), turned into each
 * pixel's time; its moment to settle; the grain; its sheen. The pixels are
 * sorted by time, so a frame touches only the pixels inside the bands
 * (a binary search, a short loop) and writes five small alpha masks; the
 * rest is a dozen `drawImage`s, each over the bands' box only. Nothing is
 * allocated in a frame; no filters, no shadows, no read-backs.
 *
 * A closed form of the progress: forward, back and at rest draw the same
 * moment. The same front, on a field over the whole frame, draws a change of
 * form (`form`) and takes the armour back to the reactor (`retract`).
 *
 * The scene's canvas is a 2D one and this layer sits between its other
 * draws, so it is drawn with 2D compositing (a GL layer would need a copy
 * into that canvas every frame).
 */


export type NaniteSkinStyle = {
  readonly alloy?: "far-from" | "illusionculum" | "meta-unitas";
  /** The liquid's body: laid over the art (CSS colour) at `steelAlpha`. */
  readonly steel: string;
  readonly steelAlpha: number;
  /** The grain's sheen in the liquid (it was the cells' lines). */
  readonly line: string;
  /** The lip's and the flashes' light, and the droplets' tones (dim metal,
   * the page's accent, white). */
  readonly glint: readonly [number, number, number];
  readonly motes: readonly [string, string, string];
  /** The micro-grain's streak along the flow: half its length, figure px
   * (nano pass, 2026-11-21; it was the cells' radius). */
  readonly streak: number;
  /** Crystalline grain: three families of streaks crossing at 60°, the
   * average look of a triangular lattice far below a pixel (FAR FROM's
   * wireframe, at nanite scale); otherwise one family, along the flow. */
  readonly triangles: boolean;
};

export type NaniteSkinTile = {
  readonly sx: number;
  readonly sy: number;
  readonly tw?: number;
  readonly th?: number;
  readonly beat?: number;
  readonly pieceId: string | null;
};

/** When each part of the body is whole, in the scene's progress. */
export type NaniteSkinTimeline = {
  /** The body: the front leaves the reactor at `body[0]`; the k-th group of
   * `order` is whole at `body[k + 1]`. */
  readonly body: readonly number[];
  /** The plan's beats in the order the front reaches them (chest, waist,
   * arms, legs). */
  readonly order: readonly number[];
  /** Parts off the body (the plan's beat `ornamentBeat`). */
  readonly ornaments: readonly [number, number];
  readonly ornamentBeat: number;
  /** The helmet (the plan's beat `helmBeat`). */
  readonly helm: readonly [number, number];
  readonly helmBeat: number;
};

export type NaniteSkinInput = {
  readonly document: Document;
  readonly size: { readonly width: number; readonly height: number };
  readonly tiles: readonly NaniteSkinTile[];
  /** The plan's tile, figure px. */
  readonly tile: number;
  readonly core: readonly [number, number];
  readonly visor: readonly [number, number];
  readonly coarse: boolean;
  /** The armour's art (the finished figure, its lights held back). */
  readonly art: CanvasImageSource;
  readonly style: NaniteSkinStyle;
  readonly timeline: NaniteSkinTimeline;
  readonly prepareFlow?: PrepareNaniteFlow;
  /** The clock for the governor (ms); none in tests. */
  readonly now?: () => number;
};

type NaniteFlow = {
  /** Null lets the skin draw its usual droplets for a missing route. */
  draw(
    context: CanvasRenderingContext2D,
    time: number,
    level: number,
    vs: number,
    ratio: number,
    form?: string,
    tone?: string,
  ): number | null;
  release(): void;
};

type PrepareNaniteFlow = (field: {
  readonly width: number;
  readonly height: number;
  readonly grid: number;
  readonly coarse: boolean;
  readonly base: Float32Array;
  readonly change: Float32Array;
}) => Generator<undefined, NaniteFlow | null, unknown>;

/** The skin's shape. Times are shares of the scene's progress. */
export const NANITE_SKIN = Object.freeze({
  /** Figure px per pixel of the baked field. */
  grid: 2,
  /** A step through air costs this many steps along the body. */
  air: 3.2,
  /** The front's edge: two octaves of noise (period in figure px, time). */
  noise: Object.freeze([
    Object.freeze([74, 0.014] as const),
    Object.freeze([19, 0.005] as const),
  ] as const),
  /** Veins: how many, how far ahead of the front they run, their width in
   * field pixels, and the share of a vein over which the lead builds. */
  vein: Object.freeze({ count: 6, lead: 0.03, taper: 0.22 }),
  /** The time field's smoothing: passes of a 3×3 average, and the most two
   * neighbours' times may differ and still be averaged (nanosuit pass,
   * 2026-11-20). */
  smooth: Object.freeze({ passes: 3, tol: 0.012 }),
  /** Where in `click` each field pixel settles: 0.5 plus three octaves of
   * smooth noise ([period figure px, amplitude]). No per-unit hash: the
   * settle is one continuous front. The amplitudes fall with the period so
   * the noise's slope (≈ 3·amp/period per figure px, times `click`) stays
   * under the front's own time gradient (~5e-4 per figure px): the settle
   * front never breaks into islands that would pop in like cells (nano
   * pass, 2026-11-21). The sum stays inside [0, 1]: no pixel settles later
   * than lag + click (the seal pins). */
  seat: Object.freeze([
    Object.freeze([90, 0.12] as const),
    Object.freeze([34, 0.04] as const),
    Object.freeze([13, 0.012] as const),
  ] as const),
  front: Object.freeze({
    /** The liquid's edge (it is whole this long after the front). */
    soft: 0.004,
    /** The lip's bead. */
    lip: 0.0048,
    /** A cell clicks between `lag` and `lag + click` after the front… */
    // (Nanosuit pass, 2026-11-20: the click eases over a longer `pop`, its
    // lag shorter by as much, so lag + click + pop — the helmet's close —
    // is unchanged.)
    lag: 0.0235,
    click: 0.034,
    /** …in `pop`, its flash fading over `flash`; its lines rise over `rise`
     * before it and linger `grain` after. */
    pop: 0.006,
    flash: 0.009,
    rise: 0.008,
    grain: 0.042,
    /** A droplet's flight ahead of the lip. */
    lead: 0.026,
    /** The liquid's ripple: waves per unit time of the field, and how much
     * faster than the front they run. */
    // (Nanosuit pass, 2026-11-20: 520 waves ran about 2.5 field px apart —
    // the field's limit — and at 1.7× the front they strobed between frames
    // of a scroll. Now ~4 px apart, drifting gently past the front.)
    ripple: 300,
    rippleRun: 1.15,
  }),
  /** The same bands on the field over the whole frame (0–1 of a change). */
  change: Object.freeze({
    soft: 0.014,
    lip: 0.016,
    lag: 0.05,
    click: 0.11,
    pop: 0.012,
    flash: 0.03,
    rise: 0.04,
    grain: 0.12,
    lead: 0.08,
    ripple: 150,
    rippleRun: 1.3,
  }),
  /** The helmet's share of the change's field (it is last, as in the
   * suit-up; first to go in a retract). */
  changeHelm: 0.2,
  /** Droplets in the air at once, by pointer (the surface carries the look). */
  live: Object.freeze({ fine: 600, coarse: 250 }),
  /** The governor's levels: the share of the droplets drawn, and whether the
   * liquid ripples. It steps down when `slowFrames` frames in a row take
   * more than `slowMs`, up when `fastFrames` take less than `fastMs`. */
  levels: Object.freeze([
    Object.freeze({ motes: 1, ripple: true }),
    Object.freeze({ motes: 0.6, ripple: true }),
    Object.freeze({ motes: 0.36, ripple: false }),
  ]),
  governor: Object.freeze({ slowMs: 7, fastMs: 3, slowFrames: 6, fastFrames: 48 }),
});

export type NaniteFrontTiming = typeof NANITE_SKIN.front | typeof NANITE_SKIN.change;

/** Smooths a time field in place (nanosuit pass, 2026-11-20: 「さらに細かく
 * 滑らかに」). An 8-connected Dijkstra leaves octagonal facets and kinks in
 * the front, and the veins left needle-thin spikes; a few passes of a 3×3
 * average turn them into one continuous curved sheet. Only neighbours of the
 * same `key` whose times are within `tol` are averaged, so time never leaks
 * across a gap between limb and trunk, or between the helmet and the body,
 * and the average is convex: no pixel ends later than the latest it had (the
 * seal timings hold). NaN pixels stay NaN. */
export function* naniteSmoothField(
  field: Float32Array,
  key: Uint8Array | null,
  gw: number,
  gh: number,
  passes: number,
  tol: number,
): Generator<undefined, void, unknown> {
  const n = gw * gh;
  const next = new Float32Array(n);
  for (let pass = 0; pass < passes; pass += 1) {
    for (let y = 0; y < gh; y += 1) {
      for (let x = 0; x < gw; x += 1) {
        const i = y * gw + x;
        const own = field[i];
        if (own !== own) {
          next[i] = own;
          continue;
        }
        const k = key ? key[i] : 0;
        let sum = 0;
        let count = 0;
        for (let dy = -1; dy <= 1; dy += 1) {
          const ny = y + dy;
          if (ny < 0 || ny >= gh) continue;
          for (let dx = -1; dx <= 1; dx += 1) {
            const nx = x + dx;
            if (nx < 0 || nx >= gw) continue;
            const j = ny * gw + nx;
            const value = field[j];
            if (value !== value || (key && key[j] !== k)) continue;
            if (value - own > tol || own - value > tol) continue;
            sum += value;
            count += 1;
          }
        }
        next[i] = sum / count;
      }
      if (y % 64 === 63) yield;
    }
    field.set(next);
  }
}

const clamp01 = (value: number) => (value < 0 ? 0 : value > 1 ? 1 : value);
const hash = (i: number, salt: number) => {
  let h = (Math.imul(i + 1, 0x9e3779b1) ^ Math.imul(salt + 7, 0x85ebca6b)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d) >>> 0;
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39) >>> 0;
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
};
const valueNoise = (x: number, y: number, scale: number, salt: number) => {
  const gx = x / scale;
  const gy = y / scale;
  const x0 = Math.floor(gx);
  const y0 = Math.floor(gy);
  const fx = gx - x0;
  const fy = gy - y0;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const at = (cx: number, cy: number) => hash(cx * 7919 + cy * 104729, salt);
  const top = at(x0, y0) + (at(x0 + 1, y0) - at(x0, y0)) * sx;
  const bottom = at(x0, y0 + 1) + (at(x0 + 1, y0 + 1) - at(x0, y0 + 1)) * sx;
  return top + (bottom - top) * sy;
};

/** Each alloy's own grain (nano pass, 2026-11-21): the same surface,
 * a different cast — the noise's salt. */
const ALLOY_SALT = Object.freeze({ "far-from": 101, illusionculum: 211, "meta-unitas": 307 });

/* ------------------------------------------------------------------ */
/* The governor                                                        */
/* ------------------------------------------------------------------ */

export type NaniteGovernor = {
  /** 0 the whole look … `levels − 1` the leanest. */
  readonly level: number;
  /** A frame's cost (ms). Returns the level. */
  feed(ms: number): number;
};

/** Steps the quality down on a run of slow frames and back up on a long run
 * of quick ones — never frame by frame (that would flicker). */
export function createNaniteGovernor(
  levels: number = NANITE_SKIN.levels.length,
  tuning: typeof NANITE_SKIN.governor = NANITE_SKIN.governor,
): NaniteGovernor {
  let level = 0;
  let slow = 0;
  let fast = 0;
  return {
    get level() {
      return level;
    },
    feed(ms) {
      if (!Number.isFinite(ms)) return level;
      if (ms > tuning.slowMs) {
        slow += 1;
        fast = 0;
        if (slow >= tuning.slowFrames && level < levels - 1) {
          level += 1;
          slow = 0;
        }
      } else if (ms < tuning.fastMs) {
        fast += 1;
        slow = 0;
        if (fast >= tuning.fastFrames && level > 0) {
          level -= 1;
          fast = 0;
        }
      } else {
        slow = 0;
        fast = 0;
      }
      return level;
    },
  };
}

/** The droplets in the air at once, by pointer and the governor's level:
 * the surface carries the look, so this never needs to be large — and it
 * never falls to nothing. */
export function naniteLiveBudget(coarse: boolean, level = 0): number {
  const base = coarse ? NANITE_SKIN.live.coarse : NANITE_SKIN.live.fine;
  const step = NANITE_SKIN.levels[Math.min(NANITE_SKIN.levels.length - 1, Math.max(0, level))];
  return Math.round(base * step.motes);
}

/* ------------------------------------------------------------------ */
/* The field                                                           */
/* ------------------------------------------------------------------ */

/** The geodesic distance from `seed` over a `gw` × `gh` grid (steps of 1
 * and √2; a step onto a cell that is not `body` costs `air` times as much),
 * with each cell's parent on its shortest path. A generator: it yields
 * between slices of work. */
export function* naniteGeodesicSteps(
  body: Uint8Array,
  gw: number,
  gh: number,
  seed: number,
  air: number = NANITE_SKIN.air,
): Generator<undefined, { dist: Float32Array; parent: Int32Array }, unknown> {
  const n = gw * gh;
  const dist = new Float32Array(n).fill(Infinity);
  const parent = new Int32Array(n).fill(-1);
  // A binary heap of (distance, cell); stale entries are skipped.
  let cap = 1 << 16;
  let heapD = new Float32Array(cap);
  let heapI = new Int32Array(cap);
  let size = 0;
  const push = (d: number, i: number) => {
    if (size === cap) {
      cap *= 2;
      const nd = new Float32Array(cap);
      nd.set(heapD);
      heapD = nd;
      const ni = new Int32Array(cap);
      ni.set(heapI);
      heapI = ni;
    }
    let at = size++;
    while (at > 0) {
      const up = (at - 1) >> 1;
      if (heapD[up] <= d) break;
      heapD[at] = heapD[up];
      heapI[at] = heapI[up];
      at = up;
    }
    heapD[at] = d;
    heapI[at] = i;
  };
  const start = Math.min(n - 1, Math.max(0, seed));
  dist[start] = 0;
  push(0, start);
  let work = 0;
  const DX = [1, -1, 0, 0, 1, 1, -1, -1];
  const DY = [0, 0, 1, -1, 1, -1, 1, -1];
  while (size > 0) {
    const d = heapD[0];
    const i = heapI[0];
    size -= 1;
    if (size > 0) {
      const ld = heapD[size];
      const li = heapI[size];
      let at = 0;
      for (;;) {
        let child = at * 2 + 1;
        if (child >= size) break;
        if (child + 1 < size && heapD[child + 1] < heapD[child]) child += 1;
        if (heapD[child] >= ld) break;
        heapD[at] = heapD[child];
        heapI[at] = heapI[child];
        at = child;
      }
      heapD[at] = ld;
      heapI[at] = li;
    }
    if (d > dist[i]) continue;
    const x = i % gw;
    const y = (i - x) / gw;
    for (let k = 0; k < 8; k += 1) {
      const nx = x + DX[k];
      const ny = y + DY[k];
      if (nx < 0 || ny < 0 || nx >= gw || ny >= gh) continue;
      const j = ny * gw + nx;
      // (In the stored precision: a wider sum would "improve" a cell on
      // its own rounding, over and over.)
      const nd = Math.fround(d + (k < 4 ? 1 : Math.SQRT2) * (body[j] ? 1 : air));
      if (nd < dist[j]) {
        dist[j] = nd;
        parent[j] = i;
        push(nd, j);
      }
    }
    if (++work % 4000 === 0) yield;
  }
  return { dist, parent };
}

/** The knots of the body's time over its distance: the front leaves at
 * `times[0]` and the k-th group (its farthest distance `reach[k]`, NaN when
 * it has no pixels) is whole at `times[k + 1]`. A group already covered by
 * the ones before it gets no knot of its own — the front never stands still
 * for a beat. Returns [distance, time] pairs, both ascending. */
export function naniteBodyKnots(
  reach: readonly number[],
  times: readonly number[],
): [number, number][] {
  const knots: [number, number][] = [[0, times[0]]];
  const last = Math.max(0, ...reach.filter((value) => Number.isFinite(value)));
  const least = last * 0.04;
  for (let k = 0; k < reach.length; k += 1) {
    const d = reach[k];
    if (!Number.isFinite(d)) continue;
    const top = knots[knots.length - 1];
    if (d <= top[0] + least) {
      // Covered already: it is whole when the one before it is, or (the
      // last of all) at the body's end.
      continue;
    }
    knots.push([d, times[k + 1]]);
  }
  const top = knots[knots.length - 1];
  // The body ends on its last time, whatever the last group was.
  if (knots.length > 1) top[1] = times[times.length - 1];
  else knots.push([Math.max(1, last), times[times.length - 1]]);
  return knots;
}

/** The time at distance `d` on `knots` (piecewise linear, clamped). */
export function naniteKnotTime(knots: readonly (readonly [number, number])[], d: number): number {
  if (d <= knots[0][0]) return knots[0][1];
  for (let k = 1; k < knots.length; k += 1) {
    if (d <= knots[k][0]) {
      const [d0, t0] = knots[k - 1];
      const [d1, t1] = knots[k];
      return t0 + ((t1 - t0) * (d - d0)) / Math.max(1e-6, d1 - d0);
    }
  }
  return knots[knots.length - 1][1];
}

/** A front: its pixels sorted by time, each with its cell's own time, and
 * its droplets. */
type Front = {
  readonly timing: NaniteFrontTiming;
  readonly count: number;
  readonly idx: Uint32Array;
  readonly t: Float32Array;
  readonly th: Float32Array;
  readonly back: number;
  readonly ahead: number;
  /** The box of all its pixels (field px). */
  readonly box: readonly [number, number, number, number];
  readonly first: number;
  readonly last: number;
  /** Droplets, sorted by time: home, where the front was `lead` before,
   * seed. */
  readonly motes: number;
  readonly mt: Float32Array;
  readonly mx: Float32Array;
  readonly my: Float32Array;
  readonly mfx: Float32Array;
  readonly mfy: Float32Array;
  readonly ms: Float32Array;
};

export type NaniteSkinLayer = {
  /** The armour at `progress`, on a context in figure px (`vs` device px
   * per figure px, `ratio` device px per CSS px). */
  draw(context: CanvasRenderingContext2D, progress: number, calm: boolean, vs: number, ratio: number): void;
  /** One change of form: `from` taken over by `to` from the reactor out at
   * `u` (0–1). */
  form(
    context: CanvasRenderingContext2D,
    from: CanvasImageSource,
    to: CanvasImageSource,
    fromKey: string,
    toKey: string,
    u: number,
    tone: string,
    calm: boolean,
    vs: number,
    ratio: number,
  ): boolean;
  /** Takes `source` (the scene's canvas, drawn through device px per figure
   * px `vs` from the origin `vx`, `vy`) as the picture `retract` draws. */
  hold(source: CanvasImageSource, vs: number, vx: number, vy: number): boolean;
  /** The held picture flowing back into the reactor at `u` (0 whole … 1
   * gone). */
  retract(context: CanvasRenderingContext2D, u: number, vs: number, ratio: number): void;
  release(): void;
  /** For tests and tuning. */
  readonly level: number;
  readonly stats: {
    readonly pixels: number;
    readonly motes: number;
    band: number;
    drawn: number;
    ms: number;
  };
  /** The time each field pixel is reached (NaN off the armour), row-major
   * on the `width` × `height` grid. */
  readonly field: { readonly width: number; readonly height: number; readonly time: Float32Array };
};

const lowerBound = (values: Float32Array, count: number, value: number) => {
  let lo = 0;
  let hi = count;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (values[mid] < value) lo = mid + 1;
    else hi = mid;
  }
  return lo;
};

const sourceSize = (source: CanvasImageSource): [number, number] => {
  const image = source as { naturalWidth?: number; naturalHeight?: number; width?: number; height?: number };
  const width = image.naturalWidth || (typeof image.width === "number" ? image.width : 0);
  const height = image.naturalHeight || (typeof image.height === "number" ? image.height : 0);
  return [width, height];
};

/**
 * Prepares the skin: the field, the fronts, the baked layers. A generator
 * for the scene's idle slices; null when nothing can be drawn.
 */
export function* prepareNaniteSkin(
  input: NaniteSkinInput,
): Generator<undefined, NaniteSkinLayer | null, unknown> {
  const { document, style, timeline } = input;
  const W = input.size.width;
  const H = input.size.height;
  const S = NANITE_SKIN.grid;
  const gw = Math.ceil(W / S);
  const gh = Math.ceil(H / S);
  const n = gw * gh;
  const make = (width: number, height: number) =>
    Object.assign(document.createElement("canvas"), { width, height });

  // The art's alpha on the grid: the body's silhouette.
  const probe = make(gw, gh);
  const probeContext = probe.getContext("2d", { willReadFrequently: true });
  if (!probeContext) return null;
  let alpha: Uint8ClampedArray;
  try {
    probeContext.drawImage(input.art, 0, 0, gw, gh);
    alpha = probeContext.getImageData(0, 0, gw, gh).data;
  } catch {
    return null;
  }
  const body = new Uint8Array(n);
  for (let i = 0; i < n; i += 1) body[i] = alpha[i * 4 + 3] >= 40 ? 1 : 0;
  yield;

  // Whose armour each pixel is: the plan's beat of the tile over it (255
  // where there is none: undersuit, air).
  const region = new Uint8Array(n).fill(255);
  for (const tile of input.tiles) {
    if (tile.pieceId == null) continue;
    const beat = tile.beat ?? 0;
    const x0 = Math.max(0, Math.floor(tile.sx / S));
    const y0 = Math.max(0, Math.floor(tile.sy / S));
    const x1 = Math.min(gw, Math.ceil((tile.sx + (tile.tw ?? input.tile)) / S));
    const y1 = Math.min(gh, Math.ceil((tile.sy + (tile.th ?? input.tile)) / S));
    for (let y = y0; y < y1; y += 1)
      for (let x = x0; x < x1; x += 1) if (body[y * gw + x]) region[y * gw + x] = beat;
  }
  yield;

  const coreX = Math.min(gw - 1, Math.max(0, Math.round(input.core[0] / S)));
  const coreY = Math.min(gh - 1, Math.max(0, Math.round(input.core[1] / S)));
  const geodesic = yield* naniteGeodesicSteps(body, gw, gh, coreY * gw + coreX);
  const { dist, parent } = geodesic;

  // The body's knots: each group's farthest pixel, in the front's order.
  const reach = timeline.order.map(() => NaN);
  let ornamentMin = Infinity;
  let ornamentMax = -Infinity;
  let helmTop = Infinity;
  let helmBottom = -Infinity;
  let farthest = 0;
  for (let i = 0; i < n; i += 1) {
    if (dist[i] < Infinity && dist[i] > farthest) farthest = dist[i];
    const beat = region[i];
    if (beat === 255) continue;
    if (beat === timeline.helmBeat) {
      const y = Math.floor(i / gw);
      if (y < helmTop) helmTop = y;
      if (y > helmBottom) helmBottom = y;
      continue;
    }
    if (beat === timeline.ornamentBeat) {
      if (dist[i] < ornamentMin) ornamentMin = dist[i];
      if (dist[i] > ornamentMax) ornamentMax = dist[i];
      continue;
    }
    const k = timeline.order.indexOf(beat);
    const slot = k < 0 ? timeline.order.length - 1 : k;
    if (!(reach[slot] >= dist[i])) reach[slot] = dist[i];
  }
  const knots = naniteBodyKnots(reach, timeline.body);
  yield;

  // Veins: the shortest paths to the farthest pixels of the limbs, left and
  // right; the liquid runs ahead along them.
  const vein = new Float32Array(n);
  {
    const ends: number[] = [];
    const sides = [0, 1];
    const limbs = timeline.order.slice(-2);
    for (const beat of limbs)
      for (const side of sides) {
        let best = -1;
        for (let i = 0; i < n; i += 1) {
          if (region[i] !== beat) continue;
          if ((i % gw < coreX ? 0 : 1) !== side) continue;
          if (best < 0 || dist[i] > dist[best]) best = i;
        }
        if (best >= 0) ends.push(best);
      }
    // (And the upper trunk, either side.)
    const trunk = timeline.order[0];
    for (const side of sides) {
      let best = -1;
      for (let i = 0; i < n; i += 1) {
        if (region[i] !== trunk || (i % gw < coreX ? 0 : 1) !== side) continue;
        if (best < 0 || dist[i] > dist[best]) best = i;
      }
      if (best >= 0) ends.push(best);
    }
    for (const end of ends.slice(0, NANITE_SKIN.vein.count)) {
      const length = dist[end] || 1;
      for (let i = end, guard = 0; i >= 0 && guard < n; i = parent[i], guard += 1) {
        const lead = clamp01(dist[i] / (length * NANITE_SKIN.vein.taper));
        if (lead > vein[i]) vein[i] = lead;
        const x = i % gw;
        const y = (i - x) / gw;
        for (let k = 0; k < 4; k += 1) {
          const nx = x + (k === 0 ? 1 : k === 1 ? -1 : 0);
          const ny = y + (k === 2 ? 1 : k === 3 ? -1 : 0);
          if (nx < 0 || ny < 0 || nx >= gw || ny >= gh) continue;
          const j = ny * gw + nx;
          if (lead * 0.5 > vein[j]) vein[j] = lead * 0.5;
        }
      }
    }
    // A vein one path wide leads the front as a needle; spread it over the
    // body a few px each side (a 3×3 box, three passes, the body only) and
    // lift it back, so the liquid runs ahead in a rounded tongue instead.
    const spread = new Float32Array(n);
    for (let pass = 0; pass < 3; pass += 1) {
      for (let y = 0; y < gh; y += 1)
        for (let x = 0; x < gw; x += 1) {
          const i = y * gw + x;
          if (!body[i]) {
            spread[i] = 0;
            continue;
          }
          let sum = 0;
          let count = 0;
          for (let dy = -1; dy <= 1; dy += 1)
            for (let dx = -1; dx <= 1; dx += 1) {
              const nx = x + dx;
              const ny = y + dy;
              if (nx < 0 || ny < 0 || nx >= gw || ny >= gh || !body[ny * gw + nx]) continue;
              sum += vein[ny * gw + nx];
              count += 1;
            }
          spread[i] = sum / count;
        }
      vein.set(spread);
      yield;
    }
    for (let i = 0; i < n; i += 1) vein[i] = Math.min(1, vein[i] * 2.4);
  }
  yield;

  // Each armour pixel's time.
  const time = new Float32Array(n).fill(NaN);
  const visorX = input.visor[0] / S;
  const visorY = input.visor[1] / S;
  const helmSpan = Math.max(1, helmBottom - helmTop);
  let faceFar = 1;
  for (let i = 0; i < n; i += 1)
    if (region[i] === timeline.helmBeat)
      faceFar = Math.max(faceFar, Math.hypot((i % gw) - visorX, Math.floor(i / gw) - visorY));
  const [n0, n1] = NANITE_SKIN.noise;
  // The edge's noise, both octaves, −1 … 1 each (the two fields share it).
  const coarseNoise = new Float32Array(n);
  const fineNoise = new Float32Array(n);
  for (let i = 0; i < n; i += 1) {
    const x = i % gw;
    const y = (i - x) / gw;
    coarseNoise[i] = (valueNoise(x * S, y * S, n0[0], 5) - 0.5) * 2;
    fineNoise[i] = (valueNoise(x * S, y * S, n1[0], 9) - 0.5) * 2;
    if (i % 8192 === 8191) yield;
  }
  for (let i = 0; i < n; i += 1) {
    const beat = region[i];
    if (beat === 255) continue;
    const x = i % gw;
    const y = (i - x) / gw;
    const edge = coarseNoise[i] * n0[1] + fineNoise[i] * n1[1];
    if (beat === timeline.helmBeat) {
      // Up from the neck, the face last.
      const up = (helmBottom - y) / helmSpan;
      const face = 1 - Math.hypot(x - visorX, y - visorY) / faceFar;
      const v = clamp01((0.6 * up + 0.4 * face - 0.08) / 0.66);
      time[i] = timeline.helm[0] + (timeline.helm[1] - timeline.helm[0]) * v + edge * 0.4;
    } else if (beat === timeline.ornamentBeat) {
      const v = (dist[i] - ornamentMin) / Math.max(1, ornamentMax - ornamentMin);
      time[i] = timeline.ornaments[0] + (timeline.ornaments[1] - timeline.ornaments[0]) * v + edge;
    } else {
      time[i] = naniteKnotTime(knots, dist[i]) + edge - NANITE_SKIN.vein.lead * vein[i];
    }
    if (i % 16384 === 0) yield;
  }
  // One continuous sheet: the front's facets and the veins' tips smoothed,
  // within each group of the plan (its own times stay its own).
  yield* naniteSmoothField(time, region, gw, gh, NANITE_SKIN.smooth.passes, NANITE_SKIN.smooth.tol);

  // The same front over the whole frame (a change of form, the retract):
  // the distance itself, the helmet's place last.
  const change = new Float32Array(n);
  {
    const bodyShare = 1 - NANITE_SKIN.changeHelm;
    for (let i = 0; i < n; i += 1) {
      const x = i % gw;
      const y = (i - x) / gw;
      const edge = coarseNoise[i] * 0.045 + fineNoise[i] * 0.015;
      if (i % 16384 === 16383) yield;
      if (region[i] === timeline.helmBeat) {
        const up = (helmBottom - y) / helmSpan;
        const face = 1 - Math.hypot(x - visorX, y - visorY) / faceFar;
        change[i] = bodyShare + NANITE_SKIN.changeHelm * clamp01((0.6 * up + 0.4 * face - 0.08) / 0.66) + edge * 0.3;
      } else {
        const d = Number.isFinite(dist[i]) ? dist[i] / Math.max(1, farthest) : 1;
        change[i] = Math.max(0, bodyShare * Math.pow(d, 0.85) + edge - 0.04 * vein[i]);
      }
    }
    // (The helmet apart from the rest: it closes last, on its own.)
    const helmKey = new Uint8Array(n);
    for (let i = 0; i < n; i += 1) helmKey[i] = region[i] === timeline.helmBeat ? 1 : 0;
    yield* naniteSmoothField(change, helmKey, gw, gh, NANITE_SKIN.smooth.passes, NANITE_SKIN.smooth.tol * 2.5);
  }
  yield;

  // Where each field pixel settles within `click` (nano pass, 2026-11-21):
  // a smooth, low-slope noise in place of the cells' own hashed moments, so
  // the settle is one ragged front, never tiles clicking in.
  const seat = new Float32Array(n);
  // (And a finer, smooth noise the ripple's light rides on, in place of the
  // cells' relief: its crests catch the light unevenly, never in tiles.)
  const glow = new Float32Array(n);
  {
    const salt = ALLOY_SALT[style.alloy ?? "meta-unitas"];
    for (let i = 0; i < n; i += 1) {
      const x = ((i % gw) + 0.5) * S;
      const y = (Math.floor(i / gw) + 0.5) * S;
      let v = 0.5;
      for (let o = 0; o < NANITE_SKIN.seat.length; o += 1) {
        const [period, amp] = NANITE_SKIN.seat[o];
        v += (valueNoise(x, y, period, salt + 11 * o) - 0.5) * 2 * amp;
      }
      seat[i] = clamp01(v);
      glow[i] = valueNoise(x, y, 9, salt + 17);
      if (i % 16384 === 16383) yield;
    }
  }
  yield;

  const steps = function* (
    field: Float32Array,
    timing: NaniteFrontTiming,
    live: number,
    whole: boolean,
  ): Generator<undefined, Front, unknown> {
    // The pixels in the field, sorted by time: a counting sort over fine
    // steps of it (each pixel's time becomes its step's: a 60 000th of the
    // field's span).
    let count = 0;
    let low = Infinity;
    let high = -Infinity;
    for (let i = 0; i < n; i += 1) {
      const value = field[i];
      if (value !== value) continue;
      count += 1;
      if (value < low) low = value;
      if (value > high) high = value;
    }
    const STEPS = 60000;
    const scale = count && high > low ? (STEPS - 1) / (high - low) : 0;
    const starts = new Uint32Array(STEPS + 1);
    for (let i = 0; i < n; i += 1) {
      const value = field[i];
      if (value === value) starts[Math.floor((value - low) * scale) + 1] += 1;
    }
    for (let b = 0; b < STEPS; b += 1) starts[b + 1] += starts[b];
    yield;
    const order = new Uint32Array(count);
    for (let i = 0; i < n; i += 1) {
      const value = field[i];
      if (value !== value) continue;
      const b = Math.floor((value - low) * scale);
      field[i] = scale ? low + b / scale : low;
      order[starts[b]++] = i;
    }
    yield;
    const t = new Float32Array(count);
    const th = new Float32Array(count);
    const dev = timing.soft * 3;
    let x0 = gw;
    let y0 = gh;
    let x1 = 0;
    let y1 = 0;
    for (let k = 0; k < count; k += 1) {
      const i = order[k];
      t[k] = field[i];
      // Its own moment to settle: the smooth seat, no unit's mean.
      th[k] = field[i] + timing.lag + timing.click * seat[i];
      const x = i % gw;
      const y = (i - x) / gw;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
      if (k % 16384 === 16383) yield;
    }
    // Droplets: homes on the armour, each with the place the front was
    // `lead` before it (back along its shortest path).
    const span = count ? t[count - 1] - t[0] : 1;
    const want = Math.min(count, Math.round(((live * span) / timing.lead) * 1.15));
    const keep = count ? want / count : 0;
    const mt: number[] = [];
    const mx: number[] = [];
    const my: number[] = [];
    const mfx: number[] = [];
    const mfy: number[] = [];
    const ms: number[] = [];
    for (let k = 0; k < count; k += 1) {
      const i = order[k];
      if (region[i] === 255 || hash(i, whole ? 61 : 53) >= keep) continue;
      const x = ((i % gw) + hash(i, 71)) * S;
      const y = (Math.floor(i / gw) + hash(i, 73)) * S;
      let from = i;
      for (let hop = 0; hop < 48; hop += 1) {
        const up = parent[from];
        if (up < 0) break;
        from = up;
        const then = field[from];
        if (then === then && then <= field[i] - timing.lead) break;
      }
      let fx = ((from % gw) + 0.5) * S;
      let fy = (Math.floor(from / gw) + 0.5) * S;
      if (!whole && region[i] === timeline.helmBeat) {
        // The helmet's own field: up from the neck.
        fx = x + (hash(i, 77) - 0.5) * 18;
        fy = y + 26 + 20 * hash(i, 79);
      }
      mt.push(field[i]);
      mx.push(x);
      my.push(y);
      mfx.push(fx);
      mfy.push(fy);
      ms.push(hash(i, 83));
      if (k % 16384 === 16383) yield;
    }
    yield;
    return {
      timing,
      count,
      idx: order,
      t,
      th,
      back: timing.lag + timing.click + timing.pop + timing.grain + dev + timing.flash,
      ahead: timing.lip + dev,
      box: [x0, y0, x1 + 1, y1 + 1],
      first: count ? t[0] : 0,
      last: count ? t[count - 1] : 0,
      motes: mt.length,
      mt: Float32Array.from(mt),
      mx: Float32Array.from(mx),
      my: Float32Array.from(my),
      mfx: Float32Array.from(mfx),
      mfy: Float32Array.from(mfy),
      ms: Float32Array.from(ms),
    };
  };
  const live = naniteLiveBudget(input.coarse, 0);
  const suit = yield* steps(time, NANITE_SKIN.front, live, false);
  if (!suit.count) return null;
  const changeFront = yield* steps(change, NANITE_SKIN.change, live, true);
  let flow: NaniteFlow | null = null;
  if (input.prepareFlow) {
    try {
      flow = yield* input.prepareFlow({
        width: gw,
        height: gh,
        grid: S,
        coarse: input.coarse,
        base: time,
        change,
      });
    } catch {
      // Keep the skin and its original droplets if the optional geometry fails.
    }
  }

  // The baked layers (nano pass, 2026-11-21: 「実際のナノマシンと同程度の
  // 大きさにして」). Two pictures at the figure's own size, both made of a
  // micro-grain streaked along the flow — no cell, facet or line of a
  // lattice anywhere, since one nanomachine is far below a pixel:
  //   `fibres`  the liquid's chrome: the grain at low amplitude over a soft
  //             contour sheen, a slow mottle (the collective's density) and
  //             a few long, phase-warped flow lines (a strictly periodic
  //             stripe would moiré against the device grid);
  //   `sheen`   the grain's light (style.line), lit through the line mask;
  //             its alpha, fractal and high in contrast, also frays the
  //             liquid's edge below a pixel (mask E).
  // The grain is a line-integral convolution of one-figure-px white noise
  // along the flow (the time field's gradient): the eye reads streaming
  // matter, and no unit of it is ever larger than a pixel.
  const fibres = make(W, H);
  const sheen = make(W, H);
  {
    // The distance to the silhouette's edge (two chamfer passes).
    const edge = new Float32Array(n);
    for (let i = 0; i < n; i += 1) edge[i] = body[i] ? 1e6 : 0;
    for (let y = 0; y < gh; y += 1)
      for (let x = 0; x < gw; x += 1) {
        const i = y * gw + x;
        if (!body[i]) continue;
        let d = edge[i];
        if (x > 0) d = Math.min(d, edge[i - 1] + 1);
        if (y > 0) d = Math.min(d, edge[i - gw] + 1);
        if (x > 0 && y > 0) d = Math.min(d, edge[i - gw - 1] + 1.414);
        if (x < gw - 1 && y > 0) d = Math.min(d, edge[i - gw + 1] + 1.414);
        edge[i] = d;
      }
    yield;
    for (let y = gh - 1; y >= 0; y -= 1)
      for (let x = gw - 1; x >= 0; x -= 1) {
        const i = y * gw + x;
        if (!body[i]) continue;
        let d = edge[i];
        if (x < gw - 1) d = Math.min(d, edge[i + 1] + 1);
        if (y < gh - 1) d = Math.min(d, edge[i + gw] + 1);
        if (x < gw - 1 && y < gh - 1) d = Math.min(d, edge[i + gw + 1] + 1.414);
        if (x > 0 && y < gh - 1) d = Math.min(d, edge[i + gw - 1] + 1.414);
        edge[i] = d;
      }
    yield;
    // The flow: the time field's gradient (unit vectors per field px; zero
    // off the armour), averaged once over 3×3 so the streaks bend smoothly.
    const rawX = new Float32Array(n);
    const rawY = new Float32Array(n);
    for (let y = 0; y < gh; y += 1)
      for (let x = 0; x < gw; x += 1) {
        const i = y * gw + x;
        const own = time[i];
        if (own !== own) continue;
        const l = x > 0 ? time[i - 1] : NaN;
        const r = x < gw - 1 ? time[i + 1] : NaN;
        const u = y > 0 ? time[i - gw] : NaN;
        const d = y < gh - 1 ? time[i + gw] : NaN;
        const gx = (r === r ? r : own) - (l === l ? l : own);
        const gy = (d === d ? d : own) - (u === u ? u : own);
        const m = Math.hypot(gx, gy);
        if (m > 1e-9) {
          rawX[i] = gx / m;
          rawY[i] = gy / m;
        }
        if (x === gw - 1 && y % 64 === 63) yield;
      }
    yield;
    const dirX = new Float32Array(n);
    const dirY = new Float32Array(n);
    for (let y = 0; y < gh; y += 1)
      for (let x = 0; x < gw; x += 1) {
        let sx = 0;
        let sy = 0;
        for (let dy = -1; dy <= 1; dy += 1)
          for (let dx = -1; dx <= 1; dx += 1) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= gw || ny >= gh) continue;
            sx += rawX[ny * gw + nx];
            sy += rawY[ny * gw + nx];
          }
        const m = Math.hypot(sx, sy);
        // (Nowhere to flow — the reactor, a seam: down the body.)
        dirX[y * gw + x] = m > 1e-6 ? sx / m : 0;
        dirY[y * gw + x] = m > 1e-6 ? sy / m : 1;
        if (x === gw - 1 && y % 48 === 47) yield;
      }
    yield;
    // A field array read between its samples, at figure px.
    const sample = (values: Float32Array, x: number, y: number) => {
      const gx = Math.min(gw - 1.001, Math.max(0, x / S - 0.5));
      const gy = Math.min(gh - 1.001, Math.max(0, y / S - 0.5));
      const x0 = gx | 0;
      const y0 = gy | 0;
      const fx = gx - x0;
      const fy = gy - y0;
      const i = y0 * gw + x0;
      const top = values[i] + (values[i + 1] - values[i]) * fx;
      const bottom = values[i + gw] + (values[i + gw + 1] - values[i + gw]) * fx;
      return top + (bottom - top) * fy;
    };
    const edgeAt = (x: number, y: number) => sample(edge, x, y) * S;
    // White noise at one figure px, one per picture, the alloy's own.
    const salt = ALLOY_SALT[style.alloy ?? "meta-unitas"];
    const whiteA = new Uint8Array(W * H);
    const whiteB = new Uint8Array(W * H);
    for (let i = 0; i < W * H; i += 1) {
      whiteA[i] = (hash(i, salt) * 256) | 0;
      whiteB[i] = (hash(i, salt + 1) * 256) | 0;
      if (i % 32768 === 32767) yield;
    }
    // A tent-weighted line integral of `noise` through (x, y) along (ux,
    // uy), `reach` px each way, as a unit-variance deviate.
    const deviate = (reach: number) => {
      let w = 0;
      let w2 = 0;
      for (let k = -reach; k <= reach; k += 1) {
        const tent = reach + 1 - Math.abs(k);
        w += tent;
        w2 += tent * tent;
      }
      // The uniform byte's spread, shrunk by the kernel's effective count.
      return (73.6 * Math.sqrt(w2)) / w;
    };
    const lic = (noise: Uint8Array, x: number, y: number, ux: number, uy: number, reach: number) => {
      let sum = 0;
      let weight = 0;
      for (let k = -reach; k <= reach; k += 1) {
        const nx = Math.min(W - 1, Math.max(0, x + Math.round(ux * k)));
        const ny = Math.min(H - 1, Math.max(0, y + Math.round(uy * k)));
        const tent = reach + 1 - Math.abs(k);
        sum += noise[ny * W + nx] * tent;
        weight += tent;
      }
      return sum / weight - 127.5;
    };
    const C60 = 0.5;
    const S60 = Math.sqrt(3) / 2;
    // The grain along the flow: one family, or three crossing at 60°.
    const grain = (noise: Uint8Array, x: number, y: number, ux: number, uy: number, reach: number) => {
      if (!style.triangles) return lic(noise, x, y, ux, uy, reach);
      return (
        (lic(noise, x, y, ux, uy, reach) +
          lic(noise, x, y, ux * C60 - uy * S60, ux * S60 + uy * C60, reach) +
          lic(noise, x, y, ux * C60 + uy * S60, -ux * S60 + uy * C60, reach)) /
        Math.sqrt(3)
      );
    };
    const reachA = Math.max(2, Math.round(style.streak));
    const reachB = Math.max(2, Math.round(style.streak * 0.6));
    const normA = deviate(reachA);
    const normB = deviate(reachB);
    const fibreContext = fibres.getContext("2d");
    const sheenContext = sheen.getContext("2d");
    if (!fibreContext || !sheenContext) return null;
    const fibreImage = fibreContext.createImageData(W, H);
    const sheenImage = sheenContext.createImageData(W, H);
    const fibreData = new Uint32Array(fibreImage.data.buffer);
    const sheenData = new Uint32Array(sheenImage.data.buffer);
    for (let y = 0; y < H; y += 1) {
      for (let x = 0; x < W; x += 1) {
        const px = x + 0.5;
        const py = y + 0.5;
        const e = edgeAt(px, py);
        if (e <= 0) continue;
        const ux = sample(dirX, px, py);
        const uy = sample(dirY, px, py);
        const um = Math.hypot(ux, uy) || 1;
        const gA = Math.max(-2.5, Math.min(2.5, grain(whiteA, x, y, ux / um, uy / um, reachA) / normA));
        const gB = Math.max(-2.5, Math.min(2.5, grain(whiteB, x, y, ux / um, uy / um, reachB) / normB));
        // The chrome turns with the limb's contour (a reflection across it).
        const slope = (edgeAt(px - S, py) - edgeAt(px + S, py)) / S;
        const contour = Math.max(-1, Math.min(1, slope * 0.45));
        // Flow lines along the limb, ~12 figure px apart, their phase warped.
        const warp = (valueNoise(px, py, 31, salt + 3) - 0.5) * 5;
        const stripe = 0.5 + 0.5 * Math.cos(e * 0.52 + warp);
        const mottle = valueNoise(px, py, 64, salt + 5) - 0.5;
        const value = 0.05 + contour * 0.2 + mottle * 0.18 + gA * 0.085 - stripe * stripe * 0.1;
        const opacity = Math.round(Math.min(0.78, Math.abs(value)) * 255);
        fibreData[y * W + x] = (opacity << 24) | (value > 0 ? 0xfff2e6 : 0x0c0806);
        // The sheen: the finer grain, fractal (1, ~3.5 and ~10 figure px),
        // pushed to a high contrast so it can fray an edge.
        const f =
          0.5 +
          0.16 * gB +
          0.32 * (valueNoise(px, py, 3.5, salt + 7) - 0.5) +
          0.3 * (valueNoise(px, py, 10, salt + 9) - 0.5);
        const r = clamp01((f - 0.38) / 0.3);
        sheenData[y * W + x] = (Math.round(r * r * (3 - 2 * r) * 255) << 24) | 0xffffff;
      }
      if (y % 8 === 7) yield;
    }
    fibreContext.putImageData(fibreImage, 0, 0);
    sheenContext.putImageData(sheenImage, 0, 0);
    sheenContext.globalCompositeOperation = "source-in";
    sheenContext.fillStyle = style.line;
    sheenContext.fillRect(0, 0, W, H);
    sheenContext.globalCompositeOperation = "source-over";
  }
  yield;

  // The liquid's picture of an art: the art under the steel, its fibres
  // and facets.
  let room: CanvasGradient | null = null;
  const makeSheen = (context: CanvasRenderingContext2D) => {
    const gradient = context.createLinearGradient(0, 0, W * 0.5, H);
    const [r, g, b] = style.glint;
    for (let k = 0; k <= 12; k += 1) {
      const lit = k % 4 === 1 ? 0.3 : k % 4 === 3 ? 0.1 : 0;
      gradient.addColorStop(k / 12, `rgb(${r} ${g} ${b} / ${lit})`);
    }
    return gradient;
  };
  const bakeMetal = (target: HTMLCanvasElement, source: CanvasImageSource, fit: boolean) => {
    const context = target.getContext("2d");
    if (!context) return false;
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.globalCompositeOperation = "copy";
    context.globalAlpha = 1;
    if (fit) context.drawImage(source, 0, 0, W, H);
    else context.drawImage(source, 0, 0);
    context.globalCompositeOperation = "source-atop";
    context.globalAlpha = style.steelAlpha;
    context.fillStyle = style.steel;
    context.fillRect(0, 0, W, H);
    context.globalAlpha = 1;
    context.drawImage(fibres, 0, 0);
    // The room in the chrome: soft bands of light across it.
    context.fillStyle = room ?? (room = makeSheen(context));
    context.fillRect(0, 0, W, H);
    context.globalCompositeOperation = "source-over";
    return true;
  };
  const metal = make(W, H);
  if (!bakeMetal(metal, input.art, true)) return null;
  // The picture being changed to (or taken back), and its liquid.
  let otherMetal: HTMLCanvasElement | null = null;
  let otherOf: CanvasImageSource | null = null;
  let held: HTMLCanvasElement | null = null;
  let heldLive = false;
  const scratch = make(W, H);
  const scratchContext = scratch.getContext("2d");
  if (!scratchContext) return null;
  // (The fraying edge's own picture: the sheen through mask E.)
  const fray = make(W, H);
  const frayContext = fray.getContext("2d");
  if (!frayContext) return null;
  const [artW, artH] = sourceSize(input.art);
  const artSX = artW ? artW / W : 1;
  const artSY = artH ? artH / H : 1;

  // The five masks (field-sized): the liquid, the colour, the grain's
  // sheen, the light, and the liquid's fraying edge. One set, lent to
  // whichever front is drawn.
  const maskCanvas = [0, 1, 2, 3, 4].map(() => make(gw, gh));
  const maskContext = maskCanvas.map((canvas) => canvas.getContext("2d", { willReadFrequently: true }));
  if (maskContext.some((context) => !context)) return null;
  const maskImage = maskContext.map((context) => context!.createImageData(gw, gh));
  const mask = maskImage.map((image) => new Uint32Array(image.data.buffer));
  const [gr, gg, gb] = style.glint;
  const LIGHT = (gb << 16) | (gg << 8) | gr;
  const WHITE = 0xffffff;
  const FULL = 0xffffffff;
  let owner: Front | null = null;
  let prevLo = 0;
  let prevHi = 0;
  // The dirty box of the masks, and the bands' box (field px).
  const dirty = [0, 0, 0, 0];
  const band = [0, 0, 0, 0];
  // The fraying edge's own box (field px): only where the liquid is thin —
  // far smaller than the bands' (it is what the fray pays to draw).
  const rim = [0, 0, 0, 0];
  const governor = createNaniteGovernor();
  const now = input.now ?? (() => 0);
  const stats = { pixels: suit.count, motes: suit.motes, band: 0, drawn: 0, ms: 0 };
  // Droplets' batches: [x, y, size] by tone.
  const moteCap = Math.max(suit.motes, changeFront.motes, 1);
  const batch = [0, 1, 2].map(() => new Float32Array(Math.min(moteCap, 4096) * 3));
  const batchCount = [0, 0, 0];

  /* -- draw passes: allocation-free from here -- */

  const grow = (box: number[], x: number, y: number) => {
    if (x < box[0]) box[0] = x;
    if (y < box[1]) box[1] = y;
    if (x >= box[2]) box[2] = x + 1;
    if (y >= box[3]) box[3] = y + 1;
  };
  /** Writes the masks for `front` at `q`. False when nothing of it shows. */
  const update = (front: Front, q: number, ripple: boolean) => {
    const T = front.timing;
    const { idx, t, th, count } = front;
    const [L, C, G, F, E] = mask;
    dirty[0] = band[0] = gw;
    dirty[1] = band[1] = gh;
    dirty[2] = band[2] = 0;
    dirty[3] = band[3] = 0;
    rim[0] = gw;
    rim[1] = gh;
    rim[2] = rim[3] = 0;
    if (owner !== front) {
      for (let m = 0; m < 5; m += 1) mask[m].fill(0);
      owner = front;
      prevLo = prevHi = 0;
      dirty[0] = dirty[1] = 0;
      dirty[2] = gw;
      dirty[3] = gh;
    }
    const lo = lowerBound(t, count, q - front.back);
    const hi = lowerBound(t, count, q + front.ahead);
    // Passed since the last frame: finished.
    for (let k = prevLo; k < lo; k += 1) {
      const i = idx[k];
      L[i] = FULL;
      C[i] = FULL;
      G[i] = 0;
      F[i] = 0;
      E[i] = 0;
      const x = i % gw;
      grow(dirty, x, (i - x) / gw);
    }
    // Ahead of the front again (a scrub back): untouched.
    for (let k = Math.max(hi, prevLo); k < prevHi; k += 1) {
      const i = idx[k];
      L[i] = C[i] = G[i] = F[i] = E[i] = 0;
      const x = i % gw;
      grow(dirty, x, (i - x) / gw);
    }
    const K = T.ripple * Math.PI * 2;
    for (let k = lo; k < hi; k += 1) {
      const i = idx[k];
      const dt = q - t[k];
      const dc = q - th[k];
      // Every ramp is eased (nanosuit pass, 2026-11-20: 「滑らかに」): a
      // linear ramp on a 2 px field reads as a hard step once it is scaled
      // up; smoothstep and ease-out curves keep the edges sub-pixel soft.
      const lu = dt <= 0 ? 0 : dt >= T.soft ? 1 : dt / T.soft;
      const liquid = lu * lu * (3 - 2 * lu);
      // The pixel settles into the armour's colours, easing out (nano pass,
      // 2026-11-21: no cell's iris; the smooth seat makes the settle one
      // soft, ragged front).
      const cu = dc <= 0 ? 0 : dc >= T.pop ? 1 : dc / T.pop;
      const cv = 1 - cu;
      const colour = 1 - cv * cv * cv;
      // The grain's sheen: up before the pixel settles, lingering after.
      let line = 1;
      if (dc <= -T.rise) line = 0;
      else if (dc < 0) {
        const r = 1 + dc / T.rise;
        line = r * r * (3 - 2 * r);
      } else if (dc > T.pop) {
        const g = clamp01((dc - T.pop) / T.grain);
        line = 0.62 * (1 - g * g * (3 - 2 * g));
      }
      // The light: the lip (a smooth bell with a hot core, so the bead has
      // no ridge), a low sheen along the settle front (continuous, moving
      // with it — never a flash), the liquid's ripple.
      const lipAt = (dt - T.lip * 0.3) / T.lip;
      let light = 0;
      if (lipAt > -1 && lipAt < 1) {
        const b = 1 - lipAt * lipAt;
        const bell = b * b;
        light = 0.7 * bell + 0.3 * bell * bell * bell;
      }
      const settleAt = dc / T.flash;
      if (settleAt > -0.5 && settleAt < 1) {
        const b = settleAt < 0 ? 1 - 4 * settleAt * settleAt : 1 - settleAt;
        light += 0.2 * b * b;
      }
      if (liquid > 0 && colour < 1 && ripple) {
        // Density waves running through the collective, a little faster
        // than the front; they also carry the grain's sheen.
        const wet = liquid * (1 - colour);
        const wave = Math.sin(K * (t[k] - q * T.rippleRun));
        light += wet * wave * wave * Math.max(0, glow[i] - 0.3) * 0.42;
        line *= 0.72 + 0.28 * wave;
      }
      const a = liquid >= 1 ? 255 : (liquid * 255) | 0;
      L[i] = (a << 24) | WHITE;
      C[i] = (((colour * 255) | 0) << 24) | WHITE;
      G[i] = (((line * liquid * 255) | 0) << 24) | WHITE;
      F[i] = (((light >= 1 ? 255 : light * 255) | 0) << 24) | LIGHT;
      // The fraying edge: strongest where the liquid is thinnest.
      const fr = liquid > 0 && liquid < 1 ? Math.min(1, 2 * (1 - liquid)) : 0;
      E[i] = (((fr * 255) | 0) << 24) | WHITE;
      const x = i % gw;
      const y = (i - x) / gw;
      grow(band, x, y);
      if (fr > 0) grow(rim, x, y);
    }
    grow(dirty, band[0], band[1]);
    if (band[2] > band[0]) grow(dirty, band[2] - 1, band[3] - 1);
    prevLo = lo;
    prevHi = hi;
    stats.band = hi - lo;
    if (dirty[2] > dirty[0] && dirty[3] > dirty[1])
      for (let m = 0; m < 5; m += 1)
        maskContext[m]!.putImageData(
          maskImage[m],
          0,
          0,
          dirty[0],
          dirty[1],
          dirty[2] - dirty[0],
          dirty[3] - dirty[1],
        );
    return hi > 0;
  };
  /** `source` through mask `m` over the field box [x0, y0, x1, y1], drawn
   * on `context` (figure px). */
  const through = (
    context: CanvasRenderingContext2D,
    source: CanvasImageSource,
    sx: number,
    sy: number,
    m: number,
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    out: boolean,
    silhouette?: CanvasImageSource,
    erode = false,
  ) => {
    const fx = Math.max(0, x0 - 2);
    const fy = Math.max(0, y0 - 2);
    const fw = Math.min(gw, x1 + 2) - fx;
    const fh = Math.min(gh, y1 + 2) - fy;
    if (fw <= 0 || fh <= 0) return;
    const x = fx * S;
    const y = fy * S;
    const w = Math.min(W - x, fw * S);
    const h = Math.min(H - y, fh * S);
    if (w <= 0 || h <= 0) return;
    scratchContext.globalCompositeOperation = "source-over";
    scratchContext.clearRect(x, y, w, h);
    scratchContext.drawImage(source, x * sx, y * sy, w * sx, h * sy, x, y, w, h);
    scratchContext.globalCompositeOperation = out ? "destination-out" : "destination-in";
    // (Only the box: the mask is drawn through a clip of it.)
    scratchContext.save();
    scratchContext.beginPath();
    scratchContext.rect(x, y, w, h);
    scratchContext.clip();
    scratchContext.drawImage(maskCanvas[m], fx, fy, fw, fh, x, y, fw * S, fh * S);
    if (silhouette) {
      scratchContext.globalCompositeOperation = "destination-in";
      scratchContext.drawImage(silhouette, x, y, w, h, x, y, w, h);
    }
    // (Over the rim's box only, inside this box.)
    const rx = Math.max(x, Math.max(0, rim[0] - 2) * S);
    const ry = Math.max(y, Math.max(0, rim[1] - 2) * S);
    const rw = Math.min(x + w, Math.min(gw, rim[2] + 2) * S) - rx;
    const rh = Math.min(y + h, Math.min(gh, rim[3] + 2) * S) - ry;
    if (erode && rw > 0 && rh > 0) {
      // The liquid's edge frays below a pixel (nano pass, 2026-11-21): the
      // fractal sheen through mask E, taken out of the liquid — fine
      // fingers of the collective wetting the body ahead of the bulk.
      frayContext.globalCompositeOperation = "copy";
      frayContext.drawImage(sheen, rx, ry, rw, rh, rx, ry, rw, rh);
      frayContext.globalCompositeOperation = "destination-in";
      frayContext.drawImage(maskCanvas[4], rx / S, ry / S, rw / S, rh / S, rx, ry, rw, rh);
      scratchContext.globalCompositeOperation = "destination-out";
      scratchContext.drawImage(fray, rx, ry, rw, rh, rx, ry, rw, rh);
    }
    scratchContext.restore();
    context.drawImage(scratch, x, y, w, h, x, y, w, h);
  };
  /** The droplets of `front` at `q`: skimming ahead of the lip to their
   * place (`back` false), or taken back with it (`back` true). */
  const droplets = (
    context: CanvasRenderingContext2D,
    front: Front,
    q: number,
    back: boolean,
    px: number,
    device: number,
  ) => {
    const lead = front.timing.lead;
    const share = NANITE_SKIN.levels[governor.level].motes;
    const from = lowerBound(front.mt, front.motes, q);
    const to = lowerBound(front.mt, front.motes, q + lead);
    batchCount[0] = batchCount[1] = batchCount[2] = 0;
    const cap = batch[0].length / 3;
    // One device px at most (nano pass, 2026-11-21): a nanite is far below
    // a pixel, so a droplet is the faint glint of a few thousand of them,
    // never a disc or a square; no sprite cells either. (`px`, a CSS px,
    // no longer sizes them.)
    void px;
    for (let k = from; k < to; k += 1) {
      if (share < 1 && ((k * 7) % 25) / 25 >= share) continue;
      const seed = front.ms[k];
      // 0 at the lip … 1 at its place (and the reverse, taken back).
      const a = back ? (front.mt[k] - q) / lead : 1 - (front.mt[k] - q) / lead;
      const e = back ? a * a : 1 - (1 - a) * (1 - a) * (1 - a);
      const hx = front.mx[k];
      const hy = front.my[k];
      const fx = front.mfx[k];
      const fy = front.mfy[k];
      const dx = hx - fx;
      const dy = hy - fy;
      // Off the surface in the middle of its flight, and across it.
      const arc = Math.sin(Math.PI * a) * (seed - 0.5) * 0.7;
      const x = back ? hx - dx * e * 0.8 - dy * arc : fx + dx * e - dy * arc;
      const y = back ? hy - dy * e * 0.8 + dx * arc : fy + dy * e + dx * arc - 5 * Math.sin(Math.PI * a) * seed;
      // A droplet keeps its tone for its whole flight (nanosuit pass,
      // 2026-11-20): a tone flipped by the progress popped between frames
      // of a scroll. The white ones are the sparkle, by seed.
      const blink = (seed * 9.7) % 1;
      const tone = blink < 0.16 ? 2 : seed < 0.42 ? 1 : 0;
      const at = batchCount[tone];
      if (at >= cap) continue;
      const size = device * (tone === 2 ? 1 : tone === 1 ? 0.9 : 0.8) * (back ? 1 - 0.6 * a : 0.7 + 0.3 * a);
      batch[tone][at * 3] = x;
      batch[tone][at * 3 + 1] = y;
      batch[tone][at * 3 + 2] = size;
      batchCount[tone] = at + 1;
    }
    context.globalCompositeOperation = "lighter";
    for (let tone = 0; tone < 3; tone += 1) {
      const count = batchCount[tone];
      if (!count) continue;
      const buffer = batch[tone];
      context.beginPath();
      for (let i = 0; i < count; i += 1) {
        const s = buffer[i * 3 + 2];
        context.rect(buffer[i * 3] - s / 2, buffer[i * 3 + 1] - s / 2, s, s);
      }
      // (Dimmer since the nano pass, 2026-11-21: a haze of glints.)
      context.globalAlpha = tone === 0 ? 0.4 : tone === 1 ? 0.6 : 0.78;
      context.fillStyle = style.motes[tone];
      context.fill();
    }
    context.globalCompositeOperation = "source-over";
    context.globalAlpha = 1;
    stats.drawn = batchCount[0] + batchCount[1] + batchCount[2];
  };
  /** The bands of `front` at `q`: `art` resolving out of `liquid`. */
  const bands = (
    context: CanvasRenderingContext2D,
    front: Front,
    art: CanvasImageSource,
    sx: number,
    sy: number,
    liquid: CanvasImageSource,
    clipFormEdges = false,
  ) => {
    context.globalCompositeOperation = "source-over";
    context.globalAlpha = 1;
    const [x0, y0, x1, y1] = front.box;
    if (band[2] > band[0])
      through(context, liquid, 1, 1, 0, band[0], band[1], band[2], band[3], false, undefined, governor.level < 2);
    through(context, art, sx, sy, 1, x0, y0, x1, y1, false);
    if (band[2] > band[0]) {
      context.globalCompositeOperation = "lighter";
      // (The sheen's alpha is the fray's high-contrast one: lit at a share.)
      context.globalAlpha = 0.42;
      through(context, sheen, 1, 1, 2, band[0], band[1], band[2], band[3], false, clipFormEdges ? liquid : undefined);
      context.globalAlpha = 1;
      if (clipFormEdges) {
        // The change field spans transparent air to reach wider forms.
        // Keep the moving highlights on the incoming armour.
        through(context, liquid, 1, 1, 3, band[0], band[1], band[2], band[3], false);
        context.globalCompositeOperation = "source-over";
        return;
      }
      const fx = Math.max(0, band[0] - 2);
      const fy = Math.max(0, band[1] - 2);
      const fw = Math.min(gw, band[2] + 2) - fx;
      const fh = Math.min(gh, band[3] + 2) - fy;
      context.drawImage(maskCanvas[3], fx, fy, fw, fh, fx * S, fy * S, fw * S, fh * S);
      context.globalCompositeOperation = "source-over";
    }
  };

  const draw = (
    context: CanvasRenderingContext2D,
    q: number,
    _calm: boolean,
    vs: number,
    ratio: number,
  ) => {
    stats.drawn = 0;
    const hasSkin = q > suit.first - suit.ahead - suit.timing.lead;
    if (!hasSkin) {
      stats.drawn = flow?.draw(context, q, governor.level, vs, ratio) ?? 0;
      return;
    }
    const start = now();
    const level = NANITE_SKIN.levels[governor.level];
    if (update(suit, q, level.ripple)) bands(context, suit, input.art, artSX, artSY, metal);
    const device = 1 / Math.max(1e-6, vs);
    const drawn = flow?.draw(context, q, governor.level, vs, ratio);
    if (drawn != null) stats.drawn = drawn;
    else if (q < suit.last + suit.timing.lead) droplets(context, suit, q, false, ratio * device, device);
    const cost = now() - start;
    stats.ms = cost;
    if (stats.band) governor.feed(cost);
  };

  /** The change's clock on its field: before the first pixel at 0, every
   * band past the last at 1. */
  const changeAt = (u: number) =>
    changeFront.first -
    changeFront.ahead +
    clamp01(u) * (changeFront.last + changeFront.back - changeFront.first + changeFront.ahead + 1e-3);

  const liquidOf = (source: CanvasImageSource, fit: boolean) => {
    if (otherOf === source && otherMetal) return otherMetal;
    if (!otherMetal) otherMetal = make(W, H);
    if (!bakeMetal(otherMetal, source, fit)) return null;
    otherOf = source;
    return otherMetal;
  };

  const form = (
    context: CanvasRenderingContext2D,
    from: CanvasImageSource,
    to: CanvasImageSource,
    _fromKey: string,
    toKey: string,
    u: number,
    tone: string,
    _calm: boolean,
    vs: number,
    ratio: number,
  ) => {
    stats.drawn = 0;
    const liquid = liquidOf(to, true);
    if (!liquid) return false;
    const start = now();
    const q = changeAt(u);
    const [fromW, fromH] = sourceSize(from);
    const [toW, toH] = sourceSize(to);
    context.globalCompositeOperation = "source-over";
    context.globalAlpha = 1;
    if (!update(changeFront, q, NANITE_SKIN.levels[governor.level].ripple)) {
      context.drawImage(from, 0, 0, W, H);
      if (u > 0 && u < 1) stats.drawn = flow?.draw(context, q, governor.level, vs, ratio, toKey, tone) ?? 0;
      return true;
    }
    // The last form, where the liquid has not come.
    through(context, from, fromW ? fromW / W : 1, fromH ? fromH / H : 1, 0, 0, 0, gw, gh, true);
    bands(context, changeFront, to, toW ? toW / W : 1, toH ? toH / H : 1, liquid, style.alloy === "far-from");
    const device = 1 / Math.max(1e-6, vs);
    const drawn = flow && (u <= 0 || u >= 1) ? 0 : flow?.draw(context, q, governor.level, vs, ratio, toKey, tone);
    if (drawn != null) stats.drawn = drawn;
    else droplets(context, changeFront, q, false, ratio * device, device);
    const cost = now() - start;
    stats.ms = cost;
    if (stats.band) governor.feed(cost);
    return true;
  };

  /* -- end of the draw passes -- */

  const hold = (source: CanvasImageSource, vs: number, vx: number, vy: number) => {
    heldLive = false;
    if (!held) held = make(W, H);
    const context = held.getContext("2d");
    if (!context) return false;
    try {
      // The scene's canvas back into figure px (one copy, nothing read).
      const f = 1 / (Math.abs(vs) || 1);
      context.setTransform(f, 0, 0, f, -vx * f, -vy * f);
      context.globalCompositeOperation = "copy";
      context.drawImage(source, 0, 0);
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.globalCompositeOperation = "source-over";
    } catch {
      return false;
    }
    otherOf = null;
    if (!liquidOf(held, false)) return false;
    heldLive = true;
    return true;
  };

  const retract = (context: CanvasRenderingContext2D, u: number, vs: number, ratio: number) => {
    if (!heldLive || !held || !otherMetal) return;
    if (u >= 1) {
      heldLive = false;
      return;
    }
    const start = now();
    // Sucked in: slow to leave the far ends, quick into the reactor.
    const left = 1 - u * u * (0.55 + 0.45 * u);
    const q = changeAt(left);
    if (update(changeFront, q, NANITE_SKIN.levels[governor.level].ripple))
      bands(context, changeFront, held, 1, 1, otherMetal);
    const device = 1 / Math.max(1e-6, vs);
    droplets(context, changeFront, q, true, ratio * device, device);
    const cost = now() - start;
    stats.ms = cost;
    if (stats.band) governor.feed(cost);
  };

  return {
    draw,
    form,
    hold,
    retract,
    get level() {
      return governor.level;
    },
    stats,
    field: { width: gw, height: gh, time },
    release() {
      heldLive = false;
      owner = null;
      flow?.release();
      flow = null;
      for (const canvas of [probe, fibres, sheen, metal, scratch, fray, otherMetal, held, ...maskCanvas])
        if (canvas) canvas.width = canvas.height = 0;
      otherMetal = held = null;
      otherOf = null;
    },
  };
}

/** The scene's beats the skin is timed from (the engine's ASSEMBLY_BEATS). */
export type NaniteSkinBeats = {
  readonly deus: readonly [number, number];
  readonly rexonance: readonly [number, number];
  readonly clamp: number;
};

/** The scene's beats (rexonance-resonance.js ASSEMBLY_BEATS; pinned equal
 * by scripts/nanite-skin.test.mjs), for a scene on a clock of its own. */
export const NANITE_SKIN_SCENE_BEATS: NaniteSkinBeats = Object.freeze({
  deus: Object.freeze([0.16, 0.62] as const),
  rexonance: Object.freeze([0.62, 0.82] as const),
  clamp: 0.86,
});

/** A group's beat in the plan (rexonance-resonance.js BEAT_OF_GROUP). */
export const NANITE_SKIN_GROUP_BEAT: Readonly<Record<string, number>> = Object.freeze({
  legs: 0,
  arms: 1,
  chest: 2,
  shoulders: 2,
  waist: 3,
  tail: 4,
  ribbon: 4,
  bits: 4,
  helm: 5,
});

/** The plan's beats (rexonance-resonance.js BEAT_OF_GROUP): legs 0, arms 1,
 * chest 2, waist 3, the parts off the body 4, the helmet 5. */
export const NANITE_SKIN_BEAT_ORDER = Object.freeze([2, 3, 1, 0] as const);
/** The HUD's parts in the order the skin completes them (one a beat). */
export const NANITE_SKIN_PARTS = Object.freeze(["CHEST", "WAIST", "ARMS", "LEGS"] as const);

/** The skin's timeline on the scene's beats: the front leaves the reactor
 * on the first DEUS and the body is whole on the fourth — chest, waist,
 * arms, legs, one a call; the parts off the body and the helmet follow, and
 * every cell has clicked before the seal (`clamp`). */
export function naniteSkinTimeline(beats: NaniteSkinBeats): NaniteSkinTimeline {
  const [from, to] = beats.deus;
  const step = (to - from) / 4;
  const T = NANITE_SKIN.front;
  const end = beats.clamp - (T.lag + T.click + T.pop) - 0.004;
  const helmFrom = Math.min(end - 0.08, beats.rexonance[0] + 0.06);
  return {
    body: [from, from + step, from + 2 * step, from + 3 * step, to],
    order: NANITE_SKIN_BEAT_ORDER,
    ornaments: [beats.rexonance[0], Math.min(end - 0.01, beats.rexonance[1])],
    ornamentBeat: 4,
    helm: [helmFrom, end],
    helmBeat: 5,
  };
}

/** The skin where its field cannot be made (a canvas that cannot be read):
 * the armour simply comes up whole over the suit-up's run — calm, and never
 * a scene that does not start. */
export function plainNaniteSkin(input: {
  readonly size: { readonly width: number; readonly height: number };
  readonly art: CanvasImageSource;
  readonly timeline: NaniteSkinTimeline;
}): NaniteSkinLayer {
  const from = input.timeline.body[0];
  const to = input.timeline.helm[1];
  const stats = { pixels: 0, motes: 0, band: 0, drawn: 0, ms: 0 };
  return {
    draw(context, q) {
      const u = clamp01((q - from) / (to - from));
      if (u <= 0) return;
      context.globalCompositeOperation = "source-over";
      context.globalAlpha = u * u * (3 - 2 * u);
      context.drawImage(input.art, 0, 0, input.size.width, input.size.height);
      context.globalAlpha = 1;
    },
    form: () => false,
    hold: () => false,
    retract() {},
    release() {},
    level: 0,
    stats,
    field: { width: 0, height: 0, time: new Float32Array(0) },
  };
}

type GenerationInput = {
  readonly document: Document;
  readonly size: { readonly width: number; readonly height: number };
  readonly plan: { readonly tiles: readonly NaniteSkinTile[]; readonly tile: number };
  readonly core: readonly [number, number];
  readonly visor: readonly [number, number];
  readonly coarse: boolean;
  readonly unlit: CanvasImageSource;
};

/** The skin as a scene's own armour generation (the engine's `generation`
 * hook, replacing the armour's build). `prepareFlow` can replace the
 * droplets that feed the front. `changes`: a page's own drawing of
 * its changes of form (otherwise the skin's); `onLayer`: told the layer
 * (and null on its release), for a page's form change. */
export function createNaniteSkinGeneration(options: {
  readonly style: NaniteSkinStyle;
  readonly beats: NaniteSkinBeats;
  readonly prepareFlow?: PrepareNaniteFlow;
  readonly changes?: { form: NaniteSkinLayer["form"] } | null;
  readonly onLayer?: (layer: NaniteSkinLayer | null) => void;
}) {
  return Object.freeze({
    overlay: false as const,
    *prepare(input: GenerationInput): Generator<undefined, NaniteSkinLayer | null, unknown> {
      const now =
        typeof performance !== "undefined" && typeof performance.now === "function"
          ? () => performance.now()
          : undefined;
      const timeline = naniteSkinTimeline(options.beats);
      let made: NaniteSkinLayer | null = null;
      try {
        made = yield* prepareNaniteSkin({
          document: input.document,
          size: input.size,
          tiles: input.plan.tiles,
          tile: input.plan.tile,
          core: input.core,
          visor: input.visor,
          coarse: input.coarse,
          art: input.unlit,
          style: options.style,
          timeline,
          prepareFlow: options.prepareFlow,
          now,
        });
      } catch {
        made = null;
      }
      const layer = made ?? plainNaniteSkin({ size: input.size, art: input.unlit, timeline });
      const changes = options.changes;
      const wrapped: NaniteSkinLayer = {
        draw: layer.draw,
        form: changes ? (...args) => changes.form(...args) : layer.form,
        hold: layer.hold,
        retract: layer.retract,
        get level() {
          return layer.level;
        },
        stats: layer.stats,
        field: layer.field,
        release() {
          options.onLayer?.(null);
          layer.release();
        },
      };
      options.onLayer?.(wrapped);
      return wrapped;
    },
  });
}
