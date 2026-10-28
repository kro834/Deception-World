import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";

const source = readFileSync(new URL("../src/components/cinematic/opening-handoff.tsx", import.meta.url), "utf8");
const code = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
}).outputText;

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

function element() {
  const node = new Surface();
  Object.assign(node, {
    children: [], dataset: {}, animations: [], isConnected: true,
    style: {
      setProperty(name, value) { this[name] = value; },
      removeProperty(name) { delete this[name]; },
    },
    contains(child) { return this.children.includes(child); },
    querySelector() { return null; },
    querySelectorAll(selector) {
      if (selector === ":scope > *") return this.children;
      return this.children.filter((child) => child.dataset.openingHandoffLetterbox);
    },
    getAnimations() { return this.animations.filter((animation) => !animation.cancelled); },
    animate(keyframes, options) {
      let finish;
      const animation = {
        keyframes, options, cancelled: false, currentTime: 0,
        finished: new Promise((resolve) => { finish = resolve; }),
        cancel() { this.cancelled = true; finish(); },
        finish() { this.currentTime = options.duration; finish(); },
        pause() {},
      };
      this.animations.push(animation);
      return animation;
    },
    readyState: 1,
    pauses: 0,
    pause() { this.pauses++; },
    play() { return Promise.resolve(); },
  });
  return node;
}

function runtime() {
  const refs = [];
  const effects = [];
  let refIndex = 0;
  let effectIndex = 0;
  let pendingEffects = [];
  let nextId = 0;
  let mounted = true;
  const frames = new Map();
  const timers = new Map();
  const nodes = new Map();
  const runs = [];
  const covered = [];
  const completed = [];
  const window = Object.assign(new Surface(), {
    location: { search: "" }, innerWidth: 1000, innerHeight: 800,
    visualViewport: Object.assign(new Surface(), { width: 1000, height: 800, offsetLeft: 0, offsetTop: 0 }),
    setTimeout(callback) { const id = ++nextId; timers.set(id, callback); return id; },
    clearTimeout: (id) => timers.delete(id),
    requestAnimationFrame(callback) { const id = ++nextId; frames.set(id, callback); return id; },
    cancelAnimationFrame: (id) => frames.delete(id),
  });
  const document = Object.assign(new Surface(), { hidden: false, body: {} });
  const sameDeps = (a, b) => a && b && a.length === b.length && a.every((value, i) => Object.is(value, b[i]));
  const jsx = (type, props) => ({ type, props });
  const exports = {};
  runInNewContext(code, {
    exports, window, document, URLSearchParams, performance: { now: () => 0 },
    HTMLMediaElement: { HAVE_METADATA: 1 },
    require(name) {
      if (name === "react") return {
        useRef(initial) { return refs[refIndex++] ??= { current: initial }; },
        useLayoutEffect(callback, deps) {
          const index = effectIndex++;
          if (!sameDeps(effects[index]?.deps, deps)) pendingEffects.push({ index, callback, deps });
        },
      };
      if (name === "react-dom") return { createPortal: (tree) => tree };
      if (name === "react/jsx-runtime") return { jsx, jsxs: jsx };
      if (name === "./opening-timing") return { OPENING_DIVE: { cut: 0.95, glEnd: 1.45 } };
      if (name === "./opening-dive") return {
        runOpeningDive(options) {
          const run = {
            options, stats: {}, ready: Promise.resolve("webgl"), disposed: false, landed: false,
            dispose() { this.disposed = true; },
            land() {
              if (this.landed || this.disposed) return;
              this.landed = true;
              options.onLanded();
            },
          };
          runs.push(run);
          return run;
        },
      };
      throw new Error(`Unexpected dependency: ${name}`);
    },
  });
  function attach(tree, path = "root") {
    if (!tree || typeof tree !== "object") return null;
    const node = nodes.get(path) ?? element();
    nodes.set(path, node);
    node.isConnected = mounted;
    for (const [key, value] of Object.entries(tree.props ?? {})) {
      if (key.startsWith("data-")) {
        const field = key.slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
        node.dataset[field] = value === true ? "" : String(value);
      }
    }
    if (tree.props?.ref) tree.props.ref.current = node;
    node.children = [tree.props?.children].flat(2).map((child, i) => attach(child, `${path}/${i}`)).filter(Boolean);
    return node;
  }
  return {
    window, document, runs, covered, completed, frames, timers,
    get root() { return nodes.get("root"); },
    get world() { return nodes.get("root")?.children.find((node) => "openingHandoffWorld" in node.dataset); },
    render(snapshot, { replacePortal = false } = {}) {
      if (replacePortal) {
        for (const node of nodes.values()) node.isConnected = false;
        nodes.clear();
      }
      refIndex = 0;
      effectIndex = 0;
      const tree = exports.OpeningHandoffLayer({ snapshot, onCovered: (token) => covered.push(token), onComplete: (token) => completed.push(token) });
      if (tree) attach(tree);
      else for (const node of nodes.values()) node.isConnected = false;
      const commit = pendingEffects;
      pendingEffects = [];
      for (const { index, callback, deps } of commit) {
        effects[index]?.cleanup?.();
        effects[index] = { deps, cleanup: callback() };
      }
    },
    paint() {
      const pending = [...frames];
      frames.clear();
      for (const [, callback] of pending) callback(0);
    },
    unmount() {
      mounted = false;
      for (const effect of effects) effect?.cleanup?.();
      for (const node of nodes.values()) node.isConnected = false;
      for (const ref of refs) if (ref.current?.isConnected === false) ref.current = null;
    },
  };
}

