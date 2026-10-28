/** Keep reviewed production skin and all other Draco streams exact; replace Bone only. */
import os from "node:os";
import { parseArgs } from "node:util";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
// Run from the repository root. Input is the fixed uncompressed role-v1 GLB.
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
const require = createRequire(import.meta.url),
  root = process.cwd(),
  out = path.resolve(cli["output-dir"]),
  deps = process.env.DOGS_DRACO_DEPS || "draco3dgltf",
  draco = require(deps),
  sha = (b) => crypto.createHash("sha256").update(b).digest("hex");
assert.equal(
  require(path.join(deps, "package.json")).version,
  "1.5.7",
  "Use the pinned Draco encoder for reproducible bytes",
);
fs.mkdirSync(out, { recursive: true });
function glb(p) {
  const r = fs.readFileSync(p),
    jl = r.readUInt32LE(12);
  return { r, g: JSON.parse(r.subarray(20, 20 + jl)), b: r.subarray(28 + jl) };
}
const pubPath = path.resolve(cli["baseline-glb"]),
  inputPath = path.resolve(cli["input-glb"]);
assert.notEqual(pubPath, path.join(out, "candidate.draco.glb"));
assert.notEqual(inputPath, path.join(out, "candidate.draco.glb"));
const pub = glb(pubPath),
  input = glb(inputPath);
