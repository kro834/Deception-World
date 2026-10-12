import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";
import {
  preloadRouteWithDeadline,
  ROUTE_WARMUP_DEADLINE_MS,
} from "../src/lib/route-warmup-deadline.ts";
import { REXONANCE_ENTRY_TIMINGS } from "../src/lib/rexonance-calls.ts";

const source = readFileSync(new URL("../src/components/load-gate.tsx", import.meta.url), "utf8");
const code = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
const entryPreparationCode = ts.transpileModule(
  readFileSync(new URL("../src/lib/rexonance-entry-preparation.ts", import.meta.url), "utf8"),
  { compilerOptions: { module: ts.ModuleKind.CommonJS } },
).outputText;

async function flushUntil(ui, ready, message, { timers = false, limit = 24 } = {}) {
  for (let index = 0; index < limit && !ready(); index++) {
    await ui.flushFrames();
    if (timers) await ui.flushTimers();
  }
  assert.ok(ready(), message);
}

async function reachRexonanceHold(ui) {
  await flushUntil(
    ui,
    () => {
      const gate = ui.gates.at(-1);
      return (
        gate?.active &&
        gate.phase === "covering" &&
        gate.rexonanceCall &&
        ui.activeObservers() === 1 &&
        ui.pendingTimers() > 0
      );
    },
    "the painted Rexonance call must reach its cancellable, timed hold",
  );
}

// A missing frame, leaked hold or never-settling preparation must fail the
// regression in a bounded flush budget, not leave the whole test run hung.
async function settleGo(ui, pending) {
  let settled = false;
  let failure;
  void pending.then(
    () => {
      settled = true;
    },
    (error) => {
      failure = error;
      settled = true;
    },
  );
  await flushUntil(
    ui,
    () => settled,
    "the route operation must settle without a stuck frame or hold",
    { timers: true },
  );
  if (failure) throw failure;
}

test("a missing Rexonance renderer continues under the normal cover", async () => {
  const ui = mount("/world", {
    prepareCalls: () => ({ promise: Promise.resolve(null), cancel() {} }),
  });
  const pending = ui.go({ to: "/rexonance-saga" });
  assert.equal(ui.gates.filter((gate) => gate.active).length, 0);
  ui.releaseWarmup();
  for (let index = 0; index < 20; index++) {
    await ui.flushFrames();
    await ui.flushTimers();
  }
  await settleGo(ui, pending);
  assert.equal(ui.navigations.length, 1);
  assert.ok(ui.gates.some((gate) => gate.active && gate.rexonanceCall === null));
  assert.equal(ui.activeObservers(), 0);
  assert.equal(ui.root.dataset.loading, undefined);
  ui.cleanup();
});

for (const action of ["BACK", "hidden", "unmount"]) {
  test(`${action} cancels pending cinematic preparation before any cover paints`, async () => {
    let release;
    const ui = mount("/world", {
      prepareCalls: () => ({
        promise: new Promise((resolve) => {
          release = resolve;
        }),
        cancel: () => release(null),
      }),
    });
    const pending = ui.go({ to: "/rexonance-saga" });
    assert.equal(ui.gates.filter((gate) => gate.active).length, 0);
    if (action === "BACK") ui.history("BACK");
    else if (action === "hidden") ui.visibility(true);
    else ui.cleanup();
    await settleGo(ui, pending);
    release(() => null);
    assert.equal(ui.navigations.length, 0);
    assert.equal(ui.root.dataset.loading, undefined);
    assert.equal(ui.root.dataset.routeScrollSettling, undefined);
    if (action !== "unmount") ui.cleanup();
  });
}

