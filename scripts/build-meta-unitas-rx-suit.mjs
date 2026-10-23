#!/usr/bin/env node
// META UNITAS SAGA (2026-10-23; owner: 「メタ・ウニタスはレクソナンスと同じ装着
// です」): the scroll suit-up's raster parts in the Rexonance engine's terms
// (src/lib/rexonance-resonance.js mountRexonanceAssembly), as FAR FROM's
// were before its wireframe — this script is scripts/build-meta-unitas-rx-suit.mjs
// run on Meta Unitas' art:
//
//   node scripts/build-meta-unitas-rx-suit.mjs
//
// The plates are SAM 2.1's (owner: 「装甲切り出しはSAMを用いて」):
// design/meta-unitas-saga-20261023/sam-masks/middle/ (scripts/sam/make_masks.py,
// prompted by scripts/meta-unitas-suit-regions.mjs). The driver keeps its traced
// outline. The same wearer (月城悠真): Rexonance's undersuit, composited so its
// soles and reactor socket meet ミドル's soles and helix. ウルトラ (the owner's
// cutout, the same frame) is the chain's one form after ミドル.
//
// Writes public/meta-unitas-rx-suit-20261023/*.webp and src/lib/meta-unitas-rx-suit.ts,
// src/lib/meta-unitas-rx-suit-gold.ts, src/lib/meta-unitas-rx-suit-nanites.ts.
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);
const sharp = require(process.env.SHARP_MODULE || "sharp");
const ROOT = fileURLToPath(new URL("..", import.meta.url));
const importTs = (path) => import(pathToFileURL(join(ROOT, path)).href);
const FAR_FROM_CUTOUT = { width: 1024, height: 1536 };
const META_UNITAS_RX_SIZE = { width: 693, height: 1040 };
const { REXONANCE_SUIT_MARKS, REXONANCE_SUIT_UNDERSUIT } = await importTs("src/lib/rexonance-suit.ts");
const { separateDriverPixels } = await import(
  pathToFileURL(join(ROOT, "src/lib/rexonance-unlit.js")).href
);

const { META_UNITAS_REGIONS, META_UNITAS_BELTS } = await import(
  pathToFileURL(join(ROOT, "scripts/meta-unitas-suit-regions.mjs")).href
);
const BELT_OUTLINE = [META_UNITAS_BELTS.middle];

const VERSION = "20261023";
const DESIGN = join(ROOT, `design/meta-unitas-saga-${VERSION}`);
// The published assets' folder (2026-10-23: cut by SAM's masks; a new folder,
// so a cached atlas never meets the new module).
const ASSET_VERSION = "20261023";
const OUT_DIR = join(ROOT, `public/meta-unitas-rx-suit-${ASSET_VERSION}/`);
const PUBLIC_PATH = `/meta-unitas-rx-suit-${ASSET_VERSION}`;
const MODULE = join(ROOT, "src/lib/meta-unitas-rx-suit.ts");
const GOLD_MODULE = join(ROOT, "src/lib/meta-unitas-rx-suit-gold.ts");
const NANITES_MODULE = join(ROOT, "src/lib/meta-unitas-rx-suit-nanites.ts");
const debugArg = process.argv.find((arg) => arg.startsWith("--debug="));
const DEBUG = debugArg ? debugArg.slice("--debug=".length) : null;

// --- Geometry (cutout pixels of the 1024 x 1536 frame) ----------------------
const W = FAR_FROM_CUTOUT.width;
const H = FAR_FROM_CUTOUT.height;
const N = W * H;
const MID = W; // mirror axis x' = MID - x (the figure stands centred on 512)
const mirror = (points) => points.map(([x, y]) => [MID - x, y]);
const circle = (cx, cy, r, n = 28) =>
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

// --- Meta Unitas' geometry (cutout px) ---------------------------------------
// The face's lights: the orange visor's V under the crest.
const FACE_GLOW = [
  [468, 204],
  [490, 214],
  [512, 230],
  [534, 214],
  [556, 204],
  [562, 222],
  [540, 240],
  [512, 272],
  [484, 240],
  [462, 222],
];
// The helix (the reactor: the nanites' source and the light's origin), the
// visor, the buckle, and the joints the scan lights.
const MARKS = {
  core: [512, 450],
  visor: [512, 236],
  belt: [512, 672],
  joints: [
    [512, 450],
    [341, 400],
    [683, 400],
    [262, 650],
    [762, 650],
    [380, 1200],
    [644, 1200],
  ],
};
// The helix's outline: it completes like the compound eyes (pixel squares).
const REACTOR_GLOW = circle(512, 450, 74, 20);
// Meta Unitas' regions in this build's groups (the engine's beats: legs,
// arms, chest and shoulders, waist, bits, head; tail and bits are ornaments).
const GROUP = (id, group) => {
  if (group === "bits" || group === "halo") return "bits";
  if (group === "tail") return "tail";
  if (id === "helmet") return "helm";
  if (id === "chest") return "chest";
  if (id.startsWith("pauldron")) return "shoulders";
  if (id.startsWith("arm") || id.startsWith("hand")) return "arms";
  if (id === "waist") return "waist";
  return "legs";
};
const DIRS = { helm: "up", chest: "up", shoulders: "up", arms: "down", waist: "down", legs: "up", bits: "up", tail: "down" };
const centre = (poly) => [
  poly.reduce((sum, [x]) => sum + x, 0) / poly.length,
  poly.reduce((sum, [, y]) => sum + y, 0) / poly.length,
];
const REGIONS = [
  ...META_UNITAS_REGIONS.middle.map((region) => ({
    id: region.id,
    group: GROUP(region.id, region.group),
    poly: region.poly,
    seat: centre(region.poly),
  })),
  { id: "belt", group: "waist", poly: META_UNITAS_BELTS.middle, seat: [512, 672] },
];
const SPLITS = {
  ...Object.fromEntries(
    META_UNITAS_REGIONS.middle.map((region) => {
      const group = GROUP(region.id, region.group);
      return [
        region.id,
        region.plates.map((plate) => ({ id: plate.id, clip: plate.clip, dir: DIRS[group], group })),
      ];
    }),
  ),
  belt: [{ id: "belt", clip: ALL, dir: "up", group: "waist" }],
};
/** The driver: on the body, finished, from the start. */
const DRIVER = ["belt"];
const BELT_OVERLAP = 5;
const ORNAMENT_GROUPS = new Set(["tail", "ribbon", "bits"]);

// --- SAM (owner, 2026-10-23: 「SAMを用いて、切り抜きが甘い部分などをブラッシュ
// アップする事で装着を改善して」) ------------------------------------------------
// The polygons above are rough traces; they are now SAM's PROMPTS. With
// --sam-prompts this build writes them to SAM_DIR/prompts.json and stops;
// scripts/sam/make_masks.py segments ミドル from them and writes the plates'
// masks there (with manifest.json: the exact boxes and points). Without the
// flag the build reads those PNG masks, so it stays reproducible without
// SAM; with no masks it cuts by the polygons. The driver keeps its traced
// outline (BELT_OUTLINE): SAM only partitions the rest.
const SAM_VERSION = "20261023";
const SAM_DIR = join(DESIGN, "sam-masks/middle");
// SAM's masks, when they are there (--polygons cuts by the polygons instead).
const samManifest =
  !process.argv.includes("--polygons") && existsSync(join(SAM_DIR, "manifest.json"))
    ? JSON.parse(readFileSync(join(SAM_DIR, "manifest.json"), "utf8"))
    : null;
