import assert from "node:assert/strict";
import test from "node:test";
import { GALLERY_TOURS } from "../src/components/gallery-tours/tour-data.ts";
import {
  TOUR_PROGRESS_KEY,
  readTourProgress,
  saveTourProgress,
  clearTourProgress,
} from "../src/components/gallery-tours/tour-progress.ts";

const first = GALLERY_TOURS[0];
const second = GALLERY_TOURS[1];
const entry = (tour, stop = 0, updatedAt = 1_000) => ({
  workId: tour.stops[stop].artworkId,
  updatedAt,
});

function storageHarness(raw = null) {
  const entries = new Map([["unrelated-key", "keep"]]);
  const writes = [];
  if (raw !== null) entries.set(TOUR_PROGRESS_KEY, raw);
  return {
    entries,
    writes,
    getItem: (key) => entries.get(key) ?? null,
    setItem(key, value) {
      writes.push(key);
      entries.set(key, value);
    },
  };
}

test("missing, malformed, oversized, and unavailable progress reads are safe", () => {
  for (const raw of [null, "", "{broken", "null", "[]", '"text"', "42", " ".repeat(16_385)]) {
    assert.deepEqual(readTourProgress(storageHarness(raw)), {});
  }
  assert.deepEqual(
    readTourProgress({
      getItem() {
        throw new Error("Storage is unavailable");
      },
    }),
    {},
  );
});

test("reads retain only known tour/work pairs and valid timestamps, with at most five records", () => {
  const all = Object.fromEntries(GALLERY_TOURS.map((tour) => [tour.id, entry(tour)]));
  const dirty = { ...all, unknown: entry(first), __proto__: { polluted: true } };
  assert.deepEqual(readTourProgress(storageHarness(JSON.stringify(dirty))), all);
  assert.equal(Object.keys(readTourProgress(storageHarness(JSON.stringify(dirty)))).length, 5);

  for (const invalid of [
    null,
    [],
    "g05",
    {},
    { ...entry(first), workId: "g84" },
    { ...entry(first), workId: 5 },
    { ...entry(first), updatedAt: "1000" },
    { ...entry(first), updatedAt: -1 },
    { ...entry(first), updatedAt: 1.5 },
    { ...entry(first), updatedAt: Number.MAX_SAFE_INTEGER + 1 },
    { ...entry(first), updatedAt: null },
  ]) {
    assert.deepEqual(
      readTourProgress(
        storageHarness(JSON.stringify({ [first.id]: invalid, [second.id]: entry(second) })),
      ),
      { [second.id]: entry(second) },
    );
  }
});

test("saving reads the latest storage value and merges another tab's progress", () => {
  const storage = storageHarness(JSON.stringify({ [first.id]: entry(first) }));
  readTourProgress(storage);
  storage.entries.set(
    TOUR_PROGRESS_KEY,
    JSON.stringify({ [first.id]: entry(first), [second.id]: entry(second, 2, 2_000) }),
  );
  const saved = saveTourProgress(storage, first.id, first.stops[3].artworkId, 3_000);
  assert.deepEqual(saved, {
    [first.id]: entry(first, 3, 3_000),
    [second.id]: entry(second, 2, 2_000),
  });
  assert.deepEqual(readTourProgress(storage), saved);
  assert.deepEqual(storage.writes, [TOUR_PROGRESS_KEY]);
  assert.equal(storage.entries.get("unrelated-key"), "keep");
});

test("resetting one tour preserves the others and can recover malformed saved data", () => {
  const storage = storageHarness(
    JSON.stringify({ [first.id]: entry(first), [second.id]: entry(second) }),
  );
  assert.deepEqual(clearTourProgress(storage, first.id), { [second.id]: entry(second) });
  assert.deepEqual(readTourProgress(storage), { [second.id]: entry(second) });
  assert.equal(storage.entries.get("unrelated-key"), "keep");
  assert.deepEqual(clearTourProgress(storageHarness("broken"), first.id), {});
  assert.deepEqual(
    saveTourProgress(storageHarness("broken"), first.id, first.stops[0].artworkId, 0),
    {
      [first.id]: entry(first, 0, 0),
    },
  );
});

test("invalid mutations fail before accessing storage or changing existing progress", () => {
  const storage = {
    getItem() {
      assert.fail("Invalid input must not access storage");
    },
    setItem() {
      assert.fail("Invalid input must not write storage");
    },
  };
  assert.throws(() => saveTourProgress(storage, "unknown", "g05", 1), RangeError);
  assert.throws(() => saveTourProgress(storage, first.id, "g84", 1), RangeError);
  for (const now of [NaN, Infinity, -1, 0.1, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(
      () => saveTourProgress(storage, first.id, first.stops[0].artworkId, now),
      RangeError,
    );
  }
  assert.throws(() => clearTourProgress(storage, "unknown"), RangeError);
});

test("blocked reads and writes surface failures without reporting an unsaved change as saved", () => {
  const error = new Error("Storage denied");
  const original = JSON.stringify({ [first.id]: entry(first), [second.id]: entry(second) });
  for (const operation of [
    (storage) => saveTourProgress(storage, first.id, first.stops[1].artworkId, 2_000),
    (storage) => clearTourProgress(storage, first.id),
  ]) {
    const blockedRead = storageHarness(original);
    blockedRead.getItem = () => {
      throw error;
    };
    assert.throws(
      () => operation(blockedRead),
      (caught) => caught === error,
    );
    assert.equal(blockedRead.entries.get(TOUR_PROGRESS_KEY), original);
    assert.equal(blockedRead.writes.length, 0);

    const blockedWrite = storageHarness(original);
    blockedWrite.setItem = () => {
      throw error;
    };
    assert.throws(
      () => operation(blockedWrite),
      (caught) => caught === error,
    );
    assert.equal(blockedWrite.entries.get(TOUR_PROGRESS_KEY), original);
  }
});
