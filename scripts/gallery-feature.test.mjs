import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import {
  GALLERY_FEATURE_KEY,
  readGalleryFeature,
  saveGalleryFeature,
} from "../src/components/gallery/gallery-feature.ts";

function storage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
}

test("featured artwork persists locally without affecting another visitor or other settings", () => {
  const mine = storage();
  const other = storage();
  mine.setItem("favorites", "kept");
  assert.equal(readGalleryFeature(mine, ["g01", "g02"]), null);
  saveGalleryFeature(mine, "g02", ["g01", "g02"]);
  assert.equal(readGalleryFeature(mine, ["g01", "g02"]), "g02");
  assert.equal(readGalleryFeature(other, ["g01", "g02"]), null);
  saveGalleryFeature(mine, null, ["g01", "g02"]);
  assert.equal(readGalleryFeature(mine, ["g01", "g02"]), null);
  assert.equal(mine.getItem("favorites"), "kept");
});

test("invalid and removed identifiers fall back safely and cannot be saved", () => {
  const mine = storage();
  mine.setItem(GALLERY_FEATURE_KEY, "unknown");
  assert.equal(readGalleryFeature(mine, ["g01"]), null);
  assert.throws(() => saveGalleryFeature(mine, "unknown", ["g01"]));
  saveGalleryFeature(mine, "g01", ["g01"]);
  assert.equal(readGalleryFeature(mine, []), null);
});

test("shared artwork selection survives delayed collection loading", () => {
  const mine = storage();
  const id = "u-12345678-1234-4234-8234-123456789abc";
  saveGalleryFeature(mine, id, [id]);
  assert.equal(readGalleryFeature(mine, ["g01"]), id);
});

test("storage failures propagate so the UI cannot report an unsaved choice as saved", () => {
  assert.throws(() =>
    saveGalleryFeature(
      {
        setItem() {
          throw new Error("quota");
        },
        removeItem() {
          throw new Error("blocked");
        },
      },
      "g01",
      ["g01"],
    ),
  );
  assert.throws(() =>
    readGalleryFeature(
      {
        getItem() {
          throw new Error("blocked");
        },
      },
      ["g01"],
    ),
  );
});

test("featured framing follows the selected artwork ratio and copy uses its available width", () => {
  const page = readFileSync(
    new URL("../src/components/gallery/gallery-page.tsx", import.meta.url),
    "utf8",
  );
  const css = readFileSync(new URL("../src/styles-gallery.css", import.meta.url), "utf8");
  assert.match(page, /"--gallery-feature-ratio" as string\]: featured.width \/ featured.height/);
  assert.match(page, /data-feature-shape=\{featured.width < featured.height/);
  assert.match(css, /aspect-ratio: var\(--gallery-feature-ratio\)/);
  assert.match(css, /container-type: inline-size/);
  assert.match(css, /font-size: clamp\(32px, 13cqi,/);
  assert.doesNotMatch(css, /aspect-ratio: 1\.(12|08)/);
});

test("the fixed header reserves and covers the status-bar safe area", () => {
  const css = readFileSync(new URL("../src/styles-gallery.css", import.meta.url), "utf8");
  const chromeCss = readFileSync(
    new URL("../src/styles-viewport-chrome.css", import.meta.url),
    "utf8",
  );
  assert.match(css, /padding-top: calc\(var\(--gallery-bar\) \+ env\(safe-area-inset-top, 0px\)\)/);
  assert.match(
    chromeCss,
    /\[data-viewport-chrome="gallery"\]\s*\{\s*--viewport-chrome-color: #171614;/,
  );
  assert.match(chromeCss, /\.viewport-chrome-cover::before \{[\s\S]*?background: inherit;/);
  assert.match(css, /padding: calc\(12px \+ env\(safe-area-inset-top, 0px\)\)/);
});
