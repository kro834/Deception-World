/* EXTREME SAGA's entry suit-up: where the plates go and when.

   Everything is in the owner's art's own space (1024 × 1536, the figure
   standing at x = 512). The body is a set of hand-traced regions; whatever
   of the figure lies outside them is the cape. Each region is tiled into
   small hexagonal plates (the suit's own scales, larger), and every plate
   is scheduled to leave from the belt side of its region and slide out
   along the body in a wave: chest, then shoulders and arms, then legs and
   boots, then the gauntlets, the helmet last (src/lib/extreme-entry.ts,
   EXTREME_SUITUP_BEATS). Pure data, no DOM: the engine
   (extreme-suitup-engine.ts) draws it and scripts/extreme-entry-suitup.test.mjs
   checks it. */

import { EXTREME_SUITUP_BEATS } from "./extreme-entry.ts";

export type Point = readonly [number, number];
export type SuitupGroup =
  "belt" | "chest" | "hips" | "shoulders" | "arms" | "legs" | "boots" | "gauntlets" | "helmet";

export type SuitupRegion = {
  id: string;
  group: SuitupGroup;
  poly: readonly Point[];
  /** Where this region's plates come from: the belt side of it. */
  anchor: Point;
};

// Reversed as well as reflected: every region keeps one winding, so the
// body's union (a nonzero fill) never cancels where two regions overlap.
const mirror = (poly: readonly Point[]): Point[] =>
  poly.map(([x, y]) => [1024 - x, y] as const).reverse();
const mirrorPoint = ([x, y]: Point): Point => [1024 - x, y];

export const SUITUP_CORE: Point = [512, 582];

const SHOULDER_L: Point[] = [
  [186, 300],
  [246, 248],
  [330, 226],
  [424, 238],
  [432, 300],
  [404, 380],
  [342, 420],
  [282, 440],
  [226, 452],
  [196, 420],
  [190, 360],
];
const ARM_L: Point[] = [
  [206, 446],
  [300, 430],
  [336, 470],
  [334, 556],
  [210, 556],
  [202, 500],
];
const GAUNTLET_L: Point[] = [
  [210, 556],
  [334, 556],
  [328, 720],
  [324, 814],
  [212, 814],
  [208, 720],
];
const LEG_L: Point[] = [
  [326, 782],
  [512, 782],
  [506, 900],
  [472, 1010],
  [460, 1130],
  [434, 1270],
  [298, 1270],
  [292, 1130],
  [298, 1010],
  [316, 900],
];
const BOOT_L: Point[] = [
  [298, 1266],
  [436, 1266],
  [444, 1400],
  [404, 1518],
  [232, 1518],
  [246, 1420],
  [286, 1350],
];

export const SUITUP_REGIONS: readonly SuitupRegion[] = Object.freeze([
  {
    id: "helmet",
    group: "helmet",
    poly: [
      [436, 98],
      [470, 82],
      [512, 76],
      [554, 82],
      [588, 98],
      [596, 160],
      [586, 214],
      [548, 248],
      [512, 258],
      [476, 248],
      [438, 214],
      [428, 160],
    ],
    anchor: [512, 258],
  },
  {
    id: "belt",
    group: "belt",
    poly: [
      [362, 546],
      [662, 546],
      [666, 622],
      [358, 622],
    ],
    anchor: SUITUP_CORE,
  },
  {
    id: "chest",
    group: "chest",
    poly: [
      [428, 214],
      [596, 214],
      [610, 250],
      [652, 300],
      [662, 380],
      [652, 450],
      [644, 520],
      [656, 548],
      [368, 548],
      [380, 520],
      [372, 450],
      [362, 380],
      [372, 300],
      [414, 250],
    ],
    anchor: SUITUP_CORE,
  },
  { id: "shoulder-l", group: "shoulders", poly: SHOULDER_L, anchor: [440, 262] },
  { id: "shoulder-r", group: "shoulders", poly: mirror(SHOULDER_L), anchor: [584, 262] },
  { id: "arm-l", group: "arms", poly: ARM_L, anchor: [300, 420] },
  { id: "arm-r", group: "arms", poly: mirror(ARM_L), anchor: [724, 420] },
  {
    id: "hips",
    group: "hips",
    poly: [
      [340, 618],
      [684, 618],
      [702, 700],
      [690, 786],
      [334, 786],
      [322, 700],
    ],
    anchor: SUITUP_CORE,
  },
  { id: "leg-l", group: "legs", poly: LEG_L, anchor: [420, 772] },
  { id: "leg-r", group: "legs", poly: mirror(LEG_L), anchor: [604, 772] },
  { id: "boot-l", group: "boots", poly: BOOT_L, anchor: [366, 1250] },
  { id: "boot-r", group: "boots", poly: mirror(BOOT_L), anchor: [658, 1250] },
  { id: "gauntlet-l", group: "gauntlets", poly: GAUNTLET_L, anchor: [272, 540] },
  { id: "gauntlet-r", group: "gauntlets", poly: mirror(GAUNTLET_L), anchor: [752, 540] },
] satisfies SuitupRegion[]);

