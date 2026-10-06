import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { GALLERY_ARTWORKS, GALLERY_CATEGORIES } from "../src/components/gallery/gallery-data.ts";

const manifest = JSON.parse(
  readFileSync(new URL("../public/gallery/asset-manifest.json", import.meta.url), "utf8"),
);

test("the gallery preserves every supplied work and its unique ordered catalogue number", () => {
  assert.equal(GALLERY_ARTWORKS.length, 113);
  assert.equal(manifest.items.length, GALLERY_ARTWORKS.length);
  assert.deepEqual(
    GALLERY_ARTWORKS.map((work) => work.id),
    Array.from({ length: 113 }, (_, index) => `g${String(index + 1).padStart(2, "0")}`),
  );
  for (const work of GALLERY_ARTWORKS) {
    assert.ok(work.title.trim().length > 0 && work.alt.trim().length > 0);
    assert.ok(work.width > 0 && work.height > 0);
    assert.ok(GALLERY_CATEGORIES.some((category) => category.id === work.category));
    for (const path of [work.thumb, work.medium, work.full])
      assert.match(path, /^\/gallery\/g\d+-\d+\.webp$/);
  }
});

test("the four new exhibits follow the existing 65 without renumbering them", () => {
  assert.deepEqual(
    GALLERY_ARTWORKS.slice(65, 69).map(({ id, title, category }) => ({ id, title, category })),
    [
      { id: "g66", title: "倉庫の組み合い", category: "scenes" },
      { id: "g67", title: "星空の三人", category: "portraits" },
      { id: "g68", title: "交差する星剣", category: "scenes" },
      { id: "g69", title: "倉庫の紅と桃", category: "portraits" },
    ],
  );
});

test("four additional exhibits append as 070–073 while preserving existing IDs", () => {
  assert.deepEqual(
    GALLERY_ARTWORKS.slice(69, 73).map(({ id, category }) => ({ id, category })),
    [
      { id: "g70", category: "places" },
      { id: "g71", category: "portraits" },
      { id: "g72", category: "scenes" },
      { id: "g73", category: "scenes" },
    ],
  );
});

test("six additional exhibits append as 074–079 without changing earlier catalogue IDs", () => {
  assert.deepEqual(
    GALLERY_ARTWORKS.slice(73, 79).map(({ id, category }) => ({ id, category })),
    [
      { id: "g74", category: "portraits" },
      { id: "g75", category: "portraits" },
      { id: "g76", category: "portraits" },
      { id: "g77", category: "portraits" },
      { id: "g78", category: "scenes" },
      { id: "g79", category: "scenes" },
    ],
  );
});

test("the 34 supplied additions append as 080–113 and include the new design collection", () => {
  assert.deepEqual(
    GALLERY_ARTWORKS.slice(79).map(({ id }) => id),
    Array.from({ length: 34 }, (_, index) => `g${index + 80}`),
  );
  assert.equal(GALLERY_ARTWORKS[79].category, "designs");
  assert.match(GALLERY_ARTWORKS[84].alt, /バイク/);
  assert.match(GALLERY_ARTWORKS[95].alt, /紫の刃/);
  assert.match(GALLERY_ARTWORKS[99].alt, /室内/);
  assert.match(GALLERY_ARTWORKS[112].alt, /三人/);
  assert.ok(
    GALLERY_CATEGORIES.some(({ id, label }) => id === "designs" && label === "ポスター・デザイン"),
  );
});

test("delivery derivatives have recorded bytes, hashes and uncropped non-upscaled dimensions", () => {
  for (const entry of manifest.items) {
    const work = GALLERY_ARTWORKS.find((candidate) => candidate.id === entry.id);
    assert.equal(work.width, entry.sourceWidth);
    assert.equal(work.height, entry.sourceHeight);
    assert.match(entry.sourceSha256, /^[a-f0-9]{64}$/);
    for (const variant of entry.variants) {
      const buffer = readFileSync(new URL(`../public${variant.path}`, import.meta.url));
      assert.equal(buffer.length, variant.bytes);
      assert.equal(createHash("sha256").update(buffer).digest("hex"), variant.sha256);
      assert.equal(buffer.toString("ascii", 0, 4), "RIFF");
      assert.equal(buffer.toString("ascii", 8, 12), "WEBP");
      assert.ok(variant.width <= entry.sourceWidth);
      assert.ok(
        Math.abs(variant.height - (entry.sourceHeight * variant.width) / entry.sourceWidth) <= 1,
      );
      assert.ok([work.thumb, work.medium, work.full].includes(variant.path));
    }
    const descriptors = work.srcSet.split(",").map((part) => part.trim().split(/\s+/));
    assert.equal(new Set(descriptors.map(([, width]) => width)).size, descriptors.length);
    for (const [path, descriptor] of descriptors) {
      const variant = entry.variants.find((candidate) => candidate.path === path);
      assert.ok(variant);
      assert.equal(descriptor, `${variant.width}w`);
      assert.ok(variant.width <= 900, "grid must not request the large viewer image");
    }
  }
});

test("published gallery metadata does not contain private attachment paths or metadata", () => {
  const published =
    JSON.stringify(manifest) +
    readFileSync(new URL("../src/components/gallery/gallery-data.ts", import.meta.url), "utf8");
  assert.doesNotMatch(
    published,
    /\/private\/|\/tmp\/|NSItemProvider|codex-remote-attachments|uuid=|provenance=/,
  );
});
