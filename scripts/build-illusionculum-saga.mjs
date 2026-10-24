#!/usr/bin/env node
// Encodes the ILLUSIONCULUM SAGA special site's four key visuals (2026-10-23).
//
//   node scripts/build-illusionculum-saga.mjs
//
// Reads the owner's originals from design/illusionculum-saga-20261023/
// (key-<stem>.jpg, copied there unchanged) and encodes each straight from the
// original (no second lossy pass) to public/illusionculum-saga-20261023/
// <stem>-<width>.webp at every delivery width, plus the side menu's 400 px
// tile of the standard form. The scroll suit-up's cutouts are built by
// scripts/build-illusionculum-suit.mjs.
import { createRequire } from "node:module";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import {
  ILLUSIONCULUM_ARTWORK,
  ILLUSIONCULUM_ARTWORK_REVISION,
  ILLUSIONCULUM_ARTWORK_WIDTHS,
  ILLUSIONCULUM_CUTOUT_WIDTHS,
  ILLUSIONCULUM_DETAIL_CROPS,
  ILLUSIONCULUM_FORM_ORDER,
  ILLUSIONCULUM_FORM_STEMS,
  ILLUSIONCULUM_HERO,
  ILLUSIONCULUM_HERO_STEM,
  ILLUSIONCULUM_MENU_TILE,
  ILLUSIONCULUM_ORBS,
  ILLUSIONCULUM_ORB_SIZE,
} from "../src/lib/illusionculum-saga-artwork.ts";

const require = createRequire(import.meta.url);
const sharp = require(process.env.SHARP_MODULE || "sharp");
const root = new URL("../", import.meta.url);
const designDir = new URL(`design/illusionculum-saga-${ILLUSIONCULUM_ARTWORK_REVISION}/`, root);
const publicDir = new URL(`public/illusionculum-saga-${ILLUSIONCULUM_ARTWORK_REVISION}/`, root);
await mkdir(publicDir, { recursive: true });

// The Far From set's byte caps and quality ladder.
const CAPS = { 640: 200_000, 960: 350_000, 1280: 480_000 };
const QUALITIES = [84, 80, 76, 72, 68];

// The tile frames the figure as the other special sites' tiles do (owner,
// 2026-10-23: 「もっと、他と同じ位置を映すようにして」), measured on their
// rendered tiles: a 3:4 source, the helmet's top about 4% down, the belt
// about half way (Rexonance and Meta Unitas: 5% and 50%). The key visual's
// marks: helmet tips y 190, reactor y 700, belt y 1080 (of 2000).
const TILE_CROP = { left: 0, top: 119, width: 1333, height: 1777 };
const tile = async (input, output) => {
  const result = await sharp(input)
    .rotate()
    .extract(TILE_CROP)
    .resize({ width: 400, withoutEnlargement: true })
    .webp({ quality: 74, effort: 6 })
    .toFile(output);
  console.log(`  menu tile: ${result.width}x${result.height}, ${result.size} bytes`);
  return result;
};

// The four form visuals, then the hero's own key visual (stem "hero", which
// also gives the side menu's tile).
const JOBS = [
  ...ILLUSIONCULUM_FORM_ORDER.map((key) => [ILLUSIONCULUM_FORM_STEMS[key], ILLUSIONCULUM_ARTWORK[key]]),
  [ILLUSIONCULUM_HERO_STEM, ILLUSIONCULUM_HERO],
];
for (const [stem, expected] of JOBS) {
  const input = fileURLToPath(new URL(`key-${stem}.jpg`, designDir));
  const metadata = await sharp(input).metadata();
  console.log(`${stem}: original ${metadata.width}x${metadata.height}`);
  for (const width of ILLUSIONCULUM_ARTWORK_WIDTHS) {
    const output = fileURLToPath(new URL(`${stem}-${width}.webp`, publicDir));
    let result;
    let quality;
    for (quality of QUALITIES) {
      result = await sharp(input)
        .rotate()
        .resize({ width, withoutEnlargement: true })
        .webp({ quality, effort: 6 })
        .toFile(output);
      if (result.size <= CAPS[width]) break;
    }
    const over = result.size > CAPS[width] ? "  OVER BUDGET" : "";
    console.log(
      `  ${width}w: ${result.width}x${result.height}, ${result.size} bytes (q${quality})${over}`,
    );
    if (
      width === ILLUSIONCULUM_ARTWORK_WIDTHS.at(-1) &&
      (expected.width !== result.width || expected.height !== result.height)
    )
      throw new Error(
        `${stem} is ${expected.width}x${expected.height}; file is ${result.width}x${result.height}`,
      );
  }
  if (stem === ILLUSIONCULUM_HERO_STEM)
    await tile(input, fileURLToPath(new URL(ILLUSIONCULUM_MENU_TILE.split("/").pop(), publicDir)));
}

