import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";
import {
  REXONANCE_SUIT_ASSETS,
  REXONANCE_SUIT_ATLAS,
  REXONANCE_SUIT_GOLD_ATLAS,
} from "../src/lib/rexonance-suit.ts";
import * as suit from "../src/lib/rexonance-suit.ts";

let fixtureId = 0;
const settle = async () => {
  for (let index = 0; index < 12; index++) await Promise.resolve();
};

async function fixture({ path = "/world", hidden = false, delayedBitmaps = false } = {}) {
  const names = ["window", "document", "navigator", "Image", "fetch", "createImageBitmap"];
  const original = names.map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)]);
  const timers = new Map();
  const idles = new Map();
  const images = [];
  const requests = [];
  const bitmaps = [];
  let nextId = 1;
  const doc = new EventTarget();
  Object.assign(doc, { hidden, readyState: "complete", documentElement: { dataset: {} } });
  const win = new EventTarget();
  Object.assign(win, {
    location: { pathname: path },
    matchMedia: () => ({ matches: false }),
    setTimeout: (run, delay) => {
      const id = nextId++;
      timers.set(id, { run, delay });
      return id;
    },
    clearTimeout: (id) => timers.delete(id),
    requestIdleCallback: (run, options) => {
      const id = nextId++;
      idles.set(id, { run, options });
      return id;
    },
    cancelIdleCallback: (id) => idles.delete(id),
  });
  class Picture {
    constructor() {
      this.onload = null;
      this.onerror = null;
      images.push(this);
    }
    decode() {
      return Promise.resolve();
    }
    removeAttribute(name) {
      if (name === "src") this.removed = true;
    }
  }
  const fetchImage = (src, { priority, signal }) =>
    new Promise((resolve, reject) => {
      const request = {
        src,
        priority,
        signal,
        resolve: () => resolve({ ok: true, blob: async () => ({ src, request }) }),
        reject: () => reject(new Error("Injected image failure")),
      };
      requests.push(request);
      signal.addEventListener("abort", () => reject(new Error("Aborted")), { once: true });
    });
  const bitmapImage = (blob) => {
    const bitmap = {
      src: blob.src,
      request: blob.request,
      closed: false,
      close() {
        this.closed = true;
      },
    };
    bitmaps.push(bitmap);
    if (!delayedBitmaps) return Promise.resolve(bitmap);
    return new Promise((resolve) => {
      bitmap.resolve = () => resolve(bitmap);
    });
  };
  for (const [name, value] of Object.entries({
    window: win,
    document: doc,
    navigator: { connection: { effectiveType: "4g" } },
    Image: Picture,
    fetch: fetchImage,
    createImageBitmap: bitmapImage,
  }))
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
  const module = await import(`../src/lib/rexonance-suit-warmup.ts?cancel=${fixtureId++}`);
  return {
    module,
    timers,
    idles,
    images,
    requests,
    bitmaps,
    win,
    runTimer() {
      const [id, { run }] = timers.entries().next().value;
      timers.delete(id);
      run();
    },
    runIdle() {
      const [id, { run }] = idles.entries().next().value;
      idles.delete(id);
      run();
    },
    loadImages() {
      images.forEach((image) => image.onload?.());
    },
    visibility(value) {
      doc.hidden = value;
      doc.dispatchEvent(new Event("visibilitychange"));
    },
    restore() {
      for (const [name, descriptor] of original) {
        if (descriptor) Object.defineProperty(globalThis, name, descriptor);
        else delete globalThis[name];
      }
    },
  };
}

test("rx17: public warmup waits one second then idle, starting all layers at low priority", async () => {
  const f = await fixture();
  try {
    const cancel = f.module.scheduleRexonanceSuitWarm();
    assert.deepEqual(
      [...f.timers.values()].map(({ delay }) => delay),
      [1000],
    );
    assert.equal(f.images.length + f.requests.length, 0);
    f.runTimer();
    assert.equal(f.images.length + f.requests.length, 0);
    f.runIdle();
    assert.equal(f.images.length + f.requests.length, REXONANCE_SUIT_ASSETS.length);
    assert.ok(f.images.every((image) => image.fetchPriority === "low"));
    assert.ok(f.requests.every((request) => request.priority === "low"));
    cancel();
    assert.ok(f.requests.every((request) => request.signal.aborted));
    await settle();
  } finally {
    f.restore();
  }
});

