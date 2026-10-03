import type { CSSProperties } from "react";
import {
  REXONANCE_CALL_BEATS,
  REXONANCE_CALLS,
  REXONANCE_ENTRY_TIMINGS,
  REXONANCE_STAGE_DURATION_MS,
  REXONANCE_STAGE_LABELS,
  REXONANCE_SUIT_FLOW,
  REXONANCE_SUIT_PARTS,
  REXONANCE_SUIT_SYSTEMS,
  type RexonanceStage,
} from "@/lib/rexonance-calls";

type RexonanceCallSequenceProps = {
  mode: "entry" | "stage";
  phase: "covering" | "revealing";
  tier: "full" | "calm" | "reduced";
  stage?: RexonanceStage;
};

function CallLines({ index }: { index: number }) {
  if (index === 2) {
    return (
      <>
        <span>SA-GA！DEUS！</span>
        <span>SA-GA！DEUS！</span>
        <span>SA-GA！DEUS！</span>
        <span>SA-GA！DEUS！</span>
      </>
    );
  }
  if (index === 3) {
    return (
      <>
        <span>REXONANCE！</span>
        <span>REXONANCE！</span>
        <span>REXONANCE！</span>
        <span>REXONANCE！</span>
      </>
    );
  }
  if (index === 4) {
    return (
      <>
        <span>REXONANCE</span>
        <span>DEUS！</span>
      </>
    );
  }
  return <span>{REXONANCE_CALLS[index]}</span>;
}

// The approved full-body Rexonance artwork (suitup3, 2026-10-04), reduced
// to its outlines in a 240 x 480 drawing: a tall crown of upswept horns over
// a pointed V visor; fan shoulders of layered plumes round gold-rimmed
// jewels; the spiral round the chest core; a segmented belt with a round
// jewel; the long V tasset between the legs; diamond crystals in gold
// almond frames on the thighs, knees and feet; gold-banded forearms and
// gauntlet fists; the segmented scorpion tail over the right shoulder with
// its hooked crystal blade; and energy ribbons trailing to the feet.
const SUIT_W = 240;
const SUIT_H = 480;
type Point = readonly [number, number];
const mirror = (points: string) =>
  points
    .split(" ")
    .map((pair) => {
      const [x, y] = pair.split(",");
      return `${SUIT_W - Number(x)},${y}`;
    })
    .join(" ");
const circleOutline = (cx: number, cy: number, radius: number) =>
  Array.from({ length: 16 }, (_, index) => {
    const angle = (index * Math.PI) / 8;
    return `${(cx + Math.cos(angle) * radius).toFixed(1)},${(cy + Math.sin(angle) * radius).toFixed(1)}`;
  }).join(" ");
const rotateOutline = (points: string, angle: number, cx: number, cy: number) =>
  points
    .split(" ")
    .map((pair) => {
      const [x, y] = pair.split(",").map(Number);
      return `${(cx + (x - cx) * Math.cos(angle) - (y - cy) * Math.sin(angle)).toFixed(1)},${(cy + (x - cx) * Math.sin(angle) + (y - cy) * Math.cos(angle)).toFixed(1)}`;
    })
    .join(" ");
// A smooth spine through key points (Catmull-Rom, `steps` per span).
const smooth = (points: readonly Point[], steps: number) => {
  const out: Point[] = [];
  for (let i = 0; i < points.length - 1; i += 1) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(points.length - 1, i + 2)];
    for (let step = 0; step < steps; step += 1) {
      const t = step / steps;
      const at = (k: 0 | 1) =>
        0.5 *
        (2 * p1[k] +
          (-p0[k] + p2[k]) * t +
          (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t * t +
          (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t * t * t);
      out.push([at(0), at(1)]);
    }
  }
  out.push(points[points.length - 1]);
  return out;
};
// A tapering band along a spine (the tail's sections, the ribbons).
const band = (spine: readonly Point[], w0: number, w1: number) => {
  const left: string[] = [];
  const right: string[] = [];
  spine.forEach(([x, y], i) => {
    const [px, py] = spine[Math.max(0, i - 1)];
    const [nx, ny] = spine[Math.min(spine.length - 1, i + 1)];
    const length = Math.hypot(nx - px, ny - py) || 1;
    const half = (w0 + ((w1 - w0) * i) / (spine.length - 1)) / 2;
    const ox = (-(ny - py) / length) * half;
    const oy = ((nx - px) / length) * half;
    left.push(`${(x + ox).toFixed(1)},${(y + oy).toFixed(1)}`);
    right.unshift(`${(x - ox).toFixed(1)},${(y - oy).toFixed(1)}`);
  });
  return [...left, ...right].join(" ");
};

// Helmet: a tall crown of upswept horns over a pointed V visor.
const SUIT_SHELL =
  "120,37 131,41 139,50 142,62 139,73 132,81 120,89 108,81 101,73 98,62 101,50 109,41";
