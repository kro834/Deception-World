// Library/search cards need the original form art, not an enlarged 240px
// archive chip. Keep the owner's embedded archives and chips untouched.
import { mkdirSync, existsSync } from "node:fs";
import sharp from "sharp";
import { FORM_RECORD_IMAGES } from "../src/lib/record-form-images.ts";

mkdirSync(new URL("../public/record-art/", import.meta.url), { recursive: true });
let count = 0;
for (const [key, { source, variants }] of Object.entries(FORM_RECORD_IMAGES)) {
  const original = await sharp(new URL(`../public${source}`, import.meta.url).pathname).metadata();
  for (const { path, width, build } of variants) {
    if (width > original.width)
      throw new Error(`never upscale ${key}: ${width} > ${original.width}`);
    if (!build) continue;
    count++;
    const output = new URL(`../public${path}`, import.meta.url);
    if (process.argv.includes("--check")) {
      if (!existsSync(output)) throw new Error(`missing ${output.pathname}`);
      const info = await sharp(output.pathname).metadata();
      if (info.width !== width) throw new Error(`incorrect candidate width: ${key}/${width}`);
    } else {
      await sharp(new URL(`../public${source}`, import.meta.url).pathname)
        .resize({ width, withoutEnlargement: true })
        .webp({ quality: 86, effort: 6 })
        .toFile(output.pathname);
    }
  }
}
console.log(
  `[record-art] 26 forms, ${count} responsive candidates; small originals are not upscaled`,
);
