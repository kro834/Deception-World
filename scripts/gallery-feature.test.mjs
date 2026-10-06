import assert from "node:assert/strict";
import test from "node:test";
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
