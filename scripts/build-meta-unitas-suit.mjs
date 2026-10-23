#!/usr/bin/env node
// META UNITAS SAGA (2026-10-23): the scroll suit-up's raster parts, cut from
// the owner's two transparent cutouts (design/meta-unitas-saga-20261023/
// cutouts/middle.webp and ultra.webp, 1024 x 1536, one frame: the helix, the
// buckle and the soles meet pixel for pixel, so no registration is needed;
// the build checks it). Reproducible:
//
//   node scripts/build-meta-unitas-suit.mjs --sam-prompts      (SAM's prompts)
//   <tools>/sam/venv/bin/python -I scripts/sam/make_masks.py --site meta-unitas-middle --model <…>
//   <tools>/sam/venv/bin/python -I scripts/sam/make_masks.py --site meta-unitas-ultra --model <…>
//   node scripts/build-meta-unitas-suit.mjs [--debug=<dir>]
//
// The plates are SAM's (owner, 2026-10-23: 「装甲切り出しはSAMを用いて」): the
// regions and clips of scripts/meta-unitas-suit-regions.mjs are only SAM's
// prompts; the masks it writes (design/meta-unitas-saga-20261023/sam-masks/
// <form>/plates/*.png with a manifest) are what this build cuts by, so it
// stays reproducible without SAM. The driver keeps its traced outline and
// claims first. Every figure pixel belongs to exactly one plate: the build
// normalises the masks' shares, gives an unclaimed pixel to the plate nearest
// it, and fails if any opaque pixel is left without one.
//
// The scene (src/lib/meta-unitas-partition.ts) draws, per form, at the figure
// height 1040 px (693 x 1040, the whole frame, never cropped):
//   <form>-figure.webp  the finished figure (the still tiers' picture, and
//                        what the scene settles on);
//   <form>-plates.webp  each plate's art in one atlas, premultiplied box-
//                        filtered on the figure grid (no dark fringe);
//   middle-lit.webp     ミドル's plates as light (the same atlas places): the
//                        single glowing whole, each plate rimmed in orange;
//   <form>-seams.webp   the boundaries between the plates, in orange;
//   middle-glow.webp    the whole as one soft light (before it partitions);
//   undersuit.webp      Rexonance's undersuit (the same wearer, 月城悠真),
//                        composited so its soles and reactor meet ミドル's soles
//                        and helix.
// and the generated module src/lib/meta-unitas-suit.ts lists the plates.
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  META_UNITAS_BELTS,
  META_UNITAS_MARKS,
  META_UNITAS_REGIONS,
} from "./meta-unitas-suit-regions.mjs";

const require = createRequire(import.meta.url);
const sharp = require(process.env.SHARP_MODULE || "sharp");
const ROOT = fileURLToPath(new URL("..", import.meta.url));
const importTs = (path) => import(pathToFileURL(join(ROOT, path)).href);

const VERSION = "20261023";
const DESIGN = join(ROOT, `design/meta-unitas-saga-${VERSION}`);
const SAM_ROOT = join(DESIGN, "sam-masks");
const OUT_DIR = join(ROOT, `public/meta-unitas-suit-${VERSION}/`);
const PUBLIC_PATH = `/meta-unitas-suit-${VERSION}`;
const MODULE = join(ROOT, "src/lib/meta-unitas-suit.ts");
const FORMS = ["middle", "ultra"];
const CUTOUT = (form) => `design/meta-unitas-saga-${VERSION}/cutouts/${form}.webp`;
const W = 1024;
const H = 1536;
const FIG_H = 1040;
const SCALE = FIG_H / H;
const FIG_W = Math.round(W * SCALE);
const debugArg = process.argv.find((arg) => arg.startsWith("--debug="));
const DEBUG = debugArg ? debugArg.slice("--debug=".length) : null;

