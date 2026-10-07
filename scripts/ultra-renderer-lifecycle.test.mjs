import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const source = readFileSync(
  new URL("../src/components/ultra/ultra-effects.tsx", import.meta.url),
  "utf8",
);
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    jsx: ts.JsxEmit.ReactJSX,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const jsx = (type, props, key) => ({ type, props, key });
const jsxRuntime = { jsx, jsxs: jsx };

function deferred() {
  let resolve;
  const promise = new Promise((ok) => {
    resolve = ok;
  });
  return { promise, resolve };
}

async function flushPromises() {
  for (let index = 0; index < 8; index++) await Promise.resolve();
}

function artwork(revision = 1) {
  return {
    revision,
    source: `/artwork-${revision}.webp`,
    host: { isConnected: true },
    image: { isConnected: true, complete: true, naturalWidth: 1200 },
  };
}

const visibleGeometry = {
  geometry: { left: -12, top: -12, width: 424, height: 324 },
  visible: true,
  rect: { left: 100, top: 60, width: 400, height: 300 },
};

function mount({ blockedInitially = false, deferImport = false } = {}) {
  const root = {
    dataset: {},
    getAttribute(name) {
      const key = name
        .replace(/^data-/, "")
        .replace(/-([a-z])/g, (_match, letter) => letter.toUpperCase());
      return this.dataset[key] ?? null;
    },
  };
  const document = {
    documentElement: root,
    querySelector: () => null,
  };
  const windowListeners = new Map();
  const mediaQueries = [];
  const browser = {
    matchMedia(query) {
      const listeners = new Set();
      const entry = {
        query,
        matches: false,
        addEventListener: (_name, listener) => listeners.add(listener),
        removeEventListener: (_name, listener) => listeners.delete(listener),
        listeners,
      };
      mediaQueries.push(entry);
      return entry;
    },
    addEventListener(name, listener) {
      const listeners = windowListeners.get(name) ?? new Set();
      listeners.add(listener);
      windowListeners.set(name, listeners);
    },
    removeEventListener(name, listener) {
      windowListeners.get(name)?.delete(listener);
    },
  };
  const calls = {
    allocations: [],
    dispose: 0,
    geometryStops: 0,
    material: [],
    pause: 0,
    pointers: [],
    resize: 0,
    start: 0,
    targetStops: 0,
    visibilityStops: 0,
  };
  const pendingImport = deferImport ? deferred() : null;
  let moduleLoads = 0;
  let targetCallback;
  let geometryCallback;
  let visibilityCallback;
  let blocked = blockedInitially;
  let nextCanvasId = 1;
  let outerTree;
  let portal;
  let stage;
  let canvas;
  let lastProps;
  let currentScope;
  let cursor = 0;
  const outerScope = { state: [], refs: [], effects: [], pending: new Set() };
  let frameScope = null;
  let frameKey = null;

  const rendererModule = {
    createUltraRenderer(targetCanvas, options) {
      const instance = {
        diagnostics: { ready: false, lost: false },
        disposeCount: 0,
        getDiagnostics() {
          return { ...this.diagnostics };
        },
        pause() {
          calls.pause++;
        },
        start() {
          calls.start++;
        },
        resize() {
          calls.resize++;
        },
        dispose() {
          this.disposeCount++;
          calls.dispose++;
        },
        setPointer(x, y) {
          calls.pointers.push([x, y]);
        },
        setTheme() {},
      };
      calls.allocations.push({ canvas: targetCanvas, options, instance });
      return instance;
    },
  };
  const react = {
    memo: (component) => component,
    useState(initial) {
      const index = cursor++;
      if (!(index in currentScope.state)) currentScope.state[index] = initial;
      const scope = currentScope;
      return [
        scope.state[index],
        (value) => {
          scope.state[index] = typeof value === "function" ? value(scope.state[index]) : value;
        },
      ];
    },
    useRef(initial) {
      const index = cursor++;
      if (!currentScope.refs[index]) currentScope.refs[index] = { current: initial };
      return currentScope.refs[index];
    },
    useEffect(callback, deps) {
      const index = cursor++;
      const current = currentScope.effects[index];
      if (!current || deps.some((dependency, offset) => dependency !== current.deps[offset])) {
        currentScope.effects[index] = { callback, cleanup: current?.cleanup, deps };
        currentScope.pending.add(index);
      }
    },
  };
  const context = vm.createContext({
    document,
    window: browser,
    exports: {},
    MutationObserver: class {
      observe() {}
      disconnect() {}
    },
    require(name) {
      if (name === "react/jsx-runtime") return jsxRuntime;
      if (name === "react") return react;
      if (name === "react-dom") {
        return { createPortal: (children, container) => ({ children, container }) };
      }
      if (name === "@/lib/ultra-artwork-target.js") {
        return {
          ULTRA_FRAME_GUTTER: 12,
          watchUltraArtworkTarget(callback) {
            targetCallback = callback;
            return () => {
              calls.targetStops++;
              targetCallback = undefined;
            };
          },
          watchUltraArtworkGeometry(_target, callback) {
            geometryCallback = callback;
            return () => {
              calls.geometryStops++;
              geometryCallback = undefined;
            };
          },
        };
      }
      if (name === "@/lib/ultra-mode-visibility.js") {
        return {
          isUltraSceneBlocked: () => blocked,
          watchUltraSceneVisibility(callback) {
            visibilityCallback = callback;
            callback(blocked);
            return () => {
              calls.visibilityStops++;
              visibilityCallback = undefined;
            };
          },
        };
      }
      if (name === "@/lib/ultra-renderer.js") {
        moduleLoads++;
        return pendingImport?.promise ?? rendererModule;
      }
      throw new Error(`Unexpected dependency: ${name}`);
    },
  });
  vm.runInContext(compiled, context);
  const component = context.exports.UltraEffects;

  function flushEffects(scope) {
    for (const index of [...scope.pending].sort((a, b) => a - b)) {
      scope.pending.delete(index);
      const effect = scope.effects[index];
      effect.cleanup?.();
      effect.cleanup = effect.callback();
    }
  }
  function cleanupScope(scope) {
    if (!scope) return;
    for (const effect of scope.effects) effect?.cleanup?.();
    scope.effects = [];
    scope.pending.clear();
  }
  function render(props = lastProps) {
    lastProps = props;
    currentScope = outerScope;
    cursor = 0;
    outerTree = component(props);
    flushEffects(outerScope);
    if (!outerTree) {
      cleanupScope(frameScope);
      frameScope = null;
      frameKey = null;
      portal = stage = canvas = null;
      return null;
    }
    if (frameKey !== outerTree.key) {
      cleanupScope(frameScope);
      frameScope = { state: [], refs: [], effects: [], pending: new Set() };
      frameKey = outerTree.key;
      stage = { dataset: {}, style: {} };
      canvas = { nodeName: "CANVAS", identity: nextCanvasId++ };
    }
    currentScope = frameScope;
    cursor = 0;
    portal = outerTree.type(outerTree.props);
    const span = portal.children;
    span.props.ref.current = stage;
    span.props.children[0].props.ref.current = canvas;
    flushEffects(frameScope);
    return portal;
  }

  return {
    calls,
    mediaQueries,
    pendingImport,
    rendererModule,
    root,
    render,
    setTarget(target) {
      targetCallback?.(target);
    },
    geometry(value) {
      geometryCallback?.(value);
    },
    visibility(value) {
      blocked = value;
      visibilityCallback?.(value);
    },
    fireWindow(name, event) {
      for (const listener of windowListeners.get(name) ?? []) listener(event);
    },
    fireStatus(status) {
      calls.allocations.at(-1)?.options.onStatus(status);
    },
    fireMaterial(status) {
      calls.allocations.at(-1)?.options.onMaterialState(status);
      calls.material.push(status);
    },
    get portal() {
      return portal;
    },
    get stage() {
      return stage;
    },
    get canvas() {
      return canvas;
    },
    get moduleLoads() {
      return moduleLoads;
    },
    get listenerCounts() {
      return {
        window: [...windowListeners.values()].reduce((total, set) => total + set.size, 0),
        media: mediaQueries.reduce((total, entry) => total + entry.listeners.size, 0),
      };
    },
    cleanup() {
      cleanupScope(frameScope);
      frameScope = null;
      cleanupScope(outerScope);
    },
  };
}

