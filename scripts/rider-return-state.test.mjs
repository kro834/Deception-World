import assert from "node:assert/strict";
import test from "node:test";
import {
  captureRiderReturn,
  riderNavigationState,
  readRiderReturn,
  restoreRiderControl,
} from "../src/components/world/rider-return-state.ts";

test("Back and the dossier list link restore only their own World entry", () => {
  class History {
    replaceState(state) {
      this.state = state;
    }
  }
  const history = new History();
  globalThis.window = { History, history };
  const visit = (path, key, index, state = {}) => {
    window.location = new URL(path, "https://world.example");
    history.state = { ...state, __TSR_key: key, __TSR_index: index };
  };
  try {
    visit("/world#riders", "a", 0);
    const ticket = { id: "realm", poster: 2, locked: true, keyboard: true, viewportFraction: 0.6 };
    captureRiderReturn(ticket);
    const original = history.state;
    visit("/riders/realm", "b", 1, riderNavigationState("/riders/realm"));
    const dossier = history.state;
    visit("/world#riders", "a", 0, original);
    assert.deepEqual(readRiderReturn(), ticket);
    visit("/riders/realm", "b", 1, dossier);
    visit("/world#riders", "a", 0, original);
    assert.deepEqual(readRiderReturn(), ticket);
    visit("/world#records", "a", 0, original);
    assert.equal(readRiderReturn(), null);
    visit("/world#riders", "c", 2, original);
    assert.equal(readRiderReturn(), null);
    visit("/riders/realm", "b", 1, dossier);
    visit("/world#riders-return", "d", 2, riderNavigationState("/world", "riders-return"));
    assert.deepEqual(readRiderReturn(), ticket);
    visit("/world", "pointer", 0);
    captureRiderReturn({ ...ticket, keyboard: false });
    visit("/riders/realm", "pointer-dossier", 1, riderNavigationState("/riders/realm"));
    visit(
      "/world#riders-return",
      "keyboard-back",
      2,
      riderNavigationState("/world", "riders-return", true),
    );
    assert.equal(readRiderReturn().keyboard, true);
    visit("/world#riders-return", "e", 3);
    assert.equal(readRiderReturn(), null);
    visit("/riders/saga", "f", 4);
    visit("/world#riders-return", "g", 5, riderNavigationState("/world", "riders-return"));
    assert.deepEqual(readRiderReturn(), { id: "saga" });
  } finally {
    delete globalThis.window;
  }
});

test("rotated viewport restores the control and keyboard focus until reader input", () => {
  const window = new EventTarget();
  const document = { activeElement: null, documentElement: { hasAttribute: () => false } };
  const location = new URL("https://world.example/world#riders");
  let next = 0;
  let top = 500;
  const frames = new Map();
  const timers = new Map();
  const control = {
    isConnected: true,
    closest: () => null,
    getBoundingClientRect: () => ({ top, height: 42 }),
    focus: ({ preventScroll }) => {
      assert.equal(preventScroll, true);
      document.activeElement = control;
    },
  };
  Object.assign(window, {
    location,
    visualViewport: Object.assign(new EventTarget(), { offsetTop: 10, height: 300 }),
    setTimeout(callback) {
      timers.set(++next, callback);
      return next;
    },
    clearTimeout: (id) => timers.delete(id),
    scrollBy: ({ top: delta }) => {
      top -= delta;
    },
  });
  const previous = new Map();
  const globals = {
    window,
    location,
    document,
    requestAnimationFrame: (callback) => {
      frames.set(++next, callback);
      return next;
    },
    cancelAnimationFrame: (id) => frames.delete(id),
  };
  for (const [name, value] of Object.entries(globals)) {
    previous.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
    Object.defineProperty(globalThis, name, { value, configurable: true });
  }
  try {
    restoreRiderControl({ id: "realm", keyboard: true, viewportFraction: 0.6 }, control);
    const [id, run] = [...frames][0];
    frames.delete(id);
    run();
    assert.equal(top, 190);
    assert.equal(document.activeElement, control);
    assert.equal(frames.size, 0, "an idle page schedules no alignment frame");
    window.dispatchEvent(new Event("resize"));
    assert.equal(frames.size, 1);
    window.dispatchEvent(new Event("wheel"));
    assert.equal(timers.size, 0);
    assert.equal(frames.size, 0);
  } finally {
    for (const [name, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    }
  }
});
