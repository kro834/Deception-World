import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const compiled = ts.transpileModule(
  readFileSync(
    new URL("../src/components/world/use-liquid-pointer-light.ts", import.meta.url),
    "utf8",
  ),
  { compilerOptions: { module: ts.ModuleKind.CommonJS } },
).outputText;

function harness({
  android = false,
  motion = false,
  transparency = false,
  lightweight = false,
} = {}) {
  const listeners = () => {
    const registered = new Map();
    return {
      registered,
      addEventListener(type, listener) {
        if (!registered.has(type)) registered.set(type, new Set());
        registered.get(type).add(listener);
      },
      removeEventListener(type, listener) {
        registered.get(type)?.delete(listener);
        if (!registered.get(type)?.size) registered.delete(type);
      },
      fire(type, event) {
        for (const listener of [...(registered.get(type) ?? [])]) listener(event);
      },
    };
  };
  const preference = (matches) => {
    const media = { ...listeners(), matches };
    media.change = (value) => {
      media.matches = value;
      media.fire("change", { matches: value });
    };
    return media;
  };
  const reducedMotion = preference(motion);
  const reducedTransparency = preference(transparency);
  const frames = new Map();
  const writes = [];
  const win = listeners();
  const doc = {
    ...listeners(),
    hidden: false,
    documentElement: { hasAttribute: () => android },
  };
  let serial = 0;
  let cleanup;
  let lookups = 0;
  class Node {}
  class Element extends Node {
    constructor(eligible = true) {
      super();
      this.eligible = eligible;
      this.dataset = {};
      this.style = { setProperty: (name, value) => writes.push({ name, value }) };
    }
    closest() {
      lookups++;
      return this.eligible ? this : null;
    }
    contains(node) {
      return node === this;
    }
    getBoundingClientRect() {
      return { left: 10, top: 20, width: 100, height: 80 };
    }
  }
  Object.assign(win, {
    matchMedia: (query) => (query.includes("transparency") ? reducedTransparency : reducedMotion),
    requestAnimationFrame: (callback) => {
      frames.set(++serial, callback);
      return serial;
    },
    cancelAnimationFrame: (id) => frames.delete(id),
  });
  const module = {};
  runInNewContext(compiled, {
    exports: module,
    document: doc,
    window: win,
    navigator: {},
    Element,
    Node,
    require: (name) => {
      if (name === "react") return { useEffect: (effect) => (cleanup = effect()) };
      if (name === "@/lib/rendering-profile")
        return { prefersLightweightRendering: () => lightweight };
      throw new Error(`Unexpected dependency ${name}`);
    },
  });
  module.useLiquidPointerLight();
  const target = new Element();
  const event = (extra = {}) => ({
    target,
    isPrimary: true,
    button: 0,
    pointerType: "mouse",
    pointerId: 7,
    clientX: 50,
    clientY: 60,
    ...extra,
  });
  return {
    doc,
    win,
    reducedMotion,
    reducedTransparency,
    frames,
    writes,
    target,
    event,
    outside: () => new Element(false),
    lookups: () => lookups,
    flush() {
      const pending = [...frames.values()];
      frames.clear();
      pending.forEach((callback) => callback());
    },
    unmount: () => cleanup?.(),
  };
}

for (const android of [false, true]) {
  for (const preference of ["reducedMotion", "reducedTransparency"]) {
    test(`${android ? "Android press-only" : "full pointer"}: ${preference} change cancels a pending press and all tracking`, () => {
      const ui = harness({ android });
      ui.doc.fire("pointerdown", ui.event());
      assert.equal(ui.target.dataset.liquidPointerPressed, "true");
      assert.equal(ui.frames.size, 1);
      ui[preference].change(true);
      assert.equal(ui.frames.size, 0);
      assert.equal(ui.target.dataset.liquidPointerPressed, undefined);
      assert.equal(ui.target.dataset.liquidPointerActive, undefined);
      assert.equal(ui.doc.registered.size, 0);
      assert.equal(ui.win.registered.size, 0);
      ui.doc.fire("pointerdown", ui.event());
      ui.doc.fire("pointermove", ui.event({ clientX: 80 }));
      ui.flush();
      assert.equal(ui.writes.length, 0);
      ui[preference].change(false);
      ui.doc.fire(android ? "pointerdown" : "pointermove", ui.event());
      ui.flush();
      assert.equal(ui.target.dataset.liquidPointerActive, "true");
      assert.equal(ui.writes.length, 2);
      assert.equal(ui.doc.registered.has("pointermove"), !android);
      ui.unmount();
      assert.equal(ui.doc.registered.size, 0);
      assert.equal(ui.win.registered.size, 0);
      assert.equal(ui.reducedMotion.registered.size, 0);
      assert.equal(ui.reducedTransparency.registered.size, 0);
    });
  }
}

test("initial reduced preferences can be turned off without remounting or duplicating listeners", () => {
  const ui = harness({ motion: true, transparency: true });
  assert.equal(ui.doc.registered.size, 0);
  ui.reducedMotion.change(false);
  assert.equal(ui.doc.registered.size, 0, "transparency reduction still blocks tracking");
  ui.reducedTransparency.change(false);
  const count = ui.doc.registered.size;
  ui.reducedMotion.change(false);
  assert.equal(ui.doc.registered.size, count);
  for (const registered of ui.doc.registered.values()) assert.equal(registered.size, 1);
  ui.doc.fire("pointermove", ui.event());
  ui.flush();
  assert.equal(ui.target.dataset.liquidPointerActive, "true");
  ui.reducedMotion.change(true);
  ui.reducedTransparency.change(true);
  ui.reducedMotion.change(false);
  assert.equal(ui.doc.registered.size, 0);
  ui.unmount();
});

test("unmount cancels pending position writes and preference listeners", () => {
  const ui = harness();
  ui.doc.fire("pointerover", ui.event());
  assert.equal(ui.frames.size, 1);
  ui.unmount();
  ui.flush();
  assert.equal(ui.writes.length, 0);
  assert.equal(ui.target.dataset.liquidPointerActive, undefined);
  ui.reducedMotion.change(true);
  ui.reducedMotion.change(false);
  assert.equal(ui.doc.registered.size, 0);
});

test("idle pointer motion performs only the one lookup needed for a resumed cursor", () => {
  const ui = harness();
  const outside = ui.outside();
  for (let i = 0; i < 20; i++) ui.doc.fire("pointermove", ui.event({ target: outside }));
  assert.equal(ui.lookups(), 1);
  ui.reducedMotion.change(true);
  ui.reducedMotion.change(false);
  ui.doc.fire("pointermove", ui.event());
  assert.equal(ui.target.dataset.liquidPointerActive, "true");
  ui.unmount();
});

test("secondary buttons and non-primary pointers never set the press flag", () => {
  for (const android of [false, true]) {
    const ui = harness({ android });
    for (const extra of [{ button: 2 }, { button: 1 }, { isPrimary: false }]) {
      ui.doc.fire("pointerdown", ui.event(extra));
      assert.equal(ui.target.dataset.liquidPointerPressed, undefined);
      assert.equal(ui.frames.size, 0);
    }
    ui.doc.fire("pointerdown", ui.event());
    assert.equal(ui.target.dataset.liquidPointerPressed, "true");
    ui.unmount();
  }
});

test("permanently lightweight renderers do not install tracking or preference listeners", () => {
  const ui = harness({ lightweight: true });
  assert.equal(ui.doc.registered.size, 0);
  assert.equal(ui.reducedMotion.registered.size, 0);
  assert.equal(ui.reducedTransparency.registered.size, 0);
});