const SUIT_CREST = "113,58 105,49 101,37 101,24 103,12 106,25 109,37 116,50";
const SUIT_HORN = "102,54 96,46 93,33 99,41 105,49";
const SUIT_SPIKE = "120,34 123,45 120,57 117,45";
const SUIT_HEAD = [SUIT_SHELL, SUIT_CREST, mirror(SUIT_CREST), SUIT_HORN, mirror(SUIT_HORN), SUIT_SPIKE];
// MAX adds faceted temple fins; ULTRA carries cheek blades and a forehead jewel.
const SUIT_FIN = "102,68 95,60 92,49 99,57 106,64";
const SUIT_BLADE = "104,78 96,72 92,62 100,67 108,74";
const SUIT_CRESTS = {
  standard: [SUIT_CREST, mirror(SUIT_CREST), SUIT_HORN, mirror(SUIT_HORN), SUIT_SPIKE],
  max: [SUIT_CREST, mirror(SUIT_CREST), SUIT_SPIKE, SUIT_FIN, mirror(SUIT_FIN)],
  ultra: [
    SUIT_CREST,
    mirror(SUIT_CREST),
    SUIT_BLADE,
    mirror(SUIT_BLADE),
    "120,40 124,49 120,58 116,49",
  ],
} as const;
const SUIT_FACE = "120,60 110,57 101,59 104,70 111,80 120,89";
const SUIT_EYE = "103,59 109,59 120,73 120,83";

// Shoulders: a fan of plumes round a gold-rimmed jewel with a star.
const SUIT_PLUMES = [
  "71,99 63,79 59,57 68,76 77,96",
  "67,102 51,84 38,65 55,79 71,98",
  "64,107 41,98 22,95 43,91 67,103",
  "62,113 39,112 19,116 40,106 63,109",
  "63,119 44,129 25,141 41,124 62,115",
  "67,124 54,138 39,151 49,132 65,121",
  "83,99 87,87 93,76 91,90 87,101",
];
const SUIT_SHOULDER = [circleOutline(76, 111, 15), circleOutline(76, 111, 11)];
const SUIT_STAR = "76,103 78,109 84,111 78,113 76,119 74,113 68,111 74,109";
const SUIT_PENDANT = "76,128 78.5,139 76,152 73.5,139";
// Arms: gold-banded forearms with a crystal, black gauntlet fists.
const SUIT_UPPER_ARM = "57,136 71,138 66,152 63,167 49,167 51,150";
const SUIT_FOREARM = "48,167 64,167 62,190 59,220 35,220 33,197 39,178";
const SUIT_BANDS = [
  "39,176 63,170 63,174 39,181",
  "35,195 62,188 62,192 35,199",
  "34,209 60,203 60,207 34,213",
];
const SUIT_ARM_GEM = "33,184 40,179 42,199 37,216 31,205";
const SUIT_CUFF = "33,220 60,220 61,228 32,228";
const SUIT_FIST = "34,228 59,228 61,240 56,252 40,252 33,242";
// Chest: pectoral plates round the spiral housing of the core.
const SUIT_PEC = "120,104 106,100 92,112 88,132 96,148 108,157 120,152";
const SUIT_RIB = "91,140 99,156 104,171 97,171 90,156";
const SUIT_ABDOMEN = "107,157 120,152 133,157 137,171 120,177 103,171";
const SUIT_HOUSING = [circleOutline(120, 128, 22), circleOutline(120, 128, 9)];
const SUIT_SPIRAL = Array.from({ length: 6 }, (_, index) =>
  rotateOutline("120,106 136,109 144,122 130,116 119,114 110,118", (index * Math.PI) / 3, 120, 128),
);
// Waist: a segmented belt with crystal cells and a round central jewel.
const SUIT_BELT_CELLS = [80, 87, 94, 101].map((x) => `${x},179 ${x + 6},179 ${x + 6},198 ${x},198`);
const SUIT_BELT_GEMS = [83, 90, 97, 104].map((x) => `${x},181 ${x + 1.6},188.5 ${x},196 ${x - 1.6},188.5`);
const SUIT_BELT = [circleOutline(120, 188, 12), circleOutline(120, 188, 8)];
const SUIT_BUCKLE = "87,168 96,169 101,179 93,179";
// The tasset: a long gold-edged V panel down the front, between the legs.
const SUIT_TASSET = "104,200 136,200 130,262 121,349 110,262";
const SUIT_TASSET_V = "110,200 120,244 130,200 127,200 120,232 113,200";
const SUIT_HIP_PENDANT = "49,300 51.5,318 49,337 46.5,318";
// Legs: diamond crystals on the thighs and knees in gold almond frames.
const SUIT_THIGH = "72,202 104,202 104,232 100,262 94,280 70,282 66,250 68,222";
const SUIT_THIGH_FRAME = "90,224 103,250 90,278 77,250";
const SUIT_THIGH_GEM = "90,230 98,250 90,272 82,250";
const SUIT_KNEE = "76,278 91,300 75,339 60,300";
const SUIT_KNEE_GEM = "76,286 83,301 76,316 69,301";
const SUIT_SHIN = "62,326 84,326 82,358 81,381 62,381 60,354";
const SUIT_BOOT_CUFF = "58,380 83,380 85,392 71,401 56,392";
const SUIT_BOOT = "56,392 85,392 82,420 80,446 36,446 34,438 50,426 52,406";
const SUIT_FOOT_GEM = "57,403 63,415 57,428 51,415";
// The tail: a segmented scorpion tail over the right shoulder, in four
// sections, ending in a hooked crystal blade; gold rings between segments.
const SUIT_TAIL_SPINE: readonly Point[] = [
  [153, 86],
  [156, 63],
  [161, 44],
  [170, 31],
  [183, 23],
  [197, 21],
  [211, 25],
  [222, 35],
  [228, 50],
  [228, 65],
  [223, 78],
  [217, 88],
];
const SUIT_TAIL_LINE = smooth(SUIT_TAIL_SPINE, 3);
const tailWidth = (i: number) => 15 - (7 * i) / (SUIT_TAIL_LINE.length - 1);
const SUIT_TAIL = [0, 1, 2, 3].map((section) => {
  const from = Math.round((section * (SUIT_TAIL_LINE.length - 1)) / 4);
  const to = Math.round(((section + 1) * (SUIT_TAIL_LINE.length - 1)) / 4);
  return band(SUIT_TAIL_LINE.slice(from, to + 1), tailWidth(from), tailWidth(to));
});
const SUIT_TAIL_RINGS = SUIT_TAIL_SPINE.slice(1, -1).map(([x, y], i) => {
  const [px, py] = SUIT_TAIL_SPINE[i];
  const [nx, ny] = SUIT_TAIL_SPINE[i + 2];
  const length = Math.hypot(nx - px, ny - py);
  const ux = (nx - px) / length;
  const uy = (ny - py) / length;
  const half = (15 - i * 0.6) / 2;
  return `${(x - uy * half).toFixed(1)},${(y + ux * half).toFixed(1)} ${(x + ux * 2.5).toFixed(1)},${(y + uy * 2.5).toFixed(1)} ${(x + uy * half).toFixed(1)},${(y - ux * half).toFixed(1)}`;
});
const SUIT_TAIL_BLADE = "218,85 231,101 229,123 222,143 214,122 211,101";
const SUIT_TAIL_BARBS = ["211,85 200,66 206,91", "214,25 233,38 236,54 224,41", "182,23 186,9 192,22"];
// Energy ribbons trailing from the arms and hips to the feet.
const SUIT_RIBBONS = [
  band(
    smooth(
      [
        [46, 150],
        [32, 168],
        [20, 196],
        [13, 228],
        [15, 262],
        [24, 300],
      ],
      3,
    ),
    5,
    0.6,
  ),
  band(
    smooth(
      [
        [66, 205],
        [50, 240],
        [37, 280],
        [29, 320],
        [32, 356],
        [40, 382],
      ],
      3,
    ),
    6,
    0.6,
  ),
  band(
    smooth(
      [
        [78, 228],
        [72, 270],
        [62, 318],
        [56, 350],
        [56, 372],
      ],
      3,
    ),
    4,
    0.6,
  ),
];
const SUIT_SILHOUETTE =
  "M120 89 108 93 95 99 83 108 66 112 58 140 50 166 33 196 33 242 40 252 56 252 61 228 62 196 70 168 86 156 98 170 92 200 72 202 66 250 61 300 60 356 62 381 56 392 34 438 36 446 80 446 82 392 84 326 94 280 104 232 120 222";
