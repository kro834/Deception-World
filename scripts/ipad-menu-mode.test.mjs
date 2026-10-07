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

test("compact menu is opt-in and storage denial retains only the in-memory choice", () => {
  for (const value of [null, "0", "true", "invalid"]) {
    assert.equal(readIpadMenuPreference({ getItem: () => value }), false);
  }
  assert.equal(readIpadMenuPreference({ getItem: () => "1" }), true);
  const denied = {
    getItem: () => {
      throw new Error("Denied");
    },
  };
  assert.equal(readIpadMenuPreference(denied), false);
  assert.equal(readIpadMenuPreference(denied, true), true);
  assert.equal(getIpadMenuServerSnapshot(), "unavailable");
});

test("hysteresis keeps the button stable near the threshold and while a modal is locked", () => {
  assert.equal(getIpadMenuScrolled(false, 80), false);
  assert.equal(getIpadMenuScrolled(false, 81), true);
  assert.equal(getIpadMenuScrolled(true, 17), true);
  assert.equal(getIpadMenuScrolled(true, 16), false);
  assert.equal(getIpadMenuScrolled(true, 0, true), true);
  assert.equal(getIpadMenuScrolled(false, 300, true), false);
  assert.equal(getIpadMenuScrolled(true, Number.NaN), true);
});

function fixture({ ipad = true, preference = "1", denied = false } = {}) {
  const attrs = new Map(ipad ? [["data-ipad-viewport", "contained"]] : []);
  const listeners = new Map();
  const frames = new Map();
  const observations = [];
  let sequence = 0;
  let disconnected = false;
  let notifyStyle;
  const root = {
    style: { overflow: "" },
    getAttribute: (key) => attrs.get(key) ?? null,
    setAttribute: (key, value) => attrs.set(key, value),
    removeAttribute: (key) => attrs.delete(key),
  };
  const doc = { documentElement: root, body: { style: { position: "", top: "" } } };
  const storage = { getItem: () => preference };
  const win = {
    scrollY: 100,
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
        notifyStyle = callback;
      }
      observe(target, options) {
        observations.push({ target, options });
      }
      disconnect() {
        disconnected = true;
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
    flush,
    notifyStyle: () => notifyStyle(),
    emit: (type, payload = {}) => win.dispatchEvent({ type, ...payload }),
    get disconnected() {
      return disconnected;
    },
  };
}

test("controller preserves compact state through lock/unlock, batches scrolling and cleans up", () => {
  const f = fixture();
  const dispose = watchIpadMenuMode(f.win, f.doc);
  f.flush();
  assert.equal(f.attrs.get("data-ipad-menu"), "compact");
  assert.equal(f.attrs.get("data-ipad-menu-scrolled"), "true");
  assert.deepEqual(f.listeners.get("scroll").options, { passive: true });
  f.doc.body.style.position = "fixed";
  f.win.scrollY = 0;
  f.notifyStyle();
  f.emit("scroll");
  f.emit("scroll");
  assert.equal(f.frames.size, 1);
  f.flush();
  assert.equal(f.attrs.get("data-ipad-menu-scrolled"), "true");
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
    f.observations.map(({ options }) => options.attributeFilter),
    [["style", "data-ipad-viewport"], ["style"]],
  );
  f.emit("scroll");
  dispose();
  assert.equal(f.frames.size, 0);
  assert.equal(f.listeners.size, 0);
  assert.equal(f.disconnected, true);
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
  assert.equal(f.attrs.has("data-ipad-menu"), false);
  dispose();
  for (const options of [{ ipad: false }, { denied: true }, { preference: null }]) {
    const other = fixture(options);
    const cleanup = watchIpadMenuMode(other.win, other.doc);
    other.flush();
    assert.equal(other.attrs.has("data-ipad-menu"), false);
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
  } finally {
    dispose();
    if (oldWindow === undefined) delete globalThis.window;
    else globalThis.window = oldWindow;
    if (oldDocument === undefined) delete globalThis.document;
    else globalThis.document = oldDocument;
  }
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
  assert.match(component, /refreshIpadMenuMode\(\), \[pathname\]/);
  assert.doesNotMatch(
    source("src/lib/ipad-menu-mode.js"),
    /scrollTo\(|preventDefault\(|style\.overflow\s*=(?!=)/,
  );
});
