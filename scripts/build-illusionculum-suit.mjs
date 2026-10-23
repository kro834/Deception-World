#!/usr/bin/env node
// ILLUSIONCULUM SAGA (2026-10-23): the scroll suit-up's raster parts, cut from
// the owner's four transparent cutouts (design/illusionculum-saga-20261023/
// cutout-<form>.webp, 1024 x 1536, one frame for all four: they land pixel
// for pixel over each other — checked here), the way
// scripts/build-far-from-suit.mjs cuts FAR FROM's. Reproducible:
//
//   node scripts/build-illusionculum-suit.mjs --sam-prompts   (writes the prompts)
//   <tools>/sam/venv/bin/python -I scripts/sam/make_masks.py --site illusionculum \
//       --model <tools>/sam/models/sam2.1-hiera-large
//   node scripts/build-illusionculum-suit.mjs                  (reads the masks)
//
// writes public/illusionculum-suit-20261023/*.webp and the generated module
// src/lib/illusionculum-suit.ts.
//
// The plates are cut by SAM (owner, 2026-10-23: 「イリュージョンとメタにも装甲
// 切り出しはSAMを用いて」): the polygons below are only its prompts; its masks
// (design/illusionculum-saga-20261023/sam-masks/plates/<id>.png, with
// manifest.json) are read here, so the build stays reproducible without SAM.
// The driver (the belt) keeps its traced outline and claims first. Every
// figure pixel belongs to exactly one plate: the masks' shares are
// renormalised under the cutout's alpha, what no mask holds goes to the
// nearest plate, and the build fails if any pixel is left over or doubled.
//
// The same wearer as Rexonance (月城悠真): the undersuit is Rexonance's, set
// into this frame so its soles and reactor socket sit where this figure's
// soles and chest reactor are, as FAR FROM's build sets it.
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);
const sharp = require(process.env.SHARP_MODULE || "sharp");
const ROOT = fileURLToPath(new URL("..", import.meta.url));
const importTs = (path) => import(pathToFileURL(join(ROOT, path)).href);
const { REXONANCE_SUIT_MARKS, REXONANCE_SUIT_UNDERSUIT } = await importTs("src/lib/rexonance-suit.ts");

const DESIGN = join(ROOT, "design/illusionculum-saga-20261023");
const SAM_DIR = join(DESIGN, "sam-masks");
const VERSION = "20261023";
const OUT_DIR = join(ROOT, `public/illusionculum-suit-${VERSION}/`);
const PUBLIC_PATH = `/illusionculum-suit-${VERSION}`;
const MODULE = join(ROOT, "src/lib/illusionculum-suit.ts");

// --- Geometry (cutout px of the 1024 x 1536 frame) ---------------------------
const W = 1024;
const H = 1536;
const N = W * H;
const MID = W;
const mirror = (points) => points.map(([x, y]) => [MID - x, y]);
const circle = (cx, cy, r, n = 32) =>
  Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    return [Math.round(cx + Math.cos(a) * r), Math.round(cy + Math.sin(a) * r)];
  });
const rect = (x0, y0, x1, y1) => [
  [x0, y0],
  [x1, y0],
  [x1, y1],
  [x0, y1],
];
const ALL = null;

// The face's lights: the blue V of the visor under the crest (traced over a
// gridded crop of the standard cutout).
const FACE_GLOW = [
  [470, 176],
  [492, 200],
  [506, 222],
  [512, 230],
  [518, 222],
  [532, 200],
  [554, 176],
  [550, 214],
  [534, 248],
  [522, 280],
  [512, 300],
  [502, 280],
  [490, 248],
  [474, 214],
];
// The chest reactor: the blue disc of the gold medallion.
const REACTOR = { cx: 512, cy: 452, r: 60 };
const REACTOR_GLOW = circle(REACTOR.cx, REACTOR.cy, REACTOR.r, 24);
const MARKS = {
  core: [REACTOR.cx, REACTOR.cy],
  visor: [512, 236],
  belt: [512, 672],
};
// The two リアクター・モア in the "more" cutouts (src/lib/illusionculum-saga-
// artwork.ts ILLUSIONCULUM_ORBS): their seats over the shoulders.
const ORBS = [
  [225, 196, 112],
  [799, 196, 112],
];

