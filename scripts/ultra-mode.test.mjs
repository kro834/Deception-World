import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import {
  getUltraModeServerSnapshot,
  getUltraModeSnapshot,
  setUltraMode,
  subscribeUltraMode,
  watchUltraMode,
} from "../src/lib/ultra-mode.js";

const source = readFileSync(new URL("../src/lib/ultra-mode.js", import.meta.url), "utf8");
const exports = [
  "ULTRA_MODE_STORAGE_KEY",
  "ULTRA_MODE_BOOTSTRAP_SCRIPT",
  "getUltraModeSnapshot",
  "getUltraModeServerSnapshot",
  "setUltraMode",
  "subscribeUltraMode",
  "watchUltraMode",
];

function fixture({
  value = null,
  reduced = false,
  forced = false,
  transparency = false,
  contrast = false,
  legacy = false,
} = {}) {
  const attrs = new Map([
    ["data-economy", "on"],
    ["data-ios-device", "true"],
  ]);
  const events = new Map();
  const flags = { denied: false, readError: false, writeError: false, mediaError: false };
  const writes = [];
  const storage = {
    getItem() {
      if (flags.readError) throw new Error("Storage read denied");
      return value;
    },
    setItem(key, next) {
      if (flags.writeError) throw new Error("Storage quota exceeded");
      writes.push([key, next]);
      value = next;
    },
  };
  const query = (matches) => {
    const listeners = new Set();
    const item = { matches, listeners };
    const add = (callback) => listeners.add(callback);
    const remove = (callback) => listeners.delete(callback);
    if (legacy) Object.assign(item, { addListener: add, removeListener: remove });
    else
      Object.assign(item, {
        addEventListener: (_name, callback) => add(callback),
        removeEventListener: (_name, callback) => remove(callback),
      });
    item.change = (next) => {
      item.matches = next;
      for (const listener of [...listeners]) listener({ matches: next });
    };
    return item;
  };
  const motion = query(reduced);
  const colors = query(forced);
  const transparent = query(transparency);
  const contrasting = query(contrast);
  const queries = {
    reduced: motion,
    forced: colors,
    transparency: transparent,
    contrast: contrasting,
  };
  const window = {
    get localStorage() {
      if (flags.denied) throw new Error("Storage getter denied");
      return storage;
    },
    matchMedia(text) {
      if (flags.mediaError) throw new Error("Media unavailable");
      if (text.includes("reduced-motion")) return motion;
      if (text.includes("forced-colors")) return colors;
      if (text.includes("reduced-transparency")) return transparent;
      if (text.includes("prefers-contrast")) return contrasting;
      throw new Error(`Unexpected media query: ${text}`);
    },
    addEventListener(name, callback) {
      if (!events.has(name)) events.set(name, new Set());
      events.get(name).add(callback);
    },
    removeEventListener: (name, callback) => events.get(name)?.delete(callback),
  };
  const document = {
    documentElement: {
      setAttribute: (key, next) => attrs.set(key, next),
      removeAttribute: (key) => attrs.delete(key),
    },
  };
  const context = vm.createContext({ window, document });
  vm.runInContext(`${source.replace(/^export /gm, "")}\nthis.api={${exports.join(",")}};`, context);
  const api = context.api;
  return {
    api,
    attrs,
    flags,
    writes,
    motion,
    colors,
    queries,
    events,
    bootstrap: () => vm.runInContext(api.ULTRA_MODE_BOOTSTRAP_SCRIPT, context),
    emitStorage(key = api.ULTRA_MODE_STORAGE_KEY, next = "true", area = storage) {
      value = next;
      for (const listener of events.get("storage") || [])
        listener({ key, newValue: next, storageArea: area });
    },
    get value() {
      return value;
    },
  };
}

test("server import, snapshot and mutators are safe without browser globals", () => {
  assert.deepEqual(getUltraModeServerSnapshot(), {
    enabled: false,
    motionAllowed: false,
    ready: false,
    storageAvailable: false,
  });
  assert.equal(getUltraModeSnapshot(), getUltraModeServerSnapshot());
  assert.equal(getUltraModeServerSnapshot(), getUltraModeServerSnapshot());
  setUltraMode(true);
  subscribeUltraMode(() => assert.fail("SSR does not emit"))();
  watchUltraMode()();
  assert.equal(getUltraModeSnapshot().enabled, false);
});