/** One of SAM's 8-bit masks (the cutout's frame) as its bytes. */
async function samShare(name) {
  const { data, info } = await sharp(join(SAM_DIR, name))
    .extractChannel(0)
    .raw()
    .toBuffer({ resolveWithObject: true });
  if (info.width !== W || info.height !== H)
    throw new Error(`${name}: ${info.width} x ${info.height}, not the cutout's frame`);
  // A share within a level or two of whole (or of none) is whole (none): the
  // 8-bit rounding would otherwise leave a faint grain in every plate's alpha.
  for (let i = 0; i < data.length; i += 1) data[i] = data[i] >= 252 ? 255 : data[i] <= 3 ? 0 : data[i];
  return data;
}
console.log(samManifest ? `cut by SAM's masks (${SAM_DIR})` : "cut by the polygons");

// --- The source ----------------------------------------------------------------
const source = await sharp(join(DESIGN, "cutouts/middle.webp"))
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });
if (source.info.width !== W || source.info.height !== H)
  throw new Error(`expected the ${W} x ${H} cutout, got ${source.info.width} x ${source.info.height}`);
const rgb = Buffer.alloc(N * 3);
const alpha = new Float32Array(N);
for (let i = 0; i < N; i += 1) {
  const a = source.data[i * 4 + 3] / 255;
  alpha[i] = a;
  // The art's colours only where it paints: a transparent pixel's bytes are
  // nothing (never a colour a classifier could read).
  const k = a > 0.08 ? 1 : 0;
  rgb[i * 3] = source.data[i * 4] * k;
  rgb[i * 3 + 1] = source.data[i * 4 + 1] * k;
  rgb[i * 3 + 2] = source.data[i * 4 + 2] * k;
}

const svgPath = (points) => `M${points.map(([x, y]) => `${x} ${y}`).join("L")}Z`;
async function rasterise(polys, grow = 0, blur = 0, union = false) {
  const stroke = grow ? ` stroke="#fff" stroke-width="${grow * 2}" stroke-linejoin="round"` : "";
  // One path (the pieces' own polygons) or, for a union of shapes that overlap
  // and wind either way, one path each: in a single path opposite windings
  // cancel where they overlap and leave a hole.
  const shapes = union
    ? polys.map((poly) => `<path d="${svgPath(poly)}" fill="#fff"${stroke}/>`).join("")
    : `<path d="${polys.map(svgPath).join("")}" fill="#fff"${stroke}/>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="#000"/>${shapes}</svg>`;
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
  const out = new Float32Array(width * height);
  const step = data.length / out.length;
  for (let i = 0; i < out.length; i += 1) out[i] = data[i * step] / 255;
  return out;
}

// --- The gold trims (the Rexonance classifier, on this art's colours) ----------
const GOLD_CELL = 4;
const boxFraction = (mask, radius) => {
  const stride = W + 1;
  const sums = new Float64Array(stride * (H + 1));
  for (let y = 0; y < H; y += 1) {
    let row = 0;
    for (let x = 0; x < W; x += 1) {
      row += mask[y * W + x];
      sums[(y + 1) * stride + x + 1] = sums[y * stride + x + 1] + row;
    }
  }
  const out = new Float32Array(N);
  for (let y = 0; y < H; y += 1) {
    const y0 = Math.max(0, y - radius);
    const y1 = Math.min(H, y + radius + 1);
    for (let x = 0; x < W; x += 1) {
      const x0 = Math.max(0, x - radius);
      const x1 = Math.min(W, x + radius + 1);
      out[y * W + x] =
        (sums[y1 * stride + x1] -
          sums[y0 * stride + x1] -
          sums[y1 * stride + x0] +
          sums[y0 * stride + x0]) /
        ((x1 - x0) * (y1 - y0));
    }
  }
  return out;
};
async function goldLayersOf(colours) {
  const hue = new Float32Array(N);
  const sat = new Float32Array(N);
  const val = new Float32Array(N);
  for (let i = 0; i < N; i += 1) {
    const r = colours[i * 3] / 255;
    const g = colours[i * 3 + 1] / 255;
    const b = colours[i * 3 + 2] / 255;
    const max = Math.max(r, g, b);
    const d = max - Math.min(r, g, b);
    let h = 0;
    if (d > 1e-6) {
      h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
      h = h * 60 + (h < 0 ? 360 : 0);
    }
    hue[i] = h;
    sat[i] = max ? d / max : 0;
    val[i] = max;
  }
  const gold = new Float32Array(N);
  for (let i = 0; i < N; i += 1) {
    if (alpha[i] < 0.5) continue;
    const warm = hue[i] >= 17 && hue[i] <= 54;
    if (warm && ((sat[i] >= 0.3 && val[i] >= 0.16) || (sat[i] >= 0.42 && val[i] >= 0.07)))
      gold[i] = 1;
    else if (hue[i] >= 9 && hue[i] < 17 && sat[i] >= 0.5 && val[i] >= 0.07 && val[i] < 0.45)
      gold[i] = 1;
  }
  const near = boxFraction(gold, 3);
  for (let i = 0; i < N; i += 1) {
    if (gold[i] || alpha[i] < 0.5) continue;
    const [r, g, b] = [colours[i * 3], colours[i * 3 + 1], colours[i * 3 + 2]];
    const notPink = !(hue[i] > 280 || hue[i] < 12) || sat[i] < 0.16;
    if (val[i] > 0.42 && sat[i] < 0.36 && b <= r * 1.02 && b <= g * 1.08 && notPink && near[i] > 0.3)
      gold[i] = 1;
    else if (hue[i] >= 12 && hue[i] <= 60 && sat[i] >= 0.16 && val[i] >= 0.12 && near[i] > 0.25)
      gold[i] = 1;
  }
  {
    const depth = new Uint8Array(N).fill(255);
    const queue = new Int32Array(N);
    let head = 0;
    let tail = 0;
    for (let i = 0; i < N; i += 1) {
      if (!gold[i]) continue;
      depth[i] = 0;
      queue[tail++] = i;
    }
    const pale = (i) =>
      alpha[i] >= 0.5 &&
      val[i] > 0.62 &&
      sat[i] < 0.3 &&
      colours[i * 3 + 2] <= colours[i * 3] + 12 &&
      colours[i * 3 + 2] <= colours[i * 3 + 1] + 14;
    while (head < tail) {
      const i = queue[head++];
      if (depth[i] >= 7) continue;
      const x = i % W;
      for (const j of [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, i - W, i + W]) {
        if (j < 0 || j >= N || depth[j] !== 255 || !pale(j)) continue;
        depth[j] = depth[i] + 1;
        gold[j] = 1;
        queue[tail++] = j;
      }
    }
  }
  for (let pass = 0; pass < 4; pass += 1) {
    const around = boxFraction(gold, 2);
    const wide = boxFraction(gold, 4);
    for (let i = 0; i < N; i += 1) {
      if (gold[i] || alpha[i] < 0.5) continue;
      const cool = sat[i] > 0.28 && hue[i] > 170 && hue[i] < 300;
      const pink = sat[i] > 0.28 && (hue[i] >= 300 || hue[i] < 12);
      const mauve = (hue[i] >= 300 || hue[i] < 17) && sat[i] < 0.5 && val[i] < 0.45;
      if (!cool && !pink && (around[i] > 0.55 || (val[i] < 0.3 && wide[i] > 0.6))) gold[i] = 1;
      else if (pink && sat[i] < 0.55 && val[i] > 0.5 && around[i] > 0.7) gold[i] = 1;
      else if (mauve && wide[i] > 0.34) gold[i] = 1;
    }
  }
  const specks = boxFraction(gold, 2);
  for (let i = 0; i < N; i += 1) if (gold[i] && specks[i] < 0.2) gold[i] = 0;
  const goldSoft = await (async () => {
    const nearTrim = boxFraction(gold, 4);
    const grown = boxFraction(gold, 1);
    const field = new Float32Array(N);
    for (let i = 0; i < N; i += 1) {
      const r = colours[i * 3];
      const g = colours[i * 3 + 1];
      const b = colours[i * 3 + 2];
      const warm = Math.max(r, g, b) > 50 && r > b * 1.2 && g > b * 1.02;
      field[i] = grown[i] > 0 || (nearTrim[i] > 0 && warm) ? 1 : 0;
    }
    const soft = await blurField(field, 0.8);
    return Float32Array.from(soft, (v) => Math.min(1, v * 1.6));
  })();
  const goldLight = await blurField(
    Float32Array.from(
      { length: N },
      (_, i) =>
        (0.2126 * colours[i * 3] + 0.7152 * colours[i * 3 + 1] + 0.0722 * colours[i * 3 + 2]) / 255,
    ),
    2,
  );
  const rawGold = Buffer.alloc(N * 3);
  for (let y = 1; y < H - 1; y += 1) {
    for (let x = 1; x < W - 1; x += 1) {
      const i = y * W + x;
      const m = goldSoft[i];
      if (!m) continue;
      const k = Math.min(1, goldLight[i] ** 0.9);
      const wall = Math.min(
        1,
        Math.hypot(goldSoft[i + 1] - goldSoft[i - 1], goldSoft[i + W] - goldSoft[i - W]) * 0.9,
      );
      const local =
        (0.2126 * colours[i * 3] + 0.7152 * colours[i * 3 + 1] + 0.0722 * colours[i * 3 + 2]) / 255;
      const detail = Math.max(-5, Math.min(6, (local - goldLight[i]) * 20));
      const base = [31 + 38 * k + detail, 36 + 41 * k + detail, 43 + 46 * k + detail];
      const steel = [112, 126, 144];
      for (let c = 0; c < 3; c += 1)
        rawGold[i * 3 + c] = Math.round(base[c] + (steel[c] - base[c]) * wall);
    }
  }
  return { goldTrim: gold, goldSoft, rawGold };
}
const { goldTrim, goldSoft, rawGold } = await goldLayersOf(rgb);

