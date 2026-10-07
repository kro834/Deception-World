import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { createUltraRenderer } from "../src/lib/ultra-renderer.js";

const originalGlobals = {
  cancelAnimationFrame: globalThis.cancelAnimationFrame,
  createImageBitmap: globalThis.createImageBitmap,
  devicePixelRatio: globalThis.devicePixelRatio,
  fetch: globalThis.fetch,
  innerHeight: globalThis.innerHeight,
  innerWidth: globalThis.innerWidth,
  IntersectionObserver: globalThis.IntersectionObserver,
  requestAnimationFrame: globalThis.requestAnimationFrame,
};

function makeHarness({
  context = "webgl2",
  rect = { width: 320, height: 180 },
  gpuErrors = [],
  deferMaterials = false,
  bitmapErrorPaths = [],
  observeIntersection = false,
  clientSize,
} = {}) {
  const listeners = new Map();
  const rafs = new Map();
  const calls = {
    cancel: [],
    contextOptions: [],
    createProgram: 0,
    createTexture: [],
    createVertexArray: 0,
    deleteProgram: [],
    deleteShader: [],
    deleteTexture: [],
    deleteVertexArray: [],
    drawArrays: 0,
    fetchRequests: [],
    imageBitmaps: [],
    intersectionDisconnects: 0,
    intersectionObserves: [],
    loseContext: 0,
    removeListener: [],
    request: 0,
    shaderSources: [],
    texImage2D: [],
    uniformFloats: [],
    uniformInts: [],
    uniformVec2: [],
    viewport: [],
  };
  let nextId = 1;
  let now = 0;
  let intersectionCallback;
  const gl = {
    VERTEX_SHADER: 1,
    FRAGMENT_SHADER: 2,
    COMPILE_STATUS: 3,
    LINK_STATUS: 4,
    NO_ERROR: 0,
    TRIANGLES: 5,
    TEXTURE_2D: 6,
    TEXTURE0: 7,
    RGBA: 8,
    UNSIGNED_BYTE: 9,
    LINEAR: 10,
    CLAMP_TO_EDGE: 11,
    TEXTURE_MIN_FILTER: 12,
    TEXTURE_MAG_FILTER: 13,
    TEXTURE_WRAP_S: 14,
    TEXTURE_WRAP_T: 15,
    COLOR_BUFFER_BIT: 16,
    createProgram() {
      calls.createProgram++;
      return { id: nextId++ };
    },
    createShader(kind) {
      return { id: nextId++, kind };
    },
    shaderSource(shader, source) {
      calls.shaderSources.push({ kind: shader.kind, source });
    },
    compileShader() {},
    getShaderParameter() {
      return true;
    },
    getShaderInfoLog() {
      return "";
    },
    attachShader() {},
    linkProgram() {},
    getProgramParameter() {
      return true;
    },
    getProgramInfoLog() {
      return "";
    },
    createVertexArray() {
      calls.createVertexArray++;
      return { id: nextId++ };
    },
    createTexture() {
      const texture = { id: nextId++ };
      calls.createTexture.push(texture);
      return texture;
    },
    getUniformLocation(_program, name) {
      return { name };
    },
    deleteProgram(value) {
      calls.deleteProgram.push(value);
    },
    deleteShader(value) {
      calls.deleteShader.push(value);
    },
    deleteVertexArray(value) {
      calls.deleteVertexArray.push(value);
    },
    deleteTexture(value) {
      calls.deleteTexture.push(value);
    },
    getExtension(name) {
      if (name !== "WEBGL_lose_context") return null;
      return {
        loseContext() {
          calls.loseContext++;
        },
      };
    },
    viewport(...args) {
      calls.viewport.push(args);
    },
    activeTexture() {},
    bindTexture() {},
    texImage2D(...args) {
      calls.texImage2D.push(args);
    },
    texParameteri() {},
    pixelStorei() {},
    generateMipmap() {},
    clearColor() {},
    clear() {},
    enable() {},
    disable() {},
    blendFunc() {},
    useProgram() {},
    bindVertexArray() {},
    uniform2f(location, x, y) {
      calls.uniformVec2.push([location.name, x, y]);
    },
    uniform1f(location, value) {
      calls.uniformFloats.push([location.name, value]);
    },
    uniform3f() {},
    uniform1i(location, value) {
      calls.uniformInts.push([location.name, value]);
    },
    drawArrays() {
      calls.drawArrays++;
    },
    getError() {
      return gpuErrors.shift() ?? gl.NO_ERROR;
    },
  };
  const canvas = {
    width: 0,
    height: 0,
    getContext(type, options) {
      assert.equal(type, "webgl2");
      calls.contextOptions.push(options);
      if (context === "throws") throw new Error("context unavailable");
      return context === "webgl2" ? gl : null;
    },
    getBoundingClientRect() {
      return rect;
    },
    addEventListener(type, listener) {
      const entries = listeners.get(type) ?? new Set();
      entries.add(listener);
      listeners.set(type, entries);
    },
    removeEventListener(type, listener) {
      calls.removeListener.push([type, listener]);
      listeners.get(type)?.delete(listener);
    },
    dispatch(type, event = {}) {
      for (const listener of listeners.get(type) ?? []) listener(event);
    },
    listenerCount(type) {
      return listeners.get(type)?.size ?? 0;
    },
  };
  if (clientSize) {
    canvas.clientWidth = clientSize.width;
    canvas.clientHeight = clientSize.height;
  }

  globalThis.fetch = (path, init) => {
    const entry = { path: String(path), init, resolve: null, reject: null };
    calls.fetchRequests.push(entry);
    const response = {
      ok: true,
      blob: async () => ({ path: entry.path }),
    };
    if (!deferMaterials) return Promise.resolve(response);
    return new Promise((resolve, reject) => {
      entry.resolve = () => resolve(response);
      entry.reject = (error = new Error("material fetch failed")) => reject(error);
    });
  };
  globalThis.createImageBitmap = async (blob, options) => {
    if (bitmapErrorPaths.includes(blob.path)) throw new Error("material decode failed");
    const bitmap = {
      path: blob.path,
      closeCount: 0,
      close() {
        bitmap.closeCount++;
      },
    };
    calls.imageBitmaps.push({ bitmap, options });
    return bitmap;
  };
  globalThis.devicePixelRatio = 1;
  globalThis.innerWidth = 800;
  globalThis.innerHeight = 600;
  if (observeIntersection) {
    globalThis.IntersectionObserver = class {
      constructor(callback) {
        intersectionCallback = callback;
      }
      observe(target) {
        calls.intersectionObserves.push(target);
      }
      disconnect() {
        calls.intersectionDisconnects++;
      }
    };
  } else {
    delete globalThis.IntersectionObserver;
  }
  globalThis.requestAnimationFrame = (callback) => {
    const id = nextId++;
    calls.request++;
    rafs.set(id, callback);
    return id;
  };
  globalThis.cancelAnimationFrame = (id) => {
    calls.cancel.push(id);
    rafs.delete(id);
  };

  return {
    calls,
    canvas,
    gl,
    rafs,
    runFrame(timestamp = (now += 100)) {
      const [id, callback] = rafs.entries().next().value ?? [];
      if (callback) {
        rafs.delete(id);
        callback(timestamp);
      }
    },
    resolveMaterials() {
      for (const request of calls.fetchRequests) request.resolve?.();
    },
    rejectMaterials(error) {
      for (const request of calls.fetchRequests) request.reject?.(error);
    },
    emitIntersection(isIntersecting, intersectionRatio = isIntersecting ? 1 : 0) {
      intersectionCallback?.([{ target: canvas, isIntersecting, intersectionRatio }]);
    },
    restore() {
      for (const key of Object.keys(originalGlobals)) {
        if (originalGlobals[key] === undefined) delete globalThis[key];
        else globalThis[key] = originalGlobals[key];
      }
    },
  };
}