const mirrorPath = (path: string) =>
  path.replace(/(\d+(?:\.\d+)?) (\d+(?:\.\d+)?)/g, (_, x, y) => `${SUIT_W - Number(x)} ${y}`);

// The gold trims, per plate group (index: legs 0, arms 1, chest 2, head 3,
// tail 4); gold reaches them last.
const SUIT_LEG_TRIM = [SUIT_THIGH_FRAME, SUIT_KNEE, SUIT_BOOT_CUFF, SUIT_HIP_PENDANT];
const SUIT_ARM_TRIM = [...SUIT_SHOULDER, SUIT_PENDANT, ...SUIT_BANDS, SUIT_CUFF];
const SUIT_PLATES = [
  { name: "is-legs is-left", accent: SUIT_LEG_TRIM, index: 0 },
  { name: "is-legs is-right", accent: SUIT_LEG_TRIM.map(mirror), index: 0 },
  { name: "is-arms is-left", accent: SUIT_ARM_TRIM, index: 1 },
  { name: "is-arms is-right", accent: SUIT_ARM_TRIM.map(mirror), index: 1 },
  {
    name: "is-chest",
    accent: [
      ...SUIT_HOUSING,
      ...SUIT_SPIRAL,
      ...SUIT_BELT,
      ...SUIT_BELT_CELLS,
      ...SUIT_BELT_CELLS.map(mirror),
      SUIT_BUCKLE,
      mirror(SUIT_BUCKLE),
      SUIT_TASSET,
    ],
    index: 2,
  },
  { name: "is-head", accent: SUIT_HEAD.slice(1), index: 3 },
  { name: "is-tail", accent: [...SUIT_TAIL_RINGS, SUIT_TAIL_BLADE], index: 4 },
] as const;

