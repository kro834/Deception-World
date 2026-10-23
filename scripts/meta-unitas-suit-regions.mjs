// META UNITAS SAGA (2026-10-23): the suit-up's regions and plate clips, in
// the owner's cutout frame (1024 x 1536, both forms in one frame: the helix
// at (512, 450), the belt's buckle at (512, 672), the soles on row ~1520).
//
// These are SAM's PROMPTS, not the cut: scripts/build-meta-unitas-suit.mjs
// --sam-prompts writes them to design/meta-unitas-saga-20261023/sam-masks/
// <form>/prompts.json, scripts/sam/make_masks.py segments each region on the
// art (the polygon is its prior, its box and its point samples) and moves
// every clip's straight cut onto the art's own edges; the build then reads
// the masks. Each region names its group (what the scene does with it):
//   halo    — the UNITAS HALO over the head (ミドル)
//   bits    — the four META UNITAS BIT (ミドル)
//   crystal — ULTRA's crystal units
//   tail    — QUINT CAUDIA, in segments from its root
//   manus   — TETRA MANUS, the four auxiliary arms (ウルトラ)
//   body    — the armour plates (the partition)
// Body regions and their plates carry the same ids in both forms, so the
// ULTRA overwrite turns each plate into its own crystal counterpart.

const MID = 1024;
const mirrorPoly = (points) => points.map(([x, y]) => [MID - x, y]);
const rect = (x0, y0, x1, y1) => [
  [x0, y0],
  [x1, y0],
  [x1, y1],
  [x0, y1],
];
const circle = (cx, cy, r, n = 28) =>
  Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    return [Math.round(cx + Math.cos(a) * r), Math.round(cy + Math.sin(a) * r)];
  });
const swapSide = (id) =>
  id
    .replace(/-l(?=$|-)/, "-R")
    .replace(/-r(?=$|-)/, "-l")
    .replace("-R", "-r");

/** A left-side region and its plates, mirrored for the right side. */
function pair(region) {
  const right = {
    id: swapSide(region.id),
    group: region.group,
    poly: mirrorPoly(region.poly),
    plates: region.plates.map((plate) => ({
      id: swapSide(plate.id),
      clip: plate.clip ? mirrorPoly(plate.clip) : null,
    })),
  };
  return [region, right];
}

// --- Shared body regions (the partition) ------------------------------------