async function flushPromises() {
  for (let index = 0; index < 10; index++) await Promise.resolve();
}

const bakedUploads = (calls) =>
  calls.texImage2D.filter((args) =>
    args.some((value) => calls.imageBitmaps.some(({ bitmap }) => bitmap === value)),
  );
const lastTime = (calls) => calls.uniformFloats.filter(([name]) => name === "uTime").at(-1)?.[1];

test("unsupported WebGL2 contexts return null and report unsupported", () => {
  for (const context of ["missing", "throws"]) {
    const harness = makeHarness({ context });
    try {
      const statuses = [];
      assert.equal(
        createUltraRenderer(harness.canvas, { onStatus: (value) => statuses.push(value) }),
        null,
      );
      assert.deepEqual(statuses, ["unsupported"]);
      assert.equal(harness.canvas.listenerCount("webglcontextlost"), 0);
      assert.equal(harness.canvas.listenerCount("webglcontextrestored"), 0);
    } finally {
      harness.restore();
    }
  }
});

test("backing dimensions respect both the DPR and pixel budget", (t) => {
  const harness = makeHarness({ rect: { width: 400, height: 200 } });
  t.after(harness.restore);
  globalThis.devicePixelRatio = 3;
  createUltraRenderer(harness.canvas, { maxDpr: 1.25, maxPixels: 500_000 });
  assert.equal(harness.canvas.width, 500);
  assert.equal(harness.canvas.height, 250);
  assert.ok(harness.canvas.width * harness.canvas.height <= 500_000);

  const large = makeHarness({ rect: { width: 1800, height: 1200 } });
  t.after(large.restore);
  globalThis.devicePixelRatio = 3;
  createUltraRenderer(large.canvas, { maxDpr: 2, maxPixels: 400_000 });
  assert.ok(large.canvas.width * large.canvas.height <= 400_000);
  assert.ok(large.canvas.width / 1800 <= 2);
  assert.ok(large.canvas.height / 1200 <= 2);
});

