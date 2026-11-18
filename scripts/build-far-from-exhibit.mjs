// Reframe the five original portraits and the isolated suit components for
// the two section openers. Only the small finished WebPs reach the page.
import { readFile, mkdir, writeFile } from "node:fs/promises";
import sharp from "sharp";
import { FAR_FROM_SUIT_ATLAS, FAR_FROM_SUIT_PIECES } from "../src/lib/far-from-suit.ts";
import { FAR_FROM_SAGA_ARTWORK, FAR_FROM_SAGA_STAGE_ORDER } from "../src/lib/far-from-saga-artwork.ts";

const publicRoot = new URL("../public/", import.meta.url);
const directory = new URL("far-from-exhibit-20261119/", publicRoot);
const readArt = (path) => readFile(new URL(path.slice(1), publicRoot));
const cell = 208, height = 208, slant = 46;
const width = cell * FAR_FROM_SAGA_STAGE_ORDER.length;
const strip = Buffer.alloc(width * height * 4);

for (const [index, form] of FAR_FROM_SAGA_STAGE_ORDER.entries()) {
  const image = FAR_FROM_SAGA_ARTWORK[form];
  const cropWidth = Math.round(image.width * .57);
  const cropHeight = Math.round(cropWidth * height / (cell + slant));
  const pixels = await sharp(await readArt(image.src)).extract({
    left: Math.round((image.width - cropWidth) / 2), top: Math.round(image.height * .038),
    width: cropWidth, height: cropHeight,
  }).resize(cell + slant, height, { fit: "fill" }).ensureAlpha().raw().toBuffer();
  for (let y = 0; y < height; y++) {
    const shift = Math.round((.5 - y / (height - 1)) * slant);
    const from = Math.max(0, index * cell + shift);
    const end = Math.min(width, (index + 1) * cell + shift);
    for (let x = from; x < end; x++) {
      const src = 4 * (y * (cell + slant) + x - index * cell + slant / 2);
      const dst = 4 * (y * width + x);
      pixels.copy(strip, dst, src, src + 4);
    }
  }
}
const panorama = await sharp(strip, { raw: { width, height, channels: 4 } }).webp({ quality: 83, effort: 6 }).toBuffer();

const atlas = await readArt(FAR_FROM_SUIT_ATLAS.src);
const projections = [
  ["bit-top-r", 98, 64, 106], ["bit-mid-l", 216, 9, 84], ["bit-mid-r", 485, 26, 100],
  ["bit-low-r", 567, 105, 110], ["bit-low-l", 30, 163, 91],
  ["crystal-mount", 248, 75, 179], ["crystal-core", 255, 110, 161],
];
const parts = [];
for (const [id, left, top, size] of projections) {
  const piece = FAR_FROM_SUIT_PIECES.find((p) => p.id === id);
  const input = await sharp(atlas).extract({ left: piece.ax, top: piece.ay, width: piece.w, height: piece.h })
    .resize({ width: size }).png().toBuffer();
  parts.push({ input, left, top });
}
const core = await sharp({ create: { width: 700, height: 288, channels: 4, background: "#00000000" } })
  .composite(parts).webp({ quality: 86, effort: 6 }).toBuffer();

if (!process.argv.includes("--check")) await mkdir(directory, { recursive: true });
for (const [name, bytes] of [["forms", panorama], ["core", core]]) {
  const output = new URL(name + ".webp", directory);
  if (process.argv.includes("--check")) {
    if (!bytes.equals(await readFile(output))) throw new Error("Regenerate the Far From " + name + " artwork");
  } else await writeFile(output, bytes);
  console.log(name, bytes.length);
}
