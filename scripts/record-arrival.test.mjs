import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const compiled = ts.transpileModule(
  readFileSync(new URL("../src/lib/record-arrival.ts", import.meta.url), "utf8"),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
).outputText;

function setup({ reduce = false, economy = false, interactive = false } = {}) {
  const frames = new Map();
  const timers = new Map();
  const listeners = new Map();
  const attributes = new Set();
  const blurs = [];
  const dataset = {};
  let serial = 0;
  let focused = 0;
  let dialog = false;
  let visible = true;
  let observer;
  const target = {
    dataset,
    getClientRects: () => (visible ? [{}] : []),
    closest: () => null,
    matches: () => interactive,
    set tabIndex(value) {
      assert.equal(value, -1);
      attributes.add("tabindex");
    },
    removeAttribute(name) {
      attributes.delete(name);
      if (name.startsWith("data-"))
        delete dataset[name.slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())];
    },
    addEventListener(name, callback, options) {
      assert.equal(name, "blur");
      assert.equal(options.once, true);
      blurs.push(callback);
    },
    focus(options) {
      assert.equal(options.preventScroll, true);
      focused++;
    },
  };
  const root = {
    dataset: { worldEffects: economy ? "economy" : "full" },
    hasAttribute: (name) => attributes.has(name),
  };
  const window = {
    location: { pathname: "/search", hash: "" },
    requestAnimationFrame(callback) {
      frames.set(++serial, callback);
      return serial;
    },
    cancelAnimationFrame(id) {
      frames.delete(id);
    },
    setTimeout(callback, delay) {
      timers.set(++serial, { callback, delay });
      return serial;
    },
    clearTimeout(id) {
      timers.delete(id);
    },
    matchMedia: () => ({ matches: reduce }),
  };
  const document = {
    documentElement: root,
    body: {},
    getElementById: (id) => (id === "dream-roster-lupin" ? target : null),
    querySelector: () => (dialog ? {} : null),
    addEventListener: (name, callback) => listeners.set(name, callback),
    removeEventListener: (name) => listeners.delete(name),
  };
  class Observer {
    constructor(callback) {
      this.callback = callback;
      this.active = true;
      observer = this;
    }
    observe() {}
    disconnect() {
      this.active = false;
    }
  }
  const exports = {};
  vm.runInNewContext(compiled, { exports, window, document, MutationObserver: Observer });
  return {
    watch: () => exports.watchRecordArrival("/dream-chapter", "dream-roster-lupin"),
    frames,
    timers,
    listeners,
    attributes,
    dataset,
    root,
    window,
    active: () => observer.active,
    focused: () => focused,
    navigate() {
      window.location.pathname = "/dream-chapter";
      window.location.hash = "#dream-roster-lupin";
      observer.callback();
    },
    change() {
      observer.callback();
    },
    flush() {
      for (const [id, callback] of [...frames]) {
        frames.delete(id);
        callback();
      }
    },
    expire(delay) {
      for (const [id, timer] of [...timers])
        if (timer.delay === delay) {
          timers.delete(id);
          timer.callback();
        }
    },
    blur() {
      blurs.forEach((callback) => callback());
    },
    dialog() {
      dialog = true;
    },
    invisible() {
      visible = false;
    },
  };
}

test("search/library arrival waits for the route cover and focuses without scrolling", () => {
  const h = setup();
  h.watch();
  h.flush();
  assert.equal(h.focused(), 0);
  h.attributes.add("data-route-cover");
  h.navigate();
  h.flush();
  assert.equal(h.focused(), 0);
  h.attributes.delete("data-route-cover");
  h.change();
  h.flush();
  assert.equal(h.focused(), 1);
  assert.equal(h.dataset.routeFocus, "true");
  assert.equal(h.dataset.skipMark, "true");
  assert.equal(h.active(), false);
  assert.equal(h.frames.size, 0);
  assert.equal(h.listeners.size, 0);
  assert.deepEqual(
    [...h.timers.values()].map((timer) => timer.delay),
    [2400],
  );
  h.blur();
  assert.equal(h.timers.size, 0);
  assert.deepEqual(h.dataset, {});
  assert.equal(h.attributes.has("tabindex"), false);
});

test("arrival cue expires while keyboard destination remains until blur", () => {
  const h = setup();
  h.watch();
  h.navigate();
  h.flush();
  h.expire(2400);
  assert.equal(h.dataset.skipMark, undefined);
  assert.equal(h.dataset.routeFocus, "true");
  h.blur();
  assert.equal(h.dataset.routeFocus, undefined);
});

test("interactive targets keep their existing tabindex, and reduced/economy modes omit motion", () => {
  for (const options of [{ reduce: true }, { economy: true }]) {
    const h = setup({ ...options, interactive: true });
    h.attributes.add("tabindex");
    h.watch();
    h.navigate();
    h.flush();
    assert.equal(h.focused(), 1);
    assert.equal(h.dataset.skipMark, undefined);
    assert.equal(h.dataset.routeFocus, undefined);
    h.blur();
    assert.equal(h.attributes.has("tabindex"), true);
  }
});

test("dialog, user input, timeout and cancellation never steal focus or leave observers", () => {
  for (const mode of [
    "dialog",
    "pointerdown",
    "wheel",
    "keydown",
    "timeout",
    "cancel",
    "malformed",
  ]) {
    const h = setup();
    const stop = h.watch();
    if (mode === "dialog") {
      h.dialog();
      h.navigate();
    } else if (mode === "timeout") h.expire(15000);
    else if (mode === "cancel") stop();
    else if (mode === "malformed") {
      h.navigate();
      h.window.location.hash = "#%E0%A4%A";
    } else h.listeners.get(mode)();
    h.flush();
    assert.equal(h.focused(), 0, mode);
    assert.equal(h.active(), false, mode);
    assert.equal(h.frames.size, 0, mode);
    assert.equal(h.timers.size, 0, mode);
    assert.equal(h.listeners.size, 0, mode);
  }
});

test("a hidden destination stays pending only until the bounded deadline", () => {
  const h = setup();
  h.invisible();
  h.watch();
  h.navigate();
  h.flush();
  assert.equal(h.focused(), 0);
  assert.equal(h.active(), true);
  h.expire(15000);
  assert.equal(h.active(), false);
  assert.equal(h.listeners.size, 0);
});