test("transformed bounds do not inflate the local frame's logical or backing size", (t) => {
  const harness = makeHarness({
    rect: { left: 0, top: 0, width: 960, height: 640 },
    clientSize: { width: 480, height: 320 },
  });
  t.after(harness.restore);
  globalThis.devicePixelRatio = 2;
  const renderer = createUltraRenderer(harness.canvas, { quality: "cinema" });
  assert.equal(harness.canvas.width, 960);
  assert.equal(harness.canvas.height, 640);
  renderer.start();
  harness.runFrame(100);
  assert.deepEqual(
    harness.calls.uniformVec2.find(([name]) => name === "uLogicalSize"),
    ["uLogicalSize", 480, 320],
  );
  renderer.dispose();
});

test("zero layout size suppresses network, RAF, and drawing despite positive transformed bounds", (t) => {
  const harness = makeHarness({
    rect: { left: 0, top: 0, width: 960, height: 640 },
    clientSize: { width: 0, height: 0 },
  });
  t.after(harness.restore);
  const renderer = createUltraRenderer(harness.canvas);
  renderer.start();
  assert.equal(harness.calls.fetchRequests.length, 0);
  assert.equal(harness.rafs.size, 0);
  assert.equal(harness.calls.drawArrays, 0);
  assert.equal(renderer.getDiagnostics().running, true);
  renderer.dispose();
});

test("quality presets change render budgets and send sample counts to the local frame shader", (t) => {
  for (const [quality, expected] of [
    [undefined, { name: "high", pixels: 1_600_000, dpr: 1.6, samples: 1 }],
    ["cinema", { name: "cinema", pixels: 2_400_000, dpr: 2, samples: 2 }],
  ]) {
    const harness = makeHarness({ rect: { width: 800, height: 600 } });
    t.after(harness.restore);
    globalThis.devicePixelRatio = 3;
    const renderer = createUltraRenderer(harness.canvas, { quality });
    const beforeDraw = renderer.getDiagnostics();
    assert.equal(beforeDraw.requestedQuality, expected.name);
    assert.equal(beforeDraw.effectiveSamples, expected.samples);
    assert.equal(beforeDraw.steps, 0);
    assert.equal(beforeDraw.frameWidthPx, 12);
    assert.equal(beforeDraw.maxPixels, expected.pixels);
    assert.ok(harness.canvas.width * harness.canvas.height <= expected.pixels);
    assert.ok(harness.canvas.width / 800 <= expected.dpr);
    assert.ok(harness.canvas.height / 600 <= expected.dpr);

    renderer.start();
    harness.runFrame(100);
    assert.equal(Object.fromEntries(harness.calls.uniformInts).uSamples, expected.samples);
    assert.equal(Object.fromEntries(harness.calls.uniformFloats).uFrameWidthPx, 12);
    const fragment = harness.calls.shaderSources.find(
      ({ kind }) => kind === harness.gl.FRAGMENT_SHADER,
    )?.source;
    assert.match(fragment, /uniform\s+int\s+uSamples\s*;/);
    assert.ok((fragment.match(/\buSamples\b/g) ?? []).length > 1);
    assert.doesNotMatch(fragment, /\buSteps\b/);
    assert.equal(harness.calls.contextOptions[0].alpha, true);
    assert.equal(harness.calls.contextOptions[0].premultipliedAlpha, true);
    renderer.dispose();
  }
});

