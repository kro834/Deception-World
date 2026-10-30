import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import test from "node:test";
import sharp from "sharp";
import { Box3, Matrix4, Quaternion, Vector3 } from "three";
import { buildRexonanceManifest } from "./rexonance-3d-assets.mjs";
import {
  readRexonanceGlint,
  rexonanceFamilyOf,
  rexonanceTailPivotIndex,
} from "../src/lib/rexonance-3d/contract.ts";

// The public REXONANCE 3D model (the Blender export, packed with Draco) and its manifest.
// The same contract checks a candidate GLB before it replaces the public one:
//   REXONANCE_MODEL_DIR=<folder with rexonance.glb + model-manifest.json> npm test
const directory = process.env.REXONANCE_MODEL_DIR
  ? pathToFileURL(`${resolve(process.env.REXONANCE_MODEL_DIR)}/`)
  : new URL("../public/rexonance-3d-20261030/", import.meta.url);
const manifest = JSON.parse(readFileSync(new URL("model-manifest.json", directory), "utf8"));
const bytes = readFileSync(new URL(manifest.model, directory));
const jsonLength = bytes.readUInt32LE(12);
const gltf = JSON.parse(bytes.toString("utf8", 20, 20 + jsonLength));
const parents = new Map(
  gltf.nodes.flatMap((node, parent) => (node.children ?? []).map((child) => [child, parent])),
);
const meshNodes = gltf.nodes.filter((node) => node.mesh !== undefined);
const primitivesOf = (node) => gltf.meshes[node.mesh].primitives;
const materialOf = (primitive) => gltf.materials?.[primitive.material]?.name;

function worldMatrix(index) {
  const chain = [];
  for (let at = index; at !== undefined; at = parents.get(at)) chain.unshift(gltf.nodes[at]);
  const matrix = new Matrix4();
  for (const node of chain)
    matrix.multiply(
      node.matrix
        ? new Matrix4().fromArray(node.matrix)
        : new Matrix4().compose(
            new Vector3(...(node.translation ?? [0, 0, 0])),
            new Quaternion(...(node.rotation ?? [0, 0, 0, 1])),
            new Vector3(...(node.scale ?? [1, 1, 1])),
          ),
    );
  return matrix;
}

test("the manifest describes exactly the shipped GLB", () => {
  assert.equal(bytes.toString("ascii", 0, 4), "glTF");
  assert.equal(bytes.readUInt32LE(4), 2);
  assert.equal(bytes.readUInt32LE(8), bytes.length);
  assert.equal(manifest.model, "rexonance.glb");
  assert.equal(manifest.assetBytes, bytes.length);
  assert.equal(manifest.assetSha256, createHash("sha256").update(bytes).digest("hex"));
  // Regenerating it (node scripts/rexonance-3d-assets.mjs manifest) changes nothing else.
  const rebuilt = buildRexonanceManifest(bytes, manifest);
  for (const key of ["triangles", "materials", "nodes", "glints", "tailPivots"])
    assert.deepEqual(rebuilt[key], manifest[key], `${key} matches the GLB`);
});

test("the viewer can decode every required extension (Draco or meshopt)", () => {
  const supported = new Set([
    "KHR_draco_mesh_compression",
    "EXT_meshopt_compression",
    "KHR_mesh_quantization",
    "KHR_materials_clearcoat",
    "KHR_materials_emissive_strength",
    "KHR_materials_ior",
    "KHR_materials_specular",
    "KHR_texture_transform",
  ]);
  for (const name of gltf.extensionsRequired ?? []) assert.ok(supported.has(name), name);
  assert.equal(gltf.images, undefined, "materials are shader-built: no embedded textures");
});

test("every mesh is a triangle surface with normals and one RX_<Family> material", () => {
  assert.ok(meshNodes.length > 0);
  for (const node of meshNodes)
    for (const primitive of primitivesOf(node)) {
      assert.equal(primitive.mode ?? 4, 4, `${node.name} draws triangles`);
      assert.ok(primitive.attributes.POSITION !== undefined, node.name);
      assert.ok(primitive.attributes.NORMAL !== undefined, `${node.name} has modelled normals`);
      assert.ok(
        rexonanceFamilyOf(materialOf(primitive), node.name),
        `${node.name}: ${materialOf(primitive)} is a known family`,
      );
    }
});

