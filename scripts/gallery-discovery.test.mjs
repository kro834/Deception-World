import assert from "node:assert/strict";
import test from "node:test";
import { GALLERY_ARTWORKS } from "../src/components/gallery/gallery-data.ts";
import {
  filterGalleryArtworks,
  GALLERY_FAVORITES_KEY,
  matchesGalleryQuery,
  matchesParsedGalleryQuery,
  normalizeGalleryQuery,
  parseGalleryQuery,
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

test("searches all space-separated words in any order across descriptions and public titles", () => {
  const artwork = { ...GALLERY_ARTWORKS[0], alt: "青い装甲と金の剣", title: "使わない旧展示名" };
  assert.deepEqual(parseGalleryQuery("　青　金 青　"), { kind: "text", terms: ["青", "金"] });
  assert.equal(matchesGalleryQuery(artwork, "青 金"), true);
  assert.equal(matchesGalleryQuery(artwork, "金 青"), true);
  assert.equal(matchesGalleryQuery(artwork, "青 雨"), false);
  assert.equal(matchesGalleryQuery(artwork, "約束 青", "桜の約束"), true);
  assert.equal(matchesGalleryQuery(artwork, "使わない旧展示名"), false);
  assert.equal(matchesParsedGalleryQuery(artwork, parseGalleryQuery("　")), true);
});

test("standalone catalogue numbers are exact, including short, padded, and compatibility forms", () => {
  const third = GALLERY_ARTWORKS[2];
  const oneHundredThird = GALLERY_ARTWORKS[102];
  for (const query of ["3", "03", "003", "g3", "Ｇ００３"]) {
    assert.equal(matchesGalleryQuery(third, query), true, query);
    assert.equal(matchesGalleryQuery(oneHundredThird, query), false, query);
  }
  assert.equal(matchesGalleryQuery(GALLERY_ARTWORKS[0], "003", "003という題名"), false);
  assert.equal(matchesGalleryQuery(third, "0"), false);
  assert.equal(matchesGalleryQuery(third, "u003"), false);
});

test("catalogue ranges include both ends and accept reverse order and full-width notation", () => {
  for (const query of ["080–089", "89-80", "０８０〜０８９", "g080 - g089"]) {
    const parsed = parseGalleryQuery(query);
    assert.deepEqual(parsed, { kind: "number", collection: "catalogue", from: 80, to: 89 });
    assert.deepEqual(
      GALLERY_ARTWORKS.filter((work) => matchesParsedGalleryQuery(work, parsed)).map(
        (work) => work.id,
      ),
      Array.from({ length: 10 }, (_, index) => `g${80 + index}`),
    );
  }
});

test("community numbers and ranges never borrow catalogue numbers or UUID digits", () => {
  const community = {
    ...GALLERY_ARTWORKS[2],
    id: "u-12345678-1234-4234-8234-123456789abc",
    category: "community",
    communitySequence: 3,
  };
  assert.equal(matchesGalleryQuery(community, "Ｕ００３"), true);
  assert.equal(matchesGalleryQuery(community, "u004–u002"), true);
  assert.equal(matchesGalleryQuery(community, "U002-004"), true);
  assert.equal(matchesGalleryQuery(community, "3"), false);
  assert.equal(matchesGalleryQuery(community, "1234"), false);
  assert.equal(matchesGalleryQuery(community, "U004–U008"), false);
  assert.equal(matchesGalleryQuery({ ...community, communitySequence: undefined }, "U003"), false);
  assert.equal(matchesGalleryQuery(GALLERY_ARTWORKS[2], "U002–U004"), false);
  for (const query of ["003–U004", "U003–g004", "9007199254740992", "3-4-5"]) {
    assert.equal(parseGalleryQuery(query).kind, "text", query);
    assert.equal(matchesGalleryQuery(community, query), false, query);
  }
});

test("range and multi-word discovery still intersect category, favorites, and published titles", () => {
  const options = {
    category: "designs",
    query: "080–090",
    favoritesOnly: true,
    favorites: ["g81", "g84", "g87", "g90"],
    titles: { g81: "春の約束", g84: "春の道" },
  };
  assert.deepEqual(
    filterGalleryArtworks(GALLERY_ARTWORKS, options).map((work) => work.id),
    ["g81", "g84"],
  );
  assert.deepEqual(
    filterGalleryArtworks(GALLERY_ARTWORKS, { ...options, query: "春 バイク" }).map(
      (work) => work.id,
    ),
    ["g84"],
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
