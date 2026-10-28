/** Independently decode the final file with the exact self-hosted three.js decoder bytes. */
import os from "node:os";
import { parseArgs } from "node:util";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
// Input is the final compressed GLB. Its decoded audit GLB is in output-dir.
// This verifier uses the checked-in production decoder, not the npm encoder.
const { values: cli } = parseArgs({
  options: {
    "baseline-glb": { type: "string" },
    "input-glb": { type: "string" },
    "output-dir": { type: "string" },
  },
  strict: true,
});
for (const name of ["baseline-glb", "input-glb", "output-dir"])
  assert(cli[name], `Required --${name}`);
const root = process.cwd(),
  out = path.resolve(cli["output-dir"]),
  inputPath = path.resolve(cli["input-glb"]),
  baselinePath = path.resolve(cli["baseline-glb"]),
  dir = path.join(root, "public/dogs-archive-20261028/decoders/draco"),
  sha = (b) => crypto.createHash("sha256").update(b).digest("hex");
fs.mkdirSync(out, { recursive: true });
const wrapper = fs.readFileSync(path.join(dir, "draco_wasm_wrapper.js")),
  wasm = fs.readFileSync(path.join(dir, "draco_decoder.wasm"));
const decoderDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "guardian-verify-decoder-"));
const cjs = path.join(decoderDirectory, "reviewed-decoder.cjs");
process.once("exit", () => fs.rmSync(decoderDirectory, { recursive: true, force: true }));
fs.writeFileSync(cjs, wrapper);
const moduleFactory = createRequire(import.meta.url)(cjs);
const d = await moduleFactory({ wasmBinary: wasm });
function glb(p) {
  const r = fs.readFileSync(p),
    n = r.readUInt32LE(12);
  return { r, g: JSON.parse(r.subarray(20, 20 + n)), b: r.subarray(28 + n) };
}
const final = glb(inputPath),
  audit = glb(path.join(out, "candidate.decoded-audit.glb")),
  base = glb(baselinePath);
assert.equal(sha(base.r), "814eed150ea2c58e2aaa465f29e38d2bdc2b1aadfd24495dc06849d5a9154ead");
const compression = JSON.parse(
  fs.readFileSync(path.join(out, "compression-validation.json"), "utf8"),
);
assert.equal(sha(final.r), compression.assetSha256);
const widths = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };
const types = {
  5121: [Uint8Array, 1, "readUInt8"],
  5123: [Uint16Array, 2, "readUInt16LE"],
  5125: [Uint32Array, 4, "readUInt32LE"],
  5126: [Float32Array, 4, "readFloatLE"],
};
function arr(x, ai) {
  const a = x.g.accessors[ai],
    v = x.g.bufferViews[a.bufferView],
    [T, size, reader] = types[a.componentType],
    w = widths[a.type],
    r = new T(a.count * w);
  for (let i = 0; i < a.count; i++)
    for (let k = 0; k < w; k++)
      r[i * w + k] = x.b[reader](
        (v.byteOffset || 0) + (a.byteOffset || 0) + i * (v.byteStride || w * size) + k * size,
      );
  return r;
}
let decodeMs = 0,
  meshCount = 0,
  vertexBytes = 0,
  indexBytes = 0;
for (let mi = 0; mi < final.g.meshes.length; mi++)
  for (let pi = 0; pi < final.g.meshes[mi].primitives.length; pi++) {
    const p = final.g.meshes[mi].primitives[pi],
      ex = p.extensions.KHR_draco_mesh_compression,
      v = final.g.bufferViews[ex.bufferView],
      bytes = final.b.subarray(v.byteOffset, v.byteOffset + v.byteLength);
    const decoder = new d.Decoder(),
      buf = new d.DecoderBuffer(),
      mesh = new d.Mesh();
    buf.Init(new Int8Array(bytes), bytes.length);
    const start = performance.now();
    const status = decoder.DecodeBufferToMesh(buf, mesh);
    decodeMs += performance.now() - start;
    assert(status.ok(), status.error_msg());
    const ai = new d.DracoInt32Array(),
      expectedIndices = arr(audit, p.indices);
    assert.equal(mesh.num_faces() * 3, expectedIndices.length);
    for (let f = 0; f < mesh.num_faces(); f++) {
      decoder.GetFaceFromMesh(mesh, f, ai);
      for (let k = 0; k < 3; k++) assert.equal(ai.GetValue(k), expectedIndices[3 * f + k]);
    }
    d.destroy(ai);
    indexBytes += expectedIndices.length * 4;
    for (const [semantic, id] of Object.entries(ex.attributes)) {
      const attribute = decoder.GetAttributeByUniqueId(mesh, id),
        values = new d.DracoFloat32Array();
      assert(decoder.GetAttributeFloatForAllPoints(mesh, attribute, values));
      const expected = arr(audit, p.attributes[semantic]);
      assert.equal(values.size(), expected.length);
      for (let k = 0; k < expected.length; k++)
        assert.equal(values.GetValue(k), expected[k], `${mi}/${semantic}/${k}`);
      vertexBytes += expected.byteLength;
      d.destroy(values);
    }
    meshCount++;
    for (const o of [mesh, buf, decoder]) d.destroy(o);
  }
function runtimeBytes(g) {
  let s = 0;
  for (const m of g.meshes)
    for (const p of m.primitives) {
      s += g.accessors[p.indices].count * 4;
      for (const ai of Object.values(p.attributes)) {
        const a = g.accessors[ai];
        s += a.count * widths[a.type] * types[a.componentType][1];
      }
    }
  return s;
}
assert.equal(vertexBytes + indexBytes, runtimeBytes(final.g));
const r = {
  schema: "guardian-release-production-decoder-verification-v1",
  passed: true,
  baselineGlb: baselinePath,
  inputGlb: inputPath,
  outputDirectory: out,
  assetSha256: sha(final.r),
  wrapperSha256: sha(wrapper),
  wasmSha256: sha(wasm),
  allDecodedAttributesAndIndicesMatchEncoderRoundtrip: true,
  decodedPrimitiveCount: meshCount,
  totalNativeDecodeMilliseconds: decodeMs,
  threeRuntimeGeometryPayloadBytes: vertexBytes + indexBytes,
  previousPublicRuntimeGeometryPayloadBytes: runtimeBytes(base.g),
  runtimeGeometryPayloadDeltaBytes: vertexBytes + indexBytes - runtimeBytes(base.g),
  threeRuntimeIndexType: "Uint32Array for DRACOLoader",
  limitations: [
    "This is the production WASM decoder running under Node, not a browser/iPhone performance measurement.",
    "Counts include typed geometry buffers only; WASM working memory/textures/driver allocations are not represented.",
  ],
  sourceSha256: sha(fs.readFileSync(new URL(import.meta.url))),
};
fs.writeFileSync(path.join(out, "production-decoder-validation.json"), JSON.stringify(r, null, 2));
fs.copyFileSync(new URL(import.meta.url), path.join(out, "verify_guardian_release_decoder.mjs"));
console.log(JSON.stringify(r, null, 2));