const BODY_MIDDLE = [
  {
    id: "helmet",
    group: "body",
    poly: [
      [400, 20],
      [625, 20],
      [645, 200],
      [620, 300],
      [575, 340],
      [512, 352],
      [449, 340],
      [404, 300],
      [380, 200],
    ],
    plates: [
      { id: "helmet-horns", clip: rect(0, 0, 1024, 172) },
      { id: "helmet-face", clip: null },
    ],
  },
  {
    id: "chest",
    group: "body",
    poly: [
      [432, 300],
      [592, 300],
      [636, 360],
      [636, 520],
      [618, 640],
      [406, 640],
      [388, 520],
      [388, 360],
    ],
    plates: [
      { id: "chest-helix", clip: circle(512, 450, 84) },
      { id: "chest-l", clip: rect(0, 0, 512, 1536) },
      { id: "chest-r", clip: null },
    ],
  },
  ...pair({
    id: "pauldron-l",
    group: "body",
    poly: [
      [165, 262],
      [300, 236],
      [398, 262],
      [438, 330],
      [430, 450],
      [380, 520],
      [290, 530],
      [200, 500],
      [150, 420],
    ],
    plates: [
      { id: "pauldron-disc-l", clip: circle(341, 400, 54) },
      { id: "pauldron-top-l", clip: rect(0, 0, 1024, 352) },
      { id: "pauldron-l", clip: null },
    ],
  }),
  ...pair({
    id: "arm-l",
    group: "body",
    poly: [
      [200, 500],
      [330, 500],
      [348, 560],
      [342, 770],
      [300, 800],
      [176, 800],
      [160, 700],
      [170, 560],
    ],
    plates: [
      { id: "arm-upper-l", clip: rect(0, 0, 1024, 622) },
      { id: "arm-fore-l", clip: null },
    ],
  }),
  ...pair({
    id: "hand-l",
    group: "body",
    poly: [
      [174, 758],
      [312, 758],
      [306, 906],
      [250, 922],
      [180, 906],
      [168, 840],
    ],
    plates: [
      { id: "hand-cuff-l", clip: rect(0, 0, 1024, 806) },
      { id: "hand-l", clip: null },
    ],
  }),
  {
    id: "waist",
    group: "body",
    poly: [
      [330, 712],
      [694, 712],
      [740, 820],
      [722, 960],
      [600, 1000],
      [512, 944],
      [424, 1000],
      [302, 960],
      [284, 820],
    ],
    plates: [
      { id: "waist-l", clip: rect(0, 0, 456, 1536) },
      { id: "waist-c", clip: rect(456, 0, 568, 1536) },
      { id: "waist-r", clip: null },
    ],
  },
  ...pair({
    id: "thigh-l",
    group: "body",
    poly: [
      [300, 862],
      [490, 862],
      [502, 1000],
      [482, 1160],
      [300, 1160],
      [288, 1000],
    ],
    plates: [
      { id: "thigh-upper-l", clip: rect(0, 0, 1024, 1010) },
      { id: "thigh-l", clip: null },
    ],
  }),
  ...pair({
    id: "shin-l",
    group: "body",
    poly: [
      [266, 1150],
      [472, 1150],
      [462, 1362],
      [270, 1370],
    ],
    plates: [
      { id: "knee-l", clip: rect(0, 0, 1024, 1252) },
      { id: "shin-l", clip: null },
    ],
  }),
  ...pair({
    id: "foot-l",
    group: "body",
    poly: [
      [180, 1350],
      [432, 1340],
      [442, 1532],
      [168, 1532],
    ],
    plates: [{ id: "foot-l", clip: null }],
  }),
];

// --- ミドル's satellites -------------------------------------------------------

const MIDDLE_SATELLITES = [
  {
    id: "halo",
    group: "halo",
    poly: rect(392, 38, 634, 100),
    plates: [{ id: "halo", clip: null }],
  },
  {
    id: "bit-1",
    group: "bits",
    poly: [
      [240, 88],
      [248, 104],
      [216, 190],
      [202, 250],
      [178, 280],
      [150, 320],
      [112, 400],
      [96, 442],
      [82, 432],
      [90, 330],
      [96, 240],
      [110, 190],
      [150, 158],
      [200, 120],
    ],
    plates: [{ id: "bit-1", clip: null }],
  },
  {
    id: "bit-2",
    group: "bits",
    poly: [
      [146, 442],
      [152, 470],
      [134, 560],
      [138, 640],
      [114, 702],
      [72, 762],
      [48, 810],
      [32, 802],
      [34, 720],
      [16, 640],
      [20, 560],
      [58, 518],
      [110, 478],
    ],
    plates: [{ id: "bit-2", clip: null }],
  },
  {
    id: "bit-3",
    group: "bits",
    poly: [
      [846, 226],
      [882, 260],
      [942, 330],
      [980, 370],
      [978, 432],
      [962, 472],
      [988, 560],
      [972, 568],
      [930, 502],
      [890, 452],
      [868, 420],
      [870, 380],
      [858, 300],
    ],
    plates: [{ id: "bit-3", clip: null }],
  },
  {
    id: "bit-4",
    group: "bits",
    poly: [
      [876, 528],
      [906, 580],
      [952, 640],
      [1002, 680],
      [998, 742],
      [982, 772],
      [1002, 864],
      [990, 876],
      [950, 822],
      [910, 762],
      [888, 722],
      [894, 650],
      [878, 580],
    ],
    plates: [{ id: "bit-4", clip: null }],
  },
  {
    id: "tail-upper",
    group: "tail",
    poly: [
      [636, 40],
      [700, 10],
      [800, 0],
      [936, 0],
      [936, 300],
      [880, 262],
      [800, 200],
      [782, 250],
      [700, 256],
      [646, 250],
      [634, 150],
    ],
    plates: [
      { id: "tail-1", clip: rect(600, 140, 790, 320) },
      { id: "tail-2", clip: rect(600, 0, 800, 140) },
      { id: "tail-3", clip: null },
    ],
  },
  {
    id: "tail-lower",
    group: "tail",
    poly: [
      [150, 880],
      [250, 870],
      [300, 900],
      [290, 960],
      [222, 1010],
      [162, 1080],
      [152, 1150],
      [200, 1200],
      [300, 1208],
      [330, 1260],
      [312, 1322],
      [222, 1322],
      [120, 1282],
      [40, 1200],
      [14, 1090],
      [30, 990],
      [80, 930],
    ],
    plates: [
      { id: "tail-4", clip: rect(0, 860, 330, 1000) },
      { id: "tail-5", clip: rect(0, 1000, 330, 1180) },
      { id: "tail-6", clip: null },
    ],
  },
  {
    id: "tail-tip",
    group: "tail",
    poly: [
      [330, 1194],
      [470, 1184],
      [560, 1208],
      [622, 1234],
      [622, 1292],
      [560, 1302],
      [460, 1312],
      [380, 1312],
      [330, 1292],
    ],
    plates: [
      { id: "tail-7", clip: rect(300, 1150, 480, 1340) },
      { id: "tail-8", clip: null },
    ],
  },
];

