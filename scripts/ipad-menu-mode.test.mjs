import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  IPAD_MENU_STORAGE_KEY,
  getIpadMenuScrolled,
  getIpadMenuServerSnapshot,
  getIpadMenuSnapshot,
  readIpadMenuPreference,
  setIpadMenuMode,
  watchIpadMenuMode,
} from "../src/lib/ipad-menu-mode.js";

test("iPad defaults ON for missing/invalid preferences and retains an explicit OFF", () => {
  for (const value of [null, "1", "true", "invalid"]) {
    assert.equal(readIpadMenuPreference({ getItem: () => value }), true);
  }
  assert.equal(readIpadMenuPreference({ getItem: () => "0" }), false);
  const denied = {
    getItem: () => {
      throw new Error("Denied");
    },
  };
  assert.equal(readIpadMenuPreference(denied), true);
  assert.equal(readIpadMenuPreference(denied, false), false);
  assert.equal(getIpadMenuServerSnapshot(), "unavailable");
});

test("the trigger changes exactly when measured chrome completely exits, except while locked", () => {
  for (const height of [76, 78, 139, 191]) {
    assert.equal(getIpadMenuScrolled(false, height - 0.1, height), false);
    assert.equal(getIpadMenuScrolled(false, height, height), true);
    assert.equal(getIpadMenuScrolled(true, height - 0.1, height), false);
  }
  assert.equal(getIpadMenuScrolled(false, 0, 0), false);
  assert.equal(getIpadMenuScrolled(false, -10, 76), false);
  assert.equal(getIpadMenuScrolled(true, 0, 76, true), true);
  assert.equal(getIpadMenuScrolled(false, 300, 76, true), false);
  assert.equal(getIpadMenuScrolled(true, Number.NaN, 76), true);
  assert.equal(getIpadMenuScrolled(false, 300, Number.NaN), false);
});