assert.equal(sha(pub.r), "814eed150ea2c58e2aaa465f29e38d2bdc2b1aadfd24495dc06849d5a9154ead");
assert.equal(sha(input.r), "5115a77e0649a45aaabdca071cf50b331f63c9de862197c219e423e21628e350");
const g = structuredClone(pub.g),
  widths = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 },
  types = {
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
const encoderModule = await draco.createEncoderModule({}),
  enc = encoderModule,
  dec = await draco.createDecoderModule({});
const mi = g.meshes.findIndex((m) => m.name.startsWith("Bone | overlapping"));
assert.equal(mi, 0);
assert.deepEqual(
  g.meshes[mi].primitives[0].attributes,
  input.g.meshes[mi].primitives[0].attributes,
);
const p = input.g.meshes[mi].primitives[0],
  oldp = g.meshes[mi].primitives[0],
  count = input.g.accessors[p.attributes.POSITION].count,
  idx = arr(input, p.indices),
  original = {},
  map = {};
const builder = new enc.MeshBuilder(),
  mesh = new enc.Mesh(),
  encoder = new enc.Encoder(),
  encoded = new enc.DracoInt8Array();
builder.AddFacesToMesh(mesh, idx.length / 3, Uint32Array.from(idx));
const enumTypes = {
  POSITION: enc.POSITION,
  NORMAL: enc.NORMAL,
  TEXCOORD_0: enc.TEX_COORD,
  COLOR_0: enc.COLOR,
};
for (const [semantic, ai] of Object.entries(p.attributes)) {
  const a = input.g.accessors[ai];
  original[semantic] = arr(input, ai);
  map[semantic] = builder.AddFloatAttributeToMesh(
    mesh,
    enumTypes[semantic],
    count,
    widths[a.type],
    original[semantic],
  );
}
// This lossless proof attribute is carried inside Draco but deliberately omitted
// from the glTF semantic map. It has no Three.js geometry/GPU BufferAttribute.
const ids = Int32Array.from({ length: count }, (_, i) => i),
  proofId = builder.AddInt32AttributeToMesh(mesh, enc.GENERIC, count, 1, ids);
encoder.SetSpeedOptions(3, 3);
encoder.SetEncodingMethod(enc.MESH_EDGEBREAKER_ENCODING);
encoder.SetAttributeQuantization(enc.POSITION, 16);
encoder.SetAttributeQuantization(enc.NORMAL, 12);
encoder.SetAttributeQuantization(enc.TEX_COORD, 14);
encoder.SetAttributeQuantization(enc.COLOR, 12);
const length = encoder.EncodeMeshToDracoBuffer(mesh, encoded);
assert(length > 0);
const encodedBytes = Buffer.alloc(length);
for (let i = 0; i < length; i++) encodedBytes.writeInt8(encoded.GetValue(i), i);
const decoder = new dec.Decoder(),
  db = new dec.DecoderBuffer(),
  dm = new dec.Mesh();
db.Init(new Int8Array(encodedBytes), encodedBytes.length);
const status = decoder.DecodeBufferToMesh(db, dm);
assert(status.ok(), status.error_msg());
assert.equal(dm.num_faces(), idx.length / 3);
function decodeAttribute(module, decoder, mesh, id, Type = Float32Array) {
  const a = decoder.GetAttributeByUniqueId(mesh, id),
    v = new module.DracoFloat32Array();
  assert(a && a.ptr);
  assert(decoder.GetAttributeFloatForAllPoints(mesh, a, v));
  const r = new Type(v.size());
  for (let i = 0; i < r.length; i++) r[i] = v.GetValue(i);
  module.destroy(v);
  return r;
}
const sourceIds = decodeAttribute(dec, decoder, dm, proofId, Int32Array),
  seen = new Set(sourceIds);
assert.equal(seen.size, count); // all IDs validated in loop below
for (const id of sourceIds) assert(id >= 0 && id < count);
const attrStats = {},
  decodedAttrs = {};
for (const [semantic, id] of Object.entries(map)) {
  const values = decodeAttribute(dec, decoder, dm, id),
    width = widths[input.g.accessors[p.attributes[semantic]].type];
  assert.equal(values.length, dm.num_points() * width);
  let max = 0,
    sum = 0;
  for (let i = 0; i < dm.num_points(); i++)
    for (let k = 0; k < width; k++) {
      const d = Math.abs(values[i * width + k] - original[semantic][sourceIds[i] * width + k]);
      max = Math.max(max, d);
      sum += d * d;
    }
  const limit = { POSITION: 0.00013, NORMAL: 0.0016, TEXCOORD_0: 0.0007, COLOR_0: 0.0003 }[
    semantic
  ];
  assert(max <= limit, `${semantic} ${max}`);
  attrStats[semantic] = { maxAbsError: max, rmsError: Math.sqrt(sum / values.length) };
  decodedAttrs[semantic] = values;
  g.accessors[p.attributes[semantic]].count = dm.num_points();
}
const decodedIndices = new Uint32Array(idx.length),
  ia = new dec.DracoInt32Array();
for (let f = 0; f < dm.num_faces(); f++) {
  decoder.GetFaceFromMesh(dm, f, ia);
  for (let k = 0; k < 3; k++) decodedIndices[3 * f + k] = ia.GetValue(k);
}
dec.destroy(ia);
function faceKey(a, b, c) {
  return a <= b && a <= c
    ? `${a},${b},${c}`
    : b <= a && b <= c
      ? `${b},${c},${a}`
      : `${c},${a},${b}`;
}
const faces = new Map();
for (let i = 0; i < idx.length; i += 3) {
  const key = faceKey(idx[i], idx[i + 1], idx[i + 2]);
  faces.set(key, (faces.get(key) || 0) + 1);
}
for (let i = 0; i < decodedIndices.length; i += 3) {
  const key = faceKey(...[0, 1, 2].map((k) => sourceIds[decodedIndices[i + k]]));
  const v = faces.get(key) || 0;
  assert(v > 0, "Changed connectivity or winding");
  if (v === 1) faces.delete(key);
  else faces.set(key, v - 1);
}
assert.equal(faces.size, 0);
const oldBV = oldp.extensions.KHR_draco_mesh_compression.bufferView;
oldp.extensions.KHR_draco_mesh_compression.attributes = map;
let total = 0;
const chunks = [];
for (let i = 0; i < g.bufferViews.length; i++) {
  const v = pub.g.bufferViews[i],
    bytes =
      i === oldBV
        ? encodedBytes
        : pub.b.subarray(v.byteOffset || 0, (v.byteOffset || 0) + v.byteLength);
  const padding = (4 - (total % 4)) % 4;
  if (padding) {
    chunks.push(Buffer.alloc(padding));
    total += padding;
  }
  g.bufferViews[i] = { ...v, byteOffset: total, byteLength: bytes.length };
  chunks.push(bytes);
  total += bytes.length;
}
g.buffers[0].byteLength = total;
const bin = Buffer.concat(chunks);
function pack(g, bin) {
  const j = Buffer.from(JSON.stringify(g)),
    jp = Buffer.alloc((4 - (j.length % 4)) % 4, 32),
    bp = Buffer.alloc((4 - (bin.length % 4)) % 4),
    h = Buffer.alloc(20),
    bh = Buffer.alloc(8);
  h.writeUInt32LE(0x46546c67, 0);
  h.writeUInt32LE(2, 4);
  h.writeUInt32LE(28 + j.length + jp.length + bin.length + bp.length, 8);
  h.writeUInt32LE(j.length + jp.length, 12);
  h.writeUInt32LE(0x4e4f534a, 16);
  bh.writeUInt32LE(bin.length + bp.length);
  bh.writeUInt32LE(0x004e4942, 4);
  return Buffer.concat([h, j, jp, bh, bin, bp]);
}
const result = pack(g, bin);
for (const key of [
  "nodes",
  "skins",
  "animations",
  "materials",
  "textures",
  "samplers",
  "scenes",
  "scene",
  "images",
])
  assert.deepEqual(g[key], pub.g[key]);
for (let i = 0; i < g.meshes.length; i++)
  if (i !== mi) assert.deepEqual(g.meshes[i], pub.g.meshes[i]);
for (let i = 0; i < g.bufferViews.length; i++)
  if (i !== oldBV) {
    const a = g.bufferViews[i],
      b = pub.g.bufferViews[i];
    assert.deepEqual(
      bin.subarray(a.byteOffset, a.byteOffset + a.byteLength),
      pub.b.subarray(b.byteOffset, b.byteOffset + b.byteLength),
    );
  }
fs.writeFileSync(path.join(out, "candidate.draco.glb"), result);
// Decode the actual final asset with the exact public Three.js decoder into a
// separate audit GLB. Production asset is never re-exported or flattened.
const runtimeWrapper = fs.readFileSync(
    path.join(root, "public/dogs-archive-20261028/decoders/draco/draco_wasm_wrapper.js"),
  ),
  runtimeWasm = fs.readFileSync(
    path.join(root, "public/dogs-archive-20261028/decoders/draco/draco_decoder.wasm"),
  );
const decoderDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "guardian-release-decoder-"));
const decoderTemp = path.join(decoderDirectory, "reviewed-decoder.cjs");
process.once("exit", () => fs.rmSync(decoderDirectory, { recursive: true, force: true }));
fs.writeFileSync(decoderTemp, runtimeWrapper);
const d = await require(decoderTemp)({ wasmBinary: runtimeWasm });
const audit = structuredClone(g),
  auditViews = [],
  auditParts = [];
