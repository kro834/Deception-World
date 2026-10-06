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

function mount(pathname = "/world", { preload } = {}) {
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
    queries = [];
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
    preloadRoute: (destination) => (preload ? preload(destination) : warmup),
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
      if (name === "@/lib/rexonance-calls") return { REXONANCE_ENTRY_TIMINGS };
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
    fallbacks,
    queries,
    releaseWarmup,
    activeObservers: () => observers.size,
    pendingTimers: () => timers.size,
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
    await pending;
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
    await pending;
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
      await Promise.all([stale, latest]);
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
    await pending;
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
    await ui.flushFrames();
    await ui.flushFrames();
    assert.equal(ui.activeObservers(), 1, "the live-preference hold is registered");
    if (action === "pagehide") ui.pagehide();
    else if (action === "unmount") ui.cleanup();
    else ui.history(action);
    await pending;
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
  await ui.flushFrames();
  await ui.flushFrames();
  assert.equal(ui.activeObservers(), 1);
  ui.reduceMotion();
  for (let index = 0; index < 16; index++) {
    await ui.flushFrames();
    await ui.flushTimers();
  }
  await pending;
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
    await pending;
    assert.equal(ui.navigations.length, 0, "returning to the tab must not revive a cancelled call");
  } finally {
    ui.cleanup();
  }
});

test("enabling economy rendering during the Rexonance hold ends its cinematic wait", async () => {
  const ui = mount();
  const pending = ui.go({ to: "/rexonance-saga" });
  ui.releaseWarmup();
  await ui.flushFrames();
  await ui.flushFrames();
  assert.equal(ui.activeObservers(), 1);
  ui.economy();
  assert.equal(ui.activeObservers(), 0, "the live preference releases the hold immediately");
  for (let index = 0; index < 16; index++) {
    await ui.flushFrames();
    await ui.flushTimers();
  }
  await pending;
  assert.equal(ui.navigations.length, 1);
  assert.equal(ui.gates.at(-1).active, false);
  assert.equal(ui.root.dataset.loading, undefined);
  ui.cleanup();
});

test("a stalled Rexonance warmup releases its cover and a late response cannot navigate", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const ui = mount();
  const pending = ui.go({ to: "/rexonance-saga", hash: "stages" });
  await ui.flushFrames();
  await ui.flushFrames();
  t.mock.timers.tick(ROUTE_WARMUP_DEADLINE_MS);
  await pending;
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
  await retry;
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
    await pending;
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
  await Promise.all([stale, latest]);
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
      await ui.flushFrames();
      await ui.flushFrames();
      if (phase !== "warmup") {
        ui.releaseWarmup();
        await ui.flushFrames();
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
      await Promise.all([stale, latest]);
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
  await rexonance;
  const ciel = ui.go({ to: "/characters/ciel" });
  ui.visibility(true);
  assert.equal(ui.root.dataset.loading, "true", "only an active Rexonance call uses this policy");
  assert.equal(ui.gates.at(-1).variant, "ciel");
  ui.visibility(false);
  for (let index = 0; index < 20; index++) {
    await ui.flushFrames();
    await ui.flushTimers();
  }
  await ciel;
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
    await pending;
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
