import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const compile = (path) =>
  ts.transpileModule(read(path), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
const storeSource = compile("src/lib/ultra-mode.js");
const qualitySource = compile("src/lib/ultra-quality.js");
const toggleSource = compile("src/components/ultra/ultra-mode-toggle.tsx");
const jsx = (type, props, key) => ({ type, props, key });
const jsxRuntime = { jsx, jsxs: jsx };

function nodes(tree, predicate) {
  if (Array.isArray(tree)) return tree.flatMap((node) => nodes(node, predicate));
  if (!tree || typeof tree !== "object") return [];
  return [...(predicate(tree) ? [tree] : []), ...nodes(tree.props?.children, predicate)];
}

function text(tree) {
  if (Array.isArray(tree)) return tree.map(text).join("");
  if (tree == null || typeof tree === "boolean") return "";
  if (typeof tree === "object") return text(tree.props?.children);
  return String(tree);
}

function mountToggle({
  stored = null,
  storedQuality = null,
  reduced = false,
  forced = false,
  transparency = false,
  contrast = false,
  writeError = false,
} = {}) {
  const attrs = new Map();
  const storage = {
    getItem: (key) => (key === "dw-ultra-quality-v1" ? storedQuality : stored),
    setItem(key, value) {
      if (writeError) throw new Error("Quota exceeded");
      if (key === "dw-ultra-quality-v1") storedQuality = value;
      else stored = value;
    },
  };
  const browser = {
    localStorage: storage,
    addEventListener() {},
    removeEventListener() {},
    matchMedia(query) {
      return {
        matches: query.includes("reduced-motion")
          ? reduced
          : query.includes("forced-colors")
            ? forced
            : query.includes("reduced-transparency")
              ? transparency
              : contrast,
        addEventListener() {},
        removeEventListener() {},
      };
    },
  };
  const context = vm.createContext({
    window: browser,
    document: {
      documentElement: {
        setAttribute: (key, value) => attrs.set(key, value),
        removeAttribute: (key) => attrs.delete(key),
      },
    },
    exports: {},
  });
  vm.runInContext(storeSource, context);
  const store = context.exports;
  const qualityContext = { window: browser, document: context.document, exports: {} };
  vm.runInNewContext(qualitySource, qualityContext);
  const qualityStore = qualityContext.exports;
  let feedback = "";
  let id = 0;
  let failed = false;
  context.exports = {};
  context.require = (name) => {
    if (name === "react/jsx-runtime") return jsxRuntime;
    if (name === "react")
      return {
        useId: () => `ultra-description-${++id}`,
        useState: () => [
          feedback,
          (next) => {
            feedback = next;
          },
        ],
        useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot) {
          if (subscribe === qualityStore.subscribeUltraQuality) {
            assert.equal(getSnapshot, qualityStore.getUltraQualitySnapshot);
            assert.equal(getServerSnapshot, qualityStore.getUltraQualityServerSnapshot);
          } else {
            assert.equal(subscribe, store.subscribeUltraMode);
            assert.equal(getSnapshot, store.getUltraModeSnapshot);
            assert.equal(getServerSnapshot, store.getUltraModeServerSnapshot);
          }
          return getSnapshot();
        },
      };
    if (name === "@/lib/ultra-quality.js") return qualityStore;
    if (name === "@/lib/ultra-mode.js")
      return {
        ...store,
        setUltraMode(value) {
          if (failed) throw new Error("Unexpected controller failure");
          store.setUltraMode(value);
        },
      };
    throw new Error(`Unexpected dependency: ${name}`);
  };
  vm.runInContext(toggleSource, context);
  const render = () => {
    id = 0;
    return context.exports.UltraModeToggle();
  };
  return {
    render,
    store,
    qualityStore,
    attrs,
    fail: () => {
      failed = true;
    },
    get stored() {
      return stored;
    },
    get storedQuality() {
      return storedQuality;
    },
  };
}

test("Ultra side-menu switch is off and disabled until the client preference is ready", () => {
  const f = mountToggle({ stored: "true" });
  const tree = f.render();
  const button = nodes(tree, (node) => node.props?.role === "switch")[0];
  assert.equal(button.props["aria-label"], "ウルトラモード");
  assert.equal(button.props["aria-checked"], false);
  assert.equal(button.props.disabled, true);
  assert.equal(text(button), "ウルトラモードOFF");
  const description = nodes(tree, (node) => node.props?.id === button.props["aria-describedby"])[0];
  assert.match(text(description), /このブラウザーに保存/);
  assert.match(text(description), /いつでもOFF/);
  const status = nodes(tree, (node) => node.props?.role === "status")[0];
  assert.equal(status.props["aria-live"], "polite");
  assert.match(text(status), /読み込んでいます/);
});