// Resonance runs outward from the core: chest, then arms and the tail,
// then the legs and the ribbons.
const both = (shapes: readonly string[]) => [...shapes, ...shapes.map(mirror)];
const SUIT_ZONES = [
  [SUIT_PEC, mirror(SUIT_PEC), ...both([SUIT_RIB]), SUIT_ABDOMEN, ...SUIT_HOUSING, ...SUIT_BELT, SUIT_TASSET],
  [...both([...SUIT_PLUMES, SUIT_UPPER_ARM, SUIT_FOREARM, SUIT_FIST]), ...SUIT_TAIL, SUIT_TAIL_BLADE],
  [...both([SUIT_THIGH, SUIT_KNEE, SUIT_SHIN, SUIT_BOOT, ...SUIT_RIBBONS])],
];
const SUIT_PHASES = ["ice", "violet", "gold"] as const;
const SUIT_CORE = [120, 128] as const;

const percent = (value: number, total: number) => `${((value / total) * 100).toFixed(3)}%`;
// Closed outlines as one path: "M" starts each outline, its other points are
// implicit line-tos, "Z" closes it.
const outline = (shapes: readonly string[]) => shapes.map((points) => `M${points}Z`).join("");

// suitup3: the armour forms like nanotech. The owner's plate groups above
// stay exactly as drawn; for the formation each is carried by pieces cut
// along its own point lists (nothing redrawn), and each piece condenses
// out of a cloud of grains when the nanite front from the P14 core reaches
// it (REXONANCE_SUIT_FLOW). Tones: ice on the left, violet on the right,
// white at the centre; gold is never a plate colour, it lights the trims,
// the eyes and the jewels last.
type SuitTone = "ice" | "violet" | "white";
type SuitFlowKey = keyof typeof REXONANCE_SUIT_FLOW;
type SuitPiece = {
  name: string;
  shapes: readonly string[];
  // Crystal inlays drawn in the piece (diamonds, the star, belt cells).
  gems?: readonly string[];
  tone: SuitTone;
  flow: SuitFlowKey;
  // Where a growing piece grows from, and how it starts (turn, scale).
  pivot?: readonly [number, number];
  turn?: number;
  grow?: readonly [number, number];
};
const mirrorPivot = ([x, y]: readonly [number, number]) => [SUIT_W - x, y] as const;
const SUIT_JEWEL = [76, 111] as const;
const SUIT_CREST_PIVOT = [113, 56] as const;
const SUIT_NECK = [120, 89] as const;
const sided = (
  name: string,
  shapes: readonly string[],
  piece: Omit<SuitPiece, "name" | "shapes" | "tone">,
): SuitPiece[] => [
  { ...piece, name: `${name} is-left`, shapes, tone: "ice" },
  {
    ...piece,
    name: `${name} is-right`,
    shapes: shapes.map(mirror),
    gems: piece.gems?.map(mirror),
    tone: "violet",
    pivot: piece.pivot ? mirrorPivot(piece.pivot) : undefined,
    turn: piece.turn ? -piece.turn : undefined,
  },
];
const pick = (list: readonly string[], indices: number[]) => indices.map((index) => list[index]);
const ribbonTop = (ribbon: string) => ribbon.split(" ")[0].split(",").map(Number) as unknown as Point;
// Back to front: the tail and the ribbons behind, the plumes behind the
// arms, the chest in front.
const SUIT_PIECES: readonly SuitPiece[] = [
  ...SUIT_TAIL.map((shape, section) => ({
    name: "is-tail",
    shapes: [shape],
    tone: "violet" as const,
    flow: `tail${section}` as SuitFlowKey,
    pivot: SUIT_TAIL_LINE[Math.round((section * (SUIT_TAIL_LINE.length - 1)) / 4)],
    grow: [0.3, 0.3] as const,
  })),
  {
    name: "is-tail",
    shapes: SUIT_TAIL_BARBS,
    gems: [SUIT_TAIL_BLADE],
    tone: "violet",
    flow: "blade",
    pivot: [218, 85],
    turn: -30,
    grow: [0.3, 0.3],
  },
  ...SUIT_RIBBONS.flatMap((ribbon) =>
    sided("is-ribbon", [ribbon], { flow: "ribbons", pivot: ribbonTop(ribbon), grow: [1, 0.15] }),
  ),
  ...sided("is-legs", [SUIT_THIGH], { gems: [SUIT_THIGH_GEM], flow: "thigh" }),
  ...sided("is-legs", [SUIT_KNEE], { gems: [SUIT_KNEE_GEM], flow: "knee" }),
  ...sided("is-legs", [SUIT_SHIN], { flow: "shin" }),
  ...sided("is-legs", [SUIT_BOOT_CUFF, SUIT_BOOT], { gems: [SUIT_FOOT_GEM], flow: "boot" }),
  ...[
    [0, 1, 6],
    [2, 3],
    [4, 5],
  ].flatMap((plumes, layer) =>
    sided("is-arms is-plume", pick(SUIT_PLUMES, plumes), {
      flow: "blades",
      pivot: SUIT_JEWEL,
      turn: -20 + layer * 12,
      grow: [0.25, 0.25],
    }),
  ),
  ...sided("is-arms", [SUIT_SHOULDER[0], SUIT_PENDANT], { gems: [SUIT_STAR], flow: "shoulder" }),
  ...sided("is-arms", [SUIT_UPPER_ARM], { flow: "upperArm" }),
  ...sided("is-arms", [SUIT_FOREARM], { gems: [SUIT_ARM_GEM], flow: "forearm" }),
  ...sided("is-arms", [SUIT_CUFF, SUIT_FIST], { flow: "hand" }),
  ...sided("is-chest", [SUIT_RIB], { flow: "ribs" }),
  { name: "is-chest", shapes: [SUIT_PEC, mirror(SUIT_PEC)], tone: "white", flow: "chest" },
  { name: "is-chest", shapes: [SUIT_ABDOMEN], tone: "white", flow: "abdomen" },
  {
    name: "is-chest",
    shapes: [...SUIT_BELT_CELLS, ...SUIT_BELT_CELLS.map(mirror), ...SUIT_BELT, SUIT_TASSET],
    gems: [...SUIT_BELT_GEMS, ...SUIT_BELT_GEMS.map(mirror), SUIT_TASSET_V],
    tone: "white",
    flow: "pelvis",
  },
  {
    name: "is-iris",
    shapes: [...SUIT_HOUSING, ...SUIT_SPIRAL],
    tone: "white",
    flow: "iris",
    pivot: SUIT_CORE,
    turn: -120,
    grow: [0.2, 0.2],
  },
];
// The helmet rises up the neck and closes last.
const SUIT_HELM: readonly SuitPiece[] = [
  {
    name: "is-shell",
    shapes: [SUIT_SHELL],
    tone: "white",
    flow: "neck",
    pivot: SUIT_NECK,
    grow: [0.6, 0.12],
  },
  {
    name: "is-crest is-left",
    shapes: [SUIT_CREST, SUIT_HORN],
    tone: "white",
    flow: "crest",
    pivot: SUIT_CREST_PIVOT,
    turn: -14,
    grow: [0.5, 0.1],
  },
  {
    name: "is-crest is-right",
    shapes: [mirror(SUIT_CREST), mirror(SUIT_HORN)],
    tone: "white",
    flow: "crest",
    pivot: mirrorPivot(SUIT_CREST_PIVOT),
    turn: 14,
    grow: [0.5, 0.1],
  },
  {
    name: "is-spike",
    shapes: [SUIT_SPIKE],
    tone: "white",
    flow: "spike",
    pivot: [120, 57],
    grow: [0.5, 0.1],
  },
];
// Nanite grains: a few deterministic dots inside each piece's outlines
// (seeded, so server and client draw the same), one path per piece.
type Polygon = number[][];
const inside = (polygon: Polygon, px: number, py: number) => {
  let hit = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    const crosses = yi > py !== yj > py;
    if (crosses && ((xj - xi) * (py - yi)) / (yj - yi) + xi - px > 0) hit = !hit;
  }
  return hit;
};
const bounds = (shapes: readonly string[]) => {
  const coordinates = shapes.flatMap((points) =>
    points.split(" ").map((pair) => pair.split(",").map(Number)),
  );
  const xs = coordinates.map(([x]) => x);
  const ys = coordinates.map(([, y]) => y);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)] as const;
};
const grains = (shapes: readonly string[], seed: number, count: number) => {
  let state = seed;
  const random = () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
  // Parsed once per piece: each try only tests numbers.
  const polygons: Polygon[] = shapes.map((points) =>
    points.split(" ").map((pair) => pair.split(",").map(Number)),
  );
  const [x0, y0, x1, y1] = bounds(shapes);
  let path = "";
  for (let found = 0, tries = 0; found < count && tries < count * 40; tries += 1) {
    const x = x0 + random() * (x1 - x0);
    const y = y0 + random() * (y1 - y0);
    if (!polygons.some((polygon) => inside(polygon, x, y))) continue;
    path += `M${x.toFixed(1)} ${y.toFixed(1)}h1.6v1.6h-1.6z`;
    found += 1;
  }
  return path;
};
const grainCount = (shapes: readonly string[]) => {
  const [x0, y0, x1, y1] = bounds(shapes);
  return Math.max(6, Math.min(28, Math.round(((x1 - x0) * (y1 - y0)) / 160)));
};
// The front's direction: from the core to the piece, as a fraction of the
// figure's height (a piece starts a little nearer the core and flows out).
const flowStyle = (piece: SuitPiece) => {
  const [x0, y0, x1, y1] = bounds(piece.shapes);
  return {
    "--rx-suit-t": `${REXONANCE_SUIT_FLOW[piece.flow]}ms`,
    "--rx-suit-fx": (((x0 + x1) / 2 - SUIT_CORE[0]) / SUIT_H).toFixed(3),
    "--rx-suit-fy": (((y0 + y1) / 2 - SUIT_CORE[1]) / SUIT_H).toFixed(3),
    ...(piece.turn ? { "--rx-suit-r": `${piece.turn}deg` } : null),
    ...(piece.grow ? { "--rx-suit-sx": piece.grow[0], "--rx-suit-sy": piece.grow[1] } : null),
  } as CSSProperties;
};
// Drawn once, on the first entry, then reused (server and client alike).
let SUIT_GRAINS: string[] | undefined;
const suitGrains = () =>
  (SUIT_GRAINS ??= [...SUIT_PIECES, ...SUIT_HELM].map((piece, index) =>
    grains(piece.shapes, index * 97 + 13, grainCount(piece.shapes)),
  ));
