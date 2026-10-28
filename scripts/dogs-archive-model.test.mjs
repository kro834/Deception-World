import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import test from "node:test";
import { Box3, Matrix4, Quaternion, Vector3 } from "three";

// The same contract also checks a Blender candidate before it is adopted as
// the public model. Never substitute its results for another export's SHA.
const modelDirectory = process.env.DOGS_MODEL_DIR
  ? pathToFileURL(`${resolve(process.env.DOGS_MODEL_DIR)}/`)
  : new URL("../public/dogs-archive-20261028/", import.meta.url);
const manifest = JSON.parse(
  readFileSync(
    new URL(process.env.DOGS_MODEL_MANIFEST ?? "model-manifest.json", modelDirectory),
    "utf8",
  ),
);
const bytes = readFileSync(new URL(manifest.model, modelDirectory));
assert.equal(bytes.toString("ascii", 0, 4), "glTF");
test("the model and its pose manifest identify the same complete export", () => {
  assert.equal(manifest.assetBytes, bytes.length);
  assert.equal(manifest.assetSha256, createHash("sha256").update(bytes).digest("hex"));
});
assert.equal(bytes.readUInt32LE(4), 2);
assert.equal(bytes.readUInt32LE(8), bytes.length);
const jsonLength = bytes.readUInt32LE(12);
const model = JSON.parse(bytes.toString("utf8", 20, 20 + jsonLength).trim());
const binaryStart = 20 + jsonLength + 8;
const byName = new Map(model.nodes.map((node, index) => [node.name, { node, index }]));
const parents = new Map(
  model.nodes.flatMap((node, parent) => (node.children ?? []).map((child) => [child, parent])),
);

function firstQuaternion(clip, name) {
  const index = byName.get(name)?.index;
  const channel = clip.channels.find(
    (item) => item.target.node === index && item.target.path === "rotation",
  );
  assert.ok(channel, `${clip.name} animates ${name}`);
  const accessor = model.accessors[clip.samplers[channel.sampler].output];
  assert.equal(accessor.componentType, 5126);
  assert.equal(accessor.type, "VEC4");
  const view = model.bufferViews[accessor.bufferView];
  const start = binaryStart + (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  return new Quaternion(...[0, 1, 2, 3].map((i) => bytes.readFloatLE(start + 4 * i))).normalize();
}

test("the shipped Blender GLB has real, volumetric geometry on every viewing axis", () => {
  const bounds = new Box3();
  let meshes = 0;
  function walk(index, parentMatrix = new Matrix4()) {
    const node = model.nodes[index];
    const local = node.matrix
      ? new Matrix4().fromArray(node.matrix)
      : new Matrix4().compose(
          new Vector3(...(node.translation ?? [0, 0, 0])),
          new Quaternion(...(node.rotation ?? [0, 0, 0, 1])),
          new Vector3(...(node.scale ?? [1, 1, 1])),
        );
    const world = parentMatrix.clone().multiply(local);
    if (node.mesh !== undefined) {
      meshes++;
      for (const primitive of model.meshes[node.mesh].primitives) {
        assert.equal(primitive.mode ?? 4, 4, "surface is triangle geometry");
        const position = model.accessors[primitive.attributes.POSITION];
        const normal = model.accessors[primitive.attributes.NORMAL];
        assert.equal(position.count, normal.count, "all vertices have modeled normals");
        assert.ok(position.count > 0);
        bounds.union(
          new Box3(new Vector3(...position.min), new Vector3(...position.max)).applyMatrix4(world),
        );
      }
    }
    for (const child of node.children ?? []) walk(child, world);
  }
  for (const root of model.scenes[model.scene ?? 0].nodes) walk(root);
  const size = bounds.getSize(new Vector3());
  assert.ok(meshes > 1, "body and articulating head are separate modeled surfaces");
  assert.ok(size.x > size.y * 0.5, "coils extend beyond the central body");
  assert.ok(size.z > size.y * 0.25, "sculpt has a full modeled back, not a planar image");
  assert.ok(size.toArray().every((value) => Number.isFinite(value) && value > 0));
});

test("mouth anchors belong to the moving head and both full articulation clips are embedded", () => {
  const head = byName.get("HeadPivot").index;
  const jaw = byName.get("JawPivot").index;
  for (const name of ["MouthSocket", "MouthAim"]) {
    let parent = byName.get(name)?.index;
    assert.notEqual(parent, undefined, name);
    for (let depth = 0; depth < model.nodes.length && parent !== head; depth++)
      parent = parents.get(parent);
    assert.equal(parent, head, `${name} follows the head's actual transform`);
  }
  assert.notEqual(jaw, head);
  const rest = model.animations.find((clip) => clip.name === "Rest");
  const exhale = model.animations.find((clip) => clip.name === "Exhale");
  assert.ok(rest && exhale);
  for (const name of ["HeadPivot", "JawPivot"]) {
    const a = firstQuaternion(rest, name),
      b = firstQuaternion(exhale, name);
    assert.ok(a.angleTo(b) > 0.3, `${name} has a substantial 3D pose change`);
  }
});

test("model textures are self-contained; reference photographs are not projected onto the model", () => {
  assert.ok(model.images.length > 0);
  for (const image of model.images) {
    assert.equal(image.uri, undefined, "textures are embedded for reliable cross-route loading");
    assert.ok(model.bufferViews[image.bufferView].byteLength > 0);
    assert.doesNotMatch(image.name ?? "", /guardian-rest|guardian-exhale|reference/);
  }
  assert.ok(
    model.materials.some((material) => material.normalTexture),
    "baked surface detail is present",
  );
});