// --- The regions (SAM's prompts), front first --------------------------------
const SHOULDER_L = [
  [158, 336],
  [205, 286],
  [252, 254],
  [300, 268],
  [340, 300],
  [376, 330],
  [356, 400],
  [362, 470],
  [330, 500],
  [282, 522],
  [232, 522],
  [192, 486],
  [168, 426],
];
const ARM_UPPER_L = [
  [198, 504],
  [298, 500],
  [320, 556],
  [302, 600],
  [222, 600],
  [188, 560],
];
const FOREARM_L = [
  [164, 600],
  [222, 590],
  [302, 592],
  [332, 640],
  [322, 700],
  [282, 760],
  [190, 768],
  [170, 700],
];
const CUFF_L = [
  [174, 762],
  [286, 756],
  [292, 800],
  [174, 806],
];
const FIST_L = [
  [164, 802],
  [296, 798],
  [302, 860],
  [280, 908],
  [198, 908],
  [168, 862],
];
const CHEST_L = [
  [372, 332],
  [438, 300],
  [424, 350],
  [444, 392],
  [414, 440],
  [434, 520],
  [484, 560],
  [470, 600],
  [420, 600],
  [380, 560],
  [362, 480],
  [354, 400],
];
const TASSET_L = [
  [300, 700],
  [356, 706],
  [400, 714],
  [440, 714],
  [434, 800],
  [450, 880],
  [420, 892],
  [360, 862],
  [320, 802],
  [300, 742],
];
const THIGH_L = [
  [320, 862],
  [420, 882],
  [470, 902],
  [470, 980],
  [450, 1040],
  [330, 1040],
  [310, 960],
];
const SHIN_L = [
  [290, 1032],
  [450, 1032],
  [460, 1100],
  [440, 1200],
  [420, 1290],
  [300, 1300],
  [270, 1220],
  [280, 1120],
];
const BOOT_L = [
  [198, 1292],
  [300, 1292],
  [420, 1292],
  [422, 1380],
  [410, 1460],
  [380, 1532],
  [220, 1532],
  [198, 1480],
];
const CAPE_L = [
  [60, 862],
  [170, 880],
  [250, 872],
  [300, 882],
  [320, 980],
  [292, 1100],
  [270, 1300],
  [222, 1400],
  [160, 1440],
  [40, 1440],
  [18, 1400],
  [48, 1100],
];
// The belt: the driver, by its outline (claims first; never SAM's).
const BELT_OUTLINE = [
  [
    [356, 650],
    [400, 640],
    [440, 648],
    [470, 640],
    [512, 628],
    [554, 640],
    [584, 648],
    [624, 640],
    [668, 650],
    [668, 705],
    [624, 712],
    [584, 700],
    [554, 712],
    [512, 720],
    [470, 712],
    [440, 700],
    [400, 712],
    [356, 705],
  ],
];
const HALO = circle(512, 222, 236, 40).map(([x, y]) => [x, Math.min(y, 334)]);

