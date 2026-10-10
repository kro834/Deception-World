#!/usr/bin/env node
// rx12 (2026-10-10): the Rexonance suit-up's raster parts, cut from the
// owner's approved full-body artwork (design/rexonance-suit/). Reproducible:
//
//   node scripts/build-rexonance-suit.mjs [--debug=<dir>]
//
// writes public/rexonance-suit-20261010/*.webp and src/lib/rexonance-suit.ts.
// The figure keeps the artwork's own pixels: the black background is flood-
// filled away from the image edges (never entering the body, so the black
// armour stays opaque) and the edge is feathered by a pixel. The armour is
// cut along hand-authored polygons (traced over zoomed crops of the
// artwork), front pieces first, so the pieces partition the figure; what no
// piece claims (the bodysuit between the plates) is the "body" layer. Each
// piece ships as one sprite of three panels: its art, the coarse nanite
// mosaic it forms out of, and the faint cyan rim it floats with. The face's
// cyan and pink lights are cut out separately (the helmet carries them
// unlit) for the final call's pixel burst.
import { mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const sharp = require(process.env.SHARP_MODULE || "sharp");

const VERSION = "20261010";
const SOURCE = fileURLToPath(
  new URL(`../design/rexonance-suit/rexonance-full-${VERSION}.jpg`, import.meta.url),
);
const OUT_DIR = fileURLToPath(new URL(`../public/rexonance-suit-${VERSION}/`, import.meta.url));
const PUBLIC_PATH = `/rexonance-suit-${VERSION}`;
const MODULE = fileURLToPath(new URL("../src/lib/rexonance-suit.ts", import.meta.url));
const debugArg = process.argv.find((arg) => arg.startsWith("--debug="));
const DEBUG = debugArg ? debugArg.slice("--debug=".length) : null;

// Delivery height of the figure: the overlay stands it about 585-775 CSS px
// tall on common screens (at most 960); 1040 px keeps it crisp at ~1.5-2x
// and the whole set near 530 KB, without shipping the 2000 px original.
const DELIVERY_H = 1040;
// Background: near-black connected to the image edges.
const BACKGROUND_MAX = 16;
// Dim glow the background reaches through pixels no brighter than this.
const HAZE_MAX = 46;
// The coarse nanite mosaic's block, in delivery pixels.
const MOSAIC = 11;

// --- Geometry (source pixels of the 1055 x 2000 artwork) -----------------
const MID = 1054; // mirror axis x' = MID - x (the figure stands centred)
const mirror = (points) => points.map(([x, y]) => [MID - x, y]);
const circle = (cx, cy, r, n = 28) =>
  Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    return [Math.round(cx + Math.cos(a) * r), Math.round(cy + Math.sin(a) * r)];
  });

// The bodysuit: a slim figure inside the armour (no tail, no ribbons, no
// armour volume), left half from the crown down to the crotch.
const BODY_LEFT = [
  [527, 172],
  [498, 178],
  [474, 198],
  [460, 232],
  [456, 280],
  [462, 330],
  [476, 372],
  [496, 400],
  [492, 420],
  [452, 430],
  [402, 440],
  [358, 452],
  [326, 474],
  [300, 510],
  [286, 566],
  [272, 630],
  [240, 690],
  [210, 740],
  [190, 800],
  [176, 870],
  [168, 930],
  [158, 965],
  [156, 1040],
  [166, 1085],
  [196, 1100],
  [232, 1094],
  [248, 1050],
  [248, 975],
  [252, 935],
  [268, 860],
  [288, 780],
  [312, 700],
  [338, 640],
  [370, 615],
  [392, 650],
  [408, 720],
  [420, 790],
  [412, 840],
  [372, 880],
  [330, 940],
  [306, 1040],
  [294, 1150],
  [284, 1250],
  [268, 1350],
  [248, 1450],
  [236, 1550],
  [238, 1640],
  [206, 1700],
  [178, 1790],
  [166, 1862],
  [184, 1892],
  [358, 1892],
  [366, 1826],
  [356, 1726],
  [346, 1662],
  [356, 1560],
  [372, 1460],
  [394, 1360],
  [420, 1260],
  [452, 1160],
  [480, 1060],
  [500, 970],
  [514, 905],
  [527, 898],
];
const BODY = [...BODY_LEFT, ...mirror(BODY_LEFT.slice(1, -1)).reverse()];
// Thin seams on the bodysuit (left; mirrored), and the centre line.
const SEAMS_LEFT = [
  [
    [527, 470],
    [480, 500],
    [440, 560],
    [420, 640],
  ],
  [
    [420, 790],
    [470, 802],
    [527, 806],
  ],
  [
    [330, 480],
    [300, 560],
    [270, 660],
    [225, 760],
    [205, 860],
    [200, 940],
  ],
  [
    [420, 880],
    [380, 1000],
    [350, 1150],
    [320, 1300],
    [296, 1450],
    [290, 1600],
    [270, 1750],
  ],
  [
    [500, 960],
    [470, 1100],
    [430, 1250],
    [395, 1400],
    [380, 1560],
  ],
];
const SEAMS = [
  [
    [527, 420],
    [527, 896],
  ],
  ...SEAMS_LEFT,
  ...SEAMS_LEFT.map(mirror),
];

