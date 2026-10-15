#!/usr/bin/env node
// The Rexonance nanite kit (owner, 2026-10-16: 「超大幅な改善で。」 — every
// nanite, the armour formation and the gold guideways rebuilt). Reproducible:
//
//   node scripts/build-rexonance-nanites.mjs [--blender=<Blender binary>] [--check]
//
// writes public/rexonance-nanites-20261016/{cells,comets,fx,guide}.webp and
// the generated module src/lib/rexonance-nanites.ts.
//
// - --blender=<path>: renders the three Blender scenes headless
//   (scripts/blender/nanite_cells.py, nanite_fx.py, nanite_guide.py — Cycles
//   on the GPU), then packs and encodes every sheet. The raw renders are kept
//   in the work folder (--work=<dir>, default <tmp>/rexonance-nanites-work);
//   they are not committed.
// - without --blender: regenerates only the script-made parts — comets.webp,
//   the spark (repacked into cells.webp only when the renders are still in
//   the work folder), the seams, the gold boxes and the module — from the
//   committed sheets.
// - --check: verifies the module against the files (dimensions, BYTES,
//   SOURCE, seams, gold boxes, comets) and writes nothing.
// - --placeholder: the phase-0 bootstrap — flat script renders of the exact
//   sizes, for a machine without Blender.
//
// The guide is the only sheet that depends on the suit atlas; a rebuilt suit
// changes REXONANCE_NANITE_SOURCE and --check then fails until it is rerun.
// It refuses to write when the four files exceed 280,000 bytes.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);
const sharp = require(process.env.SHARP_MODULE || "sharp");

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const VERSION = "20261016";
const DIR = `/rexonance-nanites-${VERSION}`;
const OUT_DIR = join(ROOT, "public", DIR.slice(1));
const MODULE = join(ROOT, "src/lib/rexonance-nanites.ts");
const SUIT_DIR = join(ROOT, "public/rexonance-suit-20261016");
const BLENDER_DIR = join(ROOT, "scripts/blender");