function fixture({
  ipad = true,
  preference = "1",
  denied = false,
  route = "world",
  motion = false,
} = {}) {
  const attrs = new Map([
    ...(ipad ? [["data-ipad-viewport", "contained"]] : []),
    ["data-viewport-chrome", route],
  ]);
  const listeners = new Map();
  const frames = new Map();
  const timers = new Map();
  const timerHistory = [];
  const documentListeners = new Map();
  const mediaListeners = new Map();
  const reduced = {
    matches: false,
    addEventListener: (type, listener) => mediaListeners.set(type, listener),
    removeEventListener: (type) => mediaListeners.delete(type),
  };
  const observations = [];
  const variables = new Map();
  const sizeTargets = new Set();
  let sequence = 0;
  let disconnected = false;
  let treeDisconnected = false;
  let sizeDisconnected = false;
  let measurements = 0;
  let writes = 0;
  let geometryReads = 0;
  let notifyStyle;
  let notifyTree;
  let notifyResize;
  const sizes = { header: 76, nav: 63 };
  const trigger = {
    getBoundingClientRect: () => {
      geometryReads++;
      return attrs.get("data-ipad-menu-scrolled") === "true"
        ? { left: 940, top: 596, width: 60, height: 60 }
        : { left: 950, top: 16 - Math.min(76, win.scrollY), width: 44, height: 44 };
    },
  };
  const header = {
    isConnected: true,
    querySelector: () => (motion ? trigger : null),
    get offsetHeight() {
      measurements++;
      return sizes.header;
    },
  };
  const nav = {
    isConnected: true,
    get offsetHeight() {
      measurements++;
      return sizes.nav;
    },
  };
  const elements = new Map([
    [".topbar", header],
    [".gallery-topbar", header],
    [".dream-site-header", header],
    [".dream-chapter-nav", nav],
  ]);
  const root = {
    style: {
      overflow: "",
      getPropertyValue: (name) => variables.get(name) ?? "",
      setProperty: (name, value) => {
        writes++;
        variables.set(name, value);
      },
      removeProperty: (name) => variables.delete(name),
    },
    getAttribute: (key) => attrs.get(key) ?? null,
    setAttribute: (key, value) => attrs.set(key, value),
    removeAttribute: (key) => attrs.delete(key),
  };
  const doc = {
    documentElement: root,
    hidden: false,
    addEventListener: (type, listener) => documentListeners.set(type, listener),
    removeEventListener: (type) => documentListeners.delete(type),
    body: { style: { position: "", top: "" } },
    querySelector: (selector) => elements.get(selector) ?? null,
  };
  const storage = {
    getItem: () => preference,
    setItem: (_, value) => {
      preference = value;
    },
  };
  const win = {
    scrollY: 100,
    innerWidth: 1024,
    innerHeight: 768,
    ...(motion
      ? {
          matchMedia: () => reduced,
          setTimeout: (callback, duration) => {
            assert.equal(duration, 900);
            const id = ++sequence;
            timers.set(id, callback);
            timerHistory.push(callback);
            return id;
          },
          clearTimeout: (id) => timers.delete(id),
        }
      : {}),
    get localStorage() {
      if (denied) throw new Error("Denied");
      return storage;
    },
    addEventListener: (name, callback, options) => listeners.set(name, { callback, options }),
    removeEventListener: (name) => listeners.delete(name),
    dispatchEvent: (event) => listeners.get(event.type)?.callback(event),
    requestAnimationFrame: (callback) => {
      frames.set(++sequence, callback);
      return sequence;
    },
    cancelAnimationFrame: (id) => frames.delete(id),
    MutationObserver: class {
      constructor(callback) {
        this.callback = callback;
      }
      observe(target, options) {
        observations.push({ target, options });
        this.tree = Boolean(options.childList);
        if (this.tree) notifyTree = this.callback;
        else notifyStyle = this.callback;
      }
      disconnect() {
        if (this.tree) treeDisconnected = true;
        else disconnected = true;
      }
    },
    ResizeObserver: class {
      constructor(callback) {
        notifyResize = callback;
      }
      observe(target) {
        sizeTargets.add(target);
        sizeDisconnected = false;
      }
      disconnect() {
        sizeTargets.clear();
        sizeDisconnected = true;
      }
    },
  };
  const flush = () => {
    const pending = [...frames.values()];
    frames.clear();
    for (const callback of pending) callback();
  };
  return {
    win,
    doc,
    attrs,
    listeners,
    frames,
    observations,
    variables,
    timers,
    timerHistory,
    reduced,
    documentListeners,
    mediaListeners,
    expireMotion: () => {
      const pending = [...timers.values()];
      timers.clear();
      for (const callback of pending) callback();
    },
    visibilityChanged: () => documentListeners.get("visibilitychange")?.(),
    reducedChanged: () => mediaListeners.get("change")?.(),
    elements,
    sizes,
    sizeTargets,
    flush,
    notifyStyle: () => notifyStyle([{ target: root, attributeName: "style" }]),
    notifyRoot: (attributeName) => notifyStyle([{ target: root, attributeName }]),
    notifyTree: () => notifyTree([{ target: doc.body, type: "childList" }]),
    notifyResize: () => notifyResize(),
    emit: (type, payload = {}) => win.dispatchEvent({ type, ...payload }),
    get disconnected() {
      return disconnected;
    },
    get treeDisconnected() {
      return treeDisconnected;
    },
    get sizeDisconnected() {
      return sizeDisconnected;
    },
    get measurements() {
      return measurements;
    },
    get writes() {
      return writes;
    },
    get geometryReads() {
      return geometryReads;
    },
  };
}

test("only actual scroll boundaries launch a measured one-shot convergence or expansion", () => {
  const f = fixture({ motion: true });
  f.win.scrollY = 0;
  const dispose = watchIpadMenuMode(f.win, f.doc);
  f.flush();
  assert.equal(f.attrs.has("data-ipad-menu-motion"), false, "initial restoration never flies");
  const scroll = (y) => {
    f.win.scrollY = y;
    f.emit("scroll");
    f.flush();
  };
  scroll(76);
  assert.equal(f.attrs.get("data-ipad-menu-scrolled"), "true");
  assert.equal(f.attrs.get("data-ipad-menu-motion"), "converge");
  assert.equal(f.variables.get("--ipad-menu-origin-x"), "2px");
  assert.equal(f.variables.get("--ipad-menu-origin-y"), "-664px");
  assert.equal(f.geometryReads, 2, "two settled rectangles at the boundary only");
  const oldCompletion = f.timerHistory[0];
  scroll(400);
  assert.equal(f.geometryReads, 2);
  scroll(0);
  assert.equal(f.attrs.get("data-ipad-menu-motion"), "expand");
  assert.equal(f.variables.get("--ipad-menu-origin-y"), "-588px");
  assert.equal(f.timers.size, 1, "reversal cancels the old completion");
  oldCompletion();
  assert.equal(
    f.attrs.get("data-ipad-menu-motion"),
    "expand",
    "stale callback cannot erase the new motion",
  );
  f.expireMotion();
  assert.equal(f.attrs.has("data-ipad-menu-motion"), false);
  assert.equal(f.variables.has("--ipad-menu-origin-y"), false);
  dispose();
  assert.equal(f.documentListeners.size, 0);
  assert.equal(f.mediaListeners.size, 0);
});

