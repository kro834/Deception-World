#!/usr/bin/env node
// Kit C: the ファーフロム・ウルトラ nanite kit (owner, 2026-10-22: 「ファーフロム・ウルトラ
// だけ体全身が白に染まった後、さらにナノマシンにより追加部分が生成された後、…コンピュータの
// 様な補助インターフェースが腕の外などに展開されます。ウルトラだけ未来的で特殊なシークエンス
// で、更に別のナノマシンも使うのでBlenderでこれも生成してください。」). Reproducible:
//
//   node scripts/build-far-from-ultra-nanites.mjs [--blender=<Blender binary | Python with bpy>]
//     [--check] [--work=<dir>] [--debug=<dir>] [--contact=<dir>]
//
// writes public/far-from-nanites-ultra-20261022/{cells,comets}.webp and the
// generated module src/lib/far-from-nanites-ultra.ts.
//
// - --blender=<path>: renders scripts/blender/farfrom_ultra_nanite_cells.py
//   headless (Cycles: the first GPU backend found, else the CPU; NANITE_CPU=1
//   forces the CPU), then packs and encodes the sheets. <path> is either a
//   Blender binary (run as `-b --factory-startup -P <script> -- …`) or a
//   Python interpreter whose site-packages hold the bpy module (its basename
//   python*, run as `python -I <script> -- …`; e.g. a venv with `pip install
//   bpy`). The raw 128 px renders stay in the work folder (--work=<dir>,
//   default <tmp>/far-from-ultra-nanites-work); they are not committed.
// - without --blender: packs cells.webp again when the renders are still in
//   the work folder; otherwise regenerates only the script-made parts —
//   comets.webp and the module — around the committed cells.webp.
// - --check: verifies the module against the files (dimensions, budgets,
//   BYTES, no stray files, comets.webp byte for byte, the module's text) and
//   writes nothing. It reads only committed files: deterministic.
// - --debug=<dir>: also writes each sheet, lossless, as <dir>/<name>.png.
// - --contact=<dir>: also writes <dir>/contact.png, the shipped cells.webp
//   zoomed 4x over Ultra's night and over white, with its rows at 12 and 20
//   px as the swarm draws them.
//
// The layout is kit A's (REXONANCE_NANITE_CELLS, REXONANCE_NANITE_COMETS),
// read from src/lib/rexonance-nanites.ts: the Ultra sequence draws kit C
// through kit A's sprite code (createAssemblyNanites' `kit`), cell for
// cell. A kit A whose layout changes fails --check here until this kit is
// rebuilt. It refuses to write when the files exceed their budgets.
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);
const sharp = require(process.env.SHARP_MODULE || "sharp");

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const VERSION = "20261022";
const DIR = `/far-from-nanites-ultra-${VERSION}`;
const OUT_DIR = join(ROOT, "public", DIR.slice(1));
const MODULE = join(ROOT, "src/lib/far-from-nanites-ultra.ts");
const BLENDER_DIR = join(ROOT, "scripts/blender");
const SCRIPT = "farfrom_ultra_nanite_cells.py";

