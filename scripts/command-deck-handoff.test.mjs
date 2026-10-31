import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";

const source = readFileSync(new URL("../src/components/command-deck/command-deck.tsx", import.meta.url), "utf8");
const code = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
const deferred = () => {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
};
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
function find(tree, predicate) {
  if (!tree || typeof tree !== "object") return null;
  if (predicate(tree)) return tree;
  for (const child of [tree.props?.children].flat(Infinity)) {
    const found = find(child, predicate);
    if (found) return found;
  }
  return null;
}

function runtime({ reduced = false, economy = false, scene = 0, viewport, measured } = {}) {
  const paint = deferred(), route = deferred(), cleanups = [], starts = [], navigations = [], warmups = [], cancellations = [];
  let allow = true, failure = false, warmThrows = false, stateIndex = 0;
  const jsx = (type, props) => ({ type, props });
  const gate = {
    beginOpeningHandoff(value) { starts.push(value); return allow; },
    async go(value) { navigations.push(value); if (failure) throw new Error("route cancelled"); await route.promise; },
  };
  const exports = {};
  runInNewContext(code, {
    exports, CustomEvent, Image: class {},
    window: { innerWidth: 1000, innerHeight: 800, visualViewport: viewport, matchMedia: () => ({ matches: reduced }) },
    document: { documentElement: { dataset: economy ? { worldEffects: "economy" } : {} }, dispatchEvent: (event) => { cancellations.push(event.type); } },
    require(name) {
      if (name === "react") return {
        useRef: (current) => ({ current }),
        useState(initial) { return [stateIndex++ === 0 ? scene : initial, () => {}]; },
        useEffect(effect) { const cleanup = effect(); if (cleanup) cleanups.push(cleanup); },
      };
      if (name === "react/jsx-runtime") return { jsx, jsxs: jsx };
      if (name === "@/components/load-gate") return { GuardedLink() {}, useLoadGate: () => gate };
      if (name === "@tanstack/react-router") return { useRouter: () => ({ preloadRoute: (value) => { warmups.push(value); if (warmThrows) throw new Error("warmup unavailable"); return Promise.resolve(); } }) };
      if (name === "@/lib/visual-paint") return { waitForVisualPaint: () => paint.promise };
      if (name === "@/lib/asset-loader") return {
        WORLD_ENTER_ASSETS: ["/world.webp"], DREAM_CHAPTER_ENTER_ASSETS: [], FINAL_STAGE_ENTER_ASSETS: [],
        preloadAssets: async (value) => { warmups.push(value); },
      };
      if (name === "@/lib/opening-logo") return { OPENING_LOGO_FIRST: { src: "/logo.webp" } };
      if (name === "@/lib/thumbnail-images") return { posterImage: () => ({}), launcherTile: (url) => url };
      if (name === "@/lib/rexonance-images") return { rexonanceImage: () => ({}) };
      if (name === "@/lib/command-deck-selection") return { readDeckSelection: () => null, saveDeckSelection() {} };
      if (name === "@/components/artwork-stage/artwork-stage") return { ArtworkStage() {} };
      if (name === "lucide-react") return {};
      throw new Error(`Unexpected dependency ${name}`);
    },
  });
  const tree = exports.CommandDeck({});
  const entry = find(tree, (node) => node.type?.name === "DeckWorldEntry");
  const logoRect = measured ?? { left: 650, top: 220, width: 250, height: 167 };
  if (entry) entry.props.logoRef.current = {
    currentSrc: "/logo-960.webp", src: "/logo.webp", getBoundingClientRect: () => logoRect,
  };
  const anchor = entry?.type(entry.props);
  return {
    tree, anchor, entry, starts, navigations, warmups, paint, route, logoRect, cancellations,
    set allow(value) { allow = value; }, set failure(value) { failure = value; }, set warmThrows(value) { warmThrows = value; },
    unmount() { cleanups.forEach((cleanup) => cleanup()); },
    click(extra = {}) {
      const event = { defaultPrevented: false, button: 0, detail: 1, currentTarget: { blur() {} },
        preventDefault() { this.defaultPrevented = true; }, stopPropagation() {}, ...extra };
      anchor.props.onClick(event); return event;
    },
  };
}

