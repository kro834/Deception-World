#!/usr/bin/env node
/** Reproduce the real Blender volume jet without a runtime 3D dependency.
 * /path/to/Blender -b --factory-startup -P scripts/blender/ciel_inferno_jet.py --
 *   output/playwright/ciel-inferno-production --samples 64 --scale 2 --loop-check
 * node scripts/build-ciel-inferno-jet.mjs
 * node scripts/build-ciel-inferno-jet.mjs --check
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, join } from "node:path";
import { format, resolveConfig } from "prettier";
import sharp from "sharp";

const root = resolve(import.meta.dirname, "..");
const source = resolve(
  root,
  process.env.CIEL_JET_RENDERS || "output/playwright/ciel-inferno-production",
);
const output = join(root, "public/ciel-inferno-20261019");
const assetPath = join(output, "jet.webp");
const manifestPath = join(output, "jet-manifest.json");
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const width = 256,
  height = 128,
  frames = 32,
  columns = 8,
  rows = 4,
  budgetBytes = 600_000;
const feather = { inlet: [8, 22], outlet: [235, 256], curve: "smoothstep", alphaOnly: true };
const anchor = [8, 64];
const smooth = (t) => {
  const x = Math.max(0, Math.min(1, t));
  return x * x * (3 - 2 * x);
};

if (process.argv.includes("--check")) {
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const asset = await readFile(assetPath);
  const metadata = await sharp(asset).metadata();
  assert.equal(metadata.width, width * columns);
  assert.equal(metadata.height, height * rows);
  assert.equal(metadata.hasAlpha, true);
  assert.equal(hash(asset), manifest.asset.sha256);
  assert.equal(asset.length, manifest.asset.bytes);
  assert.ok(asset.length <= budgetBytes);
  for (const item of manifest.sources)
    assert.equal(
      hash(await readFile(join(root, item.path))),
      item.sha256,
      `stale source ${item.path}`,
    );
  assert.equal(manifest.loopPixelCheck.differentChannels, 0);
  assert.ok(manifest.render.loopGeometryMaxDelta < 0.000001);
  assert.equal(manifest.render.enclosureNormals, "outward");
  assert.ok(manifest.render.signedVolumeMin > 0);
  assert.deepEqual(manifest.atlas.sourceAnchor, anchor);
  console.log(
    JSON.stringify({
      valid: true,
      bytes: asset.length,
      frames,
      size: [metadata.width, metadata.height],
    }),
  );
  process.exit(0);
}

const render = JSON.parse(await readFile(join(source, "render-provenance.json"), "utf8"));
assert.equal(render.loopCheckRendered, true, "Blender requires --loop-check");
assert.equal(render.enclosureNormals, "outward");
assert.ok(render.signedVolumeMin > 0);
const first = await sharp(join(source, "jet-00.png")).ensureAlpha().raw().toBuffer();
const closing = await sharp(join(source, "loop-check.png")).ensureAlpha().raw().toBuffer();
assert.equal(first.length, closing.length);
let differentChannels = 0,
  maxChannelDelta = 0;
for (let i = 0; i < first.length; i += 1) {
  const delta = Math.abs(first[i] - closing[i]);
  differentChannels += delta > 0 ? 1 : 0;
  maxChannelDelta = Math.max(maxChannelDelta, delta);
}
assert.equal(differentChannels, 0, "independently rendered loop closure changed pixels");
const images = [],
  renderHashes = [];
const contentBounds = { left: width, top: height, right: -1, bottom: -1, alphaThreshold: 8 };
for (let frame = 0; frame < frames; frame += 1) {
  const png = await readFile(join(source, `jet-${String(frame).padStart(2, "0")}.png`));
  const rgba = await sharp(png)
    .resize(width, height, { kernel: "lanczos3" })
    .ensureAlpha()
    .raw()
    .toBuffer();
  for (let y = 0; y < height; y += 1)
    for (let x = 0; x < width; x += 1) {
      const alpha = (y * width + x) * 4 + 3;
      const opacity =
        smooth((x - feather.inlet[0]) / (feather.inlet[1] - feather.inlet[0])) *
        (1 - smooth((x - feather.outlet[0]) / (feather.outlet[1] - feather.outlet[0])));
      rgba[alpha] = Math.round(rgba[alpha] * opacity);
      if (rgba[alpha] <= contentBounds.alphaThreshold) continue;
      contentBounds.left = Math.min(contentBounds.left, x);
      contentBounds.right = Math.max(contentBounds.right, x);
      contentBounds.top = Math.min(contentBounds.top, y);
      contentBounds.bottom = Math.max(contentBounds.bottom, y);
    }
  const input = await sharp(rgba, { raw: { width, height, channels: 4 } })
    .png()
    .toBuffer();
  images.push({
    input,
    left: (frame % columns) * width,
    top: Math.floor(frame / columns) * height,
  });
  renderHashes.push({ frame, sha256: hash(png), bytes: png.length });
}
const atlas = await sharp({
  create: {
    width: width * columns,
    height: height * rows,
    channels: 4,
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  },
})
  .composite(images)
  .webp({ quality: 88, alphaQuality: 100, effort: 6, smartSubsample: true })
  .toBuffer();
assert.ok(atlas.length <= budgetBytes, `${atlas.length} bytes exceeds ${budgetBytes}`);
const sources = await Promise.all(
  ["scripts/blender/ciel_inferno_jet.py", "scripts/build-ciel-inferno-jet.mjs"].map(
    async (path) => ({ path, sha256: hash(await readFile(join(root, path))) }),
  ),
);
const manifest = {
  version: 1,
  asset: {
    path: "/ciel-inferno-20261019/jet.webp",
    sha256: hash(atlas),
    bytes: atlas.length,
    width: width * columns,
    height: height * rows,
    alpha: true,
  },
  atlas: {
    columns,
    rows,
    frames,
    frameWidth: width,
    frameHeight: height,
    order: "left-to-right, top-to-bottom",
    framesPerSecond: 16,
    durationSeconds: 2,
    sourceAnchor: anchor,
    direction: "right",
    contentBounds,
  },
  render,
  encoding: {
    format: "WebP",
    quality: 88,
    alphaQuality: 100,
    kernel: "lanczos3",
    budgetBytes,
    feather,
  },
  loopPixelCheck: {
    differentChannels,
    maxChannelDelta,
    compared: "frame 0 and separately rendered frame 32",
  },
  sources,
  renderHashes,
};
await mkdir(output, { recursive: true });
await writeFile(assetPath, atlas);
await writeFile(
  manifestPath,
  await format(JSON.stringify(manifest), {
    ...(await resolveConfig(manifestPath)),
    parser: "json",
  }),
);
console.log(
  JSON.stringify({
    asset: assetPath,
    bytes: atlas.length,
    sha256: hash(atlas),
    frames,
    differentChannels,
  }),
);