// --- Delivery (the whole frame at META_UNITAS_RX_SIZE) ----------------------------
const FIG_W = META_UNITAS_RX_SIZE.width;
const FIG_H = META_UNITAS_RX_SIZE.height;
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
function deliveryBox({ x0, y0, x1, y1 }, margin) {
  const left = Math.max(0, Math.floor((x0 - margin) * SCALE));
  const top = Math.max(0, Math.floor((y0 - margin) * SCALE));
  const right = Math.min(FIG_W, Math.ceil((x1 + margin + 1) * SCALE));
  const bottom = Math.min(FIG_H, Math.ceil((y1 + margin + 1) * SCALE));
  return { left, top, width: right - left, height: bottom - top };
}
async function toDelivery(buffer) {
  return sharp(buffer, { raw: { width: W, height: H, channels: 4 } })
    .resize(FIG_W, FIG_H, { kernel: "lanczos3", fit: "fill" })
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

// --- The unlit face ----------------------------------------------------------------
const glow = await rasterise([FACE_GLOW], 1.5, 1.2);
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

// --- Partition -----------------------------------------------------------------------
const remaining = new Float32Array(N).fill(1);
const regionFields = new Array(REGIONS.length);
const claimed = new Float32Array(N);
// The driver claims first, by its own outline (BELT_OUTLINE, feathered half a
// pixel), so no polygon of another piece cuts through the belt and no stray of
// the armour around it rides on the belt; what the outline leaves goes to the
// plates it belongs to, below.
const BELT_INDEX = REGIONS.findIndex((region) => region.id === "belt");
const beltMask = await rasterise(BELT_OUTLINE, 0, 0.5, true);
// The driver's colours at its soft edge are the belt's own: a half-covered
// pixel of the cutout carries the dark glow or the neighbouring armour it was
// cut from, which reads as a fringe once the belt stands alone. Where the
// belt is not fully opaque its colour is the opaque belt's nearest colour
// (a normalised blur of the opaque pixels), so the edge fades in alpha only.
const beltColours = await (async () => {
  const solid = Float32Array.from({ length: N }, (_, i) => (beltMask[i] > 0.97 && alpha[i] > 0.97 ? 1 : 0));
  const weight = await blurField(solid, 1.4);
  const channels = [];
  for (let c = 0; c < 3; c += 1)
    channels.push(await blurField(Float32Array.from({ length: N }, (_, i) => (solid[i] * rgb[i * 3 + c]) / 255), 1.4));
  const out = Buffer.from(rgb);
  for (let i = 0; i < N; i += 1) {
    if (solid[i] || !beltMask[i] || weight[i] < 0.03) continue;
    for (let c = 0; c < 3; c += 1) out[i * 3 + c] = Math.round(Math.min(255, (channels[c][i] / weight[i]) * 255));
  }
  return out;
})();
// SAM (2026-10-23): the driver still claims first by its outline; every other
// plate takes its share (scripts/sam/make_masks.py, renormalised) of what the
// belt leaves. Without the masks the polygons claim, front first, below.
const samPlateFields = new Map();
if (samManifest) {
  const sum = new Float32Array(N);
  const shares = [];
  for (const [index, region] of REGIONS.entries()) {
    if (index === BELT_INDEX) continue;
    for (const split of SPLITS[region.id]) {
      // A plate SAM's partition left empty (behind a front piece) has no mask.
      if (!samManifest.plates[split.id]) continue;
      const share = await samShare(`plates/${split.id}.png`);
      for (let i = 0; i < N; i += 1) sum[i] += share[i] / 255;
      shares.push({ id: split.id, share });
    }
  }
  const belt = new Float32Array(N);
  for (let i = 0; i < N; i += 1) belt[i] = beltMask[i] * alpha[i];
  regionFields[BELT_INDEX] = belt;
  for (let i = 0; i < N; i += 1) claimed[i] = belt[i];
  for (const { id, share } of shares) {
    const field = new Float32Array(N);
    for (let i = 0; i < N; i += 1) {
      if (!share[i]) continue;
      field[i] = alpha[i] * (1 - beltMask[i]) * (share[i] / 255 / Math.max(1, sum[i]));
      claimed[i] += field[i];
    }
    samPlateFields.set(id, field);
  }
  let unshared = 0;
  for (let i = 0; i < N; i += 1) if (alpha[i] > 0.03 && alpha[i] - claimed[i] > 0.03) unshared += 1;
  console.log(`partition: SAM's masks; pixels no mask shares ${unshared}`);
}
for (const index of samManifest
  ? []
  : [BELT_INDEX, ...REGIONS.keys()].filter((v, k, a) => a.indexOf(v) === k)) {
  const region = REGIONS[index];
  const poly = index === BELT_INDEX ? beltMask : await rasterise([region.poly]);
  const field = new Float32Array(N);
  for (let i = 0; i < N; i += 1) {
    const take = poly[i] * remaining[i];
    remaining[i] -= take;
    if (!take) continue;
    field[i] = take * alpha[i];
    claimed[i] += field[i];
  }
  regionFields[index] = field;
}
// What no polygon reaches: the nearest region's, by its polygon's reach
// (ornaments reach farther: a wing's strand beside the arm), then by seat.
for (const [index, region] of samManifest ? [] : REGIONS.entries()) {
  if (index === BELT_INDEX) continue; // the driver takes only its outline
  const ornament = ORNAMENT_GROUPS.has(region.group);
  const reach = await blurField(await rasterise([region.poly]), ornament ? 24 : 14);
  const field = regionFields[index];
  for (let i = 0; i < N; i += 1) {
    if (!remaining[i] || alpha[i] < 0.03 || reach[i] < (ornament ? 0.005 : 0.02)) continue;
    const take = remaining[i] * alpha[i];
    remaining[i] = 0;
    field[i] += take;
    claimed[i] += take;
  }
}
if (!samManifest) {
  let strays = 0;
  for (let i = 0; i < N; i += 1) {
    if (!remaining[i] || alpha[i] < 0.03) continue;
    const x = i % W;
    const y = (i - x) / W;
    let best = 0;
    let nearest = Number.POSITIVE_INFINITY;
    REGIONS.forEach((region, k) => {
      if (k === BELT_INDEX) return;
      const d = (region.seat[0] - x) ** 2 + (region.seat[1] - y) ** 2;
      if (d < nearest) {
        nearest = d;
        best = k;
      }
    });
    const take = remaining[i] * alpha[i];
    remaining[i] = 0;
    regionFields[best][i] += take;
    claimed[i] += take;
    strays += 1;
  }
  console.log(`partition: pixels beyond every polygon's reach ${strays}`);
}

const plates = [];
for (const [index, region] of REGIONS.entries()) {
  const splits = SPLITS[region.id];
  if (!splits) throw new Error(`${region.id}: no split`);
  if (samManifest && index !== BELT_INDEX) {
    for (const split of splits)
      plates.push({ ...split, region: region.id, field: samPlateFields.get(split.id) ?? new Float32Array(N) });
    continue;
  }
  const left = Float32Array.from(regionFields[index]);
  let lastRight = 0;
  for (const split of splits) {
    const clip = split.clip ? await rasterise([split.clip]) : null;
    const plate = new Float32Array(N);
    for (let i = 0; i < N; i += 1) {
      if (!left[i]) continue;
      const take = clip ? left[i] * clip[i] : left[i];
      plate[i] = take;
      left[i] -= take;
    }
    if (region.id === "belt") {
      // The driver's plates overlap across their cuts: a cut that splits an
      // opaque pixel between two cells leaves a hairline of the undersuit
      // between them when the cells are composited (and the delivery's
      // resampling widens it). Each plate carries the belt's opaque pixels
      // OVERLAP px past its cut on both sides; the soft silhouette stays
      // with one plate, so it is never doubled.
      const right = split.clip ? Math.max(...split.clip.map(([x]) => x)) : W;
      const from = lastRight - BELT_OVERLAP;
      const to = right + BELT_OVERLAP;
      lastRight = right;
      const whole = regionFields[index];
      for (let i = 0; i < N; i += 1) {
        const x = i % W;
        if (x >= from && x < to && !plate[i] && whole[i] > 0.985) plate[i] = whole[i];
      }
    }
    plates.push({ ...split, region: region.id, field: plate });
  }
}
// The scarf's streamers land in pairs, both sides together, the upper pair
// before the lower (owner, 2026-10-23): the engine lands a beat's plates in
// list order, so their slots are re-dealt in that order (the partition is
// already made; only the landing order changes).
{
  const streamer = ["ribbon-upper-l", "ribbon-upper-r", "ribbon-lower-l", "ribbon-lower-r"];
  const slots = plates.flatMap((plate, index) => (streamer.includes(plate.id) ? [index] : []));
  const dealt = streamer.map((id) => plates.find((plate) => plate.id === id)).filter(Boolean);
  if (dealt.length === slots.length) slots.forEach((slot, k) => (plates[slot] = dealt[k]));
}

// --- Outputs ---------------------------------------------------------------------------
mkdirSync(OUT_DIR, { recursive: true });
for (const file of readdirSync(OUT_DIR)) rmSync(join(OUT_DIR, file));
const files = [];
async function writeWebp(name, raw, width, height, options = {}) {
  const path = join(OUT_DIR, name);
  const result = await sharp(raw, { raw: { width, height, channels: 4 } })
    .webp({ quality: 76, alphaQuality: 70, effort: 6, smartSubsample: true, ...options })
    .toFile(path);
  files.push({ name, bytes: result.size });
  return `${PUBLIC_PATH}/${name}`;
}

// The finished figure (the still tiers and the fallback), and a phone still.
const figureRaw = await toDelivery(rgba(alpha));
const FIGURE = await writeWebp("figure.webp", figureRaw, FIG_W, FIG_H, { quality: 70 });

// The forms (ハイ, エックスハイ, マックス): the same frame, pixel for pixel.
const FORMS = {};
for (const form of ["ultra"]) {
  const raw = await sharp(join(DESIGN, `cutouts/${form}.webp`))
    .ensureAlpha()
    .resize(FIG_W, FIG_H, { kernel: "lanczos3", fit: "fill" })
    .raw()
    .toBuffer();
  FORMS[form] = await writeWebp(`${form}.webp`, raw, FIG_W, FIG_H, { quality: 70 });
}

// The undersuit: Rexonance's lit relief (the same wearer), composited into
// this frame so its soles and reactor socket meet ミドル's soles and chest core.
const UNDERSUIT_SOURCE = join(ROOT, "public", REXONANCE_SUIT_UNDERSUIT.slice(1));
const UNDERSUIT_PLACE = await (async () => {
  const under = await sharp(UNDERSUIT_SOURCE).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
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
  const width = Math.round(uw * scale);
  const height = Math.round(uh * scale);
  const left = Math.round(MARKS.core[0] * SCALE - ucx * scale);
  const top = Math.round(figureSole * SCALE - sole * scale);
  return { width, height, left, top, scale, source: under };
})();
const undersuitRaw = Buffer.alloc(FIG_W * FIG_H * 4);
{
  const { width, height, left, top } = UNDERSUIT_PLACE;
  const scaled = await sharp(UNDERSUIT_SOURCE)
    .ensureAlpha()
    .resize(width, height, { kernel: "lanczos3", fit: "fill" })
    .raw()
    .toBuffer();
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
const UNDERSUIT = await writeWebp("undersuit.webp", undersuitRaw, FIG_W, FIG_H, {
  quality: 84,
  alphaQuality: 100,
});

// The seat on the plate itself (2026-10-23): a cut that follows the art can
// leave the middle of the box's edge in the air (the plume rising from behind
// the shoulder): a seat more than SEAT_SNAP px off the plate moves to its
// nearest pixel, so the plate still grows from that edge (the scroll plan
// lands a plate's tiles from its seat outward).
const SEAT_SNAP = 4;
function seatOnArt(seat, art, box) {
  const [sx, sy] = seat;
  let best = null;
  let nearest = Infinity;
  for (let y = 0; y < box.height; y += 1)
    for (let x = 0; x < box.width; x += 1) {
      if (art[(y * box.width + x) * 4 + 3] < 128) continue;
      const d = Math.hypot(box.left + x + 0.5 - sx, box.top + y + 0.5 - sy);
      if (d < nearest) {
        nearest = d;
        best = [box.left + x + 0.5, box.top + y + 0.5];
      }
    }
  return best && nearest > SEAT_SNAP ? best : seat;
}
// The plates: one atlas of their art; each plate's gold, unformed, at the
// same place in gold.webp; its gold cells; its micro-tiles.
const MARGIN = 2;
const TILE = 9;
let tileCount = 0;
let goldCount = 0;
const pieces = [];
const cells = [];
const goldCells = {};
for (const plate of plates) {
  const found = bounds(plate.field);
  // A clip behind a front piece may claim nothing (the plume's root under
  // the shoulder pad): no plate, no cell.
  if (!found) {
    console.log(`${plate.id}: the clip claims nothing (behind a front piece); dropped`);
    continue;
  }
  const box = deliveryBox(found, Math.ceil(MARGIN / SCALE) + 1);
  const colours = plate.region === "helmet" ? unlit : plate.region === "belt" ? beltColours : rgb;
  const art = extractRaw(await toDelivery(rgba(plate.field, colours)), box);
  // The driver is the belt and nothing else: the resampling's faintest ripple
  // past its outline (under 6%) is cleared, so the lossy alpha's quantisation
  // never lifts it into a visible pixel (2026-10-23: a re-packed atlas did).
  if (plate.region === "belt")
    for (let i = 3; i < art.length; i += 4) if (art[i] < 16) art[i] = 0;
  const { width: w, height: h } = box;
  const gold = extractRaw(
    await toDelivery(rgba(Float32Array.from(plate.field, (v, i) => v * goldSoft[i]), rawGold)),
    box,
  );
  {
    const cols = Math.ceil(w / GOLD_CELL);
    const rows = Math.ceil(h / GOLD_CELL);
    const bits = new Uint8Array(Math.ceil((cols * rows) / 8));
    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        let sum = 0;
        for (let y = row * GOLD_CELL; y < Math.min(h, (row + 1) * GOLD_CELL); y += 1)
          for (let x = col * GOLD_CELL; x < Math.min(w, (col + 1) * GOLD_CELL); x += 1)
            sum += gold[(y * w + x) * 4 + 3] / 255;
        if (sum < 2) continue;
        const bit = row * cols + col;
        bits[bit >> 3] |= 1 << (bit & 7);
        goldCount += 1;
      }
    }
    if (bits.some(Boolean)) goldCells[plate.id] = Buffer.from(bits).toString("base64");
  }
  const seat = plate.root
    ? [plate.root[0] * SCALE, plate.root[1] * SCALE]
    : seatOnArt(
        {
          up: [box.left + w / 2, box.top + h],
          down: [box.left + w / 2, box.top],
          left: [box.left + w, box.top + h / 2],
          right: [box.left, box.top + h / 2],
        }[plate.dir],
        art,
        box,
      );
  const cols = Math.ceil(w / TILE);
  const rows = Math.ceil(h / TILE);
  const bits = new Uint8Array(Math.ceil((cols * rows) / 8));
  for (let row = 0; row < rows; row += 1) {
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
  }
  cells.push({ w, h, art, gold });
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
// Shelf-pack the cells, tallest first, into a column ATLAS_W wide.
const ATLAS_W = 1024;
const GUTTER = 2;
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
const ATLAS_H = shelfY + shelfH;
const atlasRaw = Buffer.alloc(ATLAS_W * ATLAS_H * 4);
const goldAtlasRaw = Buffer.alloc(ATLAS_W * ATLAS_H * 4);
for (const [i, { w, h, art, gold }] of cells.entries()) {
  const { ax, ay } = pieces[i];
  for (let y = 0; y < h; y += 1) {
    art.copy(atlasRaw, ((ay + y) * ATLAS_W + ax) * 4, y * w * 4, (y + 1) * w * 4);
    gold.copy(goldAtlasRaw, ((ay + y) * ATLAS_W + ax) * 4, y * w * 4, (y + 1) * w * 4);
  }
}
const ATLAS = await writeWebp("plates.webp", atlasRaw, ATLAS_W, ATLAS_H, { quality: 78 });
const GOLD_ATLAS = await writeWebp("gold.webp", goldAtlasRaw, ATLAS_W, ATLAS_H, {
  quality: 60,
  alphaQuality: 70,
});

// The driver stand-in: the belt plates whole, their lights separated like
// the live driver's (the loading stand-in under the canvas).
{
  const driverRaw = Buffer.alloc(FIG_W * FIG_H * 4);
  for (const piece of pieces.filter((p) => DRIVER.includes(p.id)).reverse()) {
    const cell = cells[pieces.indexOf(piece)];
    for (let y = 0; y < piece.h; y += 1)
      for (let x = 0; x < piece.w; x += 1) {
        const s = (y * piece.w + x) * 4;
        const a = cell.art[s + 3];
        if (!a) continue;
        // Source-over, as the engine lays the same cells on its driver sheet.
        const d = ((piece.y + y) * FIG_W + piece.x + x) * 4;
        const below = driverRaw[d + 3] / 255;
        const over = a / 255;
        const total = over + below * (1 - over);
        for (let c = 0; c < 3; c += 1)
          driverRaw[d + c] = Math.round(
            (cell.art[s + c] * over + driverRaw[d + c] * below * (1 - over)) / total,
          );
        driverRaw[d + 3] = Math.round(total * 255);
      }
  }
  separateDriverPixels(driverRaw);
  await writeWebp("driver-standin.webp", driverRaw, FIG_W, FIG_H, { lossless: true });
}
const DRIVER_STANDIN = `${PUBLIC_PATH}/driver-standin.webp`;

// --- The nanite engine's derivations (as scripts/build-rexonance-nanites.mjs) ----
const CASES = [
  null,
  [[3, 2]],
  [[2, 1]],
  [[3, 1]],
  [[1, 0]],
  [
    [3, 0],
    [1, 2],
  ],
  [[2, 0]],
  [[3, 0]],
  [[0, 3]],
  [[0, 2]],
  [
    [0, 1],
    [2, 3],
  ],
  [[0, 1]],
  [[1, 3]],
  [[1, 2]],
  [[2, 3]],
  null,
];
function traceContours(field, w, h, iso) {
  const stride = w + 2;
  const value = (i, j) => (i < 0 || j < 0 || i >= w || j >= h ? 0 : field[j * w + i]);
  const next = new Map();
  const at = new Map();
  const hKey = (i, j) => ((j + 1) * stride + (i + 1)) * 2;
  const vKey = (i, j) => ((j + 1) * stride + (i + 1)) * 2 + 1;
  const cut = (a, b) => (iso - a) / (b - a);
  for (let j = -1; j < h; j += 1) {
    for (let i = -1; i < w; i += 1) {
      const a = value(i, j);
      const b = value(i + 1, j);
      const c = value(i + 1, j + 1);
      const d = value(i, j + 1);
      const index = (a > iso ? 8 : 0) | (b > iso ? 4 : 0) | (c > iso ? 2 : 0) | (d > iso ? 1 : 0);
      const segments = CASES[index];
      if (!segments) continue;
      const side = (s) => {
        let key;
        let point;
        if (s === 0) [key, point] = [hKey(i, j), () => [i + 0.5 + cut(a, b), j + 0.5]];
        else if (s === 1) [key, point] = [vKey(i + 1, j), () => [i + 1.5, j + 0.5 + cut(b, c)]];
        else if (s === 2) [key, point] = [hKey(i, j + 1), () => [i + 0.5 + cut(d, c), j + 1.5]];
        else [key, point] = [vKey(i, j), () => [i + 0.5, j + 0.5 + cut(a, d)]];
        if (!at.has(key)) at.set(key, point());
        return key;
      };
      for (const [from, to] of segments) next.set(side(from), side(to));
    }
  }
  const seen = new Set();
  const loops = [];
  for (const start of next.keys()) {
    if (seen.has(start)) continue;
    const loop = [];
    let key = start;
    while (key !== undefined && !seen.has(key)) {
      seen.add(key);
      loop.push(at.get(key));
      key = next.get(key);
    }
    if (loop.length >= 3) loops.push(loop);
  }
  return loops;
}
const shoelace = (loop) => {
  let sum = 0;
  for (let i = 0; i < loop.length; i += 1) {
    const [x0, y0] = loop[i];
    const [x1, y1] = loop[(i + 1) % loop.length];
    sum += x0 * y1 - x1 * y0;
  }
  return sum / 2;
};
const segmentDistance = ([px, py], [ax, ay], [bx, by]) => {
  const dx = bx - ax;
  const dy = by - ay;
  const length = dx * dx + dy * dy;
  const t = length ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / length)) : 0;
  return Math.hypot(px - ax - t * dx, py - ay - t * dy);
};
function simplifyRun(points, epsilon) {
  const keep = new Uint8Array(points.length);
  keep[0] = keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    let best = -1;
    let at = -1;
    for (let i = a + 1; i < b; i += 1) {
      const d = segmentDistance(points[i], points[a], points[b]);
      if (d > best) [best, at] = [d, i];
    }
    if (best > epsilon) {
      keep[at] = 1;
      stack.push([a, at], [at, b]);
    }
  }
  return points.filter((_, i) => keep[i]);
}
function simplifyLoop(loop, epsilon) {
  if (loop.length <= 3) return loop.slice();
  let far = 1;
  for (let i = 1; i < loop.length; i += 1)
    if (
      Math.hypot(loop[i][0] - loop[0][0], loop[i][1] - loop[0][1]) >
      Math.hypot(loop[far][0] - loop[0][0], loop[far][1] - loop[0][1])
    )
      far = i;
  const first = simplifyRun(loop.slice(0, far + 1), epsilon);
  const second = simplifyRun([...loop.slice(far), loop[0]], epsilon);
  return [...first, ...second.slice(1, -1)];
}
const rotateToNearest = (loop, [sx, sy]) => {
  let best = 0;
  let distance = Infinity;
  for (let i = 0; i < loop.length; i += 1) {
    const d = Math.hypot(loop[i][0] - sx, loop[i][1] - sy);
    if (d < distance) [distance, best] = [d, i];
  }
  return [...loop.slice(best), ...loop.slice(0, best)];
};
const SEAM_ALPHA = 96;
const SEAM_EPSILON = 0.9;
const SEAM_POINTS = 128;
const SEAM_ISLAND = 40;
const NON_DRIVER = pieces.filter((piece) => !DRIVER.includes(piece.id));
function buildSeams() {
  const seams = {};
  for (const piece of NON_DRIVER) {
    const { ax, ay, w, h, x, y, seat } = piece;
    const field = new Uint8Array(w * h);
    for (let j = 0; j < h; j += 1)
      for (let i = 0; i < w; i += 1) field[j * w + i] = atlasRaw[((ay + j) * ATLAS_W + ax + i) * 4 + 3];
    const outlines = traceContours(field, w, h, SEAM_ALPHA)
      .map((loop) => loop.map(([px, py]) => [px + x, py + y]))
      .map((loop) => ({ loop, area: shoelace(loop) }))
      .filter(({ area }) => area > 0)
      .sort((a, b) => b.area - a.area);
    if (!outlines.length) throw new Error(`${piece.id}: no outline in its atlas cell`);
    const chosen = [
      outlines[0],
      ...outlines.slice(1).filter(({ area }) => area > SEAM_ISLAND).slice(0, 2),
    ];
    const anchored = chosen.map(({ loop }) => rotateToNearest(loop, seat));
    let epsilon = SEAM_EPSILON;
    let loops;
    for (;;) {
      loops = anchored
        .map((loop) => simplifyLoop(loop, epsilon))
        .filter((loop, i) => i === 0 || (loop.length >= 3 && shoelace(loop) > SEAM_ISLAND));
      const total = loops.reduce((sum, loop) => sum + loop.length, 0);
      if (total <= SEAM_POINTS) break;
      epsilon *= 1.1;
    }
    const words = [loops.length];
    for (const loop of loops) {
      words.push(loop.length);
      for (const [px, py] of loop) words.push(Math.round(px * 4), Math.round(py * 4));
    }
    const bytes = Buffer.alloc(words.length * 2);
    words.forEach((word, i) => bytes.writeInt16LE(word, i * 2));
    seams[piece.id] = bytes.toString("base64");
  }
  return seams;
}
function buildGoldBoxes() {
  const boxes = {};
  for (const piece of NON_DRIVER) {
    const encoded = goldCells[piece.id];
    if (!encoded) continue;
    const bits = Buffer.from(encoded, "base64");
    const cols = Math.ceil(piece.w / GOLD_CELL);
    const rows = Math.ceil(piece.h / GOLD_CELL);
    let [c0, r0, c1, r1] = [Infinity, Infinity, -1, -1];
    for (let row = 0; row < rows; row += 1)
      for (let col = 0; col < cols; col += 1) {
        const bit = row * cols + col;
        if (!(bits[bit >> 3] & (1 << (bit & 7)))) continue;
        c0 = Math.min(c0, col);
        r0 = Math.min(r0, row);
        c1 = Math.max(c1, col);
        r1 = Math.max(r1, row);
      }
    if (c1 < 0) continue;
    const left = c0 * GOLD_CELL;
    const top = r0 * GOLD_CELL;
    const right = Math.min(piece.w, (c1 + 1) * GOLD_CELL);
    const bottom = Math.min(piece.h, (r1 + 1) * GOLD_CELL);
    boxes[piece.id] = [piece.x + left, piece.y + top, right - left, bottom - top];
  }
  return boxes;
}
// The guideway conduit, script-made in atlas space: the gold's alpha (> 32,
// within the non-driver cells) gives each trim; its edge is the rail — lit
// gold where the edge faces the upper left, dark gold where it faces away —
// a second rail inside it, and the ice channel glowing within.
function buildGuide() {
  const inCell = new Uint8Array(ATLAS_W * ATLAS_H);
  for (const { ax, ay, w, h } of NON_DRIVER)
    for (let y = ay; y < ay + h; y += 1) inCell.fill(1, y * ATLAS_W + ax, y * ATLAS_W + ax + w);
  const solid = new Uint8Array(ATLAS_W * ATLAS_H);
  for (let i = 0; i < solid.length; i += 1) solid[i] = inCell[i] && goldAtlasRaw[i * 4 + 3] > 32 ? 1 : 0;
  const inside = (x, y) => x >= 0 && y >= 0 && x < ATLAS_W && y < ATLAS_H && solid[y * ATLAS_W + x];
  // Depth: how many pixels in from the edge (0..4).
  const depth = new Uint8Array(ATLAS_W * ATLAS_H);
  for (let y = 0; y < ATLAS_H; y += 1)
    for (let x = 0; x < ATLAS_W; x += 1) {
      if (!solid[y * ATLAS_W + x]) continue;
      let d = 4;
      for (let r = 1; r <= 4 && d === 4; r += 1)
        if (!inside(x - r, y) || !inside(x + r, y) || !inside(x, y - r) || !inside(x, y + r))
          d = r - 1;
      depth[y * ATLAS_W + x] = d;
    }
  const raw = Buffer.alloc(ATLAS_W * ATLAS_H * 4);
  for (let y = 0; y < ATLAS_H; y += 1)
    for (let x = 0; x < ATLAS_W; x += 1) {
      const i = y * ATLAS_W + x;
      if (!solid[i]) continue;
      const d = depth[i];
      const lit = !inside(x - 1, y) || !inside(x, y - 1) || !inside(x - 1, y - 1);
      // A hologram's weight, not a plate's: the rails thin and the channel
      // a translucent ice glass (the formed gold is the art's own).
      let colour;
      if (d === 0) colour = lit ? [255, 228, 158, 214] : [168, 118, 48, 196];
      else if (d === 1) colour = lit ? [236, 196, 112, 120] : [124, 86, 34, 110];
      else if (d === 2) colour = [150, 222, 255, 56];
      else if (d === 3) colour = [184, 238, 255, 78];
      else colour = [214, 247, 255, 96];
      raw.set(colour, i * 4);
    }
  return raw;
}
const seams = buildSeams();
const goldBoxes = buildGoldBoxes();
const GUIDE = await writeWebp("guide.webp", buildGuide(), ATLAS_W, ATLAS_H, {
  quality: 72,
  alphaQuality: 65,
});