// The seed: a knot of grains at the core on RIDER！.
const SUIT_SEED = grains([circleOutline(SUIT_CORE[0], SUIT_CORE[1], 18)], 7, 26);

// Each part's label lands on the line its region forms (the helmet's on
// the last call).
const SUIT_PART_LINE = { CHEST: 0, ARMS: 1, LEGS: 2, HEAD: 3 } as const;
// Gold reaches the trims from the core outward: chest, arms and the tail,
// legs, and the helmet's crest last (SUIT_PLATES' index 2, 1 and 4, 0, 3).
const SUIT_TRIM_ZONE = [2, 1, 0, 3, 1];
// Alignment brackets bite on the joints as the frame locks on RIDER！:
// the core, the shoulders, the elbows, the knees.
const SUIT_JOINTS = [
  SUIT_CORE,
  [76, 111],
  [164, 111],
  [48, 167],
  [192, 167],
  [75, 301],
  [165, 301],
] as const;
// Plate light: a lit top edge over a darker body (fill), and a rim that is
// brightest where the light strikes (stroke). Colour stops per tone.
// Pink-magenta stands in for violet on the right, as in the artwork; the
// crystals (gems) are lighter, translucent ice and pink.
const SUIT_LIGHT: Record<string, { fill: string[]; rim: string[] }> = {
  ice: {
    fill: ["#79e8ff", "0.24", "#1c5872", "0.34", "#06111d", "0.86"],
    rim: ["#effdff", "1", "#79e8ff", "0.92", "#3c9fbd", "0.5"],
  },
  violet: {
    fill: ["#ff9ad8", "0.2", "#5a2350", "0.34", "#14081a", "0.86"],
    rim: ["#fff0fa", "1", "#ff9ad8", "0.92", "#b9558f", "0.5"],
  },
  white: {
    fill: ["#e2f2ff", "0.2", "#2b4a63", "0.32", "#060c17", "0.88"],
    rim: ["#ffffff", "1", "#d6ecf8", "0.9", "#7d9cb2", "0.5"],
  },
  "gem-ice": {
    fill: ["#e9fbff", "0.62", "#79e8ff", "0.42", "#2d6fa0", "0.32"],
    rim: ["#ffffff", "1", "#bff4ff", "0.9", "#79e8ff", "0.7"],
  },
  "gem-violet": {
    fill: ["#fff0fa", "0.6", "#ff8fd8", "0.4", "#7a2f8f", "0.32"],
    rim: ["#ffffff", "1", "#ffc4ec", "0.9", "#ff8fd8", "0.7"],
  },
};

