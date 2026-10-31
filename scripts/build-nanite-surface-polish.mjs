#!/usr/bin/env node
/** Repack material-only Blender renders over the approved atlas alpha/layout.
 * First render each existing scene through scripts/blender/nanite_surface_polish.py.
 * node scripts/build-nanite-surface-polish.mjs [--renders=/tmp/world-lab-nanite] [--check]
 * Never writes the source atlases, geometry, particle schedules or frame counts.
 */
import sharp from "sharp";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve, join } from "node:path";
const root = resolve(import.meta.dirname, "..");
const prefix =
  process.argv.find((value) => value.startsWith("--renders="))?.slice(10) ||
  "/tmp/world-lab-nanite";
const directory = "nanite-surface-20261031";
const out = join(root, "public", directory);
const hash = (data) => createHash("sha256").update(data).digest("hex");
const specs = {
  rexonance: [
    "rexonance-nanites-20261023/cells.webp",
    "nanite_cells.py",
    ["ice", "pink", "white", "gold"],
  ],
  "far-from": [
    "far-from-nanites-20261022/cells.webp",
    "farfrom_nanite_cells.py",
    ["aqua", "prism", "silver", "gold"],
  ],
  illusionculum: [
    "illusionculum-nanites-20261027/cells.webp",
    "illusionculum_nanite_cells.py",
    ["ice", "pink", "white", "gold"],
  ],
};
const alpha = (data) =>
  Buffer.from(Array.from({ length: data.length / 4 }, (_, i) => data[i * 4 + 3]));
const wrapper = await readFile(join(root, "scripts/blender/nanite_surface_polish.py"));
if (process.argv.includes("--check")) {
  const receipt = JSON.parse(await readFile(join(out, "provenance.json"), "utf8"));
  for (const [name, [source, scene]] of Object.entries(specs)) {
    const bytes = await readFile(join(out, `${name}.webp`));
    const baseline = await sharp(join(root, "public", source))
      .ensureAlpha()
      .raw()
      .toBuffer();
    const { data, info } = await sharp(bytes)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    if (info.width !== 768 || info.height !== 224 || bytes.length > 110000)
      throw Error(`${name}: layout/budget`);
    if (!alpha(data).equals(alpha(baseline))) throw Error(`${name}: alpha silhouette changed`);
    if (hash(bytes) !== receipt.assets[name].sha256 || hash(wrapper) !== receipt.wrapperSha256)
      throw Error(`${name}: provenance mismatch`);
    if (
      hash(await readFile(join(root, "scripts/blender", scene))) !==
      receipt.assets[name].sceneSha256
    )
      throw Error(`${name}: scene changed`);
    console.log(`${name}: 768×224, original alpha preserved, ${bytes.length} bytes`);
  }
} else {
  await mkdir(out, { recursive: true });
  const receipt = {
    blender: "4.5.9 LTS / Cycles CPU",
    wrapperSha256: hash(wrapper),
    geometry: "original scene meshes, cameras, rotations and frame count unchanged",
    alpha: "byte-identical to approved source atlas",
    assets: {},
  };
  for (const [name, [source, scene, tones]] of Object.entries(specs)) {
    const originalBytes = await readFile(join(root, "public", source));
    const raw = await sharp(originalBytes).ensureAlpha().raw().toBuffer();
    const originalAlpha = alpha(raw);
    const paint = async (filename, x, y, size) => {
      const pixels = await sharp(join(`${prefix}-${name}`, filename))
        .resize(size, size, { kernel: "lanczos3" })
        .ensureAlpha()
        .raw()
        .toBuffer();
      for (let row = 0; row < size; row++)
        for (let col = 0; col < size; col++) {
          const to = ((y + row) * 768 + x + col) * 4,
            from = (row * size + col) * 4;
          // Retain the exact approved edge coverage; change only surface RGB.
          if (raw[to + 3]) {
            raw[to] = pixels[from];
            raw[to + 1] = pixels[from + 1];
            raw[to + 2] = pixels[from + 2];
          }
        }
    };
    for (let t = 0; t < 4; t++) {
      for (let f = 0; f < 24; f++) {
        const file = `tumble-${tones[t]}-${String(f).padStart(2, "0")}.png`;
        await paint(file, f * 32, t * 32, 32);
        await paint(file, [0, 384, 0, 384][t] + f * 16, [128, 128, 144, 144][t], 16);
      }
      if (t < 3)
        for (let f = 0; f < 7; f++)
          await paint(
            f ? `unfold-${tones[t]}-${f}.png` : `tumble-${tones[t]}-00.png`,
            t * 224 + f * 32,
            160,
            32,
          );
    }
    const bytes = await sharp(raw, { raw: { width: 768, height: 224, channels: 4 } })
      .webp({ quality: 90, alphaQuality: 100, effort: 6, smartSubsample: true })
      .toBuffer();
    const encoded = await sharp(bytes).ensureAlpha().raw().toBuffer();
    if (!alpha(encoded).equals(originalAlpha)) throw Error(`${name}: encoder changed alpha`);
    if (bytes.length > 110000) throw Error(`${name}: delivery budget exceeded`);
    await writeFile(join(out, `${name}.webp`), bytes);
    receipt.assets[name] = {
      source: `/${source}`,
      sourceSha256: hash(originalBytes),
      scene: `scripts/blender/${scene}`,
      sceneSha256: hash(await readFile(join(root, "scripts/blender", scene))),
      sha256: hash(bytes),
      bytes: bytes.length,
      alphaSha256: hash(originalAlpha),
      frames: 24,
      cell: 32,
      width: 768,
      height: 224,
    };
    console.log(`${name}: ${bytes.length} bytes`);
  }
  await writeFile(join(out, "provenance.json"), `${JSON.stringify(receipt, null, 2)}\n`);
}