function mount(
  pathname = "/world",
  { preload, prepareCalls, suitReady = false, warmSuit, preparePlan, loadPlan } = {},
) {
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
    timerDelays = new Map(),
    subscribers = new Set();
  const motion = new EventTarget();
  motion.matches = false;
  const observers = new Set();
  class MutationObserver {
    constructor(callback) {
      this.callback = callback;
    }
    observe() {
      observers.add(this);
    }
    disconnect() {
      observers.delete(this);
    }
  }
  const navigations = [],
    gates = [],
    alignments = [],
    fallbacks = [],
    queries = [],
    routePreloads = [],
    signals = [];
  let serial = 0;
  let suitWarmHolds = 0;
  let releaseWarmup;
  const warmup = new Promise((resolve) => {
    releaseWarmup = resolve;
  });
  const root = {
    dataset: {},
    setAttribute(name, value) {
      this.dataset[
        name.slice(5).replace(/-([a-z])/g, (_, character) => character.toUpperCase())
      ] = String(value);
    },
    removeAttribute(name) {
      delete this.dataset[
        name.slice(5).replace(/-([a-z])/g, (_, character) => character.toUpperCase())
      ];
    },
  };
  const doc = new EventTarget();
  Object.assign(doc, {
    hidden: false,
    documentElement: root,
    getElementById: (hash) => ({ scrollIntoView: () => alignments.push(hash) }),
    querySelector: (selector) => {
      queries.push(selector);
      return null;
    },
  });
  const win = new EventTarget();
  Object.assign(win, {
    location: { pathname, hash: "" },
    matchMedia: () => motion,
    requestAnimationFrame: (callback) => {
      frames.set(++serial, callback);
      return serial;
    },
    cancelAnimationFrame: (id) => frames.delete(id),
    setTimeout: (callback, delay) => {
      timers.set(++serial, callback);
      timerDelays.set(serial, delay);
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
    preloadRoute: (destination) => {
      routePreloads.push(destination);
      return preload ? preload(destination) : warmup;
    },
    subscribe: () => () => undefined,
    history: {
      subscribe(callback) {
        subscribers.add(callback);
        return () => subscribers.delete(callback);
      },
    },
  };
  const exports = {};
  const entryPreparation = {};
  runInNewContext(entryPreparationCode, { exports: entryPreparation, window: win });
  runInNewContext(code, {
    exports,
    window: win,
    document: doc,
    Event,
    CustomEvent,
    KeyboardEvent,
    PointerEvent,
    MutationObserver,
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
              if (value && typeof value === "object" && "href" in value) fallbacks.push(value);
              if (typeof value === "string") signals.push(value);
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
      if (name === "@/lib/rexonance-calls")
        return { REXONANCE_ENTRY_TIMINGS, REXONANCE_SUIT_LATE_MS: 300 };
      if (name === "@/lib/rexonance-route-cover")
        return { syncRexonanceRouteCover: () => undefined };
      if (name === "@/lib/rexonance-entry-preparation") return entryPreparation;
      // Most cases keep layers cold. Prepared-layer cases exercise the
      // bounded plan wait; explicit warmSuit cases hold the real decoder wait.
      if (name === "@/lib/rexonance-suit-warmup")
        return {
          warmRexonanceSuit: warmSuit ?? (() => Promise.resolve(suitReady)),
          isRexonanceSuitReady: () => suitReady,
          // rx13: the idle warm-up never runs here.
          scheduleRexonanceSuitWarm: () => () => {},
          pauseRexonanceSuitWarmup: () => {
            suitWarmHolds += 1;
            let released = false;
            return () => {
              if (released) return;
              released = true;
              suitWarmHolds -= 1;
            };
          },
          // The page preload (owner, 2026-10-11) never runs here either.
          scheduleRexonancePagePreload: () => () => {},
        };
      if (name === "./rexonance-saga/rexonance-suit-plan")
        return loadPlan
          ? loadPlan()
          : { prepareRexonanceSuit: preparePlan ?? (() => Promise.resolve(true)) };
      if (name === "@/lib/rexonance-transition-loader")
        return {
          prepareRexonanceTransition:
            prepareCalls ?? (() => ({ promise: Promise.resolve(() => null), cancel() {} })),
        };
      return {};
    },
  });
  const tree = exports.LoadGateProvider({ children: null });
  const cleanups = effects.map((callback) => callback()).filter(Boolean);
  const flush = async (queue) => {
    // Dedicated cinematic modules now prepare before requesting their first paint.
    for (let index = 0; index < 8; index++) await Promise.resolve();
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
    fallbacks,
    queries,
    routePreloads,
    signals,
    releaseWarmup,
    setSuitReady: (ready) => {
      suitReady = ready;
    },
    suitWarmHolds: () => suitWarmHolds,
    activeObservers: () => observers.size,
    pendingTimers: () => timers.size,
    pendingTimerDelays: () => [...timers.keys()].map((id) => timerDelays.get(id)),
    reduceMotion: () => {
      motion.matches = true;
      motion.dispatchEvent(new Event("change"));
    },
    economy: () => {
      root.dataset.worldEffects = "economy";
      observers.forEach((observer) => observer.callback());
    },
    visibility: (hidden) => {
      doc.hidden = hidden;
      doc.dispatchEvent(new Event("visibilitychange"));
    },
    pagehide: () => win.dispatchEvent(new Event("pagehide")),
    history: (type) => subscribers.forEach((callback) => callback({ action: { type } })),
    key: (key, shiftKey = false) =>
      doc.dispatchEvent(new KeyboardEvent("keydown", { key, shiftKey })),
    flushFrames: () => flush(frames),
    flushTimers: () => flush(timers),
    cleanup: () => cleanups.forEach((callback) => callback()),
  };
}

for (const to of [
  "/gallery",
  "/characters/ciel",
  "/managers/zeus",
  "/form-archive",
  "/characters/dante",
]) {
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
    await settleGo(ui, pending);
    assert.equal(ui.navigations.length, 0, "an unmounted provider must not navigate");
    assert.equal(ui.gates.length, gateUpdates, "an unmounted provider must not update its cover");
    assert.equal(ui.root.dataset.loading, undefined);
    assert.equal(ui.root.dataset.routeCover, undefined);
  });
}

