import assert from "node:assert/strict";
import test from "node:test";
import { createReadyPosterLoader } from "../src/lib/ready-poster-loader.js";

function harness({ supportsDecode = true, cached = false } = {}) {
  const images = [];
  const timers = new Map();
  let timerId = 0;
  class PosterImage extends EventTarget {
    complete = cached;
    naturalWidth = cached ? 1000 : 0;
    constructor() {
      super();
      images.push(this);
      this.decoded = new Promise((resolve, reject) => {
        this.resolve = resolve;
        this.reject = reject;
      });
      if (!supportsDecode) this.decode = undefined;
    }
    decode() { return this.decoded; }
    load() {
      this.complete = true;
      this.naturalWidth = 1000;
      this.dispatchEvent(new Event("load"));
    }
  }
  const loader = createReadyPosterLoader((image, source) => { image.src = source; }, {
    ImageClass: PosterImage,
    clock: {
      setTimeout: (callback) => { timers.set(++timerId, callback); return timerId; },
      clearTimeout: (id) => timers.delete(id),
    },
  });
  return { loader, images, timers };
}

test("poster requests share in-flight work and promote preload priority", async () => {
  const { loader, images, timers } = harness();
  const first = loader.load("poster", "low");
  const second = loader.load("poster", "high");
  assert.equal(first, second);
  assert.equal(images.length, 1);
  assert.equal(images[0].fetchPriority, "high");
  let settled = false;
  first.then(() => { settled = true; });
  images[0].load();
  await Promise.resolve();
  assert.equal(settled, false, "network completion alone must not publish the image");
  images[0].resolve();
  assert.equal(await first, true);
  assert.equal(timers.size, 0);
});

test("a failed poster remains retryable and never reports ready", async () => {
  const { loader, images } = harness();
  const first = loader.load("poster");
  images[0].dispatchEvent(new Event("error"));
  assert.equal(await first, false);
  const retry = loader.load("poster");
  assert.equal(images.length, 2);
  images[1].load();
  images[1].resolve();
  assert.equal(await retry, true);
});

test("a stalled request has a deadline; late decode cannot change its result", async () => {
  const { loader, images, timers } = harness();
  const request = loader.load("poster");
  images[0].load();
  [...timers.values()][0]();
  assert.equal(await request, false);
  images[0].resolve();
  assert.equal(await request, false);
  assert.equal(timers.size, 0);
});

test("route disposal settles every request and releases its deadline", async () => {
  const { loader, images, timers } = harness();
  const requests = [loader.load("one"), loader.load("two")];
  images[0].load();
  loader.dispose();
  assert.deepEqual(await Promise.all(requests), [false, false]);
  assert.equal(timers.size, 0);
  images[0].resolve();
  assert.equal(await loader.load("three"), false);
  assert.equal(images.length, 2);
});

test("the load event is a safe fallback where decode is unavailable", async () => {
  const { loader, images } = harness({ supportsDecode: false });
  const request = loader.load("poster");
  images[0].load();
  assert.equal(await request, true);
});

test("cached images are still decoded before becoming eligible", async () => {
  const { loader, images } = harness({ cached: true });
  const request = loader.load("poster");
  images[0].resolve();
  assert.equal(await request, true);
});

test("decode rejection only falls back to a fully loaded, nonempty image", async () => {
  const { loader, images } = harness();
  const request = loader.load("poster");
  images[0].load();
  images[0].naturalWidth = 0;
  images[0].reject(new Error("decode failed"));
  assert.equal(await request, false);
});