// --- The modules -------------------------------------------------------------------------
const point = ([x, y]) => `[${fx(x)}, ${fy(y)}]`;
const total = files.reduce((sum, file) => sum + file.bytes, 0);
const byteList = files.map((file) => `${file.name} ${file.bytes}`).join(", ");
const ts = `// Generated by scripts/build-meta-unitas-rx-suit.mjs from
// design/meta-unitas-saga-${VERSION}/cutouts/middle.webp — do not edit by hand.
// Figure coordinates are delivery pixels of the ${FIG_W} x ${FIG_H} figure (the
// owner's whole 1024 x 1536 cutout frame: src/lib/far-from-stage.ts).
// ${files.length} files, ${total} bytes (${byteList}).

export const META_UNITAS_RX_SIZE = { width: ${FIG_W}, height: ${FIG_H} } as const;

/** The finished ミドル figure (the scene's art; the fallback). */
export const META_UNITAS_RX_FIGURE = "${FIGURE}";
/** Rexonance's bare bodysuit (the same wearer), in this frame. */
export const META_UNITAS_RX_UNDERSUIT = "${UNDERSUIT}";
/** The エクスサーガドライバー whole, its lights separated: the loading stand-in. */
export const META_UNITAS_RX_DRIVER_STANDIN = "${DRIVER_STANDIN}";
/** The forms after ミドル, in the same frame, pixel for pixel over it. */
export const META_UNITAS_RX_FORMS = {
  ultra: "${FORMS.ultra}",
} as const;

/** The face's lights' outline, for the final call's pixel squares. */
export const META_UNITAS_RX_FACE_GLOW: readonly (readonly [number, number])[] = [
  ${FACE_GLOW.map(point).join(", ")},
];
/** The reactor's outline: it completes like the compound eyes (owner),
 * pixel squares filling it, then scattering. */
export const META_UNITAS_RX_REACTOR_GLOW: readonly (readonly [number, number])[] = [
  ${REACTOR_GLOW.map(point).join(", ")},
];

export type MetaUnitasRxGroup =
  | "legs"
  | "waist"
  | "arms"
  | "chest"
  | "shoulders"
  | "tail"
  | "ribbon"
  | "bits"
  | "helm";
/** One plate of the armour: its box in the figure, its cell in the atlas,
 * the way it grows from its seam, and the seam. */
export type MetaUnitasRxPiece = {
  readonly id: string;
  readonly group: MetaUnitasRxGroup;
  readonly dir: "up" | "down" | "left" | "right";
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly ax: number;
  readonly ay: number;
  readonly seat: readonly [number, number];
  /** Its micro-tiles that carry art (META_UNITAS_RX_TILE px squares,
   * row-major over its box, LSB-first bitmask, base64). */
  readonly tiles: string;
};
/** The nanite micro-tile, in delivery px (${tileCount} tiles in all). */
export const META_UNITAS_RX_TILE = ${TILE};
/** The plates' atlas (art only). */
export const META_UNITAS_RX_ATLAS = ${JSON.stringify({ src: ATLAS, width: ATLAS_W, height: ATLAS_H })} as const;
/** The plates, front first; they tile the figure. */
export const META_UNITAS_RX_PIECES: readonly MetaUnitasRxPiece[] = [
${pieces.map((piece) => `  ${JSON.stringify(piece)},`).join("\n")}
];

/** The plates' gold, unformed: at each plate's atlas cell (ax, ay) the raw
 * gunmetal channel where its gold will form; its alpha is the trims' soft
 * mask. Its gold cells are in src/lib/far-from-suit-gold.ts. */
export const META_UNITAS_RX_GOLD_ATLAS = ${JSON.stringify({ src: GOLD_ATLAS, width: ATLAS_W, height: ATLAS_H })} as const;

/** The driver's plates: on the body from the start, never assembled. */
export const META_UNITAS_RX_DRIVER: readonly string[] = ${JSON.stringify(DRIVER)};
/** The groups formed over the armour (the crystal plume, the wings and the
 * hip blades, the ファーフロムビット). */
export const META_UNITAS_RX_ORNAMENTS: readonly string[] = ${JSON.stringify([...ORNAMENT_GROUPS])};

export const META_UNITAS_RX_MARKS = {
  core: ${point(MARKS.core)},
  visor: ${point(MARKS.visor)},
  belt: ${point(MARKS.belt)},
  joints: [${MARKS.joints.map(point).join(", ")}],
} as const;

/** Where Rexonance's undersuit stands in this frame (figure px). */
export const META_UNITAS_RX_UNDERSUIT_PLACE = ${JSON.stringify({ left: UNDERSUIT_PLACE.left, top: UNDERSUIT_PLACE.top, width: UNDERSUIT_PLACE.width, height: UNDERSUIT_PLACE.height })} as const;

/** Every file the suit-up paints, in the order it fetches them. */
export const META_UNITAS_RX_ASSETS = [
  META_UNITAS_RX_FIGURE,
  META_UNITAS_RX_UNDERSUIT,
  META_UNITAS_RX_GOLD_ATLAS.src,
  META_UNITAS_RX_ATLAS.src,
] as const;
`;
const goldTs = `// Generated by scripts/build-meta-unitas-rx-suit.mjs from
// design/meta-unitas-saga-${VERSION}/cutouts/middle.webp — do not edit by hand.

/** The gold nanite cell, in delivery px (${goldCount} cells in all). */
export const META_UNITAS_RX_GOLD_CELL = ${GOLD_CELL};
/** Each plate's gold cells (by id; plates without gold are absent): the
 * META_UNITAS_RX_GOLD_CELL px squares of its box (META_UNITAS_RX_PIECES) that
 * its trims touch, row-major, LSB-first bitmask, base64. */
export const META_UNITAS_RX_GOLD_CELLS: Readonly<Record<string, string>> = {
${Object.entries(goldCells)
  .map(([id, bits]) => `  ${JSON.stringify(id)}: ${JSON.stringify(bits)},`)
  .join("\n")}
};
`;
const nanitesTs = `// Generated by scripts/build-meta-unitas-rx-suit.mjs — do not edit by hand.
// What the nanite engine (src/lib/rexonance-assembly-nanites.js) derives from
// a suit: each non-driver plate's real outline (seams), its gold box and the
// gold guideway conduit sheet, for FAR FROM's plates. The chip, comet and
// effect sprites are the shared kits' (src/lib/rexonance-nanites.ts and, when
// present, src/lib/far-from-nanites.ts).

/** The guideway conduit, in ATLAS space (the frame of
 * META_UNITAS_RX_GOLD_ATLAS): each non-driver plate's conduit in its own cell
 * (ax, ay, w, h), clipped to its gold. Script-made (rails lit from the upper
 * left, an ice channel inside); a Blender render of the same contract can
 * replace the file. */
export const META_UNITAS_RX_GUIDE = ${JSON.stringify({ src: GUIDE, width: ATLAS_W, height: ATLAS_H })} as const;

/** Each non-driver plate's real outline, in figure px: base64 of Int16
 * little-endian [loopCount, n0, x, y, …], coordinates in QUARTER figure px;
 * at most 3 loops and 128 points, each loop clockwise (y down) from its
 * point nearest the plate's seat. */
export const META_UNITAS_RX_SEAMS: Readonly<Record<string, string>> = {
${Object.entries(seams)
  .map(([id, value]) => `  ${JSON.stringify(id)}:\n    ${JSON.stringify(value)},`)
  .join("\n")}
} as const;

/** Each non-driver plate's gold box [x, y, w, h], figure px. */
export const META_UNITAS_RX_GOLD_BOXES: Readonly<
  Record<string, readonly [number, number, number, number]>
> = {
${Object.entries(goldBoxes)
  .map(([id, box]) => `  ${JSON.stringify(id)}: [${box.join(", ")}],`)
  .join("\n")}
} as const;
`;
const prettier = await import("prettier");
for (const [path, text] of [
  [MODULE, ts],
  [GOLD_MODULE, goldTs],
  [NANITES_MODULE, nanitesTs],
])
  writeFileSync(
    path,
    await prettier.format(text, { ...(await prettier.resolveConfig(path)), filepath: path }),
  );