test("ready switch loads saved on, turns off synchronously, and can turn on again", () => {
  const f = mountToggle({ stored: "true" });
  const cleanup = f.store.watchUltraMode();
  let button = nodes(f.render(), (node) => node.props?.role === "switch")[0];
  assert.equal(button.props.disabled, false);
  assert.equal(button.props["aria-checked"], true);
  assert.equal(text(button), "ウルトラモードON");
  button.props.onClick();
  assert.equal(f.store.getUltraModeSnapshot().enabled, false);
  assert.equal(f.attrs.has("data-ultra-mode"), false);
  assert.equal(f.attrs.has("data-ultra-motion"), false);
  assert.equal(f.stored, "false");
  let tree = f.render();
  button = nodes(tree, (node) => node.props?.role === "switch")[0];
  assert.equal(button.props["aria-checked"], false);
  assert.match(text(nodes(tree, (node) => node.props?.role === "status")[0]), /保存しました/);
  button.props.onClick();
  assert.equal(f.store.getUltraModeSnapshot().enabled, true);
  assert.equal(f.attrs.get("data-ultra-mode"), "on");
  assert.equal(f.stored, "true");
  tree = f.render();
  assert.equal(nodes(tree, (node) => node.props?.role === "switch")[0].props["aria-checked"], true);
  cleanup();
});

test("storage errors retain the usable switch and expose actual persistence feedback", () => {
  const f = mountToggle({ writeError: true });
  const cleanup = f.store.watchUltraMode();
  nodes(f.render(), (node) => node.props?.role === "switch")[0].props.onClick();
  let tree = f.render();
  assert.equal(f.store.getUltraModeSnapshot().enabled, true);
  assert.equal(f.store.getUltraModeSnapshot().storageAvailable, false);
  assert.match(
    text(nodes(tree, (node) => node.props?.role === "status")[0]),
    /反映しましたが、保存できませんでした/,
  );
  assert.equal(nodes(tree, (node) => node.props?.role === "switch")[0].props.disabled, false);
  nodes(tree, (node) => node.props?.role === "switch")[0].props.onClick();
  assert.equal(f.store.getUltraModeSnapshot().enabled, false);
  f.fail();
  nodes(f.render(), (node) => node.props?.role === "switch")[0].props.onClick();
  tree = f.render();
  assert.match(
    text(nodes(tree, (node) => node.props?.role === "status")[0]),
    /変更できませんでした/,
  );
  assert.equal(f.store.getUltraModeSnapshot().enabled, false);
  cleanup();
});

test("accessibility preference explanation is connected to the switch without disabling off", () => {
  for (const preference of ["reduced", "forced", "transparency", "contrast"]) {
    const f = mountToggle({ stored: "true", [preference]: true });
    const cleanup = f.store.watchUltraMode();
    const tree = f.render();
    const button = nodes(tree, (node) => node.props?.role === "switch")[0];
    assert.equal(button.props["aria-checked"], true);
    assert.equal(button.props.disabled, false);
    const descriptions = button.props["aria-describedby"].split(" ");
    assert.equal(descriptions.length, 2);
    const explanation = nodes(tree, (node) => node.props?.id === descriptions[1])[0];
    assert.match(text(explanation), /動き・透明度の軽減/);
    assert.match(text(explanation), /コントラスト・配色/);
    assert.equal(f.attrs.has("data-ultra-motion"), false);
    button.props.onClick();
    assert.equal(f.store.getUltraModeSnapshot().enabled, false);
    cleanup();
  }
});