test("crystal and ribbon surfaces carry the UV contract the holographic shader reads", () => {
  for (const node of meshNodes)
    for (const primitive of primitivesOf(node)) {
      const crystal = materialOf(primitive) === "RX_Crystal";
      if (!crystal && !/^RX_Ribbons?_/u.test(node.name)) continue;
      // v = 0 at the root, 1 at the tip: the gradient, the pink edges and the flutter.
      assert.ok(primitive.attributes.TEXCOORD_0 !== undefined, `${node.name} keeps TEXCOORD_0`);
    }
});

test("the suit stands two metres tall on the floor, facing +Z, with a modelled back", () => {
  const bounds = new Box3();
  gltf.nodes.forEach((node, index) => {
    if (node.mesh === undefined) return;
    const world = worldMatrix(index);
    for (const primitive of primitivesOf(node)) {
      const position = gltf.accessors[primitive.attributes.POSITION];
      let min = new Vector3(...position.min);
      let max = new Vector3(...position.max);
      if (position.normalized) {
        // Quantized positions: min/max are stored as integers of the component type.
        const scale = { 5120: 127, 5121: 255, 5122: 32767, 5123: 65535 }[position.componentType];
        min = min.divideScalar(scale);
        max = max.divideScalar(scale);
      }
      bounds.union(new Box3(min, max).applyMatrix4(world));
    }
  });
  const size = bounds.getSize(new Vector3());
  assert.ok(size.y > 1.8 && size.y < 2.6, `height ${size.y.toFixed(3)} m`);
  assert.ok(Math.abs(bounds.min.y) < 0.12, `soles at the floor (${bounds.min.y.toFixed(3)})`);
  assert.ok(size.x > 0.6 && size.z > 0.3, "a full figure with depth, not a card");
  assert.ok(manifest.triangles > 150_000, "the undersuit and its armour");
});

test("glint anchors are placed empties with usable size and hue", () => {
  const glints = gltf.nodes.filter((node) => /^RX_Glint_/u.test(node.name));
  assert.equal(glints.length, manifest.glints.length);
  for (const node of glints) {
    assert.equal(node.mesh, undefined, `${node.name} is an empty`);
    const glint = readRexonanceGlint(node.name, node.extras);
    assert.ok(glint && glint.size > 0 && glint.hue >= 0 && glint.hue <= 1, node.name);
    const index = gltf.nodes.indexOf(node);
    const position = new Vector3().setFromMatrixPosition(worldMatrix(index));
    assert.ok(position.length() > 1e-4, `${node.name} sits on its jewel, not at the origin`);
  }
});

test("the tail's pivots form one contiguous chain of empties holding its segments", () => {
  const pivots = gltf.nodes
    .map((node, index) => ({ node, index, order: rexonanceTailPivotIndex(node.name) }))
    .filter((item) => item.order !== null)
    .sort((a, b) => a.order - b.order);
  assert.equal(manifest.tailPivots, pivots.length);
  pivots.forEach((pivot, i) => {
    assert.equal(pivot.order, i, "RX_Tail_Pivot00..N without gaps");
    assert.equal(pivot.node.mesh, undefined, `${pivot.node.name} is an empty`);
    assert.ok(pivot.node.children?.length, `${pivot.node.name} holds its segment`);
    if (i > 0) {
      let at = parents.get(pivot.index);
      while (at !== undefined && at !== pivots[i - 1].index) at = parents.get(at);
      assert.equal(at, pivots[i - 1].index, `${pivot.node.name} hangs from the pivot before it`);
    }
  });
});

test("the viewer's own assets ship beside the model", async () => {
  const folder = new URL("../public/rexonance-3d-20261030/", import.meta.url);
  const normal = await sharp(new URL("textures/scale-normal.webp", folder).pathname).metadata();
  assert.deepEqual(
    [normal.format, normal.width, normal.height, normal.channels],
    ["webp", 512, 512, 4],
  );
  for (const view of ["front-10", "right-07", "back-09", "left-08"]) {
    const file = new URL(`reference/${view}.webp`, folder).pathname;
    const meta = await sharp(file).metadata();
    assert.equal(meta.format, "webp");
    assert.ok(meta.width <= 640 && meta.height <= 960, `${view} is a light copy`);
    assert.ok(readFileSync(file).length < 220_000, `${view} stays small`);
  }
  const poster = new URL("rexonance-3d-480.webp", folder).pathname;
  assert.ok(existsSync(poster), "the poster rendered from the viewer");
  const meta = await sharp(poster).metadata();
  assert.deepEqual([meta.format, meta.width, meta.height], ["webp", 480, 720]);
});
