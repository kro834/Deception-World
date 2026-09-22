import assert from "node:assert/strict";
import test from "node:test";
import { warmRexonanceStages } from "../src/lib/warm-rexonance-stages.ts";

function fixture(connection = {}) {
  const originals = new Map(
    ["window", "document", "navigator", "Image", "IntersectionObserver"].map((key) => [
      key,
      Object.getOwnPropertyDescriptor(globalThis, key),
    ]),
  );
  const images = [],
    idle = new Map(),
    timers = new Map(),
    listeners = new Map();
  let id = 0,
    observe,
    disconnected = false;
  class Observer {
    constructor(callback) {
      observe = callback;
    }
    observe() {}
    disconnect() {
      disconnected = true;
    }
  }
  class Image {
    constructor() {
      images.push(this);
    }
    removeAttribute(key) {
      delete this[key];
    }
    decode() {
      return Promise.resolve();
    }
  }
  const document = {
    hidden: false,
    addEventListener: (k, f) => listeners.set(k, f),
    removeEventListener: (k) => listeners.delete(k),
  };
  const window = {
    IntersectionObserver: Observer,
    requestIdleCallback: (f) => {
      idle.set(++id, f);
      return id;
    },
    cancelIdleCallback: (id) => idle.delete(id),
    setTimeout: (f) => {
      timers.set(++id, f);
      return id;
    },
    clearTimeout: (id) => timers.delete(id),
  };
  for (const [key, value] of Object.entries({
    window,
    document,
    navigator: { connection },
    Image,
    IntersectionObserver: Observer,
  })) {
    Object.defineProperty(globalThis, key, { configurable: true, value });
  }
  return {
    images,
    idle,
    timers,
    listeners,
    document,
    get disconnected() {
      return disconnected;
    },
    near() {
      observe([{ isIntersecting: true }]);
    },
    flush() {
      const jobs = [...idle.values()];
      idle.clear();
      jobs.forEach((f) => f());
    },
    restore() {
      for (const [key, descriptor] of originals) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor);
        else delete globalThis[key];
      }
    },
  };
}

test("Alternate forms warm only near the rail, sequentially and at low priority", async () => {
  const f = fixture();
  let cleanup;
  try {
    cleanup = warmRexonanceStages({}, ["/rider-rexonance-max-20260922.webp", "/rider-rexonance-ultra-20260922.webp"]);
    f.flush();
    assert.equal(f.images.length, 0);
    f.near();
    f.flush();
    assert.equal(f.images.length, 1);
    assert.equal(f.images[0].fetchPriority, "low");
    assert.match(f.images[0].srcset, /delivery-640/);
    f.flush();
    assert.equal(f.images.length, 1);
    f.images[0].onload();
    await Promise.resolve();
    f.flush();
    assert.equal(f.images.length, 2);
    cleanup();
    assert.equal(f.images[1].src, undefined);
    assert.equal(f.images[1].srcset, undefined);
    assert.equal(f.timers.size, 0);
    assert.equal(f.listeners.size, 0);
    assert.ok(f.disconnected);
  } finally {
    cleanup?.();
    f.restore();
  }
});

test("Data saving avoids speculative downloads and hidden tabs defer warmup", () => {
  for (const connection of [{ saveData: true }, { effectiveType: "3g" }, { effectiveType: "2g" }]) {
    const f = fixture(connection);
    try {
      warmRexonanceStages({}, ["/rider-rexonance-max-20260922.webp"])();
      f.flush();
      assert.equal(f.images.length, 0);
    } finally {
      f.restore();
    }
  }
  const f = fixture();
  let cleanup;
  try {
    cleanup = warmRexonanceStages({}, ["/rider-rexonance-max-20260922.webp"]);
    f.document.hidden = true;
    f.near();
    f.flush();
    assert.equal(f.images.length, 0);
    f.document.hidden = false;
    f.listeners.get("visibilitychange")();
    f.flush();
    assert.equal(f.images.length, 1);
  } finally {
    cleanup?.();
    f.restore();
  }
});