const stops = (values: string[]) =>
  [0, 0.45, 1].map((offset, index) => (
    <stop
      key={offset}
      offset={offset}
      stopColor={values[index * 2]}
      stopOpacity={values[index * 2 + 1]}
    />
  ));

function SuitLight() {
  return (
    <svg className="rx-suit-defs" width="0" height="0" focusable="false">
      <defs>
        {Object.keys(SUIT_LIGHT).map((tone) => (
          <g key={tone}>
            <linearGradient id={`rx-suit-fill-${tone}`} x1="0" y1="0" x2="0.3" y2="1">
              {stops(SUIT_LIGHT[tone].fill)}
            </linearGradient>
            <linearGradient id={`rx-suit-rim-${tone}`} x1="0" y1="0" x2="0.2" y2="1">
              {stops(SUIT_LIGHT[tone].rim)}
            </linearGradient>
          </g>
        ))}
      </defs>
    </svg>
  );
}

function SuitShape({
  className,
  shapes,
  accent,
  pivot,
  bare,
  glint,
  cloud,
  style,
}: {
  className: string;
  shapes: readonly string[];
  // The SVG is the box itself (nothing to bite or to shut inside it).
  bare?: boolean;
  // A second, bright copy of the outline: the front's seam as it passes.
  glint?: boolean;
  // The piece's nanite grains (one path of dots).
  cloud?: string;
  // Outlines drawn in the accent stroke (the gold core housing).
  accent?: readonly string[];
  // A drawing point to scale or turn from (the core, a shoulder, a root).
  pivot?: readonly [number, number];
  style?: CSSProperties;
}) {
  const coordinates = [...shapes, ...(accent ?? [])].flatMap((points) =>
    points.split(" ").map((pair) => pair.split(",").map(Number)),
  );
  const xs = coordinates.map(([x]) => x);
  const ys = coordinates.map(([, y]) => y);
  const x = Math.min(...xs) - 2;
  const y = Math.min(...ys) - 2;
  const width = Math.max(...xs) + 2 - x;
  const height = Math.max(...ys) + 2 - y;
  const box = {
    ...style,
    left: percent(x, SUIT_W),
    top: percent(y, SUIT_H),
    width: percent(width, SUIT_W),
    height: percent(height, SUIT_H),
    transformOrigin: pivot
      ? `${percent(pivot[0] - x, width)} ${percent(pivot[1] - y, height)}`
      : undefined,
  };
  const drawing = (
    <>
      <path d={outline(shapes)} />
      {accent ? <path className="rx-suit-accent" d={outline(accent)} /> : null}
    </>
  );
  const view = `${x} ${y} ${width} ${height}`;
  if (bare) {
    return (
      <svg className={className} style={box} viewBox={view} preserveAspectRatio="none">
        {drawing}
      </svg>
    );
  }
  return (
    <i className={className} style={box}>
      <svg viewBox={view} preserveAspectRatio="none">
        {drawing}
      </svg>
      {glint ? (
        <svg className="rx-suit-glint" viewBox={view} preserveAspectRatio="none">
          <path d={outline(shapes)} />
        </svg>
      ) : null}
      {cloud ? (
        <svg className="rx-suit-cloud" viewBox={view} preserveAspectRatio="none">
          <path d={cloud} />
        </svg>
      ) : null}
    </i>
  );
}

