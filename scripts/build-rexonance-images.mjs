import { createRequire } from "node:module";
import { resolve } from "node:path";
const require = createRequire(import.meta.url);
// Supply SHARP_MODULE when using a bundled build-time encoder; no runtime dependency.
const sharp = require(process.env.SHARP_MODULE || "sharp");
const root = new URL("../public/", import.meta.url);
for (const file of [
  "rider-rexonance-saga-pickup.jpeg",
  "rider-rexonance-max.webp",
  "rider-rexonance-ultra.webp",
  "rexonance-p14-core.jpg",
]) {
  const input = new URL(file, root);
  const { width } = await sharp(input.pathname).metadata();
  for (const size of [640, 960, width]) {
    const output = new URL(file.replace(/\.[^.]+$/, `-delivery-${size}.webp`), root);
    const result = await sharp(input.pathname)
      .resize({ width: size, withoutEnlargement: true })
      .webp({ quality: 84, effort: 6 })
      .toFile(resolve(output.pathname));
    console.log(`${file} ${size}w: ${result.size} bytes`);
  }
}