test("explicit render budgets override presets but remain within safety caps", (t) => {
  const overridden = makeHarness({ rect: { width: 1200, height: 800 } });
  t.after(overridden.restore);
  globalThis.devicePixelRatio = 3;
  const renderer = createUltraRenderer(overridden.canvas, {
    quality: "cinema",
    maxPixels: 800_000,
    maxDpr: 1.25,
    steps: 40,
    frameWidthPx: 2,
    maxFps: 30,
  });
  const diagnostics = renderer.getDiagnostics();
  assert.equal(diagnostics.requestedQuality, "cinema");
  assert.equal(diagnostics.maxPixels, 800_000);
  assert.equal(diagnostics.requestedFps, 30);
  assert.equal(diagnostics.steps, 0);
  assert.equal(diagnostics.frameWidthPx, 4);
  assert.equal(diagnostics.effectiveSamples, 2);
  assert.ok(overridden.canvas.width * overridden.canvas.height <= 800_000);
  assert.ok(overridden.canvas.width / 1200 <= 1.25);
  renderer.start();
  overridden.runFrame(100);
  assert.equal(Object.fromEntries(overridden.calls.uniformInts).uSamples, 2);
  assert.equal(Object.fromEntries(overridden.calls.uniformFloats).uFrameWidthPx, 4);
  assert.equal("uSteps" in Object.fromEntries(overridden.calls.uniformInts), false);
  renderer.dispose();

  const capped = makeHarness({ rect: { width: 1200, height: 800 } });
  t.after(capped.restore);
  const cappedRenderer = createUltraRenderer(capped.canvas, {
    quality: "unknown",
    maxPixels: 9_000_000,
    maxDpr: 8,
    steps: 200,
    frameWidthPx: 200,
    maxFps: 120,
  });
  const cappedDiagnostics = cappedRenderer.getDiagnostics();
  assert.equal(cappedDiagnostics.requestedQuality, "high");
  assert.equal(cappedDiagnostics.maxPixels, 2_400_000);
  assert.equal(cappedDiagnostics.steps, 0);
  assert.equal(cappedDiagnostics.frameWidthPx, 24);
  assert.equal(cappedDiagnostics.requestedFps, 60);
  assert.ok(capped.canvas.width * capped.canvas.height <= 2_400_000);
  assert.ok(capped.canvas.width / 1200 <= 2);
  cappedRenderer.dispose();
});

test("cinema drops extra sampling when sustained slow frames trigger backoff", (t) => {
  const harness = makeHarness({ rect: { width: 1000, height: 600 } });
  t.after(harness.restore);
  const renderer = createUltraRenderer(harness.canvas, { quality: "cinema" });
  renderer.start();
  harness.runFrame(50);
  assert.equal(Object.fromEntries(harness.calls.uniformInts).uSamples, 2);
  for (let timestamp = 100; timestamp <= 5_000; timestamp += 50) harness.runFrame(timestamp);
  const diagnostics = renderer.getDiagnostics();
  assert.equal(diagnostics.requestedQuality, "cinema");
  assert.equal(diagnostics.resolutionScale, 0.8);
  assert.equal(diagnostics.effectiveSamples, 1);
  assert.equal(diagnostics.steps, 0);
  assert.ok(harness.canvas.width * harness.canvas.height <= diagnostics.maxPixels);
  assert.equal(Object.fromEntries(harness.calls.uniformInts).uSamples, 1);
  renderer.dispose();
});