// The stage card's accent: the helmet, its crest plate swapped for the form.
function SuitBadge() {
  const view = "73 4 94 91";
  return (
    <div className="rx-suit-badge">
      <svg className="rx-suit-badge-helmet" viewBox={view}>
        <path d={outline([SUIT_SHELL, SUIT_FACE, mirror(SUIT_FACE)])} />
      </svg>
      {/* The form's crest plate swaps in and seats with a rim glint. */}
      {(["standard", "max", "ultra"] as const).map((form) => (
        <div key={form} className={`rx-suit-crest is-${form}`}>
          <svg viewBox={view}>
            <path d={outline(SUIT_CRESTS[form])} />
          </svg>
          <svg className="rx-suit-crest-glint" viewBox={view}>
            <path d={outline(SUIT_CRESTS[form])} />
          </svg>
        </div>
      ))}
      <svg className="rx-suit-badge-eyes" viewBox={view}>
        <path d={outline([SUIT_EYE, mirror(SUIT_EYE)])} />
      </svg>
    </div>
  );
}

function Suit() {
  return (
    <div className="rx-suit">
      <SuitLight />
      {/* Interior HUD: the visor's curved edges and a heading strip. */}
      <i className="rx-suit-rim is-left" />
      <i className="rx-suit-rim is-right" />
      <i className="rx-suit-heading" />
      <div className="rx-suit-figure">
        {/* FAR UP！ scans the undersuit top to bottom: a frame that slides
            down over a drawing that holds still (two transforms). */}
        <i className="rx-suit-scan">
          <svg className="rx-suit-blueprint" viewBox="0 0 240 480" preserveAspectRatio="none">
            <path
              className="rx-suit-guides"
              d="M120 0V480M0 78H240M0 125H240M0 154H240M0 230H240M0 341H240M0 474H240"
            />
            <path d={`${SUIT_SILHOUETTE}${mirrorPath(SUIT_SILHOUETTE)}`} />
          </svg>
        </i>
        {SUIT_JOINTS.map(([x, y], index) => (
          <i
            key={`${x}-${y}`}
            className="rx-suit-joint"
            style={
              {
                left: percent(x, SUIT_W),
                top: percent(y, SUIT_H),
                "--rx-suit-j": index,
              } as CSSProperties
            }
          />
        ))}
        <svg
          className="rx-suit-seed"
          style={{
            left: percent(SUIT_CORE[0] - 20, SUIT_W),
            top: percent(SUIT_CORE[1] - 20, SUIT_H),
            width: percent(40, SUIT_W),
            height: percent(40, SUIT_H),
          }}
          viewBox={`${SUIT_CORE[0] - 20} ${SUIT_CORE[1] - 20} 40 40`}
        >
          <path d={SUIT_SEED} />
        </svg>
        {[...SUIT_PIECES, ...SUIT_HELM].map((piece, index) => (
          <SuitShape
            key={`${piece.name}-${index}`}
            className={`${index < SUIT_PIECES.length ? "rx-suit-plate" : "rx-suit-helm"} ${piece.name} is-${piece.tone}`}
            shapes={piece.shapes}
            accent={piece.gems}
            pivot={piece.pivot}
            glint
            cloud={suitGrains()[index]}
            style={flowStyle(piece)}
          />
        ))}
        <SuitShape className="rx-suit-face is-left" shapes={[SUIT_FACE]} />
        <SuitShape className="rx-suit-face is-right" shapes={[mirror(SUIT_FACE)]} />
        {SUIT_PLATES.map((plate) => (
          <SuitShape
            key={plate.name}
            className={`rx-suit-trim ${plate.name}`}
            shapes={plate.accent}
            bare
            style={{ "--rx-suit-z": SUIT_TRIM_ZONE[plate.index] } as CSSProperties}
          />
        ))}
        {SUIT_PHASES.map((phase, index) =>
          SUIT_ZONES.map((shapes, zone) => (
            <SuitShape
              key={`${phase}-${zone}`}
              className={`rx-suit-glow is-${phase}`}
              // The helmet forms last, so the resonance skips its outlines.
              shapes={shapes.filter((shape) => !SUIT_HEAD.includes(shape))}
              pivot={SUIT_CORE}
              bare
              style={{ "--rx-suit-k": index, "--rx-suit-z": zone } as CSSProperties}
            />
          )),
        )}
        {SUIT_PHASES.map((phase, index) => (
          <i
            key={phase}
            className={`rx-suit-ring is-${phase}`}
            style={{ "--rx-suit-k": index } as CSSProperties}
          />
        ))}
        {SUIT_PHASES.map((phase, index) => (
          <SuitShape
            key={phase}
            className={`rx-suit-eyes is-${phase}`}
            shapes={[SUIT_EYE, mirror(SUIT_EYE)]}
            bare
            style={{ "--rx-suit-k": index } as CSSProperties}
          />
        ))}
        <i className="rx-suit-core" />
        <i className="rx-suit-jewel" />
        <i className="rx-suit-lock" />
      </div>
      <div className="rx-suit-callouts">
        {REXONANCE_SUIT_PARTS.map((part) => (
          <p
            key={part}
            className={`rx-suit-callout is-${part.toLowerCase()}`}
            style={{ "--rx-suit-i": SUIT_PART_LINE[part] } as CSSProperties}
          >
            <span className="rx-suit-label">{part}</span>
            <i />
          </p>
        ))}
        <p className="rx-suit-callout is-lock">
          <span className="rx-suit-label">LOCK</span>
        </p>
      </div>
      <div className="rx-suit-boot">
        <p className="rx-suit-boot-title" style={{ "--rx-suit-i": 0 } as CSSProperties}>
          SYSTEM CHECK
        </p>
        {REXONANCE_SUIT_SYSTEMS.map(([name, status], index) => (
          <p key={name} style={{ "--rx-suit-i": index + 1 } as CSSProperties}>
            {name}
            <b>{status}</b>
          </p>
        ))}
      </div>
    </div>
  );
}

