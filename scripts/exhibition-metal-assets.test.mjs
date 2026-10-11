import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import test from "node:test";
import { zstdDecompressSync } from "node:zlib";

const readBytes = (path) => readFileSync(new URL(`../${path}`, import.meta.url));
const readJson = (path) => JSON.parse(readBytes(path).toString("utf8"));
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const runtimeDirectory = "public/exhibition-metal";
const designDirectory = "design/exhibition-metal";
const manifest = readJson(`${runtimeDirectory}/manifest.json`);

// Captured before relocation. A manifest edited alongside changed bytes must
// not make a lossy re-encode or an unintended new bake look unchanged.
const preservedHashes = {
  normal: "88bc4dbcfda2058c45ca6fededb0f809b4be42514a1a3cfd79f7fd2cf2b294a3",
  roughness: "86cb3b0cf5b79c0cc723570d436964d488a1dbb474fe0519b15f22bff61e3b8d",
  blend: "b1eb21cb2ca6fc8b1333a1e74c10e9da35aa67800dbe77a47fcd5957f85c06a5",
  preview: "3a167e880df6aeddbb32ca565a781f76b974bec27bf0d7c82531cb3c779e81f9",
  bakeGenerator: "173ca046a9fd094eda2d49694e6644cf47c60463e34a4ec965967e2631bad1e6",
};

function inspectPng(bytes, name) {
  assert.ok(bytes.length >= 33, `${name} must contain a complete PNG header`);
  assert.deepEqual([...bytes.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.equal(bytes.readUInt32BE(8), 13);
  assert.equal(bytes.toString("ascii", 12, 16), "IHDR");
  assert.equal(bytes.readUInt32BE(16), manifest.resolution);
  assert.equal(bytes.readUInt32BE(20), manifest.resolution);
  assert.equal(bytes[24], 8, `${name} must retain 8-bit channels`);
  assert.ok([2, 6].includes(bytes[25]), `${name} must retain RGB or RGBA channels`);
  assert.deepEqual([...bytes.subarray(26, 29)], [0, 0, 0]);
}

test("exhibition metal maps retain their exact original bytes and linear material metadata", () => {
  assert.equal(manifest.schemaVersion, 1);
  assert.match(manifest.blenderVersion, /^5\.2(?:\.|$)/);
  assert.equal(manifest.engine, "CYCLES");
  assert.equal(manifest.device, "CPU");
  assert.equal(manifest.seed, 271828);
  assert.equal(manifest.samples, 64);
  assert.equal(manifest.resolution, 1024);
  assert.match(manifest.purpose, /artwork mounts.*no artwork baked/i);
  assert.deepEqual(Object.keys(manifest.maps).sort(), ["normal", "roughness"]);
  for (const kind of ["normal", "roughness"]) {
    const map = manifest.maps[kind];
    assert.equal(map.file, `brushed-alloy-${kind}.png`);
    assert.equal(map.colorSpace, "linear");
    assert.equal(map.repeat, true);
    if (kind === "roughness") assert.equal(map.channel, "R");
    const bytes = readBytes(`${runtimeDirectory}/${map.file}`);
    inspectPng(bytes, map.file);
    assert.equal(sha256(bytes), preservedHashes[kind]);
    assert.equal(map.sha256, preservedHashes[kind]);
  }
  assert.notEqual(preservedHashes.normal, preservedHashes.roughness);
  assert.deepEqual(manifest.material, {
    baseColorLinear: [0.018, 0.026, 0.037],
    metallic: 1,
    anisotropy: 0.62,
    roughnessRange: [0.311, 0.459],
    normalConvention: "Tangent OpenGL +X +Y +Z",
    uvBrushDirection: "U; rotate UV for vertical frame rails",
  });
});

test("the packed Blender scene and reviewed preview remain byte-identical historical evidence", () => {
  const provenance = manifest.provenance;
  assert.equal(provenance.blend, "exhibition-metal.blend");
  const blend = readBytes(`${designDirectory}/${provenance.blend}`);
  assert.equal(sha256(blend), preservedHashes.blend);
  assert.equal(provenance.blendSha256, preservedHashes.blend);
  const zstdMagic = Buffer.from([0x28, 0xb5, 0x2f, 0xfd]);
  const scene =
    blend.toString("ascii", 0, 7) === "BLENDER"
      ? blend
      : blend.subarray(0, 4).equals(zstdMagic)
        ? zstdDecompressSync(blend)
        : assert.fail("preserved source must remain a Blender or compressed Blender scene");
  assert.equal(scene.toString("ascii", 0, 7), "BLENDER");
  assert.equal(provenance.preview, "brushed-alloy-studio-preview.png");
  assert.equal(
    sha256(readBytes(`${designDirectory}/${provenance.preview}`)),
    preservedHashes.preview,
  );
  assert.equal(provenance.previewSha256, preservedHashes.preview);
  assert.equal(manifest.preservedBake.generatorSha256, preservedHashes.bakeGenerator);
  assert.equal(manifest.preservedBake.bytesUnchanged, true);
  assert.equal(manifest.preservedBake.scope, "maps, packed source scene and studio preview");
  assert.deepEqual(readJson(`${designDirectory}/manifest.json`), manifest);
});

test("the current material-only reproduction script is identified without claiming a new bake", () => {
  assert.equal(manifest.generator, "scripts/build-exhibition-metal.py");
  const generator = readBytes(manifest.generator);
  assert.equal(sha256(generator), manifest.generatorSha256);
  assert.notEqual(manifest.generatorSha256, manifest.preservedBake.generatorSha256);
  assert.equal(manifest.generatorRole, "material reproduction; preserved bake was not regenerated");
  const source = generator.toString("utf8");
  assert.match(source, /default=ROOT \/ "public\/exhibition-metal"/);
  assert.match(source, /default=ROOT \/ "design\/exhibition-metal"/);
  assert.match(source, /scene\.render\.engine = "CYCLES"/);
  assert.match(source, /bake_map\([^\n]*"NORMAL"/);
  assert.match(source, /bake_map\([^\n]*"EMIT"/);
  assert.match(source, /image\.pack\(\)/);
  assert.match(source, /"previewSha256":/);
  assert.doesNotMatch(source, /Ultra|ultra-|frame-rim|create_frame|render_frame|skip_frame_rim/);
  assert.equal(Object.hasOwn(manifest, "frame"), false);
  assert.deepEqual(readdirSync(new URL(`../${runtimeDirectory}/`, import.meta.url)).sort(), [
    "brushed-alloy-normal.png",
    "brushed-alloy-roughness.png",
    "manifest.json",
  ]);
  assert.equal(existsSync(new URL(`../${runtimeDirectory}/frame-rim.png`, import.meta.url)), false);
});

test("the independent room consumes the relocated data maps without retired URLs or mode state", () => {
  const renderer = readBytes("src/lib/exhibition-studio-renderer.ts").toString("utf8");
  for (const kind of ["normal", "roughness"]) {
    assert.ok(
      renderer.includes(`imageTexture("/exhibition-metal/brushed-alloy-${kind}.png", false)`),
    );
  }
  assert.doesNotMatch(renderer, /ultra-materials|ultra-mode|ultra-quality|frame-rim/);
  const docs = readBytes("docs/exhibition-metal-assets.md").toString("utf8");
  assert.match(docs, /preservedBake\.generatorSha256/);
  assert.match(docs, /was not a new Blender render/);
});