const arg = (name) => {
  const hit = process.argv.find((value) => value.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
};
const CHECK = process.argv.includes("--check");
const PLACEHOLDER = process.argv.includes("--placeholder");
const BLENDER = arg("blender");
const WORK = arg("work") || join(tmpdir(), "rexonance-nanites-work");
// --debug=<dir>: also writes each sheet, lossless, as <dir>/<name>.png.
const DEBUG = arg("debug");

// --- The contract -----------------------------------------------------------------
const FILES = ["cells", "comets", "fx", "guide"];
const SIZE = {
  cells: [768, 224],
  comets: [512, 192],
  fx: [1024, 384],
  guide: [1024, 1488],
};
const BUDGET = { cells: 62_000, comets: 12_000, fx: 45_000, guide: 150_000, total: 280_000 };
const WEBP = {
  cells: { quality: 80, alphaQuality: 90, effort: 6 },
  comets: { quality: 80, alphaQuality: 90, effort: 6 },
  fx: { quality: 82, alphaQuality: 85, effort: 6 },
  guide: { quality: 72, alphaQuality: 65, effort: 6 },
};
const TONES = {
  ice: [121, 232, 255],
  pink: [255, 143, 216],
  white: [244, 251, 255],
  gold: [255, 206, 120],
};
const TONE_NAMES = ["ice", "pink", "white", "gold"];
const CELL = 32;
const FRAMES = 24;
const MIP = { cell: 16, x: [0, 384, 0, 384], y: [128, 128, 144, 144] };
const UNFOLD = { y: 160, frames: 7, x: [0, 224, 448] };
const BOKEH = { x: [672, 704, 736, 256], y: [160, 160, 160, 192] };
const BEAD = { x: 0, y: 192, frames: 8 };
const SPARK = { x: 288, y: 192, frames: 4 };
const COMET = { cell: 32, angles: 16, step: 22.5, rows: { ice: 0, pink: 2, gold: 4 }, tail: [8, 15], head: [16, 16] };
const FX = {
  clamp: {
    x: 0,
    y: 0,
    cell: 48,
    frames: 12,
    swing: [0, 8],
    bite: [8, 12],
    corners: { tl: 0, tr: 1, bl: 2, br: 3 },
    anchor: { tl: [12, 12], tr: [36, 12], bl: [12, 36], br: [36, 36] },
  },
  latch: { x: 0, y: 192, cell: 48, frames: 12, idle: [0, 6], bite: [6, 12], centre: [24, 24] },
  scan: { x: 576, y: 0, w: 256, h: 64, edgeY: 32 },
  drop: { x: 576, y: 64, cell: 24, angles: 8, step: 22.5, elongations: [1.6, 2.3, 3.0] },
  shock: { x: 0, y: 240, w: 192, h: 72, frames: 10, cols: 5, centre: [96, 36] },
};

// --- The suit ---------------------------------------------------------------------
const importTs = (path) => import(pathToFileURL(join(ROOT, path)).href);
const suit = await importTs("src/lib/rexonance-suit.ts");
const suitGold = await importTs("src/lib/rexonance-suit-gold.ts");
const calls = await importTs("src/lib/rexonance-calls.ts");
const PIECES = suit.REXONANCE_SUIT_PIECES.filter(
  (piece) => !calls.REXONANCE_SUIT_DRIVER.includes(piece.id),
);
const ATLAS_W = suit.REXONANCE_SUIT_GOLD_ATLAS.width;
const ATLAS_H = suit.REXONANCE_SUIT_GOLD_ATLAS.height;
const GOLD_CELL = suitGold.REXONANCE_SUIT_GOLD_CELL;

const hash16 = (path) => createHash("sha256").update(readFileSync(path)).digest("hex").slice(0, 16);
const SOURCE = {
  gold: hash16(join(SUIT_DIR, "gold.webp")),
  plates: hash16(join(SUIT_DIR, "plates.webp")),
};

// --- Contours ---------------------------------------------------------------------
// Marching squares over pixel-centred samples (outside the field is 0). Each
// loop keeps the inside on its right as seen on screen (y down), so outer
// outlines have a positive shoelace area and holes a negative one.
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

// Douglas–Peucker on an open run (both ends kept), iterative.
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

// A closed loop, simplified with its point 0 kept (it is the anchor), split
// at the point farthest from it.
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

// --- Seams --------------------------------------------------------------------------
// Each plate's real outline (the art half's alpha > 96 in its atlas cell) in
// figure px: loop 0 the largest outer outline, then at most two islands of
// more than 40 px², each starting at its point nearest the seat; at most 128
// points in all (Douglas–Peucker from ε 0.9, widened only if a plate needs
// it). Base64 of Int16 little-endian [loops, n, x, y, …] in quarter px.
const SEAM_ALPHA = 96;
const SEAM_EPSILON = 0.9;
const SEAM_POINTS = 128;
const SEAM_ISLAND = 40;
async function buildSeams() {
  const { data, info } = await sharp(join(SUIT_DIR, "plates.webp"))
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const seams = {};
  const report = {};
  for (const piece of PIECES) {
    const { ax, ay, w, h, x, y, seat } = piece;
    const field = new Uint8Array(w * h);
    for (let j = 0; j < h; j += 1)
      for (let i = 0; i < w; i += 1) field[j * w + i] = data[((ay + j) * info.width + ax + i) * 4 + 3];
    const outlines = traceContours(field, w, h, SEAM_ALPHA)
      .map((loop) => loop.map(([px, py]) => [px + x, py + y]))
      .map((loop) => ({ loop, area: shoelace(loop) }))
      .filter(({ area }) => area > 0)
      .sort((a, b) => b.area - a.area);
    if (!outlines.length) throw new Error(`${piece.id}: no outline in its atlas cell`);
    const chosen = [outlines[0], ...outlines.slice(1).filter(({ area }) => area > SEAM_ISLAND).slice(0, 2)];
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
    report[piece.id] = { loops: loops.length, points: loops.reduce((sum, loop) => sum + loop.length, 0), epsilon };
  }
  return { seams, report };
}

// --- Gold boxes -----------------------------------------------------------------------
function buildGoldBoxes() {
  const boxes = {};
  for (const piece of PIECES) {
    const encoded = suitGold.REXONANCE_SUIT_GOLD_CELLS[piece.id];
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

// --- Raster helpers --------------------------------------------------------------------
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (edge, value, soft) => clamp01((edge - value) / soft + 0.5);

/** A straight-alpha float canvas; `put` composites premultiplied "over". */
class Plane {
  constructor(width, height) {
    this.width = width;
    this.height = height;
    this.rgb = new Float32Array(width * height * 3); // premultiplied
    this.a = new Float32Array(width * height);
  }
  over(x, y, [r, g, b], alpha) {
    if (alpha <= 0 || x < 0 || y < 0 || x >= this.width || y >= this.height) return;
    const i = y * this.width + x;
    const k = 1 - alpha;
    this.rgb[i * 3] = r * alpha + this.rgb[i * 3] * k;
    this.rgb[i * 3 + 1] = g * alpha + this.rgb[i * 3 + 1] * k;
    this.rgb[i * 3 + 2] = b * alpha + this.rgb[i * 3 + 2] * k;
    this.a[i] = alpha + this.a[i] * k;
  }
  toRaw() {
    const raw = Buffer.alloc(this.width * this.height * 4);
    for (let i = 0; i < this.a.length; i += 1) {
      const alpha = this.a[i];
      if (alpha <= 0) continue;
      raw[i * 4] = Math.round(Math.min(255, this.rgb[i * 3] / alpha));
      raw[i * 4 + 1] = Math.round(Math.min(255, this.rgb[i * 3 + 1] / alpha));
      raw[i * 4 + 2] = Math.round(Math.min(255, this.rgb[i * 3 + 2] / alpha));
      raw[i * 4 + 3] = Math.round(Math.min(255, alpha * 255));
    }
    return raw;
  }
}

const downsample = (raw, width, height, toWidth, toHeight) =>
  sharp(raw, { raw: { width, height, channels: 4 } })
    .resize(toWidth, toHeight, { kernel: "lanczos3", fit: "fill" })
    .raw()
    .toBuffer();

const blit = (sheet, sheetWidth, cell, cellWidth, cellHeight, x, y) => {
  for (let j = 0; j < cellHeight; j += 1)
    cell.copy(sheet, ((y + j) * sheetWidth + x) * 4, j * cellWidth * 4, (j + 1) * cellWidth * 4);
};

const mixColour = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
const WHITE = [255, 255, 255];

// --- Comets (script-made) ---------------------------------------------------------------
// 32 px cells, rendered at 4x and downsampled with lanczos3. The head (the
// brightest point) is the disc of radius 1.6 px centred on pixel (16, 16),
// mix(tone, white, 0.6), with a 0.75 px hot centre; the tail of width 1.4 px
// runs along -θ with intensity exp(-3d/L).
const SS = 4;
function cometCell(tone, angle, length) {
  const size = COMET.cell * SS;
  const plane = new Plane(size, size);
  const theta = (angle * COMET.step * Math.PI) / 180;
  const [dx, dy] = [Math.cos(theta), Math.sin(theta)];
  const [hx, hy] = [COMET.head[0] + 0.5, COMET.head[1] + 0.5];
  const head = mixColour(tone, WHITE, 0.6);
  const core = mixColour(tone, WHITE, 0.92);
  for (let py = 0; py < size; py += 1)
    for (let px = 0; px < size; px += 1) {
      const x = (px + 0.5) / SS - hx;
      const y = (py + 0.5) / SS - hy;
      const along = -(x * dx + y * dy);
      const across = Math.abs(x * dy - y * dx);
      if (along >= 0) {
        const cover = smooth(0.7, across, 1 / SS) * smooth(length, along, 1 / SS);
        plane.over(px, py, tone, cover * Math.exp((-3 * along) / length));
      }
      plane.over(px, py, head, smooth(1.6, Math.hypot(x, y), 1 / SS));
      // Its hot centre, so pixel (16, 16) is the brightest (the disc alone
      // lights its four neighbours fully too).
      plane.over(px, py, core, smooth(0.75, Math.hypot(x, y), 1 / SS));
    }
  return plane.toRaw();
}
async function buildComets() {
  const [width, height] = SIZE.comets;
  const sheet = Buffer.alloc(width * height * 4);
  for (const [name, row] of Object.entries(COMET.rows))
    for (let length = 0; length < 2; length += 1)
      for (let angle = 0; angle < COMET.angles; angle += 1) {
        const big = cometCell(TONES[name], angle, COMET.tail[length]);
        const cell = await downsample(big, COMET.cell * SS, COMET.cell * SS, COMET.cell, COMET.cell);
        // Every colour lies on the line tone → white: snap it there (the faint
        // fringe's unpremultiplied rounding noise would cost bytes).
        const tone = TONES[name];
        const span = WHITE.map((v, c) => v - tone[c]);
        const norm = span.reduce((sum, v) => sum + v * v, 0);
        for (let i = 0; i < cell.length; i += 4) {
          const t = cell[i + 3] < 24 ? 0 : clamp01(span.reduce((sum, v, c) => sum + v * (cell[i + c] - tone[c]), 0) / norm);
          for (let c = 0; c < 3; c += 1) cell[i + c] = Math.round(tone[c] + span[c] * t);
        }
        blit(sheet, width, cell, COMET.cell, COMET.cell, angle * COMET.cell, (row + length) * COMET.cell);
      }
  return sheet;
}

// --- Spark (script-made) ----------------------------------------------------------------
// A 4-point star on pixel (16, 16): arms of 15, 11, 7 and 3 px, a white core
// tinted ice along the arms; frame 0 the largest and brightest.
const SPARK_ARMS = [15, 11, 7, 3];
const SPARK_GAIN = [1, 0.8, 0.6, 0.4];
async function sparkCells() {
  const size = CELL * SS;
  const cells = [];
  for (let frame = 0; frame < SPARK.frames; frame += 1) {
    const plane = new Plane(size, size);
    const arm = SPARK_ARMS[frame];
    const gain = SPARK_GAIN[frame];
    for (let py = 0; py < size; py += 1)
      for (let px = 0; px < size; px += 1) {
        const x = (px + 0.5) / SS - 16.5;
        const y = (py + 0.5) / SS - 16.5;
        const r = Math.hypot(x, y);
        let alpha = 0;
        let tint = 0;
        for (const [along, across] of [
          [Math.abs(x), Math.abs(y)],
          [Math.abs(y), Math.abs(x)],
        ]) {
          if (along > arm) continue;
          const u = along / arm;
          const half = 0.15 + 1.05 * (1 - u);
          const a = smooth(half, across, 1 / SS) * (1 - u) ** 1.5;
          if (a > alpha) [alpha, tint] = [a, u];
        }
        const core = Math.exp(-(r * r) / (2 * 1.2 * 1.2));
        if (core > alpha) [alpha, tint] = [core, 0];
        plane.over(px, py, mixColour(WHITE, TONES.ice, Math.min(1, tint * 1.4)), clamp01(alpha * gain));
      }
    cells.push(await downsample(plane.toRaw(), size, size, CELL, CELL));
  }
  return cells;
}

// --- Bokeh -----------------------------------------------------------------------------
// The face-on chip, defocused: f0 shrunk to 72% (so the blur stays inside its
// cell), a Gaussian of σ 3.6 px in premultiplied light, 1.6x as bright.
function bokehCell(cell) {
  const n = CELL;
  const shrink = 0.72;
  const premul = new Float32Array(n * n * 4);
  // Bilinear shrink about the centre.
  for (let y = 0; y < n; y += 1)
    for (let x = 0; x < n; x += 1) {
      const sx = (x + 0.5 - n / 2) / shrink + n / 2 - 0.5;
      const sy = (y + 0.5 - n / 2) / shrink + n / 2 - 0.5;
      const x0 = Math.floor(sx);
      const y0 = Math.floor(sy);
      for (const [xx, yy, wgt] of [
        [x0, y0, (1 - (sx - x0)) * (1 - (sy - y0))],
        [x0 + 1, y0, (sx - x0) * (1 - (sy - y0))],
        [x0, y0 + 1, (1 - (sx - x0)) * (sy - y0)],
        [x0 + 1, y0 + 1, (sx - x0) * (sy - y0)],
      ]) {
        if (xx < 0 || yy < 0 || xx >= n || yy >= n) continue;
        const s = (yy * n + xx) * 4;
        const a = cell[s + 3] / 255;
        premul[(y * n + x) * 4] += cell[s] * a * wgt;
        premul[(y * n + x) * 4 + 1] += cell[s + 1] * a * wgt;
        premul[(y * n + x) * 4 + 2] += cell[s + 2] * a * wgt;
        premul[(y * n + x) * 4 + 3] += a * wgt;
      }
    }
  const sigma = 3.6;
  const radius = Math.ceil(sigma * 3);
  const kernel = Array.from({ length: radius * 2 + 1 }, (_, i) => Math.exp(-((i - radius) ** 2) / (2 * sigma * sigma)));
  const total = kernel.reduce((s, v) => s + v, 0);
  const pass = (src, horizontal) => {
    const out = new Float32Array(src.length);
    for (let y = 0; y < n; y += 1)
      for (let x = 0; x < n; x += 1)
        for (let k = -radius; k <= radius; k += 1) {
          const xx = horizontal ? x + k : x;
          const yy = horizontal ? y : y + k;
          if (xx < 0 || yy < 0 || xx >= n || yy >= n) continue;
          const wgt = kernel[k + radius] / total;
          for (let c = 0; c < 4; c += 1) out[(y * n + x) * 4 + c] += src[(yy * n + xx) * 4 + c] * wgt;
        }
    return out;
  };
  const blurred = pass(pass(premul, true), false);
  const raw = Buffer.alloc(n * n * 4);
  for (let i = 0; i < n * n; i += 1) {
    const a = blurred[i * 4 + 3];
    if (a <= 0) continue;
    for (let c = 0; c < 3; c += 1) raw[i * 4 + c] = Math.round(Math.min(255, (blurred[i * 4 + c] * 1.6) / a));
    raw[i * 4 + 3] = Math.round(Math.min(255, a * 255));
  }
  return raw;
}

// --- Packing ---------------------------------------------------------------------------
// Faint pixels' colours, unpremultiplied from a few levels of alpha, are
// rounding noise that costs bytes and shows nothing: below alpha 48 a pixel
// takes its neighbourhood's alpha-weighted colour (a change of at most
// alpha × Δcolour, under 19% of a faint pixel's light), and fully
// transparent pixels carry no colour.
function bleed(raw, width, height) {
  const out = Buffer.from(raw);
  for (let y = 0; y < height; y += 1)
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4;
      const alpha = raw[i + 3];
      if (alpha >= 48) continue;
      if (!alpha) {
        out[i] = out[i + 1] = out[i + 2] = 0;
        continue;
      }
      let [r, g, b, a] = [0, 0, 0, 0];
      for (let dy = -2; dy <= 2; dy += 1)
        for (let dx = -2; dx <= 2; dx += 1) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= width || yy >= height) continue;
          const j = (yy * width + xx) * 4;
          const w = raw[j + 3];
          r += raw[j] * w;
          g += raw[j + 1] * w;
          b += raw[j + 2] * w;
          a += w;
        }
      out[i] = Math.round(r / a);
      out[i + 1] = Math.round(g / a);
      out[i + 2] = Math.round(b / a);
    }
  return out;
}