test("World deck entry retains its native href and starts one covered handoff before route work", async () => {
  const ui = runtime();
  assert.equal(ui.anchor.props.href, "/world");
  assert.equal(ui.anchor.props.className, "command-deck-enter");
  ui.click(); ui.click();
  assert.equal(ui.starts.length, 1);
  assert.equal(ui.starts[0].logoRect, ui.logoRect);
  assert.equal(ui.starts[0].logoSrc, "/logo-960.webp");
  assert.equal(ui.navigations.length, 0, "route work waits for the existing two-paint promise");
  ui.paint.resolve(); await flush();
  assert.equal(ui.navigations.length, 1);
  assert.equal(ui.navigations[0].to, "/world");
  assert.equal(ui.navigations[0].transitionCovered, true);
  assert.deepEqual(Array.from(ui.navigations[0].assets), ["/world.webp"]);
  ui.click(); assert.equal(ui.starts.length, 1, "an in-flight route cannot start a second dive");
  ui.route.resolve(); await flush(); ui.unmount();
  assert.deepEqual(ui.cancellations, [], "normal navigation unmount must retain the arrival cover");
});

test("modified and prevented clicks retain browser navigation without starting a handoff", () => {
  for (const extra of [{ button: 1 }, { metaKey: true }, { ctrlKey: true }, { shiftKey: true }, { altKey: true }, { defaultPrevented: true }]) {
    const ui = runtime(); const event = ui.click(extra);
    assert.equal(ui.starts.length, 0); assert.equal(ui.navigations.length, 0);
    assert.equal(event.defaultPrevented, extra.defaultPrevented === true); ui.unmount();
  }
});

test("entry passes reduced/economy and keyboard intent through the existing handoff", async () => {
  const ui = runtime({ reduced: true, economy: true }); ui.click({ detail: 0 });
  assert.equal(ui.starts[0].reducedMotion, true); assert.equal(ui.starts[0].economy, true);
  ui.paint.resolve(); await flush(); assert.equal(ui.navigations[0].focusDestination, true);
  ui.route.resolve(); await flush(); ui.unmount();
});

test("rejected, cancelled and unmounted entries never leave a local navigation latch", async () => {
  const rejected = runtime(); rejected.allow = false; rejected.click();
  assert.equal(rejected.navigations.length, 0);
  rejected.allow = true; rejected.click(); assert.equal(rejected.starts.length, 2);
  rejected.paint.resolve(); rejected.route.resolve(); await flush(); rejected.unmount();
  const cancelled = runtime(); cancelled.failure = true; cancelled.click(); cancelled.paint.resolve(); await flush();
  cancelled.failure = false; cancelled.click(); await flush(); assert.equal(cancelled.navigations.length, 2);
  cancelled.route.resolve(); await flush(); cancelled.unmount();
  const departed = runtime(); departed.click(); departed.unmount(); departed.paint.resolve(); await flush();
  assert.equal(departed.navigations.length, 0, "a late paint cannot navigate after Back or unmount");
  assert.deepEqual(departed.cancellations, ["deception-world:cancel-route-transition"], "prepaint departure releases the provider through its existing cancellation contract");
});

test("pointer, keyboard and touch intent warm the World route and assets only once", async () => {
  const ui = runtime(); ui.anchor.props.onPointerEnter(); ui.anchor.props.onFocus(); ui.anchor.props.onTouchStart();
  await flush(); assert.equal(ui.warmups.length, 2); ui.unmount();
});

test("Dream and Final Stage keep their existing guarded entry and do not acquire the World dive", () => {
  for (const scene of [1, 2]) {
    const ui = runtime({ scene }); assert.equal(ui.entry, null);
    const entry = find(ui.tree, (node) => node.props?.className === "command-deck-enter");
    assert.equal(entry.type.name, "DeckLink");
    assert.ok(["/dream-chapter", "/final-stage"].includes(entry.props.href)); ui.unmount();
  }
});


