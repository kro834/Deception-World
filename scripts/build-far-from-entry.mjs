#!/usr/bin/env node
// FAR FROM SAGA — the entry transformation's suit data (owner, 2026-10-22).
// Reproducible:
//
//   node scripts/build-far-from-entry.mjs [--check]
//
// reads the owner's transparent ミドル cutout (design/far-from-entry/
// middle-20261022.webp, 1024 x 1536) and writes public/far-from-entry-
// 20261022/{figure,plates,lights}.webp and src/lib/far-from-entry-suit.ts.
//
// The entry (far-from-entry-sequence.tsx) is modelled on Rexonance's: the
// same wearer's bare undersuit is scanned in, the fire engulfs it and
// bursts into nanites, and the armour assembles plate by plate out of the
// artwork's own micro-tiles, ending on ミドル. The figure's frame is the
// cutout scaled to the Rexonance delivery height (1040 px, so the shared
// fire, the kit's sprites and the tile sizes keep their scale); the
// Rexonance undersuit (571 x 1040) is registered inside it crown to soles
// (FAR_FROM_ENTRY_UNDER). The plates are authored zones over the figure
// (polygons in the cutout's pixels below): every opaque pixel goes to the
// first zone that claims it, and what no zone claims to the nearest zone,
// so the plates partition the figure exactly. Each plate ships its own cell
// in one atlas (plates.webp, its art with the crystals' light held back) and
// its micro-tile bitmask (9 px squares that carry art); lights.webp is that
// light alone, in the frame, for the final call's light-up from the
// reactor; figure.webp is the finished figure, the artwork exactly.
import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const sharp = require(process.env.SHARP_MODULE || "sharp");

const VERSION = "20261022";
const SOURCE = fileURLToPath(
  new URL(`../design/far-from-entry/middle-${VERSION}.webp`, import.meta.url),
);
const OUT_DIR = fileURLToPath(new URL(`../public/far-from-entry-${VERSION}/`, import.meta.url));
const PUBLIC_PATH = `/far-from-entry-${VERSION}`;
const MODULE = fileURLToPath(new URL("../src/lib/far-from-entry-suit.ts", import.meta.url));
const CHECK = process.argv.includes("--check");

// The Rexonance registration contract (src/lib/rexonance-suit.ts).
const DELIVERY_H = 1040;
const UNDER_W = 571;
const UNDER_H = 1040;
// The undersuit's bare crown and soles, and its axis, in its own frame.
const UNDER_CROWN = 81;
const UNDER_SOLES = 1037;
const UNDER_AXIS = 284.2;
// The micro-tile (REXONANCE_SUIT_TILE) and the atlas gutter, delivery px.
const TILE = 9;
const GUTTER = 2;
const ATLAS_W = 1024;
// A pixel this opaque belongs to the figure.
const OPAQUE = 16;

// --- The figure in the cutout's pixels (1024 x 1536) ----------------------
// The axis of symmetry, the helmet's dome top (under the horns) and the
// boots' soles.
const AXIS = 512;
const DOME_TOP = 107;
const SOLES = 1495;
const mirror = (points) => points.map(([x, y]) => [2 * AXIS - x, y]);
const rect = (x0, y0, x1, y1) => [
  [x0, y0],
  [x1, y0],
  [x1, y1],
  [x0, y1],
];
const circle = (cx, cy, r, n = 24) =>
  Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    return [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
  });
const diamond = (cx, cy, rx, ry) => [
  [cx - rx, cy],
  [cx, cy - ry],
  [cx + rx, cy],
  [cx, cy + ry],
];