test("rx17: go pause aborts background fetch and resumes only after the last idempotent release", async () => {
  const f = await fixture();
  try {
    const cancel = f.module.scheduleRexonanceSuitWarm();
    f.runTimer();
    f.runIdle();
    const low = f.module.warmRexonanceSuit();
    const first = f.module.pauseRexonanceSuitWarmup();
    const second = f.module.pauseRexonanceSuitWarmup();
    assert.ok(f.requests.every((request) => request.signal.aborted));
    assert.ok(f.images.every((image) => image.removed));
    assert.equal(await low, false);
    assert.equal(await f.module.warmRexonanceSuit(), false);
    assert.equal(f.timers.size + f.idles.size, 0);
    first();
    first();
    assert.equal(f.timers.size, 0, "duplicate cleanup does not release another go's pause");
    second();
    assert.deepEqual(
      [...f.timers.values()].map(({ delay }) => delay),
      [1000],
    );
    f.runTimer();
    f.runIdle();
    assert.equal(f.requests.length, 4, "the aborted background requests are retried after go");
    assert.ok(f.requests.slice(2).every((request) => !request.signal.aborted));
    cancel();
    await settle();
  } finally {
    f.restore();
  }
});

test("rx17: high intent adopts an active low batch without duplicate downloads or cancellation", async () => {
  const f = await fixture();
  try {
    const low = f.module.warmRexonanceSuit();
    assert.equal(f.module.warmRexonanceSuit("high"), low);
    const resume = f.module.pauseRexonanceSuitWarmup(true);
    assert.equal(f.requests.length, 2);
    assert.ok(f.requests.every((request) => !request.signal.aborted));
    f.requests.forEach((request) => request.resolve());
    await settle();
    f.loadImages();
    await settle();
    assert.equal(await low, true);
    const sources = f.bitmaps.map((bitmap) => f.module.rexonanceSuitSource(bitmap.src));
    assert.deepEqual(sources, f.bitmaps);
    assert.equal(f.idles.size, 0, "background plan preparation waits for the go owner");
    resume();
    assert.equal(f.idles.size, 1, "completed decode resumes the plan warmup after go");
    assert.equal(f.module.isRexonanceSuitReady(), true);
    assert.ok(f.bitmaps.every((bitmap) => !bitmap.closed));
  } finally {
    f.restore();
  }
});

test("rx17: unrelated navigation aborts high hover intent while Rexonance route cleanup retains it", async () => {
  const f = await fixture();
  try {
    const cancel = f.module.scheduleRexonanceSuitWarm();
    f.runTimer();
    f.runIdle();
    const warm = f.module.warmRexonanceSuit("high");
    cancel();
    assert.ok(
      f.requests.every((request) => !request.signal.aborted),
      "route cleanup is not go cancellation",
    );
    const resume = f.module.pauseRexonanceSuitWarmup();
    assert.ok(
      f.requests.every((request) => request.signal.aborted),
      "Dream or another go owns the network",
    );
    assert.ok(f.images.every((image) => image.removed));
    assert.equal(await warm, false);
    resume();
    assert.equal(f.timers.size + f.idles.size, 0, "a cancelled reservation cannot restart");
    const retry = f.module.warmRexonanceSuit("high");
    f.requests.slice(2).forEach((request) => request.resolve());
    await settle();
    f.loadImages();
    await settle();
    assert.equal(await retry, true);
  } finally {
    f.restore();
  }
});

test("rx17: hiding the scheduled page aborts even high hover intent", async () => {
  const f = await fixture();
  try {
    const cancel = f.module.scheduleRexonanceSuitWarm();
    f.runTimer();
    f.runIdle();
    const warm = f.module.warmRexonanceSuit("high");
    f.visibility(true);
    assert.ok(f.requests.every((request) => request.signal.aborted));
    assert.equal(await warm, false);
    assert.equal(f.timers.size + f.idles.size, 0);
    cancel();
  } finally {
    f.restore();
  }
});

