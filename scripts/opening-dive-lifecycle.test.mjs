import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";

const compile = (path) => ts.transpileModule(
  readFileSync(new URL(`../${path}`, import.meta.url), "utf8"),
  { compilerOptions: { module: ts.ModuleKind.CommonJS } },
).outputText;
const timing = {};
runInNewContext(compile("src/components/cinematic/opening-timing.ts"), { exports: timing });
const diveCode = compile("src/components/cinematic/opening-dive.ts");

class Surface extends EventTarget {
  listeners = new Map();
  addEventListener(type, callback, options) {
    super.addEventListener(type, callback, options);
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(callback);
  }
  removeEventListener(type, callback, options) {
    super.removeEventListener(type, callback, options);
    this.listeners.get(type)?.delete(callback);
  }
  listenerCount(type) { return this.listeners.get(type)?.size ?? 0; }
}

function runtime({ viewport = false, compiled = Promise.resolve() } = {}) {
  let now = 100;
  let nextId = 0;
  const frames = new Map();
  const timers = new Map();
  const canvases = [];
  const passes = [];
  const closedImages = [];
  const host = { children: [], append(canvas) { this.children.push(canvas); } };
  const document = new Surface();
  document.visibilityState = "visible";
  document.createElement = () => {
    const canvas = new Surface();
    canvas.width = 1;
    canvas.height = 1;
    canvas.animations = [];
    canvas.setAttribute = () => undefined;
    canvas.remove = () => { host.children = host.children.filter((child) => child !== canvas); };
    canvas.animate = () => {
      const animation = { cancelled: false, cancel() { this.cancelled = true; }, pause() {} };
      canvas.animations.push(animation);
      return animation;
    };
    canvases.push(canvas);
    return canvas;
  };
  const window = new Surface();
  Object.assign(window, {
    innerWidth: 1000,
    innerHeight: 800,
    matchMedia: () => ({ matches: false }),
    setTimeout(callback) { const id = ++nextId; timers.set(id, callback); return id; },
    clearTimeout: (id) => timers.delete(id),
    requestAnimationFrame(callback) { const id = ++nextId; frames.set(id, callback); return id; },
    cancelAnimationFrame: (id) => frames.delete(id),
  });
  if (viewport) window.visualViewport = Object.assign(new Surface(), { width: 1000, height: 800 });
  class ShaderPass {
    constructor(canvas) {
      this.canvas = canvas;
      this.lost = false;
      this.disposals = 0;
      this.draws = [];
      this.uniforms = {};
      this.size = { width: 0, height: 0 };
      passes.push(this);
    }
    compile() { return compiled; }
    set(name, ...values) { this.uniforms[name] = values; }
    draw() { this.draws.push({ ...this.uniforms }); }
    resize(width, height) {
      this.canvas.width = width;
      this.canvas.height = height;
      this.size = { width, height };
      return this.size;
    }
    dispose() { this.disposals++; this.lost = true; }
  }
  const engine = {};
  runInNewContext(diveCode, {
    exports: engine,
    window,
    document,
    navigator: {},
    performance: { now: () => now },
    require(name) {
      if (name === "./opening-timing") return timing;
      if (name === "@/lib/rendering-profile") return { hasConstrainedResources: () => false };
      if (name === "./opening-gl") return {
        ShaderPass,
        loadGlImage: async (source) => ({ source }),
        closeGlImage: (image) => { if (image) closedImages.push(image); },
        shouldDegrade: () => false,
      };
      return {};
    },
  });
  const landed = [];
  const fallbacks = [];
  return {
    engine, window, document, host, canvases, passes, frames, timers, closedImages, landed, fallbacks,
    setTime(value) { now = value; },
    async start(options = {}) {
      await engine.prepareOpeningDive("/prism.webp");
      return engine.runOpeningDive({
        host,
        logoRect: { left: 100, top: 100, width: 200, height: 100 },
        barHeight: 40,
        onLanded: () => landed.push(now),
        onFallback: (...args) => fallbacks.push(args),
        ...options,
      });
    },
  };
}

function loseContext(canvas) {
  const event = new Event("webglcontextlost", { cancelable: true });
  canvas.dispatchEvent(event);
  return event;
}

function assertReleased(ui) {
  assert.equal(ui.host.children.length, 0);
  assert.equal(ui.frames.size, 0);
  assert.equal(ui.window.listenerCount("resize"), 0);
  assert.equal(ui.window.visualViewport?.listenerCount("resize") ?? 0, 0);
  assert.equal(ui.document.listenerCount("visibilitychange"), 0);
  for (const canvas of ui.canvases) {
    assert.equal(canvas.listenerCount("webglcontextlost"), 0);
    assert.ok(canvas.animations.every((animation) => animation.cancelled));
  }
  for (const pass of ui.passes) assert.equal(pass.disposals, 1);
}

