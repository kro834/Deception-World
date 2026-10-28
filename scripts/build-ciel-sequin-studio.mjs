#!/usr/bin/env node
/** Pack an actual Blender Cycles panorama, never an owner-artwork alteration.
 * Render scripts/blender/ciel_sequin_studio.py first, then pass --source=studio.png.
 * --check verifies the delivered file and its scene provenance without Blender.
 */
import sharp from "sharp";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
const root = resolve(import.meta.dirname, "..");
const directory = join(root, "public/ciel-sequin-studio-20261028");
const scenePath = "scripts/blender/ciel_sequin_studio.py";
const scene = await readFile(join(root, scenePath));
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
if (process.argv.includes("--check")) {
  const manifest = JSON.parse(await readFile(join(directory, "provenance.json"), "utf8"));
  const bytes = await readFile(join(directory, "studio.webp"));
  const info = await sharp(bytes).metadata();
  if (info.width !== 768 || info.height !== 384 || bytes.length > 24000)
    throw Error("Sequin studio dimensions or 24KB budget changed");
  if (info.exif || info.xmp || info.icc) throw Error("Unexpected studio metadata");
  if (
    manifest.sceneSha256 !== hash(scene) ||
    manifest.deliverySha256 !== hash(bytes) ||
    manifest.bytes !== bytes.length
  )
    throw Error("Sequin studio provenance differs");
  console.log(`Ciel Blender studio verified: ${bytes.length} bytes`);
} else {
  const source = process.argv.find((value) => value.startsWith("--source="))?.slice(9);
  if (!source) throw Error("Pass --source= with the Blender studio.png render");
  const rendered = await readFile(source);
  const info = await sharp(rendered).metadata();
  if (info.width !== 768 || info.height !== 384) throw Error("Expected 768x384 panorama");
  const bytes = await sharp(rendered).webp({ quality: 91, effort: 6 }).toBuffer();
  if (bytes.length > 24000) throw Error("Studio reflection exceeds 24KB budget");
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, "studio.webp"), bytes);
  await writeFile(
    join(directory, "provenance.json"),
    JSON.stringify(
      {
        renderer: "Blender 4.5.9 LTS / Cycles CPU",
        samples: 96,
        seed: 28,
        projection: "equirectangular",
        colorSpace: "sRGB",
        width: 768,
        height: 384,
        scene: scenePath,
        sceneSha256: hash(scene),
        renderSha256: hash(rendered),
        deliverySha256: hash(bytes),
        bytes: bytes.length,
        ownerArtworkIncluded: false,
      },
      null,
      2,
    ) + "\n",
  );
  console.log(`Packed Ciel Blender studio: ${bytes.length} bytes`);
}
