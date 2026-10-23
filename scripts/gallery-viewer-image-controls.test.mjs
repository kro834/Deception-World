import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import {
  galleryImagePanPosition,
  galleryImageResizePosition,
  galleryImageRetrySource,
} from "../src/components/gallery/gallery-viewer-state.ts";

const viewport = {
  width: 300,
  height: 500,
  scrollWidth: 600,
  scrollHeight: 1000,
  left: 150,
  top: 250,
};

test("zoom observes the canvas and waits for extent changes before remembering position", () => {
  const source = readFileSync(
    new URL("../src/components/gallery/gallery-viewer-image.tsx", import.meta.url),
    "utf8",
  );
  assert.match(source, /observer\.observe\(viewport\)/);
  assert.match(source, /querySelector\("\.gallery-image-canvas"\)/);
  assert.match(source, /if \(canvas\) observer\.observe\(canvas\)/);
  assert.match(source, /previous\.scrollWidth === next\.scrollWidth/);
  assert.match(source, /previous\.scrollHeight === next\.scrollHeight/);
  assert.match(source, /previous\.scrollWidth !== next\.scrollWidth/);
  assert.match(source, /previous\.scrollHeight !== next\.scrollHeight/);
});

test("enlargement centres measured scrollable artwork even when extents are not exactly double", () => {
  assert.deepEqual(galleryImageResizePosition(null, viewport), { left: 150, top: 250 });
  assert.deepEqual(
    galleryImageResizePosition(null, { ...viewport, scrollWidth: 726, scrollHeight: 500 }),
    { left: 213, top: 0 },
  );
  assert.deepEqual(
    galleryImageResizePosition(null, { ...viewport, scrollWidth: 0, scrollHeight: 0 }),
    { left: 0, top: 0 },
  );
});

test("portrait-to-landscape resize keeps the same artwork point in the viewport centre", () => {
  const previous = { ...viewport, left: 210, top: 100 };
  const next = { ...viewport, width: 600, height: 240, scrollWidth: 1200, scrollHeight: 480 };
  assert.deepEqual(galleryImageResizePosition(previous, next), { left: 420, top: 48 });
  const result = galleryImageResizePosition(previous, next);
  assert.equal((result.left + next.width / 2) / next.scrollWidth, 0.6);
  assert.equal((result.top + next.height / 2) / next.scrollHeight, 0.35);
});

test("resize clamps artwork edges and recovers from a temporarily zero-sized viewport", () => {
  assert.deepEqual(galleryImageResizePosition({ ...viewport, left: 900, top: -900 }, viewport), {
    left: 300,
    top: 0,
  });
  assert.deepEqual(
    galleryImageResizePosition({ ...viewport, scrollWidth: 0, scrollHeight: 0 }, viewport),
    { left: 150, top: 250 },
  );
});

test("orientation changes preserve the artwork point through changing contain letterboxing", () => {
  const previous = {
    width: 300,
    height: 500,
    scrollWidth: 600,
    scrollHeight: 1000,
    left: 210,
    top: 100,
  };
  const next = { ...previous, width: 600, height: 240, scrollWidth: 1200, scrollHeight: 480 };
  // Portrait artwork fills the former canvas width, then the new canvas height.
  // Its centre moves from artwork fractions (0.6, 1/3) to the same fractions.
  const artwork = { width: 1000, height: 1500 };
  assert.deepEqual(galleryImageResizePosition(previous, next, artwork), { left: 332, top: 40 });
  assert.deepEqual(galleryImageResizePosition(null, next, artwork), { left: 300, top: 120 });
});

test("all four arrows pan explicitly and stop at each image edge", () => {
  assert.deepEqual(galleryImagePanPosition(viewport, "ArrowLeft"), { left: 105, top: 250 });
  assert.deepEqual(galleryImagePanPosition(viewport, "ArrowRight"), { left: 195, top: 250 });
  assert.deepEqual(galleryImagePanPosition(viewport, "ArrowUp"), { left: 150, top: 175 });
  assert.deepEqual(galleryImagePanPosition(viewport, "ArrowDown"), { left: 150, top: 325 });
  const corner = { ...viewport, left: 0, top: 500 };
  assert.deepEqual(galleryImagePanPosition(corner, "ArrowLeft"), { left: 0, top: 500 });
  assert.deepEqual(galleryImagePanPosition(corner, "ArrowDown"), { left: 0, top: 500 });
  assert.equal(galleryImagePanPosition(viewport, "Escape"), null);
  assert.equal(galleryImagePanPosition(viewport, "Tab"), null);
});

test("retry bypasses failed cache entries without losing existing queries or fragments", () => {
  assert.equal(galleryImageRetrySource("/art.webp", 0), "/art.webp");
  assert.equal(galleryImageRetrySource("/art.webp", 1), "/art.webp?retry=1");
  assert.equal(
    galleryImageRetrySource("/art.webp?size=900#art", 2),
    "/art.webp?size=900&retry=2#art",
  );
  assert.equal(galleryImageRetrySource("/art.webp#art", 3), "/art.webp?retry=3#art");
});
