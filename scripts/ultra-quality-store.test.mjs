import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import { getUltraQualityServerSnapshot } from "../src/lib/ultra-quality.js";

const source = readFileSync(new URL("../src/lib/ultra-quality.js", import.meta.url), "utf8");
const exports = [
  "ULTRA_QUALITY_STORAGE_KEY",
  "getUltraQualitySnapshot",
  "getUltraQualityServerSnapshot",
  "subscribeUltraQuality",
  "setUltraQuality",
];

function fixture({ value = null } = {}) {
  const values = new Map(value === null ? [] : [["dw-ultra-quality-v1", value]]);
  const flags = { denied: false, readError: false, writeError: false };
  const events = new Map();
  const writes = [];
  const storage = {
    getItem(key) {
      if (flags.readError) throw new Error("Storage read denied");
      return values.get(key) ?? null;
    },
    setItem(key, next) {
      if (flags.writeError) throw new Error("Storage write denied");
      values.set(key, next);
      writes.push([key, next]);
    },
  };
  const window = {
    get localStorage() {
      if (flags.denied) throw new Error("Storage access denied");
      return storage;
    },
    addEventListener(name, callback) {
      if (!events.has(name)) events.set(name, new Set());
      events.get(name).add(callback);
    },
    removeEventListener(name, callback) {
      events.get(name)?.delete(callback);
    },
  };
  const context = vm.createContext({ window, document: {} });
  vm.runInContext(`${source.replace(/^export /gm, "")}\nthis.api={${exports.join(",")}};`, context);
  const api = context.api;
  return {
    api,
    events,
    flags,
    storage,
    writes,
    values,
    emitStorage(key = api.ULTRA_QUALITY_STORAGE_KEY, newValue = null, area = storage) {
      if (key === null) values.clear();
      else if (newValue === null) values.delete(key);
      else values.set(key, newValue);
      for (const listener of events.get("storage") || [])
        listener({ type: "storage", key, newValue, storageArea: area });
    },
  };
}

test("server snapshot is stable, frozen, and defaults to high", () => {
  const first = getUltraQualityServerSnapshot();
  assert.deepEqual(first, { quality: "high", ready: false, storageAvailable: false });
  assert.equal(first, getUltraQualityServerSnapshot());
  assert.equal(Object.isFrozen(first), true);
});

test("browser startup accepts only the two quality names and snapshots stay stable", () => {
  for (const [value, expected] of [[null, "high"], ["high", "high"], ["cinema", "cinema"], ["Cinema", "high"], ["1", "high"], ["", "high"]]) {
    const f = fixture({ value });
    const stop = f.api.subscribeUltraQuality(() => {});
    const snapshot = f.api.getUltraQualitySnapshot();
    assert.equal(snapshot.quality, expected);
    assert.equal(snapshot.ready, true);
    assert.equal(snapshot.storageAvailable, true);
    assert.equal(f.api.getUltraQualitySnapshot(), snapshot);
    assert.equal(Object.isFrozen(snapshot), true);
    stop();
  }
});

test("strict high/cinema selections save locally and notify same-tab subscribers", () => {
  const f = fixture();
  const seen = [];
  const stop = f.api.subscribeUltraQuality(() =>
    seen.push(f.api.getUltraQualitySnapshot().quality),
  );
  seen.length = 0;
  f.api.setUltraQuality("cinema");
  assert.equal(f.values.get(f.api.ULTRA_QUALITY_STORAGE_KEY), "cinema");
  f.api.setUltraQuality("high");
  assert.equal(f.values.get(f.api.ULTRA_QUALITY_STORAGE_KEY), "high");
  assert.deepEqual(seen, ["cinema", "high"]);
  assert.deepEqual(f.writes, [
    ["dw-ultra-quality-v1", "cinema"],
    ["dw-ultra-quality-v1", "high"],
  ]);
  assert.throws(() => f.api.setUltraQuality("ultra"), /Ultra quality must be 'high' or 'cinema'/);
  assert.equal(f.api.getUltraQualitySnapshot().quality, "high");
  stop();
});

test("blocked storage and failed writes preserve a usable in-memory choice", () => {
  for (const flag of ["denied", "readError"]) {
    const f = fixture();
    f.flags[flag] = true;
    if (flag === "readError") f.flags.writeError = true;
    const stop = f.api.subscribeUltraQuality(() => {});
    assert.equal(f.api.getUltraQualitySnapshot().storageAvailable, false);
    f.api.setUltraQuality("cinema");
    assert.equal(f.api.getUltraQualitySnapshot().quality, "cinema");
    assert.equal(f.api.getUltraQualitySnapshot().storageAvailable, false);
    stop();
  }

  const f = fixture();
  const stop = f.api.subscribeUltraQuality(() => {});
  f.flags.writeError = true;
  f.api.setUltraQuality("cinema");
  assert.equal(f.api.getUltraQualitySnapshot().quality, "cinema");
  assert.equal(f.api.getUltraQualitySnapshot().storageAvailable, false);
  assert.equal(f.values.has(f.api.ULTRA_QUALITY_STORAGE_KEY), false);
  stop();
});

test("cross-tab values, invalid values, removals, and clear update the snapshot", () => {
  const f = fixture();
  const stop = f.api.subscribeUltraQuality(() => {});
  f.emitStorage("unrelated-key", "cinema");
  assert.equal(f.api.getUltraQualitySnapshot().quality, "high");
  f.emitStorage(f.api.ULTRA_QUALITY_STORAGE_KEY, "cinema");
  assert.equal(f.api.getUltraQualitySnapshot().quality, "cinema");
  f.emitStorage(f.api.ULTRA_QUALITY_STORAGE_KEY, "bad-value");
  assert.equal(f.api.getUltraQualitySnapshot().quality, "high");
  f.emitStorage(f.api.ULTRA_QUALITY_STORAGE_KEY, "cinema", {});
  assert.equal(f.api.getUltraQualitySnapshot().quality, "high");
  f.emitStorage(null);
  assert.equal(f.api.getUltraQualitySnapshot().quality, "high");
  assert.equal(f.api.getUltraQualitySnapshot().storageAvailable, true);
  stop();
});

test("multiple subscriptions share one storage observer and release it after the last owner", () => {
  const f = fixture();
  const first = f.api.subscribeUltraQuality(() => {});
  const second = f.api.subscribeUltraQuality(() => {});
  assert.equal(f.events.get("storage").size, 1);
  first();
  assert.equal(f.events.get("storage").size, 1);
  second();
  assert.equal(f.events.get("storage").size, 0);
});

test("resubscription refreshes dormant cross-tab changes unless a failed save owns the session value", () => {
  const f = fixture({ value: "high" });
  const first = f.api.subscribeUltraQuality(() => {});
  first();
  f.emitStorage(f.api.ULTRA_QUALITY_STORAGE_KEY, "cinema");
  const second = f.api.subscribeUltraQuality(() => {});
  assert.equal(f.api.getUltraQualitySnapshot().quality, "cinema");
  second();

  const g = fixture({ value: "high" });
  const initial = g.api.subscribeUltraQuality(() => {});
  g.flags.writeError = true;
  g.api.setUltraQuality("cinema");
  initial();
  g.emitStorage(g.api.ULTRA_QUALITY_STORAGE_KEY, "high");
  const resumed = g.api.subscribeUltraQuality(() => {});
  assert.equal(g.api.getUltraQualitySnapshot().quality, "cinema");
  assert.equal(g.api.getUltraQualitySnapshot().storageAvailable, false);
  resumed();
});
