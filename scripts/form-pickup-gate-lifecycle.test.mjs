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
const compiledSignature = ts.transpileModule(
  readFileSync(new URL("../src/components/world/form-signature-state.ts", import.meta.url), "utf8"),
  { compilerOptions: { module: ts.ModuleKind.CommonJS } },
).outputText;

// Owner (2026-10-23): every gated theme (Rexonance, Explom, 犭) shares one cover lifecycle.
const THEMES = [
  { theme: "rexonance", name: "レクソナンスサーガ", cap: 1400, calmCap: 1400 },
  { theme: "explom", name: "オーバーゼッツ", cap: 2000, calmCap: 1300 },
  { theme: "kemonohen", name: "レディック", cap: 2100, calmCap: 1400 },
];

function mount(theme = "rexonance", { reducedMotion = false, economy = false } = {}) {
  const effects = [],
    timers = new Map(),
    frames = new Map(),
    subscribers = new Set();
  const gateStates = [];
  const delays = [];
  let serial = 0;
  const win = new EventTarget(),
    doc = new EventTarget();
  doc.documentElement = { dataset: economy ? { worldEffects: "economy" } : {} };
  Object.assign(win, {
    Image: class Image {
      decode() {
        return Promise.resolve();
      }
    },
    matchMedia: () => ({ matches: reducedMotion }),
    setTimeout: (callback, delay) => {
      timers.set(++serial, callback);
      delays.push(delay);
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
      if (name === "./form-signature-state") {
        const signatureExports = {};
        runInNewContext(compiledSignature, { ...scope, exports: signatureExports });
        return signatureExports;
      }
      if (name === "./use-dialog-history-dismiss") {
        const historyExports = {};
        runInNewContext(compiledHistory, { ...scope, exports: historyExports });
        return historyExports;
      }
      if (name === "./form-signature-gate")
        return { FormGate: "form-gate", FormArrival: "form-arrival" };
      if (name === "react-dom") return { createPortal: (node) => node, flushSync: (run) => run() };
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
      if (name === "@/lib/dossier-images")
        return { formPickupImage: () => ({}), dossierImage: () => ({}) };
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
    rider: { theme, name: THEMES.find((t) => t.theme === theme)?.name ?? "", img: "/rider.webp", calls: [] },
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
    opens: 0,
    showModal() {
      this.open = true;
      this.opens += 1;
    },
    close() {
      this.open = false;
    },
    focus() {},
  };
  find(tree, "dialog").props.ref.current = dialog;
  const control = find(tree, "slide-control");
  const opener = {
    dataset: {},
    focused: 0,
    blur() {},
    focus() {
      this.focused += 1;
    },
  };
  control.props.buttonRef.current = opener;
  const open = control.props.onOpen;
  const cleanups = effects.map((callback) => callback()).filter(Boolean);
  const flush = (queue) => {
    const pending = [...queue.values()];
    queue.clear();
    pending.forEach((callback) => callback());
  };
  return {
    open: (source = "keyboard") => open(source),
    dialog,
    opener,
    win,
    doc,
    gateStates,
    delays,
    frames,
    timers,
    flushTimers: () => flush(timers),
    flushFrames: () => flush(frames),
    history: (type) => subscribers.forEach((callback) => callback({ action: { type } })),
    unmount: () => cleanups.forEach((callback) => callback()),
  };
}

for (const { theme, cap, calmCap } of THEMES) {
  for (const action of ["BACK", "FORWARD", "GO"]) {
    test(`${theme}: ${action} during the form cover never opens its stale dialog`, () => {
      const ui = mount(theme);
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

  test(`${theme}: the cover hands over in one task: the record opens as the cover leaves`, () => {
    // Owner (2026-10-23): no frame between the cover and showModal, so no frame of the page
    // shows between them; a history step after the hand-over closes the record itself.
    const ui = mount(theme);
    ui.open();
    ui.flushTimers();
    assert.equal(ui.gateStates.at(-1), false);
    assert.equal(ui.dialog.open, true);
    assert.equal(ui.frames.size, 0);
    ui.history("BACK");
    assert.equal(ui.dialog.open, false);
    ui.unmount();
  });

  for (const event of ["blur", "pagehide", "visibilitychange"]) {
    test(`${theme}: ${event} cancels a pending form cover`, () => {
      const ui = mount(theme);
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

  test(`${theme}: Escape stops the cover and a keyboard reader keeps the control`, () => {
    const ui = mount(theme);
    ui.open("keyboard");
    const escape = new Event("keydown", { cancelable: true });
    Object.defineProperty(escape, "key", { value: "Escape" });
    ui.win.dispatchEvent(escape);
    assert.equal(escape.defaultPrevented, true);
    assert.equal(ui.gateStates.at(-1), false);
    assert.equal(ui.opener.focused, 1);
    ui.flushTimers();
    assert.equal(ui.dialog.open, false);
    // Escape with nothing pending is left alone.
    const idle = new Event("keydown", { cancelable: true });
    Object.defineProperty(idle, "key", { value: "Escape" });
    ui.win.dispatchEvent(idle);
    assert.equal(idle.defaultPrevented, false);
    ui.unmount();
  });

  test(`${theme}: a second press during the cover is ignored (one record, one cover)`, () => {
    const ui = mount(theme);
    ui.open();
    ui.open();
    ui.open("pointer");
    assert.equal(ui.gateStates.filter((value) => value === true).length, 1);
    ui.flushTimers();
    assert.equal(ui.dialog.opens, 1);
    ui.unmount();
  });

  test(`${theme}: the record opens by the cover's cap at every tier`, () => {
    for (const [options, expected] of [
      [{}, cap],
      [{ economy: true }, calmCap],
      [{ reducedMotion: true }, 180],
      [{ reducedMotion: true, economy: true }, 180],
    ]) {
      const ui = mount(theme, options);
      ui.open();
      assert.equal(ui.delays.at(-1), expected, JSON.stringify(options));
      ui.unmount();
    }
  });

  test(`${theme}: unmount during the cover never opens the record later`, () => {
    const ui = mount(theme);
    ui.open();
    ui.unmount();
    ui.flushTimers();
    ui.flushFrames();
    assert.equal(ui.dialog.open, false);
  });
}

test("forms without a cover open their record at once", () => {
  const ui = mount("none");
  ui.open();
  assert.equal(ui.dialog.open, true);
  assert.equal(ui.gateStates.length, 0);
  ui.unmount();
});