test("fresh browser defaults off, waits for client setup, and keeps snapshots stable", () => {
  const f = fixture();
  assert.equal(f.api.getUltraModeSnapshot().ready, false);
  const stop = f.api.watchUltraMode();
  const snapshot = f.api.getUltraModeSnapshot();
  assert.equal(snapshot.enabled, false);
  assert.equal(snapshot.ready, true);
  assert.equal(snapshot.storageAvailable, true);
  assert.equal(snapshot.motionAllowed, true);
  assert.equal(f.api.getUltraModeSnapshot(), snapshot);
  f.emitStorage(f.api.ULTRA_MODE_STORAGE_KEY, null);
  assert.equal(f.api.getUltraModeSnapshot(), snapshot);
  assert.equal(Object.isFrozen(snapshot), true);
  assert.equal(f.api.getUltraModeServerSnapshot().ready, false);
  stop();
});

test("explicit on and off persist locally and update DOM before subscribers run", () => {
  const f = fixture();
  const seen = [];
  const stop = f.api.subscribeUltraMode(() =>
    seen.push([f.api.getUltraModeSnapshot().enabled, f.attrs.get("data-ultra-mode")]),
  );
  f.api.setUltraMode(true);
  assert.equal(f.value, "true");
  assert.equal(f.attrs.get("data-ultra-motion"), "on");
  f.api.setUltraMode(false);
  assert.equal(f.value, "false");
  assert.equal(f.attrs.has("data-ultra-motion"), false);
  assert.equal(f.attrs.has("data-ultra-mode"), false);
  assert.deepEqual(seen, [
    [false, undefined],
    [true, "on"],
    [false, undefined],
  ]);
  assert.deepEqual(f.writes, [
    ["dw-ultra-mode-v1", "true"],
    ["dw-ultra-mode-v1", "false"],
  ]);
  assert.equal(f.attrs.get("data-economy"), "on");
  assert.equal(f.attrs.get("data-ios-device"), "true");
  stop();
});

test("bootstrap and reload agree on strict versioned boolean parsing", () => {
  for (const value of [null, "false", "1", "on", "TRUE", " true", "{broken", "{}", "true"]) {
    const f = fixture({ value });
    f.bootstrap();
    assert.equal(f.attrs.get("data-ultra-mode") === "on", value === "true");
    const stop = f.api.watchUltraMode();
    assert.equal(f.api.getUltraModeSnapshot().enabled, value === "true");
    assert.equal(f.attrs.get("data-ultra-motion") === "on", value === "true");
    stop();
  }
});

test("bootstrap is ES5 and leaves existing device/economy gates intact", () => {
  const f = fixture({ value: "true" });
  assert.doesNotMatch(f.api.ULTRA_MODE_BOOTSTRAP_SCRIPT, /\b(?:const|let)\b|=>|\?\./);
  f.bootstrap();
  assert.equal(f.attrs.get("data-economy"), "on");
  assert.equal(f.attrs.get("data-ios-device"), "true");
});

test("inaccessible storage, failed reads and failed writes retain a usable in-memory switch", () => {
  for (const flag of ["denied", "readError"]) {
    const f = fixture({ value: "true" });
    f.flags[flag] = true;
    f.bootstrap();
    assert.equal(f.attrs.has("data-ultra-mode"), false);
    const stop = f.api.watchUltraMode();
    assert.equal(f.api.getUltraModeSnapshot().enabled, false);
    assert.equal(f.api.getUltraModeSnapshot().storageAvailable, false);
    f.flags.writeError = true;
    f.api.setUltraMode(true);
    assert.equal(f.api.getUltraModeSnapshot().enabled, true);
    assert.equal(f.api.getUltraModeSnapshot().storageAvailable, false);
    f.api.setUltraMode(false);
    assert.equal(f.attrs.has("data-ultra-mode"), false);
    stop();
  }
  const f = fixture();
  f.flags.writeError = true;
  f.api.watchUltraMode();
  f.api.setUltraMode(true);
  assert.equal(f.api.getUltraModeSnapshot().storageAvailable, false);
  assert.equal(f.value, null);
});

