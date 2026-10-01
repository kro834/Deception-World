import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";

const source = readFileSync(
  new URL("../src/components/rexonance-saga/rexonance-saga.tsx", import.meta.url),
  "utf8",
);
const parsed = ts.createSourceFile("rexonance-saga.tsx", source, ts.ScriptTarget.Latest, true);
let reserveEffect;
function visit(node) {
  if (
    ts.isCallExpression(node) &&
    node.expression.getText(parsed) === "useEffect" &&
    node.arguments[0]?.getText(parsed).includes('"--rxs-local-nav-reserve"')
  ) {
    assert.equal(reserveEffect, undefined, "one effect owns the measured nav reserve");
    reserveEffect = node.arguments[0].getText(parsed);
  }
  ts.forEachChild(node, visit);
}
visit(parsed);
assert.ok(reserveEffect, "exercise the component's real effect, not a copied scheduler");
const code = ts.transpileModule(`(${reserveEffect})()`, {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText;

function mount({ observerSupport = true, viewportSupport = true, height = 62.2 } = {}) {
  const frames = new Map();
  const cancelled = [];
  const values = new Map();
  const writes = [];
  const listeners = new Map();
  let frameId = 0;
  let reads = 0;
  let navHeight = height;
  const observers = [];
  function target(name) {
    const events = new EventTarget();
    const add = events.addEventListener.bind(events);
    const remove = events.removeEventListener.bind(events);
    events.addEventListener = (type, callback, options) => {
      listeners.set(`${name}:${type}`, callback);
      add(type, callback, options);
    };
    events.removeEventListener = (type, callback, options) => {
      assert.equal(listeners.get(`${name}:${type}`), callback, "remove the same callback");
      listeners.delete(`${name}:${type}`);
      remove(type, callback, options);
    };
    return events;
  }
  const window = target("window");
  if (viewportSupport) window.visualViewport = target("viewport");
  window.requestAnimationFrame = (callback) => {
    frames.set(++frameId, callback);
    return frameId;
  };
  window.cancelAnimationFrame = (id) => {
    cancelled.push(id);
    frames.delete(id);
  };
  const nav = {
    getBoundingClientRect() {
      reads += 1;
      return { height: navHeight };
    },
  };
  const page = {
    querySelector: () => nav,
    style: {
      getPropertyValue: (name) => values.get(name) || "",
      setProperty(name, value) {
        writes.push({ name, value });
        values.set(name, value);
      },
      removeProperty: (name) => values.delete(name),
    },
  };
  class ResizeObserver {
    constructor(callback) {
      this.callback = callback;
      observers.push(this);
    }
    observe(element) {
      this.target = element;
    }
    disconnect() {
      this.target = null;
      this.disconnected = true;
    }
  }
  const cleanup = runInNewContext(code, {
    pageRef: { current: page },
    window,
    ResizeObserver: observerSupport ? ResizeObserver : undefined,
  });
  const observer = observers[0];
  return {
    window,
    page,
    nav,
    observer,
    frames,
    cancelled,
    writes,
    values,
    listeners,
    cleanup,
    get reads() {
      return reads;
    },
    setHeight(value) {
      navHeight = value;
    },
    resize() {
      window.dispatchEvent(new Event("resize"));
      window.visualViewport?.dispatchEvent(new Event("resize"));
      observer?.callback([{ target: nav }]);
    },
    flush() {
      const pending = [...frames.entries()];
      for (const [id, callback] of pending) {
        frames.delete(id);
        callback();
      }
    },
  };
}

test("nav reserve is measured immediately and includes a fractional border height", () => {
  const ui = mount();
  assert.equal(ui.reads, 1);
  assert.equal(ui.values.get("--rxs-local-nav-reserve"), "63px");
  assert.equal(ui.frames.size, 0, "initial layout does not wait for animation frames");
  assert.equal(ui.observer.target, ui.nav);
  ui.cleanup();
});

test("same-frame window, viewport and observer resize bursts share one measurement", () => {
  const ui = mount();
  ui.setHeight(80.4);
  for (let i = 0; i < 8; i += 1) ui.resize();
  assert.equal(ui.frames.size, 1, "only one measurement is scheduled for the burst");
  assert.equal(ui.reads, 1, "resize handlers do not force layout synchronously");
  ui.flush();
  assert.equal(ui.reads, 2);
  assert.equal(ui.values.get("--rxs-local-nav-reserve"), "81px");
  assert.equal(ui.frames.size, 0);
  ui.resize();
  ui.flush();
  assert.equal(ui.reads, 3, "later resize frames can update again");
  assert.equal(ui.writes.length, 2, "an unchanged measured height does not rewrite the page style");
  ui.cleanup();
});

test("unmount cancels a pending measurement and removes all notification owners", () => {
  const ui = mount();
  ui.resize();
  const pendingId = [...ui.frames.keys()][0];
  ui.cleanup();
  assert.deepEqual(ui.cancelled, [pendingId]);
  assert.equal(ui.frames.size, 0);
  assert.equal(ui.listeners.size, 0);
  assert.equal(ui.observer.disconnected, true);
  assert.equal(ui.values.has("--rxs-local-nav-reserve"), false);
  ui.window.dispatchEvent(new Event("resize"));
  ui.window.visualViewport.dispatchEvent(new Event("resize"));
  assert.equal(ui.frames.size, 0);
  assert.equal(ui.reads, 1, "no detached-page geometry is read after cleanup");
});

for (const viewportSupport of [false, true]) {
  test(`resize fallback works without ResizeObserver and ${viewportSupport ? "with" : "without"} visualViewport`, () => {
    const ui = mount({ observerSupport: false, viewportSupport });
    ui.setHeight(58.8);
    ui.resize();
    ui.flush();
    assert.equal(ui.values.get("--rxs-local-nav-reserve"), "59px");
    assert.equal(ui.reads, 2);
    ui.cleanup();
    assert.equal(ui.listeners.size, 0);
    assert.equal(ui.frames.size, 0);
  });
}