const side = (id, poly, group, seat, dir) => [
  { id: `${id}-l`, group, poly, seat, dir },
  {
    id: `${id}-r`,
    group,
    poly: mirror(poly),
    seat: [MID - seat[0], seat[1]],
    dir: dir === "left" ? "right" : dir === "right" ? "left" : dir,
  },
];
const REGIONS = [
  { id: "belt", group: "waist", poly: BELT_OUTLINE[0], seat: [512, 720], dir: "up" },
  {
    id: "reactor",
    group: "chest",
    poly: [
      [430, 380],
      [512, 360],
      [594, 380],
      [612, 440],
      [590, 520],
      [540, 560],
      [512, 576],
      [484, 560],
      [434, 520],
      [412, 440],
    ],
    seat: [512, 576],
    dir: "up",
  },
  {
    id: "helmet",
    group: "helm",
    poly: [
      [426, 78],
      [452, 108],
      [470, 150],
      [492, 168],
      [512, 150],
      [532, 168],
      [554, 150],
      [574, 108],
      [598, 72],
      [604, 140],
      [598, 200],
      [588, 262],
      [570, 306],
      [540, 334],
      [512, 346],
      [484, 334],
      [454, 306],
      [436, 262],
      [424, 200],
      [420, 140],
    ],
    seat: [512, 346],
    dir: "up",
  },
  {
    id: "collar",
    group: "chest",
    poly: [
      [440, 300],
      [470, 330],
      [512, 350],
      [554, 330],
      [584, 300],
      [600, 350],
      [580, 392],
      [512, 400],
      [444, 392],
      [424, 350],
    ],
    seat: [512, 300],
    dir: "down",
  },
  ...side("shoulder", SHOULDER_L, "shoulders", [330, 500], "right"),
  ...side("fist", FIST_L, "arms", [232, 802], "down"),
  ...side("cuff", CUFF_L, "arms", [230, 762], "down"),
  ...side("forearm", FOREARM_L, "arms", [250, 592], "down"),
  ...side("arm", ARM_UPPER_L, "arms", [250, 504], "down"),
  ...side("chest", CHEST_L, "chest", [470, 600], "up"),
  {
    id: "abdomen",
    group: "chest",
    poly: [
      [420, 560],
      [484, 560],
      [512, 576],
      [540, 560],
      [604, 560],
      [610, 640],
      [512, 640],
      [414, 640],
    ],
    seat: [512, 640],
    dir: "up",
  },
  {
    id: "tasset-front",
    group: "waist",
    poly: [
      [440, 714],
      [512, 724],
      [584, 714],
      [590, 800],
      [560, 900],
      [512, 1010],
      [464, 900],
      [434, 800],
    ],
    seat: [512, 714],
    dir: "down",
  },
  ...side("tasset", TASSET_L, "waist", [380, 706], "down"),
  ...side("thigh", THIGH_L, "legs", [395, 1040], "up"),
  ...side("shin", SHIN_L, "legs", [370, 1300], "up"),
  ...side("boot", BOOT_L, "legs", [310, 1532], "up"),
  { id: "halo", group: "bits", poly: HALO, seat: [512, 334], dir: "up" },
  ...side("cape", CAPE_L, "tail", [270, 872], "down"),
  {
    id: "cape-centre",
    group: "tail",
    poly: [
      [470, 980],
      [512, 1012],
      [554, 980],
      [590, 1050],
      [600, 1250],
      [570, 1390],
      [512, 1420],
      [454, 1390],
      [424, 1250],
      [434, 1050],
    ],
    seat: [512, 1012],
    dir: "down",
  },
];
// Plates: one per region, but the helmet (crest, then the visor), the
// reactor (the disc, then its gold frame) and the shoulders (the medallion,
// then the pauldron).
const SPLITS = Object.fromEntries(
  REGIONS.map((region) => [region.id, [{ id: region.id, clip: ALL, dir: region.dir, group: region.group }]]),
);
SPLITS.helmet = [
  { id: "helmet-crest", clip: rect(0, 0, W, 204), dir: "up", group: "helm" },
  { id: "helmet-visor", clip: ALL, dir: "up", group: "helm" },
];
SPLITS.reactor = [
  { id: "reactor-disc", clip: REACTOR_GLOW, dir: "up", group: "chest" },
  { id: "reactor-frame", clip: ALL, dir: "up", group: "chest" },
];
for (const [s, cx] of [
  ["l", 345],
  ["r", MID - 345],
])
  SPLITS[`shoulder-${s}`] = [
    { id: `medallion-${s}`, clip: circle(cx, 420, 44, 24), dir: "up", group: "shoulders" },
    { id: `shoulder-${s}`, clip: ALL, dir: s === "l" ? "right" : "left", group: "shoulders" },
  ];
const DRIVER = ["belt"];

if (process.argv.includes("--sam-prompts")) {
  mkdirSync(SAM_DIR, { recursive: true });
  const prompts = {
    site: "illusionculum",
    generatedBy: "scripts/build-illusionculum-suit.mjs --sam-prompts",
    frame: [W, H],
    images: { full: "design/illusionculum-saga-20261023/cutout-standard.webp" },
    ornamentGroups: ["tail", "bits"],
    regions: REGIONS.map(({ id, group, poly, seat }) => ({ id, group, poly, seat })),
    splits: SPLITS,
    belt: { region: "belt", outline: BELT_OUTLINE, driver: DRIVER },
    face: FACE_GLOW,
    reactor: REACTOR_GLOW,
    marks: MARKS,
  };
  writeFileSync(join(SAM_DIR, "prompts.json"), `${JSON.stringify(prompts)}\n`);
  console.log(`wrote ${join(SAM_DIR, "prompts.json")}`);
  process.exit(0);
}