test("a live GPU loss hands the remaining flight to the owner without reporting landing", async () => {
  const ui = runtime({ viewport: true });
  const run = await ui.start();
  assert.equal(await run.ready, "webgl");
  ui.setTime(700);
  assert.equal(loseContext(ui.canvases[0]).defaultPrevented, true);
  assert.deepEqual(ui.fallbacks, [[0.6]]);
  assert.deepEqual(ui.landed, []);
  assert.equal(run.tier, "css");
  assert.equal(run.stats.fallback, "context-lost");
  assertReleased(ui);
  run.dispose();
  assertReleased(ui);
});

test("GPU loss after landing requests a static replacement exactly once", async () => {
  const ui = runtime({ viewport: true });
  const run = await ui.start();
  await run.ready;
  run.land();
  assert.equal(ui.landed.length, 1);
  assert.equal(ui.canvases[0].animations.length, 2, "fade and retained-frame push-in exist");
  ui.setTime(5000);
  loseContext(ui.canvases[0]);
  assert.deepEqual(ui.fallbacks, [[timing.OPENING_DIVE.glEnd, true]]);
  assert.equal(ui.landed.length, 1, "fallback must not notify covered again");
  loseContext(ui.canvases[0]);
  run.land();
  run.dispose();
  assert.equal(ui.fallbacks.length, 1);
  assert.equal(ui.landed.length, 1);
  assertReleased(ui);
});

test("a landed frame redraws after a window resize and ignores duplicate resize events", async () => {
  const ui = runtime();
  const run = await ui.start();
  await run.ready;
  run.land();
  const pass = ui.passes[0];
  const before = pass.draws.length;
  ui.window.innerWidth = 800;
  ui.window.dispatchEvent(new Event("resize"));
  assert.equal(pass.draws.length, before + 1);
  assert.equal(pass.draws.at(-1).uTime[0], timing.OPENING_DIVE.glEnd);
  assert.equal(pass.draws.at(-1).uWorld[0], 1);
  assert.equal(ui.canvases[0].width, 800);
  ui.window.dispatchEvent(new Event("resize"));
  assert.equal(pass.draws.length, before + 1);
  assert.equal(ui.frames.size, 0, "retaining the resized still must not restart a frame loop");
  assert.equal(ui.landed.length, 1);
  run.dispose();
  assertReleased(ui);
});

test("visualViewport-only resize restores the landed frame and disposal removes both listeners", async () => {
  const ui = runtime({ viewport: true });
  const run = await ui.start();
  await run.ready;
  run.land();
  const pass = ui.passes[0];
  const before = pass.draws.length;
  ui.window.visualViewport.height = 560;
  ui.window.visualViewport.dispatchEvent(new Event("resize"));
  assert.equal(pass.draws.length, before + 1);
  assert.equal(ui.canvases[0].height, 560);
  assert.equal(pass.draws.at(-1).uTime[0], timing.OPENING_DIVE.glEnd);
  run.dispose();
  ui.window.visualViewport.height = 600;
  ui.window.visualViewport.dispatchEvent(new Event("resize"));
  ui.window.dispatchEvent(new Event("resize"));
  assert.equal(pass.draws.length, before + 1);
  assertReleased(ui);
});

test("audit landing loss uses the final storyboard time without starting realtime work", async () => {
  const ui = runtime();
  const run = await ui.start({ audit: true });
  await run.ready;
  run.seek(timing.OPENING_DIVE.glEnd);
  loseContext(ui.canvases[0]);
  assert.deepEqual(ui.fallbacks, [[1.45, true]]);
  assert.equal(ui.landed.length, 1);
  assertReleased(ui);
});

test("disposal during compilation cannot append a canvas or revive listeners after compile settles", async () => {
  let resolveCompile;
  const ui = runtime({ compiled: new Promise((resolve) => { resolveCompile = resolve; }) });
  const run = await ui.start();
  for (let turn = 0; turn < 6; turn++) await Promise.resolve();
  assert.equal(ui.passes.length, 1);
  run.dispose();
  ui.engine.releaseOpeningDivePrepared();
  resolveCompile();
  await run.ready;
  assert.equal(ui.closedImages.length, 3);
  assert.equal(new Set(ui.closedImages).size, 3);
  assert.equal(ui.timers.size, 0);
  assert.deepEqual(ui.landed, []);
  assert.deepEqual(ui.fallbacks, []);
  assertReleased(ui);
});
