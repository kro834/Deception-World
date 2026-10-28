import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
const code = ts.transpileModule(
  readFileSync(new URL("../src/lib/gallery-sticker-warmup.ts", import.meta.url), "utf8"),
  { compilerOptions: { module: ts.ModuleKind.CommonJS } },
).outputText;
const flush = async () => {
  for (let i = 0; i < 12; i++) await Promise.resolve();
};
function host() {
  const exports = {},
    images = [],
    idle = new Map(),
    listeners = new Map();
  let next = 0,
    open = false,
    observe,
    disconnected = false;
  const navigator = { onLine: true, connection: {} };
  const root = { hasAttribute: () => open };
  class Image {
    constructor() {
      images.push(this);
    }
    decode() {
      return new Promise((resolve, reject) => Object.assign(this, { resolve, reject }));
    }
  }
  const window = {
    document: { documentElement: root },
    requestIdleCallback: (fn) => {
      idle.set(++next, fn);
      return next;
    },
    cancelIdleCallback: (id) => idle.delete(id),
    clearTimeout() {},
    addEventListener: (n, f) => listeners.set(n, f),
    removeEventListener: (n) => listeners.delete(n),
  };
  runInNewContext(code, {
    exports,
    Image,
    window,
    navigator,
    document: window.document,
    MutationObserver: class {
      constructor(fn) {
        observe = fn;
      }
      observe() {}
      disconnect() {
        disconnected = true;
      }
    },
  });
  return {
    exports,
    images,
    navigator,
    idle,
    listeners,
    get disconnected() {
      return disconnected;
    },
    menu(value) {
      open = value;
      observe();
    },
    run() {
      for (const fn of idle.values()) fn();
      idle.clear();
    },
  };
}
test("failed stickers retry on the next opening while decoded and pending sources remain deduplicated", async () => {
  const h = host();
  h.exports.scheduleGalleryStickerWarmup(["a", "b"]);
  assert.equal(h.images.length, 0);
  h.menu(true);
  h.run();
  assert.equal(h.images.length, 2);
  h.menu(true);
  h.run();
  assert.equal(h.images.length, 2);
  h.images[0].resolve();
  h.images[1].reject(Error("offline"));
  await flush();
  h.menu(false);
  h.menu(true);
  h.run();
  assert.equal(h.images.length, 3);
  assert.equal(h.images[2].src, "b");
  h.images[2].resolve();
  await flush();
  h.menu(true);
  h.run();
  assert.equal(h.images.length, 3);
});
test("offline and restricted connections can recover without remounting; closing or disposing prevents idle work", () => {
  const h = host();
  h.navigator.onLine = false;
  const stop = h.exports.scheduleGalleryStickerWarmup(["a"]);
  h.menu(true);
  h.run();
  assert.equal(h.images.length, 0);
  h.navigator.onLine = true;
  h.listeners.get("online")();
  h.run();
  assert.equal(h.images.length, 1);
  h.menu(false);
  h.menu(true);
  h.menu(false);
  h.run();
  assert.equal(h.images.length, 1);
  stop();
  assert.equal(h.disconnected, true);
  assert.equal(h.listeners.size, 0);
  h.menu(true);
  h.run();
  assert.equal(h.images.length, 1);
  const restricted = host();
  restricted.navigator.connection.saveData = true;
  restricted.exports.scheduleGalleryStickerWarmup(["a"]);
  restricted.menu(true);
  restricted.run();
  assert.equal(restricted.images.length, 0);
  restricted.navigator.connection.saveData = false;
  restricted.menu(false);
  restricted.menu(true);
  restricted.run();
  assert.equal(restricted.images.length, 1);
});