const manifestPath = join(SAM_DIR, "manifest.json");
if (!existsSync(manifestPath))
  throw new Error("no SAM masks: run --sam-prompts, then scripts/sam/make_masks.py --site illusionculum");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));

// --- The sources ----------------------------------------------------------------
const FORM_STEMS = { standard: "standard", more: "more", ultra: "ultra", ultraMore: "ultra-more" };
const sources = {};
for (const [key, stem] of Object.entries(FORM_STEMS)) {
  const { data, info } = await sharp(join(DESIGN, `cutout-${stem}.webp`))
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  if (info.width !== W || info.height !== H) throw new Error(`${stem}: not the ${W} x ${H} frame`);
  sources[key] = data;
}
// The four share one frame: their pictures' edges (the luma gradient, over
// the body, the orbs and the cape's hem left out) correlate best with the
// standard cutout's at no offset — a sharp peak, so not a pixel apart.
{
  const edges = (data) => {
    const luma = new Float32Array(N);
    for (let i = 0; i < N; i += 1) luma[i] = 0.3 * data[i * 4] + 0.59 * data[i * 4 + 1] + 0.11 * data[i * 4 + 2];
    const out = new Float32Array(N);
    for (let y = 1; y < H - 1; y += 1)
      for (let x = 1; x < W - 1; x += 1) {
        const i = y * W + x;
        out[i] = Math.abs(luma[i + 1] - luma[i - 1]) + Math.abs(luma[i + W] - luma[i - W]);
      }
    return out;
  };
  const a = edges(sources.standard);
  for (const key of ["more", "ultra", "ultraMore"]) {
    const b = edges(sources[key]);
    const at = (dx, dy) => {
      let sum = 0;
      for (let y = 380; y < 1150; y += 1) for (let x = 280; x < 744; x += 1) sum += a[y * W + x] * b[(y + dy) * W + x + dx];
      return sum;
    };
    const zero = at(0, 0);
    for (let dy = -1; dy <= 1; dy += 1)
      for (let dx = -1; dx <= 1; dx += 1)
        if ((dx || dy) && at(dx, dy) >= zero) throw new Error(`${key}: off the standard frame by ${dx},${dy}`);
    console.log(`${key}: same frame (edge correlation peaks at 0,0)`);
  }
}

const src = sources.standard;
const rgb = Buffer.alloc(N * 3);
const alpha = new Float32Array(N);
for (let i = 0; i < N; i += 1) {
  const a = src[i * 4 + 3] / 255;
  alpha[i] = a;
  const k = a > 0.02 ? 1 : 0;
  rgb[i * 3] = src[i * 4] * k;
  rgb[i * 3 + 1] = src[i * 4 + 1] * k;
  rgb[i * 3 + 2] = src[i * 4 + 2] * k;
}

const svgPath = (points) => `M${points.map(([x, y]) => `${x} ${y}`).join("L")}Z`;
async function rasterise(polys) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><path d="${polys
    .map(svgPath)
    .join("")}" fill="#fff"/></svg>`;
  const { data } = await sharp(Buffer.from(svg)).extractChannel(0).raw().toBuffer({ resolveWithObject: true });
  return Float32Array.from(data, (v) => v / 255);
}
async function samShare(name) {
  const { data, info } = await sharp(join(SAM_DIR, name)).extractChannel(0).raw().toBuffer({ resolveWithObject: true });
  if (info.width !== W || info.height !== H) throw new Error(`${name}: not the cutout's frame`);
  for (let i = 0; i < data.length; i += 1) data[i] = data[i] >= 252 ? 255 : data[i] <= 3 ? 0 : data[i];
  return data;
}