for (const file of files) console.log(`${file.name}\t${file.bytes}`);
console.log(
  `total\t${total} bytes in ${files.length} files; figure ${FIG_W}x${FIG_H}; ${pieces.length} plates, ${tileCount} tiles, ${goldCount} gold cells; undersuit at`,
  UNDERSUIT_PLACE.left,
  UNDERSUIT_PLACE.top,
  `${UNDERSUIT_PLACE.width}x${UNDERSUIT_PLACE.height}`,
);

if (DEBUG) {
  mkdirSync(DEBUG, { recursive: true });
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
    let r = rgb[i * 3] * 0.5;
    let g = rgb[i * 3 + 1] * 0.5;
    let b = rgb[i * 3 + 2] * 0.5;
    plates.forEach(({ field }, k) => {
      const t = field[i] * 0.5;
      if (!t) return;
      const [pr, pg, pb] = palette[k % palette.length];
      r += pr * t;
      g += pg * t;
      b += pb * t;
    });
    if (alpha[i] < 0.05) {
      r = 30;
      g = 30;
      b = 40;
    }
    tinted[i * 3] = Math.min(255, r);
    tinted[i * 3 + 1] = Math.min(255, g);
    tinted[i * 3 + 2] = Math.min(255, b);
  }
  const outline = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">${REGIONS.map(
    (region, k) =>
      `<path d="${svgPath(region.poly)}" fill="none" stroke="rgb(${palette[k % palette.length].join(",")})" stroke-width="2"/><text x="${region.poly[0][0]}" y="${region.poly[0][1] + 14}" fill="#fff" font-size="16" font-family="monospace">${region.id}</text>`,
  ).join("")}<path d="${svgPath(FACE_GLOW)}" fill="none" stroke="#0ff" stroke-width="1.5"/><path d="${svgPath(REACTOR_GLOW)}" fill="none" stroke="#ff0" stroke-width="1.5"/></svg>`;
  await sharp(tinted, { raw: { width: W, height: H, channels: 3 } })
    .composite([{ input: Buffer.from(outline) }])
    .jpeg({ quality: 84 })
    .toFile(join(DEBUG, "partition.jpg"));
  const trims = Buffer.alloc(N * 3);
  const unformed = Buffer.alloc(N * 3);
  for (let i = 0; i < N; i += 1) {
    const m = goldSoft[i];
    for (let c = 0; c < 3; c += 1) {
      trims[i * 3 + c] = goldTrim[i] ? rgb[i * 3 + c] : Math.round(rgb[i * 3 + c] * 0.18);
      unformed[i * 3 + c] = Math.round(rgb[i * 3 + c] * (1 - m) + rawGold[i * 3 + c] * m);
    }
  }
  for (const [name, buffer] of [
    ["gold-trims", trims],
    ["gold-unformed", unformed],
  ])
    await sharp(buffer, { raw: { width: W, height: H, channels: 3 } })
      .jpeg({ quality: 86 })
      .toFile(join(DEBUG, `${name}.jpg`));
  // The undersuit under the figure, for the registration.
  await sharp(join(OUT_DIR, "figure.webp"))
    .composite([{ input: join(OUT_DIR, "undersuit.webp"), blend: "over" }])
    .png()
    .toFile(join(DEBUG, "registration.png"));
  await sharp({ create: { width: FIG_W, height: FIG_H, channels: 4, background: "#223" } })
    .composite([
      { input: join(OUT_DIR, "undersuit.webp") },
      { input: join(OUT_DIR, "driver-standin.webp") },
    ])
    .png()
    .toFile(join(DEBUG, "standin.png"));
  await sharp(join(OUT_DIR, "plates.webp")).png().toFile(join(DEBUG, "plates.png"));
  await sharp(join(OUT_DIR, "gold.webp")).png().toFile(join(DEBUG, "gold.png"));
  await sharp(join(OUT_DIR, "guide.webp")).png().toFile(join(DEBUG, "guide.png"));
}
