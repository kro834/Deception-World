import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";

const source = readFileSync(
  new URL("../src/components/world/pickup-scroll-reset.ts", import.meta.url),
  "utf8",
);

function openPickup() {
  const exports = {};
  const frames = new Map();
  const timers = new Map();
  const listeners = new Map();
  let nextId = 0;
  class KeyboardEvent {
    constructor(key) {
      this.key = key;
    }
  }
  const target = () => ({
    style: { scrollBehavior: "", removeProperty() {} },
    scrollTop: 80,
    scrollLeft: 0,
  });
  const panel = target();
  const dialog = {
    ...target(),
    open: true,
    querySelector: () => panel,
    addEventListener: (name, callback) => listeners.set(name, callback),
    removeEventListener: (name) => listeners.delete(name),
  };
  runInNewContext(
    ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText,
    {
      exports,
      KeyboardEvent,
      window: {
        requestAnimationFrame: (callback) => {
          frames.set(++nextId, callback);
          return nextId;
        },
        cancelAnimationFrame: (id) => frames.delete(id),
        setTimeout: (callback) => {
          timers.set(++nextId, callback);
          return nextId;
        },
        clearTimeout: (id) => timers.delete(id),
      },
    },
  );
  const cancel = exports.settlePickupScroll(dialog, [".form-pickup-panel"]);
  assert.equal(panel.scrollTop, 0, "opening still starts at the beginning");
  const [id, firstFrame] = frames.entries().next().value;
  frames.delete(id);
  firstFrame();
  return { panel, frames, timers, listeners, KeyboardEvent, cancel };
}

test("Tab and Shift+Tab navigation stop delayed resets before they hide the focused control", () => {
  for (const shiftKey of [false, true]) {
    const pickup = openPickup();
    const delayedReset = pickup.timers.values().next().value;
    pickup.panel.scrollTop = 2038; // Native focus moved the end CLOSE into view.
    const event = new pickup.KeyboardEvent("Tab");
    event.shiftKey = shiftKey;
    pickup.listeners.get("keydown")(event);
    delayedReset();
    assert.equal(pickup.panel.scrollTop, 2038);
    assert.equal(pickup.frames.size, 0, "cancel the last startup frame too");
    assert.equal(pickup.timers.size, 0);
    assert.equal(pickup.listeners.size, 0);
    pickup.cancel();
  }
});

test("unrelated keys retain the late-layout reset while pointer input still releases it", () => {
  const pickup = openPickup();
  const delayedReset = pickup.timers.values().next().value;
  pickup.panel.scrollTop = 200;
  pickup.listeners.get("keydown")(new pickup.KeyboardEvent("a"));
  delayedReset();
  assert.equal(pickup.panel.scrollTop, 0, "a text key does not represent focus or scroll intent");
  pickup.panel.scrollTop = 500;
  pickup.listeners.get("pointerdown")({});
  delayedReset();
  assert.equal(pickup.panel.scrollTop, 500);
  pickup.cancel();
});