// ミドル's エクスサーガドライバー: its own traced outline, claimed first (on the
// body from the start, as the Rexonance and Far From suit-ups keep theirs).
const MIDDLE_BELT = [
  [352, 640],
  [400, 632],
  [470, 640],
  [512, 628],
  [554, 640],
  [624, 632],
  [672, 640],
  [676, 712],
  [600, 716],
  [560, 724],
  [512, 730],
  [464, 724],
  [424, 716],
  [348, 712],
];

// --- ウルトラ ----------------------------------------------------------------

const ultraBody = () =>
  BODY_MIDDLE.map((region) => {
    // ウルトラ's crystal plumes and skirt blades reach wider: its priors grow
    // where its armour does (SAM finds the edges; these only point at them).
    if (region.id === "helmet")
      return {
        ...region,
        poly: [
          [418, 48],
          [606, 48],
          [628, 200],
          [612, 292],
          [562, 332],
          [512, 346],
          [462, 332],
          [412, 292],
          [396, 200],
        ],
        plates: [
          { id: "helmet-horns", clip: rect(0, 0, 1024, 182) },
          { id: "helmet-face", clip: null },
        ],
      };
    if (region.id === "pauldron-l" || region.id === "pauldron-r") {
      const left = [
        [176, 270],
        [300, 250],
        [410, 270],
        [450, 340],
        [440, 470],
        [390, 540],
        [300, 552],
        [210, 520],
        [160, 430],
      ];
      const poly = region.id === "pauldron-l" ? left : mirrorPoly(left);
      const disc = region.id === "pauldron-l" ? circle(361, 389, 54) : circle(663, 389, 54);
      return {
        ...region,
        poly,
        plates: region.plates.map((plate) =>
          plate.id.startsWith("pauldron-disc") ? { ...plate, clip: disc } : plate,
        ),
      };
    }
    if (region.id === "waist")
      return {
        ...region,
        poly: [
          [330, 704],
          [694, 704],
          [762, 760],
          [900, 1300],
          [800, 1332],
          [700, 1100],
          [600, 1000],
          [512, 1000],
          [424, 1000],
          [324, 1100],
          [224, 1332],
          [124, 1300],
          [262, 760],
        ],
      };
    return region;
  });