// --- SAM's prompts --------------------------------------------------------------
if (process.argv.includes("--sam-prompts")) {
  for (const form of FORMS) {
    const dir = join(SAM_ROOT, form);
    mkdirSync(dir, { recursive: true });
    const regions = META_UNITAS_REGIONS[form];
    const prompts = {
      site: `meta-unitas-${form}`,
      generatedBy: "scripts/build-meta-unitas-suit.mjs --sam-prompts",
      frame: [W, H],
      images: { full: CUTOUT(form) },
      ornamentGroups: [],
      regions: regions.map(({ id, group, poly }) => ({ id, group, poly })),
      splits: Object.fromEntries(
        regions.map((region) => [
          region.id,
          region.plates.map((plate) => ({
            id: plate.id,
            clip: plate.clip,
            dir: "up",
            group: region.group,
          })),
        ]),
      ),
      belt: { region: "belt", outline: [META_UNITAS_BELTS[form]] },
      marks: META_UNITAS_MARKS,
    };
    writeFileSync(join(dir, "prompts.json"), `${JSON.stringify(prompts)}\n`);
    console.log(`wrote ${join(dir, "prompts.json")}`);
  }
  process.exit(0);
}

// --- The pictures -------------------------------------------------------------------
const readRgba = async (path) => {
  const { data, info } = await sharp(path)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  if (info.width !== W || info.height !== H)
    throw new Error(`${path}: ${info.width}x${info.height}, expected ${W}x${H}`);
  return data;
};
const readGrey = async (path) => {
  const { data, info } = await sharp(path).greyscale().raw().toBuffer({ resolveWithObject: true });
  if (info.width !== W || info.height !== H) throw new Error(`${path}: not the frame`);
  return data;
};

