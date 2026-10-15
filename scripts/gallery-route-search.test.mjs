import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { GALLERY_ARTWORKS } from "../src/components/gallery/gallery-data.ts";
import { GALLERY_TOURS } from "../src/components/gallery-tours/tour-data.ts";
import { GALLERY_WORK_IDS, normalizeExhibitionSearch } from "../src/lib/gallery-route-search.ts";
import {
  GALLERY_TOUR_WORK_IDS,
  normalizeTourSearch,
} from "../src/components/gallery-tours/tour-route-search.ts";

const invalidValues = [
  undefined,
  null,
  true,
  false,
  0,
  1,
  NaN,
  {},
  [],
  ["g01"],
  new String("g01"),
  "",
  "g00",
  "g1",
  "g001",
  "G01",
  " g01",
  "g01 ",
  "g114",
  "g999999",
  "__proto__",
  "constructor",
  "toString",
  "https://example.com/art.webp",
  "../../secret",
];

test("lightweight route IDs exactly match every published artwork and each curated stop", () => {
  assert.deepEqual(
    GALLERY_WORK_IDS,
    GALLERY_ARTWORKS.map((art) => art.id),
  );
  assert.deepEqual(
    Object.entries(GALLERY_TOUR_WORK_IDS),
    GALLERY_TOURS.map((tour) => [tour.id, tour.stops.map((stop) => stop.artworkId)]),
  );
});

test("exhibition validation preserves the original result shape for all works and invalid inputs", () => {
  for (const work of [...GALLERY_ARTWORKS.map((art) => art.id), ...invalidValues]) {
    const expected = {
      work:
        typeof work === "string" && GALLERY_ARTWORKS.some((art) => art.id === work)
          ? work
          : undefined,
    };
    assert.deepEqual(normalizeExhibitionSearch({ work, unrelated: "discard" }), expected);
  }
  assert.deepEqual(normalizeExhibitionSearch({}), { work: undefined });
});

test("tour validation is equivalent across every tour, artwork, and invalid parameter combination", () => {
  for (const tourId of [...GALLERY_TOURS.map((tour) => tour.id), ...invalidValues]) {
    for (const work of [...GALLERY_ARTWORKS.map((art) => art.id), ...invalidValues]) {
      const tour = GALLERY_TOURS.find((entry) => entry.id === tourId);
      const expected = !tour
        ? {}
        : typeof work === "string" && tour.stops.some((stop) => stop.artworkId === work)
          ? { tour: tour.id, work }
          : { tour: tour.id };
      assert.deepEqual(normalizeTourSearch({ tour: tourId, work, unrelated: "discard" }), expected);
    }
  }
  assert.deepEqual(normalizeTourSearch({}), {});
});

test("shared route validators cannot import the gallery payload or full tour prose", () => {
  const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
  for (const path of [
    "src/lib/gallery-route-search.ts",
    "src/components/gallery-tours/tour-route-search.ts",
  ]) {
    assert.doesNotMatch(read(path), /\b(?:import|require)\s*(?:\(|["'{*]|[A-Za-z_$])/);
  }
  assert.match(read("src/routes/exhibition.tsx"), /validateSearch: normalizeExhibitionSearch/);
  assert.match(
    read("src/routes/gallery-tours.tsx"),
    /from "@\/components\/gallery-tours\/tour-route-search"/,
  );
  assert.doesNotMatch(
    read("src/routes/gallery-tours.tsx"),
    /from "@\/components\/gallery-tours\/tour-data"/,
  );
});