test("no target or an unloaded, hidden target cannot import or allocate WebGL", async () => {
  const f = mount();
  const props = { enabled: true, motionAllowed: true };
  assert.equal(f.render(props), null);
  assert.equal(f.moduleLoads, 0);
  const target = artwork();
  target.image.complete = false;
  f.setTarget(target);
  const portal = f.render();
  assert.equal(portal.container, target.host);
  f.geometry(visibleGeometry);
  await flushPromises();
  assert.equal(f.stage.style.visibility, "hidden");
  assert.equal(f.moduleLoads, 0);
  target.image.complete = true;
  f.geometry({ ...visibleGeometry, visible: false });
  assert.equal(f.moduleLoads, 0);
  f.cleanup();
});

test("one loaded visible artwork receives a local 12px portal and starts GPU after import", async () => {
  const f = mount();
  const props = { enabled: true, motionAllowed: true, quality: "cinema" };
  f.render(props);
  const target = artwork();
  f.setTarget(target);
  const portal = f.render();
  assert.equal(portal.container, target.host);
  assert.equal(portal.children.props.className, "ultra-effects");
  assert.equal(portal.children.props["aria-hidden"], "true");
  assert.equal(portal.children.props["data-ultra-quality"], "cinema");
  f.geometry(visibleGeometry);
  assert.deepEqual(
    [f.stage.style.left, f.stage.style.top, f.stage.style.width, f.stage.style.height],
    ["-12px", "-12px", "424px", "324px"],
  );
  await flushPromises();
  assert.equal(f.calls.allocations.length, 1);
  assert.equal(f.calls.allocations[0].canvas, f.canvas);
  assert.equal(f.calls.allocations[0].options.quality, "cinema");
  assert.equal(f.calls.allocations[0].options.frameWidthPx, 12);
  assert.equal(f.calls.start, 1);
  f.cleanup();
});