// The face's lights: the V of cyan and pink under the crest.
const FACE_GLOW = [
  [452, 233],
  [470, 236],
  [488, 255],
  [506, 280],
  [524, 300],
  [543, 280],
  [562, 256],
  [582, 236],
  [602, 232],
  [592, 258],
  [574, 285],
  [556, 310],
  [540, 335],
  [531, 360],
  [526, 388],
  [520, 360],
  [510, 335],
  [494, 310],
  [476, 285],
  [462, 260],
];

const GAUNTLET_L = [
  [138, 655],
  [238, 640],
  [300, 676],
  [312, 760],
  [302, 862],
  [262, 930],
  [252, 1000],
  [248, 1100],
  [146, 1102],
  [136, 1000],
  [138, 940],
  [126, 850],
  [130, 760],
];
const THIGH_L = [
  [298, 842],
  [466, 842],
  [472, 900],
  [487, 1000],
  [470, 1150],
  [430, 1185],
  [330, 1185],
  [288, 1120],
  [278, 1000],
  [284, 900],
];
const KNEE_L = [
  [248, 1158],
  [452, 1158],
  [462, 1250],
  [442, 1335],
  [402, 1420],
  [345, 1475],
  [270, 1450],
  [232, 1360],
  [225, 1250],
];
const BOOT_L = [
  [198, 1428],
  [345, 1475],
  [405, 1418],
  [432, 1400],
  [430, 1550],
  [402, 1560],
  [372, 1640],
  [385, 1700],
  [368, 1800],
  [368, 1898],
  [150, 1898],
  [146, 1800],
  [170, 1700],
  [168, 1600],
  [188, 1500],
];

