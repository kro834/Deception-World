import assert from "node:assert/strict";
import test from "node:test";
import { GALLERY_ARTWORKS } from "../src/components/gallery/gallery-data.ts";
import {
  filterGalleryArtworks,
  GALLERY_FAVORITES_KEY,
  matchesGalleryQuery,
  normalizeGalleryQuery,
  readGalleryFavorites,
  toggleGalleryFavorite,
} from "../src/components/gallery/gallery-discovery.ts";

function memoryStorage(initial = null) {
  const values = new Map(initial ? [[GALLERY_FAVORITES_KEY, initial]] : []);
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
}

test("normalizes compatibility forms, case, and whitespace for discovery", () => {
  assert.equal(normalizeGalleryQuery("　００３　"), "003");
  assert.equal(matchesGalleryQuery(GALLERY_ARTWORKS[2], "００３"), true);
  assert.equal(matchesGalleryQuery(GALLERY_ARTWORKS[2], "g０３"), true);
  assert.equal(matchesGalleryQuery(GALLERY_ARTWORKS[2], GALLERY_ARTWORKS[2].alt.slice(0, 5)), true);
  assert.equal(matchesGalleryQuery(GALLERY_ARTWORKS[2], "見つからない語"), false);
});

test("combines category, search, personal title, and favorites filters", () => {
  const selected = GALLERY_ARTWORKS[2];
  const results = filterGalleryArtworks(GALLERY_ARTWORKS, {
    category: selected.category,
    query: "自分の題名",
    favoritesOnly: true,
    favorites: [selected.id],
    titles: { [selected.id]: "自分の題名" },
  });
  assert.deepEqual(
    results.map((work) => work.id),
    [selected.id],
  );
  assert.deepEqual(
    filterGalleryArtworks(GALLERY_ARTWORKS, {
      category: "all",
      query: "",
      favoritesOnly: false,
      favorites: [],
      titles: {},
    }),
    [...GALLERY_ARTWORKS],
  );
});

test("favorite storage validates known IDs, deduplicates, and toggles without losing other tabs", () => {
  const ids = GALLERY_ARTWORKS.map((work) => work.id);
  const storage = memoryStorage(JSON.stringify(["g01", "g01", "g114", "bad", 4]));
  assert.deepEqual(readGalleryFavorites(storage, ids), ["g01"]);
  assert.deepEqual(toggleGalleryFavorite(storage, "g02", ids), ["g01", "g02"]);
  assert.deepEqual(toggleGalleryFavorite(storage, "g01", ids), ["g02"]);
  assert.throws(() => toggleGalleryFavorite(storage, "g114", ids));
  storage.setItem(GALLERY_FAVORITES_KEY, "not-json");
  assert.deepEqual(readGalleryFavorites(storage, ids), []);
});