// The zones, in the order they claim pixels (front first): id, group, the
// way the plate grows from its seam, the seam, and the polygon.
const SHOULDER_L = [
  [170, 330],
  [200, 200],
  [285, 170],
  [400, 235],
  [425, 265],
  [425, 430],
  [300, 445],
  [185, 405],
];
const ZONES = [
  // The floating bits: ファーフロムビット, seven in ミドル.
  ["bit-tl", "bits", "up", [250, 205], rect(150, 20, 335, 205)],
  ["bit-ts", "bits", "up", [378, 130], rect(336, 30, 420, 130)],
  ["bit-tr", "bits", "up", [870, 140], rect(848, 20, 905, 140)],
  ["bit-ml", "bits", "up", [147, 500], diamond(147, 420, 95, 85)],
  ["bit-mr", "bits", "up", [880, 500], diamond(880, 420, 95, 85)],
  ["bit-ll", "bits", "up", [120, 875], diamond(120, 790, 95, 90)],
  ["bit-lr", "bits", "up", [905, 875], diamond(905, 790, 95, 90)],
  // The helmet: the crest (horns and dome) over the visor and jaw.
  ["helmet-crest", "helm", "up", [512, 170], rect(425, 12, 600, 170)],
  ["helmet-visor", "helm", "up", [512, 255], rect(405, 165, 620, 255)],
  // The scarf round the neck.
  ["scarf", "scarf", "up", [512, 350], rect(385, 240, 640, 350)],
  // The shoulders' discs and pauldrons.
  ["shoulder-disc-l", "shoulders", "up", [392, 368], circle(392, 322, 46)],
  ["shoulder-disc-r", "shoulders", "up", [647, 368], circle(647, 322, 46)],
  // The chest (the reactor's crystal), the belt and the tasset blade.
  [
    "chest",
    "chest",
    "up",
    [512, 556],
    [
      [398, 340],
      [628, 340],
      [642, 470],
      [600, 560],
      [425, 560],
      [382, 470],
    ],
  ],
  ["belt", "waist", "up", [512, 640], rect(352, 548, 672, 640)],
  [
    "tasset",
    "waist",
    "down",
    [512, 640],
    [
      [440, 636],
      [585, 636],
      [560, 900],
      [512, 1095],
      [465, 900],
    ],
  ],
  // The hip blades, from the hips down past the knees (over the thighs).
  [
    "spike-l",
    "waist",
    "down",
    [390, 760],
    [
      [367, 741],
      [413, 779],
      [103, 1159],
      [57, 1121],
    ],
  ],
  [
    "spike-r",
    "waist",
    "down",
    [634, 760],
    mirror([
      [367, 741],
      [413, 779],
      [103, 1159],
      [57, 1121],
    ]),
  ],
  // The arms, fist first (in front), then the bracer, then the upper arm.
  ["arm-fist-l", "arms", "down", [262, 700], rect(195, 700, 335, 845)],
  ["arm-fist-r", "arms", "down", [762, 700], rect(689, 700, 829, 845)],
  ["arm-bracer-l", "arms", "down", [258, 560], rect(175, 560, 340, 725)],
  ["arm-bracer-r", "arms", "down", [766, 560], rect(684, 560, 849, 725)],
  [
    "arm-upper-l",
    "arms",
    "down",
    [300, 430],
    [
      [185, 425],
      [405, 445],
      [405, 585],
      [200, 595],
    ],
  ],
  [
    "arm-upper-r",
    "arms",
    "down",
    [724, 430],
    [
      [619, 445],
      [839, 425],
      [824, 595],
      [619, 585],
    ],
  ],
  ["shoulder-l", "shoulders", "left", [425, 320], SHOULDER_L],
  ["shoulder-r", "shoulders", "right", [599, 320], mirror(SHOULDER_L)],
  // The legs: thighs, knees, shins, boots.
  [
    "thigh-l",
    "legs",
    "up",
    [385, 900],
    [
      [298, 660],
      [470, 636],
      [482, 900],
      [288, 900],
    ],
  ],
  [
    "thigh-r",
    "legs",
    "up",
    [639, 900],
    [
      [554, 636],
      [726, 660],
      [736, 900],
      [542, 900],
    ],
  ],
  ["knee-l", "legs", "up", [382, 1082], rect(288, 895, 478, 1082)],
  ["knee-r", "legs", "up", [641, 1082], rect(546, 895, 736, 1082)],
  ["shin-l", "legs", "up", [364, 1305], rect(250, 1078, 478, 1305)],
  ["shin-r", "legs", "up", [660, 1305], rect(546, 1078, 774, 1305)],
  ["boot-l", "legs", "up", [340, 1500], rect(195, 1300, 485, 1500)],
  ["boot-r", "legs", "up", [684, 1500], rect(539, 1300, 829, 1500)],
  // The tail, from its root at the right shoulder; the cape, from the
  // shoulders down.
  [
    "tail",
    "tail",
    "right",
    [640, 180],
    [
      [615, 180],
      [655, 60],
      [755, 28],
      [885, 70],
      [905, 250],
      [875, 445],
      [770, 445],
      [700, 330],
    ],
  ],
  ["cape-l", "ribbon", "down", [300, 240], rect(5, 215, 430, 760)],
  ["cape-r", "ribbon", "down", [724, 240], rect(594, 215, 1020, 760)],
];

