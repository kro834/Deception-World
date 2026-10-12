import assert from "node:assert/strict";
import test from "node:test";
import {
  createExtremeStageSelection,
  EXTREME_STAGE_CUT_GAP_MS,
  EXTREME_STAGE_IMAGE_TIMEOUT_MS,
} from "../src/lib/extreme-stage-selection.js";

function setup({ decode = true, resolveImage = (stage) => `/${stage}.webp` } = {}) {
  let time = 0;
  let serial = 0;
  const timers = new Map();
  const images = [];
  const events = [];
  class Image {
    constructor() {
      this.naturalWidth = 1022;
      this.removed = [];
      this.promise = new Promise((resolve, reject) => {
        this.succeed = resolve;
        this.reject = reject;
      });
      if (!decode) this.decode = undefined;
      images.push(this);
    }
    decode() {
      return this.promise;
    }
    removeAttribute(name) {
      this.removed.push(name);
      delete this[name];
    }
  }
  const environment = {
    Image,
    performance: { now: () => time },
    setTimeout(callback, delay) {
      const id = ++serial;
      timers.set(id, { callback, at: time + delay });
      return id;
    },
    clearTimeout(id) {
      timers.delete(id);
    },
  };
  const controller = createExtremeStageSelection({
    resolveImage,
    onDisplay: (stage) => events.push(["display", stage, time]),
    onPending: (value) => events.push(["pending", value]),
    onError: (message) => events.push(["error", message]),
    environment,
  });
  const tick = (duration) => {
    const end = time + duration;
    for (;;) {
      const next = [...timers]
        .filter(([, timer]) => timer.at <= end)
        .sort((a, b) => a[1].at - b[1].at)[0];
      if (!next) break;
      const [id, timer] = next;
      timers.delete(id);
      time = timer.at;
      timer.callback();
    }
    time = end;
  };
  const flush = async () => {
    await Promise.resolve();
    await Promise.resolve();
  };
  return {
    controller,
    images,
    events,
    timers,
    tick,
    flush,
    displays: () => events.filter(([kind]) => kind === "display"),
    pending: () => events.filter(([kind]) => kind === "pending").map(([, value]) => value),
    errors: () =>
      events.filter(([kind, message]) => kind === "error" && message).map(([, message]) => message),
  };
}

test("selection requests only its target and publishes nothing before decode", async () => {
  const h = setup();
  assert.equal(h.images.length, 0, "there is no speculative preload");
  h.controller.select("ultra");
  assert.equal(h.images.length, 1);
  assert.equal(h.images[0].src, "/ultra.webp");
  assert.equal(h.images[0].fetchPriority, "high");
  assert.deepEqual(h.pending(), [true]);
  assert.deepEqual(h.displays(), []);
  h.images[0].succeed();
  await h.flush();
  assert.deepEqual(h.displays(), [["display", "ultra", 0]]);
  assert.deepEqual(h.pending(), [true, false]);
  assert.equal(h.timers.size, 0);
  assert.equal(h.images[0].onload, null);
  assert.equal(h.images[0].onerror, null);
});

test("repeating a pending selection does not create a second request", async () => {
  const h = setup();
  h.controller.select("ultra");
  h.controller.select("ultra");
  h.controller.select("ultra");
  assert.equal(h.images.length, 1);
  assert.deepEqual(h.pending(), [true]);
  h.images[0].succeed();
  await h.flush();
  h.controller.select("ultra");
  assert.equal(h.images.length, 1, "the displayed stage also needs no request");
});

test("returning to the displayed form cancels pending work and ignores its late decode", async () => {
  const h = setup();
  h.controller.select("ultra");
  h.controller.select("middle");
  assert.deepEqual(h.pending(), [true, false]);
  assert.equal(h.timers.size, 0);
  assert.equal(h.images[0].src, undefined);
  assert.deepEqual(h.images[0].removed, ["src"]);
  h.images[0].succeed();
  await h.flush();
  assert.deepEqual(h.displays(), []);
  assert.deepEqual(h.errors(), []);
});

test("latest intent wins when a cancelled decode resolves after the newer request", async () => {
  const h = setup();
  h.controller.select("ultra");
  h.controller.select("middle");
  h.controller.select("ultra");
  h.images[0].succeed();
  await h.flush();
  assert.deepEqual(h.displays(), []);
  h.images[1].succeed();
  await h.flush();
  assert.deepEqual(h.displays(), [["display", "ultra", 0]]);
  assert.deepEqual(h.errors(), []);
});

