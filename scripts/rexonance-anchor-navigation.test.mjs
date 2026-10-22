import assert from "node:assert/strict";
import test from "node:test";
import { mountRexonanceAnchorNavigation } from "../src/lib/rexonance-anchor-navigation.js";

function fixture() {
  const listeners = new Map();
  const rootListeners = new Map();
  const frames = new Map();
  const scrolls = [];
  let next = 0;
  let reads = 0;
  const attributes = new Map([["href", "#stages"]]);
  const link = {
    getAttribute: (key) => attributes.get(key) ?? null,
    hasAttribute: (key) => attributes.has(key),
  };
  const target = { getBoundingClientRect: () => (reads++, { top: 500 }) };
  const root = {
    isConnected: true,
    contains: (node) => node === link || node === target,
    ownerDocument: { getElementById: (id) => (id === "stages" ? target : null) },
    addEventListener: (key, fn) => rootListeners.set(key, fn),
    removeEventListener: (key) => rootListeners.delete(key),
  };
  const environment = {
    location: { hash: "#stages" },
    scrollY: 1000,
    scrollX: 2,
    requestAnimationFrame(fn) {
      frames.set(++next, fn);
      return next;
    },
    cancelAnimationFrame: (id) => frames.delete(id),
    addEventListener(key, fn, options) {
      assert.equal(options.passive, true);
      listeners.set(key, fn);
    },
    removeEventListener: (key) => listeners.delete(key),
    getComputedStyle: () => ({ scrollMarginTop: "101px" }),
    scrollTo: (options) => scrolls.push(options),
  };
  const dispose = mountRexonanceAnchorNavigation(root, environment);
  const click = (overrides = {}) => {
    const event = {
      button: 0,
      defaultPrevented: false,
      target: { closest: () => link },
      ...overrides,
    };
    rootListeners.get("click")(event);
    return event;
  };
  const tick = () => {
    const ready = [...frames.values()];
    frames.clear();
    ready.forEach((fn) => fn());
  };
  return {
    root,
    environment,
    attributes,
    listeners,
    rootListeners,
    frames,
    scrolls,
    reads: () => reads,
    click,
    tick,
    dispose,
  };
}

test("chapter click reads the current layout once, preserving native history and CSS motion", () => {
  const f = fixture();
  f.click();
  assert.equal(f.reads(), 0);
  f.environment.scrollY = 1200;
  f.tick();
  assert.deepEqual(f.scrolls, [{ top: 1599, left: 2, behavior: "auto" }]);
  assert.equal(f.environment.location.hash, "#stages");
  assert.equal(f.reads(), 1);
  assert.equal(f.listeners.has("scroll"), false);
  f.dispose();
});

test("modified, downloaded, new-window and malformed links retain native behavior", () => {
  const f = fixture();
  for (const overrides of [
    { button: 1 },
    { defaultPrevented: true },
    { metaKey: true },
    { ctrlKey: true },
    { altKey: true },
    { shiftKey: true },
  ])
    f.click(overrides);
  for (const [key, value] of [
    ["target", "_blank"],
    ["download", "file"],
    ["href", "#%"],
  ]) {
    f.attributes.set(key, value);
    f.click();
    f.attributes.delete(key);
  }
  assert.equal(f.frames.size, 0);
  f.dispose();
});

test("a later handler, navigation or detached page cancels the correction", () => {
  for (const cancel of [
    (f, event) => {
      event.defaultPrevented = true;
    },
    (f) => {
      f.environment.location.hash = "#system";
    },
    (f) => {
      f.root.isConnected = false;
    },
  ]) {
    const f = fixture();
    const event = f.click();
    cancel(f, event);
    f.tick();
    assert.deepEqual(f.scrolls, []);
    f.dispose();
  }
});

test("new user input and disposal cancel pending work and release every listener", () => {
  const f = fixture();
  for (const name of ["wheel", "pointerdown", "keydown", "blur", "pagehide"]) {
    f.click();
    f.listeners.get(name)();
    f.tick();
  }
  assert.deepEqual(f.scrolls, []);
  f.click();
  f.click();
  assert.equal(f.frames.size, 1);
  const late = [...f.frames.values()][0];
  f.dispose();
  late();
  assert.equal(f.frames.size, 0);
  assert.equal(f.listeners.size, 0);
  assert.equal(f.rootListeners.size, 0);
  assert.deepEqual(f.scrolls, []);
});

test("an absent page is a safe no-op", () => {
  mountRexonanceAnchorNavigation(null, {})();
});