/** Point in polygon (even-odd). */
function inside(points, x, y) {
  let hit = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [xi, yi] = points[i];
    const [xj, yj] = points[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}
/** A polygon's coverage of the frame (4 x 4 samples per pixel, 0..1). */
function rasterise(points) {
  const out = new Float32Array(W * H);
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  const x0 = Math.max(0, Math.floor(Math.min(...xs)));
  const x1 = Math.min(W - 1, Math.ceil(Math.max(...xs)));
  const y0 = Math.max(0, Math.floor(Math.min(...ys)));
  const y1 = Math.min(H - 1, Math.ceil(Math.max(...ys)));
  for (let y = y0; y <= y1; y += 1)
    for (let x = x0; x <= x1; x += 1) {
      let n = 0;
      for (let sy = 0; sy < 4; sy += 1)
        for (let sx = 0; sx < 4; sx += 1)
          if (inside(points, x + (sx + 0.5) / 4, y + (sy + 0.5) / 4)) n += 1;
      out[y * W + x] = n / 16;
    }
  return out;
}

const groupOf = (form, id) => {
  if (id === "driver") return "driver";
  for (const region of META_UNITAS_REGIONS[form])
    if (region.plates.some((plate) => plate.id === id)) return region.group;
  throw new Error(`${form}: plate ${id} is in no region`);
};

const fig = (v) => v * SCALE;
const MARKS = {
  helix: META_UNITAS_MARKS.helix.map(fig),
  visor: META_UNITAS_MARKS.visor.map(fig),
  belt: META_UNITAS_MARKS.belt.map(fig),
  halo: Object.fromEntries(Object.entries(META_UNITAS_MARKS.halo).map(([k, v]) => [k, fig(v)])),
  manusPivot: Object.fromEntries(
    Object.entries(META_UNITAS_MARKS.manusPivot).map(([k, v]) => [k, v.map(fig)]),
  ),
};
const round1 = (v) => Math.round(v * 10) / 10;

rmSync(OUT_DIR, { recursive: true, force: true });
mkdirSync(OUT_DIR, { recursive: true });
const files = [];
async function writeWebp(name, raw, width, height, options = {}) {
  const path = join(OUT_DIR, name);
  const info = await sharp(raw, { raw: { width, height, channels: 4 } })
    .webp({ quality: 82, alphaQuality: 90, effort: 6, smartSubsample: true, ...options })
    .toFile(path);
  files.push([name, info.size]);
  return `${PUBLIC_PATH}/${name}`;
}

/** The light the whole is made of (figure px → rgb): white-gold at the helix,
 * teal toward the limbs (ミドル's palette; a moderate light, never white). */
function lightAt(x, y) {
  const d = Math.hypot(x - MARKS.helix[0], (y - MARKS.helix[1]) * 0.8) / FIG_H;
  const k = Math.exp(-((d / 0.26) ** 2));
  const teal = [52, 176, 186];
  const warm = [255, 226, 176];
  return teal.map((c, i) => Math.round(c + (warm[i] - c) * k * 0.82));
}
const RIM = [255, 150, 62];

const built = {};
for (const form of FORMS) {
  const rgba = await readRgba(join(ROOT, CUTOUT(form)));
  const dir = join(SAM_ROOT, form);
  const manifest = JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8"));
  const ids = Object.keys(manifest.plates).sort();
  const belt = rasterise(META_UNITAS_BELTS[form]);
  const weights = [];
  for (const id of ids) {
    const grey = await readGrey(join(dir, "plates", `${id}.png`));
    const w = new Float32Array(W * H);
    for (let i = 0; i < W * H; i += 1) w[i] = (grey[i] / 255) * (1 - belt[i]);
    weights.push(w);
  }
  ids.push("driver");
  weights.push(belt);
  // Every opaque pixel to exactly one share of plates: normalised, and a
  // pixel no mask reaches goes whole to the plate nearest it.
  const n = ids.length;
  const owner = new Int16Array(W * H).fill(-1);
  for (let i = 0; i < W * H; i += 1) {
    let best = -1;
    let bestW = 0;
    for (let k = 0; k < n; k += 1)
      if (weights[k][i] > bestW) {
        bestW = weights[k][i];
        best = k;
      }
    if (bestW > 1e-3) owner[i] = best;
  }
  let holes = 0;
  {
    // Breadth-first from the owned pixels over the whole frame (a stray
    // faint pixel apart from the figure still finds the plate nearest it);
    // an opaque pixel no mask reached takes that plate whole.
    let frontier = [];
    for (let i = 0; i < W * H; i += 1) if (owner[i] >= 0) frontier.push(i);
    for (let i = 0; i < W * H; i += 1) if (rgba[i * 4 + 3] > 0 && owner[i] < 0) holes += 1;
    const need = (i) => owner[i] < 0;
    while (frontier.length) {
      const next = [];
      for (const i of frontier) {
        const x = i % W;
        const y = (i / W) | 0;
        for (const [dx, dy] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ]) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          const j = ny * W + nx;
          if (!need(j)) continue;
          owner[j] = owner[i];
          if (rgba[j * 4 + 3] > 0) weights[owner[i]][j] = 1;
          next.push(j);
        }
      }
      frontier = next;
    }
  }
  for (let i = 0; i < W * H; i += 1) {
    if (rgba[i * 4 + 3] <= 0) continue;
    let sum = 0;
    for (let k = 0; k < n; k += 1) sum += weights[k][i];
    if (sum <= 0) throw new Error(`${form}: pixel ${i % W},${(i / W) | 0} belongs to no plate`);
    for (let k = 0; k < n; k += 1) weights[k][i] /= sum;
  }

  // The plates on the figure grid: premultiplied, box-filtered (each frame
  // pixel's area shared out over the figure pixels it covers), so the plates
  // add up to the figure exactly and no edge carries another plate's colour.
  const boxes = ids.map(() => [Infinity, Infinity, -Infinity, -Infinity]);
  for (let i = 0; i < W * H; i += 1) {
    if (rgba[i * 4 + 3] <= 0) continue;
    const x = i % W;
    const y = (i / W) | 0;
    for (let k = 0; k < n; k += 1) {
      if (weights[k][i] <= 0) continue;
      const b = boxes[k];
      if (x < b[0]) b[0] = x;
      if (y < b[1]) b[1] = y;
      if (x > b[2]) b[2] = x;
      if (y > b[3]) b[3] = y;
    }
  }
  const plates = ids.map((id, k) => {
    const [bx0, by0, bx1, by1] = boxes[k];
    const fx0 = Math.max(0, Math.floor(bx0 * SCALE) - 1);
    const fy0 = Math.max(0, Math.floor(by0 * SCALE) - 1);
    const fx1 = Math.min(FIG_W, Math.ceil((bx1 + 1) * SCALE) + 1);
    const fy1 = Math.min(FIG_H, Math.ceil((by1 + 1) * SCALE) + 1);
    return {
      id,
      k,
      x: fx0,
      y: fy0,
      w: fx1 - fx0,
      h: fy1 - fy0,
      acc: new Float32Array((fx1 - fx0) * (fy1 - fy0) * 4),
    };
  });
  const whole = new Float32Array(FIG_W * FIG_H * 4);
  for (let y = 0; y < H; y += 1) {
    const sy0 = y * SCALE;
    const sy1 = (y + 1) * SCALE;
    const ry = Math.floor(sy0);
    const splitY = Math.min(sy1, ry + 1);
    const rows = [
      [ry, splitY - sy0],
      [ry + 1, sy1 - splitY],
    ];
    for (let x = 0; x < W; x += 1) {
      const i = y * W + x;
      const a = rgba[i * 4 + 3] / 255;
      if (a <= 0) continue;
      const sx0 = x * SCALE;
      const sx1 = (x + 1) * SCALE;
      const rx = Math.floor(sx0);
      const splitX = Math.min(sx1, rx + 1);
      const cols = [
        [rx, splitX - sx0],
        [rx + 1, sx1 - splitX],
      ];
      const r = rgba[i * 4] * a;
      const g = rgba[i * 4 + 1] * a;
      const bl = rgba[i * 4 + 2] * a;
      for (const [fy, wy] of rows) {
        if (wy <= 1e-6 || fy >= FIG_H) continue;
        for (const [fx, wx] of cols) {
          if (wx <= 1e-6 || fx >= FIG_W) continue;
          const area = wx * wy;
          const o = (fy * FIG_W + fx) * 4;
          whole[o] += r * area;
          whole[o + 1] += g * area;
          whole[o + 2] += bl * area;
          whole[o + 3] += a * area;
          for (let k = 0; k < n; k += 1) {
            const share = weights[k][i];
            if (share <= 0) continue;
            const p = plates[k];
            const q = ((fy - p.y) * p.w + (fx - p.x)) * 4;
            const s = share * area;
            p.acc[q] += r * s;
            p.acc[q + 1] += g * s;
            p.acc[q + 2] += bl * s;
            p.acc[q + 3] += a * s;
          }
        }
      }
    }
  }
  const unpremultiply = (acc, length) => {
    const out = Buffer.alloc(length * 4);
    for (let i = 0; i < length; i += 1) {
      const a = acc[i * 4 + 3];
      if (a <= 1e-4) continue;
      out[i * 4] = Math.min(255, Math.round(acc[i * 4] / a));
      out[i * 4 + 1] = Math.min(255, Math.round(acc[i * 4 + 1] / a));
      out[i * 4 + 2] = Math.min(255, Math.round(acc[i * 4 + 2] / a));
      out[i * 4 + 3] = Math.min(255, Math.round(a * 255));
    }
    return out;
  };
  const figureRaw = unpremultiply(whole, FIG_W * FIG_H);
  const figure = await writeWebp(`${form}-figure.webp`, figureRaw, FIG_W, FIG_H, { quality: 80 });

  // The atlas: shelves, tallest first, 2 px apart.
  const ATLAS_W = 1024;
  const order = [...plates]
    .filter((p) => p.w > 0 && p.h > 0)
    .sort((a, b) => b.h - a.h || b.w - a.w);
  let cx = 0;
  let cy = 0;
  let shelf = 0;
  for (const p of order) {
    if (cx + p.w > ATLAS_W) {
      cx = 0;
      cy += shelf + 2;
      shelf = 0;
    }
    p.ax = cx;
    p.ay = cy;
    cx += p.w + 2;
    shelf = Math.max(shelf, p.h);
  }
  const ATLAS_H = Math.ceil((cy + shelf) / 4) * 4;
  const atlas = Buffer.alloc(ATLAS_W * ATLAS_H * 4);
  const lit = Buffer.alloc(ATLAS_W * ATLAS_H * 4);
  const labelFig = new Int16Array(FIG_W * FIG_H).fill(-1);
  const bestFig = new Float32Array(FIG_W * FIG_H);
  for (const p of order) {
    const px = unpremultiply(p.acc, p.w * p.h);
    let sx = 0;
    let sy = 0;
    let sa = 0;
    for (let y = 0; y < p.h; y += 1)
      for (let x = 0; x < p.w; x += 1) {
        const i = y * p.w + x;
        const a = p.acc[i * 4 + 3];
        const o = ((p.ay + y) * ATLAS_W + p.ax + x) * 4;
        px.copy(atlas, o, i * 4, i * 4 + 4);
        sx += (p.x + x + 0.5) * a;
        sy += (p.y + y + 0.5) * a;
        sa += a;
        const f = (p.y + y) * FIG_W + p.x + x;
        if (a > bestFig[f]) {
          bestFig[f] = a;
          labelFig[f] = p.k;
        }
        if (form !== "middle" || a <= 0.004) continue;
        // The light plate: the same alpha, the whole's light, an orange rim
        // where the plate ends (its own alpha falls off beside it).
        const here = a >= 0.5;
        let edge = false;
        for (let dy = -1; dy <= 1 && !edge; dy += 1)
          for (let dx = -1; dx <= 1; dx += 1) {
            const xx = x + dx;
            const yy = y + dy;
            const na =
              xx < 0 || yy < 0 || xx >= p.w || yy >= p.h ? 0 : p.acc[(yy * p.w + xx) * 4 + 3];
            if (here && na < 0.5) {
              edge = true;
              break;
            }
          }
        const colour = edge || !here ? RIM : lightAt(p.x + x, p.y + y);
        lit[o] = colour[0];
        lit[o + 1] = colour[1];
        lit[o + 2] = colour[2];
        lit[o + 3] = Math.round(Math.min(1, a) * 255);
      }
    p.cx = sa ? sx / sa : p.x + p.w / 2;
    p.cy = sa ? sy / sa : p.y + p.h / 2;
    p.area = sa;
  }
  const atlasUrl = await writeWebp(`${form}-plates.webp`, atlas, ATLAS_W, ATLAS_H, { quality: 82 });
  const litUrl =
    form === "middle"
      ? await writeWebp("middle-lit.webp", lit, ATLAS_W, ATLAS_H, { quality: 62, alphaQuality: 80 })
      : null;

  // The seams: where one plate meets another inside the figure, in orange,
  // with a soft glow around the line.
  const wholeGroup = ids.map((id) => ["body", "driver", "halo"].includes(groupOf(form, id)));
  // The whole's own alpha (body, driver, halo), for the glow.
  const wholeAlpha = new Float32Array(FIG_W * FIG_H);
  for (const p of plates) {
    if (!wholeGroup[p.k]) continue;
    for (let y = 0; y < p.h; y += 1)
      for (let x = 0; x < p.w; x += 1)
        wholeAlpha[(p.y + y) * FIG_W + p.x + x] += p.acc[(y * p.w + x) * 4 + 3];
  }
  const seam = new Float32Array(FIG_W * FIG_H);
  for (let y = 1; y < FIG_H - 1; y += 1)
    for (let x = 1; x < FIG_W - 1; x += 1) {
      const f = y * FIG_W + x;
      const l = labelFig[f];
      if (l < 0 || whole[f * 4 + 3] < 0.35 || !wholeGroup[l]) continue;
      const right = labelFig[f + 1];
      const down = labelFig[f + FIG_W];
      // The boundaries of the whole only: the satellites (bits, tail, arms,
      // crystals) are not part of it until they fly in.
      if (
        (right >= 0 && right !== l && wholeGroup[right]) ||
        (down >= 0 && down !== l && wholeGroup[down])
      )
        seam[f] = 1;
    }
  const seamRaw = Buffer.alloc(FIG_W * FIG_H * 4);
  {
    const blur = (src, radius) => {
      // Two box passes ≈ a soft gaussian.
      const tmp = new Float32Array(src.length);
      const out = new Float32Array(src.length);
      for (let y = 0; y < FIG_H; y += 1)
        for (let x = 0; x < FIG_W; x += 1) {
          let s = 0;
          for (let d = -radius; d <= radius; d += 1)
            s += src[y * FIG_W + Math.min(FIG_W - 1, Math.max(0, x + d))];
          tmp[y * FIG_W + x] = s / (radius * 2 + 1);
        }
      for (let y = 0; y < FIG_H; y += 1)
        for (let x = 0; x < FIG_W; x += 1) {
          let s = 0;
          for (let d = -radius; d <= radius; d += 1)
            s += tmp[Math.min(FIG_H - 1, Math.max(0, y + d)) * FIG_W + x];
          out[y * FIG_W + x] = s / (radius * 2 + 1);
        }
      return out;
    };
    const glow = blur(blur(seam, 2), 2);
    for (let f = 0; f < FIG_W * FIG_H; f += 1) {
      const core = seam[f];
      const halo = Math.min(1, glow[f] * 2.2);
      const a = Math.max(core, halo * 0.55);
      if (a <= 0.01) continue;
      const hot = core > 0 ? 1 : 0;
      seamRaw[f * 4] = 255;
      seamRaw[f * 4 + 1] = Math.round(150 + 80 * hot);
      seamRaw[f * 4 + 2] = Math.round(60 + 90 * hot);
      seamRaw[f * 4 + 3] = Math.round(a * 255);
    }
  }
  const seams = await writeWebp(`${form}-seams.webp`, seamRaw, FIG_W, FIG_H, { quality: 70 });

  // A check: the plates at rest add up to the figure.
  {
    const sum = new Float32Array(FIG_W * FIG_H);
    for (const p of plates)
      for (let y = 0; y < p.h; y += 1)
        for (let x = 0; x < p.w; x += 1)
          sum[(p.y + y) * FIG_W + p.x + x] += p.acc[(y * p.w + x) * 4 + 3];
    let worst = 0;
    for (let f = 0; f < FIG_W * FIG_H; f += 1)
      worst = Math.max(worst, Math.abs(sum[f] - whole[f * 4 + 3]));
    if (worst > 1e-3)
      throw new Error(`${form}: the plates do not add up to the figure (alpha off by ${worst})`);
  }

  built[form] = {
    figure,
    atlas: { src: atlasUrl, width: ATLAS_W, height: ATLAS_H },
    lit: litUrl,
    seams,
    holes,
    plates: plates
      .filter((p) => p.w > 0 && p.h > 0 && p.area > 0)
      .map((p) => ({
        id: p.id,
        group: groupOf(form, p.id),
        x: p.x,
        y: p.y,
        w: p.w,
        h: p.h,
        ax: p.ax,
        ay: p.ay,
        cx: round1(p.cx),
        cy: round1(p.cy),
      })),
    figureRaw,
    alpha: whole,
    wholeAlpha,
  };
  console.log(
    `${form}: ${built[form].plates.length} plates (${holes} px no mask reached, given to their nearest plate), atlas ${ATLAS_W}x${ATLAS_H}`,
  );
}

