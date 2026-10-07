import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_GALLERY_DISPLAY,
  GALLERY_DISPLAY_KEY,
  normalizeGalleryDisplayPreferences,
  parseGalleryDisplayPreferences,
  readGalleryDisplayPreferences,
  resetGalleryDisplayPreferences,
  updateGalleryDisplayPreferences,
} from "../src/components/gallery/gallery-display-preferences.ts";

function storage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
}

test("display preferences persist for one browser without modifying artwork preferences", () => {
  const mine = storage();
  const other = storage();
  mine.setItem("deception-world.gallery-feature.v1", "g81");
  mine.setItem("deception-world.gallery-favorites.v1", '["g01"]');
  const result = updateGalleryDisplayPreferences(mine, DEFAULT_GALLERY_DISPLAY, {
    density: "spacious",
    background: "light",
  });
  assert.equal(result.saved, true);
  assert.deepEqual(readGalleryDisplayPreferences(mine), result.preferences);
  assert.deepEqual(readGalleryDisplayPreferences(other), DEFAULT_GALLERY_DISPLAY);
  resetGalleryDisplayPreferences(mine);
  assert.equal(mine.getItem(GALLERY_DISPLAY_KEY), null);
  assert.equal(mine.getItem("deception-world.gallery-feature.v1"), "g81");
  assert.equal(mine.getItem("deception-world.gallery-favorites.v1"), '["g01"]');
});

test("invalid data, deleted keys and unknown values recover to supported defaults", () => {
  for (const value of [null, "", "{broken", "null", "[]", '"compact"', "false", "19"]) {
    assert.deepEqual(parseGalleryDisplayPreferences(value), DEFAULT_GALLERY_DISPLAY);
  }
  assert.deepEqual(
    parseGalleryDisplayPreferences('{"density":"future","background":"light","unknown":true}'),
    { density: "standard", background: "light" },
  );
  assert.deepEqual(normalizeGalleryDisplayPreferences({ density: "compact", background: 4 }), {
    density: "compact",
    background: "ink",
  });
});

test("partial changes retain the other visible preference and do not mutate current state", () => {
  const current = Object.freeze({ density: "compact", background: "warm" });
  const result = updateGalleryDisplayPreferences(storage(), current, { background: "light" });
  assert.deepEqual(result.preferences, { density: "compact", background: "light" });
  assert.deepEqual(current, { density: "compact", background: "warm" });
  assert.deepEqual(DEFAULT_GALLERY_DISPLAY, { density: "standard", background: "ink" });
});

test("quota and unavailable storage keep the requested display but never claim it was saved", () => {
  const broken = {
    setItem() {
      throw new Error("quota");
    },
  };
  for (const target of [broken, undefined]) {
    const result = updateGalleryDisplayPreferences(target, DEFAULT_GALLERY_DISPLAY, {
      density: "compact",
      background: "warm",
    });
    assert.deepEqual(result, {
      preferences: { density: "compact", background: "warm" },
      saved: false,
    });
  }
});

test("failed reset still resets this view without claiming persisted settings were removed", () => {
  const broken = {
    removeItem() {
      throw new Error("blocked");
    },
  };
  for (const target of [broken, undefined]) {
    assert.deepEqual(resetGalleryDisplayPreferences(target), {
      preferences: DEFAULT_GALLERY_DISPLAY,
      saved: false,
    });
  }
});

test("blocked reads surface to the caller instead of masquerading as an empty preference", () => {
  assert.throws(() =>
    readGalleryDisplayPreferences({
      getItem() {
        throw new Error("blocked");
      },
    }),
  );
});

test("external replacements and deletions replace stale local choices with safe values", () => {
  const mine = storage();
  for (const [raw, expected] of [
    ['{"density":"spacious","background":"warm"}', { density: "spacious", background: "warm" }],
    ['{"density":"compact","background":"unsupported"}', { density: "compact", background: "ink" }],
    ["not-json", { density: "standard", background: "ink" }],
    [null, { density: "standard", background: "ink" }],
  ]) {
    if (raw === null) mine.removeItem(GALLERY_DISPLAY_KEY);
    else mine.setItem(GALLERY_DISPLAY_KEY, raw);
    assert.deepEqual(parseGalleryDisplayPreferences(raw), expected);
    assert.deepEqual(readGalleryDisplayPreferences(mine), expected);
  }
});
