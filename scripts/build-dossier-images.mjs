import { createRequire } from "node:module";
import { statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dossierImageSources, dossierImage } from "../src/lib/dossier-images.ts";
const require = createRequire(import.meta.url);
const sharp = require(process.env.SHARP_MODULE || "sharp");
// The form pickups added on 2026-10-15 (the four 六詠 riders and Realm's
// Earth and Moon forms) are encoded at q80: at their card and record sizes
// they read the same as q84 and cost about 15% less. Everything else keeps 84.
const QUALITY_80 = new Set([
  "/manager-shuza-rider.jpeg",
  "/manager-lejas-rider.jpeg",
  "/manager-opus-rider.jpeg",
  "/manager-reemu-rider.jpeg",
  "/rider-realm-earth.jpeg",
  "/rider-realm-moon.jpeg",
]);
let original = 0,
  delivery = 0;
const only = new Set(process.argv.slice(2));
for (const source of dossierImageSources) {
  if (only.size && !only.has(source)) continue;
  const input = new URL(`../public${source}`, import.meta.url);
  const output = new URL(`../public${dossierImage(source).srcSet}`, import.meta.url);
  const result = await sharp(fileURLToPath(input))
    .webp({ quality: QUALITY_80.has(source) ? 80 : 84, effort: 6 })
    .toFile(fileURLToPath(output));
  original += statSync(input).size;
  delivery += result.size;
  console.log(`${source}: ${statSync(input).size} -> ${result.size}`);
}
console.log(JSON.stringify({ original, delivery, reduction: 1 - delivery / original }));
