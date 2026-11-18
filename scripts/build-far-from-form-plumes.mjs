// Grade the existing 32-frame Cycles volume into one sheet for Far From's
// three flame temperatures. Keep the original smoke curls and feathered root.
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import sharp from "sharp";
import { NANITE_FORGE_SHEETS } from "../src/lib/nanite-surface-assets.js";
import { REXONANCE_NANITE_CELLS } from "../src/lib/rexonance-nanites.ts";

const source = new URL("../public/rexonance-flame-natural-20261019/flame.webp", import.meta.url);
const directory = new URL("../public/far-from-fire-20261118/", import.meta.url);
const target = new URL("plumes.webp", directory);
const width = 88;
const height = 176;
const columns = 8;
const frames = 16;
const palettes = [
  [[9, 48, 31], [28, 185, 83], [134, 255, 121], [255, 255, 209]],
  [[63, 9, 12], [218, 35, 25], [255, 110, 41], [255, 241, 166]],
  [[64, 24, 4], [227, 113, 12], [255, 204, 45], [255, 255, 195]],
];

const original = await readFile(source);
const { data, info } = await sharp(original)
  .resize(columns * width, 4 * height)
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });
const stride = columns * width;
const pixels = Buffer.alloc(stride * height * (frames / columns) * palettes.length * 4);
for (const [tone, stops] of palettes.entries()) {
  for (let frame = 0; frame < frames; frame++) {
    const sourceFrame = frame * 2;
    const targetFrame = tone * frames + frame;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const sx = (sourceFrame % columns) * width + x;
        const sy = Math.floor(sourceFrame / columns) * height + y;
        const sourcePixel = (sy * info.width + sx) * 4;
        const dx = (targetFrame % columns) * width + x;
        const dy = Math.floor(targetFrame / columns) * height + y;
        const dest = (dy * stride + dx) * 4;
        const alpha = data[sourcePixel + 3] / 255;
        if (alpha < 0.012) continue;
        // Emissive filaments are both denser and brighter than the wisps.
        const emission = Math.max(0, Math.min(1, (data[sourcePixel + 1] - 55) / 175));
        const t = Math.min(2.999, 3 * (0.7 * emission + 0.3 * alpha));
        const lo = Math.floor(t);
        for (let c = 0; c < 3; c++) {
          pixels[dest + c] = Math.round(stops[lo][c] + (stops[lo + 1][c] - stops[lo][c]) * (t - lo));
        }
        pixels[dest + 3] = Math.round(255 * (1 - (1 - alpha) ** 1.8));
      }
    }
  }
}
// Ultra absorbs the same bevelled cells as the suit-up. Copy the cold-metal
// and silver mip turns below the fire so the intake needs no second request.
const { frames: turns, mip } = REXONANCE_NANITE_CELLS;
const forge = new URL("../public" + NANITE_FORGE_SHEETS["far-from"], import.meta.url);
const chips = await sharp(await readFile(forge))
  .extract({ left: mip.x[0], top: mip.y[0], width: turns * mip.cell, height: 2 * mip.cell })
  .png().toBuffer();
const plumeHeight = pixels.length / (stride * 4);
const sheet = await sharp(pixels, { raw: { width: stride, height: plumeHeight, channels: 4 } })
  .extend({ bottom: 2 * mip.cell, top: 0, left: 0, right: 0, background: "#00000000" })
  .composite([{ input: chips, left: 0, top: plumeHeight }])
  .webp({ quality: 82, alphaQuality: 90, effort: 6 }).toBuffer();
if (process.argv.includes("--check")) {
  if (!sheet.equals(await readFile(target))) throw new Error("Regenerate the Far From plume sheet");
} else {
  await mkdir(directory, { recursive: true });
  await writeFile(target, sheet);
}
console.log(`Far From plumes: ${sheet.length} bytes, SHA-256 ${createHash("sha256").update(sheet).digest("hex")}`);