for (const mode of ["full", "economy", "reduced"]) {
  test(`gallery ${mode} curtain commits under cover and releases all route locks`, async () => {
    const ui = mount();
    if (mode === "economy") ui.economy();
    if (mode === "reduced") ui.reduceMotion();
    const pending = ui.go({ to: "/gallery" });
    assert.equal(ui.gates.at(-1).variant, "gallery");
    assert.equal(ui.gates.at(-1).phase, "covering");
    assert.equal(ui.navigations.length, 0);
    ui.releaseWarmup();
    for (let index = 0; index < 20; index++) {
      await ui.flushFrames();
      await ui.flushTimers();
    }
    await settleGo(ui, pending);
    assert.deepEqual(
      ui.navigations.map(({ to }) => to),
      ["/gallery"],
    );
    assert.ok(ui.gates.some((gate) => gate.variant === "gallery" && gate.phase === "revealing"));
    assert.equal(ui.gates.at(-1).active, false);
    assert.equal(ui.root.dataset.loading, undefined);
    assert.equal(ui.root.dataset.routeCover, undefined);
    assert.equal(ui.root.dataset.routeScrollSettling, undefined);
    ui.cleanup();
  });
}

for (const phase of ["warmup", "hold", "reveal"]) {
  for (const action of ["BACK", "pagehide"]) {
    test(`${action} during gallery ${phase} cannot revive its curtain over a newer route`, async () => {
      const ui = mount();
      const stale = ui.go({ to: "/gallery" });
      await ui.flushFrames();
      await ui.flushFrames();
      if (phase !== "warmup") {
        ui.releaseWarmup();
        await ui.flushFrames();
      }
      if (phase === "reveal") {
        for (let index = 0; index < 16 && ui.gates.at(-1).phase !== "revealing"; index++) {
          await ui.flushTimers();
          await ui.flushFrames();
        }
        assert.equal(ui.gates.at(-1).phase, "revealing");
      }
      if (action === "BACK") ui.history(action);
      else ui.pagehide();
      const latest = ui.go({ to: "/characters/ciel" });
      ui.releaseWarmup();
      await ui.flushFrames();
      assert.equal(ui.gates.at(-1).variant, "ciel");
      assert.equal(ui.root.dataset.loading, "true");
      for (let index = 0; index < 24; index++) {
        await ui.flushFrames();
        await ui.flushTimers();
      }
      await settleGo(ui, Promise.all([stale, latest]));
      assert.equal(
        ui.navigations.filter(({ to }) => to === "/gallery").length,
        phase === "reveal" ? 1 : 0,
      );
      assert.equal(ui.navigations.at(-1).to, "/characters/ciel");
      assert.equal(ui.root.dataset.loading, undefined);
      assert.equal(ui.gates.at(-1).active, false);
      ui.cleanup();
    });
  }
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
    await settleGo(ui, pending);
    assert.equal(ui.navigations.length, 0, "the superseded destination must not replace history");
    assert.equal(ui.gates.at(-1).active, false);
    ui.cleanup();
  });
}

for (const action of ["BACK", "FORWARD", "GO", "pagehide", "unmount"]) {
  test(`${action} cancels the painted Rexonance call hold and its timer`, async () => {
    const ui = mount();
    const pending = ui.go({ to: "/rexonance-saga" });
    ui.releaseWarmup();
    await reachRexonanceHold(ui);
    assert.equal(ui.activeObservers(), 1, "the live-preference hold is registered");
    if (action === "pagehide") ui.pagehide();
    else if (action === "unmount") ui.cleanup();
    else ui.history(action);
    await settleGo(ui, pending);
    await ui.flushTimers();
    assert.equal(ui.navigations.length, 0, "a cancelled call must never commit later");
    assert.equal(ui.activeObservers(), 0, "the preference observer is released");
    assert.equal(ui.pendingTimers(), 0, "the call timer is cleared immediately");
    assert.equal(ui.root.dataset.loading, undefined);
    assert.equal(ui.root.dataset.routeScrollSettling, undefined);
    if (action !== "unmount") ui.cleanup();
  });
}