test("baked material is reported only after both local maps upload and a successful draw", async (t) => {
  const harness = makeHarness({ deferMaterials: true });
  t.after(harness.restore);
  const statuses = [];
  const materials = [];
  const renderer = createUltraRenderer(harness.canvas, {
    onStatus: (value) => statuses.push(value),
    onMaterialState: (value) => materials.push(value),
  });
  assert.equal(harness.calls.fetchRequests.length, 0);
  renderer.start();
  await flushPromises();
  assert.deepEqual(harness.calls.fetchRequests.map(({ path }) => path).sort(), [
    "/ultra-materials/brushed-alloy-normal.png",
    "/ultra-materials/brushed-alloy-roughness.png",
  ]);
  assert.ok(
    harness.calls.fetchRequests.every(
      ({ init }) => init.credentials === "same-origin" && init.signal instanceof AbortSignal,
    ),
  );
  harness.runFrame(100);
  assert.deepEqual(statuses, ["ready"]);
  assert.equal(renderer.getDiagnostics().materialState, "pending");
  assert.equal(materials[0], "pending");
  assert.equal(materials.includes("baked"), false);
  harness.resolveMaterials();
  await flushPromises();
  assert.equal(harness.calls.imageBitmaps.length, 2);
  assert.ok(
    harness.calls.imageBitmaps.every(
      ({ options }) =>
        options.imageOrientation === "flipY" &&
        options.premultiplyAlpha === "none" &&
        options.colorSpaceConversion === "none",
    ),
  );
  assert.equal(bakedUploads(harness.calls).length, 0);
  assert.equal(renderer.getDiagnostics().materialState, "pending");
  harness.runFrame(200);
  assert.equal(bakedUploads(harness.calls).length, 2);
  assert.equal(renderer.getDiagnostics().materialState, "baked");
  assert.equal(materials.at(-1), "baked");
  renderer.dispose();
  assert.ok(harness.calls.imageBitmaps.every(({ bitmap }) => bitmap.closeCount === 1));
});

test("a failed draw after both map uploads never announces baked material", async (t) => {
  const gpuErrors = [];
  const harness = makeHarness({ deferMaterials: true, gpuErrors });
  t.after(harness.restore);
  const statuses = [];
  const materials = [];
  const renderer = createUltraRenderer(harness.canvas, {
    onStatus: (value) => statuses.push(value),
    onMaterialState: (value) => materials.push(value),
  });
  renderer.start();
  harness.runFrame(100);
  harness.resolveMaterials();
  await flushPromises();
  gpuErrors.push(0, 0, 0x0502);
  harness.runFrame(200);
  assert.equal(bakedUploads(harness.calls).length, 2);
  assert.equal(statuses.at(-1), "error");
  assert.equal(renderer.getDiagnostics().materialState, "pending");
  assert.equal(materials.includes("baked"), false);
  renderer.dispose();
});

test("decoded maps wait through pause and a late completion after dispose never uploads", async (t) => {
  const paused = makeHarness({ deferMaterials: true });
  t.after(paused.restore);
  const renderer = createUltraRenderer(paused.canvas);
  renderer.start();
  await flushPromises();
  renderer.pause();
  paused.resolveMaterials();
  await flushPromises();
  assert.equal(bakedUploads(paused.calls).length, 0);
  assert.equal(renderer.getDiagnostics().materialState, "pending");
  renderer.start();
  paused.runFrame(100);
  assert.equal(bakedUploads(paused.calls).length, 2);
  assert.equal(renderer.getDiagnostics().materialState, "baked");
  renderer.dispose();

  const disposed = makeHarness({ deferMaterials: true });
  t.after(disposed.restore);
  const staleMaterials = [];
  const abandoned = createUltraRenderer(disposed.canvas, {
    onMaterialState: (value) => staleMaterials.push(value),
  });
  abandoned.start();
  await flushPromises();
  abandoned.dispose();
  assert.ok(disposed.calls.fetchRequests.every(({ init }) => init.signal.aborted));
  disposed.resolveMaterials();
  await flushPromises();
  assert.equal(disposed.calls.imageBitmaps.length, 0);
  assert.equal(bakedUploads(disposed.calls).length, 0);
  assert.equal(staleMaterials.includes("baked"), false);
});