test("resize, routes, locks and device preference reconciliation cannot replay scroll motion", () => {
  const f = fixture({ motion: true });
  f.win.scrollY = 0;
  const dispose = watchIpadMenuMode(f.win, f.doc);
  f.flush();
  f.win.scrollY = 200;
  f.emit("resize");
  f.emit("scroll");
  f.flush();
  assert.equal(f.attrs.get("data-ipad-menu-scrolled"), "true");
  assert.equal(f.attrs.has("data-ipad-menu-motion"), false);
  f.win.scrollY = 0;
  f.emit("scroll");
  f.flush();
  assert.equal(f.attrs.get("data-ipad-menu-motion"), "expand");
  f.doc.body.style.position = "fixed";
  f.notifyStyle();
  f.flush();
  assert.equal(f.attrs.has("data-ipad-menu-motion"), false);
  f.doc.body.style.position = "";
  f.win.scrollY = 200;
  f.notifyStyle();
  f.emit("scroll");
  f.flush();
  assert.equal(f.attrs.get("data-ipad-menu-scrolled"), "true");
  assert.equal(
    f.attrs.has("data-ipad-menu-motion"),
    false,
    "unlock scroll is restoration, not a gesture",
  );
  f.attrs.set("data-viewport-chrome", "dream");
  f.win.scrollY = 0;
  f.notifyRoot("data-viewport-chrome");
  f.emit("scroll");
  f.flush();
  assert.equal(f.attrs.has("data-ipad-menu-motion"), false);
  assert.equal(f.geometryReads, 2);
  dispose();
  assert.equal(f.timers.size, 0);
});

test("hidden and reduced-motion transitions cancel decorative work without changing native scrolling", () => {
  const f = fixture({ motion: true });
  f.win.scrollY = 0;
  const dispose = watchIpadMenuMode(f.win, f.doc);
  f.flush();
  const scroll = (y) => {
    f.win.scrollY = y;
    f.emit("scroll");
    f.flush();
  };
  scroll(200);
  f.reduced.matches = true;
  f.reducedChanged();
  assert.equal(f.attrs.has("data-ipad-menu-motion"), false);
  assert.equal(f.timers.size, 0);
  scroll(0);
  scroll(200);
  assert.equal(f.attrs.get("data-ipad-menu-scrolled"), "true");
  assert.equal(f.attrs.has("data-ipad-menu-motion"), false);
  f.reduced.matches = false;
  f.reducedChanged();
  scroll(0);
  scroll(200);
  assert.equal(f.attrs.get("data-ipad-menu-motion"), "converge");
  f.doc.hidden = true;
  f.visibilityChanged();
  assert.equal(f.attrs.has("data-ipad-menu-motion"), false);
  assert.equal(f.timers.size, 0);
  scroll(0);
  assert.equal(f.win.scrollY, 0);
  assert.equal(f.attrs.get("data-ipad-menu-scrolled"), "false");
  assert.equal(f.attrs.has("data-ipad-menu-motion"), false);
  dispose();
});