const covering = (token = 1) => ({
  token, phase: "covering",
  source: {
    logoRect: { left: 100, top: 100, width: 200, height: 100 },
    videoCurrentTime: 0, videoPlaying: false, reducedMotion: false, economy: false,
  },
});
const flush = async () => { for (let turn = 0; turn < 8; turn++) await Promise.resolve(); };

function assertStaticLanding(ui) {
  assert.equal(ui.root.dataset.openingHandoffTier, "css");
  assert.equal(ui.root.dataset.openingHandoffLanding, "static");
  assert.equal(ui.root.style.background, "#04080f");
  assert.equal(ui.world.style.opacity, "1");
  assert.equal(ui.world.style.transform, "none");
  assert.equal(ui.world.style.visibility, "visible");
  for (const layer of ui.root.children) {
    if (layer !== ui.world) assert.equal(layer.style.visibility, "hidden");
  }
}

test("an early GPU loss continues the CSS flight without claiming a static landing", async () => {
  const ui = runtime();
  ui.render(covering());
  await flush();
  ui.runs[0].options.onFallback(0.2);
  assert.equal(ui.root.dataset.openingHandoffTier, "css");
  assert.equal(ui.root.dataset.openingHandoffLanding, undefined);
  assert.equal(ui.root.animations.length, 1);
  assert.equal(ui.root.animations[0].currentTime, 200);
  // The flight, and its landing settle scheduled on the compositor after it.
  assert.equal(ui.world.animations.length, 2);
  assert.ok(ui.world.animations[1].options.delay > 0);
  assert.deepEqual(ui.covered, []);
  assert.equal(ui.timers.size, 1);
  ui.unmount();
  assert.equal(ui.timers.size, 0);
  assert.ok(ui.root.animations.every((animation) => animation.cancelled));
});

test("GPU loss after covering has landed replaces the retained frame without restarting the dive", async () => {
  const ui = runtime();
  ui.render(covering());
  await flush();
  const run = ui.runs[0];
  run.land();
  ui.root.style.opacity = "0.73";
  run.options.onFallback(1.45, true);
  assertStaticLanding(ui);
  assert.equal(ui.root.style.opacity, "0.73", "fallback must preserve the owner's opacity");
  assert.deepEqual(ui.covered, [1]);
  assert.deepEqual(ui.completed, []);
  assert.equal(ui.runs.length, 1);
  assert.equal(ui.timers.size, 0, "no second flight or completion timer starts");
  assert.equal(ui.root.animations.length, 0);
  ui.unmount();
});

