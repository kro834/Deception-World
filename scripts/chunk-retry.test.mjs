import assert from "node:assert/strict";
import test from "node:test";
import {
  CHUNK_RETRY_ATTEMPTS,
  CHUNK_RETRY_DELAYS,
  failedChunkUrl,
  importWithRetry,
} from "../src/lib/chunk-retry.js";
import { mountFarFromAssembly } from "../src/lib/far-from-assembly.ts";

/* A lazy chunk's import that does not give up on the first failure (owner,
   2026-10-23: 「自動変身再生が必ず読み込まれ、正常に動作する様にして。」): the
   movie's controller (rexonance-assembly-movie.tsx), FAR FROM's engine
   (far-from-assembly.ts) and the swarm's chunk (rexonance-resonance.js). */

/** Manual timers: run(ms) fires what is due. */
function clock() {
  let now = 0;
  let id = 0;
  const timers = new Map();
  return {
    setTimer: (callback, ms) => (timers.set(++id, { at: now + ms, callback }), id),
    clearTimer: (key) => timers.delete(key),
    pending: () => timers.size,
    async run(ms) {
      const until = now + ms;
      for (;;) {
        const due = [...timers].filter(([, timer]) => timer.at <= until).sort((a, b) => a[1].at - b[1].at)[0];
        if (!due) break;
        timers.delete(due[0]);
        now = due[1].at;
        due[1].callback();
        await flush();
      }
      now = until;
      await flush();
    },
  };
}
const flush = () => new Promise((resolve) => setImmediate(resolve));

const URL_ = "http://127.0.0.1:8591/assets/assembly-movie-DowOyPFG.js";
const chromiumError = () => new TypeError(`Failed to fetch dynamically imported module: ${URL_}`);

test("the failed chunk's URL is read from Chromium's and Firefox's messages; Safari's names none", () => {
  assert.equal(failedChunkUrl(chromiumError()), URL_);
  assert.equal(failedChunkUrl(new TypeError(`error loading dynamically imported module: ${URL_}`)), URL_);
  assert.equal(failedChunkUrl(new TypeError(`Failed to fetch dynamically imported module: ${URL_}?retry=1-x`)), URL_);
  assert.equal(failedChunkUrl(new TypeError("Importing a module script failed.")), null);
  assert.equal(failedChunkUrl(undefined), null);
});

test("a failed import is retried after a backoff, under a fresh URL (a failed module fetch stays failed in the module map)", async () => {
  const time = clock();
  const errors = [];
  let loads = 0;
  const imported = [];
  const result = importWithRetry(
    () => {
      loads += 1;
      return Promise.reject(chromiumError());
    },
    {
      ...time,
      importUrl: (url) => {
        imported.push(url);
        return imported.length < 2 ? Promise.reject(chromiumError()) : Promise.resolve({ ok: true });
      },
      onError: (error, attempt) => errors.push(attempt),
    },
  );
  await flush();
  assert.equal(loads, 1);
  assert.deepEqual(errors, [1], "every failure is reported");
  await time.run(CHUNK_RETRY_DELAYS[0] - 1);
  assert.equal(imported.length, 0, "not before the backoff");
  await time.run(1);
  assert.equal(imported.length, 1);
  assert.match(imported[0], /^http:\/\/127\.0\.0\.1:8591\/assets\/assembly-movie-DowOyPFG\.js\?retry=1-/);
  await time.run(CHUNK_RETRY_DELAYS[1]);
  assert.equal(imported.length, 2);
  assert.notEqual(imported[0], imported[1], "each try a fresh URL");
  assert.deepEqual(await result, { ok: true });
  assert.deepEqual(errors, [1, 2]);
  assert.equal(time.pending(), 0, "no timer left behind");
});

test("without a URL in the message the loader itself is retried; after the last try the failure rejects", async () => {
  const time = clock();
  let loads = 0;
  const errors = [];
  const result = importWithRetry(
    () => {
      loads += 1;
      return Promise.reject(new TypeError("Importing a module script failed."));
    },
    { ...time, onError: (error, attempt) => errors.push(attempt) },
  );
  let rejected = null;
  result.catch((error) => {
    rejected = error;
  });
  await time.run(60000);
  assert.equal(loads, CHUNK_RETRY_ATTEMPTS);
  assert.deepEqual(errors, [1, 2, 3, 4, 5]);
  assert.ok(rejected instanceof TypeError, "the last failure rejects (never silent)");
});

