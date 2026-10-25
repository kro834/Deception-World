import assert from "node:assert/strict";
import test from "node:test";
import {
  exhibitionBrowsePage,
  findExhibitionArtworks,
} from "../src/components/exhibition/exhibition-artwork-browse.ts";

const artworks = Object.freeze([
  { id: "g01", title: "星の光輪", alt: "白銀の装甲姿", width: 100, height: 200 },
  { id: "g02", title: "夕空の対峙", alt: "青い装甲姿と紫の姿", width: 200, height: 100 },
  { id: "g03", title: "星空", alt: "白銀の街", width: 100, height: 100 },
]);

test("exhibition shelf resolves exact full-width or zero-padded artwork numbers", () => {
  for (const query of ["2", "００２", "g02", "Ｇ００２", " 02 "]) {
    assert.deepEqual(
      findExhibitionArtworks(artworks, query, "all").map(({ artwork }) => artwork.id),
      ["g02"],
    );
  }
  for (const query of ["0", "999", "g000"]) {
    assert.deepEqual(findExhibitionArtworks(artworks, query, "all"), []);
  }
});

test("exhibition shelf combines every search word with artwork format without changing artwork order", () => {
  assert.deepEqual(
    findExhibitionArtworks(artworks, "星 白銀", "all").map(({ index }) => index),
    [0, 2],
  );
  assert.deepEqual(
    findExhibitionArtworks(artworks, "星 白銀", "square").map(({ index }) => index),
    [2],
  );
  assert.deepEqual(findExhibitionArtworks(artworks, "２", "portrait"), []);
  assert.deepEqual(
    findExhibitionArtworks(artworks, "　", "all").map(({ index }) => index),
    [0, 1, 2],
  );
  assert.deepEqual(
    artworks.map(({ id }) => id),
    ["g01", "g02", "g03"],
  );
});

test("exhibition shelf keeps the last partial page and clamps pages after filtering", () => {
  assert.deepEqual(exhibitionBrowsePage(113, 9, 12), { count: 10, page: 9, start: 108, end: 113 });
  assert.deepEqual(exhibitionBrowsePage(3, 9, 12), { count: 1, page: 0, start: 0, end: 3 });
  assert.deepEqual(exhibitionBrowsePage(0, 9, 12), { count: 1, page: 0, start: 0, end: 0 });
  assert.deepEqual(exhibitionBrowsePage(24, -1, 12), { count: 2, page: 0, start: 0, end: 12 });
});
