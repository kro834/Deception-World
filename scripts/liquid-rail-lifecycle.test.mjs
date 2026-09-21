import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";

function extractFunction(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `${name} should exist`);
  const bodyStart = source.indexOf("{", start);
  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    else if (source[index] === "}" && --depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`Could not extract ${name}`);
}

class FakeTarget {
  listeners = new Map();

  addEventListener(type, listener, options = {}) {
    const entries = this.listeners.get(type) ?? [];
    entries.push(listener);
    this.listeners.set(type, entries);
    const signal = typeof options === "object" ? options.signal : undefined;
    signal?.addEventListener("abort", () => this.removeEventListener(type, listener), {
      once: true,
    });
  }

  removeEventListener(type, listener) {
    const entries = this.listeners.get(type) ?? [];
    this.listeners.set(
      type,
      entries.filter((entry) => entry !== listener),
    );
  }

  dispatch(type, event = {}) {
    event.type = type;
    event.target ??= this;
    event.preventDefault ??= () => {};
    event.stopPropagation ??= () => {};
    for (const listener of [...(this.listeners.get(type) ?? [])]) listener.call(this, event);
  }
}

function mountRailRuntime() {
  const source = readFileSync(new URL("../src/lib/liquid/boot.js", import.meta.url), "utf8");
  const initRailSource = extractFunction(source, "initRail");
  const win = new FakeTarget();
  win.innerWidth = 1024;
  const doc = new FakeTarget();
  doc.hidden = false;
  const tab = new FakeTarget();
  const attributes = new Map([["aria-selected", "true"]]);
  Object.assign(tab, {
    closest: (selector) => (selector === 'button[role="tab"]' ? tab : null),
    getAttribute: (name) => attributes.get(name) ?? null,
    setAttribute: (name, value) => attributes.set(name, String(value)),
    removeAttribute: (name) => attributes.delete(name),
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 44 }),
    classList: { toggle() {} },
    focus() {},
    tabIndex: 0,
  });
  const root = new FakeTarget();
  Object.assign(root, {
    dataset: {},
    classList: { contains: (name) => name === "liquid-swipe-tabs" },
    querySelector: () => null,
    querySelectorAll: (selector) => (selector === ':scope > button[role="tab"]' ? [tab] : []),
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 44 }),
    offsetWidth: 100,
    offsetHeight: 44,
    clientWidth: 100,
    clientHeight: 44,
    contains: (node) => node === tab,
    setPointerCapture() {},
    releasePointerCapture() {},
  });
  doc.elementFromPoint = () => tab;
  const renderer = {
    activate: () => false,
    isActive: () => false,
    setAccent() {},
    setContact() {},
    setGeometry() {},
    setPhase() {},
    detach() {},
  };
  let lockOwners = 0;
  const context = {
    AbortController,
    CustomEvent: class CustomEvent {
      constructor(type, options) {
        this.type = type;
        this.detail = options?.detail;
      }
    },
    Math,
    REDUCED_MOTION: "(prefers-reduced-motion: reduce)",
    ResizeObserver: class ResizeObserver {
      observe() {}
      disconnect() {}
    },
    acquireViewportScrollLock() {
      lockOwners += 1;
      root.dataset.railLock = "true";
      let released = false;
      return () => {
        if (released) return;
        released = true;
        lockOwners -= 1;
        if (lockOwners === 0) delete root.dataset.railLock;
      };
    },
    cancelAnimationFrame() {},
    clamp: (value, min, max) => Math.min(max, Math.max(min, value)),
    clearTimeout,
    document: doc,
    getComputedStyle: () => ({ getPropertyValue: () => "" }),
    getRenderer: () => renderer,
    mix: (from, to, amount) => from + (to - from) * amount,
    mq: () => ({ matches: true }),
    nearestTab: () => 0,
    requestAnimationFrame: () => 1,
    setTimeout,
    window: win,
  };
  runInNewContext(`${initRailSource}; this.initRail = initRail;`, context);
  const pointerDown = () =>
    root.dispatch("pointerdown", {
      isPrimary: true,
      pointerType: "touch",
      button: 0,
      pointerId: 7,
      clientX: 20,
      clientY: 20,
      timeStamp: 1,
      target: tab,
    });
  return { initRail: context.initRail, pointerDown, root, win, doc };
}

const releasePaths = {
  pointerup: ({ win }) => win.dispatch("pointerup", { pointerId: 7, clientX: 20, clientY: 20 }),
  pointercancel: ({ win }) => win.dispatch("pointercancel", { pointerId: 7 }),
  lostcapture: ({ root }) => root.dispatch("lostpointercapture", { pointerId: 7 }),
  blur: ({ win }) => win.dispatch("blur"),
  pagehide: ({ win }) => win.dispatch("pagehide"),
  hidden: ({ doc }) => {
    doc.hidden = true;
    doc.dispatch("visibilitychange");
  },
  rotation: ({ win }) => win.dispatch("orientationchange"),
  resize: ({ win }) => {
    win.innerWidth = 768;
    win.dispatch("resize");
  },
};

for (const [name, release] of Object.entries(releasePaths)) {
  test(`Liquid rail releases page scroll after ${name}`, () => {
    const ui = mountRailRuntime();
    const dispose = ui.initRail(ui.root);
    try {
      ui.pointerDown();
      assert.equal(ui.root.dataset.railLock, "true");
      release(ui);
      assert.equal(ui.root.dataset.railLock, undefined);
      assert.equal(ui.root.dataset.liquidHeld, "false");
      // Returning from an interruption must not leave a stale gesture owner.
      ui.doc.hidden = false;
      ui.pointerDown();
      assert.equal(ui.root.dataset.railLock, "true");
      ui.win.dispatch("pointercancel", { pointerId: 7 });
      assert.equal(ui.root.dataset.railLock, undefined);
    } finally {
      dispose();
    }
  });
}

test("a disposed Liquid rail is inert and can be safely rebound on the same DOM", () => {
  const { initRail, pointerDown, root, win } = mountRailRuntime();
  const disposeFirst = initRail(root);
  disposeFirst();

  assert.equal(root.dataset.liquidBound, undefined);
  pointerDown();
  assert.equal(
    root.dataset.railLock,
    undefined,
    "disposed root handlers must not reacquire a lock",
  );

  const disposeSecond = initRail(root);
  assert.equal(root.dataset.liquidBound, "true");
  pointerDown();
  assert.equal(root.dataset.railLock, "true", "the replacement binding should own pointerdown");
  win.dispatch("blur");
  assert.equal(
    root.dataset.railLock,
    undefined,
    "replacement window cleanup should release on blur",
  );

  disposeFirst();
  assert.equal(
    root.dataset.liquidBound,
    "true",
    "an old idempotent disposer must not clear a new binding",
  );
  assert.equal(initRail(root), disposeSecond, "the replacement disposer must remain registered");
  pointerDown();
  assert.equal(
    root.dataset.railLock,
    "true",
    "an old disposer must not abort replacement handlers",
  );
  win.dispatch("blur");
  assert.equal(root.dataset.railLock, undefined);

  disposeSecond();
  assert.equal(root.dataset.liquidBound, undefined);
});
