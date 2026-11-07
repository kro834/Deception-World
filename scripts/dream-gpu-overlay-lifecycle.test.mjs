import assert from "node:assert/strict";
import test from "node:test";
import { startLamplightOverlay } from "../src/lib/dream-gpu/dream-gpu-engine.js";

test("a retired overlay releases its pending device without touching the replacement's canvas", async (t) => {
  const deviceRequest = Promise.withResolvers();
  const started = Promise.withResolvers();
  const destroy = t.mock.fn();
  const gpu = {
    requestAdapter: async () => ({
      requestDevice() {
        started.resolve();
        return deviceRequest.promise;
      },
    }),
  };
  const original = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: { gpu } });
  t.after(() => {
    if (original) Object.defineProperty(globalThis, "navigator", original);
    else delete globalThis.navigator;
  });

  const controller = new AbortController();
  const canvas = { getContext: t.mock.fn() };
  const boot = startLamplightOverlay(canvas, { signal: controller.signal });
  await started.promise;
  controller.abort();
  deviceRequest.resolve({ destroy });
  await boot;
  assert.equal(canvas.getContext.mock.callCount(), 0);
  assert.equal(destroy.mock.callCount(), 1);
});
