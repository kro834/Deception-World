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
        {/* Each line is a call and its answer: SA-GA！, then DEUS！ answers. */}
        <span>
          SA-GA！<span className="rx-call-answer">DEUS！</span>
        </span>
        <span>
          SA-GA！<span className="rx-call-answer">DEUS！</span>
        </span>
        <span>
          SA-GA！<span className="rx-call-answer">DEUS！</span>
        </span>
        <span>
          SA-GA！<span className="rx-call-answer">DEUS！</span>
        </span>
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

// The approved full-body Rexonance artwork, sculpted (suitup5, 2026-10-05)
// in a 240 x 480 drawing: a tall crown of splayed, upswept horns over a
// sharp V visor; fans of ten curved feather-blades sweeping up and out
// round big gold-rimmed star jewels; a broad chest tapering to a narrow
// waist round the spiral core and its curved vanes; a segmented crystal
// belt with a round jewel; the long gold V tasset between the side hip
// blades; long legs with almond gold frames and diamond crystals on the
// thighs and knees, curved spiked shin guards and pointed boots with gold
// cuffs; curved gauntlets with gold bracers and clenched fists; the
// segmented scorpion tail arching over the right shoulder to a hooked
// crystal blade; and S-shaped energy ribbons sweeping to the floor.
// Outlines are point lists; curve() rounds them where the artwork curves.
const SUIT_W = 240;
const SUIT_H = 480;
type Point = readonly [number, number];
const fmt = ([x, y]: Point) => `${x.toFixed(1)},${y.toFixed(1)}`;
const mirror = (points: string) =>
  points
    .split(" ")
    .map((pair) => {
      const [x, y] = pair.split(",");
      return `${(SUIT_W - Number(x)).toFixed(1)},${y}`;
    })
    .join(" ");
const circleOutline = (cx: number, cy: number, radius: number) =>
  Array.from({ length: 16 }, (_, index) => {
    const angle = (index * Math.PI) / 8;
    return fmt([cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius]);
  }).join(" ");
const catmull = (p0: Point, p1: Point, p2: Point, p3: Point, t: number): Point => {
  const at = (k: 0 | 1) =>
    0.5 *
    (2 * p1[k] +
      (-p0[k] + p2[k]) * t +
      (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t * t +
      (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t * t * t);
  return [at(0), at(1)];
};
// A smooth open spine through key points (`steps` per span).
const smooth = (points: readonly Point[], steps: number) => {
  const out: Point[] = [];
  for (let i = 0; i < points.length - 1; i += 1) {
    const p0 = points[Math.max(0, i - 1)];
    const p3 = points[Math.min(points.length - 1, i + 2)];
    for (let step = 0; step < steps; step += 1) {
      out.push(catmull(p0, points[i], points[i + 1], p3, step / steps));
    }
  }
  out.push(points[points.length - 1]);
  return out;
};
// A closed outline through key points, rounded between them; a point
// written "x,y*" stays a sharp corner (tips, chins, plate edges).
const curve = (spec: string, steps = 2) => {
  const nodes = spec.split(" ").map((token) => ({
    p: token.replace("*", "").split(",").map(Number) as unknown as Point,
    sharp: token.endsWith("*"),
  }));
  const n = nodes.length;
  const out: Point[] = [];
  nodes.forEach((a, i) => {
    const b = nodes[(i + 1) % n];
    const p0 = a.sharp ? a.p : nodes[(i - 1 + n) % n].p;
    const p3 = b.sharp ? b.p : nodes[(i + 2) % n].p;
    for (let step = 0; step < steps; step += 1) out.push(catmull(p0, a.p, b.p, p3, step / steps));
  });
  return out.map(fmt).join(" ");
};
// A tapering band along a spine (the tail's sections, the ribbons, blades).
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
    left.push(fmt([x + ox, y + oy]));
    right.unshift(fmt([x - ox, y - oy]));
  });
  return [...left, ...right].join(" ");
};
// A curved feather-blade from a root to its tip, bowed by `bend`: widest
// a little past its root, drawn to a point.
const blade = (root: Point, tip: Point, width: number, bend: number) => {
  const length = Math.hypot(tip[0] - root[0], tip[1] - root[1]);
  const nx = -(tip[1] - root[1]) / length;
  const ny = (tip[0] - root[0]) / length;
  const control: Point = [(root[0] + tip[0]) / 2 + nx * bend, (root[1] + tip[1]) / 2 + ny * bend];
  const left: string[] = [];
  const right: string[] = [];
  for (let i = 0; i <= 8; i += 1) {
    const t = i / 8;
    const at = (k: 0 | 1) =>
      (1 - t) * (1 - t) * root[k] + 2 * (1 - t) * t * control[k] + t * t * tip[k];
    const dx = 2 * (1 - t) * (control[0] - root[0]) + 2 * t * (tip[0] - control[0]);
    const dy = 2 * (1 - t) * (control[1] - root[1]) + 2 * t * (tip[1] - control[1]);
    const d = Math.hypot(dx, dy) || 1;
    const half = (width / 2) * Math.sin(Math.PI * (0.15 + 0.85 * t)) ** 0.8;
    // The leading edge bows out more than the trailing one (a feather).
    left.push(fmt([at(0) - (dy / d) * half * 1.25, at(1) + (dx / d) * half * 1.25]));
    right.unshift(fmt([at(0) + (dy / d) * half * 0.75, at(1) - (dx / d) * half * 0.75]));
  }
  return [...left.slice(0, -1), ...right].join(" ");
};