test("offscreen mobile logo rings use a modest viewport-local origin without changing the source artwork", async () => {
  const ui = runtime({
    viewport: { offsetLeft: 30, offsetTop: 50, width: 390, height: 844 },
    measured: { left: 40, top: 1000, width: 200, height: 134 },
  });
  ui.click(); const source = ui.starts[0];
  assert.equal(source.logoSrc, "/logo-960.webp");
  assert.ok(source.logoRect.width <= 208);
  assert.ok(Math.abs(source.logoRect.left + source.logoRect.width * 0.573 - (30 + 390 * 0.5)) < 0.001);
  assert.ok(Math.abs(source.logoRect.top + source.logoRect.height * 0.315 - (50 + 844 * 0.42)) < 0.001);
  ui.paint.resolve(); ui.route.resolve(); await flush(); ui.unmount();
});


test("synchronous intent warmup failure is handled and permits a later retry", async () => {
  const ui = runtime(); ui.warmThrows = true;
  assert.doesNotThrow(() => ui.anchor.props.onFocus()); await flush();
  assert.equal(ui.warmups.length, 2, "one warmup failure does not prevent the other preparation");
  ui.warmThrows = false; ui.anchor.props.onFocus(); await flush();
  assert.equal(ui.warmups.length, 4); ui.unmount();
});

test("a missing source logo retains usable World navigation without starting a broken dive", async () => {
  const ui = runtime(); ui.entry.props.logoRef.current = null; ui.click();
  assert.equal(ui.starts.length, 0); assert.equal(ui.navigations[0].to, "/world");
  assert.equal(ui.navigations[0].transitionCovered, undefined);
  ui.route.resolve(); await flush(); ui.unmount();
});