test("rx17: high intent immediately retries a known failed atlas while gold and CSS jobs remain live", async () => {
  const f = await fixture();
  try {
    const low = f.module.warmRexonanceSuit();
    const failed = f.requests.find((request) => request.src === REXONANCE_SUIT_ATLAS.src);
    const gold = f.requests.find((request) => request.src === REXONANCE_SUIT_GOLD_ATLAS.src);
    failed.reject();
    await settle();
    assert.equal(f.requests.length, 2, "background failure does not create an automatic retry");
    const high = f.module.warmRexonanceSuit("high");
    assert.equal(high, low, "intent owns the same public pending promise");
    assert.equal(f.requests.length, 3, "the failed file retries before gold settles");
    assert.equal(f.requests.at(-1).src, failed.src);
    assert.equal(f.requests.at(-1).priority, "high");
    assert.equal(f.images.length, REXONANCE_SUIT_ASSETS.length - 2);
    assert.ok(f.requests.every((request) => !request.signal.aborted));
    assert.equal(f.module.warmRexonanceSuit("high"), high);
    assert.equal(f.requests.length, 3, "repeated intent does not duplicate the retry");
    gold.resolve();
    f.loadImages();
    await settle();
    const kept = f.module.rexonanceSuitSource(gold.src);
    assert.ok(kept);
    let settled = false;
    void high.then(() => {
      settled = true;
    });
    await settle();
    assert.equal(
      settled,
      false,
      "the old failure does not settle pending while its replacement runs",
    );
    f.requests.at(-1).resolve();
    await settle();
    f.loadImages();
    await settle();
    assert.equal(await high, true);
    assert.equal(f.module.isRexonanceSuitReady(), true);
    assert.equal(f.module.rexonanceSuitSource(gold.src), kept);
    assert.equal(kept.closed, false);
    assert.equal(f.requests.filter((request) => request.src === gold.src).length, 1);
  } finally {
    f.restore();
  }
});

test("rx17: a source failing after high adoption retries only once and a later batch can recover", async () => {
  const f = await fixture();
  try {
    const low = f.module.warmRexonanceSuit();
    assert.equal(f.module.warmRexonanceSuit("high"), low);
    f.requests[0].reject();
    await settle();
    assert.equal(f.requests.length, 3);
    assert.equal(f.requests.at(-1).priority, "high");
    f.requests.at(-1).reject();
    f.requests[1].resolve();
    f.loadImages();
    await settle();
    assert.equal(await low, false);
    assert.equal(f.requests.length, 3, "a persistent failure cannot loop");
    const kept = f.module.rexonanceSuitSource(REXONANCE_SUIT_GOLD_ATLAS.src);
    const retry = f.module.warmRexonanceSuit("high");
    assert.equal(f.requests.length, 4, "a later batch retries only the still-missing atlas");
    f.requests.at(-1).resolve();
    await settle();
    f.loadImages();
    await settle();
    assert.equal(await retry, true);
    assert.equal(f.module.rexonanceSuitSource(REXONANCE_SUIT_GOLD_ATLAS.src), kept);
    assert.equal(kept.closed, false);
  } finally {
    f.restore();
  }
});

test("rx17: the plate CSS decode and bitmap decode run together without declaring readiness early", async () => {
  const f = await fixture({ delayedBitmaps: true });
  try {
    const warm = f.module.warmRexonanceSuit();
    f.requests.forEach((request) => request.resolve());
    await settle();
    const plateImage = f.images.find((image) => image.src === REXONANCE_SUIT_ATLAS.src);
    assert.ok(plateImage, "CSS decode can start while the bitmap is still pending");
    f.loadImages();
    await settle();
    assert.equal(f.module.isRexonanceSuitReady(), false);
    assert.equal(f.module.rexonanceSuitSource(REXONANCE_SUIT_ATLAS.src), null);
    f.bitmaps.forEach((bitmap) => bitmap.resolve());
    assert.equal(await warm, true);
    assert.equal(f.module.rexonanceSuitSource(REXONANCE_SUIT_ATLAS.src), f.bitmaps[0]);
    assert.ok(f.bitmaps.every((bitmap) => !bitmap.closed));
  } finally {
    f.restore();
  }
});