// Decorative only. LoadGate owns navigation, live status, cancellation and
// cover timing; the stage coordinator owns selection and the component's life.
// No browser reads or independent timers: server and client render identically.
export function RexonanceCallSequence({
  mode,
  phase,
  tier,
  stage = "standard",
}: RexonanceCallSequenceProps) {
  const entry = mode === "entry";
  return (
    <div
      className="rx-call-sequence"
      data-mode={mode}
      data-phase={phase}
      data-tier={tier}
      data-stage={stage}
      aria-hidden="true"
      style={
        {
          "--rx-call-cover": `${REXONANCE_ENTRY_TIMINGS.cover}ms`,
          "--rx-call-reveal": `${REXONANCE_ENTRY_TIMINGS.reveal}ms`,
          "--rx-call-stage-duration": `${REXONANCE_STAGE_DURATION_MS}ms`,
          // The call and its answer, for the ornaments that keep their beat.
          "--rx-call-rider-start": `${REXONANCE_CALL_BEATS[1].start}ms`,
          "--rx-call-chant-start": `${REXONANCE_CALL_BEATS[2].start}ms`,
          "--rx-call-chant-duration": `${REXONANCE_CALL_BEATS[2].duration}ms`,
          "--rx-call-response-start": `${REXONANCE_CALL_BEATS[3].start}ms`,
          "--rx-call-response-duration": `${REXONANCE_CALL_BEATS[3].duration}ms`,
          "--rx-call-final-start": `${REXONANCE_CALL_BEATS[4].start}ms`,
        } as CSSProperties
      }
    >
      {/* Three blades: the dark ground opens as an aperture (textless). */}
      <div className="rx-call-ground">
        <i />
        <i />
        <i />
      </div>
      <div className="rx-call-frame">
        <i className="rx-call-axis rx-call-axis-horizontal" />
        <i className="rx-call-axis rx-call-axis-vertical" />
        <i className="rx-call-brackets" />
      </div>
      {entry ? (
        <div className="rx-call-aperture">
          <i />
          <i />
          <i />
        </div>
      ) : (
        <div className="rx-call-signature">
          <i />
        </div>
      )}
      {entry ? <Suit /> : <SuitBadge />}
      <div className="rx-call-caption">
        <span>TRINITY RESONANCE</span>
        <span>{entry ? "P14 / FINAL ARRIVAL" : `P14 / ${REXONANCE_STAGE_LABELS[stage]}`}</span>
      </div>
      <div className="rx-call-words">
        {entry ? (
          REXONANCE_CALLS.map((call, index) => (
            <div
              key={`${index}-${call}`}
              className={`rx-call-beat${index < 2 ? " rx-call-opening" : ""}${index === 4 ? " rx-call-final" : ""}${index === 2 ? " rx-call-chant" : ""}${index === 3 ? " rx-call-repetition" : ""}`}
              data-call={call}
              style={
                {
                  "--rx-call-start": `${REXONANCE_CALL_BEATS[index].start}ms`,
                  "--rx-call-duration": `${REXONANCE_CALL_BEATS[index].duration}ms`,
                } as CSSProperties
              }
            >
              <CallLines index={index} />
            </div>
          ))
        ) : (
          <div className="rx-call-beat rx-call-final">
            <CallLines index={4} />
            <small className="rx-call-operating-stage">
              <span>OPERATING STAGE</span>
              <b>{REXONANCE_STAGE_LABELS[stage]}</b>
            </small>
          </div>
        )}
      </div>
      <div className="rx-call-meter">
        <i />
      </div>
    </div>
  );
}