const arg = (name) => {
  const hit = process.argv.find((value) => value.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
};
const CHECK = process.argv.includes("--check");
const BLENDER = arg("blender");
const WORK = arg("work") || join(tmpdir(), "far-from-ultra-nanites-work");
const DEBUG = arg("debug");
const CONTACT = arg("contact");

// --- The contract: kit A's layout ---------------------------------------------------
const kitA = await import(pathToFileURL(join(ROOT, "src/lib/rexonance-nanites.ts")).href);
const A = kitA.REXONANCE_NANITE_CELLS;
const AC = kitA.REXONANCE_NANITE_COMETS;
const FILES = ["cells", "comets"];
const SIZE = { cells: [A.width, A.height], comets: [AC.width, AC.height] };
// Kit C's own ceiling (the brief: under ~300 KB in all).
const BUDGET = { cells: 96_000, comets: 14_000, total: 110_000 };
const WEBP = {
  // White ceramic and thin lit lines: more colour quality than kit A's 80.
  cells: { quality: 90, alphaQuality: 100, effort: 6 },
  comets: { quality: 80, alphaQuality: 90, effort: 6 },
};
// The tones, sRGB: each unit's light (its reticle ring, lens, seams and
// glyph). Slot t — the row the sprite code addresses — is kit A's: aqua in
// ice's slot, violet-blue in pink's, white in white's, gold in gold's.
const TONES = {
  aqua: [84, 232, 248],
  violet: [140, 126, 255],
  white: [246, 250, 255],
  gold: [255, 204, 122],
};
const TONE_NAMES = ["aqua", "violet", "white", "gold"];
const CELL = A.cell;
const FRAMES = A.frames;
const MIP = A.mip;
const UNFOLD = A.unfold;
const BOKEH = A.bokeh;
const BEAD = A.bead;
const SPARK = A.spark;
// The comets' rows keep kit A's slot names (the sprite code reads
// rows.ice, rows.pink and rows.gold): ice the aqua streak, pink the
// violet-blue one, gold the gold one.
const COMET = { cell: AC.cell, angles: AC.angles, step: AC.step, rows: AC.rows, tail: AC.tail, head: AC.head };
const COMET_TONES = { ice: TONES.aqua, pink: TONES.violet, gold: TONES.gold };

// --- Raster helpers ------------------------------------------------------------------
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (edge, value, soft) => clamp01((edge - value) / soft + 0.5);
const mixColour = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
const WHITE = [255, 255, 255];
const SS = 4;

/** A straight-alpha float canvas; `over` composites premultiplied "over". */
class Plane {
  constructor(width, height) {
    this.width = width;
    this.height = height;
    this.rgb = new Float32Array(width * height * 3); // premultiplied
    this.a = new Float32Array(width * height);
  }
  over(x, y, [r, g, b], alpha) {
    if (alpha <= 0) return;
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

// sharp premultiplies before it resamples: no dark fringe from the resize.
const downsample = (raw, width, height, toWidth, toHeight) =>
  sharp(raw, { raw: { width, height, channels: 4 } })
    .resize(toWidth, toHeight, { kernel: "lanczos3", fit: "fill" })
    .raw()
    .toBuffer();

const blit = (sheet, sheetWidth, cell, cellWidth, cellHeight, x, y) => {
  for (let j = 0; j < cellHeight; j += 1)
    cell.copy(sheet, ((y + j) * sheetWidth + x) * 4, j * cellWidth * 4, (j + 1) * cellWidth * 4);
};

// --- Comets (script-made): data streaks ------------------------------------------------
// 32 px cells at 4x, downsampled with lanczos3. The head (the brightest
// point) is a small rhombus pointing along the motion, mix(tone, white,
// 0.6), with a 0.75 px hot centre on pixel (16, 16); behind it along -θ a
// faint trail and three packets of light — short capsules at 30, 58 and 84%
// of the tail, dimming — so the streak reads as data in flight, not kit A's
// smooth comet.
const PACKETS = [0.3, 0.58, 0.84];
function cometCell(tone, angle, length) {
  const size = COMET.cell * SS;
  const plane = new Plane(size, size);
  const theta = (angle * COMET.step * Math.PI) / 180;
  const [dx, dy] = [Math.cos(theta), Math.sin(theta)];
  const [hx, hy] = [COMET.head[0] + 0.5, COMET.head[1] + 0.5];
  const head = mixColour(tone, WHITE, 0.6);
  const core = mixColour(tone, WHITE, 0.92);
  const packets = PACKETS.map((f) => f * length);
  for (let py = 0; py < size; py += 1)
    for (let px = 0; px < size; px += 1) {
      const x = (px + 0.5) / SS - hx;
      const y = (py + 0.5) / SS - hy;
      const ahead = x * dx + y * dy;
      const across = Math.abs(x * dy - y * dx);
      const along = -ahead;
      if (along >= 0) {
        const trail = smooth(0.45, across, 1 / SS) * smooth(length, along, 1 / SS) * 0.4 * Math.exp((-2 * along) / length);
        let packet = 0;
        for (const p of packets) {
          const cover = smooth(0.75, across, 1 / SS) * smooth(0.95, Math.abs(along - p), 1 / SS) * (1 - (0.6 * p) / length);
          if (cover > packet) packet = cover;
        }
        plane.over(px, py, tone, Math.max(trail, packet));
      }
      plane.over(px, py, head, smooth(1, Math.abs(ahead) / 2.1 + across / 1.35, 1 / (SS * 1.4)));
      plane.over(px, py, core, smooth(0.75, Math.hypot(x, y), 1 / SS));
    }
  return plane.toRaw();
}
async function buildComets() {
  const [width, height] = SIZE.comets;
  const sheet = Buffer.alloc(width * height * 4);
  for (const [slot, row] of Object.entries(COMET.rows))
    for (let length = 0; length < 2; length += 1)
      for (let angle = 0; angle < COMET.angles; angle += 1) {
        const tone = COMET_TONES[slot];
        const big = cometCell(tone, angle, COMET.tail[length]);
        const cell = await downsample(big, COMET.cell * SS, COMET.cell * SS, COMET.cell, COMET.cell);
        // Every colour lies on the line tone → white: snap it there (the
        // faint fringe's unpremultiplied rounding noise would cost bytes).
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

// --- Spark (script-made): the Ultra star -----------------------------------------------
// An eight-point star on pixel (16, 16), as the starbursts in Ultra's orbs:
// a long cross of 15, 11, 7 and 3 px tinted aqua toward its tips, short
// diagonals (45% as long) tinted violet-blue, a white core, and on k0-k1 a
// thin halo ring; k0 the largest and brightest.
const SPARK_ARMS = [15, 11, 7, 3];
const SPARK_GAIN = [1, 0.8, 0.6, 0.4];
const SPARK_HALO = [0.42, 0.22, 0, 0];
async function sparkCells() {
  const size = CELL * SS;
  const cells = [];
  for (let frame = 0; frame < SPARK.frames; frame += 1) {
    const plane = new Plane(size, size);
    const arm = SPARK_ARMS[frame];
    const gain = SPARK_GAIN[frame];
    const halo = arm * 0.5;
    for (let py = 0; py < size; py += 1)
      for (let px = 0; px < size; px += 1) {
        const x = (px + 0.5) / SS - 16.5;
        const y = (py + 0.5) / SS - 16.5;
        const r = Math.hypot(x, y);
        let alpha = 0;
        let colour = WHITE;
        const ray = (along, across, length, width, tint) => {
          if (along > length) return;
          const u = along / length;
          const a = smooth(0.12 + width * (1 - u), across, 1 / SS) * (1 - u) ** 1.5;
          if (a > alpha) [alpha, colour] = [a, mixColour(WHITE, tint, Math.min(1, u * 1.4))];
        };
        ray(Math.abs(x), Math.abs(y), arm, 1.05, TONES.aqua);
        ray(Math.abs(y), Math.abs(x), arm, 1.05, TONES.aqua);
        const [d1, d2] = [Math.abs(x + y) / Math.SQRT2, Math.abs(x - y) / Math.SQRT2];
        ray(d1, d2, arm * 0.45, 0.7, TONES.violet);
        ray(d2, d1, arm * 0.45, 0.7, TONES.violet);
        const ring = SPARK_HALO[frame] * smooth(0.45, Math.abs(r - halo), 1 / SS);
        if (ring > alpha) [alpha, colour] = [ring, mixColour(TONES.aqua, WHITE, 0.45)];
        const core = Math.exp(-(r * r) / (2 * 1.2 * 1.2));
        if (core > alpha) [alpha, colour] = [core, WHITE];
        plane.over(px, py, colour, clamp01(alpha * gain));
      }
    cells.push(await downsample(plane.toRaw(), size, size, CELL, CELL));
  }
  return cells;
}

// --- Bokeh -----------------------------------------------------------------------------
// The face-on unit defocused through a round aperture: f0 shrunk to 72% (so
// the blur stays inside its cell), convolved in premultiplied light with a
// disc of radius 3.6 px (its edge anti-aliased) — a lens's bokeh disc, its
// rim lit by the reticle — then 1.5x as bright and tinted 40% toward the
// unit's tone (the white ceramic alone would blur every slot to white).
const BOKEH_RADIUS = 3.6;
const BOKEH_GAIN = 1.5;
const BOKEH_TINT = 0.4;
function bokehCell(cell, tone) {
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
  const reach = Math.ceil(BOKEH_RADIUS + 1);
  const kernel = [];
  for (let j = -reach; j <= reach; j += 1)
    for (let i = -reach; i <= reach; i += 1) {
      const w = clamp01(BOKEH_RADIUS + 0.5 - Math.hypot(i, j));
      if (w > 0) kernel.push([i, j, w]);
    }
  const total = kernel.reduce((sum, [, , w]) => sum + w, 0);
  const raw = Buffer.alloc(n * n * 4);
  for (let y = 0; y < n; y += 1)
    for (let x = 0; x < n; x += 1) {
      const sum = [0, 0, 0, 0];
      for (const [i, j, w] of kernel) {
        const xx = x + i;
        const yy = y + j;
        if (xx < 0 || yy < 0 || xx >= n || yy >= n) continue;
        for (let c = 0; c < 4; c += 1) sum[c] += premul[(yy * n + xx) * 4 + c] * w;
      }
      const a = sum[3] / total;
      if (a <= 0) continue;
      const o = (y * n + x) * 4;
      for (let c = 0; c < 3; c += 1) {
        const lit = Math.min(255, ((sum[c] / total) * BOKEH_GAIN) / a);
        raw[o + c] = Math.round(lit + (tone[c] - lit) * BOKEH_TINT);
      }
      raw[o + 3] = Math.round(Math.min(255, a * 255));
    }
  return raw;
}

// --- Packing ---------------------------------------------------------------------------
// As kit A: below alpha 48 a pixel takes its neighbourhood's alpha-weighted
// colour (no unpremultiplied rounding noise, no dark fringe), and fully
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

// Below these alphas a pixel is lanczos ringing or a render's stray
// coverage (at most 1.6% light): cleared, it costs nothing.
const ALPHA_FLOOR = { cells: 4, comets: 0 };
const floorAlpha = (raw, floor) => {
  if (floor)
    for (let i = 3; i < raw.length; i += 4) if (raw[i] < floor) raw[i] = raw[i - 1] = raw[i - 2] = raw[i - 3] = 0;
  return raw;
};

const encode = async (name, source, options = WEBP[name]) => {
  const [width, height] = SIZE[name];
  const raw = bleed(floorAlpha(Buffer.from(source), ALPHA_FLOOR[name]), width, height);
  if (DEBUG) {
    mkdirSync(DEBUG, { recursive: true });
    await sharp(raw, { raw: { width, height, channels: 4 } }).png().toFile(join(DEBUG, `${name}.png`));
  }
  return sharp(raw, { raw: { width, height, channels: 4 } })
    .webp({ smartSubsample: true, ...options })
    .toBuffer();
};

/** cells.webp from the per-frame renders (128 px PNGs). */
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
  for (const [t, tone] of TONE_NAMES.slice(0, UNFOLD.x.length).entries())
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
  for (let t = 0; t < TONE_NAMES.length; t += 1) blit(sheet, width, bokehCell(f0[t], TONES[TONE_NAMES[t]]), CELL, CELL, BOKEH.x[t], BOKEH.y[t]);
  for (let k = 0; k < BEAD.frames; k += 1) {
    const { raw, size } = await frameAt(`bead-${k}`);
    blit(sheet, width, await downsample(raw, size, size, CELL, CELL), CELL, CELL, BEAD.x + k * CELL, BEAD.y);
  }
  for (let k = 0; k < SPARK.frames; k += 1) blit(sheet, width, sparks[k], CELL, CELL, SPARK.x + k * CELL, SPARK.y);
  return sheet;
}

// --- Blender ---------------------------------------------------------------------------
/** A Blender binary, or a Python interpreter that imports bpy (by its name). */
const isPython = (path) => /^python[\d.]*(\.exe)?$/i.test(basename(path));
function runBlender(script, ...args) {
  const started = Date.now();
  const path = join(BLENDER_DIR, script);
  // -I: the bpy module's Python must not import from the script's or the
  // working folder (a stray copy.py there would shadow the standard library).
  const argv = isPython(BLENDER) ? ["-I", path, "--", ...args] : ["-b", "--factory-startup", "-P", path, "--", ...args];
  const result = spawnSync(BLENDER, argv, {
    cwd: WORK,
    stdio: ["ignore", "pipe", "pipe"],
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
  });
  const log = `${result.stdout}\n${result.stderr}`;
  writeFileSync(join(WORK, `${script}.log`), log);
  if (result.status !== 0 || !/NANITE-DONE/.test(log))
    throw new Error(`${script} failed (status ${result.status}); see ${join(WORK, `${script}.log`)}`);
  const device = log.match(/NANITE device (\S+)/)?.[1] ?? "?";
  console.log(`${script}: ${((Date.now() - started) / 1000).toFixed(1)} s (${isPython(BLENDER) ? "bpy module" : "Blender"}, ${device})`);
}

const pngFrames = (dir) => async (name) => {
  const { data, info } = await sharp(join(dir, `${name}.png`)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { raw: data, size: info.width, height: info.height };
};

// --- The contact sheet -------------------------------------------------------------------
// The shipped sheet 4x (nearest) over Ultra's night and over white, then
// every tone's tumble at 20 px (from its 32 px cells) and at 12 px (from its
// mips), as the swarm draws them (bilinear).
const NIGHT = [10, 13, 32];
const PAPER = [242, 244, 250];
async function contactSheet(cellsWebp, path) {
  const { data, info } = await sharp(cellsWebp).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height } = info;
  const zoom = 4;
  const flatten = (raw, w, h, bg) => {
    const out = Buffer.alloc(w * h * 3);
    for (let i = 0; i < w * h; i += 1) {
      const a = raw[i * 4 + 3] / 255;
      for (let c = 0; c < 3; c += 1) out[i * 3 + c] = Math.round(raw[i * 4 + c] * a + bg[c] * (1 - a));
    }
    return out;
  };
  const panels = [];
  for (const bg of [NIGHT, PAPER]) {
    const big = await sharp(data, { raw: { width, height, channels: 4 } })
      .resize(width * zoom, height * zoom, { kernel: "nearest" })
      .raw()
      .toBuffer();
    panels.push({ raw: flatten(big, width * zoom, height * zoom, bg), w: width * zoom, h: height * zoom });
  }
  for (const [px, from, cell] of [
    [20, "tumble", CELL],
    [12, "mip", MIP.cell],
  ])
    for (const bg of [NIGHT, PAPER]) {
      const pitch = px + 6;
      const w = FRAMES * pitch + 6;
      const h = TONE_NAMES.length * pitch + 6;
      const strip = Buffer.alloc(w * h * 4);
      for (let t = 0; t < TONE_NAMES.length; t += 1)
        for (let f = 0; f < FRAMES; f += 1) {
          const [sx, sy] = from === "tumble" ? [f * CELL, t * CELL] : [MIP.x[t] + f * MIP.cell, MIP.y[t]];
          const src = await sharp(data, { raw: { width, height, channels: 4 } })
            .extract({ left: sx, top: sy, width: cell, height: cell })
            .resize(px, px, { kernel: "linear" })
            .raw()
            .toBuffer();
          blit(strip, w, src, px, px, 6 + f * pitch, 6 + t * pitch);
        }
      panels.push({ raw: flatten(strip, w, h, bg), w, h });
    }
  const W = Math.max(...panels.map((p) => p.w)) + 32;
  const H = panels.reduce((sum, p) => sum + p.h + 16, 16);
  const canvas = Buffer.alloc(W * H * 3, 48);
  let y = 16;
  for (const p of panels) {
    for (let j = 0; j < p.h; j += 1) p.raw.copy(canvas, ((y + j) * W + 16) * 3, j * p.w * 3, (j + 1) * p.w * 3);
    y += p.h + 16;
  }
  mkdirSync(dirname(path), { recursive: true });
  await sharp(canvas, { raw: { width: W, height: H, channels: 3 } }).png().toFile(path);
  console.log(`contact sheet: ${path}`);
}

// --- The module ------------------------------------------------------------------------
const list = (values) => `[${values.join(", ")}]`;
function moduleText(bytes) {
  const src = (name) => `${DIR}/${name}.webp`;
  return `// Generated by scripts/build-far-from-ultra-nanites.mjs — do not edit by hand.
// Kit C, the ファーフロム・ウルトラ nanite kit (owner, 2026-10-22: 「…更に別のナノマシン
// も使うのでBlenderでこれも生成してください。」): the Ultra-only unit, rendered in
// Blender (scripts/blender/farfrom_ultra_nanite_cells.py, Cycles), in kit A's
// exact layout (REXONANCE_NANITE_CELLS, REXONANCE_NANITE_COMETS), so the
// Ultra sequence draws it through kit A's sprite code: pass
// { ...REXONANCE_NANITES, ...FAR_FROM_ULTRA_NANITES } as createAssemblyNanites'
// \`kit\`, and these sheets as its \`sprites\`. No fx sheet of its own (kit A's
// REXONANCE_NANITE_FX serves). ${FILES.length} files, ${bytes.total} bytes.
import type { RexonanceAssemblyNanites } from "./rexonance-resonance";

/** The kit's folder (public/). */
export const FAR_FROM_ULTRA_NANITE_DIR = ${JSON.stringify(DIR)} as const;

/** The units' light, sRGB: their reticle ring, lens, seams and glyph. Each
 * sits in kit A's slot (FAR_FROM_ULTRA_NANITE_CELLS.tones): aqua in ice's
 * (0), violet-blue in pink's (1), white in white's (2: the chips kit A's
 * code draws newborn, and in its docking rivers), gold in gold's (3, no
 * unfold). */
export const FAR_FROM_ULTRA_NANITE_TONES = {
  aqua: ${list(TONES.aqua)},
  violet: ${list(TONES.violet)},
  white: ${list(TONES.white)},
  gold: ${list(TONES.gold)},
} as const;

/** The Ultra unit (not kit A's machined hex chip, nor kit B's crystal
 * shard): a round white-ceramic puck with a gold rim inlay, its tone's
 * HUD reticle — four lit arcs, gaps on the cardinal points — in a dark
 * channel, a gold-bezelled lens white-hot at its heart, and a graphite back
 * parted from the face by a lit equator seam (Cycles). The gold unit (t 3)
 * is gold-plated with a warm-white reticle. Tone index t (tones; slots as
 * kit A's). Tumble: source (32f, 32t, 32, 32), f 0–23 about the axis
 * (0.45, 0.8, 0.4), f0 (lockFrame) the face-on lock pose, f9–f15 its dark
 * back with a lit seam ring; the reticle turns one arc (90°) over the loop.
 * Mip: (mip.x[t] + 16f, mip.y[t], 16, 16), the same frames at 16 px (draw
 * ≤ 12 device px from it). Unfold, t < 3: (unfold.x[t] + 32k, unfold.y,
 * 32, 32), k 0–6, the puck squaring into a data tile — its face floods from
 * the core outward into the tone's lit glass, a circuit glyph lights
 * behind that front, the reticle becomes the tile's corner brackets and
 * the rim its gold frame (k0 = tumble f0; k6 ≥ 28 × 28 px opaque, lens at
 * 20%). Bokeh: (bokeh.x[t], bokeh.y[t], 32, 32), f0 defocused through a
 * round aperture (disc r ${BOKEH_RADIUS} px, ×${BOKEH_GAIN}, ${BOKEH_TINT * 100}% its tone). Bead: (bead.x + 32k, bead.y, 32, 32),
 * k 0–7, a wobbling bead of liquid gold light. Spark: (spark.x + 32k,
 * spark.y, 32, 32), k 0–3, an eight-point Ultra star (an aqua cross,
 * violet-blue diagonals, a halo ring on k0–1) from its largest and
 * brightest; centre pixel (16, 16). */
export const FAR_FROM_ULTRA_NANITE_CELLS = {
  src: ${JSON.stringify(src("cells"))},
  width: ${SIZE.cells[0]},
  height: ${SIZE.cells[1]},
  cell: ${CELL},
  frames: ${FRAMES},
  lockFrame: ${A.lockFrame},
  tones: { ${TONE_NAMES.map((name, t) => `${name}: ${t}`).join(", ")} },
  mip: { cell: ${MIP.cell}, x: ${list(MIP.x)}, y: ${list(MIP.y)} },
  unfold: { y: ${UNFOLD.y}, frames: ${UNFOLD.frames}, x: ${list(UNFOLD.x)} },
  bokeh: { x: ${list(BOKEH.x)}, y: ${list(BOKEH.y)} },
  bead: { x: ${BEAD.x}, y: ${BEAD.y}, frames: ${BEAD.frames} },
  spark: { x: ${SPARK.x}, y: ${SPARK.y}, frames: ${SPARK.frames} },
} as const;

/** Pre-rotated data streaks (kit A's comet layout): source (32a,
 * 32 · (rows[slot] + length), 32, 32), a the direction of motion a · 22.5°
 * clockwise from +x on screen (y down), length 0 short (tail 8 px) or 1 long
 * (tail 15 px). Rows keep kit A's slot names, which the sprite code reads:
 * ice the aqua streak, pink the violet-blue one, gold the gold one (white
 * units streak aqua). The head — a small rhombus along the motion — is the
 * brightest pixel, (16, 16): draw centred on it, scaled uniformly by k =
 * ℓ / tail[length]; behind it a faint trail and three packets of light. */
export const FAR_FROM_ULTRA_NANITE_COMETS = {
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

/** The kit's files, in the order to fetch them. */
export const FAR_FROM_ULTRA_NANITE_ASSETS = [
  FAR_FROM_ULTRA_NANITE_CELLS.src,
  FAR_FROM_ULTRA_NANITE_COMETS.src,
] as const;

/** The files' bytes. */
export const FAR_FROM_ULTRA_NANITE_BYTES = {
  cells: ${bytes.cells},
  comets: ${bytes.comets},
  total: ${bytes.total},
} as const;

/** Kit C's sheets for createAssemblyNanites' \`kit\`, over kit A's
 * (REXONANCE_NANITES supplies fx). The typecheck holds them to the sprite
 * code's kit type: they drop in where kit A's do. */
export const FAR_FROM_ULTRA_NANITES = {
  cells: FAR_FROM_ULTRA_NANITE_CELLS,
  comets: FAR_FROM_ULTRA_NANITE_COMETS,
} as const satisfies Pick<RexonanceAssemblyNanites, "cells" | "comets">;
`;
}

// --- Main ---------------------------------------------------------------------------------
const filePath = (name) => join(OUT_DIR, `${name}.webp`);
const comets = await encode("comets", await buildComets());

if (CHECK) {
  const problems = [];
  const bytes = {};
  for (const name of FILES) {
    if (!existsSync(filePath(name))) {
      problems.push(`${name}.webp is missing`);
      continue;
    }
    const meta = await sharp(filePath(name)).metadata();
    if (meta.format !== "webp" || meta.width !== SIZE[name][0] || meta.height !== SIZE[name][1] || meta.channels !== 4)
      problems.push(`${name}.webp is ${meta.format} ${meta.width}x${meta.height}x${meta.channels}`);
    bytes[name] = statSync(filePath(name)).size;
    if (bytes[name] > BUDGET[name]) problems.push(`${name}.webp exceeds ${BUDGET[name]} B`);
  }
  bytes.total = FILES.reduce((sum, name) => sum + (bytes[name] ?? 0), 0);
  if (bytes.total > BUDGET.total) problems.push(`the kit exceeds ${BUDGET.total} B`);
  const extra = existsSync(OUT_DIR) ? readdirSync(OUT_DIR).filter((name) => !FILES.map((file) => `${file}.webp`).includes(name)) : [];
  if (extra.length) problems.push(`stray files: ${extra.join(", ")}`);
  if (existsSync(filePath("comets")) && !readFileSync(filePath("comets")).equals(comets)) problems.push("comets.webp is stale");
  if (!existsSync(MODULE) || readFileSync(MODULE, "utf8") !== moduleText(bytes)) problems.push("src/lib/far-from-nanites-ultra.ts is stale");
  if (problems.length) {
    console.error(problems.map((line) => `✗ ${line}`).join("\n"));
    process.exit(1);
  }
  console.log(`✓ kit C matches its module (${bytes.total} B)`);
  process.exit(0);
}

mkdirSync(WORK, { recursive: true });
const RENDERS = join(WORK, "cells");
if (BLENDER) {
  if (!existsSync(BLENDER)) throw new Error(`no Blender at ${BLENDER}`);
  mkdirSync(RENDERS, { recursive: true });
  runBlender(SCRIPT, RENDERS);
}
const encoded = { comets };
if (existsSync(RENDERS) && readdirSync(RENDERS).some((name) => name.endsWith(".png"))) {
  const sheet = await packCells(pngFrames(RENDERS), await sparkCells());
  // Over budget at the contract's settings, the alpha's quality steps down
  // first, then the colour's: the sheet reports what it used.
  const ladder = [];
  for (let alphaQuality = WEBP.cells.alphaQuality; alphaQuality >= 70; alphaQuality -= 10) ladder.push({ ...WEBP.cells, alphaQuality });
  for (let quality = WEBP.cells.quality - 4; quality >= 60; quality -= 4) ladder.push({ ...WEBP.cells, alphaQuality: 70, quality });
  for (const options of ladder) {
    encoded.cells = await encode("cells", sheet, options);
    if (encoded.cells.length <= BUDGET.cells) {
      if (options !== ladder[0]) console.log(`cells.webp encoded at quality ${options.quality}, alpha ${options.alphaQuality}`);
      break;
    }
  }
} else console.log(`no renders in ${RENDERS}: cells.webp stays as committed`);
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
writeFileSync(MODULE, moduleText(bytes));
if (CONTACT) await contactSheet(readFileSync(filePath("cells")), join(CONTACT, "contact.png"));
console.log(`wrote ${FILES.map((name) => `${name} ${bytes[name]}`).join(", ")} (total ${bytes.total} B)`);