// The armour, FRONT FIRST: a piece claims only what no piece before it has.
// group: when it forms on the call clock (see REXONANCE_SUIT_GROUPS);
// seat: where its clank sparks (a seam); float: the hover it forms in, as
// [dx, dy] in figure heights, a turn (deg) and a scale (forward > 1).
const PIECES = [
  {
    id: "helmet",
    group: "helm",
    poly: [
      [432, 38],
      [618, 38],
      [616, 150],
      [622, 205],
      [624, 262],
      [612, 322],
      [592, 362],
      [562, 398],
      [527, 418],
      [492, 398],
      [462, 362],
      [440, 322],
      [418, 262],
      [412, 205],
      [426, 150],
    ],
    seat: [527, 405],
    float: [0, -0.055, 0, 1.06],
  },
  {
    id: "core",
    group: "chest",
    poly: [...circle(527, 532, 97), [549, 615], [527, 672], [505, 615]],
    seat: [527, 440],
    float: [0, -0.012, -8, 1.14],
  },
  {
    id: "belt",
    group: "waist",
    poly: [
      [332, 742],
      [468, 740],
      [478, 726],
      [576, 726],
      [586, 740],
      [722, 742],
      [725, 842],
      [588, 844],
      [566, 862],
      [488, 862],
      [466, 844],
      [330, 842],
    ],
    seat: [527, 735],
    float: [0, 0.01, 0, 1.1],
  },
  {
    id: "tasset",
    group: "waist",
    poly: [
      [462, 842],
      [592, 842],
      [590, 900],
      [586, 1000],
      [572, 1150],
      [552, 1300],
      [540, 1385],
      [544, 1465],
      [510, 1465],
      [514, 1385],
      [502, 1300],
      [482, 1150],
      [468, 1000],
      [464, 900],
    ],
    seat: [527, 850],
    float: [0, 0.03, 0, 1.06],
  },
  {
    id: "shoulder-l",
    group: "chest",
    poly: [
      [220, 200],
      [310, 215],
      [350, 285],
      [388, 288],
      [410, 232],
      [440, 300],
      [470, 380],
      [470, 410],
      [446, 452],
      [432, 500],
      [416, 560],
      [396, 600],
      [358, 640],
      [348, 708],
      [310, 708],
      [300, 642],
      [245, 616],
      [170, 624],
      [95, 618],
      [68, 560],
      [52, 430],
      [78, 330],
      [138, 248],
    ],
    seat: [420, 450],
    float: [-0.06, -0.045, -5, 1.04],
  },
  {
    id: "shoulder-r",
    group: "chest",
    poly: [
      [612, 300],
      [700, 288],
      [745, 245],
      [800, 268],
      [862, 300],
      [864, 470],
      [888, 520],
      [884, 566],
      [812, 576],
      [772, 602],
      [746, 708],
      [706, 708],
      [684, 642],
      [662, 602],
      [642, 560],
      [626, 500],
      [610, 452],
      [608, 430],
      [584, 410],
      [588, 360],
    ],
    seat: [634, 450],
    float: [0.06, -0.045, 5, 1.04],
  },
  {
    id: "gauntlet-l",
    group: "arms",
    poly: GAUNTLET_L,
    seat: [262, 668],
    float: [-0.07, 0.012, -6, 1.03],
  },
  {
    id: "gauntlet-r",
    group: "arms",
    poly: mirror(GAUNTLET_L),
    seat: [792, 668],
    float: [0.07, 0.012, 6, 1.03],
  },
  {
    id: "chest",
    group: "chest",
    poly: [
      [440, 395],
      [615, 395],
      [642, 450],
      [648, 560],
      [664, 640],
      [652, 705],
      [625, 742],
      [430, 742],
      [402, 705],
      [392, 640],
      [410, 560],
      [412, 450],
    ],
    seat: [527, 735],
    float: [0, -0.02, 0, 1.08],
  },
  {
    id: "thigh-l",
    group: "waist",
    poly: THIGH_L,
    seat: [380, 846],
    float: [-0.05, 0.03, -4, 1.04],
  },
  {
    id: "thigh-r",
    group: "waist",
    poly: mirror(THIGH_L),
    seat: [674, 846],
    float: [0.05, 0.03, 4, 1.04],
  },
  {
    id: "knee-l",
    group: "legs",
    poly: KNEE_L,
    seat: [350, 1165],
    float: [-0.06, 0.02, -5, 1.04],
  },
  {
    id: "knee-r",
    group: "legs",
    poly: mirror(KNEE_L),
    seat: [704, 1165],
    float: [0.06, 0.02, 5, 1.04],
  },
  {
    id: "boot-l",
    group: "legs",
    poly: BOOT_L,
    seat: [300, 1430],
    float: [-0.055, 0.045, -4, 1.03],
  },
  {
    id: "boot-r",
    group: "legs",
    poly: mirror(BOOT_L),
    seat: [754, 1430],
    float: [0.055, 0.045, 4, 1.03],
  },
  // The tail grows out from behind the right shoulder along its arch, root
  // to blade; each section grows from the joint it shares with the last.
  {
    id: "tail-0",
    group: "tail",
    poly: [
      [598, 345],
      [700, 345],
      [706, 280],
      [700, 228],
      [612, 228],
      [596, 280],
    ],
    seat: [650, 340],
  },
  {
    id: "tail-1",
    group: "tail",
    poly: [
      [598, 232],
      [718, 232],
      [790, 230],
      [745, 0],
      [680, 0],
      [610, 90],
      [590, 160],
    ],
    seat: [655, 232],
  },
  {
    id: "tail-2",
    group: "tail",
    poly: [
      [790, 230],
      [745, 0],
      [960, 20],
      [900, 240],
      [850, 215],
    ],
    seat: [755, 90],
  },
  {
    id: "tail-3",
    group: "tail",
    poly: [
      [900, 240],
      [960, 20],
      [1052, 60],
      [1052, 300],
      [930, 300],
    ],
    seat: [920, 100],
  },
  {
    id: "tail-4",
    group: "tail",
    poly: [
      [930, 300],
      [1052, 300],
      [1052, 460],
      [1012, 540],
      [995, 630],
      [950, 605],
      [900, 540],
      [866, 470],
      [862, 315],
      [895, 295],
    ],
    seat: [975, 300],
  },
  // The energy ribbons stream down from the shoulders and hips.
  {
    id: "ribbon-l",
    group: "ribbon",
    poly: [
      [8, 560],
      [130, 560],
      [150, 612],
      [250, 612],
      [320, 650],
      [300, 680],
      [140, 700],
      [132, 1100],
      [250, 1100],
      [270, 1110],
      [262, 1170],
      [246, 1300],
      [234, 1430],
      [196, 1445],
      [190, 1640],
      [150, 1730],
      [8, 1730],
    ],
    seat: [140, 600],
  },
  {
    id: "ribbon-r",
    group: "ribbon",
    poly: [
      [1046, 560],
      [884, 568],
      [812, 580],
      [740, 600],
      [745, 660],
      [918, 700],
      [922, 1100],
      [804, 1100],
      [784, 1110],
      [792, 1170],
      [808, 1300],
      [820, 1430],
      [858, 1445],
      [864, 1640],
      [904, 1730],
      [1046, 1730],
    ],
    seat: [820, 600],
  },
];

// Background pockets the figure encloses (flood-filled like the edges).
const ENCLOSED = [[850, 240]];

// Alignment brackets on RIDER！ (the core, shoulders, elbows, knees), the
// P14 core and the visor (the target lock), in source pixels.
const MARKS = {
  core: [527, 532],
  visor: [527, 300],
  belt: [527, 795],
  joints: [
    [527, 532],
    [330, 462],
    [724, 462],
    [228, 720],
    [826, 720],
    [350, 1290],
    [704, 1290],
  ],
};

// --- Raster helpers ------------------------------------------------------
const { data: rgb, info } = await sharp(SOURCE)
  .removeAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });
const W = info.width;
const H = info.height;
if (W !== 1055 || H !== 2000) throw new Error(`expected the 1055 x 2000 artwork, got ${W} x ${H}`);
const N = W * H;

