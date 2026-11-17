import assert from "node:assert/strict";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { observeBrowserConditions, compareConditions } from "./harness/comparison-conditions.mjs";

const observed = {
  worldEffects: null,
  savedRenderQuality: null,
  storageReadable: true,
  historyReadable: true,
  devicePixelRatio: 1,
  reducedMotion: false,
};
const run = (conditions = observed, conditionsAfter = conditions) => ({
  conditions,
  conditionsAfter,
});

test("condition comparison rejects missing, unreadable, changed and unequal observations", () => {
  assert.equal(compareConditions(run(), run()).status, "matched");
  for (const candidate of [
    {},
    run({ ...observed, storageReadable: false }),
    run({ ...observed, historyReadable: false }),
    run({ ...observed, devicePixelRatio: 2 }),
    run({ ...observed, reducedMotion: true }),
    run({ ...observed, savedRenderQuality: "lightweight" }),
    run(observed, { ...observed, worldEffects: "economy" }),
  ]) {
    assert.equal(compareConditions(run(), candidate).status, "not-comparable");
  }
});

test("observer reads the known storage and newer history choice without changing either", () => {
  const requests = [];
  const value = runInNewContext(`(${observeBrowserConditions.toString()})()`, {
    localStorage: {
      getItem(key) {
        requests.push(key);
        return '{"quality":"high","revision":1}';
      },
    },
    history: { state: { deceptionWorldRenderQualityV1: { quality: "lightweight", revision: 2 } } },
    document: {
      documentElement: {
        getAttribute(key) {
          requests.push(key);
          return "economy";
        },
      },
    },
    window: { devicePixelRatio: 2 },
    matchMedia(query) {
      requests.push(query);
      return { matches: true };
    },
  });
  assert.equal(value.savedRenderQuality, "lightweight");
  assert.equal(value.storageChoice.quality, "high");
  assert.equal(value.historyChoice.quality, "lightweight");
  assert.equal(value.worldEffects, "economy");
  assert.equal(value.devicePixelRatio, 2);
  assert.equal(value.reducedMotion, true);
  assert.deepEqual(requests, [
    "deception-world:render-quality:v1",
    "data-world-effects",
    "(prefers-reduced-motion: reduce)",
  ]);
});

test("unsaved quality stays unknown instead of inventing a default quality guarantee", () => {
  const value = runInNewContext(`(${observeBrowserConditions.toString()})()`, {
    localStorage: {
      getItem() {
        return null;
      },
    },
    history: { state: null },
    document: {
      documentElement: {
        getAttribute() {
          return null;
        },
      },
    },
    window: { devicePixelRatio: 1 },
    matchMedia: () => ({ matches: false }),
  });
  assert.equal(value.savedRenderQuality, null);
  assert.equal(value.storageReadable, true);
  assert.equal(value.historyReadable, true);
});
