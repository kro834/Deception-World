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

function createDeferred() {
  let resolve;
  let reject;
  const promise = new Promise((ok, fail) => {
    resolve = ok;
    reject = fail;
  });
  return { promise, resolve, reject };
}

async function flushPromises() {
  for (let index = 0; index < 6; index++) await Promise.resolve();
}

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
  const stage = { dataset: {}, style: { getPropertyValue: () => "" } };
  let canvas = { nodeName: "CANVAS", identity: 0 };
  let canvasKey;
  let nextCanvasIdentity = 1;
  let blocked = blockedInitially;
  let visibilityCallback;
  let visibilityStops = 0;
  let observerInstance;
  const windowListeners = new Map();
  const mediaQueries = [];
  const rendererCalls = {
    allocations: [],
    instances: [],
    dispose: 0,
    pause: 0,
    start: 0,
    resize: 0,
  };
  const statuses = [];
  const pendingImport = deferImport ? createDeferred() : null;
  let rendererModuleLoads = 0;
  let diagnostics = { lost: false, ready: false };

  let rendererOptions;
  const rendererModule = {
    createUltraRenderer(target, options) {
      rendererCalls.allocations.push({ target, quality: options.quality, options });
      rendererOptions = options;
      const instance = {
        disposeCount: 0,
        getDiagnostics: () => ({ ...diagnostics }),
        pause() {
          rendererCalls.pause++;
        },
        start() {
          rendererCalls.start++;
        },
        resize() {
          rendererCalls.resize++;
        },
        dispose() {
          instance.disposeCount++;
          rendererCalls.dispose++;
        },
        setPointer() {},
        setTheme() {},
      };
      rendererCalls.instances.push(instance);
      return instance;
    },
  };
  const mediaListenerSets = [];
  const browser = {
    innerWidth: 1280,
    innerHeight: 800,
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
      mediaListenerSets.push(listeners);
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
  const document = {
    documentElement: root,
    querySelector: () => null,
  };

  const refs = [];
  const effects = [];
  const pendingEffects = new Set();
  let hookCursor = 0;
  const react = {
    memo: (component) => component,
    useRef(initial) {
      const index = hookCursor++;
      if (!refs[index]) refs[index] = { current: initial };
      return refs[index];
    },
    useEffect(callback, deps) {
      const index = hookCursor++;
      const current = effects[index];
      if (!current || deps.some((dependency, offset) => dependency !== current.deps[offset])) {
        effects[index] = { callback, cleanup: current?.cleanup, deps };
        pendingEffects.add(index);
      }
    },
  };
  const context = vm.createContext({
    document,
    window: browser,
    exports: {},
    MutationObserver: class {
      constructor(callback) {
        observerInstance = { callback, disconnected: false, observed: [] };
      }
      observe(target, options) {
        observerInstance.observed.push({ target, options });
      }
      disconnect() {
        observerInstance.disconnected = true;
      }
    },
    require(name) {
      if (name === "react/jsx-runtime") return jsxRuntime;
      if (name === "react") return react;
      if (name === "@/lib/ultra-mode-visibility.js") {
        return {
          isUltraSceneBlocked: () => blocked,
          watchUltraSceneVisibility(callback) {
            visibilityCallback = callback;
            callback(blocked);
            return () => {
              visibilityStops++;
              visibilityCallback = undefined;
            };
          },
        };
      }
      if (name === "@/lib/ultra-renderer.js") {
        rendererModuleLoads++;
        return pendingImport?.promise ?? rendererModule;
      }
      throw new Error(`Unexpected dependency: ${name}`);
    },
  });
  vm.runInContext(compiled, context);
  const component = context.exports.UltraEffects;

  function render(props) {
    hookCursor = 0;
    const tree = component(props);
    if (tree) {
      tree.props.ref.current = stage;
      const canvasNode = tree.props.children[0];
      if (canvasNode.key !== canvasKey) {
        canvasKey = canvasNode.key;
        canvas = { nodeName: "CANVAS", identity: nextCanvasIdentity++ };
      }
      canvasNode.props.ref.current = canvas;
    }
    for (const index of [...pendingEffects].sort((a, b) => a - b)) {
      pendingEffects.delete(index);
      const effect = effects[index];
      effect.cleanup?.();
      effect.cleanup = effect.callback();
    }
    return tree;
  }

  return {
    get canvas() {
      return canvas;
    },
    context,
    mediaQueries,
    observer: () => observerInstance,
    rendererCalls,
    rendererModuleLoads: () => rendererModuleLoads,
    root,
    stage,
    statuses,
    visibility(blockedState) {
      blocked = blockedState;
      visibilityCallback?.(blockedState);
    },
    fireStatus(status) {
      rendererOptions?.onStatus(status);
    },
    setDiagnostics(next) {
      diagnostics = { ...diagnostics, ...next };
    },
    render,
    cleanup() {
      for (const effect of effects) effect?.cleanup?.();
    },
    get listenerCounts() {
      return {
        media: mediaListenerSets.reduce((total, listeners) => total + listeners.size, 0),
        window: [...windowListeners.values()].reduce(
          (total, listeners) => total + listeners.size,
          0,
        ),
        visibilityStops,
      };
    },
    get pendingImport() {
      return pendingImport;
    },
    rendererModule,
  };
}

