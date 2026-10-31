import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import sharp from "sharp";
import { NANITE_SURFACE_SOURCES, refinedNaniteKit } from "../src/lib/nanite-surface-assets.js";
const root = new URL("../", import.meta.url);
const hash = (data) => createHash("sha256").update(data).digest("hex");
test("surface swap leaves source kits, UV layout and all non-cell effects intact", () => {
  const kit = {
    cells: {
      src: Object.keys(NANITE_SURFACE_SOURCES)[0],
      width: 768,
      height: 224,
      cell: 32,
      frames: 24,
    },
    cellsB: { src: Object.keys(NANITE_SURFACE_SOURCES)[1], frames: 24 },
    fx: { src: "fx.webp" },
    guide: "guide.webp",
  };
  const original = structuredClone(kit),
    next = refinedNaniteKit(kit);
  assert.deepEqual(kit, original);
  assert.equal(next.cells.frames, 24);
  assert.equal(next.cells.cell, 32);
  assert.equal(next.fx, kit.fx);
  assert.equal(next.guide, kit.guide);
  assert.equal(next.cells.src, NANITE_SURFACE_SOURCES[kit.cells.src]);
  assert.equal(next.cellsB.src, NANITE_SURFACE_SOURCES[kit.cellsB.src]);
  assert.equal(refinedNaniteKit(null), null);
});
test("Blender material deliveries retain every approved alpha pixel and original atlas size", async () => {
  const receipt = JSON.parse(
    await readFile(new URL("public/nanite-surface-20261031/provenance.json", root), "utf8"),
  );
  const wrapper = await readFile(new URL("scripts/blender/nanite_surface_polish.py", root));
  assert.equal(hash(wrapper), receipt.wrapperSha256);
  for (const [source, target] of Object.entries(NANITE_SURFACE_SOURCES)) {
    const beforeBytes = await readFile(new URL(`public${source}`, root));
    const afterBytes = await readFile(new URL(`public${target}`, root));
    const before = await sharp(beforeBytes).ensureAlpha().raw().toBuffer();
    const { data: after, info } = await sharp(afterBytes)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    assert.equal(info.width, 768);
    assert.equal(info.height, 224);
    assert.ok(afterBytes.length < 110000);
    let changed = 0;
    for (let i = 0; i < after.length; i += 4) {
      assert.equal(after[i + 3], before[i + 3], `${target}: edge pixel ${i / 4}`);
      if (
        after[i + 3] &&
        (after[i] !== before[i] || after[i + 1] !== before[i + 1] || after[i + 2] !== before[i + 2])
      )
        changed++;
    }
    assert.ok(changed > 500, "real material change must be present");
    const name = target.split("/").at(-1).replace(".webp", "");
    assert.equal(hash(afterBytes), receipt.assets[name].sha256);
    assert.equal(hash(beforeBytes), receipt.assets[name].sourceSha256);
  }
});
