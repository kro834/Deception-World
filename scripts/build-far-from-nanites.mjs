#!/usr/bin/env node
// Far From Saga's nanite kit B (owner, 2026-10-22: 「ファーフロムの変身はレクソナンス
// とほぼ同じですがナノマシンが別のものも使う様になり、二種類使うのでもう一種類を
// Blenderで生成して。」): the faceted crystal nanite, drawn mixed with kit A
// (Rexonance's hex chip, scripts/build-rexonance-nanites.mjs) by the same
// swarm code, so its sheet follows kit A's layout exactly. Reproducible:
//
//   node scripts/build-far-from-nanites.mjs [--blender=<binary>] [--check]
//     [--work=<dir>] [--debug=<dir>]
//
// writes public/far-from-nanites-20261022/cells.webp and the generated
// module src/lib/far-from-nanites.ts.
//
// - --blender=<binary>: renders scripts/blender/farfrom_nanite_cells.py
//   headless (Cycles: the first GPU backend found, else the CPU;
//   NANITE_CPU=1 forces the CPU), then packs and encodes the sheet. The
//   binary is either Blender itself (Blender 5.2 LTS, 4.2+: run as
//   `Blender -b --factory-startup -P <scene> -- <out>`) or a Python that
//   has Blender as a module (the bpy 5.2 wheel: `python <scene> -- <out>`);
//   `<binary> --version` tells them apart. ~2 s a frame on 4 CPU cores,
//   122 frames. The raw renders are kept in the work folder (--work=<dir>,
//   default <tmp>/far-from-nanites-work); they are not committed.
// - without --blender: rebuilds only the script-made parts. With the
//   renders still in the work folder it repacks cells.webp from them (the
//   bokeh and the spark are made here at pack time, the rest downsampled);
//   without them cells.webp stays as committed and only the module is
//   regenerated.
// - --check: writes nothing. Verifies the sheet (size, channels, budget, no
//   stray files), the layout (kit A's REXONANCE_NANITE_CELLS, key for key)
//   and the module (regenerated text, byte for byte); regenerates the
//   script-made cells — each tone's bokeh from the sheet's own lock pose,
//   the four spark frames — and diffs them against the sheet's (within the
//   lossy encoding: mean ≤ 2, worst pixel ≤ 40 of 255, premultiplied).
//   With the renders in the work folder it also repacks the whole sheet
//   and requires the committed file byte for byte.
// - --debug=<dir>: also writes the sheet, lossless, as <dir>/cells.png.
//
// Kit B has no comets of its own: the streaks are pure light in the tones
// both kits share (ice ≈ aqua, pink ≈ prism, gold), so the swarm draws kit
// A's (REXONANCE_NANITE_COMETS, the same rows for the same tone slots).
// It refuses to write a sheet over its budget (BUDGET).
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);
const sharp = require(process.env.SHARP_MODULE || "sharp");

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const VERSION = "20261022";
const DIR = `/far-from-nanites-${VERSION}`;
const OUT_DIR = join(ROOT, "public", DIR.slice(1));
const MODULE = join(ROOT, "src/lib/far-from-nanites.ts");
const SCENE = join(ROOT, "scripts/blender/farfrom_nanite_cells.py");

