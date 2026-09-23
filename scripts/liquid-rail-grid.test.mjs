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
    this.listeners.set(
      type,
      (this.listeners.get(type) ?? []).filter((entry) => entry !== listener),
    );
  }

  dispatchEvent(event) {
    this.dispatch(event.type, event);
    return true;
  }

  dispatch(type, event = {}) {
    event.type = type;
    event.target ??= this;
    event.preventDefault ??= () => {};
    event.stopPropagation ??= () => {};
    for (const listener of [...(this.listeners.get(type) ?? [])]) listener.call(this, event);
  }
}

function makeStyle() {
  const properties = new Map();
  return {
    width: "",
    height: "",
    transform: "",
    setProperty(name, value) {
      properties.set(name, String(value));
    },
    getPropertyValue(name) {
      return properties.get(name) ?? "";
    },
    removeProperty(name) {
      properties.delete(name);
    },
  };
}

function mountRail(boxes) {
  const source = readFileSync(new URL("../src/lib/liquid/boot.js", import.meta.url), "utf8");
  const initRailSource = extractFunction(source, "initRail");
  const win = new FakeTarget();
  win.innerWidth = 1024;
  const doc = new FakeTarget();
  doc.hidden = false;
  const tabs = boxes.map((box, index) => {
    const tab = new FakeTarget();
    const attributes = new Map([["aria-selected", String(index === 0)]]);
    Object.assign(tab, {
      closest: (selector) => (selector === 'button[role="tab"]' ? tab : null),
      getAttribute: (name) => attributes.get(name) ?? null,
      setAttribute: (name, value) => attributes.set(name, String(value)),
      removeAttribute: (name) => attributes.delete(name),
      getBoundingClientRect: () => box,
      classList: { toggle() {} },
      focus() {},
      style: makeStyle(),
      tabIndex: index === 0 ? 0 : -1,
    });
    return tab;
  });
  const width = Math.max(...boxes.map((box) => box.left + box.width));
  const height = Math.max(...boxes.map((box) => box.top + box.height));
  const lens = { style: makeStyle() };
  const root = new FakeTarget();
  Object.assign(root, {
    dataset: {},
    classList: { contains: (name) => name === "liquid-swipe-tabs" },
    querySelector: (selector) => (selector === ":scope > .liquid-selection-lens" ? lens : null),
    querySelectorAll: (selector) => (selector === ':scope > button[role="tab"]' ? tabs : []),
    getBoundingClientRect: () => ({ left: 0, top: 0, width, height }),
    offsetWidth: width,
    offsetHeight: height,
    clientWidth: width,
    clientHeight: height,
    contains: (node) => tabs.includes(node),
    setPointerCapture() {},
    releasePointerCapture() {},
  });
  // A tap is hit-tested against the geometry measured at pointerdown: a hit
  // test here would force style and layout after the page lock.
  doc.elementFromPoint = () => {
    throw new Error("elementFromPoint forces style and layout inside the tap handler");
  };

  let nextFrame = 1;
  const frames = new Map();
  const requestAnimationFrame = (callback) => {
    const id = nextFrame++;
    frames.set(id, callback);
    return id;
  };
  const flushFrames = () => {
    const queued = [...frames.values()];
    frames.clear();
    queued.forEach((callback) => callback(16));
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
    cancelAnimationFrame: (id) => frames.delete(id),
    clamp: (value, min, max) => Math.min(max, Math.max(min, value)),
    clearTimeout,
    document: doc,
    getComputedStyle: () => ({ getPropertyValue: () => "" }),
    getRenderer: () => ({
      activate: () => false,
      isActive: () => false,
      setAccent() {},
      setContact() {},
      setGeometry() {},
      setPhase() {},
      detach() {},
    }),
    isFrosted: () => true,
    mix: (from, to, amount) => from + (to - from) * amount,
    mq: () => ({ matches: true }),
    nearestTab(px, py, geos) {
      let best = 0;
      let bestDistance = Infinity;
      geos.forEach((geo, index) => {
        const dx = px - (geo.x + geo.width / 2);
        const dy = py - (geo.y + geo.height / 2);
        const distance = dx * dx + dy * dy;
        if (distance < bestDistance) {
          best = index;
          bestDistance = distance;
        }
      });
      return best;
    },
    requestAnimationFrame,
    setTimeout,
    window: win,
  };
  runInNewContext(`${initRailSource}; this.initRail = initRail;`, context);
  const dispose = context.initRail(root);
  flushFrames();

  const pointer = (type, x, y, target = tabs[0]) =>
    root.dispatch(type, {
      isPrimary: true,
      pointerType: "touch",
      button: 0,
      pointerId: 7,
      clientX: x,
      clientY: y,
      timeStamp: type === "pointerdown" ? 1 : 20,
      target,
    });

  return { dispose, flushFrames, lens, pointer, root, tabs, win };
}

