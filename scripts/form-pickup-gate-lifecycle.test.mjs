import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";

const compiled = ts.transpileModule(
  readFileSync(new URL("../src/components/world/manager-stub.tsx", import.meta.url), "utf8"),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } },
).outputText;
const compiledHistory = ts.transpileModule(
  readFileSync(
    new URL("../src/components/world/use-dialog-history-dismiss.ts", import.meta.url),
    "utf8",
  ),
  { compilerOptions: { module: ts.ModuleKind.CommonJS } },
).outputText;

function mount() {
  const effects = [],
    timers = new Map(),
    frames = new Map(),
    subscribers = new Set();
  const gateStates = [];
  let serial = 0;
  const win = new EventTarget(),
    doc = new EventTarget();
  Object.assign(win, {
    Image: class Image {
      decode() {
        return Promise.resolve();
      }
    },
    matchMedia: () => ({ matches: false }),
    setTimeout: (callback) => {
      timers.set(++serial, callback);
      return serial;
    },
    clearTimeout: (id) => timers.delete(id),
    requestAnimationFrame: (callback) => {
      frames.set(++serial, callback);
      return serial;
    },
    cancelAnimationFrame: (id) => frames.delete(id),
  });
  const router = {
    history: {
      subscribe(callback) {
        subscribers.add(callback);
        return () => subscribers.delete(callback);
      },
    },
  };
  const exports = {};
  const scope = {
    exports,
    window: win,
    document: doc,
    HTMLElement: class HTMLElement {},
    require(name) {
      if (name === "./use-dialog-history-dismiss") {
        const historyExports = {};
        runInNewContext(compiledHistory, { ...scope, exports: historyExports });
        return historyExports;
      }
      if (name === "react")
        return {
          useRef: (current) => ({ current }),
          useState: (initial) => [initial, (value) => gateStates.push(value)],
          useEffect: (callback) => effects.push(callback),
        };
      if (name === "react/jsx-runtime")
        return {
          jsx: (type, props) => ({ type, props }),
          jsxs: (type, props) => ({ type, props }),
        };
      if (name === "@tanstack/react-router") return { useRouter: () => router };
      if (name === "@/lib/name-breaks") return { withWordBreaks: (value) => value };
      if (name === "@/lib/dossier-images") return { formPickupImage: () => ({}) };
      if (name === "./slide-open-control") return { SlideOpenControl: "slide-control" };
      if (name === "./pickup-scroll-reset")
        return {
          resetPickupScroll() {},
          settlePickupScroll: () => () => {},
        };
      return {};
    },
  };
  runInNewContext(compiled, scope);
  const tree = exports.FormPickup({
    rider: { theme: "rexonance", name: "レクソナンスサーガ", img: "/rider.webp", calls: [] },
  });
  const find = (node, type) => {
    if (!node || typeof node !== "object") return null;
    if (node.type === type) return node;
    const children = Array.isArray(node) ? node : node.props?.children;
    return (Array.isArray(children) ? children : [children])
      .map((child) => find(child, type))
      .find(Boolean);
  };
  const dialog = {
    open: false,
    showModal() {
      this.open = true;
    },
    close() {
      this.open = false;
    },
    focus() {},
  };
  find(tree, "dialog").props.ref.current = dialog;
  const open = find(tree, "slide-control").props.onOpen;
  const cleanups = effects.map((callback) => callback()).filter(Boolean);
  const flush = (queue) => {
    const pending = [...queue.values()];
    queue.clear();
    pending.forEach((callback) => callback());
  };
  return {
    open: () => open("keyboard"),
    dialog,
    win,
    doc,
    gateStates,
    frames,
    flushTimers: () => flush(timers),
    flushFrames: () => flush(frames),
    history: (type) => subscribers.forEach((callback) => callback({ action: { type } })),
    unmount: () => cleanups.forEach((callback) => callback()),
  };
}

for (const action of ["BACK", "FORWARD", "GO"]) {
  test(`${action} during the form cover never opens its stale dialog`, () => {
    const ui = mount();
    ui.open();
    assert.equal(ui.gateStates.at(-1), true);
    ui.history(action);
    ui.flushTimers();
    ui.flushFrames();
    assert.equal(ui.gateStates.at(-1), false);
    assert.equal(ui.dialog.open, false);
    ui.open();
    ui.flushTimers();
    ui.flushFrames();
    assert.equal(ui.dialog.open, true, "the next deliberate opening should recover");
    ui.unmount();
  });
}

test("history cancels the frame between a completed cover and dialog.showModal", () => {
  const ui = mount();
  ui.open();
  ui.flushTimers();
  assert.equal(ui.frames.size, 1);
  ui.history("BACK");
  ui.flushFrames();
  assert.equal(ui.dialog.open, false);
  ui.unmount();
});

for (const event of ["blur", "pagehide", "visibilitychange"]) {
  test(`${event} cancels a pending form cover`, () => {
    const ui = mount();
    ui.open();
    if (event === "visibilitychange") {
      ui.doc.hidden = true;
      ui.doc.dispatchEvent(new Event(event));
    } else ui.win.dispatchEvent(new Event(event));
    ui.flushTimers();
    ui.flushFrames();
    assert.equal(ui.dialog.open, false);
    assert.equal(ui.gateStates.at(-1), false);
    ui.unmount();
  });
}

test("unmount releases the completed cover's pending opening frame", () => {
  const ui = mount();
  ui.open();
  ui.flushTimers();
  ui.unmount();
  ui.flushFrames();
  assert.equal(ui.dialog.open, false);
});