test("successful cuts keep 1100ms separation while image and copy remain on the old form", async () => {
  const h = setup();
  h.controller.select("ultra");
  h.images[0].succeed();
  await h.flush();
  h.tick(100);
  h.controller.select("middle");
  h.images[1].succeed();
  await h.flush();
  h.tick(EXTREME_STAGE_CUT_GAP_MS - 101);
  assert.deepEqual(h.displays(), [["display", "ultra", 0]]);
  assert.deepEqual(h.pending(), [true, false, true]);
  h.tick(1);
  assert.deepEqual(h.displays(), [
    ["display", "ultra", 0],
    ["display", "middle", 1100],
  ]);
  assert.deepEqual(h.pending(), [true, false, true, false]);
  assert.equal(h.timers.size, 0);
});

test("returning to the shown form cancels a decoded but throttled cut", async () => {
  const h = setup();
  h.controller.select("ultra");
  h.images[0].succeed();
  await h.flush();
  h.controller.select("middle");
  h.images[1].succeed();
  await h.flush();
  assert.equal(h.timers.size, 1);
  h.controller.select("ultra");
  assert.equal(h.timers.size, 0);
  h.tick(5000);
  assert.deepEqual(h.displays(), [["display", "ultra", 0]]);
  assert.deepEqual(h.pending(), [true, false, true, false]);
});

for (const outcome of ["decode-error", "image-error", "empty-image", "timeout"]) {
  test(`${outcome} preserves the displayed form, reports Japanese recovery copy and allows retry`, async () => {
    const h = setup();
    h.controller.select("ultra");
    if (outcome === "decode-error") h.images[0].reject(new Error("decode failed"));
    else if (outcome === "image-error") h.images[0].onerror();
    else if (outcome === "empty-image") {
      h.images[0].naturalWidth = 0;
      h.images[0].succeed();
    } else h.tick(EXTREME_STAGE_IMAGE_TIMEOUT_MS);
    await h.flush();
    assert.deepEqual(h.displays(), []);
    assert.deepEqual(h.pending(), [true, false]);
    assert.equal(h.errors().length, 1);
    assert.match(h.errors()[0], /もう一度お試しください/);
    assert.equal(h.timers.size, 0);
    assert.equal(h.images[0].src, undefined);
    assert.equal(h.images[0].onerror, null);
    h.images[0].succeed();
    await h.flush();
    assert.deepEqual(h.displays(), []);
    h.controller.select("ultra");
    assert.equal(h.images.length, 2);
    assert.deepEqual(h.events.at(-2), ["error", ""]);
    h.images[1].succeed();
    await h.flush();
    assert.deepEqual(h.displays(), [["display", "ultra", outcome === "timeout" ? 8000 : 0]]);
  });
}

test("load events provide the same readiness fallback without Image.decode", () => {
  const h = setup({ decode: false });
  h.controller.select("ultra");
  assert.deepEqual(h.displays(), []);
  h.images[0].onload();
  assert.deepEqual(h.displays(), [["display", "ultra", 0]]);
  assert.deepEqual(h.pending(), [true, false]);
});

for (const when of ["decoding", "waiting-for-cut"]) {
  test(`dispose while ${when} clears timers and prevents all late notifications`, async () => {
    const h = setup();
    h.controller.select("ultra");
    if (when === "waiting-for-cut") {
      h.images[0].succeed();
      await h.flush();
      h.controller.select("middle");
      h.images[1].succeed();
      await h.flush();
    }
    h.controller.dispose();
    const before = [...h.events];
    h.controller.dispose();
    h.controller.select("ultra");
    h.images.forEach((image) => image.succeed());
    await h.flush();
    h.tick(10000);
    assert.deepEqual(h.events, before);
    assert.equal(h.timers.size, 0);
    assert.ok(h.images.every((image) => image.onload === null && image.onerror === null));
  });
}

test("an invalid image resolver fails without starting a request", () => {
  const h = setup({ resolveImage: () => undefined });
  h.controller.select("ultra");
  assert.equal(h.images.length, 0);
  assert.deepEqual(h.displays(), []);
  assert.deepEqual(h.pending(), [true, false]);
  assert.equal(h.errors().length, 1);
  assert.equal(h.timers.size, 0);
});
