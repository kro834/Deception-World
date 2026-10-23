// Encodes the FAR FROM SAGA special site's five stage illustrations.
//
//   node scripts/build-far-from-saga-artwork.mjs <middle> <high> <xhigh> <max> <ultra> [<ultra-base>]
//
// The five source paths are taken in FAR_FROM_SAGA_STAGE_ORDER (the one
// constant in src/lib/far-from-saga-artwork.ts). Each original is copied
// unchanged to design/far-from-saga-<revision>/<stage>.<ext> and encoded
// straight from the original (no second lossy pass) to
// public/far-from-saga-<revision>/<stage>-<width>.webp at every delivery width.
// The script prints the largest file's intrinsic height so the constant's
// width/height pairs can be checked against it. The optional sixth path is
// ウルトラ before its interfaces (FAR_FROM_SAGA_ULTRA_BASE), encoded the same
// way as "ultra-base".
import { createRequire } from "node:module";
import { copyFile, mkdir, stat } from "node:fs/promises";
import { extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  FAR_FROM_SAGA_ARTWORK,
  FAR_FROM_SAGA_ARTWORK_REVISION,
  FAR_FROM_SAGA_ARTWORK_WIDTHS,
  FAR_FROM_SAGA_MENU_TILE,
  FAR_FROM_SAGA_STAGE_ORDER,
  FAR_FROM_SAGA_ULTRA_BASE,
} from "../src/lib/far-from-saga-artwork.ts";

const sources = process.argv.slice(2);
const count = FAR_FROM_SAGA_STAGE_ORDER.length;
if (sources.length !== count && sources.length !== count + 1)
  throw new Error(`Expected ${count} source paths in stage order (and optionally ウルトラ's base)`);
const jobs = FAR_FROM_SAGA_STAGE_ORDER.map((stage) => [stage, stage, FAR_FROM_SAGA_ARTWORK[stage]]);
if (sources.length > count) jobs.push(["ultraBase", "ultra-base", FAR_FROM_SAGA_ULTRA_BASE]);

const require = createRequire(import.meta.url);
const sharp = require(process.env.SHARP_MODULE || "sharp");
const root = new URL("../", import.meta.url);
const publicDir = new URL(`public/far-from-saga-${FAR_FROM_SAGA_ARTWORK_REVISION}/`, root);
const designDir = new URL(`design/far-from-saga-${FAR_FROM_SAGA_ARTWORK_REVISION}/`, root);
await mkdir(publicDir, { recursive: true });
await mkdir(designDir, { recursive: true });

// Byte budgets per width (the Final Stage set's caps, scaled for 1280), and
// the qualities tried in turn until a file fits (the Final Stage set's ladder).
const CAPS = { 640: 200_000, 960: 350_000, 1280: 480_000 };
const QUALITIES = [84, 80, 76, 72, 68];

for (const [index, [key, stage, expected]] of jobs.entries()) {
  const input = sources[index];
  const metadata = await sharp(input).metadata();
  const original = new URL(`${stage}${extname(input).toLowerCase()}`, designDir);
  if (resolve(input) !== fileURLToPath(original)) await copyFile(input, fileURLToPath(original));
  console.log(`${stage}: original ${metadata.width}x${metadata.height} (${metadata.format})`);
  for (const width of FAR_FROM_SAGA_ARTWORK_WIDTHS) {
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
    const over = result.size > CAPS[width] ? "  OVER BUDGET" : "";
    console.log(
      `  ${width}w: ${result.width}x${result.height}, ${result.size} bytes (q${quality})${over}`,
    );
    if (width === FAR_FROM_SAGA_ARTWORK_WIDTHS.at(-1)) {
      if (expected.width !== result.width || expected.height !== result.height)
        console.warn(
          `  !! ${key} is ${expected.width}x${expected.height}; file is ${result.width}x${result.height}`,
        );
    }
  }
  await stat(fileURLToPath(original));
  if (stage === "middle") {
    // The side menu's SPECIAL tile: a 400 px cut of the key visual.
    const tile = await sharp(input)
      .rotate()
      .resize({ width: 400, withoutEnlargement: true })
      .webp({ quality: 74, effort: 6 })
      .toFile(fileURLToPath(new URL(FAR_FROM_SAGA_MENU_TILE.split("/").pop(), publicDir)));
    console.log(`  menu tile: ${tile.width}x${tile.height}, ${tile.size} bytes`);
  }
}