let auditOffset = 0;
const decReports = [];
let runtimePayload = 0;
function auditAppend(bytes) {
  const padding = (4 - (auditOffset % 4)) % 4;
  if (padding) {
    auditParts.push(Buffer.alloc(padding));
    auditOffset += padding;
  }
  const vi = auditViews.length;
  auditViews.push({ buffer: 0, byteOffset: auditOffset, byteLength: bytes.length });
  auditParts.push(bytes);
  auditOffset += bytes.length;
  return vi;
}
const replaced = new Set();
let decodeMs = 0;
for (let m = 0; m < g.meshes.length; m++)
  for (let pi = 0; pi < g.meshes[m].primitives.length; pi++) {
    const prim = g.meshes[m].primitives[pi],
      ext = prim.extensions.KHR_draco_mesh_compression,
      v = g.bufferViews[ext.bufferView],
      bytes = bin.subarray(v.byteOffset, v.byteOffset + v.byteLength),
      decoder = new d.Decoder(),
      buf = new d.DecoderBuffer(),
      mesh = new d.Mesh();
    buf.Init(new Int8Array(bytes), bytes.length);
    const started = performance.now();
    const status = decoder.DecodeBufferToMesh(buf, mesh);
    decodeMs += performance.now() - started;
    assert(status.ok());
    const count = mesh.num_points();
    const inds = new Uint32Array(mesh.num_faces() * 3),
      ia = new d.DracoInt32Array();
    for (let f = 0; f < mesh.num_faces(); f++) {
      decoder.GetFaceFromMesh(mesh, f, ia);
      for (let k = 0; k < 3; k++) inds[f * 3 + k] = ia.GetValue(k);
    }
    d.destroy(ia);
    if (m === mi) assert.deepEqual(inds, decodedIndices);
    const idxai = prim.indices,
      a = audit.accessors[idxai];
    a.componentType = 5125;
    a.count = inds.length;
    a.bufferView = auditAppend(Buffer.from(inds.buffer));
    delete a.byteOffset;
    replaced.add(idxai);
    runtimePayload += inds.byteLength;
    for (const [semantic, id] of Object.entries(ext.attributes)) {
      const ai = prim.attributes[semantic],
        a = audit.accessors[ai],
        [Type] = types[a.componentType],
        values = decodeAttribute(d, decoder, mesh, id, Type);
      assert.equal(values.length, count * widths[a.type]);
      if (m === mi) assert.deepEqual(values, decodedAttrs[semantic]);
      a.count = count;
      a.bufferView = auditAppend(Buffer.from(values.buffer));
      delete a.byteOffset;
      replaced.add(ai);
      runtimePayload += values.byteLength;
    }
    delete audit.meshes[m].primitives[pi].extensions.KHR_draco_mesh_compression;
    if (!Object.keys(audit.meshes[m].primitives[pi].extensions).length)
      delete audit.meshes[m].primitives[pi].extensions;
    decReports.push({
      mesh: m,
      primitive: pi,
      vertices: count,
      triangles: mesh.num_faces(),
      compressedBytes: bytes.length,
      productionBitstreamUnchanged: m !== mi,
    });
    for (const obj of [mesh, buf, decoder]) d.destroy(obj);
  }