test("initially blocked scene does not import or allocate a WebGL renderer", () => {
  const f = mount({ blockedInitially: true });
  const tree = f.render({
    enabled: true,
    motionAllowed: true,
    onStatus: (status) => f.statuses.push(status),
  });
  assert.equal(tree.props.className, "ultra-effects");
  assert.equal(f.rendererModuleLoads(), 0);
  assert.equal(f.rendererCalls.allocations.length, 0);
  assert.equal(f.stage.dataset.ultraRenderer, "paused");
  assert.deepEqual(f.statuses, ["paused"]);
  f.cleanup();
});

test("a blocker set while the lazy renderer import is pending prevents context allocation", async () => {
  const f = mount({ deferImport: true });
  f.render({ enabled: true, motionAllowed: true });
  await flushPromises();
  assert.equal(f.rendererModuleLoads(), 1);
  f.visibility(true);
  f.pendingImport.resolve(f.rendererModule);
  await flushPromises();
  assert.equal(f.rendererCalls.allocations.length, 0);
  assert.equal(f.stage.dataset.ultraRenderer, "paused");
  f.cleanup();
});

test("resolving the lazy import after unmount never allocates a renderer", async () => {
  const f = mount({ deferImport: true });
  f.render({ enabled: true, motionAllowed: true });
  await flushPromises();
  assert.equal(f.rendererModuleLoads(), 1);
  f.cleanup();
  f.pendingImport.resolve(f.rendererModule);
  await flushPromises();
  assert.equal(f.rendererCalls.allocations.length, 0);
  assert.equal(f.listenerCounts.window, 0);
  assert.equal(f.listenerCounts.media, 0);
});

test("temporary UI blocking pauses and resumes the existing renderer without disposing it", async () => {
  const f = mount();
  f.render({ enabled: true, motionAllowed: true });
  await flushPromises();
  assert.equal(f.rendererCalls.allocations.length, 1);
  assert.equal(f.rendererCalls.start, 1);
  f.setDiagnostics({ ready: true });
  f.fireStatus("ready");
  assert.equal(f.stage.dataset.ultraRenderer, "gpu");

  f.visibility(true);
  assert.equal(f.rendererCalls.pause, 1);
  assert.equal(f.rendererCalls.dispose, 0);
  assert.equal(f.stage.dataset.ultraRenderer, "paused");
  f.visibility(false);
  assert.equal(f.rendererCalls.start, 2);
  assert.equal(f.rendererCalls.dispose, 0);
  assert.equal(f.stage.dataset.ultraRenderer, "gpu");
  f.cleanup();
  assert.equal(f.rendererCalls.dispose, 1);
});

test("GPU paint stays hidden until first draw is ready", async () => {
  const f = mount();
  f.render({ enabled: true, motionAllowed: true });
  await flushPromises();
  assert.equal(f.stage.dataset.ultraRenderer, "starting");
  assert.notEqual(f.stage.dataset.ultraRenderer, "gpu");
  f.fireStatus("ready");
  assert.equal(f.stage.dataset.ultraRenderer, "gpu");
  f.cleanup();
});

test("lost renderer remains paused on resume until restoration and its first redraw", async () => {
  const f = mount();
  f.render({ enabled: true, motionAllowed: true });
  await flushPromises();
  f.setDiagnostics({ ready: true });
  f.fireStatus("ready");
  f.setDiagnostics({ lost: true });
  f.fireStatus("context-lost");
  assert.equal(f.stage.dataset.ultraRenderer, "paused");

  f.visibility(true);
  f.visibility(false);
  assert.equal(f.stage.dataset.ultraRenderer, "paused");
  assert.equal(f.rendererCalls.dispose, 0);
  f.setDiagnostics({ lost: false, ready: false });
  f.visibility(true);
  f.visibility(false);
  assert.equal(f.stage.dataset.ultraRenderer, "starting");
  f.fireStatus("ready");
  assert.equal(f.stage.dataset.ultraRenderer, "gpu");
  f.cleanup();
});

