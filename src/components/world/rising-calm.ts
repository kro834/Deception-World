// RISING THE WORLD: the calm (CSS) tier's fire, as data. The burn edges are
// raster strips rendered offline from these profiles
// (scripts/render-rising-calm-sprites.mjs), and the flame sprites are seated on
// the same profiles, so both agree. Pure and dependency-free: the gate imports
// it statically, and node imports it to render the strips.

/** A burn edge's box: 1000 wide, 400 tall, its mean line at y = 60 (y down). */
export const CALM_EDGE_BOX = { width: 1000, height: 400, mean: 60 } as const;

/**
 * The strip image spans the box from y = -60 (room for the scorch above the
 * highest tongue) down to y = 290 (the char below is tiled): 87.5% of the
 * box's height, from 15% above it.
 */
export const CALM_EDGE_STRIP = { top: -60, bottom: 290 } as const;

/** The edge's fixed seed: every run, the server render and the strip agree. */
export const CALM_EDGE_SEED = 0x2b17;

/**
 * A second profile at the same mean depth but shaped differently (its
 * tongues where the first has bays). Halfway up, the front re-forms
 * (rising-sequence.ts): a second strip fades in over the first, drawn on
 * whichever of the two profiles has burned further at each point
 * (calmEdgeAhead), so the silhouette changes without any print un-burning.
 */
export const CALM_EDGE_SEED_B = 0x6e03;

/**
 * A ragged, fractal front: 1-D midpoint displacement from a fixed seed, 128
 * segments, then low-passed (a 7-tap kernel), so it tears into tongues and
 * bays instead of zig-zagging like a chart. Returned as y (0-400, y down) at
 * 129 evenly spaced x. The strip renderer interpolates it (Catmull-Rom) and
 * frays it with finer, rounded noise.
 */
export function burnEdge(seed: number) {
  let state = seed >>> 0;
  const random = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296 - 0.5;
  };
  const SEGMENTS = 128;
  const heights = new Array<number>(SEGMENTS + 1).fill(0);
  heights[0] = random() * 60;
  heights[SEGMENTS] = random() * 60;
  let amplitude = 110;
  for (let step = SEGMENTS; step > 1; step /= 2) {
    for (let index = step / 2; index < SEGMENTS; index += step) {
      heights[index] =
        (heights[index - step / 2] + heights[index + step / 2]) / 2 + random() * amplitude;
    }
    amplitude *= 0.63;
  }
  // The low-pass takes some of the depth away: it is given back (x 2.2)
  // around the mean, within the strip (the tiled char starts at y = 248).
  const KERNEL = [1, 2, 3, 4, 3, 2, 1];
  const ys = heights.map((_, index) => {
    let sum = 0;
    let weight = 0;
    KERNEL.forEach((k, tap) => {
      const at = index + tap - 3;
      if (at < 0 || at > SEGMENTS) return;
      sum += heights[at] * k;
      weight += k;
    });
    return Math.min(200, Math.max(-15, (sum / weight) * 2.2 + CALM_EDGE_BOX.mean));
  });
  return profile(ys);
}

function profile(ys: number[]) {
  const segments = ys.length - 1;
  /** The edge's y (0-400) at x (0-1000). */
  const at = (x: number) => {
    const position = (Math.min(1000, Math.max(0, x)) / 1000) * segments;
    const index = Math.min(segments - 1, Math.floor(position));
    return ys[index] + (ys[index + 1] - ys[index]) * (position - index);
  };
  return { ys, at };
}

/**
 * The front after it re-forms: at each point, whichever profile has burned
 * further (the higher lip; y is down). It covers all the char of the first
 * profile, so fading it in over the first only ever burns forward.
 */
export function calmEdgeAhead() {
  const first = burnEdge(CALM_EDGE_SEED).ys;
  const second = burnEdge(CALM_EDGE_SEED_B).ys;
  return profile(first.map((y, index) => Math.min(y, second[index])));
}

// Flame sprites seated along the edge: [centre in % across, width in cqmin,
// height in cqh], irregular in size and spacing. Each seat is two sprite
// frames that take turns (rising-sequence.ts), mirrored on alternate seats.
const CALM_SEATS = [
  [-3, 30, 25],
  [6, 24, 33],
  [12, 34, 22],
  [21, 27, 37],
  [29, 22, 24],
  [38, 36, 32],
  [47, 26, 26],
  [55, 30, 39],
  [63, 24, 23],
  [71, 34, 34],
  [80, 26, 27],
  [88, 32, 36],
  [97, 28, 25],
] as const;

export const CALM_FLAME_FRAMES = 3;

const CALM_EDGES = [burnEdge(CALM_EDGE_SEED), calmEdgeAhead()];

export const CALM_FLAME_SEATS = CALM_SEATS.map(([centre, width, height], index) => {
  // The edge under the seat: halfway between its depth at the centre and its
  // deepest point across the seat, so the sprite's foot stays behind the
  // char while its bright base still clears the lip.
  const x = centre * 10;
  const [dip, dipB] = CALM_EDGES.map((edge) => {
    const deepest = Math.max(...[-50, -25, 0, 25, 50].map((offset) => edge.at(x + offset)));
    const lip = (edge.at(x) + deepest) / 2;
    // How far the edge dips below its mean line here, in % of the box:
    // landscape screens stretch the edge (--rw-edge-k).
    return Number((((lip - CALM_EDGE_BOX.mean) / CALM_EDGE_BOX.height) * 100).toFixed(2));
  });
  return {
    centre,
    width,
    height,
    frame: (index * 2) % CALM_FLAME_FRAMES,
    mirror: index % 4 >= 2,
    dip,
    // The re-formed front's dip (never deeper): the seat slides up onto it.
    dipB,
  };
});

/** Smoke billows (left, in %) and embers thrown from the front (left, in %). */
export const CALM_SMOKE = [8, 30, 52, 74] as const;
export const CALM_EMBERS = [4, 9, 15, 22, 27, 33, 40, 46, 51, 58, 64, 69, 76, 82, 88, 95] as const;
