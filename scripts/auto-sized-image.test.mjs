import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { autoSizedImageRef } from "../src/lib/auto-sized-image.ts";
import { rexonanceImage } from "../src/lib/rexonance-images.ts";

const sizes = rexonanceImage("/rexonance-p14-core.jpg", true).sizes;
function image() {
  return {
    attributes: new Map(),
    connected: true,
    setAttribute(key, value) {
      this.attributes.set(key, value);
    },
    removeAttribute(key) {
      assert.equal(this.connected, true, "release the listener before host removal");
      this.attributes.delete(key);
    },
  };
}

test("auto sizes stay active in-document and are released synchronously by the ref cleanup", () => {
  const node = image();
  const ref = autoSizedImageRef(sizes);
  assert.equal(ref(null), undefined);
  const cleanup = ref(node);
  assert.match(node.attributes.get("sizes"), /^auto, /);
  cleanup();
  assert.equal(node.attributes.has("sizes"), false);
  node.connected = false;
});

test("StrictMode ref reattachment restores auto sizes, and each node owns its own cleanup", () => {
  const first = image();
  const second = image();
  const ref = autoSizedImageRef(sizes);
  ref(first)();
  const releaseFirst = ref(first);
  const releaseSecond = ref(second);
  assert.equal(first.attributes.get("sizes"), sizes);
  releaseFirst();
  assert.equal(second.attributes.get("sizes"), sizes);
  releaseSecond();
  assert.equal(second.attributes.has("sizes"), false);
});

test("the P14 image uses a module-stable cleanup ref rather than an on-load workaround", () => {
  const page = readFileSync(
    new URL("../src/components/rexonance-saga/rexonance-saga.tsx", import.meta.url),
    "utf8",
  );
  assert.match(page, /const p14ImageRef = autoSizedImageRef/);
  assert.match(page, /src="\/rexonance-p14-core\.jpg"[^>]*ref=\{p14ImageRef\}/);
});