test("all four accessibility preferences gate first paint and react to live changes", () => {
  for (const preference of ["reduced", "forced", "transparency", "contrast"]) {
    const f = fixture({ value: "true", [preference]: true });
    f.bootstrap();
    assert.equal(f.attrs.get("data-ultra-mode"), "on");
    assert.equal(f.attrs.has("data-ultra-motion"), false);
    const stop = f.api.watchUltraMode();
    assert.equal(f.api.getUltraModeSnapshot().motionAllowed, false);
    const query = f.queries[preference];
    query.change(false);
    assert.equal(f.api.getUltraModeSnapshot().motionAllowed, true);
    assert.equal(f.attrs.get("data-ultra-motion"), "on");
    query.change(true);
    assert.equal(f.api.getUltraModeSnapshot().motionAllowed, false);
    assert.equal(f.attrs.has("data-ultra-motion"), false);
    query.change(false);
    f.motion.change(true);
    f.colors.change(true);
    f.motion.change(false);
    assert.equal(f.api.getUltraModeSnapshot().motionAllowed, false);
    f.colors.change(false);
    f.api.setUltraMode(false);
    assert.equal(f.attrs.has("data-ultra-motion"), false);
    stop();
  }
});

test("missing media support is conservative in bootstrap and controller", () => {
  const f = fixture({ value: "true" });
  f.flags.mediaError = true;
  f.bootstrap();
  const stop = f.api.watchUltraMode();
  assert.equal(f.api.getUltraModeSnapshot().enabled, true);
  assert.equal(f.api.getUltraModeSnapshot().motionAllowed, false);
  assert.equal(f.attrs.has("data-ultra-motion"), false);
  stop();
});

test("other-tab changes, removal and clear update immediately; unrelated storage is ignored", () => {
  const f = fixture();
  const stop = f.api.watchUltraMode();
  f.emitStorage("another-key", "true");
  assert.equal(f.api.getUltraModeSnapshot().enabled, false);
  f.emitStorage(f.api.ULTRA_MODE_STORAGE_KEY, "true", {});
  assert.equal(f.api.getUltraModeSnapshot().enabled, false);
  f.emitStorage();
  assert.equal(f.api.getUltraModeSnapshot().enabled, true);
  f.emitStorage(f.api.ULTRA_MODE_STORAGE_KEY, "invalid");
  assert.equal(f.api.getUltraModeSnapshot().enabled, false);
  f.emitStorage();
  f.emitStorage(f.api.ULTRA_MODE_STORAGE_KEY, null);
  assert.equal(f.api.getUltraModeSnapshot().enabled, false);
  f.emitStorage();
  f.emitStorage(null, null);
  assert.equal(f.api.getUltraModeSnapshot().enabled, false);
  assert.equal(f.writes.length, 0);
  stop();
});

test("observers share one listener set and remove modern/legacy listeners on final cleanup", () => {
  for (const legacy of [false, true]) {
    const f = fixture({ legacy });
    let calls = 0;
    const notify = () => calls++;
    const stopWatch = f.api.watchUltraMode();
    const stopA = f.api.subscribeUltraMode(notify);
    const stopB = f.api.subscribeUltraMode(notify);
    for (const query of Object.values(f.queries)) assert.equal(query.listeners.size, 1);
    assert.equal(f.events.get("storage").size, 1);
    f.api.setUltraMode(true);
    assert.equal(calls, 2);
    stopA();
    stopA();
    f.api.setUltraMode(false);
    assert.equal(calls, 3);
    stopWatch();
    for (const query of Object.values(f.queries)) assert.equal(query.listeners.size, 1);
    stopB();
    stopB();
    for (const query of Object.values(f.queries)) assert.equal(query.listeners.size, 0);
    assert.equal(f.events.get("storage").size, 0);
    f.emitStorage();
    assert.equal(calls, 3);
    const restart = f.api.watchUltraMode();
    assert.equal(f.api.getUltraModeSnapshot().enabled, true);
    for (const query of Object.values(f.queries)) assert.equal(query.listeners.size, 1);
    restart();
    for (const query of Object.values(f.queries)) assert.equal(query.listeners.size, 0);
  }
});