test("controller preserves compact state through lock/unlock, batches scrolling and cleans up", () => {
  const f = fixture();
  const dispose = watchIpadMenuMode(f.win, f.doc);
  f.flush();
  assert.equal(f.attrs.get("data-ipad-menu"), "compact");
  assert.equal(f.attrs.get("data-ipad-menu-scrolled"), "true");
  assert.equal(f.variables.get("--ipad-header-scroll"), "76px");
  assert.deepEqual(f.listeners.get("scroll").options, { passive: true });
  f.doc.body.style.position = "fixed";
  f.win.scrollY = 0;
  f.notifyStyle();
  f.emit("scroll");
  f.emit("scroll");
  assert.equal(f.frames.size, 1);
  f.flush();
  assert.equal(f.attrs.get("data-ipad-menu-scrolled"), "true");
  assert.equal(f.variables.get("--ipad-header-scroll"), "76px");
  f.doc.body.style.position = "";
  f.doc.documentElement.style.overflow = "hidden";
  f.notifyStyle();
  f.flush();
  assert.equal(f.attrs.get("data-ipad-menu-scrolled"), "true");
  f.doc.documentElement.style.overflow = "";
  f.win.scrollY = 100;
  f.notifyStyle();
  f.flush();
  assert.equal(f.attrs.get("data-ipad-menu-scrolled"), "true");
  f.win.scrollY = 0;
  f.emit("dw-ipad-menu-change"); // Route-settle refresh uses the same path.
  f.flush();
  assert.equal(f.attrs.get("data-ipad-menu-scrolled"), "false");
  assert.deepEqual(
    f.observations
      .filter(({ options }) => options.attributes)
      .map(({ options }) => options.attributeFilter),
    [["style", "data-ipad-viewport", "data-viewport-chrome"], ["style"]],
  );
  f.emit("scroll");
  dispose();
  assert.equal(f.frames.size, 0);
  assert.equal(f.listeners.size, 0);
  assert.equal(f.disconnected, true);
  assert.equal(f.treeDisconnected, true);
  assert.equal(f.sizeDisconnected, true);
});

test("scroll position follows the full header and Dream nav without per-scroll measurement", () => {
  const f = fixture({ route: "dream" });
  const dispose = watchIpadMenuMode(f.win, f.doc);
  f.flush();
  assert.equal(f.variables.get("--ipad-header-height"), "76px");
  assert.equal(f.variables.get("--ipad-header-exit-distance"), "139px");
  assert.equal(f.variables.get("--ipad-header-scroll"), "100px");
  assert.equal(f.attrs.get("data-ipad-menu-scrolled"), "false");
  assert.equal(f.sizeTargets.size, 2);
  const initialMeasurements = f.measurements;
  for (const scrollY of [125, 138.9, 139, 300, 138, 0, -20]) {
    f.win.scrollY = scrollY;
    f.emit("scroll");
    f.flush();
    assert.equal(f.attrs.get("data-ipad-menu-scrolled"), String(scrollY >= 139));
    assert.equal(
      f.variables.get("--ipad-header-scroll"),
      `${Math.max(0, Math.min(139, scrollY))}px`,
    );
  }
  assert.equal(f.measurements, initialMeasurements);
  const initialWrites = f.writes;
  f.emit("scroll");
  f.flush();
  assert.equal(f.writes, initialWrites, "the same clamped offset does not rewrite style");
  f.notifyStyle(); // Our own CSS variables must not schedule another RAF.
  assert.equal(f.frames.size, 0);
  dispose();
});

test("route and responsive geometry changes update the threshold and observer targets", () => {
  const f = fixture();
  const dispose = watchIpadMenuMode(f.win, f.doc);
  f.flush();
  assert.equal(f.attrs.get("data-ipad-menu-scrolled"), "true");
  f.attrs.set("data-viewport-chrome", "dream");
  f.notifyRoot("data-viewport-chrome");
  f.flush();
  assert.equal(f.attrs.get("data-ipad-menu-scrolled"), "false");
  assert.equal(f.sizeTargets.size, 2);
  f.sizes.header = 90;
  f.sizes.nav = 100;
  f.win.scrollY = 160;
  f.notifyResize();
  f.flush();
  assert.equal(f.variables.get("--ipad-header-exit-distance"), "190px");
  assert.equal(f.attrs.get("data-ipad-menu-scrolled"), "false");
  f.sizes.nav = 40;
  f.emit("resize");
  f.flush();
  assert.equal(f.variables.get("--ipad-header-exit-distance"), "130px");
  assert.equal(f.attrs.get("data-ipad-menu-scrolled"), "true");
  f.attrs.set("data-viewport-chrome", "gallery");
  f.emit("dw-ipad-menu-change");
  f.flush();
  assert.equal(f.sizeTargets.size, 1);
  assert.equal(f.variables.get("--ipad-header-exit-distance"), "90px");
  dispose();
});

