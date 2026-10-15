import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { galleryGridImage } from "../src/components/gallery/gallery-grid-image.ts";

function image() {
  return {
    connected: true,
    attributes: new Map(),
    setAttribute(key, value) {
      this.attributes.set(key, value);
    },
    removeAttribute(key) {
      assert.equal(this.connected, true, "release auto sizes before detaching the host");
      this.attributes.delete(key);
    },
  };
}

test("justified gallery images use actual width with density-aware, shape-safe fallbacks", () => {
  for (const density of ["standard", "compact", "spacious"]) {
    for (const [width, height] of [
      [1024, 1536],
      [1536, 1024],
      [1000, 1000],
    ]) {
      const { sizes } = galleryGridImage(density, width, height);
      assert.match(sizes, /^auto, /);
      assert.match(sizes, /\(max-width: 700px\)/);
      assert.match(sizes, /\(max-width: 1020px\)/);
      assert.equal(
        sizes,
        density === "spacious"
          ? "auto, (max-width: 700px) 92vw, (max-width: 1020px) 75vw, 60vw"
          : width > height
            ? "auto, (max-width: 700px) 92vw, (max-width: 1020px) 60vw, 44vw"
            : "auto, (max-width: 700px) 46vw, (max-width: 1020px) 30vw, 22vw",
      );
    }
  }
});

test("refs stay stable for rerenders and do not retain images in an artwork cache", () => {
  const refs = new Set();
  for (let width = 1; width <= 2400; width += 17) {
    for (const density of ["standard", "compact", "spacious"]) {
      const props = galleryGridImage(density, width, 1000);
      assert.strictEqual(props, galleryGridImage(density, width, 1000));
      refs.add(props.ref);
      assert.equal(props.ref(null), undefined);
    }
  }
  assert.equal(refs.size, 3, "arbitrary uploaded artwork dimensions do not create more refs");
});

test("changing density releases the old auto listener and applies the new fallback", () => {
  const node = image();
  let cleanup;
  for (const density of ["standard", "spacious", "compact", "spacious", "standard"]) {
    cleanup?.();
    assert.equal(node.attributes.has("sizes"), false);
    const props = galleryGridImage(density, 1024, 1536);
    cleanup = props.ref(node);
    assert.equal(node.attributes.get("sizes"), props.sizes);
  }
  cleanup();
  assert.equal(node.attributes.has("sizes"), false);
  node.connected = false;
});

test("shared gallery refs release every image independently and survive StrictMode reattachment", () => {
  const props = galleryGridImage("compact", 1024, 1536);
  const first = image();
  const second = image();
  props.ref(first)();
  assert.equal(first.attributes.has("sizes"), false);
  const releaseFirst = props.ref(first);
  const releaseSecond = props.ref(second);
  releaseFirst();
  first.connected = false;
  assert.equal(second.attributes.get("sizes"), props.sizes);
  releaseSecond();
  assert.equal(second.attributes.has("sizes"), false);
  second.connected = false;
});

test("auto sizing is restricted to lazy grid images, not featured or full-resolution viewing", () => {
  const page = readFileSync(
    new URL("../src/components/gallery/gallery-page.tsx", import.meta.url),
    "utf8",
  );
  const viewer = readFileSync(
    new URL("../src/components/gallery/gallery-viewer-image.tsx", import.meta.url),
    "utf8",
  );
  const tags = page.match(/<img\b[\s\S]*?\/>/g) ?? [];
  const autoImages = tags.filter((tag) => tag.includes("galleryGridImage("));
  assert.equal(autoImages.length, 1);
  assert.match(autoImages[0], /src=\{work\.thumb\}/);
  assert.match(autoImages[0], /srcSet=\{work\.srcSet\}/);
  assert.match(
    autoImages[0],
    /galleryGridImage\(display\.preferences\.density, work\.width, work\.height\)/,
  );
  assert.match(autoImages[0], /loading="lazy"/);
  const featured = tags.find((tag) => tag.includes("src={featured.medium}"));
  assert.ok(featured);
  assert.match(featured, /fetchPriority="high"/);
  assert.doesNotMatch(featured, /galleryGridImage|auto,/);
  assert.doesNotMatch(viewer, /galleryGridImage|sizes="auto/);
  assert.match(viewer, /src=\{source\}/);
});