const arg = (name) => {
  const hit = process.argv.find((value) => value.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
};
const CHECK = process.argv.includes("--check");
const BLENDER = arg("blender");
const WORK = arg("work") || join(tmpdir(), "far-from-nanites-work");
const RENDERS = join(WORK, "cells");
const DEBUG = arg("debug");

// --- The contract: kit A's layout ------------------------------------------------
const kitA = await import(pathToFileURL(join(ROOT, "src/lib/rexonance-nanites.ts")).href);
const A = kitA.REXONANCE_NANITE_CELLS;
const SIZE = [A.width, A.height];
const CELL = A.cell;
const FRAMES = A.frames;
const { mip: MIP, unfold: UNFOLD, bokeh: BOKEH, bead: BEAD, spark: SPARK } = A;
// The swarm's tone slots (kit A's names, TN 0–3) and Far From's crystal in
// each: the mapping the module documents.
const SLOTS = ["ice", "pink", "white", "gold"];
const NAMES = { ice: "aqua", pink: "prism", white: "silver", gold: "gold" };
if (
  JSON.stringify(A.tones) !== JSON.stringify({ ice: 0, pink: 1, white: 2, gold: 3 }) ||
  A.lockFrame !== 0 ||
  A.frames !== 24
)
  throw new Error(
    "kit A's tone slots or frames changed: update the crystal's scene and this packer with them",
  );
// sRGB swatches: Far From's own stage accents where it has one
// (FAR_FROM_SAGA: middle #7fe6ff, max #c99bff, high #ffd77a) and its 白銀.
const TONES = {
  ice: [127, 230, 255],
  pink: [201, 155, 255],
  white: [236, 242, 252],
  gold: [255, 215, 122],
};
const BUDGET = { cells: 96_000, total: 96_000 };
const WEBP = { quality: 84, alphaQuality: 90, effort: 6 };

// --- Raster helpers (as kit A's) ------------------------------------------------------
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (edge, value, soft) => clamp01((edge - value) / soft + 0.5);
const mixColour = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
const WHITE = [255, 255, 255];

/** A straight-alpha float canvas; `over` composites premultiplied. */
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

// sharp premultiplies before it resizes: no dark fringe from the
// transparent pixels' (black) colour.
const downsample = (raw, width, height, toWidth, toHeight) =>
  sharp(raw, { raw: { width, height, channels: 4 } })
    .resize(toWidth, toHeight, { kernel: "lanczos3", fit: "fill" })
    .raw()
    .toBuffer();

const blit = (sheet, sheetWidth, cell, cellWidth, cellHeight, x, y) => {
  for (let j = 0; j < cellHeight; j += 1)
    cell.copy(sheet, ((y + j) * sheetWidth + x) * 4, j * cellWidth * 4, (j + 1) * cellWidth * 4);
};
const cut = (sheet, sheetWidth, x, y, w = CELL, h = CELL) => {
  const cell = Buffer.alloc(w * h * 4);
  for (let j = 0; j < h; j += 1)
    sheet.copy(cell, j * w * 4, ((y + j) * sheetWidth + x) * 4, ((y + j) * sheetWidth + x + w) * 4);
  return cell;
};

// --- Spark (script-made) -----------------------------------------------------------------
// The crystal's glint: an 8-point star on pixel (16, 16) — four arms of 15,
// 11, 7 and 3 px and four diagonal ones at 45% of that — a white core tinted
// aqua along the arms, the diagonals lilac (the prism's fire); frame 0 the
// largest and brightest.
const SS = 4;
const SPARK_ARMS = [15, 11, 7, 3];
const SPARK_GAIN = [1, 0.8, 0.6, 0.4];
async function sparkCells() {
  const size = CELL * SS;
  const cells = [];
  const diagonal = Math.SQRT1_2;
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
        let colour = WHITE;
        const u0 = (x + y) * diagonal;
        const v0 = (x - y) * diagonal;
        for (const [along, across, length, width, tint] of [
          [Math.abs(x), Math.abs(y), arm, 1.05, TONES.ice],
          [Math.abs(y), Math.abs(x), arm, 1.05, TONES.ice],
          [Math.abs(u0), Math.abs(v0), arm * 0.45, 0.7, TONES.pink],
          [Math.abs(v0), Math.abs(u0), arm * 0.45, 0.7, TONES.pink],
        ]) {
          if (along > length) continue;
          const u = along / length;
          const half = 0.15 + width * (1 - u);
          const a = smooth(half, across, 1 / SS) * (1 - u) ** 1.5;
          if (a > alpha) [alpha, colour] = [a, mixColour(WHITE, tint, Math.min(1, u * 1.4))];
        }
        const core = Math.exp(-(r * r) / (2 * 1.2 * 1.2));
        if (core > alpha) [alpha, colour] = [core, WHITE];
        plane.over(px, py, colour, clamp01(alpha * gain));
      }
    cells.push(await downsample(plane.toRaw(), size, size, CELL, CELL));
  }
  return cells;
}

