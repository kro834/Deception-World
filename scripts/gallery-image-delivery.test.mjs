import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import sharp from "sharp";
import { GALLERY_ARTWORKS } from "../src/components/gallery/gallery-data.ts";
import { GALLERY_DETAIL } from "../src/components/gallery/gallery-detail-assets.ts";
import {
  galleryDetailPlan,
  galleryZoomSource,
  galleryVisibleDetailTiles,
} from "../src/components/gallery/gallery-image-delivery.ts";

const centred = {
  width: 400,
  height: 300,
  scrollWidth: 800,
  scrollHeight: 600,
  left: 200,
  top: 150,
};

test("fit viewing includes native resolution while grid candidates stay bounded", () => {
  for (const work of GALLERY_ARTWORKS) {
    assert.ok(work.fullSrcSet.includes(work.full));
    assert.ok(work.srcSet.includes(work.preview));
    if (work.preview !== work.thumb) assert.ok(!work.fullSrcSet.includes(work.preview));
    for (const candidate of work.srcSet.split(","))
      assert.ok(Number.parseInt(candidate.trim().split(/\s+/)[1]) <= 900);
  }
});

test("low-density enlargement reuses the sufficient smaller candidate", () => {
  const work = GALLERY_ARTWORKS.find((item) => item.id === "g68");
  assert.equal(galleryZoomSource(work, 350, 1), work.medium);
  assert.equal(galleryZoomSource(work, 350, 2), work.full);
  assert.equal(galleryZoomSource({ full: "/upload.png", srcSet: "" }, 350, 2), "/upload.png");
});

test("zoom requests only source crops intersecting the visible contained artwork", () => {
  assert.equal(galleryVisibleDetailTiles({ ...centred, scrollWidth: 0 }).length, 0);
  const tiles = galleryVisibleDetailTiles(centred);
  assert.deepEqual(
    tiles.map(({ left, top }) => [left, top]),
    [
      [448, 0],
      [896, 0],
      [448, 336],
      [896, 336],
      [448, 672],
      [896, 672],
    ],
  );
  const left = galleryVisibleDetailTiles({ ...centred, left: 0 });
  assert.ok(left.every((tile) => tile.left < 896));
  const right = galleryVisibleDetailTiles({ ...centred, left: 400 });
  assert.ok(right.every((tile) => tile.left >= 896));
  assert.ok(!left.some((tile) => right.includes(tile)));
});

test("tiles save bytes for local detail and choose the cheapest next transfer", () => {
  const plan = galleryDetailPlan(centred);
  assert.equal(plan.mode, "tiles");
  assert.ok(plan.bytes < GALLERY_DETAIL.sourceBytes);
  assert.equal(galleryDetailPlan(centred, [], true).mode, "full");
  assert.equal(
    galleryDetailPlan(
      centred,
      GALLERY_DETAIL.tiles.map((tile) => tile.path),
    ).bytes,
    0,
  );
  const all = { ...centred, width: 800, height: 600, left: 0, top: 0 };
  assert.equal(galleryDetailPlan(all).mode, "full");
  assert.equal(
    galleryDetailPlan(
      all,
      plan.visible.map((tile) => tile.path),
    ).mode,
    "tiles",
    "already transferred crops are a sunk cost; do not also download the full image",
  );
  console.log(
    JSON.stringify({
      fullBytes: GALLERY_DETAIL.sourceBytes,
      centreTileBytes: plan.bytes,
      centreTiles: plan.visible.length,
      savingPercent: ((1 - plan.bytes / GALLERY_DETAIL.sourceBytes) * 100).toFixed(1),
    }),
  );
});

test("representative crops cover the unchanged source exactly and preserve its native detail", async () => {
  const bytes = readFileSync(new URL(`../public${GALLERY_DETAIL.source}`, import.meta.url));
  assert.equal(createHash("sha256").update(bytes).digest("hex"), GALLERY_DETAIL.sourceSha256);
  let area = 0;
  let squaredError = 0;
  let samples = 0;
  for (const tile of GALLERY_DETAIL.tiles) {
    const data = readFileSync(new URL(`../public${tile.path}`, import.meta.url));
    assert.equal(data.length, tile.bytes);
    assert.equal(createHash("sha256").update(data).digest("hex"), tile.sha256);
    const { width, height } = await sharp(data).metadata();
    assert.equal(width, tile.width);
    assert.equal(height, tile.height);
    const reference = await sharp(bytes)
      .extract({ left: tile.left, top: tile.top, width, height })
      .removeAlpha()
      .raw()
      .toBuffer();
    const actual = await sharp(data).removeAlpha().raw().toBuffer();
    for (let i = 0; i < actual.length; i++) squaredError += (actual[i] - reference[i]) ** 2;
    samples += actual.length;
    area += width * height;
    for (const other of GALLERY_DETAIL.tiles) {
      if (other === tile) continue;
      assert.ok(
        tile.left + width <= other.left ||
          tile.top + height <= other.top ||
          other.left + other.width <= tile.left ||
          other.top + other.height <= tile.top,
      );
    }
  }
  assert.equal(area, GALLERY_DETAIL.width * GALLERY_DETAIL.height);
  const psnrDb = 10 * Math.log10(255 ** 2 / (squaredError / samples));
  assert.ok(psnrDb > 43);
  assert.ok(Math.abs(psnrDb - GALLERY_DETAIL.comparison.psnrDb) < 0.0001);
});

test("gallery defers the browser-local hero choice, preserves no-JS artwork, and never warms unrelated full images", () => {
  const page = readFileSync(
    new URL("../src/components/gallery/gallery-page.tsx", import.meta.url),
    "utf8",
  );
  const viewer = readFileSync(
    new URL("../src/components/gallery/gallery-viewer-image.tsx", import.meta.url),
    "utf8",
  );
  assert.match(
    page,
    /!imageSelectionReady[\s\S]*?<noscript>\{image\}<\/noscript>[\s\S]*?waitingForFeaturedPost \? null/,
  );
  assert.doesNotMatch(viewer, /new Image\(|neighbor\.full/);
  assert.match(viewer, /zoomed && tiled && detailViewport/);
  assert.match(viewer, /galleryImageRetrySource\(path, attempt\)/);
});