const svgPath = (points) => `M${points.map(([x, y]) => `${x} ${y}`).join("L")}Z`;
// Polygons rasterised with anti-aliasing (0..1), optionally grown by a stroke.
async function rasterise(polys, grow = 0, blur = 0) {
  const d = polys.map(svgPath).join("");
  const stroke = grow ? ` stroke="#fff" stroke-width="${grow * 2}" stroke-linejoin="round"` : "";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="#000"/><path d="${d}" fill="#fff"${stroke}/></svg>`;
  let image = sharp(Buffer.from(svg)).greyscale();
  if (blur) image = image.blur(blur);
  const { data } = await image.raw().toBuffer({ resolveWithObject: true });
  const out = new Float32Array(N);
  const step = data.length / N;
  for (let i = 0; i < N; i += 1) out[i] = data[i * step] / 255;
  return out;
}
async function blurField(field, sigma, width = W, height = H) {
  const bytes = Buffer.alloc(width * height);
  for (let i = 0; i < bytes.length; i += 1)
    bytes[i] = Math.round(Math.min(1, Math.max(0, field[i])) * 255);
  const { data } = await sharp(bytes, { raw: { width, height, channels: 1 } })
    .blur(sigma)
    .raw()
    .toBuffer({ resolveWithObject: true });
  // libvips may hand a one-band blur back as three bands.
  const out = new Float32Array(width * height);
  const step = data.length / out.length;
  for (let i = 0; i < out.length; i += 1) out[i] = data[i * step] / 255;
  return out;
}

// --- The figure's alpha ---------------------------------------------------
const protect = await rasterise([BODY], 6);
const background = new Uint8Array(N);
{
  const queue = new Int32Array(N);
  let head = 0;
  let tail = 0;
  const bright = (i) => Math.max(rgb[i * 3], rgb[i * 3 + 1], rgb[i * 3 + 2]);
  const push = (i) => {
    if (background[i] || protect[i] > 0.5 || bright(i) > BACKGROUND_MAX) return;
    background[i] = 1;
    queue[tail++] = i;
  };
  for (let x = 0; x < W; x += 1) {
    push(x);
    push((H - 1) * W + x);
  }
  for (let y = 0; y < H; y += 1) {
    push(y * W);
    push(y * W + W - 1);
  }
  // Background the figure encloses: the hole under the tail's arch.
  for (const [x, y] of ENCLOSED) push(y * W + x);
  while (head < tail) {
    const i = queue[head++];
    const x = i % W;
    if (x > 0) push(i - 1);
    if (x < W - 1) push(i + 1);
    if (i >= W) push(i - W);
    if (i < N - W) push(i + W);
  }
}
// The haze: dim glow round the ribbons and blades that the background
// reaches through dim pixels only (a second, wider flood that still never
// enters the body). It is light on black, so it keeps its light as alpha.
const haze = new Uint8Array(N);
{
  const queue = new Int32Array(N);
  let head = 0;
  let tail = 0;
  const bright = (i) => Math.max(rgb[i * 3], rgb[i * 3 + 1], rgb[i * 3 + 2]);
  for (let i = 0; i < N; i += 1) {
    if (!background[i]) continue;
    haze[i] = 1;
    queue[tail++] = i;
  }
  const push = (i) => {
    if (haze[i] || protect[i] > 0.5 || bright(i) > HAZE_MAX) return;
    haze[i] = 1;
    queue[tail++] = i;
  };
  while (head < tail) {
    const i = queue[head++];
    const x = i % W;
    if (x > 0) push(i - 1);
    if (x < W - 1) push(i + 1);
    if (i >= W) push(i - W);
    if (i < N - W) push(i + W);
  }
}
const solid = new Float32Array(N);
for (let i = 0; i < N; i += 1) {
  if (background[i]) continue;
  const bright = Math.max(rgb[i * 3], rgb[i * 3 + 1], rgb[i * 3 + 2]);
  solid[i] = haze[i] ? Math.min(1, (bright - BACKGROUND_MAX) / (HAZE_MAX - BACKGROUND_MAX)) : 1;
}
// Feather the edge by a pixel; never thin the inside. The haze's alpha is
// smoothed further (the JPEG's grain would otherwise become alpha grain).
const feathered = await blurField(solid, 0.7);
const hazeSoft = await blurField(solid, 2.2);
const alpha = Float32Array.from({ length: N }, (_, i) =>
  haze[i] && !background[i] ? Math.min(feathered[i], hazeSoft[i] * 1.15) : feathered[i],
);
// Haze pixels carry their light as alpha: unpremultiplied against black, and
// smoothed (it is a glow; its grain would only cost bytes).
{
  const { data: smooth } = await sharp(rgb, { raw: { width: W, height: H, channels: 3 } })
    .blur(2.4)
    .raw()
    .toBuffer({ resolveWithObject: true });
  for (let i = 0; i < N; i += 1) {
    if (!haze[i] || background[i] || alpha[i] <= 0.02) continue;
    const k = Math.min(1.6, 1 / Math.max(alpha[i], 0.34));
    for (let c = 0; c < 3; c += 1)
      rgb[i * 3 + c] = Math.min(255, Math.round(smooth[i * 3 + c] * k));
  }
}

// The delivery crop: the figure's bounds, padded, scaled to DELIVERY_H.
const PAD = 10;
let minX = W;
let minY = H;
let maxX = 0;
let maxY = 0;
for (let y = 0; y < H; y += 1) {
  for (let x = 0; x < W; x += 1) {
    if (alpha[y * W + x] < 0.04) continue;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
}
const CROP = {
  left: Math.max(0, minX - PAD),
  top: Math.max(0, minY - PAD),
};
CROP.width = Math.min(W, maxX + PAD + 1) - CROP.left;
CROP.height = Math.min(H, maxY + PAD + 1) - CROP.top;
const SCALE = DELIVERY_H / CROP.height;
const FIG_W = Math.round(CROP.width * SCALE);
const FIG_H = DELIVERY_H;
// Source pixels to delivery pixels (figure coordinates).
const fx = (x) => Math.round((x - CROP.left) * SCALE * 10) / 10;
const fy = (y) => Math.round((y - CROP.top) * SCALE * 10) / 10;

// An RGBA buffer (source size) from the artwork's RGB and a coverage field,
// optionally with its own colours.
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
  for (let y = 0; y < H; y += 1) {
    for (let x = 0; x < W; x += 1) {
      if (coverage[y * W + x] < 0.03) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  return x1 < 0 ? null : { x0, y0, x1, y1 };
};
// A source-pixel rectangle snapped to whole delivery pixels.
function deliveryBox({ x0, y0, x1, y1 }, margin) {
  const left = Math.max(0, Math.floor((x0 - margin - CROP.left) * SCALE));
  const top = Math.max(0, Math.floor((y0 - margin - CROP.top) * SCALE));
  const right = Math.min(FIG_W, Math.ceil((x1 + margin + 1 - CROP.left) * SCALE));
  const bottom = Math.min(FIG_H, Math.ceil((y1 + margin + 1 - CROP.top) * SCALE));
  return { left, top, width: right - left, height: bottom - top };
}
// Resize a full-source RGBA buffer to the delivery figure, then extract.
async function toDelivery(buffer) {
  return sharp(buffer, { raw: { width: W, height: H, channels: 4 } })
    .extract(CROP)
    .resize(FIG_W, FIG_H, { kernel: "lanczos3" })
    .raw()
    .toBuffer();
}
const extractRaw = (buffer, box, channels = 4) => {
  const out = Buffer.alloc(box.width * box.height * channels);
  for (let y = 0; y < box.height; y += 1) {
    buffer.copy(
      out,
      y * box.width * channels,
      ((box.top + y) * FIG_W + box.left) * channels,
      ((box.top + y) * FIG_W + box.left + box.width) * channels,
    );
  }
  return out;
};

// --- Colours of the unlit face, the nanites, the bodysuit ---------------------
const CYAN = [121, 232, 255];
const PINK = [255, 130, 213];
const WHITE = [236, 252, 255];
const GOLD = [242, 216, 150];
const hash = (a, b) => {
  let h = (a * 374761393 + b * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

const glow = await rasterise([FACE_GLOW], 1.5, 1.2);
// The helmet's lights, unlit: the V reads as dark glass with a faint cool
// sheen until the final call fills it.
const unlit = Buffer.from(rgb);
for (let i = 0; i < N; i += 1) {
  const g = glow[i];
  if (!g) continue;
  const r = rgb[i * 3];
  const gr = rgb[i * 3 + 1];
  const b = rgb[i * 3 + 2];
  const l = 0.2126 * r + 0.7152 * gr + 0.0722 * b;
  const off = [10 + l * 0.12, 16 + l * 0.15, 26 + l * 0.22];
  unlit[i * 3] = Math.round(r + (off[0] - r) * g);
  unlit[i * 3 + 1] = Math.round(gr + (off[1] - gr) * g);
  unlit[i * 3 + 2] = Math.round(b + (off[2] - b) * g);
}

// --- Partition ----------------------------------------------------------------
// Where a polygon cuts across the black bodysuit, a straight cut would float
// off as a hard-edged slab: near its edge (a ~16 px band inside the body) a
// piece keeps only the lit armour, and the dark suit there stays with the
// body layer. Deeper inside, a piece keeps its black plates.
const bodyCore = await rasterise([BODY]);
const armour = await blurField(
  Float32Array.from({ length: N }, (_, i) => {
    const bright = Math.max(rgb[i * 3], rgb[i * 3 + 1], rgb[i * 3 + 2]);
    return Math.min(1, Math.max(0, (bright - 36) / 44));
  }),
  1.2,
);
const remaining = new Float32Array(N).fill(1);
const pieceFields = [];
const claimed = new Float32Array(N);
for (const piece of PIECES) {
  const poly = await rasterise([piece.poly]);
  const depth = await blurField(poly, 9);
  const field = new Float32Array(N);
  for (let i = 0; i < N; i += 1) {
    const take = poly[i] * remaining[i];
    remaining[i] -= take;
    if (!take) continue;
    const inner = Math.min(1, Math.max(0, (depth[i] - 0.72) / 0.26));
    const keep = bodyCore[i] > 0.5 ? Math.max(armour[i], inner) : 1;
    field[i] = take * alpha[i] * keep;
    claimed[i] += field[i];
  }
  pieceFields.push(field);
  if (DEBUG)
    console.log(
      piece.id,
      Math.round(poly.reduce((s, v) => s + v, 0)),
      Math.round(field.reduce((s, v) => s + v, 0)),
    );
}
const body = new Float32Array(N);
for (let i = 0; i < N; i += 1) body[i] = Math.max(0, alpha[i] - claimed[i]);

// --- Outputs ------------------------------------------------------------------
mkdirSync(OUT_DIR, { recursive: true });
for (const file of readdirSync(OUT_DIR)) rmSync(join(OUT_DIR, file));
const files = [];
async function writeWebp(name, raw, width, height, options = {}) {
  const path = `${OUT_DIR}${name}`;
  const result = await sharp(raw, { raw: { width, height, channels: 4 } })
    .webp({ quality: 76, alphaQuality: 70, effort: 6, smartSubsample: true, ...options })
    .toFile(path);
  files.push({ name, bytes: result.size });
  return `${PUBLIC_PATH}/${name}`;
}

// The finished figure (still tiers and the fallback).
const figureRaw = await toDelivery(rgba(alpha));
const FIGURE = await writeWebp("figure.webp", figureRaw, FIG_W, FIG_H, { quality: 68 });

// The bodysuit: the body's own form, desaturated and sunk into a dark
// suit, a faint nanite hex mesh, thin cyan seams and a cool edge light.
const bodyMask = await rasterise([BODY], 0, 0.7);
const formLight = await blurField(
  Float32Array.from({ length: N }, (_, i) => {
    const l = (0.2126 * rgb[i * 3] + 0.7152 * rgb[i * 3 + 1] + 0.0722 * rgb[i * 3 + 2]) / 255;
    return l * bodyMask[i];
  }),
  4,
);
const inner = await blurField(bodyMask, 9);
const hexSvg = (() => {
  const size = 15;
  const h = size * Math.sqrt(3);
  let d = "";
  for (let row = -1; row * h < H + h; row += 1) {
    for (let col = -1; col * size * 3 < W + size * 3; col += 1) {
      for (const [ox, oy] of [
        [0, 0],
        [size * 1.5, h / 2],
      ]) {
        const cx = col * size * 3 + ox;
        const cy = row * h + oy;
        d += `M${(cx + size).toFixed(1)} ${cy.toFixed(1)}`;
        for (let k = 1; k <= 6; k += 1) {
          const a = (k * Math.PI) / 3;
          d += `L${(cx + Math.cos(a) * size).toFixed(1)} ${(cy + Math.sin(a) * size).toFixed(1)}`;
        }
      }
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="#000"/><path d="${d}" fill="none" stroke="#fff" stroke-width="1.3"/></svg>`;
})();
const hex = await (async () => {
  const { data } = await sharp(Buffer.from(hexSvg))
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const step = data.length / N;
  return Float32Array.from({ length: N }, (_, i) => data[i * step] / 255);
})();
const seamSvg = (width, colour) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="#000"/>${SEAMS.map(
    (line) =>
      `<polyline points="${line.map(([x, y]) => `${x},${y}`).join(" ")}" fill="none" stroke="${colour}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"/>`,
  ).join("")}</svg>`;
const seamField = async (width, blur) => {
  let image = sharp(Buffer.from(seamSvg(width, "#fff"))).greyscale();
  if (blur) image = image.blur(blur);
  const { data } = await image.raw().toBuffer({ resolveWithObject: true });
  const step = data.length / N;
  return Float32Array.from({ length: N }, (_, i) => data[i * step] / 255);
};
const seamLine = await seamField(2.6, 0);
const seamGlow = await seamField(9, 5);
const suit = Buffer.alloc(N * 3);
for (let i = 0; i < N; i += 1) {
  const x = i % W;
  const m = bodyMask[i];
  if (!m) continue;
  const form = formLight[i] / Math.max(0.05, inner[i] > 0.02 ? 1 : 1);
  // Lit from the top left, cool on the left and warm-violet on the right.
  const side = x < MID / 2 ? 0 : 1;
  const edge = Math.max(0, m - inner[i]) * 1.8;
  const mesh = hex[i] * 0.16;
  const seam = seamLine[i] * 0.85 + seamGlow[i] * 0.35;
  const base = [9 + form * 70, 14 + form * 84, 24 + form * 108];
  const rim = side ? [255, 150, 225] : CYAN;
  for (let c = 0; c < 3; c += 1) {
    const value =
      base[c] + mesh * 120 * (c === 0 ? 0.6 : 1) + edge * rim[c] * 0.42 + seam * CYAN[c];
    suit[i * 3 + c] = Math.round(Math.min(255, value));
  }
}
const UNDERSUIT = await writeWebp(
  "undersuit.webp",
  await toDelivery(rgba(bodyMask, suit)),
  FIG_W,
  FIG_H,
  {
    quality: 62,
  },
);

// The bodysuit between the plates (what no piece claims), as painted.
const bodyBox = deliveryBox(bounds(body), 2);
const BODY_LAYER = await writeWebp(
  "body.webp",
  extractRaw(await toDelivery(rgba(body)), bodyBox),
  bodyBox.width,
  bodyBox.height,
  { quality: 66 },
);

// The face's lights, lit (they replace the helmet's unlit V on the last call).
const faceField = new Float32Array(N);
for (let i = 0; i < N; i += 1) faceField[i] = glow[i] * alpha[i];
const faceBox = deliveryBox(bounds(faceField), 3);
const FACE = await writeWebp(
  "face.webp",
  extractRaw(await toDelivery(rgba(faceField)), faceBox),
  faceBox.width,
  faceBox.height,
  { quality: 86 },
);

// Each piece: [art | nanite mosaic | rim] in one sprite.
const RIM = 12; // delivery px of room around a piece for its rim light
const pieces = [];
for (const [index, piece] of PIECES.entries()) {
  const field = pieceFields[index];
  const found = bounds(field);
  if (!found && !DEBUG) throw new Error(`${piece.id}: the polygon claims nothing`);
  if (!found) continue;
  const box = deliveryBox(found, Math.ceil(RIM / SCALE) + 1);
  const colours = piece.id === "helmet" ? unlit : rgb;
  const art = extractRaw(await toDelivery(rgba(field, colours)), box);
  const { width: w, height: h } = box;
  // Coverage in the delivery box.
  const cover = new Float32Array(w * h);
  for (let i = 0; i < w * h; i += 1) cover[i] = art[i * 4 + 3] / 255;
  // The mosaic: blocks on the figure's grid (so neighbouring pieces' blocks
  // line up), each the block's average colour pushed toward the nanite
  // light, with a hairline gap; a few blocks burn white.
  const mosaic = Buffer.alloc(w * h * 4);
  const gx0 = Math.floor(box.left / MOSAIC) * MOSAIC;
  const gy0 = Math.floor(box.top / MOSAIC) * MOSAIC;
  for (let by = gy0; by < box.top + h; by += MOSAIC) {
    for (let bx = gx0; bx < box.left + w; bx += MOSAIC) {
      let sum = 0;
      let r = 0;
      let g = 0;
      let b = 0;
      let count = 0;
      for (let y = Math.max(by, box.top); y < Math.min(by + MOSAIC, box.top + h); y += 1) {
        for (let x = Math.max(bx, box.left); x < Math.min(bx + MOSAIC, box.left + w); x += 1) {
          const i = (y - box.top) * w + (x - box.left);
          // Weighted by light: the mosaic follows the lit armour (gold,
          // crystal, rims), not the black suit inside a cut.
          const lit = Math.max(art[i * 4], art[i * 4 + 1], art[i * 4 + 2]);
          const a = cover[i] * Math.min(1, Math.max(0.05, (lit - 30) / 70));
          sum += a;
          r += art[i * 4] * a;
          g += art[i * 4 + 1] * a;
          b += art[i * 4 + 2] * a;
          count += 1;
        }
      }
      const coverage = sum / (MOSAIC * MOSAIC);
      if (coverage < 0.2 || !count) continue;
      r /= sum;
      g /= sum;
      b /= sum;
      // Each block keeps its own light (so forming never flashes brighter
      // than the plate it becomes), tinted toward its family: gold, pink
      // or ice; one in sixteen burns a little whiter.
      const k = hash(bx, by + index * 7919);
      const gold = r > b * 1.25 && g > b * 1.05;
      const tint = k > 0.94 ? WHITE : gold ? GOLD : r > g * 1.1 ? PINK : CYAN;
      const lift = k > 0.94 ? 0.45 : 0.3;
      const colour = [r, g, b].map((value, c) =>
        Math.min(255, value * (1 - lift) + tint[c] * lift * 0.8),
      );
      const opacity = Math.min(0.92, 0.45 + coverage * 0.5);
      for (let y = by + 1; y < by + MOSAIC - 1; y += 1) {
        for (let x = bx + 1; x < bx + MOSAIC - 1; x += 1) {
          if (x < box.left || y < box.top || x >= box.left + w || y >= box.top + h) continue;
          const i = (y - box.top) * w + (x - box.left);
          mosaic[i * 4] = colour[0];
          mosaic[i * 4 + 1] = colour[1];
          mosaic[i * 4 + 2] = colour[2];
          mosaic[i * 4 + 3] = Math.round(opacity * 255);
        }
      }
    }
  }
  // The rim: a soft cyan halo just outside the piece.
  const halo = await blurField(cover, 4.5, w, h);
  const rim = Buffer.alloc(w * h * 4);
  for (let i = 0; i < w * h; i += 1) {
    const a = Math.min(1, Math.max(0, (halo[i] - cover[i]) * 2.4));
    rim[i * 4] = 150;
    rim[i * 4 + 1] = 240;
    rim[i * 4 + 2] = 255;
    rim[i * 4 + 3] = Math.round(a * 200);
  }
  const sprite = Buffer.alloc(w * 3 * h * 4);
  for (let y = 0; y < h; y += 1) {
    art.copy(sprite, y * w * 3 * 4, y * w * 4, (y + 1) * w * 4);
    mosaic.copy(sprite, (y * w * 3 + w) * 4, y * w * 4, (y + 1) * w * 4);
    rim.copy(sprite, (y * w * 3 + 2 * w) * 4, y * w * 4, (y + 1) * w * 4);
  }
  const src = await writeWebp(`${piece.id}.webp`, sprite, w * 3, h);
  pieces.push({
    id: piece.id,
    group: piece.group,
    src,
    x: box.left,
    y: box.top,
    w,
    h,
    seat: [fx(piece.seat[0]), fy(piece.seat[1])],
    ...(piece.float ? { float: piece.float } : {}),
  });
}

// --- The module -------------------------------------------------------------------
const point = ([x, y]) => `[${fx(x)}, ${fy(y)}]`;
const total = files.reduce((sum, file) => sum + file.bytes, 0);
const ts = `// Generated by scripts/build-rexonance-suit.mjs from
// design/rexonance-suit/rexonance-full-${VERSION}.jpg — do not edit by hand.
// Figure coordinates are delivery pixels of the ${FIG_W} x ${FIG_H} figure.
// ${files.length} files, ${total} bytes.