// The registration: both cutouts share one frame. Check it on the art: the
// helix's light and the soles' row.
{
  const marks = {};
  for (const form of FORMS) {
    const raw = built[form].figureRaw;
    let sx = 0;
    let sy = 0;
    let s = 0;
    const [hx, hy] = MARKS.helix;
    for (let y = Math.round(hy - 40); y < hy + 40; y += 1)
      for (let x = Math.round(hx - 40); x < hx + 40; x += 1) {
        const o = (y * FIG_W + x) * 4;
        const lum = raw[o] * 0.5 + raw[o + 1] * 0.5;
        if (raw[o] > 235 && raw[o + 1] > 200) {
          sx += x * lum;
          sy += y * lum;
          s += lum;
        }
      }
    let sole = 0;
    for (let y = FIG_H - 1; y >= 0 && !sole; y -= 1)
      for (let x = Math.round(FIG_W * 0.3); x < FIG_W * 0.7; x += 1)
        if (built[form].alpha[(y * FIG_W + x) * 4 + 3] > 0.5) {
          sole = y;
          break;
        }
    marks[form] = { helix: [round1(sx / s), round1(sy / s)], sole };
  }
  const dx = Math.abs(marks.middle.helix[0] - marks.ultra.helix[0]);
  const dy = Math.abs(marks.middle.helix[1] - marks.ultra.helix[1]);
  const ds = Math.abs(marks.middle.sole - marks.ultra.sole);
  console.log("registration", JSON.stringify(marks), { dx, dy, ds });
  if (dx > 4 || dy > 4 || ds > 4)
    throw new Error("the two cutouts do not share one frame: register them");
  built.registration = marks;
}

