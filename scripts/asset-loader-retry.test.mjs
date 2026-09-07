import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { assetsWarmed, preloadAssets } from "../src/lib/asset-loader.ts";

const source = readFileSync(new URL("../src/lib/asset-loader.ts", import.meta.url), "utf8");

test("resource timing entries cannot mark an asset as warmed", () => {
  assert.doesNotMatch(source, /performance\.getEntriesByName|browserHasAsset/);
});

test("a failed request is not warmed and can be retried", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const url = "/asset-loader-request-retry.bin?case=request";
  let fetchCalls = 0;
  globalThis.fetch = async () => {
    fetchCalls += 1;
    throw new Error("temporary network failure");
  };

  await preloadAssets([url], () => undefined);
  assert.equal(assetsWarmed([url]), false);

  await preloadAssets([url], () => undefined);
  assert.equal(fetchCalls, 2);
  assert.equal(assetsWarmed([url]), false);
});

test("images use one native request and warm only after successful decode", async (t) => {
  const originalFetch = globalThis.fetch;
  const hadImage = Object.hasOwn(globalThis, "Image");
  const originalImage = globalThis.Image;
  t.after(() => {
    globalThis.fetch = originalFetch;
    if (hadImage) globalThis.Image = originalImage;
    else delete globalThis.Image;
  });

  const url = "/asset-loader-decode-retry.webp?case=decode";
  let fetchCalls = 0;
  let decodeCalls = 0;
  let decodeSucceeds = false;

  class FakeImage {
    decoding = "auto";
    naturalWidth = 0;
    src = "";

    async decode() {
      decodeCalls += 1;
      if (!decodeSucceeds) throw new Error("temporary decode failure");
      this.naturalWidth = 32;
    }
  }

  globalThis.Image = FakeImage;
  globalThis.fetch = async () => {
    fetchCalls += 1;
    return new Response(new Uint8Array([1, 2, 3]), {
      status: 200,
      headers: { "content-length": "3" },
    });
  };

  await preloadAssets([url], () => undefined);
  assert.equal(assetsWarmed([url]), false);

  decodeSucceeds = true;
  await preloadAssets([url], () => undefined);
  assert.equal(assetsWarmed([url]), true);

  await preloadAssets([url], () => undefined);
  assert.equal(fetchCalls, 0, "native image loading must not duplicate a fetch request");
  assert.equal(decodeCalls, 2);
});

test("concurrent image warmups share one native decode", async (t) => {
  const hadImage = Object.hasOwn(globalThis, "Image");
  const originalImage = globalThis.Image;
  t.after(() => {
    if (hadImage) globalThis.Image = originalImage;
    else delete globalThis.Image;
  });
  let decodeCalls = 0;
  globalThis.Image = class {
    naturalWidth = 32;
    async decode() {
      decodeCalls += 1;
      await Promise.resolve();
    }
  };
  const url = "/asset-loader-shared-native.webp";
  await Promise.all([
    preloadAssets([url], () => undefined),
    preloadAssets([url], () => undefined),
  ]);
  assert.equal(decodeCalls, 1);
  assert.equal(assetsWarmed([url]), true);
});