test("a try that does not settle in time starts the next; the slow one is still taken if it lands first", async () => {
  const time = clock();
  let release;
  let loads = 0;
  const result = importWithRetry(
    () => {
      loads += 1;
      // The first hangs (a stalled request), the rest hang too.
      return new Promise((resolve) => {
        if (loads === 1) release = resolve;
      });
    },
    { ...time, timeoutMs: 1000, delays: [500] },
  );
  await time.run(1000);
  assert.equal(loads, 1);
  await time.run(500);
  assert.equal(loads, 2, "timed out: the next try started");
  release({ late: true });
  assert.deepEqual(await result, { late: true });
});

test("a cancelled import (the component unmounted) stops retrying", async () => {
  const time = clock();
  let cancelled = false;
  let loads = 0;
  const result = importWithRetry(
    () => {
      loads += 1;
      return Promise.reject(new Error("offline"));
    },
    { ...time, isCancelled: () => cancelled },
  );
  result.catch(() => {});
  await flush();
  cancelled = true;
  await time.run(60000);
  assert.equal(loads, 1);
  await assert.rejects(result, /cancelled/);
});

test("FAR FROM's engine chunk: retried; when the retries run out the runway reads error, and the guide's or the movie's retry (or the network) imports it again", async () => {
  const listeners = new Map();
  const windowListeners = new Map();
  const html = { dataset: {} };
  const host = {
    dataset: {},
    ownerDocument: { documentElement: html },
    addEventListener: (type, callback) => listeners.set(type, callback),
    removeEventListener: (type) => listeners.delete(type),
    dispatchEvent: (event) => listeners.get(event.type)?.(event),
  };
  const idle = [];
  const environment = {
    matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
    navigator: { connection: { saveData: false, effectiveType: "4g" } },
    requestIdleCallback: (callback) => idle.push(callback) && idle.length,
    cancelIdleCallback: () => {},
    setTimeout: () => 0,
    clearTimeout: () => {},
    addEventListener: (type, callback) => windowListeners.set(type, callback),
    removeEventListener: (type) => windowListeners.delete(type),
    MutationObserver: class {
      observe() {}
      disconnect() {}
    },
  };
  const warn = console.warn;
  const error = console.error;
  const reported = [];
  console.warn = (...args) => reported.push(String(args[0]));
  console.error = (...args) => reported.push(String(args[0]));
  try {
    let loads = 0;
    let fail = true;
    let mounted = 0;
    let woken = 0;
    const dispose = mountFarFromAssembly(host, {
      environment,
      retryDelays: [5],
      load: () => {
        loads += 1;
        if (fail) return Promise.reject(new TypeError("Importing a module script failed."));
        return Promise.resolve({
          mountFarFromAssemblyEngine: (runway) => {
            mounted += 1;
            runway.addEventListener("rexonance:assembly-wake", () => {
              woken += 1;
            });
            return () => {};
          },
        });
      },
    });
    assert.equal(host.dataset.rznLoad, "waiting");
    // The movie's 再生 before the chunk: imported at once, not at idle.
    host.dispatchEvent(new Event("rexonance:assembly-wake"));
    assert.equal(loads, 1);
    // (The real backoff: run it out.)
    for (let k = 0; k < 40 && host.dataset.rznLoad !== "error"; k += 1)
      await new Promise((resolve) => setTimeout(resolve, 10));
    assert.equal(host.dataset.rznLoad, "error", "the retries ran out: the runway reads error");
    assert.equal(loads, CHUNK_RETRY_ATTEMPTS);
    assert.ok(reported.some((line) => line.includes("could not be loaded")), "reported, never silent");
    // 素材を再読み込み (or the movie's retry): imported again, and mounted.
    fail = false;
    host.dispatchEvent(new Event("rexonance:assembly-retry"));
    assert.equal(host.dataset.rznLoad, "waiting");
    await flush();
    assert.equal(mounted, 1);
    assert.equal(woken, 1, "the waiting 再生 is handed to the engine");
    // The engine owns the events now; the seam's listeners are gone.
    assert.equal(windowListeners.has("online"), false);
    dispose();
  } finally {
    console.warn = warn;
    console.error = error;
  }
});
