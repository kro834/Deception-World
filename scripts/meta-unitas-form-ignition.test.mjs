// META UNITAS SAGA — #stages' burn into ウルトラ (meta-unitas-form-ignition.ts)
// on a fake clock: a burn whose pictures were slow to arrive still plays
// whole, and the overlay never holds the panel past its bounds.
import assert from "node:assert/strict";
import test from "node:test";

// A 2D context that accepts every call; the read-backs answer with an
// opaque block so the fuel bakes.
function fakeContext() {
  const target = {
    createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h }),
    getImageData: (_x, _y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4).fill(255) }),
  };
  return new Proxy(target, {
    get: (t, key) => (key in t ? t[key] : () => {}),
    set: () => true,
  });
}
function fakeCanvas(width = 0, height = 0) {
  return { width: 0, height: 0, clientWidth: width, clientHeight: height, getContext: fakeContext };
}

function harness() {
  let now = 0;
  let id = 0;
  const timers = new Map();
  const frames = new Map();
  const decodes = [];
  class FakeImage {
    constructor() {
      this.complete = false;
      this.naturalWidth = 0;
      this.style = {};
    }
    decode() {
      return new Promise((resolve) => decodes.push(() => {
        this.complete = true;
        this.naturalWidth = 400;
        resolve();
      }));
    }
    addEventListener() {}
    removeEventListener() {}
    removeAttribute() {}
  }
  globalThis.Image = FakeImage;
  globalThis.window = {
    devicePixelRatio: 1,
    matchMedia: () => ({ matches: false }),
    setTimeout: (fn, ms) => (timers.set(++id, { fn, at: now + ms }), id),
    clearTimeout: (handle) => timers.delete(handle),
    requestAnimationFrame: (fn) => (frames.set(++id, fn), id),
    cancelAnimationFrame: (handle) => frames.delete(handle),
  };
  const document = { createElement: () => fakeCanvas() };
  const canvas = fakeCanvas(480, 600);
  canvas.ownerDocument = document;
  canvas.parentElement = { style: {} };
  const portrait = { style: {} };
  const destination = new FakeImage();
  destination.complete = true;
  destination.naturalWidth = 400;
  destination.decode = () => Promise.resolve();
  const advance = async (to) => {
    while (now < to) {
      now = Math.min(to, now + 16);
      for (const [handle, timer] of [...timers]) {
        if (timer.at <= now) {
          timers.delete(handle);
          timer.fn();
        }
      }
      const due = [...frames];
      frames.clear();
      for (const [, fn] of due) fn(now);
      await new Promise((resolve) => setImmediate(resolve));
    }
  };
  const decodeAll = async () => {
    while (decodes.length) decodes.shift()();
    await new Promise((resolve) => setImmediate(resolve));
  };
  return { canvas, portrait, destination, advance, decodeAll, frames };
}

test("a burn whose pictures arrive late still plays whole", async () => {
  const { META_UNITAS_IGNITION_MS, mountMetaUnitasFormIgnition } = await import(
    "../src/lib/meta-unitas-form-ignition.ts"
  );
  const h = harness();
  let finishedAt = -1;
  let clock = 0;
  const dispose = mountMetaUnitasFormIgnition(h.canvas, h.portrait, h.destination, () => {
    finishedAt = clock;
  });
  // The cutouts take 3 s to arrive (a first switch on a slow phone).
  clock = 3000;
  await h.advance(3000);
  assert.equal(finishedAt, -1, "the overlay waits for its pictures");
  await h.decodeAll();
  // Well past the mount's own deadline (4.2 s), the burn is still playing.
  clock = 3000 + META_UNITAS_IGNITION_MS * 0.8;
  await h.advance(clock);
  assert.equal(finishedAt, -1, "the burn is never cut mid-fire");
  assert.ok(Number(h.portrait.style.opacity) === 0, "the burn is under way");
  clock = 3000 + META_UNITAS_IGNITION_MS + 100;
  await h.advance(clock);
  assert.ok(finishedAt > 0, "it hands over once it is done");
  dispose();
});

test("a stalled decode never holds the panel", async () => {
  const { META_UNITAS_IGNITION_MS, META_UNITAS_IGNITION_WAIT_MS, mountMetaUnitasFormIgnition } =
    await import("../src/lib/meta-unitas-form-ignition.ts");
  const h = harness();
  let finished = false;
  const dispose = mountMetaUnitasFormIgnition(h.canvas, h.portrait, h.destination, () => {
    finished = true;
  });
  await h.advance(META_UNITAS_IGNITION_MS + META_UNITAS_IGNITION_WAIT_MS + 20);
  assert.equal(finished, true);
  dispose();
});
