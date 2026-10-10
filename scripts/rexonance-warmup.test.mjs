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
    cleanup = warmRexonanceStages({}, [
      "/rider-rexonance-max-20260922.webp",
      "/rider-rexonance-ultra-20260922.webp",
    ]);
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

test("A resolver warms the visible element's own candidates, sizes only when it has them", async () => {
  const f = fixture();
  let cleanup;
  try {
    cleanup = warmRexonanceStages(
      {},
      ["/civilian-bell-20260826.jpeg", "/character-nagi-20260922.webp"],
      (source) =>
        source.endsWith(".jpeg")
          ? { srcSet: source.replace(/\.jpeg$/, "-delivery.webp") }
          : {
              srcSet: `${source.replace(/\.webp$/, "")}-delivery-640.webp 640w`,
              sizes: "(max-width: 767px) 100vw, 64vw",
            },
    );
    f.near();
    f.flush();
    assert.equal(f.images[0].srcset, "/civilian-bell-20260826-delivery.webp");
    assert.equal(f.images[0].sizes, undefined);
    assert.equal(f.images[0].src, "/civilian-bell-20260826.jpeg");
    f.images[0].onload();
    await Promise.resolve();
    f.flush();
    assert.equal(f.images[1].sizes, "(max-width: 767px) 100vw, 64vw");
    assert.match(f.images[1].srcset, /character-nagi-20260922-delivery-640\.webp 640w/);
  } finally {
    cleanup?.();
    f.restore();
  }
});

// rx12: the entry call's suit-up pieces decode on intent, once, and never
// gate navigation; the call builds the suit only once they all decoded.
async function suitFixture({
  connection = {},
  reduced = false,
  economy = false,
  fail = false,
  pathname = "/world",
  readyState = "complete",
} = {}) {
  const timers = [];
  const idles = [];
  const originals = new Map(
    ["window", "document", "navigator", "Image"].map((key) => [
      key,
      Object.getOwnPropertyDescriptor(globalThis, key),
    ]),
  );
  const images = [];
  class Image {
    constructor() {
      images.push(this);
    }
    decode() {
      return fail && this.src.endsWith("figure.webp")
        ? Promise.reject(new Error("x"))
        : Promise.resolve();
    }
  }
  for (const [key, value] of Object.entries({
    window: {
      matchMedia: () => ({ matches: reduced }),
      location: { pathname },
      setTimeout: (f) => timers.push(f),
      clearTimeout: () => {},
      requestIdleCallback: (f) => idles.push(f),
      cancelIdleCallback: () => {},
      addEventListener: (_, f) => timers.push(f),
      removeEventListener: () => {},
    },
    document: {
      readyState,
      documentElement: { dataset: economy ? { worldEffects: "economy" } : {} },
    },
    navigator: { connection },
    Image,
  })) {
    Object.defineProperty(globalThis, key, { configurable: true, value });
  }
  const module = await import(`../src/lib/rexonance-suit-warmup.ts?${Math.random()}`);
  return {
    images,
    module,
    load: () => images.forEach((image) => image.onload?.()),
    timers,
    idles,
    restore() {
      for (const [key, descriptor] of originals) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor);
        else delete globalThis[key];
      }
    },
  };
}

test("The suit-up's pieces decode once on intent, then the call may build", async () => {
  const { REXONANCE_SUIT_ASSETS } = await import("../src/lib/rexonance-suit.ts");
  const f = await suitFixture();
  try {
    const first = f.module.warmRexonanceSuit();
    assert.equal(f.module.warmRexonanceSuit("high"), first, "one warm-up at a time");
    assert.deepEqual(
      f.images.map((image) => image.src),
      [...REXONANCE_SUIT_ASSETS],
    );
    assert.ok(
      f.images.every((image) => image.decoding === "async" && image.fetchPriority === "low"),
    );
    assert.equal(f.module.isRexonanceSuitReady(), false);
    f.load();
    assert.equal(await first, true);
    assert.equal(f.module.isRexonanceSuitReady(), true);
    await f.module.warmRexonanceSuit();
    assert.equal(f.images.length, REXONANCE_SUIT_ASSETS.length, "never fetched twice");
  } finally {
    f.restore();
  }
});

test("The suit-up never warms on data saving or where the call rests on a still", async () => {
  for (const options of [
    { connection: { saveData: true } },
    { connection: { effectiveType: "3g" } },
    { reduced: true },
    { economy: true },
  ]) {
    const f = await suitFixture(options);
    try {
      assert.equal(await f.module.warmRexonanceSuit(), false);
      assert.equal(f.images.length, 0);
      assert.equal(f.module.isRexonanceSuitReady(), false);
    } finally {
      f.restore();
    }
  }
});

test("A failed suit-up decode leaves the call whole and lets a later intent retry", async () => {
  const f = await suitFixture({ fail: true });
  try {
    const first = f.module.warmRexonanceSuit();
    f.images.at(-1).onerror();
    f.load();
    assert.equal(await first, false);
    assert.equal(f.module.isRexonanceSuitReady(), false);
    const count = f.images.length;
    void f.module.warmRexonanceSuit();
    assert.ok(f.images.length > count, "retried");
  } finally {
    f.restore();
  }
});

test("rx13: the suit-up warms in advance, at idle after the page has loaded", async () => {
  const f = await suitFixture({ readyState: "loading" });
  try {
    const cancel = f.module.scheduleRexonanceSuitWarm();
    assert.equal(f.images.length, 0, "never during the page's own load");
    f.timers.shift()(); // load
    assert.equal(f.images.length, 0);
    f.timers.shift()(); // the delay after load
    assert.equal(f.images.length, 0, "it waits for idle");
    f.idles.shift()();
    assert.ok(f.images.length > 0);
    assert.ok(f.images.every((image) => image.fetchPriority === "low"));
    cancel();
  } finally {
    f.restore();
  }
  for (const options of [{ pathname: "/rexonance-saga" }, { reduced: true }]) {
    const g = await suitFixture(options);
    try {
      g.module.scheduleRexonanceSuitWarm();
      for (const run of [...g.timers, ...g.idles]) run();
      for (const run of [...g.timers, ...g.idles]) run();
      assert.equal(g.images.length, 0, JSON.stringify(options));
    } finally {
      g.restore();
    }
  }
});