test("OFF cleanup disposes the renderer and releases all registered listeners", async () => {
  const f = mount();
  const props = { enabled: true, motionAllowed: true };
  f.render(props);
  await flushPromises();
  assert.equal(f.rendererCalls.allocations.length, 1);
  assert.ok(f.listenerCounts.window > 0);
  assert.ok(f.listenerCounts.media > 0);
  const nextTree = f.render({ ...props, enabled: false });
  assert.equal(nextTree, null);
  assert.equal(f.rendererCalls.dispose, 1);
  assert.equal(f.observer().disconnected, true);
  assert.equal(f.listenerCounts.window, 0);
  assert.equal(f.listenerCounts.media, 0);
  assert.equal(f.listenerCounts.visibilityStops, 1);
  assert.equal("ultraRenderer" in f.root.dataset, false);
});

test("renderer quality defaults to high and an explicit cinema choice reaches the renderer", async () => {
  const high = mount();
  const highTree = high.render({ enabled: true, motionAllowed: true });
  assert.equal(highTree.props["data-ultra-quality"], "high");
  assert.equal(highTree.props.children[0].key, "high");
  await flushPromises();
  assert.equal(high.rendererCalls.allocations.length, 1);
  assert.equal(high.rendererCalls.allocations[0].quality, "high");
  high.cleanup();

  const cinema = mount();
  const cinemaTree = cinema.render({ enabled: true, motionAllowed: true, quality: "cinema" });
  assert.equal(cinemaTree.props["data-ultra-quality"], "cinema");
  assert.equal(cinemaTree.props.children[0].key, "cinema");
  await flushPromises();
  assert.equal(cinema.rendererCalls.allocations.length, 1);
  assert.equal(cinema.rendererCalls.allocations[0].quality, "cinema");
  cinema.cleanup();
});

test("changing quality disposes the old renderer once and allocates the new quality once", async () => {
  const f = mount();
  const base = { enabled: true, motionAllowed: true };
  const highTree = f.render(base);
  assert.equal(highTree.props.children[0].key, "high");
  await flushPromises();
  assert.equal(f.rendererCalls.allocations.length, 1);
  assert.equal(f.rendererCalls.allocations[0].quality, "high");
  const oldCanvas = f.rendererCalls.allocations[0].target;

  const cinemaTree = f.render({ ...base, quality: "cinema" });
  assert.equal(cinemaTree.props.children[0].key, "cinema");
  assert.equal(f.rendererCalls.instances[0].disposeCount, 1);
  await flushPromises();
  assert.equal(f.rendererCalls.allocations.length, 2);
  assert.equal(f.rendererCalls.allocations[1].quality, "cinema");
  assert.notEqual(f.rendererCalls.allocations[1].target, oldCanvas);
  assert.equal(f.rendererCalls.dispose, 1);

  f.cleanup();
  assert.deepEqual(
    f.rendererCalls.instances.map((instance) => instance.disposeCount),
    [1, 1],
  );
});

test("a quality change during lazy import allocates only the latest cinema renderer", async () => {
  const f = mount({ deferImport: true });
  const base = { enabled: true, motionAllowed: true };
  const highTree = f.render(base);
  assert.equal(highTree.props["data-ultra-quality"], "high");
  await flushPromises();
  assert.equal(f.rendererModuleLoads(), 1);

  const cinemaTree = f.render({ ...base, quality: "cinema" });
  assert.equal(cinemaTree.props["data-ultra-quality"], "cinema");
  await flushPromises();
  assert.equal(f.rendererModuleLoads(), 2);
  assert.equal(f.rendererCalls.allocations.length, 0);

  f.pendingImport.resolve(f.rendererModule);
  await flushPromises();
  assert.equal(f.rendererCalls.allocations.length, 1);
  assert.equal(f.rendererCalls.allocations[0].quality, "cinema");
  f.cleanup();
});

test("changing quality while a menu blocker is active does not allocate a renderer", async () => {
  const f = mount();
  const base = { enabled: true, motionAllowed: true };
  f.render(base);
  await flushPromises();
  assert.equal(f.rendererCalls.allocations.length, 1);
  assert.equal(f.rendererCalls.allocations[0].quality, "high");

  f.visibility(true);
  assert.equal(f.stage.dataset.ultraRenderer, "paused");
  const cinemaTree = f.render({ ...base, quality: "cinema" });
  assert.equal(cinemaTree.props["data-ultra-quality"], "cinema");
  assert.equal(f.rendererCalls.instances[0].disposeCount, 1);
  await flushPromises();
  assert.equal(f.rendererCalls.allocations.length, 1);
  assert.equal(f.rendererCalls.dispose, 1);

  f.cleanup();
  assert.equal(f.rendererCalls.dispose, 1);
});