// Helmet: a tall crown of splayed, upswept horns over a sharp V visor.
const SUIT_SHELL = curve(
  "120,37 131,40 138,47 141,58 139,70 133,80 120,91* 107,80 101,70 99,58 102,47 109,40",
);
const SUIT_CREST = curve("103,12* 100,25 100,37 103,49 109,59 115,67* 112,55 108,42 105,27");
const SUIT_HORN = curve("92,36* 95,49 101,59 106,66* 102,57 97,47");
const SUIT_SPIKE = curve("120,31* 123,44 122,58 120,67* 118,58 117,44");
const SUIT_HEAD = [
  SUIT_SHELL,
  SUIT_CREST,
  mirror(SUIT_CREST),
  SUIT_HORN,
  mirror(SUIT_HORN),
  SUIT_SPIKE,
];
// MAX adds faceted temple fins; ULTRA carries cheek blades and a forehead jewel.
const SUIT_FIN = curve("90,52* 95,62 103,70* 98,63");
const SUIT_BLADE = curve("92,64* 98,72 106,79* 100,70");
const SUIT_CRESTS = {
  standard: [SUIT_CREST, mirror(SUIT_CREST), SUIT_HORN, mirror(SUIT_HORN), SUIT_SPIKE],
  max: [
    SUIT_CREST,
    mirror(SUIT_CREST),
    SUIT_SPIKE,
    SUIT_FIN,
    mirror(SUIT_FIN),
    SUIT_HORN,
    mirror(SUIT_HORN),
  ],
  ultra: [
    SUIT_CREST,
    mirror(SUIT_CREST),
    SUIT_BLADE,
    mirror(SUIT_BLADE),
    "120,40 124,49 120,58 116,49",
  ],
} as const;
const SUIT_FACE = curve("120,61 112,59 103,59* 105,68 110,77 116,85 120,91*");
const SUIT_EYE = "103,61 109,63 116,72 120,79 120,86 115,79 108,70";