test("visibility observes only blocker flags and emits only when the aggregate state changes", () => {
  const attrs = new Map();
  const listeners = new Set();
  const calls = [];
  let observer;
  const doc = {
    visibilityState: "visible",
    documentElement: { getAttribute: (name) => attrs.get(name) ?? null },
    addEventListener: (name, callback) => {
      assert.equal(name, "visibilitychange");
      listeners.add(callback);
    },
    removeEventListener: (_name, callback) => listeners.delete(callback),
  };
  const context = {
    exports: {},
    document: doc,
    MutationObserver: class {
      constructor(update) {
        observer = { update, disconnected: false };
      }
      observe(target, options) {
        observer.target = target;
        observer.options = options;
      }
      disconnect() {
        observer.disconnected = true;
      }
    },
  };
  vm.runInNewContext(compile("src/lib/ultra-mode-visibility.js"), context);
  const { ULTRA_BLOCKING_ATTRIBUTES, isUltraSceneBlocked, watchUltraSceneVisibility } =
    context.exports;
  const cleanup = watchUltraSceneVisibility((blocked) => calls.push(blocked));
  assert.deepEqual(
    [...ULTRA_BLOCKING_ATTRIBUTES],
    [
      "data-loading",
      "data-route-cover",
      "data-opening-handoff-active",
      "data-side-menu-open",
      "data-dialog-open",
    ],
  );
  assert.equal(observer.target, doc.documentElement);
  assert.equal(observer.options.attributes, true);
  assert.equal(observer.options.attributeFilter, ULTRA_BLOCKING_ATTRIBUTES);
  assert.deepEqual(calls, [false]);
  observer.update();
  assert.deepEqual(calls, [false]);
  for (const name of ULTRA_BLOCKING_ATTRIBUTES) {
    attrs.set(name, "false");
    observer.update();
    assert.equal(isUltraSceneBlocked(doc), false);
    for (const value of ["true", "", "active"]) {
      attrs.set(name, value);
      observer.update();
      assert.equal(isUltraSceneBlocked(doc), true);
    }
    assert.equal(calls.at(-1), true);
    attrs.delete(name);
    observer.update();
    assert.equal(calls.at(-1), false);
  }
  assert.equal(calls.length, 1 + 2 * ULTRA_BLOCKING_ATTRIBUTES.length);
  attrs.set("data-dialog-open", "true");
  observer.update();
  const beforeHidden = calls.length;
  doc.visibilityState = "hidden";
  for (const listener of listeners) listener();
  attrs.delete("data-dialog-open");
  observer.update();
  assert.equal(calls.length, beforeHidden);
  doc.visibilityState = "visible";
  for (const listener of listeners) listener();
  assert.equal(calls.at(-1), false);
  cleanup();
  assert.equal(observer.disconnected, true);
  assert.equal(listeners.size, 0);
});

test("quality radios appear only while on and persist independently of the mode", () => {
  const f = mountToggle({ stored: "false", storedQuality: "cinema" });
  const stopMode = f.store.watchUltraMode();
  const stopQuality = f.qualityStore.subscribeUltraQuality(() => {});
  const radios = () =>
    nodes(f.render(), (node) => node.type === "input" && node.props.type === "radio");
  assert.equal(radios().length, 0);
  nodes(f.render(), (node) => node.props?.role === "switch")[0].props.onClick();
  assert.equal(radios().length, 2);
  assert.equal(radios().find((node) => node.props.value === "cinema").props.checked, true);
  const fieldset = nodes(f.render(), (node) => node.type === "fieldset")[0];
  assert.match(text(fieldset), /画質.*高精細.*シネマ/);
  assert.match(text(fieldset), /処理負荷が高く/);
  radios()[0].props.onChange({ currentTarget: { value: "high" } });
  assert.equal(f.storedQuality, "high");
  assert.equal(f.stored, "true");
  assert.match(text(f.render()), /画質を「高精細」にして.*保存しました/);
  radios()[1].props.onChange({ currentTarget: { value: "cinema" } });
  nodes(f.render(), (node) => node.props?.role === "switch")[0].props.onClick();
  assert.equal(radios().length, 0);
  assert.equal(f.storedQuality, "cinema");
  assert.equal(f.stored, "false");
  stopQuality();
  stopMode();
});

test("quality controls wait for hydration and disclose a failed storage write", () => {
  const f = mountToggle({ stored: "true", writeError: true, reduced: true });
  const stopMode = f.store.watchUltraMode();
  const getRadios = () =>
    nodes(f.render(), (node) => node.type === "input" && node.props.type === "radio");
  assert.ok(getRadios().every((node) => node.props.disabled));
  const stopQuality = f.qualityStore.subscribeUltraQuality(() => {});
  assert.ok(getRadios().every((node) => !node.props.disabled));
  getRadios()[1].props.onChange({ currentTarget: { value: "cinema" } });
  assert.equal(f.qualityStore.getUltraQualitySnapshot().quality, "cinema");
  assert.equal(f.storedQuality, null);
  assert.match(text(f.render()), /画質設定はこの画面に反映しましたが、保存できませんでした/);
  assert.equal(f.attrs.has("data-ultra-motion"), false);
  stopQuality();
  stopMode();
});