// The marks: the reactor (the chest's crystal), the visor (the eyes) and
// the belt's core; the joints the alignment brackets bite on.
const MARKS = {
  core: [512, 390],
  visor: [512, 200],
  belt: [512, 592],
  joints: [
    [512, 390],
    [392, 322],
    [647, 322],
    [262, 575],
    [762, 575],
    [365, 990],
    [660, 990],
  ],
};
// The eyes' glow (a chevron on the visor) and the reactor's crystal, for
// the final call's pixel squares (fill, then scatter).
const EYES_GLOW = [
  [450, 160],
  [482, 160],
  [512, 205],
  [542, 160],
  [574, 160],
  [512, 242],
];
const REACTOR_GLOW = [
  [436, 356],
  [588, 356],
  [555, 402],
  [512, 436],
  [469, 402],
];

// --- Raster helpers --------------------------------------------------------
const inside = (polygon, px, py) => {
  let hit = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    if (yi > py !== yj > py && ((xj - xi) * (py - yi)) / (yj - yi) + xi - px > 0) hit = !hit;
  }
  return hit;
};
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
// Hue (degrees), saturation and lightness of an sRGB byte triple.
function hsl(r, g, b) {
  const R = r / 255;
  const G = g / 255;
  const B = b / 255;
  const max = Math.max(R, G, B);
  const min = Math.min(R, G, B);
  const l = (max + min) / 2;
  const d = max - min;
  if (d < 1e-6) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  let h;
  if (max === R) h = ((G - B) / d) % 6;
  else if (max === G) h = (B - R) / d + 2;
  else h = (R - G) / d + 4;
  h *= 60;
  if (h < 0) h += 360;
  return [h, s, l];
}
// The crystals' light: saturated cyan, blue, violet and pink (the eyes, the
// reactor, the discs, the belt's core, the cape's stars), bright enough to
// read as emission; 0 for the black-silver armour and the gold trims.
function lightWeight(r, g, b) {
  const [h, s, l] = hsl(r, g, b);
  if (s < 0.3 || l < 0.28) return 0;
  const hue =
    h >= 185 && h <= 330
      ? 1
      : h > 170 && h < 185
        ? (h - 170) / 15
        : h > 330 && h < 345
          ? (345 - h) / 15
          : 0;
  return hue * smoothstep(0.3, 0.6, s) * smoothstep(0.28, 0.5, l);
}
const bits64 = (bits) => Buffer.from(bits).toString("base64");

// --- Build -----------------------------------------------------------------
const { info } = await sharp(SOURCE)
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });
const SRC_W = info.width;
const SRC_H = info.height;
if (SRC_W !== 1024 || SRC_H !== 1536) throw new Error(`unexpected cutout ${SRC_W} x ${SRC_H}`);
const F = DELIVERY_H / SRC_H;
const FIG_W = Math.round(SRC_W * F);
const FIG_H = DELIVERY_H;
const fx = (x) => Math.round(x * F * 10) / 10;
const fy = (y) => Math.round(y * F * 10) / 10;

// The figure at delivery size, from the cutout's own pixels.
const { data: fig } = await sharp(SOURCE)
  .ensureAlpha()
  .resize(FIG_W, FIG_H, { kernel: "lanczos3", fit: "fill" })
  .raw()
  .toBuffer({ resolveWithObject: true });
const N = FIG_W * FIG_H;

// The label map: the first zone that claims a pixel, then the nearest.
const label = new Int16Array(N).fill(-1);
const zonesF = ZONES.map(([, , , , polygon]) => polygon.map(([x, y]) => [x * F, y * F]));
let opaque = 0;
for (let y = 0; y < FIG_H; y += 1)
  for (let x = 0; x < FIG_W; x += 1) {
    const i = y * FIG_W + x;
    if (fig[i * 4 + 3] <= OPAQUE) continue;
    opaque += 1;
    for (let z = 0; z < ZONES.length; z += 1)
      if (inside(zonesF[z], x + 0.5, y + 0.5)) {
        label[i] = z;
        break;
      }
  }