// Shoulders: ten curved feather-blades swept up and out round a big
// gold-rimmed jewel with a four-point star.
const SUIT_JEWEL = [74, 112] as const;
const plume = (tip: Point, width: number, bend: number) => {
  const length = Math.hypot(tip[0] - SUIT_JEWEL[0], tip[1] - SUIT_JEWEL[1]);
  const root: Point = [
    SUIT_JEWEL[0] + ((tip[0] - SUIT_JEWEL[0]) / length) * 11,
    SUIT_JEWEL[1] + ((tip[1] - SUIT_JEWEL[1]) / length) * 11,
  ];
  return blade(root, tip, width, bend);
};
const SUIT_PLUMES = [
  plume([44, 152], 9, -9),
  plume([28, 141], 10, -13),
  plume([15, 126], 12, -15),
  plume([11, 107], 12, -15),
  plume([15, 88], 12, -15),
  plume([25, 69], 12, -15),
  plume([39, 55], 11, -14),
  plume([57, 45], 10, -12),
  plume([77, 50], 8, -8),
  plume([94, 66], 6, -5),
];
const SUIT_SHOULDER = [circleOutline(74, 112, 14), circleOutline(74, 112, 10.5)];
const SUIT_STAR = "74,101 76,110 85,112 76,114 74,123 72,114 63,112 72,110";
const SUIT_PENDANT = "74,138 77,149 74,161 71,149";
// Arms: a muscular upper arm, curved gauntlet plates with gold bracers, a
// crystal on the gauntlet, a gold cuff and a clenched fist.
const SUIT_UPPER_ARM = curve("60,127 70,131 70,146 65,162* 50,168* 47,154 51,138");
const SUIT_FOREARM = curve("50,165* 63,169 62,188 57,207 53,221* 34,222* 31,206 32,188 39,173");
const SUIT_BANDS = [
  curve("37,177* 57,168 61,171* 40,183*"),
  curve("33,193* 59,184 61,188* 34,199*"),
  curve("32,208* 56,199 57,203* 33,213*"),
];
const SUIT_ARM_GEM = curve("32,186* 38,182 40,200 36,216* 31,205");
const SUIT_CUFF = curve("33,219* 55,218 57,228* 32,228*");
const SUIT_FIST = curve("34,228* 57,228* 61,238 59,249 49,256 39,253 33,243");
// Chest: broad pectoral plates tapering to a narrow waist round the
// spiral core and its curved vanes.
const SUIT_PEC = curve("120,99* 108,97 96,103 89,115 88,131 93,146 102,157 112,163 120,164*");
const SUIT_RIB = curve("90,138* 95,152 101,165 106,175* 99,172 91,160");
const SUIT_ABDOMEN = curve("106,164 120,160* 134,164 137,176* 120,180 103,176*");
const SUIT_HOUSING = [circleOutline(120, 128, 20), circleOutline(120, 128, 9)];
const SUIT_SPIRAL = Array.from({ length: 8 }, (_, i) => {
  const a0 = (i * Math.PI) / 4;
  const spine = Array.from({ length: 7 }, (_, k): Point => {
    const t = k / 6;
    const r = 10 + 17 * t;
    const a = a0 + t * 1.25;
    return [120 + Math.cos(a) * r, 128 + Math.sin(a) * r];
  });
  return band(spine, 2, 5.5);
});
// Waist: a segmented belt of crystal cells with a round central jewel.
const SUIT_BELT_CELLS = [80, 87, 94, 101].map((x) =>
  curve(`${x},180* ${x + 6},180* ${x + 6},198* ${x},198*`, 1),
);
const SUIT_BELT_GEMS = [83, 90, 97, 104].map(
  (x) => `${x},182 ${x + 1.7},189 ${x},196 ${x - 1.7},189`,
);
const SUIT_BELT = [circleOutline(120, 190, 12), circleOutline(120, 190, 8.5)];
const SUIT_BUCKLE = curve("90,170* 98,171 103,180* 94,180*");
// The tasset: a long gold V between the legs, and the side hip blades.
const SUIT_TASSET = curve("103,199* 137,199* 134,236 128,270 120,304* 112,270 106,236");
const SUIT_TASSET_V = "109,201 120,262 131,201 127,201 120,248 113,201";
const SUIT_TASSET_PENDANT = "120,316 124,332 120,350 116,332";
const SUIT_HIP_BLADE = curve("80,199* 70,214 62,242 56,272 51,301* 60,270 70,240 85,207*");
const SUIT_HIP_PENDANT = "47,318 50,331 47,345 44,331";
// Legs: long and tapered; almond gold frames with diamond crystals on the
// thighs and knees; curved spiked shin guards; pointed armoured boots with
// gold cuffs and a diamond.
const SUIT_THIGH = curve(
  "80,200* 104,202 104,224 101,248 95,272 87,291* 73,292* 66,272 64,248 67,222",
);
const SUIT_THIGH_FRAME = curve("92,223* 101,235 104,251 99,266 91,279* 81,265 78,250 82,236");
const SUIT_THIGH_GEM = "92,232 99,251 91,270 84,251";
const SUIT_KNEE = curve("75,275* 85,284 90,299 86,314 74,334* 63,316 60,299 65,284");
const SUIT_KNEE_GEM = "75,289 82,303 75,318 68,303";
const SUIT_SHIN = curve("64,326* 82,326* 85,346 82,366 79,385* 61,385* 58,364 59,343");
const SUIT_SHIN_SPIKES = [
  curve("57,384* 53,368 52,351* 57,365 61,381*"),
  curve("81,386* 87,371 92,356* 89,373 85,388*"),
];
const SUIT_BOOT_CUFF = curve("49,402* 52,394 65,381* 82,391 88,402* 66,394");
const SUIT_BOOT = curve("52,399* 84,400* 82,416 79,432 76,446* 38,446* 35,440* 42,431 50,419");
const SUIT_TOE = curve("35,440* 42,432 55,429 70,433 76,446* 38,446*");
const SUIT_FOOT_GEM = "57,406 62,417 56,428 51,417";
// The tail: a segmented scorpion tail arching over the right shoulder in
// four sections to a hooked crystal blade; gold rings between segments
// and gold barbs along its crest.
const SUIT_TAIL_SPINE: readonly Point[] = [
  [150, 90],
  [153, 67],
  [160, 47],
  [171, 33],
  [185, 25],
  [200, 22],
  [214, 27],
  [225, 38],
  [230, 52],
  [229, 66],
  [224, 79],
  [216, 89],
];
const SUIT_TAIL_LINE = smooth(SUIT_TAIL_SPINE, 3);
const tailWidth = (i: number) => 22 - (11 * i) / (SUIT_TAIL_LINE.length - 1);
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
  const half = (22 - i * 1.05) / 2;
  return `${fmt([x - uy * half, y + ux * half])} ${fmt([x + ux * 3, y + uy * 3])} ${fmt([x + uy * half, y - ux * half])}`;
});
const SUIT_TAIL_BLADE = curve(
  "202,78* 207,92 213,107 220,123 228,143* 230,121 228,104 222,90 212,82",
);
const SUIT_TAIL_BARBS = [
  curve("165,37* 158,24* 171,32*", 1),
  curve("181,27* 186,11* 192,24*", 1),
  curve("212,26* 226,16* 223,32*", 1),
  curve("205,96* 199,80 201,67* 208,84*"),
  curve("222,98* 232,86 237,76* 230,97*"),
];
// Energy ribbons: S-shaped sweeps from the arms and the hips to the floor.
const SUIT_RIBBONS = [
  band(
    smooth(
      [
        [52, 134],
        [33, 152],
        [20, 180],
        [17, 212],
        [24, 244],
        [22, 272],
      ],
      3,
    ),
    6,
    0.5,
  ),
  band(
    smooth(
      [
        [62, 252],
        [46, 282],
        [31, 312],
        [24, 342],
        [29, 368],
        [42, 390],
      ],
      3,
    ),
    9,
    0.5,
  ),
  band(
    smooth(
      [
        [68, 300],
        [58, 326],
        [50, 350],
        [52, 372],
        [60, 386],
      ],
      3,
    ),
    5,
    0.5,
  ),
];
const SUIT_SILHOUETTE =
  "M120 91 104 96 90 104 76 98 60 104 50 128 46 152 36 172 31 192 31 210 34 222 33 243 39 253 49 256 59 249 61 238 57 222 62 190 68 168 86 150 92 162 100 172 103 178 80 198 67 222 64 248 66 272 62 296 59 318 58 344 58 364 61 385 50 400 42 431 35 440 38 446 76 446 79 432 84 400 85 346 92 300 101 248 104 224 110 200 120 200";