function mountRuntime(
  snapshot,
  qualitySnapshot = { quality: "high", ready: true, storageAvailable: true },
) {
  const attrs = new Map();
  const states = [];
  const effects = [];
  const cleanups = [];
  const pending = [];
  const requests = [];
  const UltraEffects = Symbol("UltraEffects");
  let position = 0;
  let notifyVisibility;
  let lazyFactory;
  const store = {
    subscribeUltraMode() {},
    getUltraModeSnapshot: () => snapshot,
    getUltraModeServerSnapshot: () => ({ ready: false, enabled: false, motionAllowed: false }),
  };
  const context = {
    exports: {},
    document: {
      documentElement: {
        setAttribute: (name, value) => attrs.set(name, value),
        removeAttribute: (name) => attrs.delete(name),
      },
    },
    require(name) {
      if (name === "react/jsx-runtime") return jsxRuntime;
      if (name === "react")
        return {
          Component: class {
            constructor(props) {
              this.props = props;
            }
          },
          Suspense: Symbol("Suspense"),
          lazy(factory) {
            lazyFactory = factory;
            return Symbol("lazy effects");
          },
          useSyncExternalStore: (_subscribe, getSnapshot) => getSnapshot(),
          useState(initial) {
            const index = position++;
            if (!(index in states)) states[index] = initial;
            return [
              states[index],
              (next) => {
                states[index] = next;
              },
            ];
          },
          useEffect(callback, deps) {
            const index = position++;
            if (!effects[index] || deps.some((dep, i) => dep !== effects[index][i])) {
              effects[index] = deps;
              pending.push(() => {
                cleanups[index]?.();
                cleanups[index] = callback();
              });
            }
          },
        };
      if (name === "@/lib/ultra-mode.js") return store;
      if (name === "@/lib/ultra-quality.js")
        return {
          subscribeUltraQuality() {},
          getUltraQualitySnapshot: () => qualitySnapshot,
          getUltraQualityServerSnapshot: () => ({
            quality: "high",
            ready: false,
            storageAvailable: false,
          }),
        };
      if (name === "@/lib/ultra-mode-visibility.js")
        return {
          watchUltraSceneVisibility(notify) {
            notifyVisibility = notify;
            return () => {
              notifyVisibility = null;
            };
          },
        };
      if (name === "./ultra-effects") {
        requests.push(name);
        return { UltraEffects };
      }
      throw new Error(`Unexpected dependency: ${name}`);
    },
  };
  vm.runInNewContext(compile("src/components/ultra/ultra-mode-runtime.tsx"), context);
  return {
    attrs,
    requests,
    UltraEffects,
    render: () => context.exports.UltraModeRuntime(),
    renderSession(session) {
      position = 0;
      return session.type(session.props);
    },
    flush: () => {
      for (const effect of pending.splice(0)) effect();
    },
    visibility: (blocked) => notifyVisibility(blocked),
    load: () => lazyFactory(),
    unmount: () => {
      for (const cleanup of cleanups) cleanup?.();
    },
  };
}