test("enabling reduced motion during the Rexonance hold ends its cinematic wait", async () => {
  const ui = mount();
  const pending = ui.go({ to: "/rexonance-saga" });
  ui.releaseWarmup();
  await reachRexonanceHold(ui);
  assert.equal(ui.activeObservers(), 1);
  ui.reduceMotion();
  for (let index = 0; index < 16; index++) {
    await ui.flushFrames();
    await ui.flushTimers();
  }
  await settleGo(ui, pending);
  assert.equal(ui.navigations.length, 1);
  assert.equal(ui.activeObservers(), 0);
  assert.equal(ui.gates.at(-1).active, false);
  assert.equal(ui.root.dataset.loading, undefined);
  ui.cleanup();
});

test("hiding Rexonance before its first painted cover cancels the queued navigation", async () => {
  const ui = mount();
  const pending = ui.go({ to: "/rexonance-saga" });
  // A queued React cover does not exist in the document yet. Backgrounding
  // must cancel the operation itself rather than rely on querying its DOM.
  try {
    ui.visibility(true);
    assert.equal(ui.root.dataset.loading, undefined);
    assert.equal(ui.root.dataset.routeCover, undefined);
    assert.equal(ui.root.dataset.routeScrollSettling, undefined);
    ui.visibility(false);
    ui.releaseWarmup();
    for (let index = 0; index < 16; index++) {
      await ui.flushFrames();
      await ui.flushTimers();
    }
    await settleGo(ui, pending);
    assert.equal(ui.navigations.length, 0, "returning to the tab must not revive a cancelled call");
  } finally {
    ui.cleanup();
  }
});

test("enabling economy rendering during the Rexonance hold ends its cinematic wait", async () => {
  const ui = mount();
  const pending = ui.go({ to: "/rexonance-saga" });
  ui.releaseWarmup();
  await reachRexonanceHold(ui);
  assert.equal(ui.activeObservers(), 1);
  ui.economy();
  assert.equal(ui.activeObservers(), 0, "the live preference releases the hold immediately");
  for (let index = 0; index < 16; index++) {
    await ui.flushFrames();
    await ui.flushTimers();
  }
  await settleGo(ui, pending);
  assert.equal(ui.navigations.length, 1);
  assert.equal(ui.gates.at(-1).active, false);
  assert.equal(ui.root.dataset.loading, undefined);
  ui.cleanup();
});

test("a stalled Rexonance warmup releases its cover and a late response cannot navigate", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const ui = mount();
  const pending = ui.go({ to: "/rexonance-saga", hash: "stages" });
  await flushUntil(
    ui,
    () => ui.routePreloads.length === 1,
    "the covered call must start route warming before its deadline is advanced",
  );
  t.mock.timers.tick(ROUTE_WARMUP_DEADLINE_MS);
  await settleGo(ui, pending);
  assert.equal(ui.gates.at(-1).active, false);
  assert.equal(ui.root.dataset.loading, undefined);
  assert.equal(ui.fallbacks.at(-1).href, "/rexonance-saga#stages");
  assert.equal(ui.navigations.length, 0);
  ui.releaseWarmup();
  for (let index = 0; index < 16; index++) {
    await ui.flushFrames();
    await ui.flushTimers();
  }
  assert.equal(ui.navigations.length, 0, "a late warmup must not override the usable source page");
  assert.equal(ui.root.dataset.routeScrollSettling, undefined);

  const retry = ui.go({ to: "/rexonance-saga", hash: "stages" });
  for (let index = 0; index < 20; index++) {
    await ui.flushFrames();
    await ui.flushTimers();
  }
  await settleGo(ui, retry);
  assert.equal(ui.navigations.length, 1, "the expired operation must release the navigation guard");
  assert.equal(ui.gates.at(-1).active, false);
  ui.cleanup();
});

for (const failure of ["reject", "throw"]) {
  test(`a ${failure} during Rexonance warmup hands off to router recovery and releases the cover`, async () => {
    const ui = mount("/world", {
      preload: () => {
        if (failure === "throw") throw new Error("chunk unavailable");
        return Promise.reject(new Error("chunk unavailable"));
      },
    });
    const pending = ui.go({ to: "/rexonance-saga" });
    for (let index = 0; index < 20; index++) {
      await ui.flushFrames();
      await ui.flushTimers();
    }
    await settleGo(ui, pending);
    assert.equal(ui.navigations.length, 1);
    assert.equal(ui.gates.at(-1).active, false);
    assert.equal(ui.root.dataset.loading, undefined);
    assert.equal(ui.activeObservers(), 0);
    ui.cleanup();
  });
}