const cell = (left, top) => ({ left, top, width: 50, height: 50 });

test("a two-dimensional rail follows a bent drag across both axes", () => {
  const ui = mountRail([cell(0, 0), cell(50, 0), cell(0, 50), cell(50, 50)]);
  try {
    ui.pointer("pointerdown", 25, 25);
    ui.pointer("pointermove", 80, 20);
    ui.flushFrames();
    assert.match(ui.lens.style.transform, /translate3d\(49\.00px,1\.00px,0\)/);

    ui.pointer("pointermove", 80, 80);
    ui.flushFrames();
    assert.match(ui.lens.style.transform, /translate3d\(49\.00px,49\.00px,0\)/);

    ui.pointer("pointerup", 80, 80);
    ui.flushFrames();
    assert.equal(ui.tabs[3].getAttribute("aria-selected"), "true");
    assert.equal(ui.root.dataset.railLock, undefined);
  } finally {
    ui.dispose();
  }
});

test("a one-row rail remains horizontally constrained", () => {
  const ui = mountRail([cell(0, 0), cell(50, 0), cell(100, 0)]);
  try {
    ui.pointer("pointerdown", 25, 25);
    ui.pointer("pointermove", 125, 90);
    ui.flushFrames();
    assert.match(ui.lens.style.transform, /translate3d\(99\.00px,1\.00px,0\)/);
    ui.pointer("pointerup", 125, 90);
    assert.equal(ui.tabs[2].getAttribute("aria-selected"), "true");
  } finally {
    ui.dispose();
  }
});

test("a one-column rail remains vertically constrained", () => {
  const ui = mountRail([cell(0, 0), cell(0, 50), cell(0, 100)]);
  try {
    ui.pointer("pointerdown", 25, 25);
    ui.pointer("pointermove", 90, 125);
    ui.flushFrames();
    assert.match(ui.lens.style.transform, /translate3d\(1\.00px,99\.00px,0\)/);
    ui.pointer("pointerup", 90, 125);
    assert.equal(ui.tabs[2].getAttribute("aria-selected"), "true");
  } finally {
    ui.dispose();
  }
});

test("cancelling a grid drag releases the immediate page lock", () => {
  const ui = mountRail([cell(0, 0), cell(50, 0), cell(0, 50), cell(50, 50)]);
  try {
    ui.pointer("pointerdown", 25, 25);
    assert.equal(ui.root.dataset.railLock, "true");
    ui.pointer("pointermove", 80, 80);
    ui.flushFrames();
    ui.win.dispatch("pointercancel", { pointerId: 7 });
    assert.equal(ui.root.dataset.railLock, undefined);
    assert.equal(ui.root.dataset.liquidDragging, "false");
  } finally {
    ui.dispose();
  }
});

test("a sloppy tap counts when the finger lifts over the same tab", () => {
  const ui = mountRail([cell(0, 0), cell(50, 0), cell(0, 50), cell(50, 50)]);
  try {
    // No pointermove arrives before the lift (a fast tap), 21px from contact.
    ui.pointer("pointerdown", 75, 25, ui.tabs[1]);
    assert.equal(ui.root.dataset.railLock, "true");
    ui.pointer("pointerup", 90, 40, ui.tabs[1]);
    assert.equal(ui.tabs[1].getAttribute("aria-selected"), "true");
    assert.equal(ui.root.dataset.railLock, undefined);
  } finally {
    ui.dispose();
  }
});

test("a sloppy tap that lifts over another tab is cancelled", () => {
  const ui = mountRail([cell(0, 0), cell(50, 0), cell(0, 50), cell(50, 50)]);
  try {
    ui.pointer("pointerdown", 75, 25, ui.tabs[1]);
    ui.pointer("pointerup", 75, 80, ui.tabs[1]);
    assert.equal(ui.tabs[0].getAttribute("aria-selected"), "true");
    assert.equal(ui.tabs[1].getAttribute("aria-selected"), "false");
    assert.equal(ui.tabs[3].getAttribute("aria-selected"), "false");
    assert.equal(ui.root.dataset.railLock, undefined);
    assert.equal(ui.root.dataset.liquidPressed, "false");
  } finally {
    ui.dispose();
  }
});
