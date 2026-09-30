import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";
import { preloadRouteWithDeadline } from "../src/lib/route-warmup-deadline.ts";

const source = readFileSync(new URL("../src/components/load-gate.tsx", import.meta.url), "utf8");
const code = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
}).outputText;

function mount(pathname = "/world") {
  class KeyboardEvent extends Event {
    constructor(type, options = {}) {
      super(type);
      this.key = options.key;
      this.shiftKey = options.shiftKey ?? false;
    }
  }
  class PointerEvent extends Event {}
  const effects = [],
    frames = new Map(),
    timers = new Map(),
    subscribers = new Set();
  const navigations = [],
    gates = [],
    alignments = [];
  let serial = 0;
  let releaseWarmup;
  const warmup = new Promise((resolve) => {
    releaseWarmup = resolve;
  });
  const root = {
    dataset: {},
    removeAttribute(name) {
      delete this.dataset[
        name.slice(5).replace(/-([a-z])/g, (_, character) => character.toUpperCase())
      ];
    },
  };
  const doc = new EventTarget();
  Object.assign(doc, {
    documentElement: root,
    getElementById: (hash) => ({ scrollIntoView: () => alignments.push(hash) }),
    querySelector: () => null,
  });
  const win = new EventTarget();
  Object.assign(win, {
    location: { pathname, hash: "" },
    matchMedia: () => ({ matches: false }),
    requestAnimationFrame: (callback) => {
      frames.set(++serial, callback);
      return serial;
    },
    cancelAnimationFrame: (id) => frames.delete(id),
    setTimeout: (callback) => {
      timers.set(++serial, callback);
      return serial;
    },
    clearTimeout: (id) => timers.delete(id),
    setInterval: (callback) => {
      timers.set(++serial, callback);
      return serial;
    },
    clearInterval: (id) => timers.delete(id),
  });
  const router = {
    preloadRoute: () => warmup,
    subscribe: () => () => undefined,
    history: {
      subscribe(callback) {
        subscribers.add(callback);
        return () => subscribers.delete(callback);
      },
    },
  };
  const exports = {};
  runInNewContext(code, {
    exports,
    window: win,
    document: doc,
    Event,
    CustomEvent,
    KeyboardEvent,
    PointerEvent,
    performance: { now: () => 1000 },
    require(name) {
      if (name === "react")
        return {
          createContext: () => ({ Provider: "provider" }),
          useRef: (current) => ({ current }),
          useCallback: (callback) => callback,
          useMemo: (callback) => callback(),
          useEffect: (callback) => effects.push(callback),
          useLayoutEffect: (callback) => effects.push(callback),
          useState: (initial) => [
            initial,
            (value) => {
              if (value && typeof value === "object" && "active" in value) gates.push(value);
            },
          ],
        };
      if (name === "react/jsx-runtime")
        return {
          jsx: (type, props) => ({ type, props }),
          jsxs: (type, props) => ({ type, props }),
        };
      if (name === "@tanstack/react-router")
        return {
          useRouter: () => router,
          useRouterState: () => pathname,
          useNavigate: () => async (destination) => {
            navigations.push(destination);
          },
        };
      if (name === "@/lib/asset-loader") return { preloadAssets: async () => undefined };
      if (name === "@/lib/route-warmup-deadline") return { preloadRouteWithDeadline };
      return {};
    },
  });
  const tree = exports.LoadGateProvider({ children: null });
  const cleanups = effects.map((callback) => callback()).filter(Boolean);
  const flush = async (queue) => {
    const pending = [...queue.values()];
    queue.clear();
    pending.forEach((callback) => callback());
    for (let index = 0; index < 8; index++) await Promise.resolve();
  };
  return {
    go: tree.props.value.go,
    root,
    navigations,
    gates,
    alignments,
    releaseWarmup,
    history: (type) => subscribers.forEach((callback) => callback({ action: { type } })),
    key: (key, shiftKey = false) =>
      doc.dispatchEvent(new KeyboardEvent("keydown", { key, shiftKey })),
    flushFrames: () => flush(frames),
    flushTimers: () => flush(timers),
    cleanup: () => cleanups.forEach((callback) => callback()),
  };
}