// The glow: the whole, before it partitions (half size: it is soft).
let glowUrl;
{
  const GW = Math.round(FIG_W / 2);
  const GH = Math.round(FIG_H / 2);
  const a = new Float32Array(GW * GH);
  const src = built.middle.wholeAlpha;
  for (let y = 0; y < GH; y += 1)
    for (let x = 0; x < GW; x += 1) {
      let s = 0;
      for (let dy = 0; dy < 2; dy += 1)
        for (let dx = 0; dx < 2; dx += 1)
          s += src[Math.min(FIG_H - 1, y * 2 + dy) * FIG_W + Math.min(FIG_W - 1, x * 2 + dx)];
      a[y * GW + x] = s / 4;
    }
  const raw = Buffer.alloc(GW * GH * 4);
  for (let y = 0; y < GH; y += 1)
    for (let x = 0; x < GW; x += 1) {
      const v = a[y * GW + x];
      if (v <= 0.01) continue;
      const [r, g, b] = lightAt(x * 2, y * 2);
      const o = (y * GW + x) * 4;
      raw[o] = r;
      raw[o + 1] = g;
      raw[o + 2] = b;
      raw[o + 3] = Math.round(v * 255);
    }
  const blurred = await sharp(raw, { raw: { width: GW, height: GH, channels: 4 } })
    .blur(2.2)
    .raw()
    .toBuffer();
  glowUrl = await writeWebp("middle-glow.webp", blurred, GW, GH, { quality: 70 });
}