test("one failed baked map reports fallback while procedural GPU drawing remains usable", async (t) => {
  const harness = makeHarness({
    bitmapErrorPaths: ["/ultra-materials/brushed-alloy-roughness.png"],
  });
  t.after(harness.restore);
  const statuses = [];
  const materials = [];
  const renderer = createUltraRenderer(harness.canvas, {
    onStatus: (value) => statuses.push(value),
    onMaterialState: (value) => materials.push(value),
  });
  renderer.start();
  await flushPromises();
  harness.runFrame(100);
  assert.deepEqual(statuses, ["ready"]);
  assert.equal(renderer.getDiagnostics().ready, true);
  assert.equal(renderer.getDiagnostics().materialState, "fallback");
  assert.equal(materials.at(-1), "fallback");
  assert.equal(materials.includes("baked"), false);
  renderer.dispose();
});

test("an initially offscreen frame fetches and draws only after intersection, then pauses offscreen", async (t) => {
  const rect = { left: 2000, top: 0, width: 320, height: 180 };
  const harness = makeHarness({ rect, deferMaterials: true, observeIntersection: true });
  t.after(harness.restore);
  const renderer = createUltraRenderer(harness.canvas);
  assert.deepEqual(harness.calls.intersectionObserves, [harness.canvas]);
  renderer.start();
  await flushPromises();
  assert.equal(harness.calls.fetchRequests.length, 0);
  assert.equal(harness.rafs.size, 0);
  rect.left = 0;
  harness.emitIntersection(true);
  await flushPromises();
  assert.equal(harness.calls.fetchRequests.length, 2);
  assert.equal(harness.rafs.size, 1);
  harness.runFrame(100);
  assert.equal(harness.calls.drawArrays, 1);
  harness.emitIntersection(false);
  assert.equal(harness.rafs.size, 0);
  harness.resolveMaterials();
  await flushPromises();
  assert.equal(bakedUploads(harness.calls).length, 0);
  harness.emitIntersection(true);
  harness.runFrame(200);
  assert.equal(bakedUploads(harness.calls).length, 2);
  renderer.dispose();
  assert.equal(harness.calls.intersectionDisconnects, 1);
});

test("ready is reported after the initial draw; start is idempotent and pause resumes", (t) => {
  const harness = makeHarness();
  t.after(harness.restore);
  const statuses = [];
  const renderer = createUltraRenderer(harness.canvas, {
    onStatus: (value) => statuses.push(value),
  });
  assert.deepEqual(statuses, []);
  assert.equal(renderer.getDiagnostics().ready, false);
  renderer.start();
  renderer.start();
  assert.equal(harness.rafs.size, 1);
  assert.equal(harness.calls.request, 1);

  harness.runFrame(100);
  assert.equal(harness.calls.drawArrays, 1);
  assert.deepEqual(statuses, ["ready"]);
  assert.equal(renderer.getDiagnostics().ready, true);
  assert.equal(harness.rafs.size, 1);
  renderer.start();
  assert.equal(harness.calls.request, 2);
  assert.equal(harness.rafs.size, 1);

  renderer.pause();
  assert.equal(harness.rafs.size, 0);
  assert.equal(harness.calls.cancel.length, 1);
  renderer.start();
  assert.equal(harness.rafs.size, 1);
  assert.equal(harness.calls.request, 3);
});

test("studio-light time advances only on active frames, without jumps after pause or visibility loss", (t) => {
  const harness = makeHarness({ observeIntersection: true });
  t.after(harness.restore);
  const renderer = createUltraRenderer(harness.canvas);
  renderer.start();
  harness.runFrame(100);
  assert.equal(lastTime(harness.calls), 0);
  harness.runFrame(200);
  assert.ok(Math.abs(lastTime(harness.calls) - 0.1) < 1e-6);

  renderer.pause();
  renderer.start();
  harness.runFrame(10_200);
  assert.ok(Math.abs(lastTime(harness.calls) - 0.1) < 1e-6);
  harness.runFrame(10_300);
  assert.ok(Math.abs(lastTime(harness.calls) - 0.2) < 1e-6);

  harness.emitIntersection(false);
  assert.equal(harness.rafs.size, 0);
  harness.emitIntersection(true);
  harness.runFrame(20_300);
  assert.ok(Math.abs(lastTime(harness.calls) - 0.2) < 1e-6);
  harness.runFrame(20_400);
  assert.ok(Math.abs(lastTime(harness.calls) - 0.3) < 1e-6);

  harness.canvas.dispatch("webglcontextlost", { preventDefault() {} });
  harness.canvas.dispatch("webglcontextrestored");
  harness.runFrame(30_400);
  assert.ok(Math.abs(lastTime(harness.calls) - 0.3) < 1e-6);
  harness.runFrame(30_500);
  assert.ok(Math.abs(lastTime(harness.calls) - 0.4) < 1e-6);
  renderer.dispose();
});