test("fast reverse scroll uses the latest offset, and a missing header never invents a threshold", () => {
  const f = fixture();
  const dispose = watchIpadMenuMode(f.win, f.doc);
  f.flush();
  for (const scrollY of [120, 500, 80, 75]) {
    f.win.scrollY = scrollY;
    f.emit("scroll");
  }
  assert.equal(f.frames.size, 1);
  f.flush();
  assert.equal(f.attrs.get("data-ipad-menu-scrolled"), "false");
  assert.equal(f.variables.get("--ipad-header-scroll"), "75px");
  f.elements.delete(".topbar");
  f.win.scrollY = 500;
  f.emit("dw-ipad-menu-change");
  f.flush();
  assert.equal(f.variables.get("--ipad-header-exit-distance"), "0px");
  assert.equal(f.attrs.get("data-ipad-menu-scrolled"), "false");
  dispose();
});

test("a lazy route measures late-mounted chrome without another route or resize event", () => {
  const f = fixture({ route: "gallery" });
  const dreamHeader = f.elements.get(".dream-site-header");
  const dreamNav = f.elements.get(".dream-chapter-nav");
  f.elements.delete(".dream-site-header");
  f.elements.delete(".dream-chapter-nav");
  const dispose = watchIpadMenuMode(f.win, f.doc);
  f.flush();
  f.attrs.set("data-viewport-chrome", "dream");
  f.notifyRoot("data-viewport-chrome");
  f.win.scrollY = 40;
  f.flush();
  assert.equal(f.variables.get("--ipad-header-height"), "0px");
  assert.equal(f.sizeTargets.size, 0);
  f.elements.set(".dream-site-header", dreamHeader);
  f.notifyTree();
  f.flush();
  assert.equal(f.variables.get("--ipad-header-height"), "76px");
  assert.equal(f.variables.get("--ipad-header-scroll"), "40px");
  assert.equal(f.sizeTargets.size, 1);
  f.elements.set(".dream-chapter-nav", dreamNav);
  f.notifyTree();
  f.flush();
  assert.equal(f.variables.get("--ipad-header-exit-distance"), "139px");
  assert.equal(f.attrs.get("data-ipad-menu-scrolled"), "false");
  assert.equal(f.sizeTargets.size, 2);
  const measurements = f.measurements;
  f.notifyTree(); // Unrelated gallery/modal/text content must not schedule geometry.
  assert.equal(f.frames.size, 0);
  assert.equal(f.measurements, measurements);
  assert.deepEqual(f.observations.find(({ options }) => options.childList).options, {
    childList: true,
    subtree: true,
  });
  dispose();
  assert.equal(f.treeDisconnected, true);
});

test("replacing a mounted header on the same route reconnects geometry observation", () => {
  const f = fixture();
  const dispose = watchIpadMenuMode(f.win, f.doc);
  f.flush();
  const oldHeader = f.elements.get(".topbar");
  oldHeader.isConnected = false;
  const replacement = { offsetHeight: 120, isConnected: true };
  f.elements.set(".topbar", replacement);
  f.notifyTree();
  f.flush();
  assert.equal(f.variables.get("--ipad-header-height"), "120px");
  assert.equal(f.attrs.get("data-ipad-menu-scrolled"), "false");
  assert.equal(f.sizeTargets.has(oldHeader), false);
  assert.equal(f.sizeTargets.has(replacement), true);
  dispose();
});

test("storage changes sync without affecting unrelated preferences or non-iPad browsers", () => {
  const f = fixture();
  const dispose = watchIpadMenuMode(f.win, f.doc);
  f.emit("storage", { key: "unrelated", newValue: "0" });
  assert.equal(f.attrs.get("data-ipad-menu"), "compact");
  f.emit("storage", { key: IPAD_MENU_STORAGE_KEY, newValue: "0" });
  assert.equal(f.attrs.has("data-ipad-menu"), false);
  assert.equal(f.attrs.has("data-ipad-menu-scrolled"), false);
  f.emit("storage", { key: IPAD_MENU_STORAGE_KEY, newValue: "1" });
  assert.equal(f.attrs.get("data-ipad-menu"), "compact");
  f.emit("storage", { key: null, newValue: null });
  assert.equal(f.attrs.get("data-ipad-menu"), "compact");
  f.emit("storage", { key: IPAD_MENU_STORAGE_KEY, newValue: "0", storageArea: {} });
  assert.equal(f.attrs.get("data-ipad-menu"), "compact");
  dispose();
  for (const options of [{ ipad: false }, { preference: "0" }]) {
    const other = fixture(options);
    const cleanup = watchIpadMenuMode(other.win, other.doc);
    other.flush();
    assert.equal(other.attrs.has("data-ipad-menu"), false);
    const measurements = other.measurements;
    other.emit("scroll");
    assert.equal(other.frames.size, 0);
    assert.equal(other.measurements, measurements);
    cleanup();
  }
  for (const options of [{ denied: true }, { preference: null }, { preference: "invalid" }]) {
    const other = fixture(options);
    const cleanup = watchIpadMenuMode(other.win, other.doc);
    other.flush();
    assert.equal(other.attrs.get("data-ipad-menu"), "compact");
    cleanup();
  }
});