test("repeated history cancellation permits the next route without reviving Rexonance", async () => {
  const ui = mount();
  const stale = ui.go({ to: "/rexonance-saga" });
  await ui.flushFrames();
  await ui.flushFrames();
  for (const action of ["BACK", "BACK", "FORWARD", "GO", "BACK"]) ui.history(action);
  const latest = ui.go({ to: "/characters/ciel" });
  ui.releaseWarmup();
  for (let index = 0; index < 20; index++) {
    await ui.flushFrames();
    await ui.flushTimers();
  }
  await settleGo(ui, Promise.all([stale, latest]));
  assert.equal(ui.navigations.length, 1);
  assert.equal(ui.navigations[0].to, "/characters/ciel");
  assert.equal(ui.root.dataset.loading, undefined);
  assert.equal(ui.root.dataset.routeScrollSettling, undefined);
  assert.equal(ui.activeObservers(), 0);
  ui.cleanup();
});

for (const phase of ["warmup", "hold", "reveal"]) {
  for (const cancellation of ["hidden", "pagehide", "BACK"]) {
    test(`${cancellation} during Rexonance ${phase} cannot erase a newer route's cover`, async () => {
      const ui = mount();
      const stale = ui.go({ to: "/rexonance-saga" });
      await flushUntil(
        ui,
        () => ui.routePreloads.length === 1,
        "the Rexonance cover must reach route warming before cancellation",
      );
      if (phase !== "warmup") {
        ui.releaseWarmup();
        await reachRexonanceHold(ui);
        assert.equal(ui.activeObservers(), 1, "the call hold is active before advancing");
      }
      if (phase === "reveal") {
        for (let index = 0; index < 16 && ui.gates.at(-1).phase !== "revealing"; index++) {
          await ui.flushTimers();
          await ui.flushFrames();
        }
        assert.equal(ui.gates.at(-1).phase, "revealing");
      }

      if (cancellation === "hidden") ui.visibility(true);
      else if (cancellation === "pagehide") ui.pagehide();
      else ui.history(cancellation);
      assert.equal(ui.root.dataset.loading, undefined);
      assert.equal(ui.root.dataset.routeScrollSettling, undefined);
      assert.equal(ui.activeObservers(), 0);
      ui.visibility(false);
      const latest = ui.go({ to: "/characters/ciel" });
      ui.releaseWarmup();
      // Let the stale operation reach its finally before the new route's
      // cover duration expires. It must not clear the newer operation's lock.
      await ui.flushFrames();
      assert.equal(ui.root.dataset.loading, "true");
      assert.equal(ui.gates.at(-1).variant, "ciel");
      assert.equal(ui.gates.at(-1).active, true);
      for (let index = 0; index < 20; index++) {
        await ui.flushFrames();
        await ui.flushTimers();
      }
      await settleGo(ui, Promise.all([stale, latest]));
      assert.equal(ui.navigations.at(-1).to, "/characters/ciel");
      assert.equal(
        ui.navigations.filter(({ to }) => to === "/rexonance-saga").length,
        phase === "reveal" ? 1 : 0,
      );
      assert.equal(ui.gates.at(-1).active, false);
      assert.equal(ui.root.dataset.loading, undefined);
      assert.equal(ui.root.dataset.routeScrollSettling, undefined);
      ui.cleanup();
    });
  }
}

test("a completed Rexonance entry does not leave its visibility policy on another rider", async () => {
  const ui = mount();
  const rexonance = ui.go({ to: "/rexonance-saga" });
  ui.releaseWarmup();
  for (let index = 0; index < 20; index++) {
    await ui.flushFrames();
    await ui.flushTimers();
  }
  await settleGo(ui, rexonance);
  const ciel = ui.go({ to: "/characters/ciel" });
  ui.visibility(true);
  assert.equal(ui.root.dataset.loading, "true", "only an active Rexonance call uses this policy");
  assert.equal(ui.gates.at(-1).variant, "ciel");
  ui.visibility(false);
  for (let index = 0; index < 20; index++) {
    await ui.flushFrames();
    await ui.flushTimers();
  }
  await settleGo(ui, ciel);
  assert.equal(ui.navigations.at(-1).to, "/characters/ciel");
  assert.equal(ui.gates.at(-1).active, false);
  ui.cleanup();
});

for (const to of ["/rexonance-saga", "/riders/saga"]) {
  test(`${to} only measures docking geometry when its renderer uses a carried file`, async () => {
    const ui = mount();
    const pending = ui.go({ to });
    ui.releaseWarmup();
    for (let index = 0; index < 20; index++) {
      await ui.flushFrames();
      await ui.flushTimers();
    }
    await settleGo(ui, pending);
    const hasDock = to !== "/rexonance-saga";
    assert.equal(ui.queries.includes("main .manager-portrait-frame"), hasDock);
    assert.equal(
      ui.queries.includes("main"),
      hasDock,
      "only carried-file arrivals scan page animations",
    );
    assert.equal(ui.queries.includes(".load-gate.has-cine > .dwc-carry > i"), hasDock);
    const cover = ui.gates.find((gate) => gate.active && gate.phase === "covering");
    const reveal = ui.gates.find((gate) => gate.active && gate.phase === "revealing");
    assert.equal(reveal.scene.tier, cover.scene.tier);
    assert.equal(reveal.scene.reveal, cover.scene.reveal);
    assert.equal(ui.gates.at(-1).active, false);
    if (!hasDock) assert.equal(reveal.scene, cover.scene, "Rexonance preserves its scene metadata");
    ui.cleanup();
  });
}