// --- Partition: the belt by its outline, the rest by SAM's shares --------------
const beltMask = await rasterise(BELT_OUTLINE);
const plateIds = REGIONS.flatMap((region) => SPLITS[region.id].map((split) => ({ ...split, region: region.id })));
const fields = new Map();
const shares = [];
const sum = new Float32Array(N);
for (const plate of plateIds) {
  if (plate.region === "belt") continue;
  if (!manifest.plates[plate.id]) {
    console.log(`${plate.id}: SAM left it empty`);
    continue;
  }
  const share = await samShare(`plates/${plate.id}.png`);
  for (let i = 0; i < N; i += 1) sum[i] += share[i] / 255;
  shares.push({ plate, share });
}
{
  const belt = new Float32Array(N);
  for (let i = 0; i < N; i += 1) belt[i] = beltMask[i] * alpha[i];
  fields.set("belt", belt);
}
for (const { plate, share } of shares) {
  const field = new Float32Array(N);
  for (let i = 0; i < N; i += 1) {
    if (!share[i]) continue;
    field[i] = alpha[i] * (1 - beltMask[i]) * (share[i] / 255 / Math.max(1, sum[i]));
  }
  fields.set(plate.id, field);
}
// What no mask holds (its share of the alpha) goes to the plate nearest it
// by a breadth-first fill over the figure, so the plates tile the figure.
{
  const claimed = new Float32Array(N);
  for (const field of fields.values()) for (let i = 0; i < N; i += 1) claimed[i] += field[i];
  const owner = new Int16Array(N).fill(-1);
  const ids = [...fields.keys()];
  ids.forEach((id, k) => {
    const field = fields.get(id);
    for (let i = 0; i < N; i += 1) if (field[i] > 0.5 * alpha[i] && alpha[i] > 0.02) owner[i] = k;
  });
  let queue = [];
  for (let i = 0; i < N; i += 1) if (owner[i] >= 0) queue.push(i);
  while (queue.length) {
    const next = [];
    for (const i of queue) {
      const x = i % W;
      for (const j of [i - 1, i + 1, i - W, i + W]) {
        if (j < 0 || j >= N || owner[j] >= 0 || alpha[j] <= 0.004) continue;
        if ((j === i - 1 && x === 0) || (j === i + 1 && x === W - 1)) continue;
        owner[j] = owner[i];
        next.push(j);
      }
    }
    queue = next;
  }
  let given = 0;
  for (let i = 0; i < N; i += 1) {
    const rest = alpha[i] - claimed[i];
    if (rest <= 0.002 || owner[i] < 0) continue;
    fields.get(ids[owner[i]])[i] += rest;
    given += 1;
  }
  // The check: every figure pixel is held exactly once.
  let worst = 0;
  for (let i = 0; i < N; i += 1) {
    let total = 0;
    for (const field of fields.values()) total += field[i];
    worst = Math.max(worst, Math.abs(total - alpha[i]));
  }
  console.log(`partition: ${fields.size} plates; ${given} px given to their nearest plate; worst sum error ${worst.toFixed(4)}`);
  if (worst > 0.01) throw new Error("the plates do not tile the figure");
}

// --- Delivery (the whole frame at 693 x 1040) ----------------------------------
const FIG_W = 693;
const FIG_H = 1040;
const SCALE = FIG_H / H;
const fx = (x) => Math.round(x * SCALE * 10) / 10;
const fy = (y) => Math.round(y * SCALE * 10) / 10;
function rgba(coverage, colours = rgb) {
  const out = Buffer.alloc(N * 4);
  for (let i = 0; i < N; i += 1) {
    out[i * 4] = colours[i * 3];
    out[i * 4 + 1] = colours[i * 3 + 1];
    out[i * 4 + 2] = colours[i * 3 + 2];
    out[i * 4 + 3] = Math.round(Math.min(1, Math.max(0, coverage[i])) * 255);
  }
  return out;
}
const bounds = (coverage) => {
  let x0 = W;
  let y0 = H;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < H; y += 1)
    for (let x = 0; x < W; x += 1) {
      if (coverage[y * W + x] < 0.03) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  return x1 < 0 ? null : { x0, y0, x1, y1 };
};
function deliveryBox({ x0, y0, x1, y1 }, margin) {
  const left = Math.max(0, Math.floor((x0 - margin) * SCALE));
  const top = Math.max(0, Math.floor((y0 - margin) * SCALE));
  const right = Math.min(FIG_W, Math.ceil((x1 + margin + 1) * SCALE));
  const bottom = Math.min(FIG_H, Math.ceil((y1 + margin + 1) * SCALE));
  return { left, top, width: right - left, height: bottom - top };
}
const toDelivery = (buffer) =>
  sharp(buffer, { raw: { width: W, height: H, channels: 4 } })
    .resize(FIG_W, FIG_H, { kernel: "lanczos3", fit: "fill" })
    .raw()
    .toBuffer();