test("a denied write preserves both on and off choices through route refreshes", () => {
  const oldWindow = globalThis.window;
  const oldDocument = globalThis.document;
  const f = fixture({ denied: true });
  globalThis.window = f.win;
  globalThis.document = f.doc;
  const dispose = watchIpadMenuMode(f.win, f.doc);
  try {
    assert.equal(getIpadMenuSnapshot(), "on");
    setIpadMenuMode(true);
    f.flush();
    assert.equal(getIpadMenuSnapshot(), "on");
    assert.equal(f.attrs.get("data-ipad-menu-scrolled"), "true");
    f.emit("dw-ipad-menu-change");
    f.flush();
    assert.equal(getIpadMenuSnapshot(), "on");
    setIpadMenuMode(false);
    f.flush();
    f.emit("dw-ipad-menu-change");
    f.flush();
    assert.equal(getIpadMenuSnapshot(), "off");
    assert.equal(f.attrs.has("data-ipad-menu-scrolled"), false);
    assert.equal(f.variables.size, 0);
    assert.equal(f.attrs.get("data-ipad-menu-preference"), "off");
  } finally {
    dispose();
    if (oldWindow === undefined) delete globalThis.window;
    else globalThis.window = oldWindow;
    if (oldDocument === undefined) delete globalThis.document;
    else globalThis.document = oldDocument;
  }
});

test("an in-memory OFF survives controller remounts when storage is denied", () => {
  const f = fixture({ denied: true });
  f.attrs.set("data-ipad-menu-preference", "off");
  const dispose = watchIpadMenuMode(f.win, f.doc);
  f.flush();
  assert.equal(f.attrs.has("data-ipad-menu"), false);
  dispose();
  const remount = watchIpadMenuMode(f.win, f.doc);
  f.flush();
  assert.equal(f.attrs.has("data-ipad-menu"), false);
  remount();
});

test("late device detection initializes the default and window resize remains a fallback", () => {
  const f = fixture({ ipad: false, preference: null });
  f.win.ResizeObserver = undefined;
  const dispose = watchIpadMenuMode(f.win, f.doc);
  f.flush();
  f.attrs.set("data-ipad-viewport", "contained");
  f.notifyRoot("data-ipad-viewport");
  f.flush();
  assert.equal(f.attrs.get("data-ipad-menu"), "compact");
  assert.equal(f.variables.get("--ipad-header-height"), "76px");
  f.sizes.header = 120;
  f.emit("resize");
  f.flush();
  assert.equal(f.variables.get("--ipad-header-height"), "120px");
  assert.equal(f.attrs.get("data-ipad-menu-scrolled"), "false");
  f.attrs.delete("data-ipad-viewport");
  f.notifyRoot("data-ipad-viewport");
  f.flush();
  assert.equal(f.attrs.has("data-ipad-menu"), false);
  assert.equal(f.variables.size, 0);
  dispose();
});

test("root has one controller and sidebar toggle is accessible and hydration-safe", () => {
  const source = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
  const root = source("src/routes/__root.tsx");
  const component = source("src/components/ipad-menu-mode.tsx");
  assert.equal(root.split("<IpadMenuMode />").length - 1, 1);
  assert.match(component, /useSyncExternalStore/);
  assert.match(component, /aria-pressed=\{enabled\}/);
  assert.match(component, /aria-describedby=\{descriptionId\}/);
  assert.match(component, /className="side-panel-link-button ipad-menu-toggle"/);
  assert.match(component, /iPad省スペースメニュー/);
  assert.match(component, /このiPadに保存されます。/);
  assert.match(component, /iPadでは自動でオンになります。/);
  assert.match(component, /refreshIpadMenuMode\(\), \[pathname\]/);
  assert.doesNotMatch(
    source("src/lib/ipad-menu-mode.js"),
    /scrollTo\(|preventDefault\(|style\.overflow\s*=(?!=)/,
  );
});
