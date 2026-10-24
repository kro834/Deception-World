import assert from "node:assert/strict";
import test from "node:test";
import { createIllusionculumImageLoader } from "../src/lib/illusionculum-image-loader.js";
const tick = () => new Promise((resolve) => setImmediate(resolve));
const defer = () => {
  let resolve;
  const promise = new Promise((r) => {
    resolve = r;
  });
  return { promise, resolve };
};
const bitmap = () => ({
  closed: 0,
  close() {
    this.closed += 1;
  },
});
const base = (extra = {}) => ({
  fetch: async () => ({ ok: true, blob: async () => ({}) }),
  ...extra,
});

test("limits simultaneous decodes to two, deduplicates pending URLs, retains no successful source", async () => {
  const decodes = [];
  let fetches = 0;
  const loader = createIllusionculumImageLoader(
    base({
      fetch: async (_src, options) => {
        fetches += 1;
        assert.equal(options.cache, "force-cache");
        assert.equal(options.mode, "same-origin");
        return { ok: true, blob: async () => ({}) };
      },
      createImageBitmap: () => {
        const task = defer();
        decodes.push(task);
        return task.promise;
      },
    }),
  );
  const a = loader.load("a");
  assert.equal(loader.load("a"), a);
  const b = loader.load("b");
  const c = loader.load("c");
  await tick();
  assert.equal(decodes.length, 2);
  const source = bitmap();
  decodes[0].resolve(source);
  await a;
  await tick();
  assert.equal(decodes.length, 3);
  assert.equal(source.closed, 0);
  decodes[1].resolve(bitmap());
  decodes[2].resolve(bitmap());
  await Promise.all([b, c]);
  const again = loader.load("a");
  await tick();
  decodes[3].resolve(bitmap());
  await again;
  assert.equal(fetches, 4);
  loader.dispose();
  assert.equal(source.closed, 0);
});

test("timeout aborts, rejects promptly and closes a late bitmap before retry", async () => {
  const timers = new Map();
  let id = 0;
  const decodes = [];
  const signals = [];
  const loader = createIllusionculumImageLoader(
    base({
      setTimeout: (run, ms) => {
        assert.equal(ms, 8000);
        timers.set(++id, run);
        return id;
      },
      clearTimeout: (key) => timers.delete(key),
      fetch: async (_src, { signal }) => {
        signals.push(signal);
        return { ok: true, blob: async () => ({}) };
      },
      createImageBitmap: () => {
        const task = defer();
        decodes.push(task);
        return task.promise;
      },
    }),
  );
  const first = loader.load("a");
  const rejected = assert.rejects(first, /timeout/);
  await tick();
  [...timers.values()][0]();
  await rejected;
  assert.ok(signals[0].aborted);
  const late = bitmap();
  decodes[0].resolve(late);
  await tick();
  assert.equal(late.closed, 1);
  const retry = loader.load("a");
  await tick();
  decodes[1].resolve(bitmap());
  await retry;
  loader.dispose();
});

class FakeImage {
  static instances = [];
  naturalWidth = 10;
  constructor() {
    FakeImage.instances.push(this);
  }
  set src(value) {
    this.url = value;
  }
  removeAttribute() {
    // Chromium keeps detached pending requests alive when only src is removed.
  }
}

test("bitmap rejection falls back to a usable image with released handlers; failures retry", async () => {
  FakeImage.instances = [];
  const loader = createIllusionculumImageLoader(
    base({
      Image: FakeImage,
      createImageBitmap: async () => {
        throw new Error("unsupported");
      },
    }),
  );
  const first = loader.load("a");
  const failed = assert.rejects(first, /failed/);
  await tick();
  FakeImage.instances[0].onerror();
  await failed;
  assert.equal(FakeImage.instances[0].url, "");
  assert.equal(FakeImage.instances[0].onerror, null);
  const retry = loader.load("a");
  await tick();
  const image = FakeImage.instances[1];
  image.onload();
  assert.equal(await retry, image);
  assert.equal(image.url, "a");
  assert.equal(image.onload, null);
  assert.equal(image.onerror, null);
  loader.dispose();
});

test("dispose rejects active and queued work and closes late bitmaps without starting queued URLs", async () => {
  const decodes = [];
  const loader = createIllusionculumImageLoader(
    base({
      createImageBitmap: () => {
        const task = defer();
        decodes.push(task);
        return task.promise;
      },
    }),
  );
  const requests = ["a", "b", "c"].map((src) => assert.rejects(loader.load(src), /cancelled/));
  await tick();
  loader.dispose();
  await Promise.all(requests);
  assert.equal(decodes.length, 2);
  const late = [bitmap(), bitmap()];
  decodes.forEach((task, i) => task.resolve(late[i]));
  await tick();
  assert.ok(late.every((source) => source.closed === 1));
  await assert.rejects(loader.load("d"), /cancelled/);
});

test("missing bitmap API uses Image and disposal clears pending image source and handlers", async () => {
  FakeImage.instances = [];
  const loader = createIllusionculumImageLoader({ Image: FakeImage });
  const request = assert.rejects(loader.load("a"), /cancelled/);
  const image = FakeImage.instances[0];
  loader.dispose();
  await request;
  assert.equal(image.url, "");
  assert.equal(image.onload, null);
  assert.equal(image.onerror, null);
});

test("stalled fetch and queued requests all meet their deadline without starting more decodes", async () => {
  const timers = new Map();
  let id = 0;
  let fetches = 0;
  const signals = [];
  const loader = createIllusionculumImageLoader({
    setTimeout: (run) => {
      timers.set(++id, run);
      return id;
    },
    clearTimeout: (key) => timers.delete(key),
    fetch: (_src, { signal }) => {
      fetches += 1;
      signals.push(signal);
      return new Promise(() => {});
    },
    createImageBitmap: () => assert.fail("stalled fetch cannot decode"),
  });
  const requests = ["a", "b", "c"].map((src) => assert.rejects(loader.load(src), /timeout/));
  [...timers.values()].forEach((run) => run());
  await Promise.all(requests);
  assert.equal(fetches, 2);
  assert.ok(signals.every((signal) => signal.aborted));
  assert.equal(timers.size, 0);
  loader.dispose();
});