// The undersuit: Rexonance's (the same wearer), its soles on ミドル's soles and
// its reactor on the helix.
const { REXONANCE_SUIT_MARKS, REXONANCE_SUIT_UNDERSUIT } = await importTs(
  "src/lib/rexonance-suit.ts",
);
const UNDERSUIT_SOURCE = join(ROOT, "public", REXONANCE_SUIT_UNDERSUIT.slice(1));
let undersuitPlace;
let undersuitUrl;
{
  const under = await sharp(UNDERSUIT_SOURCE)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const uw = under.info.width;
  const uh = under.info.height;
  let sole = 0;
  for (let y = uh - 1; y >= 0 && !sole; y -= 1)
    for (let x = 0; x < uw; x += 1)
      if (under.data[(y * uw + x) * 4 + 3] > 40) {
        sole = y;
        break;
      }
  const figureSole = built.registration.middle.sole;
  const [ucx, ucy] = REXONANCE_SUIT_MARKS.core;
  const scale = (figureSole - MARKS.helix[1]) / (sole - ucy);
  const width = Math.round(uw * scale);
  const height = Math.round(uh * scale);
  const left = Math.round(MARKS.helix[0] - ucx * scale);
  const top = Math.round(figureSole - sole * scale);
  undersuitPlace = { left, top, width, height };
  const scaled = await sharp(UNDERSUIT_SOURCE)
    .ensureAlpha()
    .resize(width, height, { kernel: "lanczos3", fit: "fill" })
    .raw()
    .toBuffer();
  const raw = Buffer.alloc(FIG_W * FIG_H * 4);
  for (let y = 0; y < height; y += 1) {
    const ty = top + y;
    if (ty < 0 || ty >= FIG_H) continue;
    for (let x = 0; x < width; x += 1) {
      const tx = left + x;
      if (tx < 0 || tx >= FIG_W) continue;
      scaled.copy(raw, (ty * FIG_W + tx) * 4, (y * width + x) * 4, (y * width + x + 1) * 4);
    }
  }
  undersuitUrl = await writeWebp("undersuit.webp", raw, FIG_W, FIG_H, {
    quality: 82,
    alphaQuality: 100,
  });
}

