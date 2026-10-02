import assert from "node:assert/strict";
import test from "node:test";
import { mountStableFragmentNavigation } from "../src/lib/stable-fragment-navigation.js";

function setup() {
  const listeners = new Map();
  const timers = new Map();
  let serial = 0;
  const events = {
    addEventListener: (name, listener) => listeners.set(name, listener),
    removeEventListener: (name) => listeners.delete(name),
  };
  const environment = {
    ...events,
    setTimeout: (callback) => {
      timers.set(++serial, callback);
      return serial;
    },
    clearTimeout: (id) => timers.delete(id),
  };
  const sections = [0, 1, 2].map((order) => ({
    order,
    style: {
      contentVisibility: order === 0 ? "auto" : "",
      removeProperty() {
        this.contentVisibility = "";
      },
    },
    contains: () => false,
    compareDocumentPosition(target) {
      return order < target.order ? 4 : 2;
    },
  }));
  let reads = 0;
  let revisits = 0;
  sections[1].scrollIntoView = (options) => {
    assert.deepEqual(options, { block: "start", behavior: "auto" });
    revisits++;
  };
  sections[1].getBoundingClientRect = () => {
    reads++;
    return {};
  };
  let click;
  const root = {
    ownerDocument: { getElementById: (id) => (id === "cases" ? sections[1] : null) },
    contains: () => true,
    querySelectorAll: () => sections,
    addEventListener: (_, callback) => {
      click = callback;
    },
    removeEventListener: () => {
      click = null;
    },
  };
  const cleanup = mountStableFragmentNavigation(root, environment);
  const event = (options = {}, href = "#cases") =>
    click({
      button: 0,
      target: { closest: () => ({ getAttribute: () => href }) },
      preventDefault: () => assert.fail("native hash, scrolling and history must be retained"),
      ...options,
    });
  return {
    cleanup,
    event,
    sections,
    listeners,
    timers,
    reads: () => reads,
    environment,
    revisits: () => revisits,
    flush() {
      [...timers.values()].forEach((callback) => callback());
    },
  };
}

test("native fragment navigation measures only the path to its destination once", () => {
  const h = setup();
  h.event();
  assert.deepEqual(
    h.sections.map((s) => s.style.contentVisibility),
    ["visible", "visible", ""],
  );
  assert.equal(h.reads(), 1);
  for (let i = 0; i < 90; i++) h.listeners.get("scroll")();
  assert.equal(h.reads(), 1, "no layout read during scrolling");
  h.flush();
  assert.deepEqual(
    h.sections.map((s) => s.style.contentVisibility),
    ["auto", "", ""],
  );
  assert.equal(h.listeners.size, 0);
  assert.equal(h.timers.size, 0);
  h.cleanup();
});

test("revisiting the current fragment works without changing history", () => {
  const h = setup();
  h.environment.location = { hash: "#cases" };
  let prevented = 0;
  h.event({ preventDefault: () => prevented++ });
  assert.equal(h.revisits(), 1);
  assert.equal(prevented, 1, "do not let WebKit's default action cancel the revisit");
  h.environment.location.hash = "#characters";
  h.event();
  assert.equal(h.revisits(), 1, "new fragments keep the browser's default navigation");
  h.cleanup();
});

test("modified, cancelled, unknown and malformed fragment clicks leave layout alone", () => {
  const h = setup();
  for (const options of [
    { ctrlKey: true },
    { metaKey: true },
    { altKey: true },
    { shiftKey: true },
    { defaultPrevented: true },
    { button: 1 },
  ])
    h.event(options);
  h.event({}, "#missing");
  h.event({}, "#%E0");
  assert.equal(h.reads(), 0);
  assert.equal(h.timers.size, 0);
  h.cleanup();
});

test("user interaction, repeated clicks and unmount release all temporary styles", () => {
  for (const interrupt of ["pointerdown", "wheel", "unmount"]) {
    const h = setup();
    h.event();
    h.event();
    assert.equal(h.timers.size, 2, "a second click replaces the first session");
    if (interrupt === "unmount") h.cleanup();
    else h.listeners.get(interrupt)();
    assert.deepEqual(
      h.sections.map((s) => s.style.contentVisibility),
      ["auto", "", ""],
    );
    assert.equal(h.timers.size, 0);
    assert.equal(h.listeners.size, 0);
    h.cleanup();
  }
});
