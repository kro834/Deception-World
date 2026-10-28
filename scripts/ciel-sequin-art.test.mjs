import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import sharp from "sharp";
const dir = new URL("../public/ciel-sequin-20261028/", import.meta.url);
test("the supplied Ciel image retains its full portrait composition in bounded delivery assets", async () => {
  const manifest = JSON.parse(await readFile(new URL("artwork.json", dir), "utf8"));
  assert.equal(manifest.sourceWidth, 1086);
  assert.equal(manifest.sourceHeight, 1448);
  assert.equal(manifest.delivery.length, 2);
  for (const item of manifest.delivery) {
    const bytes = await readFile(new URL(item.file, dir));
    const info = await sharp(bytes).metadata();
    assert.equal(createHash("sha256").update(bytes).digest("hex"), item.sha256);
    assert.equal(info.width, item.width);
    assert.equal(info.height, item.height);
    assert.equal(info.width / info.height, 0.75);
    assert.ok(bytes.length <= 180000);
    assert.equal(info.exif, undefined);
    assert.equal(info.xmp, undefined);
  }
});
