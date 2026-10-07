// Offline asset import: pass the five user-supplied JPEGs in form order.
import sharp from "sharp";
import { fileURLToPath } from "node:url";

const forms = ["royal", "wrath", "abyss", "birth", "ultra"];
const inputs = process.argv.slice(2);
if (inputs.length !== forms.length) throw new Error("Supply exactly five JPEGs in form order.");
for (const [index, form] of forms.entries()) {
  const output = fileURLToPath(
    new URL(`../public/realm-${form}-selected-20261007.webp`, import.meta.url),
  );
  const result = await sharp(inputs[index])
    .rotate()
    .resize({ width: 1200, withoutEnlargement: true })
    .webp({ quality: 85 })
    .toFile(output);
  console.log(form, result.width, result.height, result.size);
}