test("rx17: repeated bitmap rejection reuses one decoded CSS image and keeps completed sources", async () => {
  const f = await fixture();
  try {
    const bitmapImage = globalThis.createImageBitmap;
    let rejecting = true;
    globalThis.createImageBitmap = (blob) =>
      rejecting && blob.src === REXONANCE_SUIT_ATLAS.src
        ? Promise.reject(new Error("Injected bitmap failure"))
        : bitmapImage(blob);
    const first = f.module.warmRexonanceSuit();
    f.requests.forEach((request) => request.resolve());
    await settle();
    const plateImage = f.images.find((image) => image.src === REXONANCE_SUIT_ATLAS.src);
    assert.ok(plateImage);
    let settled = false;
    void first.then(() => {
      settled = true;
    });
    await settle();
    assert.equal(settled, false, "bitmap rejection still collects its valid in-flight CSS work");
    f.loadImages();
    assert.equal(await first, false);
    const keptGold = f.module.rexonanceSuitSource(REXONANCE_SUIT_GOLD_ATLAS.src);
    assert.ok(keptGold);
    const imageCount = f.images.length;
    for (let attempt = 0; attempt < 6; attempt++) {
      const retry = f.module.warmRexonanceSuit();
      assert.equal(f.requests.at(-1).src, REXONANCE_SUIT_ATLAS.src);
      f.requests.at(-1).resolve();
      assert.equal(await retry, false);
      assert.equal(f.images.length, imageCount, "CSS image requests/retained copies do not grow");
      assert.equal(f.module.rexonanceSuitSource(REXONANCE_SUIT_ATLAS.src), null);
      assert.equal(f.module.isRexonanceSuitReady(), false);
      assert.equal(f.module.rexonanceSuitSource(REXONANCE_SUIT_GOLD_ATLAS.src), keptGold);
      assert.equal(keptGold.closed, false);
    }
    rejecting = false;
    const recovered = f.module.warmRexonanceSuit("high");
    f.requests.at(-1).resolve();
    assert.equal(await recovered, true);
    assert.equal(f.images.length, imageCount, "successful recovery also reuses the warm CSS image");
    assert.equal(f.images.filter((image) => image.src === plateImage.src).length, 1);
    assert.equal(f.module.rexonanceSuitSource(REXONANCE_SUIT_GOLD_ATLAS.src), keptGold);
    assert.equal(keptGold.closed, false);
  } finally {
    f.restore();
  }
});

test("rx17: CSS failure collects and closes a late bitmap without publishing it", async () => {
  const f = await fixture({ delayedBitmaps: true });
  try {
    const warm = f.module.warmRexonanceSuit();
    f.requests.forEach((request) => request.resolve());
    await settle();
    const plateImage = f.images.find((image) => image.src === REXONANCE_SUIT_ATLAS.src);
    plateImage.onerror();
    f.loadImages();
    f.bitmaps[1].resolve();
    await settle();
    assert.equal(f.module.isRexonanceSuitReady(), false);
    assert.equal(f.module.rexonanceSuitSource(REXONANCE_SUIT_ATLAS.src), null);
    f.bitmaps[0].resolve();
    assert.equal(await warm, false);
    assert.equal(
      f.bitmaps[0].closed,
      true,
      "an unusable bitmap is released even after CSS failure",
    );
    assert.equal(f.bitmaps[1].closed, false, "successful gold is not closed");
  } finally {
    f.restore();
  }
});

test("rx17: a hidden page does not start a high retry when an adopted request fails", async () => {
  const f = await fixture();
  try {
    const low = f.module.warmRexonanceSuit();
    assert.equal(f.module.warmRexonanceSuit("high"), low);
    f.visibility(true);
    f.requests[0].reject();
    await settle();
    assert.equal(f.requests.length, 2);
    f.requests[1].resolve();
    f.loadImages();
    await settle();
    assert.equal(await low, false);
    f.visibility(false);
    const retry = f.module.warmRexonanceSuit("high");
    assert.equal(f.requests.length, 3);
    f.requests.at(-1).resolve();
    await settle();
    f.loadImages();
    await settle();
    assert.equal(await retry, true);
  } finally {
    f.restore();
  }
});

