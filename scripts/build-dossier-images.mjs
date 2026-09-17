import { createRequire } from "node:module";
import { statSync } from "node:fs";
import { dossierImageSources, dossierImage } from "../src/lib/dossier-images.ts";
const require = createRequire(import.meta.url);
const sharp = require(process.env.SHARP_MODULE || "sharp");
let original = 0,
  delivery = 0;
for (const source of dossierImageSources) {
  const input = new URL(`../public${source}`, import.meta.url);
  const output = new URL(`../public${dossierImage(source).srcSet}`, import.meta.url);
  const result = await sharp(input.pathname)
    .webp({ quality: 84, effort: 6 })
    .toFile(output.pathname);
  original += statSync(input).size;
  delivery += result.size;
  console.log(`${source}: ${statSync(input).size} -> ${result.size}`);
}
console.log(JSON.stringify({ original, delivery, reduction: 1 - delivery / original }));
