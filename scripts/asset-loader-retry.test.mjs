import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { ASSET_REQUEST_TIMEOUT_MS, assetsWarmed, preloadAssets } from "../src/lib/asset-loader.ts";

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
  await Promise.all([preloadAssets([url], () => undefined), preloadAssets([url], () => undefined)]);
  assert.equal(decodeCalls, 1);
  assert.equal(assetsWarmed([url]), true);
});

test("revisioned URLs retain independent ready and in-flight identities", async (t) => {
  const originalImage = globalThis.Image;
  t.after(() => {
    if (originalImage) globalThis.Image = originalImage;
    else delete globalThis.Image;
  });
  let decodes = 0;
  globalThis.Image = class {
    naturalWidth = 32;
    async decode() {
      decodes += 1;
    }
  };
  const v1 = "/revision-test.webp?v=1";
  const v2 = "/revision-test.webp?v=2";
  await preloadAssets([v1], () => {});
  assert.equal(assetsWarmed([v2]), false);
  await preloadAssets([v2], () => {});
  await Promise.all([3, 4].map((v) => preloadAssets([`/revision-test.webp?v=${v}`], () => {})));
  assert.equal(decodes, 4);
});

for (const kind of ["decode", "image-events", "fetch", "stream"]) {
  test(`a stalled ${kind} settles, stays unwarmed, and can be retried`, async (t) => {
    const originalImage = globalThis.Image;
    const originalFetch = globalThis.fetch;
    t.after(() => {
      if (originalImage) globalThis.Image = originalImage;
      else delete globalThis.Image;
      globalThis.fetch = originalFetch;
    });
    t.mock.timers.enable({ apis: ["setTimeout"] });
    let cancelled = false;
    let calls = 0;
    let succeed = false;
    const url = `/deadline-${kind}.${kind.startsWith("image") || kind === "decode" ? "webp" : "bin"}`;
    if (kind === "decode" || kind === "image-events") {
      globalThis.Image = class {
        naturalWidth = 32;
        onload = null;
        decode =
          kind === "decode"
            ? () => {
                calls += 1;
                return succeed ? Promise.resolve() : new Promise(() => {});
              }
            : undefined;
        set src(value) {
          if (kind === "image-events") {
            calls += 1;
            if (succeed) this.onload?.();
          }
        }
        removeAttribute() {
          cancelled = true;
        }
      };
    } else {
      delete globalThis.Image;
      globalThis.fetch = async (_url, options) => {
        calls += 1;
        options.signal.addEventListener("abort", () => {
          cancelled = true;
        });
        if (succeed) return new Response(new Uint8Array([1]));
        if (kind === "fetch") return new Promise(() => {});
        return new Response(
          new ReadableStream({
            pull() {
              return new Promise(() => {});
            },
          }),
        );
      };
    }
    const pending = preloadAssets([url], () => {});
    // Let both fetch headers and reader/decode setup run before advancing time.
    for (let i = 0; i < 8; i += 1) await Promise.resolve();
    t.mock.timers.tick(ASSET_REQUEST_TIMEOUT_MS + 1);
    await pending;
    assert.equal(cancelled, true);
    assert.equal(assetsWarmed([url]), false);
    succeed = true;
    await preloadAssets([url], () => {});
    assert.equal(calls, 2);
    assert.equal(assetsWarmed([url]), true);
  });
}