export const REXONANCE_SUIT_SIZE = { width: ${FIG_W}, height: ${FIG_H} } as const;

/** The finished figure (the still tiers and the fallback). */
export const REXONANCE_SUIT_FIGURE = "${FIGURE}";
/** The bare bodysuit the armour lands on. */
export const REXONANCE_SUIT_UNDERSUIT = "${UNDERSUIT}";

export type RexonanceSuitLayer = {
  readonly src: string;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
};
/** The bodysuit between the plates, as painted. */
export const REXONANCE_SUIT_BODY: RexonanceSuitLayer = ${JSON.stringify({ src: BODY_LAYER, x: bodyBox.left, y: bodyBox.top, w: bodyBox.width, h: bodyBox.height })};
/** The face's cyan and pink lights, lit. */
export const REXONANCE_SUIT_FACE: RexonanceSuitLayer = ${JSON.stringify({ src: FACE, x: faceBox.left, y: faceBox.top, w: faceBox.width, h: faceBox.height })};
/** The lights' outline, for the final call's pixel squares. */
export const REXONANCE_SUIT_FACE_GLOW: readonly (readonly [number, number])[] = [
  ${FACE_GLOW.map(point).join(", ")},
];

export type RexonanceSuitGroup = "legs" | "arms" | "chest" | "waist" | "tail" | "ribbon" | "helm";
export type RexonanceSuitPiece = RexonanceSuitLayer & {
  readonly id: string;
  readonly group: RexonanceSuitGroup;
  /** Where its clank sparks (a seam). */
  readonly seat: readonly [number, number];
  /** The hover it forms in: [dx, dy] in figure heights, a turn (deg), a scale. */
  readonly float?: readonly [number, number, number, number];
};
/** Each piece's sprite holds three panels: art, nanite mosaic, rim. Front first. */
export const REXONANCE_SUIT_PIECES: readonly RexonanceSuitPiece[] = [
${pieces.map((piece) => `  ${JSON.stringify(piece)},`).join("\n")}
];