function visualPaintClock() {
  const frames = [], timers = [], exports = {};
  runInNewContext(ts.transpileModule(readFileSync(new URL("../src/lib/visual-paint.ts", import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText, { exports, window: {
    requestAnimationFrame: (callback) => frames.push(callback),
    setTimeout: (callback, delay) => timers.push({ callback, delay }),
  } });
  return { frames, timers, wait: exports.waitForVisualPaint };
}

test("the shared title/deck clock waits exactly two paint frames", async () => {
  const clock = visualPaintClock(); let complete = false;
  clock.wait().then(() => { complete = true; });
  assert.equal(clock.timers[0].delay, 96);
  clock.frames.shift()(); await flush(); assert.equal(complete, false);
  clock.frames.shift()(); await flush(); assert.equal(complete, true);
});

test("the shared clock retains the title's 96ms frozen-tab fail-safe", async () => {
  const clock = visualPaintClock(); let complete = false;
  clock.wait().then(() => { complete = true; });
  clock.timers[0].callback(); await flush(); assert.equal(complete, true);
});

function deckPauseRuntime() {
  const callbacks = [], effects = [], cleanups = [], pauses = { gpu: [], html: [] }, disposed = [];
  class Surface extends EventTarget {
    listeners = new Map();
    addEventListener(type, callback) {
      super.addEventListener(type, callback);
      if (!this.listeners.has(type)) this.listeners.set(type, new Set());
      this.listeners.get(type).add(callback);
    }
    removeEventListener(type, callback) { super.removeEventListener(type, callback); this.listeners.get(type)?.delete(callback); }
  }
  const document = Object.assign(new Surface(), { hidden: false, documentElement: { dataset: {} } });
  const motion = Object.assign(new Surface(), { matches: false });
  const exports = {}, jsx = (type, props) => ({ type, props });
  const renderer = (kind) => ({ setPaused: (value) => pauses[kind].push(value), setScene() {}, dispose: () => disposed.push(kind) });
  runInNewContext(code, {
    exports, document, Image: class {},
    window: { matchMedia: () => motion, setTimeout: (callback) => callbacks.push(callback), clearTimeout() {} },
    require(name) {
      if (name === "react") return { useRef: (current) => ({ current }), useState: (value) => [value, () => {}], useEffect: (effect) => effects.push(effect) };
      if (name === "react/jsx-runtime") return { jsx, jsxs: jsx };
      if (name === "@/lib/command-deck-renderer") return { mountCommandDeckRenderer: () => renderer("gpu") };
      if (name === "@/lib/command-deck-html-canvas") return { mountCommandDeckHtmlCanvas: () => renderer("html") };
      if (name === "@/lib/opening-logo") return { OPENING_LOGO_FIRST: { src: "/logo.webp" } };
      if (name === "@/lib/thumbnail-images") return { posterImage: () => ({}), launcherTile: (value) => value };
      if (name === "@/lib/rexonance-images") return { rexonanceImage: () => ({}) };
      return {};
    },
  });
  const tree = exports.CommandDeck({});
  const attach = (node) => {
    if (!node || typeof node !== "object") return;
    if (node.props?.ref) node.props.ref.current = {};
    for (const child of [node.props?.children].flat(Infinity)) attach(child);
  };
  attach(tree);
  for (const effect of effects) { const cleanup = effect(); if (cleanup) cleanups.push(cleanup); }
  return {
    document, motion, pauses, disposed,
    mount: async () => { callbacks.shift()(); await flush(); },
    handoff(active) {
      if (active) document.documentElement.dataset.openingHandoffActive = "true";
      else delete document.documentElement.dataset.openingHandoffActive;
      document.dispatchEvent(new Event("deception-world:opening-handoff"));
    },
    unmount: () => cleanups.forEach((cleanup) => cleanup()),
  };
}

test("the existing handoff pauses both deck engines, resumes on release, and removes its listener", async () => {
  const ui = deckPauseRuntime(); await ui.mount();
  assert.equal(ui.pauses.gpu.at(-1), false); assert.equal(ui.pauses.html.at(-1), false);
  ui.handoff(true); assert.equal(ui.pauses.gpu.at(-1), true); assert.equal(ui.pauses.html.at(-1), true);
  ui.handoff(false); assert.equal(ui.pauses.gpu.at(-1), false); assert.equal(ui.pauses.html.at(-1), false);
  ui.document.hidden = true; ui.handoff(true); ui.handoff(false);
  assert.equal(ui.pauses.gpu.at(-1), true, "cover cancellation must not resume a backgrounded deck");
  ui.unmount();
  assert.equal(ui.document.listeners.get("deception-world:opening-handoff").size, 0);
  assert.deepEqual(ui.disposed, ["gpu", "html"]);
});

test("a deck engine that mounts during the cover reads the existing active handoff attribute", async () => {
  const ui = deckPauseRuntime(); ui.handoff(true); await ui.mount();
  assert.equal(ui.pauses.gpu.at(-1), true); assert.equal(ui.pauses.html.at(-1), true);
  ui.handoff(false); assert.equal(ui.pauses.gpu.at(-1), false); ui.unmount();
});


test("CSS fallback HUD and logo share one ring centre for desktop, visible iPad and offscreen phone origins", async () => {
  for (const scenario of [
    { viewport: { offsetLeft: 0, offsetTop: 0, width: 1440, height: 900 }, measured: { left: 1100, top: 330, width: 250, height: 167 } },
    { viewport: { offsetLeft: 12, offsetTop: 30, width: 834, height: 1194 }, measured: { left: 45, top: 950, width: 220, height: 147 } },
    { viewport: { offsetLeft: 0, offsetTop: 22, width: 390, height: 822 }, measured: { left: 36, top: 1400, width: 220, height: 147 } },
  ]) {
    const ui = runtime(scenario); ui.click();
    const { logoRect, hudRect } = ui.starts[0];
    assert.ok(Math.abs(hudRect.left + hudRect.width / 2 - (logoRect.left + logoRect.width * 0.573)) < 0.001);
    assert.ok(Math.abs(hudRect.top + hudRect.height / 2 - (logoRect.top + logoRect.height * 0.315)) < 0.001);
    assert.equal(hudRect.width, Math.min(620, scenario.viewport.width * 0.84));
    assert.equal(hudRect.height, hudRect.width);
    ui.paint.resolve(); ui.route.resolve(); await flush(); ui.unmount();
  }
});