// --- Bokeh (script-made, as kit A's) ------------------------------------------------------
// The face-on crystal, defocused: f0 shrunk to 72% (so the blur stays inside
// its cell), a Gaussian of σ 3.6 px in premultiplied light, 1.6x as bright.
function bokehCell(cell) {
  const n = CELL;
  const shrink = 0.72;
  const premul = new Float32Array(n * n * 4);
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
  const kernel = Array.from({ length: radius * 2 + 1 }, (_, i) =>
    Math.exp(-((i - radius) ** 2) / (2 * sigma * sigma)),
  );
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
          for (let c = 0; c < 4; c += 1)
            out[(y * n + x) * 4 + c] += src[(yy * n + xx) * 4 + c] * wgt;
        }
    return out;
  };
  const blurred = pass(pass(premul, true), false);
  const raw = Buffer.alloc(n * n * 4);
  for (let i = 0; i < n * n; i += 1) {
    const a = blurred[i * 4 + 3];
    if (a <= 0) continue;
    for (let c = 0; c < 3; c += 1)
      raw[i * 4 + c] = Math.round(Math.min(255, (blurred[i * 4 + c] * 1.6) / a));
    raw[i * 4 + 3] = Math.round(Math.min(255, a * 255));
  }
  return raw;
}

// --- Packing (kit A's alpha handling) -------------------------------------------------------
// Faint pixels' colours, unpremultiplied from a few levels of alpha, are
// rounding noise: below alpha 48 a pixel takes its neighbourhood's
// alpha-weighted colour, and fully transparent pixels carry no colour.
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

// Below alpha 4 a pixel is lanczos ringing or stray coverage: cleared.
const ALPHA_FLOOR = 4;
const floorAlpha = (raw) => {
  for (let i = 3; i < raw.length; i += 4)
    if (raw[i] < ALPHA_FLOOR) raw[i] = raw[i - 1] = raw[i - 2] = raw[i - 3] = 0;
  return raw;
};

async function encode(sheet, options) {
  const [width, height] = SIZE;
  const raw = bleed(floorAlpha(Buffer.from(sheet)), width, height);
  if (DEBUG) {
    mkdirSync(DEBUG, { recursive: true });
    await sharp(raw, { raw: { width, height, channels: 4 } })
      .png()
      .toFile(join(DEBUG, "cells.png"));
  }
  return sharp(raw, { raw: { width, height, channels: 4 } })
    .webp({ smartSubsample: true, ...options })
    .toBuffer();
}

// Over budget at the contract's settings, the alpha's quality steps down
// first (90 → 65), then the colour's.
async function encodeWithin(sheet) {
  const ladder = [];
  for (let alphaQuality = WEBP.alphaQuality; alphaQuality >= 65; alphaQuality -= 5)
    ladder.push({ ...WEBP, alphaQuality });
  for (let quality = WEBP.quality - 4; quality >= 40; quality -= 4)
    ladder.push({ ...WEBP, alphaQuality: 65, quality });
  for (const options of ladder) {
    const buffer = await encode(sheet, options);
    if (buffer.length <= BUDGET.cells) {
      if (options !== ladder[0])
        console.log(
          `cells.webp encoded at quality ${options.quality}, alpha ${options.alphaQuality}`,
        );
      return buffer;
    }
  }
  throw new Error(`cells.webp exceeds ${BUDGET.cells} B at every setting`);
}

const frameNames = () => {
  const names = [];
  for (const slot of SLOTS)
    for (let f = 0; f < FRAMES; f += 1)
      names.push(`tumble-${NAMES[slot]}-${String(f).padStart(2, "0")}`);
  for (const slot of SLOTS.slice(0, 3))
    for (let k = 1; k < UNFOLD.frames; k += 1) names.push(`unfold-${NAMES[slot]}-${k}`);
  for (let k = 0; k < BEAD.frames; k += 1) names.push(`bead-${k}`);
  return names;
};

const pngFrames = (dir) => async (name) => {
  const { data, info } = await sharp(join(dir, `${name}.png`))
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { raw: data, size: info.width };
};