test("Back before an immediate route's first frame also cancels its navigation", async () => {
  const ui = mount();
  const pending = ui.go({ to: "/characters/dante" });
  ui.history("BACK");
  await ui.flushFrames();
  await settleGo(ui, pending);
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
    await settleGo(ui, pending);
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
  await settleGo(ui, pending);
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
    await settleGo(ui, pending);
    assert.equal(
      ui.alignments.length,
      1,
      "later frames/timers must preserve the user's new focus position",
    );
    ui.cleanup();
  });
}

for (const action of ["BACK", "pagehide", "unmount"]) {
  test(`rx17: ${action} releases the go-owned background warmup pause immediately`, async () => {
    let releasePreparation;
    const ui = mount("/world", {
      prepareCalls: () => ({
        promise: new Promise((resolve) => {
          releasePreparation = resolve;
        }),
        cancel: () => releasePreparation(null),
      }),
    });
    const pending = ui.go({ to: "/rexonance-saga" });
    assert.equal(ui.suitWarmHolds(), 1, "go pauses background work synchronously");
    if (action === "BACK") ui.history("BACK");
    else if (action === "pagehide") ui.pagehide();
    else ui.cleanup();
    assert.equal(ui.suitWarmHolds(), 0, "cancellation releases even before preparation settles");
    await settleGo(ui, pending);
    assert.equal(ui.suitWarmHolds(), 0, "finally cannot release another transition's ownership");
    if (action !== "unmount") ui.cleanup();
  });
}

test("rx17: a successful direct go resumes background warming once it has navigated", async () => {
  const ui = mount();
  ui.reduceMotion();
  const pending = ui.go({ to: "/plain-destination" });
  assert.equal(ui.suitWarmHolds(), 1);
  await settleGo(ui, pending);
  assert.equal(ui.navigations.length, 1);
  assert.equal(ui.suitWarmHolds(), 0);
  ui.cleanup();
  assert.equal(ui.suitWarmHolds(), 0);
});

for (const action of ["BACK", "hidden", "pagehide", "unmount"]) {
  test(`rx17: ${action} between menu-close frames releases busy and holds before the call mounts`, async () => {
    const ui = mount();
    const pending = ui.go({ to: "/rexonance-saga" });
    await ui.flushFrames();
    assert.equal(
      ui.gates.filter((gate) => gate.active).length,
      0,
      "the closing menu paints before the cover mounts",
    );
    assert.equal(ui.suitWarmHolds(), 1);
    if (action === "BACK") ui.history(action);
    else if (action === "hidden") ui.visibility(true);
    else if (action === "pagehide") ui.pagehide();
    else ui.cleanup();
    assert.equal(ui.suitWarmHolds(), 0);
    assert.equal(ui.root.dataset.routeScrollSettling, undefined);
    await settleGo(ui, pending);
    assert.equal(ui.gates.filter((gate) => gate.active).length, 0);
    assert.equal(ui.navigations.length, 0);
    if (action !== "unmount") {
      ui.visibility(false);
      ui.releaseWarmup();
      await settleGo(ui, ui.go({ to: "/characters/ciel" }));
      assert.equal(
        ui.navigations.at(-1).to,
        "/characters/ciel",
        "the cancelled prepaint operation must release the navigation guard",
      );
      assert.equal(ui.suitWarmHolds(), 0);
      ui.cleanup();
    }
  });
}

test("rx17: the decoded-layer plan wait is high priority and cannot hold navigation past its budget", async () => {
  const priorities = [];
  const ui = mount("/world", {
    suitReady: true,
    preparePlan: (priority) => {
      priorities.push(priority);
      return new Promise(() => {});
    },
  });
  const pending = ui.go({ to: "/rexonance-saga" });
  await flushUntil(ui, () => priorities.length === 1, "decoded layers must prepare their plan");
  assert.deepEqual(priorities, ["high"]);
  assert.equal(ui.gates.filter((gate) => gate.active).length, 0);
  assert.ok(ui.pendingTimers() > 0, "the plan wait has a finite caller-owned deadline");
  assert.ok(
    ui.pendingTimerDelays().includes(1800),
    "decoded images still need the full sliced-plan budget",
  );
  assert.equal(
    ui.pendingTimerDelays().includes(120),
    false,
    "bitmap readiness must not shorten unfinished plan work",
  );
  await ui.flushTimers();
  ui.releaseWarmup();
  await reachRexonanceHold(ui);
  assert.equal(ui.gates.at(-1).rexonanceSuit, "build");
  await settleGo(ui, pending);
  assert.equal(ui.navigations.at(-1).to, "/rexonance-saga");
  assert.equal(ui.suitWarmHolds(), 0);
  ui.cleanup();
});

