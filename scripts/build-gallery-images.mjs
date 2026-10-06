import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);
const sharp = require(process.env.SHARP_MODULE || "sharp");
const repoRoot = fileURLToPath(new URL("../", import.meta.url));
const publicRoot = resolve(repoRoot, "public");
const outputRoot = resolve(publicRoot, "gallery");
const manifestOutput = resolve(outputRoot, "asset-manifest.json");
const assetModuleOutput = resolve(repoRoot, "src/components/gallery/gallery-assets.ts");
const requestedWidths = [480, 900, 1800];

function hash(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

async function readInputs(manifestPath) {
  if (!manifestPath) {
    throw new Error("Pass --manifest <path> to a JSON array or an ES module exporting galleryInputs.");
  }

  if (manifestPath.endsWith(".json")) {
    return JSON.parse(await readFile(manifestPath, "utf8"));
  }

  const manifestUrl = pathToFileURL(resolve(manifestPath));
  const manifest = await import(manifestUrl.href);
  return manifest.galleryInputs;
}

const manifestFlagIndex = process.argv.indexOf("--manifest");
const manifestPath = manifestFlagIndex >= 0 ? process.argv[manifestFlagIndex + 1] : undefined;
const inputs = await readInputs(manifestPath);
if (!Array.isArray(inputs) || inputs.length === 0 || inputs.some((input) => typeof input !== "string")) {
  throw new Error("The input manifest must provide a non-empty array of exact image file paths.");
}
await mkdir(outputRoot, { recursive: true });

const entries = [];
let totalBytes = 0;

for (const [index, inputPath] of inputs.entries()) {
  const id = `g${String(index + 1).padStart(2, "0")}`;
  const original = await readFile(inputPath);
  const originalHash = hash(original);
  const sourceMetadata = await sharp(original).metadata();
  const swapsDimensions = [5, 6, 7, 8].includes(sourceMetadata.orientation);
  const sourceWidth = swapsDimensions ? sourceMetadata.height : sourceMetadata.width;
  const sourceHeight = swapsDimensions ? sourceMetadata.width : sourceMetadata.height;
  if (!sourceWidth || !sourceHeight) {
    throw new Error(`Unable to read image dimensions for manifest item ${index + 1} (${basename(inputPath)}).`);
  }

  const actualWidths = [...new Set(requestedWidths.map((width) => Math.min(width, sourceWidth)))];
  const variants = [];
  for (const width of actualWidths) {
    const name = `${id}-${width}.webp`;
    const outputPath = resolve(outputRoot, name);
    const result = await sharp(original)
      .rotate()
      .resize({ width, withoutEnlargement: true })
      .webp({ quality: 84, effort: 6 })
      .toFile(outputPath);
    const outputBytes = await readFile(outputPath);
    const variant = {
      path: `/gallery/${name}`,
      width: result.width,
      height: result.height,
      bytes: result.size,
      sha256: hash(outputBytes),
    };
    variants.push(variant);
    totalBytes += result.size;
  }

  entries.push({
    id,
    sourceSha256: originalHash,
    sourceWidth,
    sourceHeight,
    variants,
  });
}

const auditManifest = {
  version: 1,
  format: "image/webp",
  encoder: { quality: 84, effort: 6, widths: requestedWidths, withoutEnlargement: true },
  items: entries,
};
await writeFile(manifestOutput, `${JSON.stringify(auditManifest, null, 2)}\n`);
const runtimeAssets = entries.map(({ id, sourceWidth, sourceHeight, variants }) => ({
  id,
  width: sourceWidth,
  height: sourceHeight,
  variants: variants.map(({ path, width }) => ({ path, width })),
}));
const assetModule = [
  "export const GALLERY_ASSETS = ",
  JSON.stringify(runtimeAssets, null, 2),
  " as const;\n\nexport type GalleryAsset = (typeof GALLERY_ASSETS)[number];\n",
].join("");
await writeFile(assetModuleOutput, assetModule);

const variantCount = entries.reduce((sum, entry) => sum + entry.variants.length, 0);
console.log(`Built ${entries.length} gallery originals into ${variantCount} WebP variants (${totalBytes.toLocaleString()} bytes total).`);