/** cells.webp's pixels from the per-frame renders (128 px PNGs). */
async function packCells(frameAt) {
  const [width, height] = SIZE;
  const sheet = Buffer.alloc(width * height * 4);
  const f0 = [];
  for (const [t, slot] of SLOTS.entries())
    for (let f = 0; f < FRAMES; f += 1) {
      const { raw, size } = await frameAt(`tumble-${NAMES[slot]}-${String(f).padStart(2, "0")}`);
      const big = await downsample(raw, size, size, CELL, CELL);
      const small = await downsample(raw, size, size, MIP.cell, MIP.cell);
      blit(sheet, width, big, CELL, CELL, f * CELL, t * CELL);
      blit(sheet, width, small, MIP.cell, MIP.cell, MIP.x[t] + f * MIP.cell, MIP.y[t]);
      if (f === 0) f0[t] = big;
    }
  for (const [t, slot] of SLOTS.slice(0, 3).entries())
    for (let k = 0; k < UNFOLD.frames; k += 1) {
      // k0 is the lock pose itself (tumble f0).
      let cell = f0[t];
      if (k) {
        const { raw, size } = await frameAt(`unfold-${NAMES[slot]}-${k}`);
        cell = await downsample(raw, size, size, CELL, CELL);
      }
      blit(sheet, width, cell, CELL, CELL, UNFOLD.x[t] + k * CELL, UNFOLD.y);
    }
  for (let t = 0; t < 4; t += 1)
    blit(sheet, width, bokehCell(f0[t]), CELL, CELL, BOKEH.x[t], BOKEH.y[t]);
  for (let k = 0; k < BEAD.frames; k += 1) {
    const { raw, size } = await frameAt(`bead-${k}`);
    blit(
      sheet,
      width,
      await downsample(raw, size, size, CELL, CELL),
      CELL,
      CELL,
      BEAD.x + k * CELL,
      BEAD.y,
    );
  }
  const sparks = await sparkCells();
  for (let k = 0; k < SPARK.frames; k += 1)
    blit(sheet, width, sparks[k], CELL, CELL, SPARK.x + k * CELL, SPARK.y);
  return sheet;
}

// --- Blender ---------------------------------------------------------------------------
function blenderCommand(binary) {
  const probe = spawnSync(binary, ["--version"], { encoding: "utf8" });
  const text = `${probe.stdout ?? ""}${probe.stderr ?? ""}`;
  if (/^Blender \d/m.test(text))
    return (args) => [binary, ["-b", "--factory-startup", "-P", SCENE, "--", ...args]];
  if (/^Python 3/m.test(text)) {
    const bpy = spawnSync(binary, ["-c", "import bpy; print(bpy.app.version_string)"], {
      encoding: "utf8",
    });
    if (bpy.status !== 0) throw new Error(`${binary} is a Python without Blender's bpy module`);
    return (args) => [binary, [SCENE, "--", ...args]];
  }
  throw new Error(
    `${binary} is neither Blender nor a Python with bpy (${text.trim().split("\n")[0] || probe.error})`,
  );
}

function render() {
  if (!existsSync(BLENDER)) throw new Error(`no Blender at ${BLENDER}`);
  mkdirSync(RENDERS, { recursive: true });
  const [command, args] = blenderCommand(BLENDER)([RENDERS]);
  const started = Date.now();
  const result = spawnSync(command, args, {
    stdio: ["ignore", "pipe", "pipe"],
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
  });
  const log = `${result.stdout}\n${result.stderr}`;
  writeFileSync(join(WORK, "farfrom_nanite_cells.log"), log);
  if (result.status !== 0 || !/NANITE-DONE/.test(log))
    throw new Error(
      `farfrom_nanite_cells.py failed (status ${result.status}); see ${join(WORK, "farfrom_nanite_cells.log")}`,
    );
  console.log(`farfrom_nanite_cells.py: ${((Date.now() - started) / 1000).toFixed(1)} s`);
}

const rendered = () =>
  existsSync(RENDERS) && frameNames().every((name) => existsSync(join(RENDERS, `${name}.png`)));