const extractRaw = (buffer, box) => {
  const out = Buffer.alloc(box.width * box.height * 4);
  for (let y = 0; y < box.height; y += 1)
    buffer.copy(out, y * box.width * 4, ((box.top + y) * FIG_W + box.left) * 4, ((box.top + y) * FIG_W + box.left + box.width) * 4);
  return out;
};

mkdirSync(OUT_DIR, { recursive: true });
for (const file of readdirSync(OUT_DIR)) rmSync(join(OUT_DIR, file));
const files = [];
async function writeWebp(name, raw, width, height, options = {}) {
  const result = await sharp(raw, { raw: { width, height, channels: 4 } })
    .webp({ quality: 76, alphaQuality: 80, effort: 6, smartSubsample: true, ...options })
    .toFile(join(OUT_DIR, name));
  files.push({ name, bytes: result.size });
  return `${PUBLIC_PATH}/${name}`;
}

// The four figures in the one frame: the scene's art and the chain's sheets.
const FIGURES = {};
for (const [key, stem] of Object.entries(FORM_STEMS)) {
  const raw = await sharp(sources[key], { raw: { width: W, height: H, channels: 4 } })
    .resize(FIG_W, FIG_H, { kernel: "lanczos3", fit: "fill" })
    .raw()
    .toBuffer();
  FIGURES[key] = await writeWebp(`${stem}.webp`, raw, FIG_W, FIG_H, { quality: 72 });
}

// The undersuit: Rexonance's (the same wearer), its soles on this figure's
// soles and its reactor socket on this reactor.
const UNDERSUIT_SOURCE = join(ROOT, "public", REXONANCE_SUIT_UNDERSUIT.slice(1));
const under = await sharp(UNDERSUIT_SOURCE).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const UNDERSUIT_PLACE = (() => {
  const uw = under.info.width;
  const uh = under.info.height;
  let sole = 0;
  for (let y = uh - 1; y >= 0 && !sole; y -= 1)
    for (let x = 0; x < uw; x += 1)
      if (under.data[(y * uw + x) * 4 + 3] > 40) {
        sole = y;
        break;
      }
  let figureSole = 0;
  for (let y = H - 1; y >= 0 && !figureSole; y -= 1)
    for (let x = 300; x < 724; x += 1)
      if (alpha[y * W + x] > 0.16) {
        figureSole = y;
        break;
      }
  const [ucx, ucy] = REXONANCE_SUIT_MARKS.core;
  const scale = ((figureSole - MARKS.core[1]) * SCALE) / (sole - ucy);
  return {
    width: Math.round(uw * scale),
    height: Math.round(uh * scale),
    left: Math.round(MARKS.core[0] * SCALE - ucx * scale),
    top: Math.round(figureSole * SCALE - sole * scale),
    scale,
  };
})();
const undersuitRaw = Buffer.alloc(FIG_W * FIG_H * 4);
{
  const { width, height, left, top } = UNDERSUIT_PLACE;
  const scaled = await sharp(UNDERSUIT_SOURCE).ensureAlpha().resize(width, height, { kernel: "lanczos3", fit: "fill" }).raw().toBuffer();
  for (let y = 0; y < height; y += 1) {
    const ty = top + y;
    if (ty < 0 || ty >= FIG_H) continue;
    for (let x = 0; x < width; x += 1) {
      const tx = left + x;
      if (tx < 0 || tx >= FIG_W) continue;
      scaled.copy(undersuitRaw, (ty * FIG_W + tx) * 4, (y * width + x) * 4, (y * width + x + 1) * 4);
    }
  }
}
const UNDERSUIT = await writeWebp("undersuit.webp", undersuitRaw, FIG_W, FIG_H, { quality: 84, alphaQuality: 100 });