/** The horns: not plates — they extend out of the closed helmet. */
const HORN_L: Point[] = [
  [452, 4],
  [476, 48],
  [480, 112],
  [454, 124],
  [434, 98],
  [436, 48],
];
export const SUITUP_HORNS: readonly (readonly Point[])[] = Object.freeze([HORN_L, mirror(HORN_L)]);
/** Where the horns leave the helmet (they rise from below this line). */
export const SUITUP_HORN_BASE_Y = 126;

/** The four-point star gems (shoulders, chest, forearms, fists, thighs,
 * knees, boots), each lit once its plates have locked. */
const GEMS_L: Point[] = [
  [366, 320],
  [228, 590],
  [236, 746],
  [386, 830],
  [366, 997],
  [310, 1388],
];
export const SUITUP_GEMS: readonly { at: Point; r: number }[] = Object.freeze([
  { at: [512, 302] as Point, r: 18 },
  ...GEMS_L.flatMap((at, index) => {
    const r = index === 0 ? 30 : index === 2 ? 14 : 24;
    return [
      { at, r },
      { at: mirrorPoint(at), r },
    ];
  }),
]);

export type SuitupPlate = {
  region: string;
  group: SuitupGroup;
  /** Hexagon corners, art space. */
  poly: Point[];
  /** The plate's centre at rest. */
  at: Point;
  /** Where it emerges, and the turn it unfolds from (radians). */
  from: Point;
  spin: number;
  /** Its flight, ms on the suit-up clock: leave at `start`, lock at `lock`. */
  start: number;
  lock: number;
  /** When its glow line traces on. */
  glow: number;
};