test("rx17: Back during bounded plan preparation cannot revive a call over the next route", async () => {
  let releasePlan;
  const ui = mount("/world", {
    suitReady: true,
    preparePlan: () =>
      new Promise((resolve) => {
        releasePlan = resolve;
      }),
  });
  const stale = ui.go({ to: "/rexonance-saga" });
  await flushUntil(ui, () => Boolean(releasePlan), "the plan wait must begin before cancellation");
  ui.history("BACK");
  assert.equal(ui.suitWarmHolds(), 0);
  assert.equal(ui.root.dataset.loading, undefined);
  const latest = ui.go({ to: "/characters/ciel" });
  ui.releaseWarmup();
  releasePlan(true);
  await ui.flushFrames();
  assert.equal(ui.gates.at(-1).variant, "ciel");
  assert.equal(ui.root.dataset.loading, "true");
  await settleGo(ui, Promise.all([stale, latest]));
  assert.equal(ui.navigations.filter(({ to }) => to === "/rexonance-saga").length, 0);
  assert.equal(ui.navigations.at(-1).to, "/characters/ciel");
  assert.equal(ui.suitWarmHolds(), 0);
  ui.cleanup();
});

test("rx17: a rejected pre-gate plan preparation leaves the call's fallback and cleanup usable", async () => {
  const ui = mount("/world", {
    suitReady: true,
    preparePlan: () => Promise.reject(new Error("plan unavailable")),
  });
  const pending = ui.go({ to: "/rexonance-saga" });
  ui.releaseWarmup();
  await reachRexonanceHold(ui);
  await settleGo(ui, pending);
  assert.equal(ui.navigations.at(-1).to, "/rexonance-saga");
  assert.equal(ui.gates.at(-1).active, false);
  assert.equal(ui.suitWarmHolds(), 0);
  ui.cleanup();
});

for (const action of ["BACK", "hidden", "pagehide", "unmount"]) {
  test(`rx17: ${action} cancels cold decoder preparation before the cinematic clock starts`, async () => {
    let releaseDecode,
      plans = 0;
    const ui = mount("/world", {
      warmSuit: () =>
        new Promise((resolve) => {
          releaseDecode = resolve;
        }),
      preparePlan: () => {
        plans++;
        return Promise.resolve(true);
      },
    });
    const stale = ui.go({ to: "/rexonance-saga" });
    await flushUntil(
      ui,
      () => ui.pendingTimers() > 0,
      "cold decoding must have a bounded, caller-owned preparation timer",
    );
    assert.ok(ui.signals.includes("running"), "the source page shows preparation feedback");
    assert.equal(ui.gates.filter((gate) => gate.active).length, 0);
    assert.equal(ui.root.dataset.loading, undefined, "the cover and call clock have not started");
    assert.equal(plans, 0, "plan preparation waits for real decoded sources");
    if (action === "BACK") ui.history(action);
    else if (action === "hidden") ui.visibility(true);
    else if (action === "pagehide") ui.pagehide();
    else ui.cleanup();
    assert.equal(ui.pendingTimers(), 0, "cancellation clears the decoder deadline immediately");
    assert.equal(ui.suitWarmHolds(), 0);
    assert.equal(ui.root.dataset.routeScrollSettling, undefined);
    await settleGo(ui, stale);
    ui.setSuitReady(true);
    releaseDecode(true);
    await ui.flushFrames();
    assert.equal(plans, 0, "a late decoder must never prepare or revive the cancelled call");
    assert.equal(ui.gates.filter((gate) => gate.active).length, 0);
    assert.equal(ui.navigations.length, 0);
    if (action !== "unmount") {
      ui.visibility(false);
      ui.releaseWarmup();
      await settleGo(ui, ui.go({ to: "/characters/ciel" }));
      assert.equal(ui.navigations.at(-1).to, "/characters/ciel");
      assert.equal(ui.suitWarmHolds(), 0);
      ui.cleanup();
    }
  });
}