test("initial GPU draw failure reports error and stops the render loop", (t) => {
  const harness = makeHarness({ gpuErrors: [0x0502] });
  t.after(harness.restore);
  const statuses = [];
  const renderer = createUltraRenderer(harness.canvas, {
    onStatus: (value) => statuses.push(value),
  });
  assert.deepEqual(statuses, []);
  renderer.start();
  assert.equal(harness.rafs.size, 1);
  harness.runFrame(100);
  assert.deepEqual(statuses, ["error"]);
  assert.equal(renderer.getDiagnostics().ready, false);
  assert.equal(renderer.getDiagnostics().running, false);
  assert.equal(harness.rafs.size, 0);
});

test("dispose is idempotent and releases listeners, GPU objects, and context", (t) => {
  const harness = makeHarness();
  t.after(harness.restore);
  const renderer = createUltraRenderer(harness.canvas);
  renderer.start();
  renderer.dispose();
  renderer.dispose();
  assert.equal(harness.rafs.size, 0);
  assert.equal(harness.canvas.listenerCount("webglcontextlost"), 0);
  assert.equal(harness.canvas.listenerCount("webglcontextrestored"), 0);
  assert.equal(harness.calls.removeListener.length, 2);
  assert.equal(harness.calls.deleteProgram.length, 1);
  assert.equal(harness.calls.deleteVertexArray.length, 1);
  assert.equal(harness.calls.deleteTexture.length, 2);
  assert.equal(harness.calls.loseContext, 1);
  assert.equal(harness.canvas.width, 1);
  assert.equal(harness.canvas.height, 1);
  renderer.start();
  assert.equal(harness.rafs.size, 0);
});

test("context loss stops rendering and restoration resumes only when running", (t) => {
  const harness = makeHarness();
  t.after(harness.restore);
  const statuses = [];
  const renderer = createUltraRenderer(harness.canvas, {
    quality: "cinema",
    onStatus: (value) => statuses.push(value),
  });
  renderer.start();
  let prevented = false;
  harness.canvas.dispatch("webglcontextlost", {
    preventDefault() {
      prevented = true;
    },
  });
  assert.equal(prevented, true);
  assert.equal(harness.rafs.size, 0);
  assert.equal(statuses.at(-1), "context-lost");

  harness.canvas.dispatch("webglcontextrestored");
  assert.equal(harness.calls.createProgram, 2);
  assert.equal(harness.rafs.size, 1);
  const drawnBeforeLoss = harness.calls.drawArrays;
  harness.runFrame(100);
  assert.equal(harness.calls.drawArrays, drawnBeforeLoss + 1);
  assert.equal(Object.fromEntries(harness.calls.uniformInts).uSamples, 2);

  renderer.pause();
  harness.canvas.dispatch("webglcontextlost", { preventDefault() {} });
  harness.canvas.dispatch("webglcontextrestored");
  assert.equal(harness.calls.createProgram, 2);
  assert.equal(harness.rafs.size, 0);
  renderer.start();
  assert.equal(harness.calls.createProgram, 3);
  assert.equal(harness.rafs.size, 1);
});

