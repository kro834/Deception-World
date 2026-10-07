import assert from "node:assert/strict";
import test from "node:test";
import {
  GALLERY_TOURS,
  getGalleryTour,
  getTourArtwork,
  getTourStopIndex,
  normalizeTourSearch,
} from "../src/components/gallery-tours/tour-data.ts";

test("every curated tour has a reachable cover and a complete sequence of existing artworks", () => {
  assert.equal(GALLERY_TOURS.length, 5);
  assert.equal(new Set(GALLERY_TOURS.map((tour) => tour.id)).size, GALLERY_TOURS.length);
  for (const tour of GALLERY_TOURS) {
    assert.ok(tour.stops.length >= 6 && tour.stops.length <= 8, tour.id);
    assert.equal(
      new Set(tour.stops.map((stop) => stop.artworkId)).size,
      tour.stops.length,
      tour.id,
    );
    assert.ok(
      tour.stops.some((stop) => stop.artworkId === tour.coverId),
      tour.id,
    );
    assert.match(tour.accent, /^#[\da-f]{6}$/i);
    for (const stop of tour.stops) {
      const artwork = getTourArtwork(stop.artworkId);
      assert.ok(artwork?.width > 0 && artwork?.height > 0, stop.artworkId);
      assert.ok(artwork.full && artwork.medium && artwork.thumb, stop.artworkId);
      assert.ok(stop.note.trim().length > 0, stop.artworkId);
    }
  }
});

test("tour search only preserves a known tour and artwork within that tour", () => {
  const tour = GALLERY_TOURS[0];
  const work = tour.stops[2].artworkId;
  assert.deepEqual(normalizeTourSearch({ tour: tour.id, work, unrelated: "discard" }), {
    tour: tour.id,
    work,
  });
  for (const invalid of [undefined, null, 1, [work], "missing", "g84"]) {
    assert.deepEqual(normalizeTourSearch({ tour: tour.id, work: invalid }), { tour: tour.id });
  }
  for (const invalid of [undefined, null, {}, [], 1, "missing", "__proto__", "toString"]) {
    assert.deepEqual(normalizeTourSearch({ tour: invalid, work }), {});
    assert.equal(getGalleryTour(invalid), undefined);
  }
  assert.deepEqual(normalizeTourSearch({ work }), {});
  assert.equal(getTourArtwork("g999999"), undefined);
});

test("a missing or invalid stop starts at the beginning and valid deep links select the exact stop", () => {
  const tour = GALLERY_TOURS[0];
  assert.equal(getTourStopIndex(tour), 0);
  assert.equal(getTourStopIndex(tour, "not-in-tour"), 0);
  tour.stops.forEach((stop, index) => assert.equal(getTourStopIndex(tour, stop.artworkId), index));
});