test("local geometry updates resize and pointer input uses the image rect", async () => {
  const f = mount();
  f.render({ enabled: true, motionAllowed: true });
  f.setTarget(artwork());
  f.render();
  f.geometry(visibleGeometry);
  await flushPromises();
  f.fireWindow("pointermove", { clientX: 300, clientY: 210, pointerType: "mouse" });
  assert.deepEqual(f.calls.pointers.at(-1), [0, 0]);
  const before = f.calls.resize;
  f.geometry({
    geometry: { left: -12, top: -12, width: 524, height: 324 },
    visible: true,
    rect: { left: 100, top: 60, width: 500, height: 300 },
  });
  assert.equal(f.calls.resize, before + 1);
  assert.equal(f.stage.style.width, "524px");
  f.fireWindow("pointermove", { clientX: 600, clientY: 360, pointerType: "touch" });
  assert.equal(f.calls.pointers.length, 1);
  f.cleanup();
});

test("temporary menu and offscreen gates pause and resume the same renderer", async () => {
  const f = mount();
  f.render({ enabled: true, motionAllowed: true });
  f.setTarget(artwork());
  f.render();
  f.geometry(visibleGeometry);
  await flushPromises();
  const instance = f.calls.allocations[0].instance;
  instance.diagnostics.ready = true;
  f.fireStatus("ready");
  assert.equal(f.stage.dataset.ultraRenderer, "gpu");
  f.visibility(true);
  assert.equal(f.stage.style.visibility, "hidden");
  assert.equal(f.calls.pause, 1);
  f.visibility(false);
  assert.equal(f.calls.allocations.length, 1);
  assert.equal(f.calls.dispose, 0);
  f.geometry({ ...visibleGeometry, visible: false });
  assert.equal(f.calls.pause, 2);
  f.geometry(visibleGeometry);
  assert.equal(f.calls.allocations.length, 1);
  assert.equal(f.calls.start, 3);
  f.cleanup();
  assert.equal(f.calls.dispose, 1);
});