const encode = (name, source, options = WEBP[name]) => {
  const [width, height] = SIZE[name];
  const raw = bleed(source, width, height);
  if (DEBUG) {
    mkdirSync(DEBUG, { recursive: true });
    sharp(raw, { raw: { width, height, channels: 4 } }).png().toFile(join(DEBUG, `${name}.png`));
  }
  return sharp(raw, { raw: { width, height, channels: 4 } })
    .webp({ smartSubsample: true, ...options })
    .toBuffer();
};

/** cells.webp from per-frame renders (128 px PNGs) or placeholder cells. */
async function packCells(frameAt, sparks) {
  const [width, height] = SIZE.cells;
  const sheet = Buffer.alloc(width * height * 4);
  const f0 = [];
  for (const [t, tone] of TONE_NAMES.entries())
    for (let f = 0; f < FRAMES; f += 1) {
      const { raw, size } = await frameAt(`tumble-${tone}-${String(f).padStart(2, "0")}`);
      const big = await downsample(raw, size, size, CELL, CELL);
      const small = await downsample(raw, size, size, MIP.cell, MIP.cell);
      blit(sheet, width, big, CELL, CELL, f * CELL, t * CELL);
      blit(sheet, width, small, MIP.cell, MIP.cell, MIP.x[t] + f * MIP.cell, MIP.y[t]);
      if (f === 0) f0[t] = big;
    }
  for (const [t, tone] of TONE_NAMES.slice(0, 3).entries())
    for (let k = 0; k < UNFOLD.frames; k += 1) {
      // k0 is the lock pose itself (tumble f0).
      const cell = k
        ? await (async () => {
            const { raw, size } = await frameAt(`unfold-${tone}-${k}`);
            return downsample(raw, size, size, CELL, CELL);
          })()
        : f0[t];
      blit(sheet, width, cell, CELL, CELL, UNFOLD.x[t] + k * CELL, UNFOLD.y);
    }
  for (let t = 0; t < 4; t += 1) blit(sheet, width, bokehCell(f0[t]), CELL, CELL, BOKEH.x[t], BOKEH.y[t]);
  for (let k = 0; k < BEAD.frames; k += 1) {
    const { raw, size } = await frameAt(`bead-${k}`);
    blit(sheet, width, await downsample(raw, size, size, CELL, CELL), CELL, CELL, BEAD.x + k * CELL, BEAD.y);
  }
  for (let k = 0; k < SPARK.frames; k += 1) blit(sheet, width, sparks[k], CELL, CELL, SPARK.x + k * CELL, SPARK.y);
  return sheet;
}