// What no zone claimed: the nearest labelled pixel's zone, by rings.
let unclaimed = 0;
for (let i = 0; i < N; i += 1) if (fig[i * 4 + 3] > OPAQUE && label[i] < 0) unclaimed += 1;
if (unclaimed) {
  const queue = [];
  for (let i = 0; i < N; i += 1) if (label[i] >= 0) queue.push(i);
  let head = 0;
  while (head < queue.length) {
    const i = queue[head++];
    const x = i % FIG_W;
    const y = (i - x) / FIG_W;
    for (let dy = -1; dy <= 1; dy += 1)
      for (let dx = -1; dx <= 1; dx += 1) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= FIG_W || ny >= FIG_H) continue;
        const j = ny * FIG_W + nx;
        if (label[j] >= 0 || fig[j * 4 + 3] <= OPAQUE) continue;
        label[j] = label[i];
        queue.push(j);
      }
  }
}

// The light split: the crystals' light, and the figure with it held back.
const lights = Buffer.alloc(N * 4);
const unlit = Buffer.alloc(N * 4);
let lightPixels = 0;
for (let i = 0; i < N; i += 1) {
  const r = fig[i * 4];
  const g = fig[i * 4 + 1];
  const b = fig[i * 4 + 2];
  const a = fig[i * 4 + 3];
  const w = a > OPAQUE ? lightWeight(r, g, b) : 0;
  if (w > 0.5) lightPixels += 1;
  const lum = 0.3 * r + 0.59 * g + 0.11 * b;
  // Dark glass: the crystal's own values, deep and desaturated, blue-black.
  const dr = lum * 0.2 + 4;
  const dg = lum * 0.24 + 6;
  const db = lum * 0.34 + 12;
  unlit[i * 4] = Math.round(r + (dr - r) * w);
  unlit[i * 4 + 1] = Math.round(g + (dg - g) * w);
  unlit[i * 4 + 2] = Math.round(b + (db - b) * w);
  unlit[i * 4 + 3] = a;
  lights[i * 4] = r;
  lights[i * 4 + 1] = g;
  lights[i * 4 + 2] = b;
  lights[i * 4 + 3] = Math.round(a * w);
}

// The plates: each zone's box, tiles and atlas cell.
const plates = ZONES.map(([id, group, dir, seat], z) => {
  let x0 = FIG_W;
  let y0 = FIG_H;
  let x1 = -1;
  let y1 = -1;
  let count = 0;
  for (let i = 0; i < N; i += 1) {
    if (label[i] !== z) continue;
    count += 1;
    const x = i % FIG_W;
    const y = (i - x) / FIG_W;
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
  }
  if (!count) throw new Error(`zone ${id} claims no pixels`);
  const w = x1 - x0 + 1;
  const h = y1 - y0 + 1;
  const cols = Math.ceil(w / TILE);
  const rows = Math.ceil(h / TILE);
  const bits = new Uint8Array(Math.ceil((cols * rows) / 8));
  let tiles = 0;
  for (let row = 0; row < rows; row += 1)
    for (let col = 0; col < cols; col += 1) {
      let painted = false;
      for (let yy = row * TILE; yy < Math.min(h, (row + 1) * TILE) && !painted; yy += 1)
        for (let xx = col * TILE; xx < Math.min(w, (col + 1) * TILE); xx += 1)
          if (label[(y0 + yy) * FIG_W + x0 + xx] === z) {
            painted = true;
            break;
          }
      if (!painted) continue;
      const bit = row * cols + col;
      bits[bit >> 3] |= 1 << (bit & 7);
      tiles += 1;
    }
  return {
    id,
    group,
    dir,
    seat: [fx(seat[0]), fy(seat[1])],
    x: x0,
    y: y0,
    w,
    h,
    z,
    count,
    tiles,
    bits,
  };
});

// The atlas: shelves of the plates' cells, tallest first.
const order = [...plates].sort((a, b) => b.h - a.h);
let shelfY = 0;
let shelfH = 0;
let cursorX = 0;
for (const plate of order) {
  if (cursorX + plate.w + GUTTER > ATLAS_W) {
    shelfY += shelfH + GUTTER;
    shelfH = 0;
    cursorX = 0;
  }
  plate.ax = cursorX;
  plate.ay = shelfY;
  cursorX += plate.w + GUTTER;
  shelfH = Math.max(shelfH, plate.h);
}
const ATLAS_H = shelfY + shelfH;
const atlas = Buffer.alloc(ATLAS_W * ATLAS_H * 4);
for (const plate of plates)
  for (let yy = 0; yy < plate.h; yy += 1)
    for (let xx = 0; xx < plate.w; xx += 1) {
      const i = (plate.y + yy) * FIG_W + plate.x + xx;
      if (label[i] !== plate.z) continue;
      const k = ((plate.ay + yy) * ATLAS_W + plate.ax + xx) * 4;
      atlas[k] = unlit[i * 4];
      atlas[k + 1] = unlit[i * 4 + 1];
      atlas[k + 2] = unlit[i * 4 + 2];
      atlas[k + 3] = unlit[i * 4 + 3];
    }

