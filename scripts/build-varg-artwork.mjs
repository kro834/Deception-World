import sharp from "sharp";
import { fileURLToPath } from "node:url";

const input = process.argv[2];
if (!input) throw new Error("Pass the owner's original Varg artwork path.");
const meta = await sharp(input).metadata();
if (meta.width !== 1088 || meta.height !== 1445) throw new Error("Unexpected Varg artwork dimensions");
// The original is opt-in; responsive delivery never fetches the larger lossless master.
const original = fileURLToPath(new URL("../public/character-varg-20261021-original.webp", import.meta.url));
await sharp(input).rotate().webp({ lossless: true, effort: 6 }).toFile(original);
for (const width of [360, 720, 1088]) {
  const suffix = width === 1088 ? "" : `-${width}`;
  const output = fileURLToPath(new URL(`../public/character-varg-20261021${suffix}.webp`, import.meta.url));
  const info = await sharp(input).rotate().resize({ width }).webp({ quality: 90, effort: 6 }).toFile(output);
  console.log(`${width}w: ${info.size} bytes`);
}