test("rx17: a Rexonance call immediately restarts aborted low work at high priority", async () => {
  const f = await fixture({ delayedBitmaps: true });
  try {
    const low = f.module.warmRexonanceSuit();
    f.requests.forEach((request) => request.resolve());
    await settle();
    assert.equal(f.bitmaps.length, 2);
    const resume = f.module.pauseRexonanceSuitWarmup();
    const high = f.module.warmRexonanceSuit("high");
    assert.notEqual(high, low);
    assert.deepEqual(
      f.requests.slice(2).map(({ priority }) => priority),
      ["high", "high"],
    );
    f.requests.slice(2).forEach((request) => request.resolve());
    await settle();
    const stale = f.bitmaps.slice(0, 2);
    const live = f.bitmaps.slice(2);
    live.forEach((bitmap) => bitmap.resolve());
    await settle();
    f.loadImages();
    await settle();
    assert.equal(await high, true, "the high batch need not wait for the abandoned decode");
    stale.forEach((bitmap) => bitmap.resolve());
    assert.equal(await low, false);
    assert.ok(
      stale.every((bitmap) => bitmap.closed),
      "late abandoned bitmaps are released",
    );
    assert.ok(live.every((bitmap) => !bitmap.closed));
    assert.equal(f.module.rexonanceSuitSource(REXONANCE_SUIT_ATLAS.src), live[0]);
    assert.equal(f.module.rexonanceSuitSource(REXONANCE_SUIT_GOLD_ATLAS.src), live[1]);
    assert.equal(f.module.isRexonanceSuitReady(), true);
    resume();
  } finally {
    f.restore();
  }
});

test("rx17: cancellation retains successful layers and retries only unfinished work", async () => {
  const f = await fixture();
  try {
    const low = f.module.warmRexonanceSuit();
    const gold = f.requests.find((request) => request.src === REXONANCE_SUIT_GOLD_ATLAS.src);
    gold.resolve();
    f.loadImages();
    await settle();
    const kept = f.module.rexonanceSuitSource(gold.src);
    assert.ok(kept);
    const resume = f.module.pauseRexonanceSuitWarmup();
    assert.equal(await low, false);
    assert.equal(f.module.rexonanceSuitSource(gold.src), kept);
    assert.equal(kept.closed, false);
    const high = f.module.warmRexonanceSuit("high");
    assert.equal(f.requests.length, 3, "the completed gold bitmap is not downloaded again");
    assert.equal(
      f.images.length,
      REXONANCE_SUIT_ASSETS.length - 2,
      "completed CSS layers stay held",
    );
    f.requests.at(-1).resolve();
    await settle();
    f.loadImages();
    await settle();
    assert.equal(await high, true);
    assert.equal(f.module.rexonanceSuitSource(gold.src), kept);
    assert.equal(kept.closed, false);
    resume();
  } finally {
    f.restore();
  }
});

test("rx17: hidden and old routes never resume speculative work", async () => {
  const f = await fixture();
  try {
    const cancel = f.module.scheduleRexonanceSuitWarm();
    f.visibility(true);
    assert.equal(f.timers.size + f.idles.size, 0);
    assert.equal(await f.module.warmRexonanceSuit("high"), false);
    f.visibility(false);
    assert.equal(f.timers.size, 1);
    f.runTimer();
    f.runIdle();
    const low = f.module.warmRexonanceSuit();
    f.visibility(true);
    assert.equal(await low, false);
    assert.ok(f.requests.every((request) => request.signal.aborted));
    const resume = f.module.pauseRexonanceSuitWarmup();
    cancel();
    f.win.location.pathname = "/gallery";
    f.visibility(false);
    resume();
    assert.equal(f.timers.size + f.idles.size, 0, "a stale route reservation stays cancelled");
    const next = f.module.scheduleRexonanceSuitWarm();
    assert.equal(f.timers.size, 1, "the destination creates its own reservation");
    next();
  } finally {
    f.restore();
  }
});

test("rx17: image decode settling after abort cannot poison the later high batch", async () => {
  const f = await fixture();
  try {
    Object.defineProperty(globalThis, "createImageBitmap", {
      configurable: true,
      value: undefined,
    });
    const low = f.module.warmRexonanceSuit();
    const late = f.images.find((image) => image.src === REXONANCE_SUIT_ATLAS.src);
    let resolveDecode;
    late.decode = () =>
      new Promise((resolve) => {
        resolveDecode = resolve;
      });
    late.onload();
    await settle();
    const resume = f.module.pauseRexonanceSuitWarmup();
    assert.equal(await low, false);
    const high = f.module.warmRexonanceSuit("high");
    f.loadImages();
    await settle();
    assert.equal(await high, true);
    const live = f.module.rexonanceSuitSource(late.src);
    assert.notEqual(live, late);
    resolveDecode();
    await settle();
    assert.equal(f.module.rexonanceSuitSource(late.src), live);
    assert.equal(f.module.isRexonanceSuitReady(), true);
    resume();
  } finally {
    f.restore();
  }
});

