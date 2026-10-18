#!/usr/bin/env node
/** Pack a naturally feathered variant of Blender's existing volume renders.
 * This finishes only alpha; it does not launch or claim a new Blender render.
 * No runtime Blender dependency. The original published atlas stays intact.
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
const assetDirectory = "rexonance-flame-natural-20261019";
const destination = resolve(root, `public/${assetDirectory}`);
const file = join(destination, "flame.webp");
const manifestFile = join(destination, "manifest.json");
const hash = (data) => createHash("sha256").update(data).digest("hex");
const columns = 8;
const rows = 4;
const frameWidth = 128;
const frameHeight = 256;
const frames = columns * rows;
const budgetBytes = 500_000;
// A bounded volume has a geometric base. A wide, asymmetric periodic alpha
// fade removes its horizontal edge without drawing a new flame or changing
// the Blender colours. The central contact approaches the authored anchor;
// neighbouring ends undulate above it instead of meeting a single plane.
const rootFeather = {
  startY: 204,
  startYRange: [202, 206],
  endY: 248,
  endYRange: [227, 248],
  curve: "1 - smoothstep(0, 1, clamp((y - start(x, phase)) / (end(x, phase) - start(x, phase))))",
  start: "204 + 2 * sin(2pi * u * 1.25 + phase)",
  end: "248 - (1 - exp(-((u - 0.5) / 0.17)^2)) * (6 + 10 * wave + 5 * ridge)",
  wave: "0.5 + 0.5 * sin(2pi * u * 1.5 + phase)",
  ridge: "0.5 + 0.5 * sin(2pi * u * 3 - 2 * phase + 0.7)",
  u: "x / 127",
  phase: "2pi * (frame modulo 32) / 32",
  phasePeriodFrames: frames,
  alphaOnly: true,
};
const sourceAnchor = [frameWidth / 2, rootFeather.endY];
const finishRoot = (rgba, frame) => {
  const phase = (((frame % frames) + frames) % frames) * ((Math.PI * 2) / frames);
  for (let x = 0; x < frameWidth; x += 1) {
    const u = x / (frameWidth - 1);
    const start = rootFeather.startY + 2 * Math.sin(Math.PI * 2 * u * 1.25 + phase);
    const contact = Math.exp(-(((u - 0.5) / 0.17) ** 2));
    const wave = 0.5 + 0.5 * Math.sin(Math.PI * 2 * u * 1.5 + phase);
    const ridge = 0.5 + 0.5 * Math.sin(Math.PI * 2 * u * 3 - phase * 2 + 0.7);
    const end = rootFeather.endY - (1 - contact) * (6 + wave * 10 + ridge * 5);
    for (let y = rootFeather.startYRange[0]; y < frameHeight; y += 1) {
      const t = Math.max(0, Math.min(1, (y - start) / (end - start)));
      const opacity = 1 - t * t * (3 - 2 * t);
      const alpha = (y * frameWidth + x) * 4 + 3;
      rgba[alpha] = Math.round(rgba[alpha] * opacity);
    }
  }
  return rgba;
};

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
  assert.equal(manifest.loopPixelCheck.finishedDifferentChannels, 0);
  assert.equal(
    manifest.loopPixelCheck.finishedFirstSha256,
    manifest.loopPixelCheck.finishedClosingSha256,
  );
  assert.equal(manifest.renderReuse.newBlenderRender, false);
  assert.equal(manifest.encoding.rootFeather.alphaOnly, true);
  assert.equal(manifest.encoding.rootFeather.phasePeriodFrames, frames);
  assert.ok(
    sourceAnchor[1] - manifest.atlas.contentBounds.bottom <= 8,
    "visible contact must remain within eight pixels of the authored anchor",
  );
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

const provenanceBytes = await readFile(join(source, "render-provenance.json"));
const provenance = JSON.parse(provenanceBytes.toString("utf8"));
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
const resize = (input) =>
  sharp(input)
    .resize(frameWidth, frameHeight, { kernel: "lanczos3" })
    .ensureAlpha()
    .raw()
    .toBuffer();
const finishedFirst = finishRoot(await resize(join(source, "flame-00.png")), 0);
const finishedClosing = finishRoot(await resize(join(source, "loop-check.png")), frames);
let finishedDifferentChannels = 0;
let finishedMaxChannelDelta = 0;
for (let i = 0; i < finishedFirst.length; i += 1) {
  const difference = Math.abs(finishedFirst[i] - finishedClosing[i]);
  if (difference > 0) finishedDifferentChannels += 1;
  finishedMaxChannelDelta = Math.max(finishedMaxChannelDelta, difference);
}
assert.equal(
  finishedDifferentChannels,
  0,
  "periodic alpha finishing must also match independently rendered frames zero and 32",
);
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
  const rgba = finishRoot(await resize(png), frame);
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
assert.ok(
  sourceAnchor[1] - contentBounds.bottom <= 8,
  `visible contact is ${sourceAnchor[1] - contentBounds.bottom}px above its anchor; maximum 8px`,
);
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
        version: 2,
        asset: {
          path: `/${assetDirectory}/flame.webp`,
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
        renderReuse: {
          kind: "alpha-only finishing of existing Blender-rendered volume frames",
          newBlenderRender: false,
          originalAsset: "/rexonance-flame-20261019/flame.webp",
          provenance: "output/playwright/flame-production/render-provenance.json",
          provenanceSha256: hash(provenanceBytes),
          frames: "the same 32 PNG files recorded in renderHashes",
          colourChangesBeforeEncoding: false,
        },
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
          finishedDifferentChannels,
          finishedMaxChannelDelta,
          finishedFirstSha256: hash(finishedFirst),
          finishedClosingSha256: hash(finishedClosing),
          finishingCompared:
            "the independently rendered frames after periodic alpha-only finishing",
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