const copiedViews = new Map();
function auditPreserve(vi) {
  if (copiedViews.has(vi)) return copiedViews.get(vi);
  const v = g.bufferViews[vi],
    ni = auditAppend(bin.subarray(v.byteOffset, v.byteOffset + v.byteLength));
  copiedViews.set(vi, ni);
  return ni;
}
for (let i = 0; i < audit.accessors.length; i++)
  if (!replaced.has(i) && audit.accessors[i].bufferView !== undefined)
    audit.accessors[i].bufferView = auditPreserve(audit.accessors[i].bufferView);
for (const img of audit.images || [])
  if (img.bufferView !== undefined) img.bufferView = auditPreserve(img.bufferView);
audit.bufferViews = auditViews;
audit.buffers = [{ byteLength: auditOffset }];
for (const key of ["extensionsUsed", "extensionsRequired"])
  if (audit[key]) audit[key] = audit[key].filter((x) => x !== "KHR_draco_mesh_compression");
fs.writeFileSync(
  path.join(out, "candidate.decoded-audit.glb"),
  pack(audit, Buffer.concat(auditParts)),
);
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
const report = {
  schema: "guardian-release-bone-only-draco-validation-v2",
  passed: true,
  baselineGlb: pubPath,
  inputGlb: inputPath,
  outputDirectory: out,
  inputRawSha256: sha(input.r),
  previousPublicSha256: sha(pub.r),
  assetSha256: sha(result),
  assetBytes: result.length,
  previousPublicBytes: pub.r.length,
  byteDeltaFromPublic: result.length - pub.r.length,
  codec: {
    package: "draco3dgltf",
    version: "1.5.7",
    method: "MESH_EDGEBREAKER_ENCODING, Bone only",
    quantization: {
      POSITION: 16,
      NORMAL: 12,
      TEXCOORD_0: 14,
      COLOR_0: 12,
      proofSourceId: "lossless generic int32; not exposed to glTF/Three GPU",
    },
  },
  rawBoneVertexCount: count,
  encodedBoneVertexCount: dm.num_points(),
  sourceIdCoverage: seen.size,
  allOrientedTrianglesMatchRawAfterMapping: true,
  attributeErrors: attrStats,
  allOtherMeshBitstreamsExact: true,
  allSkinMeshBitstreamsExact: true,
  nodeSkinClipMaterialImageJsonExact: true,
  allNonBoneBufferViewBytesExact: true,
  productionDecoderExactRoundtrip: true,
  productionDecoderWasmSha256: sha(runtimeWasm),
  productionDecoderWrapperSha256: sha(runtimeWrapper),
  nativeNodeDecodeMilliseconds: decodeMs,
  runtimeGeometryPayloadBytes: runtimePayload,
  previousPublicRuntimeGeometryPayloadBytes: runtimeBytes(pub.g),
  runtimeGeometryPayloadDeltaBytes: runtimePayload - runtimeBytes(pub.g),
  proofAttributeTransientIntegerPayloadBytes: sourceIds.byteLength,
  memoryLimitations:
    "Geometry payload includes Three Uint32 indices. Hidden source-ID exists only inside Bone Draco/WASM working storage, not a Three GPU attribute. Decoder peak/iOS performance requires actual browser QA.",
  primitiveStats: decReports,
  sourceScriptSha256: sha(fs.readFileSync(new URL(import.meta.url))),
};
assert.equal(sha(fs.readFileSync(pubPath)), sha(pub.r));
assert.equal(sha(fs.readFileSync(inputPath)), sha(input.r));
fs.writeFileSync(path.join(out, "compression-validation.json"), JSON.stringify(report, null, 2));
fs.writeFileSync(
  path.join(out, "production-decoder-validation.json"),
  JSON.stringify(
    {
      passed: true,
      assetSha256: report.assetSha256,
      wasmSha256: report.productionDecoderWasmSha256,
      allNonBoneBitstreamsExact: true,
      skinBitstreamsExact: true,
      decodedPrimitiveCount: decReports.length,
      runtimeGeometryPayloadBytes: runtimePayload,
      proofAttributeNotExposedToThree: true,
    },
    null,
    2,
  ),
);
fs.copyFileSync(new URL(import.meta.url), path.join(out, "compress_guardian_bone_release.mjs"));
console.log(JSON.stringify(report, null, 2));