test("rx17: LoadGate owns warmup pause before every go and releases on settle, history and disposal", () => {
  const gate = readFileSync(new URL("../src/components/load-gate.tsx", import.meta.url), "utf8");
  const go = gate.slice(
    gate.indexOf("const go = useCallback"),
    gate.indexOf("const api = useMemo"),
  );
  const pauseAt = go.search(/holdSuitWarmup\(\s*to === "\/rexonance-saga"[,)]/);
  assert.ok(pauseAt >= 0, "only Rexonance go preserves its own high-priority intent");
  assert.ok(pauseAt < go.indexOf("router.preloadRoute"));
  assert.ok(pauseAt < go.indexOf('warmRexonanceSuit("high")'));
  assert.match(gate, /pauseRexonanceSuitWarmup\(preserveIntent\)/);
  assert.match(go, /finally\s*\{\s*releaseSuitWarmup\(\);\s*\}\s*\},/);
  assert.match(
    gate,
    /if \(released\) return;\s*released = true;\s*releases\.delete\(release\);\s*resume\(\);/,
  );
  assert.equal((gate.match(/pendingSuitWarmReleases\.forEach/g) ?? []).length, 2);
  assert.match(gate, /useEffect\(\(\) => scheduleRexonanceSuitWarm\(\), \[pathname\]\);/);
});

for (const reason of ["go", "hidden"]) {
  test(`rx17: ${reason} after plan import starts defers preparation until the page resumes`, async () => {
    const f = await fixture();
    try {
      const source = readFileSync(
        new URL("../src/lib/rexonance-suit-warmup.ts", import.meta.url),
        "utf8",
      );
      const code = ts.transpileModule(source, {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
      }).outputText;
      let resolveModule;
      let prepareCount = 0;
      let importCount = 0;
      const loading = new Promise((resolve) => {
        resolveModule = resolve;
      });
      const exports = {};
      runInNewContext(code, {
        exports,
        window: globalThis.window,
        document: globalThis.document,
        navigator: globalThis.navigator,
        Image: globalThis.Image,
        AbortController,
        // This fixture uses native images so only the actual plan import is delayed.
        createImageBitmap: undefined,
        require(name) {
          if (name === "./rexonance-suit.ts") return suit;
          if (name === "./rexonance-site-artwork.ts") return { REXONANCE_SITE_ARTWORK: {} };
          if (name === "./rexonance-transition-loader.ts")
            return { prepareRexonanceTransition: { prefetch: () => Promise.resolve(null) } };
          if (name === "../components/rexonance-saga/rexonance-suit-plan") {
            importCount += 1;
            return loading;
          }
          throw new Error(`unexpected module: ${name}`);
        },
      });
      const cancel = exports.scheduleRexonanceSuitWarm();
      f.runTimer();
      f.runIdle();
      f.loadImages();
      await settle();
      assert.equal(exports.isRexonanceSuitReady(), true);
      f.runIdle();
      await settle();
      assert.equal(importCount, 1);
      let resume;
      if (reason === "go") resume = exports.pauseRexonanceSuitWarmup();
      else f.visibility(true);
      resolveModule({
        prepareRexonanceSuit() {
          prepareCount += 1;
          return Promise.resolve(true);
        },
      });
      await settle();
      assert.equal(prepareCount, 0, "chunk resolution cannot start hidden/paused calculation");
      assert.equal(f.idles.size, 0);
      if (reason === "go") resume();
      else f.visibility(false);
      assert.equal(f.idles.size, 1, "the deferred plan is reserved again after resume");
      f.runIdle();
      await settle();
      assert.equal(prepareCount, 1);
      assert.equal(
        exports.isRexonanceSuitReady(),
        true,
        "plan deferral never clears decoded readiness",
      );
      cancel();
    } finally {
      f.restore();
    }
  });
}