export const REXONANCE_SUIT_MARKS = {
  core: ${point(MARKS.core)},
  visor: ${point(MARKS.visor)},
  belt: ${point(MARKS.belt)},
  joints: [${MARKS.joints.map(point).join(", ")}],
} as const;

/** Every file the suit-up paints, for the warm-up. */
export const REXONANCE_SUIT_ASSETS = [
  REXONANCE_SUIT_UNDERSUIT,
  ...REXONANCE_SUIT_PIECES.map((piece) => piece.src),
  REXONANCE_SUIT_BODY.src,
  REXONANCE_SUIT_FACE.src,
] as const;
`;
const prettier = await import("prettier");
writeFileSync(
  MODULE,
  await prettier.format(ts, { ...(await prettier.resolveConfig(MODULE)), filepath: MODULE }),
);
for (const file of files) console.log(`${file.name}\t${file.bytes}`);
console.log(`total\t${total} bytes in ${files.length} files; figure ${FIG_W}x${FIG_H}, crop`, CROP);

if (DEBUG) {
  mkdirSync(DEBUG, { recursive: true });
  // Every piece tinted on the figure, its polygon outlined.
  const palette = [
    [255, 80, 80],
    [80, 255, 80],
    [80, 140, 255],
    [255, 220, 60],
    [255, 80, 255],
    [60, 240, 240],
    [255, 150, 40],
    [160, 90, 255],
    [140, 255, 160],
    [255, 120, 160],
    [120, 200, 255],
  ];
  const tinted = Buffer.alloc(N * 3);
  for (let i = 0; i < N; i += 1) {
    let r = rgb[i * 3] * 0.55;
    let g = rgb[i * 3 + 1] * 0.55;
    let b = rgb[i * 3 + 2] * 0.55;
    pieceFields.forEach((field, k) => {
      const t = field[i] * 0.45;
      if (!t) return;
      const [pr, pg, pb] = palette[k % palette.length];
      r += pr * t;
      g += pg * t;
      b += pb * t;
    });
    if (body[i] > 0.5) {
      r += 40;
      g += 40;
      b += 40;
    }
    if (background[i]) {
      r = 40;
      g = 0;
      b = 40;
    }
    tinted[i * 3] = Math.min(255, r);
    tinted[i * 3 + 1] = Math.min(255, g);
    tinted[i * 3 + 2] = Math.min(255, b);
  }
  const outline = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">${PIECES.map(
    (piece, k) =>
      `<path d="${svgPath(piece.poly)}" fill="none" stroke="rgb(${palette[k % palette.length].join(",")})" stroke-width="2"/><text x="${piece.poly[0][0]}" y="${piece.poly[0][1] + 14}" fill="#fff" font-size="16" font-family="monospace">${piece.id}</text>`,
  ).join(
    "",
  )}<path d="${svgPath(BODY)}" fill="none" stroke="#fff" stroke-dasharray="6 4" stroke-width="1.5"/><path d="${svgPath(FACE_GLOW)}" fill="none" stroke="#0ff" stroke-width="1.5"/></svg>`;
  await sharp(tinted, { raw: { width: W, height: H, channels: 3 } })
    .composite([{ input: Buffer.from(outline) }])
    .jpeg({ quality: 84 })
    .toFile(`${DEBUG}/partition.jpg`);
}
