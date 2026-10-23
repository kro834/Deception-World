// Encodes the META UNITAS SAGA special site's two key visuals and its side
// menu tile (2026-10-23).
//
//   node scripts/build-meta-unitas-saga-artwork.mjs
//
// Reads design/meta-unitas-saga-20261023/key-visual/{middle.jpg, ultra.webp}
// (the owner's originals, unchanged) and writes
// public/meta-unitas-saga-20261023/<form>-<width>.webp at every delivery width,
// straight from the original (one lossy pass), never enlarged, plus
// middle-tile-400.webp (the menu's SPECIAL tile). It checks the constant's
// sizes in src/lib/meta-unitas-saga-artwork.ts against the files.
import { createRequire } from "node:module";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import {
  META_UNITAS_ARTWORK,
  META_UNITAS_ARTWORK_REVISION,
  META_UNITAS_ARTWORK_WIDTHS,
  META_UNITAS_MENU_TILE,
  META_UNITAS_STAGE_ORDER,
} from "../src/lib/meta-unitas-saga-artwork.ts";

const require = createRequire(import.meta.url);
const sharp = require(process.env.SHARP_MODULE || "sharp");
const root = new URL("../", import.meta.url);
const designDir = new URL(
  `design/meta-unitas-saga-${META_UNITAS_ARTWORK_REVISION}/key-visual/`,
  root,
);
const publicDir = new URL(`public/meta-unitas-saga-${META_UNITAS_ARTWORK_REVISION}/`, root);
await mkdir(publicDir, { recursive: true });
const SOURCES = { middle: "middle.jpg", ultra: "ultra.webp" };
const CAPS = { 640: 200_000, 960: 350_000, 1280: 480_000 };
const QUALITIES = [84, 80, 76, 72, 68];
let failed = false;
for (const stage of META_UNITAS_STAGE_ORDER) {
  const input = fileURLToPath(new URL(SOURCES[stage], designDir));
  for (const width of META_UNITAS_ARTWORK_WIDTHS) {
    const output = fileURLToPath(new URL(`${stage}-${width}.webp`, publicDir));
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
    console.log(
      `${stage} ${width}w: ${result.width}x${result.height}, ${result.size} bytes (q${quality})`,
    );
    if (width === META_UNITAS_ARTWORK_WIDTHS.at(-1)) {
      const expected = META_UNITAS_ARTWORK[stage];
      if (expected.width !== result.width || expected.height !== result.height) {
        console.error(
          `  !! ${stage} is ${expected.width}x${expected.height} in the module; the file is ${result.width}x${result.height}`,
        );
        failed = true;
      }
    }
  }
  if (stage === "middle") {
    const tile = await sharp(input)
      .rotate()
      .resize({ width: 400 })
      .webp({ quality: 74, effort: 6 })
      .toFile(fileURLToPath(new URL(META_UNITAS_MENU_TILE.split("/").pop(), publicDir)));
    console.log(`  menu tile: ${tile.width}x${tile.height}, ${tile.size} bytes`);
  }
}
if (failed) process.exit(1);