// --- The module ------------------------------------------------------------------------
const list = (values) => `[${values.join(", ")}]`;
function moduleText(bytes) {
  return `// Generated by scripts/build-far-from-nanites.mjs — do not edit by hand.
// Far From Saga's nanite kit B (owner, 2026-10-22: 「ファーフロムの変身はレクソナンス
// とほぼ同じですがナノマシンが別のものも使う様になり、二種類使うのでもう一種類を
// Blenderで生成して。」): the Blender-rendered faceted crystal nanite, laid out
// exactly as kit A's hex chip (REXONANCE_NANITE_CELLS: the same keys, cell,
// frames, tone slots and sub-sheets), so the swarm draws both kinds mixed
// through the same sprite code. Kit B has no comets of its own: draw kit A's
// (REXONANCE_NANITE_COMETS, the same rows for the same tone slots). 1 file,
// ${bytes.total} bytes.

/** The kit's folder (public/). */
export const FAR_FROM_NANITE_DIR = ${JSON.stringify(DIR)} as const;

/** The swarm's tones, sRGB, by kit A's tone slots (the swarm's TN 0–3):
 * ice → the aqua crystal (水色の透明な結晶; FAR_FROM_SAGA middle #7fe6ff),
 * pink → the prism crystal (虹色の中枢: lilac glass, rainbow fire and core;
 * max #c99bff), white → the silver crystal (白銀: colourless, white-hot
 * core), gold → the gold crystal (黄金: amber glass in a black-silver
 * collar; high #ffd77a). */
export const FAR_FROM_NANITE_TONES = {
  ice: ${list(TONES.ice)},
  pink: ${list(TONES.pink)},
  white: ${list(TONES.white)},
  gold: ${list(TONES.gold)},
} as const;

/** Far From's name for the crystal in each tone slot. */
export const FAR_FROM_NANITE_TONE_NAMES = {
  ice: ${JSON.stringify(NAMES.ice)},
  pink: ${JSON.stringify(NAMES.pink)},
  white: ${JSON.stringify(NAMES.white)},
  gold: ${JSON.stringify(NAMES.gold)},
} as const;

/** The crystal nanite (Cycles): a tall rhombic crystal, its sides drawn in
 * to sharp tips, with a faceted crown and table, a thin gold collar round
 * its girdle (black-silver on the gold crystal) and a small core glowing
 * in a gold ring under the table; its pavilion black-silver outside.
 * Tone index t (tones). Tumble: source (32f, 32t, 32, 32), f 0–23,
 * R_f = Rz(7.5° f) · Ry(15° f): it flips once about its long axis while
 * turning half a revolution in the image plane (its 180° symmetry closes
 * the loop), f0 (lockFrame) upright and face-on, f9–f15 its black-silver
 * back with a lit seam. Mip: (mip.x[t] + 16f, mip.y[t], 16, 16), the same
 * frames at 16 px (draw ≤ 12 device px from it). Unfold, t < 3:
 * (unfold.x[t] + 32k, unfold.y, 32, 32), k 0–6, the crystal opening into a
 * flat square plate framed by its collar (k0 = tumble f0; k6 ≥ 28 × 28 px
 * opaque, core at 20%). Bokeh: (bokeh.x[t], bokeh.y[t], 32, 32), f0
 * defocused (σ 3.6 px, ×1.6). Bead: (bead.x + 32k, bead.y, 32, 32), k 0–7,
 * a wobbling molten gold bead. Spark: (spark.x + 32k, spark.y, 32, 32), k
 * 0–3, an 8-point crystal glint from its largest and brightest; centre
 * pixel (16, 16). */
export const FAR_FROM_NANITE_CELLS = {
  src: ${JSON.stringify(`${DIR}/cells.webp`)},
  width: ${SIZE[0]},
  height: ${SIZE[1]},
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

/** The kit's files, in the order to fetch them (the call's warm-up). */
export const FAR_FROM_NANITE_ASSETS = [FAR_FROM_NANITE_CELLS.src] as const;

/** The files' bytes. */
export const FAR_FROM_NANITE_BYTES = {
  cells: ${bytes.cells},
  total: ${bytes.total},
} as const;
`;
}

// --- Main ---------------------------------------------------------------------------------
const FILE = join(OUT_DIR, "cells.webp");
const decodeSheet = async (input) =>
  (await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true })).data;

