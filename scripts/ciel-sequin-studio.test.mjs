import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import sharp from "sharp";

test("the post-inferno reflection bake matches its Blender scene and bounded delivery", async () => {
  const root = new URL("../", import.meta.url);
  const directory = new URL("public/ciel-sequin-studio-20261028/", root);
  const manifest = JSON.parse(await readFile(new URL("provenance.json", directory), "utf8"));
  const scene = await readFile(new URL(manifest.scene, root));
  const bytes = await readFile(new URL("studio.webp", directory));
  const hash = (value) => createHash("sha256").update(value).digest("hex");
  const info = await sharp(bytes).metadata();
  assert.equal(manifest.renderer, "Blender 4.5.9 LTS / Cycles CPU");
  assert.equal(manifest.sceneSha256, hash(scene));
  assert.equal(manifest.deliverySha256, hash(bytes));
  assert.equal(manifest.bytes, bytes.length);
  assert.equal(manifest.ownerArtworkIncluded, false);
  assert.equal(info.width, 768);
  assert.equal(info.height, 384);
  assert.ok(bytes.length < 24000);
  assert.equal(info.exif, undefined);
  assert.equal(info.xmp, undefined);
  assert.equal(info.icc, undefined);
});