// Alpha feathered to 0 over the last `feather` px of a cell: a swing-in that
// leaves its cell fades instead of ending on a hard line.
function featherCell(cell, w, h, feather) {
  for (let y = 0; y < h; y += 1)
    for (let x = 0; x < w; x += 1) {
      const edge = Math.min(x + 0.5, y + 0.5, w - x - 0.5, h - y - 0.5);
      if (edge >= feather) continue;
      const i = (y * w + x) * 4 + 3;
      cell[i] = Math.round(cell[i] * clamp01(edge / feather));
    }
  return cell;
}
const fade = (cell, k) => {
  for (let i = 3; i < cell.length; i += 4) cell[i] = Math.round(cell[i] * k);
  return cell;
};

const CLAMP_CORNERS = ["tl", "tr", "bl", "br"];
// The swing-in starts outside its cell (scale 1.45, 0.5 out, turned 75°): its
// first frames fade in (owner flash rule: nothing pops).
const CLAMP_FADE = [0.3, 0.6, 0.85];
async function packFx(frameAt, scanGlow = true) {
  const [width, height] = SIZE.fx;
  const sheet = Buffer.alloc(width * height * 4);
  const { clamp, latch, scan, drop, shock } = FX;
  for (const [row, corner] of CLAMP_CORNERS.entries())
    for (let f = 0; f < clamp.frames; f += 1) {
      const { raw, size } = await frameAt(`clamp-${corner}-${String(f).padStart(2, "0")}`);
      let cell = await downsample(raw, size, size, clamp.cell, clamp.cell);
      if (f < CLAMP_FADE.length) cell = fade(cell, CLAMP_FADE[f]);
      blit(sheet, width, featherCell(cell, clamp.cell, clamp.cell, 2), clamp.cell, clamp.cell, clamp.x + f * clamp.cell, clamp.y + row * clamp.cell);
    }
  for (let f = 0; f < latch.frames; f += 1) {
    const { raw, size } = await frameAt(`latch-${String(f).padStart(2, "0")}`);
    const cell = await downsample(raw, size, size, latch.cell, latch.cell);
    blit(sheet, width, featherCell(cell, latch.cell, latch.cell, 1), latch.cell, latch.cell, latch.x + f * latch.cell, latch.y);
  }
  {
    const { raw, size, height: h } = await frameAt("scan");
    let cell = await downsample(raw, size, h, scan.w, scan.h);
    if (scanGlow) cell = scanUnderGlow(cell);
    blit(sheet, width, cell, scan.w, scan.h, scan.x, scan.y);
  }
  for (const [e] of drop.elongations.entries())
    for (let a = 0; a < drop.angles; a += 1) {
      const { raw, size } = await frameAt(`drop-${e}-${a}`);
      const cell = await downsample(raw, size, size, drop.cell, drop.cell);
      blit(sheet, width, featherCell(cell, drop.cell, drop.cell, 1), drop.cell, drop.cell, drop.x + a * drop.cell, drop.y + e * drop.cell);
    }
  for (let k = 0; k < shock.frames; k += 1) {
    const { raw, size, height: h } = await frameAt(`shock-${k}`);
    const cell = await downsample(raw, size, h, shock.w, shock.h);
    const x = shock.x + shock.w * (k % shock.cols);
    const y = shock.y + shock.h * Math.floor(k / shock.cols);
    blit(sheet, width, featherCell(cell, shock.w, shock.h, 2), shock.w, shock.h, x, y);
  }
  return sheet;
}

// Beneath the scan plane's leading edge (row edgeY), a soft ice lip of
// light falling off downward over 10 rows (the plane is drawn above it).
function scanUnderGlow(cell) {
  const { w, h, edgeY } = FX.scan;
  const [r, g, b] = [140, 236, 255];
  for (let y = edgeY + 1; y < h; y += 1) {
    const k = Math.exp(-(y - edgeY) / 4) * 0.55;
    for (let x = 0; x < w; x += 1) {
      const i = (y * w + x) * 4;
      const edge = cell[(edgeY * w + x) * 4 + 3] / 255;
      const add = k * edge;
      const a0 = cell[i + 3] / 255;
      const a = add + a0 * (1 - add);
      if (a <= 0) continue;
      cell[i] = Math.round((r * add + cell[i] * a0 * (1 - add)) / a);
      cell[i + 1] = Math.round((g * add + cell[i + 1] * a0 * (1 - add)) / a);
      cell[i + 2] = Math.round((b * add + cell[i + 2] * a0 * (1 - add)) / a);
      cell[i + 3] = Math.round(a * 255);
    }
  }
  return cell;
}

// --- The guide's prep and mask ---------------------------------------------------------
// The gold.webp alpha, thresholded at > 32 and dilated by 2 px (atlas
// space), clipped to the non-driver cells: the guide never leaves it.
async function goldAlpha() {
  const { data } = await sharp(join(SUIT_DIR, "gold.webp")).ensureAlpha().extractChannel(3).raw().toBuffer({ resolveWithObject: true });
  return data;
}
function guideMask(alpha) {
  const mask = new Uint8Array(ATLAS_W * ATLAS_H);
  const inCell = new Uint8Array(ATLAS_W * ATLAS_H);
  for (const { ax, ay, w, h } of PIECES)
    for (let y = ay; y < ay + h; y += 1) inCell.fill(1, y * ATLAS_W + ax, y * ATLAS_W + ax + w);
  for (let y = 0; y < ATLAS_H; y += 1)
    for (let x = 0; x < ATLAS_W; x += 1) {
      if (alpha[y * ATLAS_W + x] <= 32) continue;
      for (let dy = -2; dy <= 2; dy += 1)
        for (let dx = -2; dx <= 2; dx += 1) {
          if (dx * dx + dy * dy > 5) continue;
          const xx = x + dx;
          const yy = y + dy;
          if (xx >= 0 && yy >= 0 && xx < ATLAS_W && yy < ATLAS_H) mask[yy * ATLAS_W + xx] = 1;
        }
    }
  // Each cell keeps only its own gold: a neighbour's dilation never crosses the gutter.
  for (let i = 0; i < mask.length; i += 1) mask[i] &= inCell[i];
  return mask;
}
const applyMask = (raw, mask) => {
  for (let i = 0; i < mask.length; i += 1) if (!mask[i]) raw[i * 4] = raw[i * 4 + 1] = raw[i * 4 + 2] = raw[i * 4 + 3] = 0;
  return raw;
};

// Zhang–Suen thinning of a binary field (1 inside), in place.
function thin(bits, w, h) {
  const at = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : bits[y * w + x]);
  let changed = true;
  const remove = [];
  while (changed) {
    changed = false;
    for (let step = 0; step < 2; step += 1) {
      remove.length = 0;
      for (let y = 0; y < h; y += 1)
        for (let x = 0; x < w; x += 1) {
          if (!bits[y * w + x]) continue;
          const p = [at(x, y - 1), at(x + 1, y - 1), at(x + 1, y), at(x + 1, y + 1), at(x, y + 1), at(x - 1, y + 1), at(x - 1, y), at(x - 1, y - 1)];
          const b = p.reduce((s, v) => s + v, 0);
          if (b < 2 || b > 6) continue;
          let a = 0;
          for (let k = 0; k < 8; k += 1) if (!p[k] && p[(k + 1) % 8]) a += 1;
          if (a !== 1) continue;
          if (step === 0 ? p[0] * p[2] * p[4] || p[2] * p[4] * p[6] : p[0] * p[2] * p[6] || p[0] * p[4] * p[6]) continue;
          remove.push(y * w + x);
        }
      for (const i of remove) bits[i] = 0;
      if (remove.length) changed = true;
    }
  }
  return bits;
}