const ULTRA_MANUS = [
  ...pair({
    id: "manus-1-l",
    group: "manus",
    poly: [
      [60, 60],
      [170, 40],
      [250, 60],
      [300, 150],
      [322, 240],
      [292, 300],
      [230, 332],
      [150, 332],
      [40, 320],
      [6, 280],
      [0, 170],
      [20, 110],
    ],
    plates: [
      { id: "manus-fist-1-l", clip: rect(0, 0, 1024, 190) },
      { id: "manus-1-l", clip: null },
    ],
  }),
  ...pair({
    id: "manus-2-l",
    group: "manus",
    poly: [
      [0, 500],
      [70, 470],
      [140, 490],
      [160, 560],
      [142, 640],
      [160, 720],
      [184, 800],
      [180, 900],
      [140, 1010],
      [80, 1026],
      [14, 1000],
      [0, 920],
    ],
    plates: [
      { id: "manus-2-l", clip: rect(0, 0, 1024, 780) },
      { id: "manus-fist-2-l", clip: null },
    ],
  }),
];

const ULTRA_CRYSTALS = [
  ...pair({
    id: "crystal-1-l",
    group: "crystal",
    poly: rect(180, 10, 270, 106),
    plates: [{ id: "crystal-1-l", clip: null }],
  }),
  ...pair({
    id: "crystal-2-l",
    group: "crystal",
    poly: rect(300, 24, 400, 118),
    plates: [{ id: "crystal-2-l", clip: null }],
  }),
  ...pair({
    id: "crystal-3-l",
    group: "crystal",
    poly: rect(28, 354, 126, 478),
    plates: [{ id: "crystal-3-l", clip: null }],
  }),
  ...pair({
    id: "crystal-4-l",
    group: "crystal",
    poly: rect(150, 904, 246, 1020),
    plates: [{ id: "crystal-4-l", clip: null }],
  }),
];

const ULTRA_TAIL = [
  {
    id: "tail",
    group: "tail",
    poly: [
      [740, 926],
      [830, 930],
      [910, 966],
      [986, 1040],
      [1022, 1150],
      [1024, 1270],
      [1000, 1346],
      [920, 1396],
      [810, 1406],
      [754, 1380],
      [776, 1320],
      [850, 1300],
      [936, 1266],
      [956, 1190],
      [926, 1110],
      [866, 1046],
      [786, 1012],
      [742, 990],
    ],
    plates: [
      { id: "tail-1", clip: rect(700, 900, 1024, 1060) },
      { id: "tail-2", clip: rect(700, 1060, 1024, 1240) },
      { id: "tail-3", clip: null },
    ],
  },
];

const ULTRA_BELT = [
  [350, 636],
  [400, 628],
  [470, 636],
  [512, 624],
  [554, 636],
  [624, 628],
  [674, 636],
  [678, 708],
  [600, 714],
  [560, 722],
  [512, 728],
  [464, 722],
  [424, 714],
  [346, 708],
];

/** The forms' regions, satellites first (they claim before the body). */
export const META_UNITAS_REGIONS = Object.freeze({
  middle: [...MIDDLE_SATELLITES, ...BODY_MIDDLE],
  ultra: [...ULTRA_CRYSTALS, ...ULTRA_MANUS, ...ULTRA_TAIL, ...ultraBody()],
});

export const META_UNITAS_BELTS = Object.freeze({ middle: MIDDLE_BELT, ultra: ULTRA_BELT });

/** The frame's landmarks (cutout px). */
export const META_UNITAS_MARKS = Object.freeze({
  helix: [512, 450],
  visor: [512, 262],
  belt: [512, 672],
  halo: { cx: 512, cy: 68, rx: 114, ry: 15 },
  // Where ULTRA's arms unfold from (behind the shoulders and the ribs).
  manusPivot: {
    "manus-1-l": [330, 330],
    "manus-1-r": [694, 330],
    "manus-2-l": [250, 520],
    "manus-2-r": [774, 520],
  },
});