for (const to of ["/characters/ciel", "/managers/zeus", "/form-archive", "/characters/dante"]) {
  test(`unmount during navigation to ${to} invalidates pending route work`, async () => {
    const ui = mount();
    const pending = ui.go({ to });
    ui.cleanup();
    assert.equal(
      ui.root.dataset.routeScrollSettling,
      undefined,
      "disposal immediately releases scroll motion",
    );
    const gateUpdates = ui.gates.length;
    ui.releaseWarmup();
    for (let index = 0; index < 16; index++) {
      await ui.flushFrames();
      await ui.flushTimers();
    }
    await pending;
    assert.equal(ui.navigations.length, 0, "an unmounted provider must not navigate");
    assert.equal(ui.gates.length, gateUpdates, "an unmounted provider must not update its cover");
    assert.equal(ui.root.dataset.loading, undefined);
    assert.equal(ui.root.dataset.routeCover, undefined);
  });
}

for (const action of ["BACK", "FORWARD", "GO"]) {
  test(`${action} during a covered route warmup prevents its later navigation`, async () => {
    const ui = mount();
    const pending = ui.go({ to: "/characters/ciel" });
    assert.equal(ui.root.dataset.loading, "true");
    ui.history(action);
    assert.equal(ui.root.dataset.loading, undefined);
    assert.equal(
      ui.root.dataset.routeScrollSettling,
      undefined,
      "history immediately restores scroll motion",
    );
    ui.releaseWarmup();
    for (let index = 0; index < 8; index++) await ui.flushTimers();
    await pending;
    assert.equal(ui.navigations.length, 0, "the superseded destination must not replace history");
    assert.equal(ui.gates.at(-1).active, false);
    ui.cleanup();
  });
}

test("Back before an immediate route's first frame also cancels its navigation", async () => {
  const ui = mount();
  const pending = ui.go({ to: "/characters/dante" });
  ui.history("BACK");
  await ui.flushFrames();
  await pending;
  assert.equal(ui.navigations.length, 0);
  ui.cleanup();
});

for (const pathname of [
  "/rexonance-saga",
  "/extreme-saga",
  "/final-stage",
  "/riders/saga",
  "/managers/zeus",
  "/form-archive",
]) {
  test(`an in-page menu link on ${pathname} aligns its hash without replaying a route cover`, async () => {
    const ui = mount(pathname);
    const pending = ui.go({ to: pathname, hash: "performance" });
    for (let index = 0; index < 12; index++) {
      await ui.flushFrames();
      await ui.flushTimers();
    }
    await pending;
    assert.equal(ui.navigations.length, 1);
    assert.ok(ui.alignments.length >= 3, "the section must stay aligned while its layout settles");
    assert.equal(ui.gates.filter((gate) => gate.active).length, 0);
    assert.equal(ui.root.dataset.loading, undefined);
    ui.cleanup();
  });
}

test("Back stops a pending in-page alignment before it can pull restored history back", async () => {
  const ui = mount();
  const pending = ui.go({ to: "/world", hash: "riders" });
  for (let index = 0; index < 8; index++) await Promise.resolve();
  assert.equal(ui.alignments.length, 1);
  ui.history("BACK");
  for (let index = 0; index < 4; index++) {
    await ui.flushFrames();
    await ui.flushTimers();
  }
  await pending;
  assert.equal(ui.alignments.length, 1);
  ui.cleanup();
});

for (const shiftKey of [false, true]) {
  test(`${shiftKey ? "Shift+Tab" : "Tab"} intent stops delayed hash alignment before focus is pulled off-screen`, async () => {
    const ui = mount();
    const pending = ui.go({ to: "/world", hash: "riders" });
    for (let index = 0; index < 8; index++) await Promise.resolve();
    assert.equal(ui.alignments.length, 1);
    ui.key("Tab", shiftKey);
    for (let index = 0; index < 4; index++) {
      await ui.flushFrames();
      await ui.flushTimers();
    }
    await pending;
    assert.equal(
      ui.alignments.length,
      1,
      "later frames/timers must preserve the user's new focus position",
    );
    ui.cleanup();
  });
}
