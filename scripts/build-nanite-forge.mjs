#!/usr/bin/env node
/**
 * Pack Cycles plates into the existing cell UV layout and a separate Rexonance clasp sheet.
 *
 * blender -b --factory-startup --python-exit-code 1 -P scripts/blender/nanite_forge.py -- /tmp/nanite-forge
 * node scripts/build-nanite-forge.mjs --renders=/tmp/nanite-forge
 * node scripts/build-nanite-forge.mjs --check
 */
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import sharp from "sharp";

const root = resolve(import.meta.dirname, "..");
const renders =
  process.argv.find((arg) => arg.startsWith("--renders="))?.slice(10) || "/tmp/nanite-forge";
const output = join(root, "public/nanite-forge-20261118");
const scene = "scripts/blender/nanite_forge.py";
const riders = {
  rexonance: "rexonance-nanites-20261023/cells.webp",
  "far-from": "far-from-nanites-20261022/cells.webp",
  illusionculum: "illusionculum-nanites-20261027/cells.webp",
};
const names = [...Object.keys(riders), "rexonance-clasps"];
const digest = (value) => createHash("sha256").update(value).digest("hex");
const alpha = (raw) => Buffer.from(raw.filter((_, index) => index % 4 === 3));
const rgba = (buffer) => sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });

async function extractTile(file, fromX, fromY, inputSize, size) {
  return sharp(file)
    .extract({
      left: fromX * inputSize,
      top: fromY * inputSize,
      width: inputSize,
      height: inputSize,
    })
    .resize(size, size, { kernel: "lanczos3" })
    .ensureAlpha()
    .raw()
    .toBuffer();
}

function setTile(destination, stride, tile, x, y, size) {
  for (let row = 0; row < size; row++) {
    tile.copy(destination, ((y + row) * stride + x) * 4, row * size * 4, (row + 1) * size * 4);
  }
}

function spec(name) {
  return name === "rexonance-clasps"
    ? { width: 512, height: 512, cell: 128, frames: 4, maxBytes: 140000 }
    : { width: 768, height: 224, cell: 32, frames: 24, maxBytes: 110000 };
}

