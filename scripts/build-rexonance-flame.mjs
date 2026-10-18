#!/usr/bin/env node
/** Pack Blender's real volumetric renders. No runtime Blender dependency.
 *
 * Render:
 *   /path/to/Blender -b --factory-startup -P scripts/blender/rexonance_flame.py -- \
 *     output/playwright/flame-production --frames 32 --samples 64 --scale 2 --render-loop-check
 * Pack:  node scripts/build-rexonance-flame.mjs
 * Check: node scripts/build-rexonance-flame.mjs --check
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir, stat } from "node:fs/promises";
import { resolve, join } from "node:path";
import sharp from "sharp";
import { format, resolveConfig } from "prettier";

const root = resolve(import.meta.dirname, "..");
const source = resolve(
  root,
  process.env.REXONANCE_FLAME_RENDERS || "output/playwright/flame-production",
);
const destination = resolve(root, "public/rexonance-flame-20261019");
const file = join(destination, "flame.webp");
const manifestFile = join(destination, "manifest.json");
const hash = (data) => createHash("sha256").update(data).digest("hex");
const columns = 8;
const rows = 4;
const frameWidth = 128;
const frameHeight = 256;
const frames = columns * rows;
const budgetBytes = 500_000;
// A bounded volume has a geometric base. Feather only its opacity into the
// surrounding fire bed, so stacked sprites never expose a horizontal cut.
// This is finishing of the rendered volume, not a replacement flame shape.
const rootFeather = { startY: 228, endY: 248, curve: "1 - smoothstep(0, 1, t)", alphaOnly: true };
const sourceAnchor = [frameWidth / 2, rootFeather.endY];

if (process.argv.includes("--check")) {
  const manifest = JSON.parse(await readFile(manifestFile, "utf8"));
  const bytes = await readFile(file);
  const metadata = await sharp(bytes).metadata();
  assert.equal(metadata.width, columns * frameWidth);
  assert.equal(metadata.height, rows * frameHeight);
  assert.equal(metadata.hasAlpha, true);
  assert.equal(hash(bytes), manifest.asset.sha256);
  assert.equal(bytes.length, manifest.asset.bytes);
  assert.ok(bytes.length <= budgetBytes, "flame atlas exceeds byte budget");
  for (const path of manifest.sources) {
    assert.equal(
      hash(await readFile(join(root, path.path))),
      path.sha256,
      `stale source ${path.path}`,
    );
  }
  assert.ok(manifest.render.loopGeometryMaxDelta < 0.000001);
  assert.equal(manifest.loopPixelCheck.differentChannels, 0);
  console.log(
    JSON.stringify({
      valid: true,
      bytes: bytes.length,
      dimensions: [metadata.width, metadata.height],
      frames,
    }),
  );
  process.exit(0);
}

const provenance = JSON.parse(await readFile(join(source, "render-provenance.json"), "utf8"));
assert.equal(provenance.frames, frames);
assert.equal(
  provenance.loopCheckRendered,
  true,
  "render with --render-loop-check before publishing",
);
const first = await sharp(join(source, "flame-00.png")).ensureAlpha().raw().toBuffer();
const loop = await sharp(join(source, "loop-check.png")).ensureAlpha().raw().toBuffer();
assert.equal(first.length, loop.length);
let differentChannels = 0;
let maxChannelDelta = 0;
for (let i = 0; i < first.length; i += 1) {
  const difference = Math.abs(first[i] - loop[i]);
  if (difference > 0) differentChannels += 1;
  maxChannelDelta = Math.max(maxChannelDelta, difference);
}
assert.equal(differentChannels, 0, "the separately rendered closing frame differs from frame zero");
const images = [];
const renderHashes = [];
const contentBounds = {
  left: frameWidth,
  top: frameHeight,
  right: -1,
  bottom: -1,
  alphaThreshold: 8,
};
for (let frame = 0; frame < frames; frame += 1) {
  const name = `flame-${String(frame).padStart(2, "0")}.png`;
  const png = await readFile(join(source, name));
  const rgba = await sharp(png)
    .resize(frameWidth, frameHeight, { kernel: "lanczos3" })
    .ensureAlpha()
    .raw()
    .toBuffer();
  for (let y = rootFeather.startY; y < frameHeight; y += 1) {
    const t = Math.min(1, (y - rootFeather.startY) / (rootFeather.endY - rootFeather.startY));
    const opacity = 1 - t * t * (3 - 2 * t);
    for (let x = 0; x < frameWidth; x += 1) {
      const alpha = (y * frameWidth + x) * 4 + 3;
      rgba[alpha] = Math.round(rgba[alpha] * opacity);
    }
  }
  const input = await sharp(rgba, { raw: { width: frameWidth, height: frameHeight, channels: 4 } })
    .png()
    .toBuffer();
  for (let y = 0; y < frameHeight; y += 1) {
    for (let x = 0; x < frameWidth; x += 1) {
      if (rgba[(y * frameWidth + x) * 4 + 3] <= contentBounds.alphaThreshold) continue;
      contentBounds.left = Math.min(contentBounds.left, x);
      contentBounds.right = Math.max(contentBounds.right, x);
      contentBounds.top = Math.min(contentBounds.top, y);
      contentBounds.bottom = Math.max(contentBounds.bottom, y);
    }
  }
  renderHashes.push({ frame, sha256: hash(png), bytes: png.length });
  images.push({
    input,
    left: (frame % columns) * frameWidth,
    top: Math.floor(frame / columns) * frameHeight,
  });
}
const atlas = sharp({
  create: {
    width: columns * frameWidth,
    height: rows * frameHeight,
    channels: 4,
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  },
}).composite(images);
const webp = await atlas
  .webp({ quality: 88, alphaQuality: 100, effort: 6, smartSubsample: true })
  .toBuffer();
assert.ok(webp.length <= budgetBytes, `atlas is ${webp.length} bytes, budget ${budgetBytes}`);
await mkdir(destination, { recursive: true });
await writeFile(file, webp);
const sourceFiles = ["scripts/blender/rexonance_flame.py", "scripts/build-rexonance-flame.mjs"];
const sources = await Promise.all(
  sourceFiles.map(async (path) => ({ path, sha256: hash(await readFile(join(root, path))) })),
);
await writeFile(
  manifestFile,
  await format(
    `${JSON.stringify(
      {
        version: 1,
        asset: {
          path: "/rexonance-flame-20261019/flame.webp",
          sha256: hash(webp),
          bytes: webp.length,
          width: columns * frameWidth,
          height: rows * frameHeight,
          alpha: true,
        },
        atlas: {
          columns,
          rows,
          frames,
          frameWidth,
          frameHeight,
          order: "left-to-right, top-to-bottom",
          framesPerSecond: 16,
          durationSeconds: 2,
          origin: "bottom centre",
          direction: "up",
          contentBounds,
          sourceAnchor,
        },
        render: provenance,
        encoding: {
          format: "WebP",
          quality: 88,
          alphaQuality: 100,
          kernel: "lanczos3",
          budgetBytes,
          rootFeather,
        },
        loopPixelCheck: {
          differentChannels,
          maxChannelDelta,
          compared: "frame 0 and separately rendered frame 32",
        },
        sources,
        renderHashes,
      },
      null,
      2,
    )}\n`,
    { ...(await resolveConfig(manifestFile)), parser: "json" },
  ),
);
console.log(
  JSON.stringify({ asset: file, bytes: (await stat(file)).size, frames, differentChannels }),
);