// Round 3 (review 45): a plan that finishes preparing while the page is
// hidden or a go() holds the network used to skip the nanite kit's import,
// and nothing kicked it again until a classic call. It now waits for the
// resume.
for (const reason of ["go", "hidden"]) {
  test(`rx17: ${reason} while the plan prepares defers the kit's import until the page resumes`, async () => {
    const f = await fixture();
    try {
      const source = readFileSync(
        new URL("../src/lib/rexonance-suit-warmup.ts", import.meta.url),
        "utf8",
      );
      const code = ts.transpileModule(source, {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
      }).outputText;
      let finishPlan;
      let kitImports = 0;
      const exports = {};
      runInNewContext(code, {
        exports,
        window: globalThis.window,
        document: globalThis.document,
        navigator: globalThis.navigator,
        Image: globalThis.Image,
        AbortController,
        createImageBitmap: undefined,
        require(name) {
          if (name === "./rexonance-suit.ts") return suit;
          if (name === "./rexonance-site-artwork.ts") return { REXONANCE_SITE_ARTWORK: {} };
          if (name === "./rexonance-transition-loader.ts")
            return { prepareRexonanceTransition: { prefetch: () => Promise.resolve(null) } };
          if (name === "../components/rexonance-saga/rexonance-suit-plan")
            return {
              prepareRexonanceSuit: () =>
                new Promise((resolve) => {
                  finishPlan = resolve;
                }),
            };
          if (name === "./rexonance-nanites-warmup.ts") {
            kitImports += 1;
            return { warmRexonanceNanites: () => Promise.resolve(true) };
          }
          throw new Error(`unexpected module: ${name}`);
        },
      });
      const cancel = exports.scheduleRexonanceSuitWarm();
      f.runTimer();
      f.runIdle();
      f.loadImages();
      await settle();
      assert.equal(exports.isRexonanceSuitReady(), true);
      f.runIdle();
      await settle();
      assert.ok(finishPlan, "the plan is preparing");
      let resume;
      if (reason === "go") resume = exports.pauseRexonanceSuitWarmup();
      else f.visibility(true);
      finishPlan(true);
      await settle();
      assert.equal(kitImports, 0, "no kit import while hidden or paused");
      if (reason === "go") resume();
      else f.visibility(false);
      await settle();
      assert.equal(kitImports, 1, "the resume imports the kit");
      cancel();
    } finally {
      f.restore();
    }
  });
}

test("Illusionculum-only preparation hold calls registered releases without importing renderers", async () => {
  const f = await fixture();
  try {
    let releases = 0;
    f.module.registerRexonancePreparationRelease(() => releases++);
    assert.equal(f.module.isRexonancePreparationSuspended(), false);
    const resume = f.module.suspendRexonancePreparationForIllusionculum();
    assert.equal(releases, 1);
    assert.equal(f.module.isRexonancePreparationSuspended(), true);
    let lateRelease = 0;
    f.module.registerRexonancePreparationRelease(() => lateRelease++);
    assert.equal(lateRelease, 1);
    const resumeSecond = f.module.suspendRexonancePreparationForIllusionculum();
    resume();
    resume();
    assert.equal(f.module.isRexonancePreparationSuspended(), true);
    resumeSecond();
    assert.equal(f.module.isRexonancePreparationSuspended(), false);
    assert.equal(f.requests.length, 0);
    assert.equal(f.images.length, 0);
    assert.equal(f.idles.size, 0);
  } finally {
    f.restore();
  }
});

test("Illusionculum arrival retains deferred rebuild until a later World route", async () => {
  const f = await fixture();
  try {
    const warm = f.module.warmRexonanceSuit();
    f.requests.forEach((request) => request.resolve());
    f.loadImages();
    await settle();
    f.loadImages();
    await settle();
    assert.equal(await warm, true);
    const resume = f.module.suspendRexonancePreparationForIllusionculum();
    f.win.location.pathname = "/illusionculum-saga";
    f.win.matchMedia = () => ({ matches: true });
    // A queued plan slice must also observe the route, rather than rebuilding.
    while (f.idles.size) f.runIdle();
    resume();
    assert.equal(f.idles.size, 0);
    assert.equal(f.timers.size, 0);
    f.win.location.pathname = "/world";
    const cancel = f.module.scheduleRexonanceSuitWarm();
    assert.equal(f.idles.size, 1, "returning to World can resume deferred preparation");
    cancel();
  } finally {
    f.restore();
  }
});
