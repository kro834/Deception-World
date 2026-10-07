import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { zstdDecompressSync } from "node:zlib";
import sharp from "sharp";

const readBytes = (path) => readFileSync(new URL(`../${path}`, import.meta.url));
const readJson = (path) => JSON.parse(readBytes(path).toString("utf8"));
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

const runtimeDirectory = "public/ultra-materials";
const manifest = readJson(`${runtimeDirectory}/manifest.json`);

function inspectPng(bytes, name) {
  assert.ok(bytes.length >= 33, `${name} must contain a complete PNG header`);
  assert.deepEqual(
    [...bytes.subarray(0, 8)],
    [137, 80, 78, 71, 13, 10, 26, 10],
    `${name} must have the PNG signature`,
  );
  assert.equal(bytes.readUInt32BE(8), 13, `${name} first chunk must be IHDR`);
  assert.equal(bytes.toString("ascii", 12, 16), "IHDR", `${name} first chunk must be IHDR`);
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  assert.equal(width, manifest.resolution, `${name} width must match the manifest`);
  assert.equal(height, manifest.resolution, `${name} height must match the manifest`);
  assert.equal(bytes[24], 8, `${name} must use 8-bit channels`);
  assert.ok([2, 6].includes(bytes[25]), `${name} must use RGB or RGBA channels`);
  assert.equal(bytes[26], 0, `${name} must use the standard PNG compression method`);
  assert.equal(bytes[27], 0, `${name} must use the standard PNG filter method`);
  assert.equal(bytes[28], 0, `${name} must not use interlacing`);
}

test("Blender 5.2 artwork-mount maps match their manifest and source scene", () => {
  assert.equal(manifest.schemaVersion, 1);
  assert.equal(manifest.generator, "scripts/build-ultra-materials.py");
  assert.match(manifest.blenderVersion, /^5\.2(?:\.|$)/);
  assert.equal(manifest.engine, "CYCLES");
  assert.equal(manifest.device, "CPU");
  assert.equal(manifest.resolution, 1024);
  assert.match(manifest.purpose, /artwork mounts/i);
  assert.match(manifest.purpose, /no artwork baked/i);

  const generator = readBytes(manifest.generator);
  assert.equal(
    sha256(generator),
    manifest.generatorSha256,
    "the manifest must identify the exact Blender generator source",
  );

  const expectedMaps = {
    normal: {
      file: "brushed-alloy-normal.png",
      colorSpace: "linear",
      repeat: true,
    },
    roughness: {
      file: "brushed-alloy-roughness.png",
      colorSpace: "linear",
      channel: "R",
      repeat: true,
    },
  };
  const mapHashes = [];
  for (const [kind, expected] of Object.entries(expectedMaps)) {
    const record = manifest.maps[kind];
    assert.ok(record, `manifest must identify the ${kind} map`);
    assert.equal(record.file, expected.file);
    assert.equal(record.colorSpace, expected.colorSpace);
    assert.equal(record.repeat, expected.repeat);
    if (expected.channel) assert.equal(record.channel, expected.channel);
    const bytes = readBytes(`${runtimeDirectory}/${record.file}`);
    inspectPng(bytes, record.file);
    const digest = sha256(bytes);
    assert.equal(digest, record.sha256, `${record.file} must match its manifest hash`);
    mapHashes.push(digest);
  }
  assert.notEqual(mapHashes[0], mapHashes[1], "normal and roughness identities must differ");

  assert.deepEqual(manifest.material.baseColorLinear, [0.018, 0.026, 0.037]);
  assert.equal(manifest.material.metallic, 1);
  assert.equal(manifest.material.anisotropy, 0.62);
  assert.deepEqual(manifest.material.roughnessRange, [0.311, 0.459]);
  assert.equal(manifest.material.normalConvention, "Tangent OpenGL +X +Y +Z");
  assert.match(manifest.material.uvBrushDirection, /U/);

  const blendName = manifest.provenance?.blend;
  assert.equal(blendName, "ultra-brushed-alloy.blend");
  const blend = readBytes(`design/ultra-materials/${blendName}`);
  const zstdMagic = Buffer.from([0x28, 0xb5, 0x2f, 0xfd]);
  const blenderScene = blend.toString("ascii", 0, 7) === "BLENDER"
    ? blend
    : blend.subarray(0, 4).equals(zstdMagic)
      ? zstdDecompressSync(blend)
      : assert.fail("provenance must be a Blender scene or Zstandard-compressed Blender scene");
  assert.equal(blenderScene.toString("ascii", 0, 7), "BLENDER", "provenance must be a Blender scene");
  assert.equal(
    sha256(blend),
    manifest.provenance.blendSha256,
    "the packed source scene must match the published asset identity",
  );

  const provenanceManifest = readJson("design/ultra-materials/manifest.json");
  assert.deepEqual(provenanceManifest, manifest);
});

test("transparent frame artwork has a clear aperture and opaque rail samples", async () => {
  const frame = manifest.frame;
  assert.ok(frame, "manifest must identify the frame artwork");
  assert.equal(frame.file, "frame-rim.png");
  assert.equal(frame.colorSpace, "sRGB");
  assert.equal(frame.transparent, true);
  assert.equal(frame.borderImageSlice, 64);
  assert.equal(frame.borderImageFill, false);
  assert.equal(frame.depthMeters, 0.036);
  assert.equal(frame.bevelMeters, 0.003);
  assert.deepEqual(frame.alphaChecks, {
    centerAlphaMax: 0,
    railAlphaMin: 1,
    centerCheckedInsetPx: 68,
  });

  const bytes = readBytes(`${runtimeDirectory}/${frame.file}`);
  inspectPng(bytes, frame.file);
  assert.equal(bytes[25], 6, "the frame PNG must use RGBA channels");
  assert.equal(sha256(bytes), frame.sha256, "the frame artwork must match its manifest hash");

  const { data, info } = await sharp(bytes)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  assert.equal(info.width, 1024);
  assert.equal(info.height, 1024);
  assert.equal(info.channels, 4);
  const alphaAt = (x, y) => data[(y * info.width + x) * info.channels + 3];
  let centerAlphaMax = 0;
  const inset = frame.alphaChecks.centerCheckedInsetPx;
  for (let y = inset; y < info.height - inset; y++) {
    for (let x = inset; x < info.width - inset; x++) {
      centerAlphaMax = Math.max(centerAlphaMax, alphaAt(x, y));
    }
  }
  assert.equal(centerAlphaMax / 255, frame.alphaChecks.centerAlphaMax);

  const railSamples = [
    { x: 512, y: 20 },
    { x: 512, y: 1004 },
    { x: 20, y: 512 },
    { x: 1004, y: 512 },
  ];
  let railAlphaMin = 255;
  for (const { x: centerX, y: centerY } of railSamples) {
    for (let y = centerY - 7; y <= centerY + 8; y++) {
      for (let x = centerX - 7; x <= centerX + 8; x++) {
        railAlphaMin = Math.min(railAlphaMin, alphaAt(x, y));
      }
    }
  }
  assert.equal(railAlphaMin / 255, frame.alphaChecks.railAlphaMin);
});
