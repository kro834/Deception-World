import assert from "node:assert/strict";
import test from "node:test";

const source = "/rexonance-p14-core.jpg";
const selected = "https://example.test/rexonance-p14-core-delivery-960.webp";

async function fixture(t, mode) {
  const original = Object.getOwnPropertyDescriptor(globalThis, "Image");
  t.after(() => {
    if (original) Object.defineProperty(globalThis, "Image", original);
    else delete globalThis.Image;
  });
  const images = [];
  let finishDecode;
  class Image {
    constructor() {
      this.attributes = new Map();
      this.removed = [];
      this.naturalWidth = 1000;
      if (mode === "events") this.decode = undefined;
      images.push(this);
    }
    set sizes(value) {
      this.attributes.set("sizes", value);
    }
    get sizes() {
      return this.attributes.get("sizes") || "";
    }
    set srcset(value) {
      this.attributes.set("srcset", value);
    }
    get srcset() {
      return this.attributes.get("srcset") || "";
    }
    set src(value) {
      this.attributes.set("src", value);
      if (mode === "events") queueMicrotask(() => this.onload?.());
    }
    get src() {
      return this.attributes.get("src") || "";
    }
    // Removing srcset can change currentSrc; the loader must preserve the
    // selected file first, rather than capture its fallback after cleanup.
    get currentSrc() {
      return this.srcset ? selected : this.src;
    }
    removeAttribute(name) {
      this.removed.push(name);
      this.attributes.delete(name);
    }
    decode() {
      if (mode === "failure") return Promise.reject(new Error("decoder failed"));
      if (mode === "pending")
        return new Promise((resolve) => {
          finishDecode = resolve;
        });
      return Promise.resolve();
    }
  }
  Object.defineProperty(globalThis, "Image", { configurable: true, value: Image });
  const loader = await import(`../src/lib/asset-loader.ts?responsive-cleanup=${mode}`);
  return { loader, images, finishDecode: () => finishDecode() };
}

for (const mode of ["decode", "events"]) {
  test(`a successful ${mode} warm-up releases viewport attributes but retains its chosen file`, async (t) => {
    const f = await fixture(t, mode);
    await f.loader.preloadAssets([source], () => {});
    const image = f.images[0];
    assert.deepEqual(
      image.removed,
      ["src", "srcset", "sizes"],
      "remove fallback src before the responsive candidates",
    );
    assert.equal(image.sizes, "");
    assert.equal(image.srcset, "");
    assert.equal(image.src, "", "the completed temporary element has no further image requests");
    assert.equal(image.onload, null);
    assert.equal(image.onerror, null);
    assert.equal(f.loader.assetsWarmed([source]), true);
    assert.equal(
      f.loader.warmedSource(source),
      selected,
      "the URL is saved before currentSrc changes",
    );
    await f.loader.preloadAssets([source], () => {});
    assert.equal(f.images.length, 1, "the response remains warmed and is not fetched again");
  });
}

test("a failed warm-up also releases responsive attributes without claiming a warmed source", async (t) => {
  const f = await fixture(t, "failure");
  await f.loader.preloadAssets([source], () => {});
  assert.deepEqual(f.images[0].removed, ["src", "srcset", "sizes"]);
  assert.equal(f.images[0].src, "");
  assert.equal(f.loader.assetsWarmed([source]), false);
  assert.equal(f.loader.warmedSource(source), source);
});

test("a cancelled decode releases all request attributes and cannot record a late success", async (t) => {
  const f = await fixture(t, "pending");
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const pending = f.loader.preloadAssets([source], () => {});
  for (let index = 0; index < 5; index += 1) await Promise.resolve();
  t.mock.timers.tick(f.loader.ASSET_REQUEST_TIMEOUT_MS + 1);
  await pending;
  assert.deepEqual(f.images[0].removed, ["src", "srcset", "sizes"]);
  assert.equal(f.images[0].src, "");
  f.finishDecode();
  await Promise.resolve();
  assert.equal(f.loader.assetsWarmed([source]), false);
  assert.equal(f.loader.warmedSource(source), source);
});