/** Mean and worst premultiplied difference of two cells (0–255). */
function difference(a, b) {
  let [sum, worst] = [0, 0];
  for (let i = 0; i < a.length; i += 4) {
    const [aa, ba] = [a[i + 3] / 255, b[i + 3] / 255];
    for (let c = 0; c < 3; c += 1) {
      const d = Math.abs(a[i + c] * aa - b[i + c] * ba);
      sum += d;
      worst = Math.max(worst, d);
    }
    const d = Math.abs(a[i + 3] - b[i + 3]);
    sum += d;
    worst = Math.max(worst, d);
  }
  return { mean: sum / a.length, worst };
}

if (CHECK) {
  const problems = [];
  const bytes = {};
  if (!existsSync(FILE)) problems.push("cells.webp is missing");
  else {
    const meta = await sharp(FILE).metadata();
    if (
      meta.format !== "webp" ||
      meta.width !== SIZE[0] ||
      meta.height !== SIZE[1] ||
      meta.channels !== 4
    )
      problems.push(`cells.webp is ${meta.format} ${meta.width}x${meta.height}x${meta.channels}`);
    bytes.cells = statSync(FILE).size;
    if (bytes.cells > BUDGET.cells) problems.push(`cells.webp exceeds ${BUDGET.cells} B`);
  }
  bytes.total = bytes.cells ?? 0;
  if (bytes.total > BUDGET.total) problems.push(`the kit exceeds ${BUDGET.total} B`);
  const stray = existsSync(OUT_DIR)
    ? readdirSync(OUT_DIR).filter((name) => name !== "cells.webp")
    : [];
  if (stray.length) problems.push(`stray files: ${stray.join(", ")}`);
  if (!existsSync(MODULE) || readFileSync(MODULE, "utf8") !== moduleText(bytes))
    problems.push("src/lib/far-from-nanites.ts is stale");
  if (existsSync(FILE)) {
    const sheet = await decodeSheet(FILE);
    const [width] = SIZE;
    const sparks = await sparkCells();
    const regenerated = [
      ...[0, 1, 2, 3].map((t) => [
        `bokeh ${t}`,
        bokehCell(cut(sheet, width, 0, CELL * t)),
        cut(sheet, width, BOKEH.x[t], BOKEH.y[t]),
      ]),
      ...sparks.map((cell, k) => [
        `spark ${k}`,
        cell,
        cut(sheet, width, SPARK.x + CELL * k, SPARK.y),
      ]),
    ];
    for (const [name, expected, actual] of regenerated) {
      const { mean, worst } = difference(expected, actual);
      if (mean > 2 || worst > 40)
        problems.push(
          `${name} differs from its regeneration (mean ${mean.toFixed(2)}, worst ${worst.toFixed(0)})`,
        );
    }
    if (rendered()) {
      const repacked = await encodeWithin(await packCells(pngFrames(RENDERS)));
      if (!repacked.equals(readFileSync(FILE)))
        problems.push(`cells.webp differs from a repack of the renders in ${RENDERS}`);
      else console.log(`✓ cells.webp is the repack of ${RENDERS}, byte for byte`);
    }
  }
  if (problems.length) {
    console.error(problems.map((line) => `✗ ${line}`).join("\n"));
    process.exit(1);
  }
  console.log(`✓ the crystal kit matches its module and kit A's layout (${bytes.total} B)`);
  process.exit(0);
}

mkdirSync(WORK, { recursive: true });
if (BLENDER) render();
let encoded = null;
if (rendered()) encoded = await encodeWithin(await packCells(pngFrames(RENDERS)));
else console.log(`no renders in ${RENDERS}: cells.webp stays as committed`);
const bytes = { cells: encoded ? encoded.length : existsSync(FILE) ? statSync(FILE).size : NaN };
bytes.total = bytes.cells;
if (!(bytes.cells <= BUDGET.cells))
  throw new Error(`cells.webp: ${bytes.cells} B (budget ${BUDGET.cells})`);
mkdirSync(OUT_DIR, { recursive: true });
if (encoded) writeFileSync(FILE, encoded);
mkdirSync(dirname(MODULE), { recursive: true });
writeFileSync(MODULE, moduleText(bytes));
console.log(
  `wrote ${encoded ? `cells.webp ${bytes.cells} B and ` : ""}src/lib/far-from-nanites.ts`,
);