test("GPU ready and baked material are independent stage signals", async () => {
  const f = mount();
  f.render({ enabled: true, motionAllowed: true });
  f.setTarget(artwork());
  f.render();
  f.geometry(visibleGeometry);
  await flushPromises();
  assert.equal(f.stage.dataset.ultraRenderer, "starting");
  f.fireMaterial("pending");
  assert.equal(f.stage.dataset.ultraMaterial, "pending");
  assert.notEqual(f.stage.dataset.ultraRenderer, "gpu");
  f.fireStatus("ready");
  assert.equal(f.stage.dataset.ultraRenderer, "gpu");
  f.fireMaterial("fallback");
  assert.equal(f.stage.dataset.ultraMaterial, "fallback");
  assert.equal(f.stage.dataset.ultraRenderer, "gpu");
  f.cleanup();
});

test("revision and quality changes each dispose the prior renderer and use a fresh canvas", async () => {
  const f = mount();
  const props = { enabled: true, motionAllowed: true, quality: "high" };
  f.render(props);
  f.setTarget(artwork(1));
  f.render();
  f.geometry(visibleGeometry);
  await flushPromises();
  const firstCanvas = f.canvas;
  assert.equal(f.calls.allocations.length, 1);
  f.setTarget(artwork(2));
  f.render();
  f.geometry(visibleGeometry);
  await flushPromises();
  assert.equal(f.calls.dispose, 1);
  assert.equal(f.calls.allocations.length, 2);
  assert.notEqual(f.canvas, firstCanvas);
  const secondCanvas = f.canvas;
  f.render({ ...props, quality: "cinema" });
  f.geometry(visibleGeometry);
  await flushPromises();
  assert.equal(f.calls.dispose, 2);
  assert.equal(f.calls.allocations.length, 3);
  assert.notEqual(f.canvas, secondCanvas);
  assert.equal(f.calls.allocations.at(-1).options.quality, "cinema");
  f.cleanup();
  assert.equal(f.calls.dispose, 3);
});

test("late renderer import after target replacement allocates only the latest target", async () => {
  const f = mount({ deferImport: true });
  f.render({ enabled: true, motionAllowed: true });
  f.setTarget(artwork(1));
  f.render();
  f.geometry(visibleGeometry);
  await flushPromises();
  assert.equal(f.moduleLoads, 1);
  f.setTarget(artwork(2));
  f.render();
  f.geometry(visibleGeometry);
  await flushPromises();
  assert.equal(f.moduleLoads, 2);
  assert.equal(f.calls.allocations.length, 0);
  f.pendingImport.resolve(f.rendererModule);
  await flushPromises();
  assert.equal(f.calls.allocations.length, 1);
  assert.equal(f.calls.allocations[0].canvas, f.canvas);
  f.cleanup();
});

test("OFF disposes the renderer and releases target, geometry, visibility and window listeners", async () => {
  const f = mount();
  const props = { enabled: true, motionAllowed: true };
  f.render(props);
  f.setTarget(artwork());
  f.render();
  f.geometry(visibleGeometry);
  await flushPromises();
  assert.equal(f.calls.allocations.length, 1);
  assert.ok(f.listenerCounts.window > 0);
  assert.ok(f.listenerCounts.media > 0);
  assert.equal(f.render({ ...props, enabled: false }), null);
  assert.equal(f.calls.dispose, 1);
  assert.equal(f.calls.targetStops, 1);
  assert.equal(f.calls.geometryStops, 1);
  assert.equal(f.calls.visibilityStops, 1);
  assert.equal(f.listenerCounts.window, 0);
  assert.equal(f.listenerCounts.media, 0);
  assert.equal("ultraRenderer" in f.root.dataset, false);
  f.cleanup();
});
