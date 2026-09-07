import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";

const compiled = ts.transpileModule(
  readFileSync(new URL("../src/components/world/slide-open-control.tsx", import.meta.url), "utf8"),
  {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  },
).outputText;

function mount() {
  const effects = [];
  const timers = new Map();
  const frames = new Map();
  const win = new EventTarget();
  const doc = new EventTarget();
  let serial = 0;
  let opened = 0;
  Object.assign(win, {
    setTimeout: (fn) => {
      timers.set(++serial, fn);
      return serial;
    },
    clearTimeout: (id) => timers.delete(id),
    requestAnimationFrame: (fn) => {
      frames.set(++serial, fn);
      return serial;
    },
    cancelAnimationFrame: (id) => frames.delete(id),
    matchMedia: () => ({ matches: false }),
  });
  const exports = {};
  runInNewContext(compiled, {
    exports,
    window: win,
    document: doc,
    performance: { now: () => 10 },
    require: (name) => {
      if (name === "react")
        return {
          useRef: (current) => ({ current }),
          useCallback: (fn) => fn,
          useEffect: (fn) => effects.push(fn),
        };
      if (name === "react/jsx-runtime")
        return {
          jsx: (type, props) => ({ type, props }),
          jsxs: (type, props) => ({ type, props }),
        };
      if (name === "./ui-vector-icon") return { UiVectorIcon: () => null };
      throw new Error(`Unexpected dependency ${name}`);
    },
  });
  const element = exports.SlideOpenControl({
    ariaLabel: "open",
    onOpen: () => {
      opened += 1;
    },
  });
  const button = {
    dataset: {},
    style: { setProperty() {}, removeProperty() {} },
    getBoundingClientRect: () => ({ left: 0, right: 240, width: 240, top: 0, height: 56 }),
    blur() {},
    hasPointerCapture: () => false,
  };
  element.props.ref(button);
  element.props.children.at(-1).props.ref.current = {
    getBoundingClientRect: () => ({ left: 4, right: 54, width: 50, top: 3, height: 50 }),
  };
  const cleanups = effects.map((fn) => fn());
  const click = () =>
    element.props.onClick({ detail: 0, preventDefault() {}, stopPropagation() {} });
  const flush = () => {
    for (const [id, fn] of [...timers]) {
      timers.delete(id);
      fn();
    }
  };
  return {
    click,
    flush,
    win,
    doc,
    button,
    frames,
    opened: () => opened,
    unmount: () => cleanups.forEach((fn) => fn?.()),
  };
}

test("keyboard activation completes only once and cancels its reset frame on unmount", () => {
  const ui = mount();
  ui.click();
  ui.click();
  ui.flush();
  assert.equal(ui.opened(), 1);
  assert.equal(ui.frames.size, 1);
  ui.unmount();
  assert.equal(ui.frames.size, 0);
});

for (const event of ["blur", "pagehide", "visibilitychange"]) {
  test(`${event} cancels a released slider's delayed opening and permits recovery`, () => {
    const ui = mount();
    ui.click();
    assert.equal(ui.button.dataset.completing, "true");
    if (event === "visibilitychange") {
      ui.doc.hidden = true;
      ui.doc.dispatchEvent(new Event(event));
    } else ui.win.dispatchEvent(new Event(event));
    ui.flush();
    assert.equal(ui.opened(), 0);
    assert.equal(ui.button.dataset.completing, "false");
    ui.doc.hidden = false;
    ui.click();
    ui.flush();
    assert.equal(ui.opened(), 1);
    ui.unmount();
  });
}

test("unmount during completion never opens the destination", () => {
  const ui = mount();
  ui.click();
  ui.unmount();
  ui.flush();
  assert.equal(ui.opened(), 0);
});