// The plates: their art in one atlas, their micro-tiles, their seats.
const TILE = 9;
const MARGIN = 2;
let tileCount = 0;
const pieces = [];
const cells = [];
for (const plate of plateIds) {
  const field = fields.get(plate.id);
  const found = field && bounds(field);
  if (!found) continue;
  const box = deliveryBox(found, Math.ceil(MARGIN / SCALE) + 1);
  const art = extractRaw(await toDelivery(rgba(field)), box);
  if (plate.region === "belt") for (let i = 3; i < art.length; i += 4) if (art[i] < 16) art[i] = 0;
  const { width: w, height: h } = box;
  const seat = {
    up: [box.left + w / 2, box.top + h],
    down: [box.left + w / 2, box.top],
    left: [box.left + w, box.top + h / 2],
    right: [box.left, box.top + h / 2],
  }[plate.dir];
  const cols = Math.ceil(w / TILE);
  const rows = Math.ceil(h / TILE);
  const bits = new Uint8Array(Math.ceil((cols * rows) / 8));
  for (let row = 0; row < rows; row += 1)
    for (let col = 0; col < cols; col += 1) {
      let any = false;
      for (let y = row * TILE; y < Math.min(h, (row + 1) * TILE) && !any; y += 1)
        for (let x = col * TILE; x < Math.min(w, (col + 1) * TILE); x += 1)
          if (art[(y * w + x) * 4 + 3] > 12) {
            any = true;
            break;
          }
      if (any) {
        const bit = row * cols + col;
        bits[bit >> 3] |= 1 << (bit & 7);
        tileCount += 1;
      }
    }
  cells.push({ w, h, art });
  pieces.push({
    id: plate.id,
    group: plate.group,
    dir: plate.dir,
    x: box.left,
    y: box.top,
    w,
    h,
    seat: seat.map((v) => Math.round(v * 10) / 10),
    tiles: Buffer.from(bits).toString("base64"),
  });
}
const ATLAS_W = 1024;
const GUTTER = 2;
{
  const order = cells.map((_, i) => i).sort((a, b) => cells[b].h - cells[a].h || a - b);
  let shelfX = 0;
  let shelfY = 0;
  let shelfH = 0;
  for (const i of order) {
    const { w, h } = cells[i];
    if (shelfX + w + GUTTER > ATLAS_W) {
      shelfX = 0;
      shelfY += shelfH + GUTTER;
      shelfH = 0;
    }
    pieces[i].ax = shelfX;
    pieces[i].ay = shelfY;
    shelfX += w + GUTTER;
    shelfH = Math.max(shelfH, h);
  }
  var ATLAS_H = shelfY + shelfH;
}
const atlasRaw = Buffer.alloc(ATLAS_W * ATLAS_H * 4);
for (const [i, { w, h, art }] of cells.entries()) {
  const { ax, ay } = pieces[i];
  for (let y = 0; y < h; y += 1) art.copy(atlasRaw, ((ay + y) * ATLAS_W + ax) * 4, y * w * 4, (y + 1) * w * 4);
}
const ATLAS = await writeWebp("plates.webp", atlasRaw, ATLAS_W, ATLAS_H, { quality: 80, alphaQuality: 90 });

// The driver stand-in: the belt whole (the loading stand-in under the canvas).
{
  const driverRaw = Buffer.alloc(FIG_W * FIG_H * 4);
  for (const piece of pieces.filter((p) => DRIVER.includes(p.id))) {
    const cell = cells[pieces.indexOf(piece)];
    for (let y = 0; y < piece.h; y += 1)
      cell.art.copy(driverRaw, ((piece.y + y) * FIG_W + piece.x) * 4, y * piece.w * 4, (y + 1) * piece.w * 4);
  }
  await writeWebp("driver-standin.webp", driverRaw, FIG_W, FIG_H, { lossless: true });
}
const DRIVER_STANDIN = `${PUBLIC_PATH}/driver-standin.webp`;

