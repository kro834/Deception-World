import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { REXONANCE_SITE_ARTWORK } from "../src/lib/rexonance-site-artwork.ts";

// Run with the supplied originals in standard / max / ultra order. Every output
// is encoded directly from its PNG, without cropping or a second lossy encode.
const sources = process.argv.slice(2);
if (sources.length !== 3) throw new Error("Expected standard, max and ultra original image paths");
const require = createRequire(import.meta.url);
const sharp = require(process.env.SHARP_MODULE || "sharp");
const publicRoot = new URL("../public/", import.meta.url);
for (const [index, [stage, source]] of Object.entries(REXONANCE_SITE_ARTWORK).entries()) {
  const input = sources[index];
  const metadata = await sharp(input).metadata();
  if (metadata.width !== 1086 || metadata.height !== 1448)
    throw new Error(`${stage}: expected the supplied 1086 x 1448 artwork`);
  const full = await sharp(input)
    .webp({ quality: 92, effort: 6 })
    .toFile(fileURLToPath(new URL(source.slice(1), publicRoot)));
  console.log(`${stage} original: ${metadata.width}x${metadata.height}; WebP: ${full.size} bytes`);
  for (const width of [640, 960, 1086]) {
    const path = source.slice(1).replace(/\.webp$/, `-delivery-${width}.webp`);
    const result = await sharp(input)
      .resize({ width, withoutEnlargement: true })
      .webp({ quality: 84, effort: 6 })
      .toFile(fileURLToPath(new URL(path, publicRoot)));
    console.log(`${stage} ${width}w: ${result.size} bytes`);
  }
}