test("rx17: cold decoding and high-priority plan finish before the full-timing call mounts", async () => {
  let releaseDecode, releasePlan;
  const priorities = [];
  const ui = mount("/world", {
    warmSuit: () =>
      new Promise((resolve) => {
        releaseDecode = resolve;
      }),
    preparePlan: (priority) => {
      priorities.push(priority);
      return new Promise((resolve) => {
        releasePlan = resolve;
      });
    },
  });
  const pending = ui.go({ to: "/rexonance-saga" });
  await flushUntil(ui, () => ui.pendingTimers() > 0, "cold preparation must begin");
  ui.setSuitReady(true);
  releaseDecode(true);
  await flushUntil(
    ui,
    () => Boolean(releasePlan),
    "decoded layers must prepare the real engine plan",
  );
  assert.deepEqual(priorities, ["high"]);
  assert.equal(ui.gates.filter((gate) => gate.active).length, 0);
  releasePlan(true);
  ui.releaseWarmup();
  await reachRexonanceHold(ui);
  assert.equal(ui.gates.at(-1).rexonanceSuit, "build");
  assert.equal(
    REXONANCE_ENTRY_TIMINGS.cover,
    2730,
    "preparation cannot shorten or extend the call beats",
  );
  await settleGo(ui, pending);
  assert.equal(ui.navigations.at(-1).to, "/rexonance-saga");
  assert.equal(ui.suitWarmHolds(), 0);
  ui.cleanup();
});

test("rx17: stalled cold decoding reaches whole fallback after its preparation deadline", async () => {
  let plans = 0;
  const ui = mount("/world", {
    warmSuit: () => new Promise(() => {}),
    preparePlan: () => {
      plans++;
      return Promise.resolve(true);
    },
  });
  const pending = ui.go({ to: "/rexonance-saga" });
  await flushUntil(ui, () => ui.pendingTimers() > 0, "cold preparation must have a deadline");
  assert.equal(ui.gates.filter((gate) => gate.active).length, 0);
  await ui.flushTimers();
  ui.releaseWarmup();
  await reachRexonanceHold(ui);
  assert.equal(ui.gates.at(-1).rexonanceSuit, "whole");
  assert.equal(plans, 0);
  await settleGo(ui, pending);
  assert.equal(ui.navigations.at(-1).to, "/rexonance-saga");
  assert.equal(ui.suitWarmHolds(), 0);
  ui.cleanup();
});

test("rx17: a plan chunk resolving after Back cannot start preparation over a newer route", async () => {
  let releaseModule,
    plans = 0;
  const ui = mount("/world", {
    suitReady: true,
    loadPlan: () =>
      new Promise((resolve) => {
        releaseModule = resolve;
      }),
  });
  const stale = ui.go({ to: "/rexonance-saga" });
  await flushUntil(ui, () => Boolean(releaseModule), "the high-intent plan import must start");
  assert.equal(ui.gates.filter((gate) => gate.active).length, 0);
  ui.history("BACK");
  assert.equal(ui.pendingTimers(), 0);
  assert.equal(ui.suitWarmHolds(), 0);
  await settleGo(ui, stale);
  const latest = ui.go({ to: "/characters/ciel" });
  releaseModule({
    prepareRexonanceSuit: () => {
      plans++;
      return Promise.resolve(true);
    },
  });
  ui.releaseWarmup();
  await settleGo(ui, latest);
  assert.equal(plans, 0, "an unabortable late import still checks transition ownership");
  assert.equal(ui.navigations.at(-1).to, "/characters/ciel");
  assert.equal(ui.navigations.filter(({ to }) => to === "/rexonance-saga").length, 0);
  assert.equal(ui.suitWarmHolds(), 0);
  ui.cleanup();
});

for (const mode of ["economy", "reduced"]) {
  test(`rx17: ${mode} entries never wait for cold decoder or plan preparation`, async () => {
    let warms = 0,
      plans = 0;
    const ui = mount("/world", {
      warmSuit: () => {
        warms++;
        return new Promise(() => {});
      },
      preparePlan: () => {
        plans++;
        return new Promise(() => {});
      },
    });
    if (mode === "economy") ui.economy();
    else ui.reduceMotion();
    const pending = ui.go({ to: "/rexonance-saga" });
    ui.releaseWarmup();
    await settleGo(ui, pending);
    assert.equal(warms, 0, "a still entry must not create a decoder wait");
    assert.equal(plans, 0);
    assert.equal(ui.navigations.at(-1).to, "/rexonance-saga");
    assert.equal(ui.suitWarmHolds(), 0);
    ui.cleanup();
  });
}

test("the fixture rejects a stalled operation within its flush budget instead of awaiting forever", async () => {
  let frames = 0;
  const ui = {
    flushFrames: async () => {
      frames += 1;
    },
    flushTimers: async () => {},
  };
  await assert.rejects(
    settleGo(ui, new Promise(() => {})),
    /must settle without a stuck frame or hold/,
  );
  assert.equal(frames, 24);
});
