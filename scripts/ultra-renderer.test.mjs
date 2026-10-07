import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { createUltraRenderer } from "../src/lib/ultra-renderer.js";

function makeHarness({
  context = "webgl2",
  rect = { width: 320, height: 180 },
  gpuErrors = [],
} = {}) {
  const listeners = new Map();
  const rafs = new Map();
  const calls = {
    cancel: [],
    createProgram: 0,
    createVertexArray: 0,
    deleteProgram: [],
    deleteShader: [],
    deleteVertexArray: [],
    drawArrays: 0,
    loseContext: 0,
    removeListener: [],
    request: 0,
    viewport: [],
  };
  let nextId = 1;
  let now = 0;
  const gl = {
    VERTEX_SHADER: 1,
    FRAGMENT_SHADER: 2,
    COMPILE_STATUS: 3,
    LINK_STATUS: 4,
    NO_ERROR: 0,
    TRIANGLES: 5,
    createProgram() {
      calls.createProgram++;
      return { id: nextId++ };
    },
    createShader(kind) {
      return { id: nextId++, kind };
    },
    shaderSource() {},
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
    getExtension(name) {
      assert.equal(name, "WEBGL_lose_context");
      return {
        loseContext() {
          calls.loseContext++;
        },
      };
    },
    viewport(...args) {
      calls.viewport.push(args);
    },
    useProgram() {},
    bindVertexArray() {},
    uniform2f() {},
    uniform1f() {},
    uniform3f() {},
    uniform1i() {},
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
    getContext(type) {
      assert.equal(type, "webgl2");
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

  const original = {
    cancelAnimationFrame: globalThis.cancelAnimationFrame,
    devicePixelRatio: globalThis.devicePixelRatio,
    requestAnimationFrame: globalThis.requestAnimationFrame,
  };
  globalThis.devicePixelRatio = 1;
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
    restore() {
      for (const key of Object.keys(original)) {
        if (original[key] === undefined) delete globalThis[key];
        else globalThis[key] = original[key];
      }
    },
  };
}

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

  renderer.pause();
  harness.canvas.dispatch("webglcontextlost", { preventDefault() {} });
  harness.canvas.dispatch("webglcontextrestored");
  assert.equal(harness.calls.createProgram, 2);
  assert.equal(harness.rafs.size, 0);
  renderer.start();
  assert.equal(harness.calls.createProgram, 3);
  assert.equal(harness.rafs.size, 1);
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
    /@media\s*\(prefers-reduced-transparency:\s*reduce\),\s*\(prefers-contrast:\s*more\),\s*\(forced-colors:\s*active\)\s*\{[\s\S]*?html\[data-ultra-mode="on"\]\s+\.ultra-effects\s*\{\s*display:\s*none;/,
  );
});