// The undersuit's registration: crown to soles on the figure's axis.
const crownY = DOME_TOP * F;
const solesY = SOLES * F;
const k = (solesY - crownY) / (UNDER_SOLES - UNDER_CROWN);
const UNDER = {
  x: Math.round((AXIS * F - UNDER_AXIS * k) * 10) / 10,
  y: Math.round((crownY - UNDER_CROWN * k) * 10) / 10,
  w: Math.round(UNDER_W * k * 10) / 10,
  h: Math.round(UNDER_H * k * 10) / 10,
};

// --- Write -----------------------------------------------------------------
const files = [
  [
    "figure.webp",
    sharp(Buffer.from(fig), { raw: { width: FIG_W, height: FIG_H, channels: 4 } }).webp({
      quality: 86,
      alphaQuality: 100,
      effort: 6,
    }),
  ],
  [
    "plates.webp",
    sharp(atlas, { raw: { width: ATLAS_W, height: ATLAS_H, channels: 4 } }).webp({
      quality: 86,
      alphaQuality: 100,
      effort: 6,
    }),
  ],
  [
    "lights.webp",
    sharp(lights, { raw: { width: FIG_W, height: FIG_H, channels: 4 } }).webp({
      quality: 82,
      alphaQuality: 100,
      effort: 6,
    }),
  ],
];
const sizes = {};
if (!CHECK) mkdirSync(OUT_DIR, { recursive: true });
for (const [name, pipeline] of files) {
  const buffer = await pipeline.toBuffer();
  sizes[name] = buffer.length;
  if (CHECK) {
    const published = readFileSync(OUT_DIR + name);
    if (!published.equals(buffer)) throw new Error(`${name} is out of date: rebuild`);
  } else writeFileSync(OUT_DIR + name, buffer);
}
const total = Object.values(sizes).reduce((sum, n) => sum + n, 0);

const point = ([x, y]) => `[${x}, ${y}]`;
const polygon = (points) => `[\n${points.map(([x, y]) => `  [${fx(x)}, ${fy(y)}],`).join("\n")}\n]`;
const box = (points) => {
  const xs = points.map(([x]) => fx(x));
  const ys = points.map(([, y]) => fy(y));
  return `{ x: ${Math.min(...xs)}, y: ${Math.min(...ys)}, w: ${Math.round((Math.max(...xs) - Math.min(...xs)) * 10) / 10}, h: ${Math.round((Math.max(...ys) - Math.min(...ys)) * 10) / 10} }`;
};
const pieces = plates
  .map(
    (p) => `  {
    id: "${p.id}",
    group: "${p.group}",
    dir: "${p.dir}",
    x: ${p.x},
    y: ${p.y},
    w: ${p.w},
    h: ${p.h},
    seat: ${point(p.seat)},
    tiles: "${bits64(p.bits)}",
    ax: ${p.ax},
    ay: ${p.ay},
  },`,
  )
  .join("\n");