test("the old covering callback protects a GPU loss during arrival without cancelling its fade", async () => {
  const ui = runtime();
  const snapshot = covering();
  ui.render(snapshot);
  await flush();
  const run = ui.runs[0];
  run.land();
  ui.render({ ...snapshot, phase: "arriving" });
  const arrival = ui.root.animations.at(-1);
  arrival.currentTime = 240;
  run.options.onFallback(1.45, true);
  assertStaticLanding(ui);
  assert.equal(arrival.cancelled, false);
  assert.equal(arrival.currentTime, 240);
  assert.equal(ui.root.animations.length, 1, "no replacement root animation masks the arrival fade");
  assert.deepEqual(ui.covered, [1]);
  assert.deepEqual(ui.completed, []);
  ui.unmount();
  assert.equal(arrival.cancelled, true);
  assert.equal(run.disposed, true);
});

test("a replaced token ignores its old callback and clears static landing overrides before the new dive", async () => {
  const ui = runtime();
  ui.render(covering(1));
  await flush();
  const old = ui.runs[0];
  old.land();
  old.options.onFallback(1.45, true);
  ui.render(covering(2));
  await flush();
  assert.equal(old.disposed, true);
  assert.equal(ui.root.dataset.openingHandoffTier, "webgl");
  assert.equal(ui.root.dataset.openingHandoffLanding, undefined);
  assert.equal(ui.root.style.background, undefined);
  assert.equal(ui.world.style.opacity, undefined);
  for (const layer of ui.root.children) assert.equal(layer.style.visibility, undefined);
  old.options.onFallback(1.45, true);
  assert.equal(ui.root.dataset.openingHandoffTier, "webgl");
  assert.equal(ui.root.style.background, undefined);
  assert.deepEqual(ui.covered, [1]);
  ui.unmount();
});

test("a retained callback cannot alter a replacement portal or a disconnected root", async () => {
  const ui = runtime();
  const snapshot = covering();
  ui.render(snapshot);
  await flush();
  const run = ui.runs[0];
  run.land();
  const previousRoot = ui.root;
  ui.render({ ...snapshot, phase: "arriving" }, { replacePortal: true });
  run.options.onFallback(1.45, true);
  assert.equal(ui.root.style.background, undefined);
  assert.equal(previousRoot.style.background, undefined);
  ui.unmount();
  run.options.onFallback(1.45, true);
  assert.equal(previousRoot.style.background, undefined);
});

test("viewport changes still update a settled covering root and cleanup cancels pending updates", async () => {
  const ui = runtime();
  ui.render(covering());
  await flush();
  ui.runs[0].land();
  ui.window.visualViewport.height = 560;
  ui.window.visualViewport.offsetTop = 30;
  ui.window.visualViewport.dispatchEvent(new Event("resize"));
  ui.window.visualViewport.dispatchEvent(new Event("scroll"));
  assert.equal(ui.frames.size, 1, "viewport updates share one pending frame");
  ui.paint();
  assert.equal(ui.root.style["--opening-vv-height"], "560px");
  assert.equal(ui.root.style["--opening-vv-top"], "30px");
  ui.window.dispatchEvent(new Event("resize"));
  assert.equal(ui.frames.size, 1);
  ui.unmount();
  assert.equal(ui.frames.size, 0);
  assert.equal(ui.timers.size, 0);
  for (const type of ["resize", "orientationchange", "pagehide"]) assert.equal(ui.window.listenerCount(type), 0);
  for (const type of ["resize", "scroll"]) assert.equal(ui.window.visualViewport.listenerCount(type), 0);
  assert.equal(ui.document.listenerCount("visibilitychange"), 0);
});
