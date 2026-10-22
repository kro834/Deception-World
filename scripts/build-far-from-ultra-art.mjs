// Encodes the FAR FROM SAGA special site's ウルトラ sequence cutouts.
//
//   node scripts/build-far-from-ultra-art.mjs <max> <ultra-body> <ultra-interface> [stage-reference]
//
// The three cutouts (owner, 2026-10-22) are transparent 1024 × 1536 WebPs on
// one pixel grid: マックス (the sequence's first frame), ウルトラ without its
// auxiliary interfaces (the sequence's body) and ウルトラ with its painted
// interfaces (the still every quiet tier shows). Each original is copied
// unchanged to design/far-from-ultra-<revision>/ and encoded straight from the
// original (no second lossy pass, alpha kept, never enlarged) to
// public/far-from-ultra-<revision>/<key>-<width>.webp at every delivery width
// in FAR_FROM_ULTRA_WIDTHS. An optional fourth path (the owner's dark stage
// render of the interfaces) is copied to design/ as the HUD's reference only.
import { createRequire } from "node:module";
import { copyFile, mkdir } from "node:fs/promises";
import { extname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  FAR_FROM_ULTRA_ART,
  FAR_FROM_ULTRA_FIGURE,
  FAR_FROM_ULTRA_REVISION,
  FAR_FROM_ULTRA_WIDTHS,
} from "../src/lib/far-from-ultra-art.ts";

const KEYS = ["max", "body", "interface"];
const [maxSource, bodySource, interfaceSource, stageReference] = process.argv.slice(2);
if (!maxSource || !bodySource || !interfaceSource)
  throw new Error("Expected the マックス, ウルトラ body and ウルトラ interface cutouts");

const require = createRequire(import.meta.url);
const sharp = require(process.env.SHARP_MODULE || "sharp");
const root = new URL("../", import.meta.url);
const publicDir = new URL(`public/far-from-ultra-${FAR_FROM_ULTRA_REVISION}/`, root);
const designDir = new URL(`design/far-from-ultra-${FAR_FROM_ULTRA_REVISION}/`, root);
await mkdir(publicDir, { recursive: true });
await mkdir(designDir, { recursive: true });

// Byte budgets per width and the qualities tried in turn until a file fits.
const CAPS = { 768: 330_000, 1024: 520_000 };
const QUALITIES = [84, 80, 76, 72, 68];

const sources = { max: maxSource, body: bodySource, interface: interfaceSource };
for (const key of KEYS) {
  const input = sources[key];
  const metadata = await sharp(input).metadata();
  if (
    metadata.width !== FAR_FROM_ULTRA_FIGURE.width ||
    metadata.height !== FAR_FROM_ULTRA_FIGURE.height
  )
    throw new Error(
      `${key}: ${metadata.width}x${metadata.height}, expected ${FAR_FROM_ULTRA_FIGURE.width}x${FAR_FROM_ULTRA_FIGURE.height} (the cutouts share one pixel grid)`,
    );
  if (!metadata.hasAlpha) throw new Error(`${key}: the cutout must keep its alpha`);
  const stem = FAR_FROM_ULTRA_ART[key].stem.split("/").pop();
  await copyFile(
    input,
    fileURLToPath(new URL(`${stem}${extname(input).toLowerCase()}`, designDir)),
  );
  console.log(`${key}: original ${metadata.width}x${metadata.height} (${metadata.format})`);
  for (const width of FAR_FROM_ULTRA_WIDTHS) {
    const output = fileURLToPath(new URL(`${stem}-${width}.webp`, publicDir));
    let result;
    let quality;
    for (quality of QUALITIES) {
      result = await sharp(input)
        .resize({ width, withoutEnlargement: true })
        .webp({ quality, alphaQuality: 100, effort: 6 })
        .toFile(output);
      if (result.size <= CAPS[width]) break;
    }
    const over = result.size > CAPS[width] ? "  OVER BUDGET" : "";
    console.log(
      `  ${width}w: ${result.width}x${result.height}, ${result.size} bytes (q${quality})${over}`,
    );
  }
}
if (stageReference) {
  await copyFile(
    stageReference,
    fileURLToPath(new URL(`reference-stage-with-interface${extname(stageReference)}`, designDir)),
  );
  console.log("reference: copied");
}