export function pointInPoly([x, y]: Point, poly: readonly Point[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** The region a point of the body belongs to (first match), or null. */
export function regionAt(point: Point): SuitupRegion | null {
  for (const region of SUITUP_REGIONS) if (pointInPoly(point, region.poly)) return region;
  return null;
}

/** A small deterministic generator, so every play is the same choreography. */
function seeded(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const SUITUP_FLIGHT_MS = 440;
/** Plate circumradius per group, art px. */
export const SUITUP_PLATE_RADIUS: Record<SuitupGroup, number> = {
  belt: 13,
  chest: 23,
  hips: 21,
  shoulders: 21,
  arms: 18,
  legs: 23,
  boots: 18,
  gauntlets: 15,
  helmet: 14,
};
/** The largest of them (the engine's atlas slot). */
export const SUITUP_PLATE_RADIUS_MAX = 23;
export const SUITUP_HELMET_FLIGHT_MS = 380;

/** The plates: pointy-top hexagons over each region (SUITUP_PLATE_RADIUS ×
 * `scale`), kept where a sample of the hexagon falls in the region (and,
 * when given, where the art is opaque), each scheduled on its group's beat.
 * Neighbouring regions' plates overlap a little at their seam: never a gap. */
export function buildSuitupPlates(
  options: { scale?: number; opaque?: (point: Point) => boolean } = {},
): SuitupPlate[] {
  const scale = options.scale ?? 1;
  const opaque = options.opaque ?? (() => true);
  const random = seeded(1111);
  const found: Omit<SuitupPlate, "start" | "lock" | "glow">[] = [];
  for (const region of SUITUP_REGIONS) {
    // Each region its own lattice: broad plates on the chest, the hips and
    // the legs, fine ones on the belt, the gauntlets and the helmet.
    const radius = SUITUP_PLATE_RADIUS[region.group] * scale;
    const w = Math.sqrt(3) * radius;
    const rowStep = radius * 1.5;
    const xs = region.poly.map(([x]) => x);
    const ys = region.poly.map(([, y]) => y);
    const x0 = Math.min(...xs) - w;
    const x1 = Math.max(...xs) + w;
    const y0 = Math.min(...ys) - radius;
    const y1 = Math.max(...ys) + radius;
    const shift = random() * w;
    for (let row = 0; y0 + row * rowStep <= y1; row += 1) {
      const cy = y0 + row * rowStep;
      const offset = (row % 2 ? w / 2 : 0) + shift;
      for (let cx = x0 + offset; cx <= x1; cx += w) {
        const poly: Point[] = [];
        for (let k = 0; k < 6; k += 1) {
          const angle = -Math.PI / 2 + (k * Math.PI) / 3;
          poly.push([cx + radius * Math.cos(angle), cy + radius * Math.sin(angle)]);
        }
        const samples: Point[] = [
          [cx, cy],
          ...poly.map(([x, y]) => [(x + cx) / 2, (y + cy) / 2] as Point),
          ...poly,
        ];
        if (!samples.some((sample) => pointInPoly(sample, region.poly))) continue;
        if (!samples.some(opaque)) continue;
        const [ax, ay] = region.anchor;
        let dx = ax - cx;
        let dy = ay - cy;
        const length = Math.hypot(dx, dy) || 1;
        dx /= length;
        dy /= length;
        let from: Point;
        let spin: number;
        if (region.group === "helmet") {
          // Segments fold over the head from the sides and the back.
          const side = cx < 512 ? -1 : 1;
          from = [cx + side * (34 + random() * 26), cy - 30 - random() * 30];
          spin = side * (0.9 + random() * 0.6);
        } else {
          // Out of the belt side, sliding along the body.
          const travel = Math.min(length, 70 + random() * 90);
          const sway = (random() - 0.5) * 36;
          from = [cx + dx * travel - dy * sway, cy + dy * travel + dx * sway];
          spin = (random() < 0.5 ? -1 : 1) * (0.7 + random() * 1.6);
        }
        found.push({ region: region.id, group: region.group, poly, at: [cx, cy], from, spin });
      }
    }
  }
  // Each group's wave: nearest its anchor first, the far edge last.
  const plates: SuitupPlate[] = [];
  const groups = new Map<SuitupGroup, typeof found>();
  for (const plate of found) {
    const list = groups.get(plate.group) ?? [];
    list.push(plate);
    groups.set(plate.group, list);
  }
  for (const [group, list] of groups) {
    const [begin, end] = EXTREME_SUITUP_BEATS[group];
    const flight = group === "helmet" ? SUITUP_HELMET_FLIGHT_MS : SUITUP_FLIGHT_MS;
    const order = (plate: (typeof list)[number]) => {
      if (group === "helmet") {
        // From the neck up and the sides in: the brow closes last.
        return (258 - plate.at[1]) / 180 + (1 - Math.abs(plate.at[0] - 512) / 84) * 0.8;
      }
      const region = SUITUP_REGIONS.find((item) => item.id === plate.region)!;
      return Math.hypot(plate.at[0] - region.anchor[0], plate.at[1] - region.anchor[1]);
    };
    const keys = list.map(order);
    const min = Math.min(...keys);
    const span = Math.max(...keys) - min || 1;
    const room = Math.max(0, end - begin - flight);
    list.forEach((plate, index) => {
      const wave = (keys[index] - min) / span;
      const start = Math.round(begin + wave * room + (random() - 0.5) * 60);
      const clamped = Math.max(begin, Math.min(end - flight, start));
      const lock = clamped + flight;
      plates.push({ ...plate, start: clamped, lock, glow: lock + 90 + Math.round(wave * 160) });
    });
  }
  plates.sort((a, b) => a.start - b.start);
  return plates;
}