const groups = [...new Set(plates.map((p) => p.group))];
const module = `// Generated by scripts/build-far-from-entry.mjs from
// design/far-from-entry/middle-${VERSION}.webp — do not edit by hand.
// FAR FROM SAGA's entry transformation: the owner's ミドル cutout (1024 x
// 1536) at the Rexonance delivery height, cut into plates along authored
// zones. Figure coordinates are delivery pixels of the ${FIG_W} x ${FIG_H} figure.
// ${files.length} files, ${total} bytes.

export const FAR_FROM_ENTRY_SIZE = { width: ${FIG_W}, height: ${FIG_H} } as const;

/** The finished figure, ミドル: the still tiers, the fallback and the settle. */
export const FAR_FROM_ENTRY_FIGURE = "${PUBLIC_PATH}/figure.webp";
/** The crystals' light alone, in the figure's frame: lit from the reactor on
 * the last call. */
export const FAR_FROM_ENTRY_LIGHTS = "${PUBLIC_PATH}/lights.webp";

/** The Rexonance undersuit (the same wearer, src/lib/rexonance-suit.ts
 * REXONANCE_SUIT_UNDERSUIT, 571 x 1040) registered in this figure, crown to
 * soles on its axis: where it is drawn, scanned and burnt. */
export const FAR_FROM_ENTRY_UNDER = { x: ${UNDER.x}, y: ${UNDER.y}, w: ${UNDER.w}, h: ${UNDER.h} } as const;

export type FarFromEntryGroup = ${groups.map((g) => `"${g}"`).join(" | ")};
/** One plate of the armour: its box in the figure, its cell in the atlas
 * (plates.webp, the art with its light held back), the way it grows from its
 * seam, and the seam. */
export type FarFromEntryPiece = {
  readonly id: string;
  readonly group: FarFromEntryGroup;
  readonly dir: "up" | "down" | "left" | "right";
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly seat: readonly [number, number];
  /** Its micro-tiles that carry art (FAR_FROM_ENTRY_TILE px squares,
   * row-major over its box, LSB-first bitmask, base64). */
  readonly tiles: string;
  readonly ax: number;
  readonly ay: number;
};
/** The nanite micro-tile, in delivery px (${plates.reduce((s, p) => s + p.tiles, 0)} tiles in all). */
export const FAR_FROM_ENTRY_TILE = ${TILE};
/** The plates' atlas: each plate's cell, with the crystals' light held back. */
export const FAR_FROM_ENTRY_ATLAS = {
  src: "${PUBLIC_PATH}/plates.webp",
  width: ${ATLAS_W},
  height: ${ATLAS_H},
} as const;
/** The plates, front first; they partition the figure. */
export const FAR_FROM_ENTRY_PIECES: readonly FarFromEntryPiece[] = [
${pieces}
];

/** The marks: the reactor (the chest's crystal), the visor (the eyes), the
 * belt's core, and the joints the alignment brackets bite on. */
export const FAR_FROM_ENTRY_MARKS = {
  core: ${point([fx(MARKS.core[0]), fy(MARKS.core[1])])},
  visor: ${point([fx(MARKS.visor[0]), fy(MARKS.visor[1])])},
  belt: ${point([fx(MARKS.belt[0]), fy(MARKS.belt[1])])},
  joints: [
${MARKS.joints.map((j) => `    ${point([fx(j[0]), fy(j[1])])},`).join("\n")}
  ],
} as const;

/** The eyes' glow (a chevron on the visor), for the last call's pixel
 * squares: they fill it, hold, then scatter from the visor. */
export const FAR_FROM_ENTRY_EYES_GLOW: readonly (readonly [number, number])[] = ${polygon(EYES_GLOW)};
/** The eyes' box, a little wider than the glow. */
export const FAR_FROM_ENTRY_EYES_BOX = ${box(EYES_GLOW)};
/** The reactor's crystal: it completes as the eyes do (owner, 2026-10-22:
 * 「リアクターも複眼と同じくピクセル拡充からの拡散で完了します」). */
export const FAR_FROM_ENTRY_REACTOR_GLOW: readonly (readonly [number, number])[] = ${polygon(REACTOR_GLOW)};
export const FAR_FROM_ENTRY_REACTOR_BOX = ${box(REACTOR_GLOW)};

/** Every file the entry paints, in the order its warm-up fetches them. */
export const FAR_FROM_ENTRY_ASSETS = [
  FAR_FROM_ENTRY_ATLAS.src,
  FAR_FROM_ENTRY_FIGURE,
  FAR_FROM_ENTRY_LIGHTS,
] as const;
/** The files' bytes. */
export const FAR_FROM_ENTRY_BYTES = {
  figure: ${sizes["figure.webp"]},
  plates: ${sizes["plates.webp"]},
  lights: ${sizes["lights.webp"]},
  total: ${total},
} as const;
`;
if (CHECK) {
  if (readFileSync(MODULE, "utf8") !== module)
    throw new Error("src/lib/far-from-entry-suit.ts is out of date: rebuild");
  console.log(`ok: ${plates.length} plates, ${total} bytes, module current`);
} else {
  writeFileSync(MODULE, module);
  console.log(
    `${plates.length} plates (${plates.reduce((s, p) => s + p.tiles, 0)} tiles), atlas ${ATLAS_W} x ${ATLAS_H}, ${opaque} opaque px (${unclaimed} by nearest), ${lightPixels} light px`,
  );
  for (const [name] of files) console.log(`  ${name} ${statSync(OUT_DIR + name).size} bytes`);
  for (const p of plates)
    console.log(
      `  ${p.id.padEnd(16)} ${String(p.count).padStart(6)} px  ${p.tiles} tiles  box ${p.x},${p.y} ${p.w}x${p.h}`,
    );
  console.log("undersuit", UNDER);
}
