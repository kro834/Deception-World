import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import sharp from "sharp";
const root = new URL("../", import.meta.url);
test("Illusionculum optical nanites retain transparent shared-layout delivery within budget", async () => {
  const data = await readFile(new URL("public/illusionculum-nanites-20261027/cells.webp", root));
  const p = JSON.parse(
    await readFile(new URL("public/illusionculum-nanites-20261027/provenance.json", root), "utf8"),
  );
  const scene = await readFile(new URL(p.scene, root));
  const hash = (b) => createHash("sha256").update(b).digest("hex");
  const meta = await sharp(data).metadata();
  assert.equal(meta.width, 768);
  assert.equal(meta.height, 224);
  assert.equal(meta.hasAlpha, true);
  assert.ok(data.length <= 100000);
  assert.equal(hash(data), p.atlasSha256);
  assert.equal(hash(scene), p.sceneSha256);
  // The 3D back and face must differ, and transparent margins must survive packing.
  const frame = async (left) =>
    sharp(data).extract({ left, top: 0, width: 32, height: 32 }).ensureAlpha().raw().toBuffer();
  const face = await frame(0),
    back = await frame(12 * 32);
  assert.notDeepEqual(face, back);
  assert.equal(face[3], 0);
  assert.ok(face.some((v, i) => i % 4 === 3 && v > 128));
});
