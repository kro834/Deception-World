import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import test from "node:test";
import { preloadAssets } from "../src/lib/asset-loader.ts";
import { REXONANCE_SUIT_ASSETS } from "../src/lib/rexonance-suit.ts";

test("speculative image work is low priority and one native request", async (t) => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "Image");
  t.after(() => {
    if (descriptor) Object.defineProperty(globalThis, "Image", descriptor);
    else delete globalThis.Image;
  });
  const images = [];
  globalThis.Image = class {
    naturalWidth = 32;
    constructor() {
      images.push(this);
    }
    async decode() {}
  };
  const source = "/initial-load-budget-priority.webp";
  await Promise.all([
    preloadAssets([source], () => {}, "low"),
    preloadAssets([source], () => {}, "high"),
  ]);
  assert.equal(images.length, 1);
  assert.equal(images[0].fetchPriority, "low");
  assert.equal(images[0].decoding, "async");
  await preloadAssets(["/initial-load-budget-demand.webp"], () => {}, "high");
  assert.equal(images[1].fetchPriority, "high");
});

async function suitSchedule(t, pathname, hidden = false) {
  const originals = new Map(
    ["window", "document", "Image", "navigator"].map((key) => [
      key,
      Object.getOwnPropertyDescriptor(globalThis, key),
    ]),
  );
  t.after(() => {
    for (const [key, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  });
  const images = [],
    timers = new Map(),
    idles = new Map();
  let id = 0;
  const document = { hidden, readyState: "complete", documentElement: { dataset: {} } };
  const window = {
    location: { pathname },
    matchMedia: () => ({ matches: false }),
    setTimeout: (fn) => {
      timers.set(++id, fn);
      return id;
    },
    clearTimeout: (key) => timers.delete(key),
    requestIdleCallback: (fn) => {
      idles.set(++id, fn);
      return id;
    },
    cancelIdleCallback: (key) => idles.delete(key),
    removeEventListener() {},
  };
  for (const [key, value] of Object.entries({
    window,
    document,
    navigator: { connection: {} },
    Image: class {
      constructor() {
        images.push(this);
      }
    },
  }))
    Object.defineProperty(globalThis, key, { configurable: true, value });
  const module = await import(`../src/lib/rexonance-suit-warmup.ts?budget=${pathname}-${hidden}`);
  const cancel = module.scheduleRexonanceSuitWarm();
  const flush = (queue) => {
    const jobs = [...queue.values()];
    queue.clear();
    jobs.forEach((fn) => fn());
  };
  return { images, timers, idles, document, cancel, flush };
}

test("opening never downloads the unrelated suit atlas", async (t) => {
  const f = await suitSchedule(t, "/");
  f.flush(f.timers);
  f.flush(f.idles);
  assert.equal(f.images.length, 0);
  assert.equal(f.timers.size, 0);
  assert.ok(
    REXONANCE_SUIT_ASSETS.reduce(
      (total, src) => total + statSync(new URL(`../public${src}`, import.meta.url)).size,
      0,
    ) > 300_000,
    "the opening keeps more than 300KB of unrelated artwork off its path",
  );
  const gate = readFileSync(new URL("../src/components/load-gate.tsx", import.meta.url), "utf8");
  assert.match(gate, /scheduleRexonanceSuitWarm\(\), \[pathname\]/);
});

test("public pages retain suit warmup after load and idle", async (t) => {
  const f = await suitSchedule(t, "/world");
  assert.equal(f.images.length, 0);
  f.flush(f.timers);
  assert.equal(f.images.length, 0);
  f.flush(f.idles);
  assert.equal(f.images.length, REXONANCE_SUIT_ASSETS.length);
  assert.ok(f.images.every((image) => image.fetchPriority === "low"));
  f.cancel();
});

test("suspended or cancelled idle warmup performs no work", async (t) => {
  const f = await suitSchedule(t, "/dream-chapter");
  f.flush(f.timers);
  f.document.hidden = true;
  f.flush(f.idles);
  assert.equal(f.images.length, 0);
  f.cancel();
  assert.equal(f.idles.size, 0);
  assert.equal(f.timers.size, 0);
});

test("Zeus image is low-priority and is not preloaded on the opening", () => {
  const root = readFileSync(new URL("../src/routes/__root.tsx", import.meta.url), "utf8");
  assert.match(root, /routeId as string\) === "\/"\)[\s\S]*?\? \[\]/);
  assert.match(root, /href: "\/zeus-button-360.webp",[\s\S]*?fetchPriority: "low" as const/);
});