// The transparent cutouts (the owner's, one frame for all four), for the
// page's own figures: the hero's projections, the ability chapter's figure
// and the end card. The scroll suit-up's own sheets are the suit script's.
for (const key of ILLUSIONCULUM_FORM_ORDER) {
  const stem = ILLUSIONCULUM_FORM_STEMS[key];
  const input = fileURLToPath(new URL(`cutout-${stem}.webp`, designDir));
  for (const width of ILLUSIONCULUM_CUTOUT_WIDTHS) {
    const result = await sharp(input)
      .resize({ width })
      .webp({ quality: 80, alphaQuality: 90, effort: 6 })
      .toFile(fileURLToPath(new URL(`cutout-${stem}-${width}.webp`, publicDir)));
    console.log(`cutout-${stem}-${width}: ${result.width}x${result.height}, ${result.size} bytes`);
  }
}

// The chapters' details, cut from the owner's key visuals (original px):
// the head and chest (装甲・外観), a リアクター・モア (専用武装), the legs'
// reactors and crystals (オーバーレッグ・リアクター).
for (const [name, source, box, width] of ILLUSIONCULUM_DETAIL_CROPS) {
  const result = await sharp(fileURLToPath(new URL(`key-${source}.jpg`, designDir)))
    .extract(box)
    .resize({ width })
    .webp({ quality: 80, effort: 6 })
    .toFile(fileURLToPath(new URL(`detail-${name}-${width}.webp`, publicDir)));
  console.log(`detail-${name}: ${result.width}x${result.height}, ${result.size} bytes`);
}

// The two リアクター・モア as sprites: cut from the "more" cutouts where they
// differ from the standard ones (so the halo's lines behind them stay out),
// inside a circle round each orb, feathered a pixel.
{
  const W = 1024;
  const H = 1536;
  const raw = (stem) =>
    sharp(fileURLToPath(new URL(`cutout-${stem}.webp`, designDir)))
      .ensureAlpha()
      .raw()
      .toBuffer();
  for (const [form, plain, armed] of [
    ["standard", "standard", "more"],
    ["ultra", "ultra", "ultra-more"],
  ]) {
    const base = await raw(plain);
    const more = await raw(armed);
    for (const [side, orb] of Object.entries(ILLUSIONCULUM_ORBS)) {
      const size = orb.r * 2;
      const out = Buffer.alloc(size * size * 4);
      for (let y = 0; y < size; y++)
        for (let x = 0; x < size; x++) {
          const fx = orb.cx - orb.r + x;
          const fy = orb.cy - orb.r + y;
          if (fx < 0 || fy < 0 || fx >= W || fy >= H) continue;
          const k = (fy * W + fx) * 4;
          const d = Math.hypot(x + 0.5 - orb.r, y + 0.5 - orb.r);
          const gained = Math.max(0, more[k + 3] - base[k + 3] - 96) / 159;
          // The orb's body (r ≤ 86% of the sprite) whole; past it, only
          // what the orb adds over the standard figure (its spikes).
          const body = Math.min(1, Math.max(0, (orb.r * 0.86 - d) / 2 + 0.5));
          const edge = Math.min(1, Math.max(0, (orb.r * 0.95 - d) / 1.5 + 0.5));
          const a = Math.min(more[k + 3] / 255, Math.max(body, Math.min(1, gained * 1.6))) * edge;
          const o = (y * size + x) * 4;
          out[o] = more[k];
          out[o + 1] = more[k + 1];
          out[o + 2] = more[k + 2];
          out[o + 3] = Math.round(a * 255);
        }
      const result = await sharp(out, { raw: { width: size, height: size, channels: 4 } })
        .resize(ILLUSIONCULUM_ORB_SIZE)
        .webp({ quality: 84, alphaQuality: 92, effort: 6 })
        .toFile(
          fileURLToPath(new URL(`orb-${side}-${form}-${ILLUSIONCULUM_ORB_SIZE}.webp`, publicDir)),
        );
      console.log(`orb-${side}-${form}: ${result.width}x${result.height}, ${result.size} bytes`);
    }
  }
}