test("runtime keeps effects absent while unready, off, blocked, or motion restricted", async () => {
  for (const snapshot of [
    { ready: false, enabled: true, motionAllowed: true },
    { ready: true, enabled: false, motionAllowed: true },
  ]) {
    const f = mountRuntime(snapshot);
    assert.equal(f.render(), null);
    assert.equal(f.requests.length, 0);
  }
  const restricted = mountRuntime({ ready: true, enabled: true, motionAllowed: false });
  const initialRestrictedSession = restricted.render();
  assert.equal(restricted.renderSession(initialRestrictedSession), null);
  restricted.flush();
  restricted.visibility(false);
  assert.equal(restricted.renderSession(initialRestrictedSession), null);
  restricted.flush();
  assert.equal(restricted.requests.length, 0);
  assert.equal(restricted.attrs.get("data-ultra-paused"), "true");
  restricted.unmount();
  const snapshot = { ready: true, enabled: true, motionAllowed: true };
  const f = mountRuntime(snapshot);
  const session = f.render();
  assert.equal(f.renderSession(session), null);
  f.flush();
  assert.equal(f.attrs.get("data-ultra-paused"), "true");
  f.visibility(true);
  assert.equal(f.renderSession(session), null);
  f.flush();
  assert.equal(f.requests.length, 0);
  f.visibility(false);
  assert.equal(f.renderSession(session), null);
  f.flush();
  assert.equal(f.attrs.has("data-ultra-paused"), false);
  const activeTree = f.renderSession(session);
  const effect = nodes(activeTree, (node) => node.props?.enabled === true)[0];
  assert.equal(effect.props.motionAllowed, true);
  const loaded = await f.load();
  assert.equal(loaded.default, f.UltraEffects, "the named effect export must reach React.lazy");
  assert.deepEqual(f.requests, ["./ultra-effects"]);
  const boundary = new activeTree.type(activeTree.props);
  assert.equal(boundary.render(), activeTree.props.children);
  boundary.state = activeTree.type.getDerivedStateFromError(new Error("Renderer unavailable"));
  boundary.componentDidCatch();
  assert.equal(boundary.render(), null);
  assert.equal(f.attrs.get("data-ultra-renderer"), "error");
  f.visibility(true);
  const pausedTree = f.renderSession(session);
  f.flush();
  assert.equal(
    nodes(pausedTree, (node) => node.props?.enabled === true)[0].props.motionAllowed,
    true,
  );
  assert.equal(f.attrs.get("data-ultra-paused"), "true");
  snapshot.motionAllowed = false;
  const restrictedSession = f.render();
  assert.equal(f.renderSession(restrictedSession), null);
  f.flush();
  snapshot.enabled = false;
  assert.equal(f.render(), null);
  f.attrs.set("data-ultra-renderer", "webgl2");
  f.unmount();
  assert.equal(f.attrs.has("data-ultra-paused"), false);
  assert.equal(f.attrs.has("data-ultra-renderer"), false);
});

test("runtime waits for the saved quality and forwards later quality changes", () => {
  const snapshot = { ready: true, enabled: true, motionAllowed: true };
  const quality = { ready: false, quality: "high", storageAvailable: false };
  const f = mountRuntime(snapshot, quality);
  assert.equal(f.render(), null);
  assert.deepEqual(f.requests, []);
  quality.ready = true;
  quality.quality = "cinema";
  let session = f.render();
  assert.equal(session.props.quality, "cinema");
  f.renderSession(session);
  f.flush();
  f.visibility(false);
  f.renderSession(session);
  f.flush();
  let effects = nodes(f.renderSession(session), (node) => node.props?.enabled === true)[0];
  assert.equal(effects.props.quality, "cinema");
  quality.quality = "high";
  session = f.render();
  effects = nodes(f.renderSession(session), (node) => node.props?.enabled === true)[0];
  assert.equal(effects.props.quality, "high");
  f.unmount();
});

test("root and shared menu wire the prepaint gate, styles, runtime and toggle", () => {
  const root = read("src/routes/__root.tsx");
  const menu = read("src/components/world/world-chrome.tsx");
  assert.match(
    root,
    /import\s*\{\s*ULTRA_MODE_BOOTSTRAP_SCRIPT\s*\}\s*from\s*["']@\/lib\/ultra-mode\.js["']/,
  );
  assert.match(root, /scripts:\s*\[[\s\S]*?\{\s*children:\s*ULTRA_MODE_BOOTSTRAP_SCRIPT\s*\}/);
  for (const [variable, file] of [
    ["ultraModeCss", "styles-ultra-mode.css"],
    ["ultraEffectsCss", "styles-ultra-effects.css"],
    ["ultraMaterialsCss", "styles-ultra-materials.css"],
    ["ultraTransitionsCss", "styles-ultra-transitions.css"],
  ]) {
    assert.ok(root.includes(`import ${variable} from "../${file}?url"`));
    assert.ok(root.includes(`{ rel: "stylesheet", href: ${variable} }`));
  }
  assert.match(root, /<UltraModeRuntime\s*\/>/);
  assert.match(menu, /<UltraModeToggle\s*\/>/);
});

test("menu describes local frame materials without promising native ray tracing or changing the artwork", () => {
  const f = mountToggle({ stored: "true" });
  const stop = f.store.watchUltraMode();
  const copy = text(f.render());
  assert.match(copy, /Blender/);
  assert.match(copy, /作品画像そのものは加工しません/);
  assert.match(copy, /非対応環境では静的な額縁素材/);
  assert.match(copy, /追加の演出を抑え/);
  assert.doesNotMatch(copy, /反射床|結晶内|レイマーチング|MetalFX|レイトレーシング/);
  stop();
});