// The skeleton's pixels as polylines: walks between ends and junctions.
function skeletonPaths(bits, w, h) {
  const around = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
  const on = (x, y) => x >= 0 && y >= 0 && x < w && y < h && bits[y * w + x];
  const degree = (x, y) => around.reduce((s, [dx, dy]) => s + (on(x + dx, y + dy) ? 1 : 0), 0);
  const used = new Set();
  const edge = (a, b) => (a < b ? `${a}:${b}` : `${b}:${a}`);
  const paths = [];
  const walk = (x, y) => {
    for (const [dx, dy] of around) {
      if (!on(x + dx, y + dy)) continue;
      const first = edge(y * w + x, (y + dy) * w + x + dx);
      if (used.has(first)) continue;
      const path = [[x, y]];
      let [cx, cy, nx, ny] = [x, y, x + dx, y + dy];
      for (;;) {
        used.add(edge(cy * w + cx, ny * w + nx));
        path.push([nx, ny]);
        [cx, cy] = [nx, ny];
        if (degree(cx, cy) !== 2) break;
        const step = around.find(([ex, ey]) => on(cx + ex, cy + ey) && !used.has(edge(cy * w + cx, (cy + ey) * w + cx + ex)));
        if (!step) break;
        [nx, ny] = [cx + step[0], cy + step[1]];
      }
      paths.push(path);
    }
  };
  for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) if (bits[y * w + x] && degree(x, y) !== 2) walk(x, y);
  for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) if (bits[y * w + x]) walk(x, y);
  return paths;
}

/** Per plate: its trims' contours and channel skeleton, atlas px at 2x. */
async function guidePrep(alpha) {
  const pieces = [];
  for (const piece of PIECES) {
    const { ax, ay, w, h } = piece;
    const cell = Buffer.alloc(w * h);
    for (let y = 0; y < h; y += 1) alpha.copy(cell, y * w, (ay + y) * ATLAS_W + ax, (ay + y) * ATLAS_W + ax + w);
    const big = await sharp(cell, { raw: { width: w, height: h, channels: 1 } })
      .resize(w * 2, h * 2, { kernel: "cubic", fit: "fill" })
      .raw()
      .toBuffer();
    const W2 = w * 2;
    const H2 = h * 2;
    const contours = traceContours(big, W2, H2, 96)
      .map((loop) => simplifyLoop(loop, 0.5))
      .filter((loop) => loop.length >= 3 && Math.abs(shoelace(loop)) > 1.5)
      .map((loop) => loop.map(([x, y]) => [+(x + ax * 2).toFixed(2), +(y + ay * 2).toFixed(2)]));
    const bits = thin(Uint8Array.from(big, (v) => (v > 96 ? 1 : 0)), W2, H2);
    const skeleton = skeletonPaths(bits, W2, H2)
      .filter((path) => path.length >= 4)
      .map((path) => simplifyRun(path.map(([x, y]) => [x + 0.5, y + 0.5]), 0.5))
      .map((path) => path.map(([x, y]) => [+(x + ax * 2).toFixed(2), +(y + ay * 2).toFixed(2)]));
    pieces.push({ id: piece.id, cell: [ax * 2, ay * 2, W2, H2], contours, skeleton });
  }
  return { width: ATLAS_W * 2, height: ATLAS_H * 2, pieces };
}

// --- Blender ---------------------------------------------------------------------------
function runBlender(script, ...args) {
  const started = Date.now();
  const result = spawnSync(BLENDER, ["-b", "--factory-startup", "-P", join(BLENDER_DIR, script), "--", ...args], {
    stdio: ["ignore", "pipe", "pipe"],
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
  });
  const log = `${result.stdout}\n${result.stderr}`;
  writeFileSync(join(WORK, `${script}.log`), log);
  if (result.status !== 0 || !/NANITE-DONE/.test(log))
    throw new Error(`${script} failed (status ${result.status}); see ${join(WORK, `${script}.log`)}`);
  console.log(`${script}: ${((Date.now() - started) / 1000).toFixed(1)} s`);
}

