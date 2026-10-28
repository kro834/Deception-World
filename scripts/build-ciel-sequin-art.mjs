#!/usr/bin/env node
/** Delivery-only transcode: retains the supplied composition, strips metadata.
 * node scripts/build-ciel-sequin-art.mjs --source=/path/to/owner.png
 * node scripts/build-ciel-sequin-art.mjs --check
 */
import sharp from "sharp";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve, join } from "node:path";
const root = resolve(import.meta.dirname, "..");
const dir = join(root, "public/ciel-sequin-20261028");
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
if (process.argv.includes("--check")) {
  const manifest = JSON.parse(await readFile(join(dir, "artwork.json"), "utf8"));
  for (const item of manifest.delivery) {
    const bytes = await readFile(join(dir, item.file));
    const info = await sharp(bytes).metadata();
    if (hash(bytes) !== item.sha256 || bytes.length !== item.bytes)
      throw Error("Artwork differs: " + item.file);
    if (
      info.width !== item.width ||
      info.height !== item.height ||
      Math.abs(info.width / info.height - 0.75) > 0.001
    )
      throw Error("Artwork composition changed");
    if (info.exif || info.xmp || info.orientation || info.icc)
      throw Error("Private image metadata retained");
    if (bytes.length > 180000) throw Error("Artwork delivery exceeds 180KB budget");
  }
  console.log("Ciel sequin artwork verified");
} else {
  const source = process.argv.find((a) => a.startsWith("--source="))?.slice(9);
  if (!source) throw Error("Pass --source= with the supplied original image");
  const bytes = await readFile(source);
  const info = await sharp(bytes).metadata();
  if (info.width !== 1086 || info.height !== 1448)
    throw Error("Expected the supplied 1086×1448 artwork");
  await mkdir(dir, { recursive: true });
  const delivery = [];
  for (const width of [768, 1536]) {
    const file = `ciel-${width}.webp`;
    const result = await sharp(bytes)
      .rotate()
      .resize({ width, withoutEnlargement: true })
      .webp({ quality: 94, effort: 6 })
      .toBuffer({ resolveWithObject: true });
    await writeFile(join(dir, file), result.data);
    delivery.push({
      file,
      width: result.info.width,
      height: result.info.height,
      bytes: result.data.length,
      sha256: hash(result.data),
    });
  }
  await writeFile(
    join(dir, "artwork.json"),
    JSON.stringify(
      { sourceSha256: hash(bytes), sourceWidth: info.width, sourceHeight: info.height, delivery },
      null,
      2,
    ) + "\n",
  );
  console.log(delivery);
}