const mirrorPath = (path: string) =>
  path.replace(/(\d+(?:\.\d+)?) (\d+(?:\.\d+)?)/g, (_, x, y) => `${SUIT_W - Number(x)} ${y}`);

// The gold trims, per plate group (index: legs 0, arms 1, chest 2, head 3,
// tail 4); gold reaches them last.
const SUIT_LEG_TRIM = [
  SUIT_THIGH_FRAME,
  SUIT_KNEE,
  SUIT_BOOT_CUFF,
  SUIT_TOE,
  SUIT_HIP_BLADE,
  SUIT_HIP_PENDANT,
];
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
      SUIT_TASSET_PENDANT,
    ],
    index: 2,
  },
  { name: "is-head", accent: SUIT_HEAD.slice(1), index: 3 },
  { name: "is-tail", accent: [...SUIT_TAIL_RINGS, ...SUIT_TAIL_BARBS.slice(0, 3)], index: 4 },
] as const;

// Resonance runs outward from the core: chest, then arms and the tail,
// then the legs and the ribbons.
const both = (shapes: readonly string[]) => [...shapes, ...shapes.map(mirror)];
const SUIT_ZONES = [
  [
    SUIT_PEC,
    mirror(SUIT_PEC),
    ...both([SUIT_RIB]),
    SUIT_ABDOMEN,
    ...SUIT_HOUSING,
    ...SUIT_BELT,
    SUIT_TASSET,
  ],
  [
    ...both([...SUIT_PLUMES, SUIT_UPPER_ARM, SUIT_FOREARM, SUIT_FIST]),
    ...SUIT_TAIL,
    SUIT_TAIL_BLADE,
  ],
  [...both([SUIT_THIGH, SUIT_KNEE, SUIT_SHIN, SUIT_BOOT, SUIT_HIP_BLADE, ...SUIT_RIBBONS])],
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
type SuitTone = "ice" | "violet" | "white" | "gold";
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
const SUIT_CREST_PIVOT = [113, 64] as const;
const SUIT_NECK = [120, 91] as const;
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
const ribbonTop = (ribbon: string) =>
  ribbon.split(" ")[0].split(",").map(Number) as unknown as Point;
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
    shapes: SUIT_TAIL_BARBS.slice(3),
    gems: [SUIT_TAIL_BLADE],
    tone: "violet",
    flow: "blade",
    pivot: [212, 82],
    turn: -30,
    grow: [0.3, 0.3],
  },
  ...SUIT_RIBBONS.flatMap((ribbon) =>
    sided("is-ribbon", [ribbon], { flow: "ribbons", pivot: ribbonTop(ribbon), grow: [1, 0.15] }),
  ),
  ...sided("is-legs", [SUIT_HIP_BLADE], { gems: [SUIT_HIP_PENDANT], flow: "pelvis" }),
  ...sided("is-legs", [SUIT_THIGH], { gems: [SUIT_THIGH_GEM], flow: "thigh" }),
  ...sided("is-legs", [SUIT_KNEE], { gems: [SUIT_KNEE_GEM], flow: "knee" }),
  ...sided("is-legs", [SUIT_SHIN, ...SUIT_SHIN_SPIKES], { flow: "shin" }),
  ...sided("is-legs", [SUIT_BOOT, SUIT_BOOT_CUFF, SUIT_TOE], {
    gems: [SUIT_FOOT_GEM],
    flow: "boot",
  }),
  // The ten feather-blades in three layers, back to front.
  ...[
    [0, 1, 2],
    [3, 4, 5, 6],
    [7, 8, 9],
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
    gems: [...SUIT_BELT_GEMS, ...SUIT_BELT_GEMS.map(mirror), SUIT_TASSET_V, SUIT_TASSET_PENDANT],
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
    tone: "gold",
    flow: "crest",
    pivot: SUIT_CREST_PIVOT,
    turn: -14,
    grow: [0.5, 0.1],
  },
  {
    name: "is-crest is-right",
    shapes: [mirror(SUIT_CREST), mirror(SUIT_HORN)],
    tone: "gold",
    flow: "crest",
    pivot: mirrorPivot(SUIT_CREST_PIVOT),
    turn: 14,
    grow: [0.5, 0.1],
  },
  {
    name: "is-spike",
    shapes: [SUIT_SPIKE],
    tone: "gold",
    flow: "spike",
    pivot: [120, 67],
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
  // Parsed once per piece: each try only tests numbers. A rounded outline
  // is tested on every other point, which is close enough for a scatter of
  // grains and half the work.
  const polygons: Polygon[] = shapes.map((points) => {
    const all = points.split(" ").map((pair) => pair.split(",").map(Number));
    return all.length > 12 ? all.filter((_, index) => index % 2 === 0) : all;
  });
  const [x0, y0, x1, y1] = bounds(shapes);
  let path = "";
  for (let found = 0, tries = 0; found < count && tries < count * 40; tries += 1) {
    const x = x0 + random() * (x1 - x0);
    const y = y0 + random() * (y1 - y0);
    if (!polygons.some((polygon) => inside(polygon, x, y))) continue;
    const size = [1.2, 1.7, 2.4][found % 3];
    path += `M${x.toFixed(1)} ${y.toFixed(1)}h${size}v${size}h-${size}z`;
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
// The halos' places and widths (drawing units): the shoulder jewels, the
// eyes, the core and the belt jewel.
const SUIT_HALOS = [
  { name: "shoulder is-left", at: SUIT_JEWEL, size: 64 },
  { name: "shoulder is-right", at: mirrorPivot(SUIT_JEWEL), size: 64 },
  { name: "eyes", at: [120, 72] as const, size: 60 },
  { name: "core", at: SUIT_CORE, size: 96 },
  { name: "jewel", at: [120, 190] as const, size: 44 },
] as const;
// Alignment brackets bite on the joints as the frame locks on RIDER！:
// the core, the shoulders, the elbows, the knees.
const SUIT_JOINTS = [
  SUIT_CORE,
  [74, 112],
  [166, 112],
  [50, 166],
  [190, 166],
  [75, 303],
  [165, 303],
] as const;
// Plate light (rx4): opaque black armour lit from the top left. Each tone's
// fill runs from a specular edge through a short tinted falloff into a near-
// black body; the rim is brightest where the light strikes. A diagonal sheen
// band lies over every plate, a dark bevel under its rim. Pink-magenta stands
// in for violet on the right, as in the artwork; the crystals (gems) are
// bright, faceted ice and pink; gold is the crown's and the trims'. Stops are
// [offset, colour, opacity].
type SuitStop = readonly [number, string, string];
type SuitGradient = { fill: readonly SuitStop[]; rim: readonly SuitStop[]; axis?: string };
const SUIT_LIGHT: Record<string, SuitGradient> = {
  ice: {
    fill: [
      [0, "#d7f8ff", "0.95"],
      [0.07, "#79e8ff", "0.55"],
      [0.2, "#163a52", "0.98"],
      [0.6, "#0a1522", "1"],
      [1, "#03060c", "1"],
    ],
    rim: [
      [0, "#ffffff", "1"],
      [0.3, "#a4f0ff", "0.95"],
      [1, "#2c7b96", "0.65"],
    ],
  },
  violet: {
    fill: [
      [0, "#ffdcf2", "0.95"],
      [0.07, "#ff8fd8", "0.55"],
      [0.2, "#3f163c", "0.98"],
      [0.6, "#170a1e", "1"],
      [1, "#06030a", "1"],
    ],
    rim: [
      [0, "#ffffff", "1"],
      [0.3, "#ffb4e6", "0.95"],
      [1, "#98407a", "0.65"],
    ],
  },
  white: {
    fill: [
      [0, "#ffffff", "0.96"],
      [0.07, "#dcedff", "0.55"],
      [0.2, "#22364a", "0.98"],
      [0.6, "#0c1520", "1"],
      [1, "#03060c", "1"],
    ],
    rim: [
      [0, "#ffffff", "1"],
      [0.3, "#e8f4fc", "0.95"],
      [1, "#6c8ca3", "0.65"],
    ],
  },
  gold: {
    fill: [
      [0, "#fff7dc", "0.98"],
      [0.1, "#f2d896", "0.85"],
      [0.32, "#8e6c2e", "1"],
      [0.7, "#3b2a10", "1"],
      [1, "#160f05", "1"],
    ],
    rim: [
      [0, "#fff9e6", "1"],
      [0.35, "#f0d49a", "0.95"],
      [1, "#8a6a30", "0.75"],
    ],
  },
  "gem-ice": {
    fill: [
      [0, "#ffffff", "0.98"],
      [0.32, "#c6f6ff", "0.9"],
      [0.7, "#3fb3dc", "0.82"],
      [1, "#14557e", "0.9"],
    ],
    rim: [
      [0, "#ffffff", "1"],
      [0.5, "#d2f8ff", "0.92"],
      [1, "#79e8ff", "0.85"],
    ],
  },
  "gem-violet": {
    fill: [
      [0, "#ffffff", "0.98"],
      [0.32, "#ffd6f0", "0.9"],
      [0.7, "#ef66bd", "0.82"],
      [1, "#5f2478", "0.9"],
    ],
    rim: [
      [0, "#ffffff", "1"],
      [0.5, "#ffdcf2", "0.92"],
      [1, "#ff8fd8", "0.85"],
    ],
  },
  // The energy ribbons: lit at their root, gone by the foot.
  "ribbon-ice": {
    axis: "down",
    fill: [
      [0, "#d7f8ff", "0.9"],
      [0.45, "#79e8ff", "0.5"],
      [1, "#79e8ff", "0"],
    ],
    rim: [
      [0, "#ffffff", "0.95"],
      [0.5, "#9eefff", "0.6"],
      [1, "#79e8ff", "0"],
    ],
  },
  "ribbon-violet": {
    axis: "down",
    fill: [
      [0, "#ffdcf2", "0.9"],
      [0.45, "#ff8fd8", "0.5"],
      [1, "#ff8fd8", "0"],
    ],
    rim: [
      [0, "#ffffff", "0.95"],
      [0.5, "#ffb4e6", "0.6"],
      [1, "#ff8fd8", "0"],
    ],
  },
  // The shoulder fans' feather-blades: crystal, lit at the root's edge.
  "plume-ice": {
    fill: [
      [0, "#e9fbff", "0.92"],
      [0.22, "#79e8ff", "0.72"],
      [0.6, "#1d5f92", "0.88"],
      [1, "#08142a", "0.96"],
    ],
    rim: [
      [0, "#fff7dc", "1"],
      [0.4, "#f0d49a", "0.95"],
      [1, "#8a6a30", "0.8"],
    ],
  },
  "plume-violet": {
    fill: [
      [0, "#ffe3f5", "0.92"],
      [0.22, "#ff8fd8", "0.72"],
      [0.6, "#7c2a6c", "0.88"],
      [1, "#1a0a22", "0.96"],
    ],
    rim: [
      [0, "#fff7dc", "1"],
      [0.4, "#f0d49a", "0.95"],
      [1, "#8a6a30", "0.8"],
    ],
  },
  // The sheen: one diagonal band of light across every plate.
  sheen: {
    axis: "diagonal",
    fill: [
      [0, "#ffffff", "0"],
      [0.4, "#ffffff", "0"],
      [0.5, "#ffffff", "0.26"],
      [0.6, "#ffffff", "0"],
      [1, "#ffffff", "0"],
    ],
    rim: [],
  },
};
const SUIT_AXES: Record<string, [string, string, string, string]> = {
  fill: ["0", "0", "0.3", "1"],
  rim: ["0", "0", "0.2", "1"],
  down: ["0", "0", "0", "1"],
  diagonal: ["0", "0", "1", "1"],
};

const stops = (values: readonly SuitStop[]) =>
  values.map(([offset, color, opacity]) => (
    <stop key={offset} offset={offset} stopColor={color} stopOpacity={opacity} />
  ));
const gradient = (id: string, kind: "fill" | "rim", light: SuitGradient) => {
  const [x1, y1, x2, y2] = SUIT_AXES[light.axis ?? kind];
  return (
    <linearGradient id={id} x1={x1} y1={y1} x2={x2} y2={y2}>
      {stops(light[kind])}
    </linearGradient>
  );
};

// A crystal's inner facet: its outline drawn toward its own centre.
const facet = (points: string, k = 0.46) => {
  const pts = points.split(" ").map((pair) => pair.split(",").map(Number));
  const cx = pts.reduce((sum, [x]) => sum + x, 0) / pts.length;
  const cy = pts.reduce((sum, [, y]) => sum + y, 0) / pts.length;
  return pts
    .map(([x, y]) => `${(cx + (x - cx) * k).toFixed(1)},${(cy + (y - cy) * k).toFixed(1)}`)
    .join(" ");
};

function SuitLight() {
  return (
    <svg className="rx-suit-defs" width="0" height="0" focusable="false">
      <defs>
        {Object.entries(SUIT_LIGHT).map(([tone, light]) => (
          <g key={tone}>
            {gradient(`rx-suit-fill-${tone}`, "fill", light)}
            {light.rim.length ? gradient(`rx-suit-rim-${tone}`, "rim", light) : null}
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
  soft,
  glint,
  cloud,
  style,
}: {
  className: string;
  shapes: readonly string[];
  // The SVG is the box itself (nothing to bite or to shut inside it).
  bare?: boolean;
  // A wider, softer copy under the line (the resonance's bleed).
  soft?: boolean;
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
  const body = outline(shapes);
  const drawing = bare ? (
    <>
      {soft ? <path className="rx-suit-soft" d={body} /> : null}
      <path d={body} />
    </>
  ) : (
    <>
      <path className="rx-suit-bevel" d={body} />
      <path d={body} />
      <path className="rx-suit-sheen" d={body} />
      {accent ? <path className="rx-suit-accent" d={outline(accent)} /> : null}
      {accent ? (
        <path className="rx-suit-facet" d={outline(accent.map((gem) => facet(gem)))} />
      ) : null}
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
      <SuitLight />
      <i className="rx-suit-badge-halo" />
      <svg className="rx-suit-badge-helmet" viewBox={view}>
        <path className="rx-suit-bevel" d={outline([SUIT_SHELL])} />
        <path d={outline([SUIT_SHELL])} />
        <path className="rx-suit-sheen" d={outline([SUIT_SHELL])} />
        <path className="rx-suit-badge-visor" d={outline([SUIT_FACE, mirror(SUIT_FACE)])} />
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
      {/* The light rig behind the figure: a backlight in the two tones, a
          floor under the boots and a faint lattice; it wakes with the HUD. */}
      <i className="rx-suit-stage">
        <i className="rx-suit-floor" />
      </i>
      <div className="rx-suit-figure">
        {/* The figure's cast shadow: its silhouette, set back and down. */}
        <svg className="rx-suit-shadow" viewBox="0 0 240 480" preserveAspectRatio="none">
          <path d={`${SUIT_SILHOUETTE}${mirrorPath(SUIT_SILHOUETTE)}`} />
        </svg>
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
              soft
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
        {/* Light halos: the shoulder jewels as they form, the eyes, the core
            and the belt jewel as they ignite. */}
        {SUIT_HALOS.map(({ name, at, size }) => (
          <i
            key={name}
            className={`rx-suit-halo is-${name}`}
            style={{
              left: percent(at[0], SUIT_W),
              top: percent(at[1], SUIT_H),
              width: percent(size, SUIT_W),
            }}
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