const pngFrames = (dir) => async (name) => {
  const { data, info } = await sharp(join(dir, `${name}.png`)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { raw: data, size: info.width, height: info.height };
};

async function renderedGuide(mask) {
  const { data, info } = await sharp(join(WORK, "guide", "guide.png")).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const raw = await downsample(data, info.width, info.height, ATLAS_W, ATLAS_H);
  return applyMask(raw, mask);
}

// --- Placeholders (phase 0) ---------------------------------------------------------------
// Flat script renders of the exact sizes: hex silhouettes, L shapes and
// ellipses, the guide traced from the gold alpha.
const svgFrame = (size, body) =>
  Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${body}</svg>`);
const hexPoints = (cx, cy, r, sx = 1, sy = 1, rot = 0) =>
  Array.from({ length: 6 }, (_, k) => {
    const a = rot + (k * Math.PI) / 3;
    return `${(cx + Math.cos(a) * r * sx).toFixed(2)},${(cy + Math.sin(a) * r * sy).toFixed(2)}`;
  }).join(" ");
const rgb = ([r, g, b]) => `rgb(${r},${g},${b})`;
async function svgRaw(svg, size, height = size) {
  const { data } = await sharp(svg).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { raw: data, size, height };
}
function placeholderFrames() {
  const S = 128;
  return async (name) => {
    const tumble = name.match(/^tumble-(\w+)-(\d+)$/);
    const unfold = name.match(/^unfold-(\w+)-(\d)$/);
    const bead = name.match(/^bead-(\d)$/);
    if (tumble) {
      const tone = TONES[tumble[1]];
      const f = Number(tumble[2]);
      const c = Math.cos((2 * Math.PI * f) / 24);
      const back = f >= 8 && f <= 16;
      const sx = Math.max(0.12, Math.abs(c));
      const body = back ? "rgb(34,38,48)" : "rgb(62,68,80)";
      const core = back
        ? `<polygon points="${hexPoints(64, 64, 34, sx, 1)}" fill="none" stroke="${rgb(tone)}" stroke-opacity="0.45" stroke-width="3"/>`
        : `<polygon points="${hexPoints(64, 64, 26, sx, 1)}" fill="${rgb(tone)}"/>`;
      return svgRaw(svgFrame(S, `<polygon points="${hexPoints(64, 64, 60, sx, 1)}" fill="${body}" stroke="rgb(150,160,176)" stroke-width="4"/>${core}`), S);
    }
    if (unfold) {
      const tone = TONES[unfold[1]];
      const k = Number(unfold[2]) / 6;
      const r = 60 + 0 * k;
      const square = `M${64 - 59 * k - r * (1 - k)},${64 - 59 * k - r * 0.87 * (1 - k)} h${2 * (59 * k + r * (1 - k))} v${2 * (59 * k + r * 0.87 * (1 - k))} h${-2 * (59 * k + r * (1 - k))} z`;
      return svgRaw(svgFrame(S, `<path d="${square}" fill="rgb(62,68,80)"/><polygon points="${hexPoints(64, 64, 26)}" fill="${rgb(tone)}" fill-opacity="${1 - 0.8 * k}"/>`), S);
    }
    if (bead) {
      const s = 0.12 * Math.sin((2 * Math.PI * Number(bead[1])) / 8);
      return svgRaw(svgFrame(S, `<ellipse cx="64" cy="64" rx="${40 * (1 + s)}" ry="${30 * (1 - s)}" fill="rgb(255,176,60)"/><ellipse cx="52" cy="54" rx="10" ry="6" fill="rgb(255,236,190)"/>`), S);
    }
    const clamp = name.match(/^clamp-(\w+)-(\d+)$/);
    if (clamp) {
      const f = Number(clamp[2]);
      const u = Math.min(1, f / 7);
      const e = 1 - (1 - u) ** 3;
      const rot = { tl: 0, tr: 90, bl: -90, br: 180 }[clamp[1]];
      const k = 4;
      const [x, y] = FX.clamp.anchor[clamp[1]].map((v) => v * k);
      const out = 0.5 * (1 - e) * 20 * k * 0.707;
      const scale = 1.45 - 0.45 * e;
      const led = f >= 8 ? 0.6 + 2.4 * ((f - 7) / 4) : 0.6;
      const L = `<g transform="translate(${x},${y}) rotate(${rot}) translate(${-out},${-out}) rotate(${75 * (1 - e)}) scale(${scale})"><path d="M-18,-18 h78 v18 h-60 v60 h-18 z" fill="rgb(255,194,90)" stroke="rgb(120,80,20)" stroke-width="2"/><circle cx="-9" cy="-9" r="6" fill="rgb(121,232,255)" fill-opacity="${Math.min(1, led / 3)}"/></g>`;
      return svgRaw(svgFrame(192, L), 192);
    }
    const latch = name.match(/^latch-(\d+)$/);
    if (latch) {
      const f = Number(latch[1]);
      const u = f < 6 ? 0 : (f - 6) / 5;
      const r = (0.95 - 0.55 * u * u) * 72;
      const claws = Array.from({ length: 6 }, (_, k) => {
        const a = ((f < 6 ? f * 10 : 60) + k * 60) * (Math.PI / 180);
        return `<circle cx="${96 + Math.cos(a) * r}" cy="${96 + Math.sin(a) * r}" r="9" fill="rgb(255,194,90)"/>`;
      }).join("");
      return svgRaw(svgFrame(192, `<circle cx="96" cy="96" r="58" fill="none" stroke="rgb(70,76,90)" stroke-width="10"/><circle cx="96" cy="96" r="46" fill="none" stroke="rgb(121,232,255)" stroke-opacity="${0.4 + 0.2 * (1 + 2 * u)}" stroke-width="3"/>${claws}`), 192);
    }
    if (name === "scan") {
      const lines = Array.from({ length: 17 }, (_, k) => `<line x1="${32 * k}" y1="0" x2="${32 * k}" y2="64" stroke="rgb(140,236,255)" stroke-opacity="0.5" stroke-width="2"/>`).join("");
      const svg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="512" height="128"><defs><linearGradient id="g" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="rgb(140,236,255)" stop-opacity="0.35"/><stop offset="1" stop-color="rgb(140,236,255)" stop-opacity="0"/></linearGradient></defs><rect x="0" y="0" width="512" height="64" fill="url(#g)"/>${lines}<rect x="0" y="62" width="512" height="4" fill="rgb(230,252,255)"/></svg>`);
      return svgRaw(svg, 512, 128);
    }
    const drop = name.match(/^drop-(\d)-(\d)$/);
    if (drop) {
      const e = FX.drop.elongations[Number(drop[1])];
      const angle = Number(drop[2]) * 22.5;
      return svgRaw(svgFrame(96, `<ellipse cx="48" cy="48" rx="${16 * e}" ry="${16 / Math.sqrt(e)}" fill="rgb(255,176,60)" transform="rotate(${angle} 48 48)"/>`), 96);
    }
    const shock = name.match(/^shock-(\d)$/);
    if (shock) {
      const u = (Number(shock[1]) + 0.5) / 10;
      const e = 1 - (1 - u) ** 2;
      const R = (0.25 + 1.55 * e) * 192;
      const svg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="768" height="288"><ellipse cx="384" cy="144" rx="${R}" ry="${R * 0.375}" fill="none" stroke="rgb(216,247,255)" stroke-opacity="${(1 - u) ** 1.5}" stroke-width="${6 + 16 * (1 - u)}"/></svg>`);
      return svgRaw(svg, 768, 288);
    }
    throw new Error(`placeholder: no frame ${name}`);
  };
}
function placeholderGuide(alpha, mask) {
  const raw = Buffer.alloc(ATLAS_W * ATLAS_H * 4);
  const inside = (x, y) => x >= 0 && y >= 0 && x < ATLAS_W && y < ATLAS_H && alpha[y * ATLAS_W + x] > 96;
  for (let y = 0; y < ATLAS_H; y += 1)
    for (let x = 0; x < ATLAS_W; x += 1) {
      if (!inside(x, y)) continue;
      const edge = !inside(x - 1, y) || !inside(x + 1, y) || !inside(x, y - 1) || !inside(x, y + 1);
      const lit = !inside(x - 1, y) || !inside(x, y - 1);
      const i = (y * ATLAS_W + x) * 4;
      if (edge) raw.set(lit ? [255, 226, 150, 255] : [170, 120, 50, 255], i);
      else raw.set([140, 216, 255, 72], i);
    }
  return applyMask(raw, mask);
}

// --- The module ------------------------------------------------------------------------
const list = (values) => `[${values.join(", ")}]`;
function moduleText({ seams, boxes, bytes }) {
  const src = (name) => `${DIR}/${name}.webp`;
  const seamLines = Object.entries(seams)
    .map(([id, value]) => `  ${JSON.stringify(id)}:\n    ${JSON.stringify(value)},`)
    .join("\n");
  const boxLines = Object.entries(boxes)
    .map(([id, box]) => `  ${JSON.stringify(id)}: ${list(box)},`)
    .join("\n");
  return `// Generated by scripts/build-rexonance-nanites.mjs — do not edit by hand.
// The Rexonance nanite kit (owner, 2026-10-16: 「超大幅な改善で。」): Blender-
// rendered hex nanite chips, comets, clamps, latches, scan planes, molten
// droplets, shock rings and the gold guideway conduit, with each plate's
// real outline (seams) and gold box. ${FILES.length} files, ${bytes.total} bytes.

/** The kit's folder (public/). */
export const REXONANCE_NANITE_DIR = ${JSON.stringify(DIR)} as const;

/** The swarm's tones, sRGB. */
export const REXONANCE_NANITE_TONES = {
  ice: ${list(TONES.ice)},
  pink: ${list(TONES.pink)},
  white: ${list(TONES.white)},
  gold: ${list(TONES.gold)},
} as const;

/** The hex nanite chip (a bevelled hex prism with an emissive core, Cycles).
 * Tone index t (tones). Tumble: source (32f, 32t, 32, 32), f 0–23 about the
 * axis (0.45, 0.8, 0.4), f0 (lockFrame) the face-on lock pose, f9–f15 its
 * dark back with a lit seam. Mip: (mip.x[t] + 16f, mip.y[t], 16, 16), the
 * same frames at 16 px (draw ≤ 12 device px from it). Unfold, t < 3:
 * (unfold.x[t] + 32k, unfold.y, 32, 32), k 0–6, the hex flattening into a
 * square slab (k0 = tumble f0; k6 ≥ 28 × 28 px opaque, core at 20%).
 * Bokeh: (bokeh.x[t], bokeh.y[t], 32, 32), f0 defocused (σ 3.6 px, ×1.6).
 * Bead: (bead.x + 32k, bead.y, 32, 32), k 0–7, a wobbling molten gold bead.
 * Spark: (spark.x + 32k, spark.y, 32, 32), k 0–3, a 4-point star from its
 * largest and brightest; centre pixel (16, 16). */
export const REXONANCE_NANITE_CELLS = {
  src: ${JSON.stringify(src("cells"))},
  width: ${SIZE.cells[0]},
  height: ${SIZE.cells[1]},
  cell: ${CELL},
  frames: ${FRAMES},
  lockFrame: 0,
  tones: { ice: 0, pink: 1, white: 2, gold: 3 },
  mip: { cell: ${MIP.cell}, x: ${list(MIP.x)}, y: ${list(MIP.y)} },
  unfold: { y: ${UNFOLD.y}, frames: ${UNFOLD.frames}, x: ${list(UNFOLD.x)} },
  bokeh: { x: ${list(BOKEH.x)}, y: ${list(BOKEH.y)} },
  bead: { x: ${BEAD.x}, y: ${BEAD.y}, frames: ${BEAD.frames} },
  spark: { x: ${SPARK.x}, y: ${SPARK.y}, frames: ${SPARK.frames} },
} as const;

/** Pre-rotated comet streaks (no per-sprite rotation). Source (32a,
 * 32 · (rows[tone] + length), 32, 32): a the direction of motion a · 22.5°
 * clockwise from +x on screen (y down), length 0 short (tail 8 px) or 1 long
 * (tail 15 px). The head is the brightest pixel, (16, 16): draw centred on
 * it, scaled uniformly by k = ℓ / tail[length]. */
export const REXONANCE_NANITE_COMETS = {
  src: ${JSON.stringify(src("comets"))},
  width: ${SIZE.comets[0]},
  height: ${SIZE.comets[1]},
  cell: ${COMET.cell},
  angles: ${COMET.angles},
  step: ${COMET.step},
  rows: { ice: ${COMET.rows.ice}, pink: ${COMET.rows.pink}, gold: ${COMET.rows.gold} },
  tail: ${list(COMET.tail)},
  head: ${list(COMET.head)},
} as const;

/** The 3D effects sheet (Cycles; the scan plane Eevee).
 * clamp: source (x + 48f, y + 48 · corners[corner], 48, 48), f 0–11; frames
 * [swing) swing in (75° → 0 about the view axis, 35° tilt, ×1.45 → 1, from
 * 0.5 out along the outward diagonal; the first three fade in), [bite) bite
 * (the arms 0.06 in, the ice LED 0.6 → 3). Place anchor[corner] (the L's
 * inner corner) ON that gold-box corner; the arms run along the box's edges.
 * latch: (x + 48f, y, 48, 48), centre (24, 24) on the seat: a gunmetal iris
 * ring with an ice ring and six gold claws pointing in; [idle) turns 0 → 50°
 * (frame 6 would be 60° = frame 0, so idle loops), [bite) the claws close
 * (0.95 → 0.40, u²) as the ice ring brightens 1 → 3.
 * scan: (x, y, w, h), a perspective ice grid plane receding upward from its
 * bright leading edge on row edgeY (a soft lip of light beneath it).
 * drop: (x + 24a, y + 24e, 24, 24), a molten gold droplet whose long axis is
 * a · 22.5° clockwise from +x on screen (symmetric under 180°), elongation
 * elongations[e]; centred in its cell.
 * shock: frame k at (x + w · (k mod cols), y + h · ⌊k / cols⌋, w, h), k 0–9, a
 * ring of light in the ground plane seen 22° from above, expanding and
 * fading to transparent (never to black), with flung shards; centre (the
 * contact point) at (96, 36). */
export const REXONANCE_NANITE_FX = {
  src: ${JSON.stringify(src("fx"))},
  width: ${SIZE.fx[0]},
  height: ${SIZE.fx[1]},
  clamp: {
    x: ${FX.clamp.x},
    y: ${FX.clamp.y},
    cell: ${FX.clamp.cell},
    frames: ${FX.clamp.frames},
    swing: ${list(FX.clamp.swing)},
    bite: ${list(FX.clamp.bite)},
    corners: { tl: 0, tr: 1, bl: 2, br: 3 },
    anchor: { tl: ${list(FX.clamp.anchor.tl)}, tr: ${list(FX.clamp.anchor.tr)}, bl: ${list(FX.clamp.anchor.bl)}, br: ${list(FX.clamp.anchor.br)} },
  },
  latch: {
    x: ${FX.latch.x},
    y: ${FX.latch.y},
    cell: ${FX.latch.cell},
    frames: ${FX.latch.frames},
    idle: ${list(FX.latch.idle)},
    bite: ${list(FX.latch.bite)},
    centre: ${list(FX.latch.centre)},
  },
  scan: { x: ${FX.scan.x}, y: ${FX.scan.y}, w: ${FX.scan.w}, h: ${FX.scan.h}, edgeY: ${FX.scan.edgeY} },
  drop: {
    x: ${FX.drop.x},
    y: ${FX.drop.y},
    cell: ${FX.drop.cell},
    angles: ${FX.drop.angles},
    step: ${FX.drop.step},
    elongations: ${list(FX.drop.elongations.map((v) => v.toFixed(1)))},
  },
  shock: {
    x: ${FX.shock.x},
    y: ${FX.shock.y},
    w: ${FX.shock.w},
    h: ${FX.shock.h},
    frames: ${FX.shock.frames},
    cols: ${FX.shock.cols},
    centre: ${list(FX.shock.centre)},
  },
} as const;

/** The gold guideway conduit, in ATLAS space — the frame of
 * REXONANCE_SUIT_GOLD_ATLAS: each non-driver plate's conduit (gold rails lit
 * from the upper left with an ice rim, hard-light glass, a glowing ice
 * channel) in its own cell (ax, ay, w, h), clipped to that cell and to its
 * gold (alpha 0 where gold.webp's alpha ≤ 32, dilated by 2 px). Draw a plate
 * with drawImage(sheet, ax, ay, w, h, x, y, w, h). */
export const REXONANCE_NANITE_GUIDE = {
  src: ${JSON.stringify(src("guide"))},
  width: ${SIZE.guide[0]},
  height: ${SIZE.guide[1]},
} as const;

/** Each non-driver plate's real outline, in figure px: base64 of Int16
 * little-endian [loopCount, n0, x, y, …, n1, x, y, …], coordinates in
 * QUARTER figure px (value / 4). At most 3 loops — loop 0 the largest, the
 * others islands of more than 40 px² — and 128 points; each loop runs with
 * the plate on its right as seen on screen (clockwise, y down) and starts at
 * its point nearest the plate's seat. */
export const REXONANCE_NANITE_SEAMS: Readonly<Record<string, string>> = {
${seamLines}
} as const;

/** Each non-driver plate's gold box [x, y, w, h], figure px: the bounds of
 * its REXONANCE_SUIT_GOLD_CELLS cells (4 px), within the plate's box. */
export const REXONANCE_NANITE_GOLD_BOXES: Readonly<
  Record<string, readonly [number, number, number, number]>
> = {
${boxLines}
} as const;

/** The kit's files, in the order to fetch them (the call's warm-up). */
export const REXONANCE_NANITE_ASSETS = [
  REXONANCE_NANITE_CELLS.src,
  REXONANCE_NANITE_COMETS.src,
  REXONANCE_NANITE_FX.src,
  REXONANCE_NANITE_GUIDE.src,
] as const;

/** The files' bytes. */
export const REXONANCE_NANITE_BYTES = {
  cells: ${bytes.cells},
  comets: ${bytes.comets},
  fx: ${bytes.fx},
  guide: ${bytes.guide},
  total: ${bytes.total},
} as const;

/** The suit files the guide and the seams were built from (the first 16 hex
 * of their sha256): a rebuilt suit fails --check until this kit is rebuilt. */
export const REXONANCE_NANITE_SOURCE = {
  gold: ${JSON.stringify(SOURCE.gold)},
  plates: ${JSON.stringify(SOURCE.plates)},
} as const;

/** The config bundle the scroll suit-up (SUIT_UP) and the call import. */
export const REXONANCE_NANITES = {
  cells: REXONANCE_NANITE_CELLS,
  comets: REXONANCE_NANITE_COMETS,
  fx: REXONANCE_NANITE_FX,
  guide: REXONANCE_NANITE_GUIDE,
  seams: REXONANCE_NANITE_SEAMS,
  goldBoxes: REXONANCE_NANITE_GOLD_BOXES,
} as const;
`;
}

// --- Main ---------------------------------------------------------------------------------
const { seams, report } = await buildSeams();
const boxes = buildGoldBoxes();
const comets = await encode("comets", await buildComets());
const filePath = (name) => join(OUT_DIR, `${name}.webp`);

if (CHECK) {
  const problems = [];
  const bytes = {};
  for (const name of FILES) {
    if (!existsSync(filePath(name))) {
      problems.push(`${name}.webp is missing`);
      continue;
    }
    const meta = await sharp(filePath(name)).metadata();
    if (meta.width !== SIZE[name][0] || meta.height !== SIZE[name][1] || meta.channels !== 4)
      problems.push(`${name}.webp is ${meta.width}x${meta.height}x${meta.channels}`);
    bytes[name] = statSync(filePath(name)).size;
    if (bytes[name] > BUDGET[name]) problems.push(`${name}.webp exceeds ${BUDGET[name]} B`);
  }
  bytes.total = FILES.reduce((sum, name) => sum + (bytes[name] ?? 0), 0);
  if (bytes.total > BUDGET.total) problems.push(`the kit exceeds ${BUDGET.total} B`);
  const extra = existsSync(OUT_DIR) ? readdirSync(OUT_DIR).filter((name) => !FILES.includes(name.replace(/\.webp$/, "")) || !name.endsWith(".webp")) : [];
  if (extra.length) problems.push(`stray files: ${extra.join(", ")}`);
  if (existsSync(filePath("comets")) && !readFileSync(filePath("comets")).equals(comets)) problems.push("comets.webp is stale");
  const expected = moduleText({ seams, boxes, bytes });
  if (!existsSync(MODULE) || readFileSync(MODULE, "utf8") !== expected) problems.push("src/lib/rexonance-nanites.ts is stale");
  if (problems.length) {
    console.error(problems.map((line) => `✗ ${line}`).join("\n"));
    process.exit(1);
  }
  console.log(`✓ the nanite kit matches its module (${bytes.total} B)`);
  process.exit(0);
}

mkdirSync(WORK, { recursive: true });
const sparks = await sparkCells();
const alpha = await goldAlpha();
const mask = guideMask(alpha);
const encoded = { comets };
let frames = null;
let guideRaw = null;
if (PLACEHOLDER) {
  frames = placeholderFrames();
  guideRaw = placeholderGuide(alpha, mask);
} else {
  if (BLENDER) {
    if (!existsSync(BLENDER)) throw new Error(`no Blender at ${BLENDER}`);
    const prep = join(WORK, "guide-prep.json");
    writeFileSync(prep, JSON.stringify(await guidePrep(alpha)));
    for (const dir of ["cells", "fx", "guide"]) mkdirSync(join(WORK, dir), { recursive: true });
    runBlender("nanite_cells.py", join(WORK, "cells"));
    runBlender("nanite_fx.py", join(WORK, "fx"));
    runBlender("nanite_guide.py", prep, join(WORK, "guide", "guide.png"));
  }
  const rendered = ["cells", "fx", "guide"].every((dir) => existsSync(join(WORK, dir)) && readdirSync(join(WORK, dir)).length);
  if (rendered) {
    const atCells = pngFrames(join(WORK, "cells"));
    const atFx = pngFrames(join(WORK, "fx"));
    frames = async (name) => ((/^(tumble|unfold|bead)-/.test(name) ? atCells : atFx)(name));
    guideRaw = await renderedGuide(mask);
  } else console.log("no renders in the work folder: cells, fx and guide stay as committed");
}
if (frames) {
  encoded.cells = await encode("cells", await packCells(frames, sparks));
  encoded.fx = await encode("fx", await packFx(frames, !PLACEHOLDER));
  // The flat placeholders' hard edges cost more than the renders' soft ones.
  if (PLACEHOLDER)
    for (const name of ["cells", "fx"])
      for (let quality = WEBP[name].quality - 6; encoded[name].length > BUDGET[name] && quality >= 40; quality -= 6)
        encoded[name] = await encode(name, await (name === "cells" ? packCells(frames, sparks) : packFx(frames, false)), { ...WEBP[name], quality });
  let quality = WEBP.guide.quality;
  for (;;) {
    encoded.guide = await encode("guide", guideRaw, { ...WEBP.guide, quality });
    if (encoded.guide.length <= BUDGET.guide || quality <= 64) break;
    quality -= 2;
  }
  if (quality !== WEBP.guide.quality) console.log(`guide.webp encoded at quality ${quality}`);
}
const bytes = {};
for (const name of FILES) {
  bytes[name] = encoded[name] ? encoded[name].length : existsSync(filePath(name)) ? statSync(filePath(name)).size : NaN;
  if (!(bytes[name] <= BUDGET[name])) throw new Error(`${name}.webp: ${bytes[name]} B (budget ${BUDGET[name]})`);
}
bytes.total = FILES.reduce((sum, name) => sum + bytes[name], 0);
if (bytes.total > BUDGET.total) throw new Error(`refusing to write: ${bytes.total} B exceeds ${BUDGET.total}`);
mkdirSync(OUT_DIR, { recursive: true });
for (const [name, buffer] of Object.entries(encoded)) writeFileSync(filePath(name), buffer);
mkdirSync(dirname(MODULE), { recursive: true });
writeFileSync(MODULE, moduleText({ seams, boxes, bytes }));
const widened = Object.entries(report).filter(([, r]) => r.epsilon > SEAM_EPSILON);
console.log(
  `wrote ${FILES.map((name) => `${name} ${bytes[name]}`).join(", ")} (total ${bytes.total} B); seams for ${Object.keys(seams).length} plates` +
    (widened.length ? ` (ε widened for ${widened.map(([id, r]) => `${id} ${r.epsilon.toFixed(2)}`).join(", ")})` : ""),
);