// --- The module -------------------------------------------------------------------
const plateLines = (form) =>
  built[form].plates
    .map(
      (p) =>
        `    { id: ${JSON.stringify(p.id)}, group: ${JSON.stringify(p.group)}, x: ${p.x}, y: ${p.y}, w: ${p.w}, h: ${p.h}, ax: ${p.ax}, ay: ${p.ay}, cx: ${p.cx}, cy: ${p.cy} },`,
    )
    .join("\n");
const moduleText = `// GENERATED by scripts/build-meta-unitas-suit.mjs from the owner's cutouts and
// SAM's masks (design/meta-unitas-saga-${VERSION}/). Do not edit by hand.

/** The figure (figure px): the whole cutout frame at 1040 px tall. */
export const META_UNITAS_SUIT_SIZE = { width: ${FIG_W}, height: ${FIG_H} } as const;

export type MetaUnitasPlateGroup = "body" | "driver" | "halo" | "bits" | "tail" | "manus" | "crystal";
export type MetaUnitasPlate = {
  readonly id: string;
  readonly group: MetaUnitasPlateGroup;
  /** Its box on the figure (figure px) … */
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  /** … its place in the form's atlas … */
  readonly ax: number;
  readonly ay: number;
  /** … and its centre of mass (figure px). */
  readonly cx: number;
  readonly cy: number;
};

export const META_UNITAS_SUIT = {
  middle: {
    figure: ${JSON.stringify(built.middle.figure)},
    atlas: ${JSON.stringify(built.middle.atlas)},
    lit: ${JSON.stringify(built.middle.lit)},
    seams: ${JSON.stringify(built.middle.seams)},
  },
  ultra: {
    figure: ${JSON.stringify(built.ultra.figure)},
    atlas: ${JSON.stringify(built.ultra.atlas)},
    seams: ${JSON.stringify(built.ultra.seams)},
  },
  glow: ${JSON.stringify(glowUrl)},
  undersuit: ${JSON.stringify(undersuitUrl)},
} as const;

/** Where Rexonance's undersuit stands in this frame (figure px). */
export const META_UNITAS_UNDERSUIT_PLACE = ${JSON.stringify(undersuitPlace)} as const;

/** The frame's landmarks (figure px). */
export const META_UNITAS_SUIT_MARKS = ${JSON.stringify({
  helix: MARKS.helix.map(round1),
  visor: MARKS.visor.map(round1),
  belt: MARKS.belt.map(round1),
  halo: Object.fromEntries(Object.entries(MARKS.halo).map(([k, v]) => [k, round1(v)])),
  manusPivot: Object.fromEntries(
    Object.entries(MARKS.manusPivot).map(([k, v]) => [k, v.map(round1)]),
  ),
  sole: built.registration.middle.sole,
})} as const;

/** The plates, per form (ids shared between the forms' body plates). */
export const META_UNITAS_PLATES: Readonly<Record<"middle" | "ultra", readonly MetaUnitasPlate[]>> = {
  middle: [
${plateLines("middle")}
  ],
  ultra: [
${plateLines("ultra")}
  ],
};
`;
writeFileSync(MODULE, moduleText);
let total = 0;
for (const [name, size] of files) {
  total += size;
  console.log(`${name}\t${size}`);
}
console.log(`total\t${total} bytes; wrote ${MODULE}`);

if (DEBUG) {
  mkdirSync(DEBUG, { recursive: true });
  for (const form of FORMS) {
    await sharp(join(OUT_DIR, `${form}-figure.webp`))
      .composite([{ input: join(OUT_DIR, `${form}-seams.webp`) }])
      .flatten({ background: "#20242c" })
      .png()
      .toFile(join(DEBUG, `${form}-seams-over-figure.png`));
  }
  await sharp(join(OUT_DIR, "undersuit.webp"))
    .composite([
      {
        input: await sharp(join(OUT_DIR, "middle-figure.webp")).ensureAlpha(0.45).toBuffer(),
        blend: "over",
      },
    ])
    .flatten({ background: "#20242c" })
    .png()
    .toFile(join(DEBUG, "undersuit-registration.png"));
}