function occupancy(raw, stride, x, y, tile, label) {
  let minX = tile;
  let minY = tile;
  let maxX = -1;
  let maxY = -1;
  let pixels = 0;
  for (let row = 0; row < tile; row++) {
    for (let col = 0; col < tile; col++) {
      if (raw[((y + row) * stride + x + col) * 4 + 3] < 64) continue;
      minX = Math.min(minX, col);
      maxX = Math.max(maxX, col);
      minY = Math.min(minY, row);
      maxY = Math.max(maxY, row);
      pixels++;
    }
  }
  if (pixels < tile * tile * 0.12 || minX < 1 || minY < 1 || maxX >= tile - 1 || maxY >= tile - 1)
    throw Error(`${label}: empty or clipped tile at ${x}, ${y}`);
  return { minX, minY, maxX, maxY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

async function verify(name, bytes) {
  const { width, height, cell, frames, maxBytes } = spec(name);
  const { data, info } = await rgba(bytes);
  if (info.width !== width || info.height !== height || bytes.length > maxBytes)
    throw Error(
      `${name}: dimensions or WebP budget (${info.width}×${info.height}, ${bytes.length} bytes)`,
    );
  for (let tone = 0; tone < 4; tone++) {
    if (cell === 128) {
      for (let row = 0; row < 4; row++) {
        const box = occupancy(data, width, tone * cell, row * cell, cell, name);
        if (Math.min(box.width, box.height) < 90 || Math.max(box.width, box.height) > 114)
          throw Error(`${name}: clasp footprint outside budget at tone ${tone}, pose ${row}`);
        if (
          Math.abs((box.minX + box.maxX + 1) / 2 - cell / 2) > 7 ||
          Math.abs((box.minY + box.maxY + 1) / 2 - cell / 2) > 7
        )
          throw Error(`${name}: clasp not centered at tone ${tone}, pose ${row}`);
      }
      continue;
    }
    for (let frame = 0; frame < 24; frame++) {
      occupancy(data, width, frame * cell, tone * cell, cell, name);
      occupancy(
        data,
        width,
        (tone % 2) * 384 + frame * 16,
        128 + Math.floor(tone / 2) * 16,
        16,
        name,
      );
    }
    if (tone < 3) {
      for (let frame = 0; frame < 7; frame++) {
        const box = occupancy(data, width, (tone * 7 + frame) * cell, 160, cell, name);
        if (frame === 6 && Math.min(box.width, box.height) < 28)
          throw Error(`${name}: backing shoe misses the 28px terminal footprint`);
      }
    }
  }
  if (riders[name]) {
    const original = (await rgba(join(root, "public", riders[name]))).data;
    if (
      alpha(data.subarray(0, width * cell * 4)).equals(
        alpha(original.subarray(0, width * cell * 4)),
      )
    )
      throw Error(`${name}: tumble silhouette matches original`);
  }
  return { width, height, cell, frames, bytes: bytes.length, sha256: digest(bytes) };
}

async function pack(name) {
  const file = join(renders, `${name}.png`);
  const { width, height, cell } = spec(name);
  // Preserve the original defocused particles, molten beads and star glints.
  const raw = riders[name]
    ? (await rgba(join(root, "public", riders[name]))).data
    : Buffer.alloc(width * height * 4);
  const paint = async (fromX, fromY, inputSize, x, y, size) =>
    setTile(raw, width, await extractTile(file, fromX, fromY, inputSize, size), x, y, size);
  for (let tone = 0; tone < 4; tone++) {
    if (cell === 128) {
      for (let row = 0; row < 4; row++) {
        await paint(tone, row, 192, tone * 128, row * 128, cell);
      }
      continue;
    }
    for (let frame = 0; frame < 24; frame++) {
      await paint(frame, tone, 64, frame * cell, tone * cell, cell);
      await paint(
        frame,
        tone,
        64,
        (tone % 2) * 384 + frame * 16,
        128 + Math.floor(tone / 2) * 16,
        16,
      );
    }
    if (tone < 3) {
      for (let frame = 0; frame < 7; frame++) {
        await paint(frame === 0 ? 0 : 23 + frame, tone, 64, (tone * 7 + frame) * cell, 160, cell);
      }
    }
  }
  return sharp(raw, { raw: { width, height, channels: 4 } })
    .webp({ quality: 82, alphaQuality: 100, effort: 6, smartSubsample: true })
    .toBuffer();
}

const sceneSha256 = digest(await readFile(join(root, scene)));
const receiptFile = join(output, "provenance.json");
const checking = process.argv.includes("--check");
const receipt = checking
  ? JSON.parse(await readFile(receiptFile, "utf8"))
  : {
      blender: (await readFile(join(renders, "blender-version.txt"), "utf8")).trim(),
      scene,
      sceneSha256,
      assets: {},
    };
if (receipt.scene !== scene || receipt.sceneSha256 !== sceneSha256)
  throw Error("Blender scene provenance mismatch");

if (!checking) await mkdir(output, { recursive: true });
for (const name of names) {
  const file = join(output, `${name}.webp`);
  const bytes = checking ? await readFile(file) : await pack(name);
  const asset = await verify(name, bytes);
  if (checking) {
    for (const [field, value] of Object.entries(asset)) {
      if (receipt.assets[name]?.[field] !== value)
        throw Error(`${name}: provenance mismatch for ${field}`);
    }
  } else {
    await writeFile(file, bytes);
    receipt.assets[name] = asset;
  }
  console.log(`${name}: ${asset.width}×${asset.height}, ${asset.bytes} bytes`);
}
if (!checking) await writeFile(receiptFile, `${JSON.stringify(receipt, null, 2)}\n`);
