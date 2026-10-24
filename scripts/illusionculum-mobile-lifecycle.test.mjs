import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const exports = {};
let prewarmCalls = 0;
runInNewContext(
  ts.transpileModule(
    readFileSync(new URL("../src/lib/illusionculum-assembly.ts", import.meta.url), "utf8"),
    { compilerOptions: { module: ts.ModuleKind.CommonJS } },
  ).outputText,
  {
    exports,
    require: (path) =>
      path.includes("illusionculum-preload")
        ? {
            preloadIllusionculumAssembly() {
              prewarmCalls++;
              return Promise.resolve();
            },
          }
        : { ILLUSIONCULUM_SAGA: { calls: [] } },
  },
);
const { mountIllusionculumAssembly } = exports;
const settled = () => new Promise((resolve) => setImmediate(resolve));

function fixture({ mobile = true, reduced = false, cover = false, load } = {}) {
  const initialPrewarmCalls = prewarmCalls;
  const document = new EventTarget();
  document.hidden = false;
  document.documentElement = { dataset: cover ? { routeCover: "active" } : {} };
  const host = { ownerDocument: document, dataset: {} };
  const idle = new Map();
  const intersections = [];
  const mutations = [];
  const media = new Map();
  let serial = 0;
  let loads = 0;
  let mounts = 0;
  let releases = 0;
  const module = {
    mountIllusionculumAssemblyEngine(actualHost, actualEnvironment) {
      assert.equal(actualHost, host);
      assert.equal(actualEnvironment, environment);
      mounts++;
      return () => {
        releases++;
      };
    },
  };
  const environment = Object.assign(new EventTarget(), {
    innerHeight: 800,
    navigator: {},
    matchMedia(query) {
      if (!media.has(query)) {
        const item = new EventTarget();
        item.matches = query.includes("coarse")
          ? mobile
          : query.includes("reduced")
            ? reduced
            : false;
        media.set(query, item);
      }
      return media.get(query);
    },
    requestIdleCallback(callback) {
      idle.set(++serial, callback);
      return serial;
    },
    cancelIdleCallback(id) {
      idle.delete(id);
    },
    IntersectionObserver: class {
      constructor(callback) {
        this.callback = callback;
        intersections.push(this);
      }
      observe(target) {
        assert.equal(target, host);
      }
      disconnect() {
        this.disconnected = true;
      }
    },
    MutationObserver: class {
      constructor(callback) {
        this.callback = callback;
        mutations.push(this);
      }
      observe() {}
      disconnect() {
        this.disconnected = true;
      }
    },
  });
  const dispose = mountIllusionculumAssembly(host, {
    environment,
    load: () => {
      loads++;
      return load ? load(module) : Promise.resolve(module);
    },
  });
  return {
    host,
    dispose,
    page(type) {
      environment.dispatchEvent(new Event(type));
    },
    get prewarms() {
      return prewarmCalls - initialPrewarmCalls;
    },
    get loads() {
      return loads;
    },
    get mounts() {
      return mounts;
    },
    get releases() {
      return releases;
    },
    get queued() {
      return idle.size;
    },
    near(value) {
      intersections.forEach((observer) => observer.callback([{ isIntersecting: value }]));
    },
    cover(value) {
      if (value) document.documentElement.dataset.routeCover = "active";
      else delete document.documentElement.dataset.routeCover;
      mutations.forEach((observer) => observer.callback([]));
    },
    hidden(value) {
      document.hidden = value;
      document.dispatchEvent(new Event("visibilitychange"));
    },
    async flush() {
      const callbacks = [...idle.values()];
      idle.clear();
      callbacks.forEach((callback) => callback({ didTimeout: false, timeRemaining: () => 50 }));
      await settled();
    },
    observersDisconnected() {
      return [...intersections, ...mutations].every((observer) => observer.disconnected);
    },
  };
}

test("mobile prepares immediately after cover without proximity or idle delay", async () => {
  const f = fixture({ cover: true });
  f.near(true);
  await f.flush();
  assert.equal(f.loads, 0);
  assert.equal(f.prewarms, 0);
  f.cover(false);
  assert.equal(f.prewarms, 1);
  assert.equal(f.queued, 0);
  await settled();
  assert.equal(f.loads, 1);
  assert.equal(f.mounts, 1);
  f.near(false);
  assert.equal(f.releases, 0);
  f.near(true);
  await settled();
  assert.equal(f.mounts, 1);
  f.hidden(true);
  assert.equal(f.releases, 1);
  f.hidden(false);
  await f.flush();
  assert.equal(f.mounts, 2);
  f.cover(true);
  assert.equal(f.releases, 2);
  f.cover(false);
  await settled();
  assert.equal(f.mounts, 3);
  f.dispose();
  assert.equal(f.releases, 3);
  assert.equal(f.prewarms, 1);
  assert.ok(f.observersDisconnected());
});

for (const reason of ["pagehide", "hidden", "covered", "disposed"]) {
  test(`pending import never mounts after becoming ${reason}`, async () => {
    let finish;
    const f = fixture({
      load: (module) =>
        new Promise((resolve) => {
          finish = () => resolve(module);
        }),
    });
    f.near(true);
    await f.flush();
    assert.equal(f.loads, 1);
    if (reason === "pagehide") f.page("pagehide");
    if (reason === "hidden") f.hidden(true);
    if (reason === "covered") f.cover(true);
    if (reason === "disposed") f.dispose();
    finish();
    await settled();
    assert.equal(f.mounts, 0);
    f.dispose();
  });
}

test("mobile starts distant without idle and restores after pagehide/pageshow", async () => {
  const f = fixture();
  assert.equal(f.prewarms, 1);
  assert.equal(f.queued, 0);
  await settled();
  assert.equal(f.loads, 1);
  assert.equal(f.mounts, 1);
  f.near(false);
  assert.equal(f.releases, 0);
  f.page("pagehide");
  assert.equal(f.releases, 1);
  f.page("pageshow");
  await settled();
  assert.equal(f.mounts, 2);
  f.dispose();
  f.page("pageshow");
  await settled();
  assert.equal(f.mounts, 2);
});

test("import rejection is handled and a later eligible entry can recover", async () => {
  let fail = true;
  const f = fixture({
    load: (module) =>
      fail ? Promise.reject(new Error("test load failure")) : Promise.resolve(module),
  });
  f.near(true);
  await f.flush();
  assert.equal(f.mounts, 0);
  assert.equal(f.host.dataset.rznLoad, "error");
  fail = false;
  f.hidden(true);
  f.hidden(false);
  await settled();
  assert.equal(f.mounts, 1);
  f.dispose();
});

test("reduced motion never loads an engine", async () => {
  const f = fixture({ reduced: true });
  f.near(true);
  f.cover(false);
  f.hidden(false);
  await f.flush();
  assert.equal(f.loads, 0);
  assert.equal(f.mounts, 0);
  assert.equal(f.prewarms, 0);
  f.dispose();
});

test("desktop retains idle preparation and engine across distance, cover and visibility", async () => {
  const f = fixture({ mobile: false, cover: true });
  assert.equal(f.prewarms, 0);
  f.hidden(true);
  await settled();
  assert.equal(f.loads, 0);
  assert.equal(f.queued, 1);
  await f.flush();
  assert.equal(f.loads, 1);
  assert.equal(f.mounts, 1);
  f.near(false);
  f.cover(true);
  f.hidden(true);
  assert.equal(f.releases, 0);
  f.dispose();
  assert.equal(f.releases, 1);
});
