#!/usr/bin/env node
/** Pack the Blender optical nanite without changing the shared swarm's layout.
 * Render first with scripts/blender/illusionculum_nanite_cells.py.
 * node scripts/build-illusionculum-nanites.mjs [--renders=/tmp/illusionculum-nanite-renders] [--check]
 * The unchanged bead/spark cells are inherited from the shared Blender kit.
 */
import sharp from "sharp";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve, join } from "node:path";
const root = resolve(import.meta.dirname, "..");
const renders =
  process.argv.find((a) => a.startsWith("--renders="))?.slice(10) ??
  "/private/tmp/illusionculum-nanite-renders";
const dir = join(root, "public/illusionculum-nanites-20261027");
const dest = join(dir, "cells.webp");
const source = join(root, "public/rexonance-nanites-20261023/cells.webp");
const scene = await readFile(join(root, "scripts/blender/illusionculum_nanite_cells.py"));
const hash = (b) => createHash("sha256").update(b).digest("hex");
if (process.argv.includes("--check")) {
  const bytes = await readFile(dest);
  const meta = await sharp(bytes).metadata();
  const provenance = JSON.parse(await readFile(join(dir, "provenance.json"), "utf8"));
  if (meta.width !== 768 || meta.height !== 224 || !meta.hasAlpha)
    throw Error("Nanite layout or alpha changed");
  if (bytes.length > 100000) throw Error("Nanite delivery exceeds 100KB budget");
  if (provenance.sceneSha256 !== hash(scene) || provenance.atlasSha256 !== hash(bytes))
    throw Error("Scene/atlas provenance differs");
  console.log(`Illusionculum Blender atlas verified: ${bytes.length} bytes`);
} else {
  const layers = [];
  const tones = ["ice", "pink", "white", "gold"];
  const mipX = [0, 384, 0, 384],
    mipY = [128, 128, 144, 144];
  for (let t = 0; t < 4; t++) {
    for (let f = 0; f < 24; f++) {
      const name = join(renders, `tumble-${tones[t]}-${String(f).padStart(2, "0")}.png`);
      layers.push({
        input: await sharp(name).resize(32, 32).png().toBuffer(),
        left: f * 32,
        top: t * 32,
      });
      layers.push({
        input: await sharp(name).resize(16, 16).png().toBuffer(),
        left: mipX[t] + f * 16,
        top: mipY[t],
      });
    }
    const face = join(renders, `tumble-${tones[t]}-00.png`);
    if (t < 3)
      for (let k = 0; k < 7; k++)
        layers.push({
          input: await sharp(k ? join(renders, `unfold-${tones[t]}-${k}.png`) : face)
            .resize(32, 32)
            .png()
            .toBuffer(),
          left: t * 224 + k * 32,
          top: 160,
        });
    layers.push({
      input: await sharp(face).resize(32, 32).blur(2.5).png().toBuffer(),
      left: [672, 704, 736, 256][t],
      top: t < 3 ? 160 : 192,
    });
  }
  const sheet = await sharp(source).ensureAlpha().raw().toBuffer();
  // Replace whole cells, including transparent pixels: compositing over the
  // old chip would leave its silhouette behind the new optical geometry.
  for (const layer of layers) {
    const { data, info } = await sharp(layer.input)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    for (let y = 0; y < info.height; y++)
      data.copy(
        sheet,
        ((layer.top + y) * 768 + layer.left) * 4,
        y * info.width * 4,
        (y + 1) * info.width * 4,
      );
  }
  const bytes = await sharp(sheet, { raw: { width: 768, height: 224, channels: 4 } })
    .webp({ quality: 90, alphaQuality: 100, effort: 6, smartSubsample: true })
    .toBuffer();
  await mkdir(dir, { recursive: true });
  await writeFile(dest, bytes);
  await writeFile(
    join(dir, "provenance.json"),
    JSON.stringify(
      {
        renderer: "Blender 4.5.9 / Cycles CPU",
        samples: 24,
        renderSize: 96,
        frames: 120,
        scene: "scripts/blender/illusionculum_nanite_cells.py",
        sceneSha256: hash(scene),
        inheritedFxSha256: hash(await readFile(source)),
        atlasSha256: hash(bytes),
        bytes: bytes.length,
      },
      null,
      2,
    ) + "\n",
  );
  console.log(`Packed ${bytes.length} bytes`);
}