// --- The module ---------------------------------------------------------------------
const point = ([x, y]) => `[${fx(x)}, ${fy(y)}]`;
const total = files.reduce((s, f) => s + f.bytes, 0);
const ts = `// Generated by scripts/build-illusionculum-suit.mjs from
// design/illusionculum-saga-20261023/cutout-*.webp and its SAM masks
// (design/illusionculum-saga-20261023/sam-masks/) — do not edit by hand.
// Figure coordinates are delivery px of the ${FIG_W} x ${FIG_H} figure (the owner's
// whole 1024 x 1536 cutout frame).
// ${files.length} files, ${total} bytes (${files.map((f) => `${f.name} ${f.bytes}`).join(", ")}).

export const ILLUSIONCULUM_SUIT_SIZE = { width: ${FIG_W}, height: ${FIG_H} } as const;

/** The finished standard figure (the scene's art; the fallback). */
export const ILLUSIONCULUM_SUIT_FIGURE = "${FIGURES.standard}";
/** Rexonance's bodysuit (the same wearer), in this frame. */
export const ILLUSIONCULUM_SUIT_UNDERSUIT = "${UNDERSUIT}";
/** The エクスサーガドライバー whole: the loading stand-in. */
export const ILLUSIONCULUM_SUIT_DRIVER_STANDIN = "${DRIVER_STANDIN}";
/** The other forms, in the same frame, pixel for pixel over the standard one. */
export const ILLUSIONCULUM_SUIT_FORMS = {
  more: "${FIGURES.more}",
  ultra: "${FIGURES.ultra}",
  ultraMore: "${FIGURES.ultraMore}",
} as const;

/** The face's lights' outline, for the final call's pixel squares. */
export const ILLUSIONCULUM_SUIT_FACE_GLOW: readonly (readonly [number, number])[] = [
${FACE_GLOW.map((p) => `  ${point(p)},`).join("\n")}
];
/** The chest reactor's disc: it fills with pixel squares, like the eyes. */
export const ILLUSIONCULUM_SUIT_REACTOR_GLOW: readonly (readonly [number, number])[] = [
${REACTOR_GLOW.map((p) => `  ${point(p)},`).join("\n")}
];
/** The two リアクター・モア over the shoulders: [x, y, radius]. */
export const ILLUSIONCULUM_SUIT_ORBS: readonly (readonly [number, number, number])[] = [
${ORBS.map(([x, y, r]) => `  [${fx(x)}, ${fy(y)}, ${fx(r)}],`).join("\n")}
];

export type IllusionculumSuitGroup =
  "legs" | "waist" | "arms" | "chest" | "shoulders" | "tail" | "bits" | "helm";
/** One plate of the armour: its box in the figure, its cell in the atlas,
 * the way it grows from its seat. */
export type IllusionculumSuitPiece = {
  readonly id: string;
  readonly group: IllusionculumSuitGroup;
  readonly dir: "up" | "down" | "left" | "right";
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly ax: number;
  readonly ay: number;
  readonly seat: readonly [number, number];
  /** Its micro-tiles that carry art (ILLUSIONCULUM_SUIT_TILE px squares,
   * row-major over its box, LSB-first bitmask, base64). */
  readonly tiles: string;
};
/** The scene's micro-tile, in delivery px (${tileCount} tiles in all). */
export const ILLUSIONCULUM_SUIT_TILE = ${TILE};
/** The plates' atlas (each plate's art, its alpha the plate's share). */
export const ILLUSIONCULUM_SUIT_ATLAS = { src: "${ATLAS}", width: ${ATLAS_W}, height: ${ATLAS_H} } as const;
/** The plates, front first; they tile the figure (SAM's masks). */
export const ILLUSIONCULUM_SUIT_PIECES: readonly IllusionculumSuitPiece[] = ${JSON.stringify(pieces, null, 2)
  .replace(/"(\w+)":/g, "$1:")
  .replace(/\n/g, "\n")};
/** The driver's plates: on the body from the start. */
export const ILLUSIONCULUM_SUIT_DRIVER: readonly string[] = ${JSON.stringify(DRIVER)};
/** Alignment marks (figure px): the reactor (the light's origin), the visor. */
export const ILLUSIONCULUM_SUIT_MARKS = {
  core: ${point(MARKS.core)},
  visor: ${point(MARKS.visor)},
  belt: ${point(MARKS.belt)},
} as const;
/** Every file the scene loads. */
export const ILLUSIONCULUM_SUIT_ASSETS = ${JSON.stringify(files.map((f) => `${PUBLIC_PATH}/${f.name}`), null, 2)} as const;
`;
writeFileSync(MODULE, ts);
console.log(`wrote ${MODULE}: ${pieces.length} plates, ${tileCount} tiles, ${files.length} files, ${total} bytes`);