test("context restoration recreates textures and reuploads cached maps only after resume", async (t) => {
  const harness = makeHarness();
  t.after(harness.restore);
  const materials = [];
  const renderer = createUltraRenderer(harness.canvas, {
    onMaterialState: (value) => materials.push(value),
  });
  renderer.start();
  await flushPromises();
  harness.runFrame(100);
  assert.equal(bakedUploads(harness.calls).length, 2);
  assert.equal(renderer.getDiagnostics().materialState, "baked");
  assert.equal(harness.calls.fetchRequests.length, 2);

  renderer.pause();
  harness.canvas.dispatch("webglcontextlost", { preventDefault() {} });
  harness.canvas.dispatch("webglcontextrestored");
  assert.equal(harness.calls.createTexture.length, 2);
  assert.equal(bakedUploads(harness.calls).length, 2);
  assert.equal(renderer.getDiagnostics().materialState, "pending");
  assert.equal(harness.rafs.size, 0);

  renderer.start();
  assert.equal(harness.calls.createTexture.length, 4);
  harness.runFrame(200);
  assert.equal(bakedUploads(harness.calls).length, 4);
  assert.equal(harness.calls.fetchRequests.length, 2);
  assert.equal(renderer.getDiagnostics().materialState, "baked");
  assert.equal(materials.at(-1), "baked");
  renderer.dispose();
  assert.equal(harness.calls.deleteTexture.length, 4);
});

test("context restoration while offscreen defers GPU allocation until intersection returns", (t) => {
  const harness = makeHarness({ observeIntersection: true });
  t.after(harness.restore);
  const renderer = createUltraRenderer(harness.canvas);
  renderer.start();
  harness.runFrame(100);
  assert.equal(harness.calls.createProgram, 1);
  assert.equal(harness.calls.createTexture.length, 2);

  harness.emitIntersection(false);
  harness.canvas.dispatch("webglcontextlost", { preventDefault() {} });
  harness.canvas.dispatch("webglcontextrestored");
  assert.equal(harness.calls.createProgram, 1);
  assert.equal(harness.calls.createTexture.length, 2);
  assert.equal(harness.rafs.size, 0);

  harness.emitIntersection(true);
  assert.equal(harness.calls.createProgram, 2);
  assert.equal(harness.calls.createTexture.length, 4);
  assert.equal(harness.rafs.size, 1);
  harness.runFrame(10_100);
  assert.equal(harness.calls.drawArrays, 2);
  renderer.dispose();
});

test("sustained slow RAF intervals reduce resolution and target frame rate", (t) => {
  const harness = makeHarness({ rect: { width: 1000, height: 600 } });
  t.after(harness.restore);
  const renderer = createUltraRenderer(harness.canvas, { maxPixels: 1_000_000, maxFps: 60 });
  renderer.start();
  for (let timestamp = 50; timestamp <= 12_000; timestamp += 50) harness.runFrame(timestamp);
  const diagnostics = renderer.getDiagnostics();
  assert.equal(diagnostics.resolutionScale, 0.6);
  assert.equal(diagnostics.actualFps, 30);
  assert.ok(harness.canvas.width < 1000);
  assert.ok(harness.canvas.height < 600);
  assert.ok(harness.canvas.width * harness.canvas.height <= diagnostics.maxPixels);
});

test("zero and non-finite layout sizes produce finite positive backing dimensions", (t) => {
  for (const rect of [
    { width: 0, height: 0 },
    { width: Number.NaN, height: 120 },
    { width: 120, height: Number.NaN },
  ]) {
    const harness = makeHarness({ rect });
    t.after(harness.restore);
    createUltraRenderer(harness.canvas);
    assert.ok(Number.isFinite(harness.canvas.width) && harness.canvas.width >= 1);
    assert.ok(Number.isFinite(harness.canvas.height) && harness.canvas.height >= 1);
    const latestViewport = harness.calls.viewport.at(-1);
    assert.ok(latestViewport.every(Number.isFinite));
  }
});

test("Ultra effect styling stays off by default and is suppressed by accessibility modes", () => {
  const css = readFileSync(new URL("../src/styles-ultra-effects.css", import.meta.url), "utf8");
  assert.match(css, /\.ultra-effects\s*\{\s*display:\s*none;/);
  assert.match(css, /html\[data-ultra-mode="on"\] \.ultra-effects/);
  assert.match(
    css,
    /@media\s*\(prefers-reduced-motion:\s*reduce\),\s*\(prefers-reduced-transparency:\s*reduce\),\s*\(prefers-contrast:\s*more\),\s*\(forced-colors:\s*active\)\s*\{[\s\S]*?html\[data-ultra-mode="on"\]\s+\.ultra-effects\s*\{\s*display:\s*none;/,
  );
});
