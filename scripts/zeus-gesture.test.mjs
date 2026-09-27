import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";
import { isAndroidRenderer } from "../src/lib/rendering-profile.js";

const compile = (path) =>
  ts.transpileModule(readFileSync(new URL(`../${path}`, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
const component = compile("src/components/zeus-button.tsx") + "\nexports.TestButton = ZeusButton;";
const geometryCode = compile("src/lib/zeus-drag.ts");
const resizeCode = compile("src/lib/viewport-resize.ts");

function mount({ scale = 1, android = true } = {}) {
  const effects = [],
    timers = new Map(),
    frames = new Map(),
    saved = [],
    timerDelays = [];
  let serial = 0,
    navigated = 0,
    layoutReads = 0,
    guardCalls = 0;
  class Element extends EventTarget {
    dataset = {};
    style = {
      left: "0px",
      top: "0px",
      removeProperty(name) {
        delete this[name];
      },
    };
    capture = null;
    offsetWidth = 60;
    offsetHeight = 60;
    offsetLeft = 0;
    offsetTop = 0;
    offsetParent = null;
    setAttribute(name, value) {
      this[name] = value;
    }
    closest() {
      return null;
    }
    contains() {
      return false;
    }
    setPointerCapture(id) {
      this.capture = id;
    }
    hasPointerCapture(id) {
      return this.capture === id;
    }
    releasePointerCapture() {
      this.capture = null;
    }
    getBoundingClientRect() {
      layoutReads++;
      const [tx = 0, ty = 0] = (this.style.translate ?? "0 0").split(" ").map(parseFloat);
      const x = (parseFloat(this.style.left) + tx) * scale;
      const y = (parseFloat(this.style.top) + ty) * scale;
      const size = 60 * scale * (this.dataset.dragging === "true" ? 1.075 : 1);
      return {
        x: x - size / 2,
        y: y - size / 2,
        left: x - size / 2,
        top: y - size / 2,
        right: x + size / 2,
        bottom: y + size / 2,
        width: size,
        height: size,
      };
    }
  }
  const button = new Element();
  if (scale !== 1)
    button.offsetParent = Object.assign(new Element(), {
      offsetWidth: 1000,
      offsetHeight: 1000,
      getBoundingClientRect: () => ({ width: 1000 * scale, height: 1000 * scale }),
    });
  const win = new EventTarget(),
    doc = new EventTarget();
  Object.assign(win, {
    innerWidth: 390,
    innerHeight: 844,
    setTimeout(fn, delay) {
      timerDelays.push(delay);
      timers.set(++serial, fn);
      return serial;
    },
    clearTimeout: (id) => timers.delete(id),
    requestAnimationFrame(fn) {
      frames.set(++serial, fn);
      return serial;
    },
    cancelAnimationFrame: (id) => frames.delete(id),
    getComputedStyle: () => ({ getPropertyValue: () => "0" }),
  });
  Object.assign(doc, {
    hidden: false,
    querySelectorAll: () => [],
    createRange: () => ({}),
    scrollingElement: { scrollTop: 0, scrollHeight: 2000 },
  });
  const geometry = {},
    resize = {};
  runInNewContext(geometryCode, { exports: geometry });
  runInNewContext(resizeCode, { exports: resize, window: win });
  const exports = {};
  runInNewContext(component, {
    exports,
    window: win,
    document: doc,
    navigator: { userAgent: android ? "Android" : "Desktop", hardwareConcurrency: 8 },
    Element,
    HTMLElement: Element,
    HTMLButtonElement: Element,
    require(name) {
      if (name === "react")
        return {
          createContext: () => ({}),
          useRef: (current) => ({ current }),
          useCallback: (fn) => fn,
          useEffect: (fn) => effects.push(fn),
        };
      if (name === "react/jsx-runtime")
        return {
          jsx: (type, props) => ({ type, props }),
          jsxs: (type, props) => ({ type, props }),
        };
      if (name === "@/lib/zeus-drag") return geometry;
      if (name === "@/lib/viewport-resize") return resize;
      if (name === "@/lib/rendering-profile.js") return { isAndroidRenderer };
      if (name === "@/lib/tap-through-guard") return { guardTapThrough: () => guardCalls++ };
      return {};
    },
  });
  const element = exports.TestButton({
    position: { x: 0.8, y: 0.8 },
    sideMenuOpen: false,
    navigating: false,
    returnImage: false,
    onPositionChange: (position) => saved.push({ ...position }),
    onNavigate: async () => {
      navigated++;
    },
  });
  element.props.ref.current = button;
  const cleanups = effects.map((fn) => fn());
  const flush = (queue) => {
    for (const [id, fn] of [...queue]) {
      queue.delete(id);
      fn();
    }
  };
  flush(frames);
  const center = () => {
    const r = button.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  };
  const origin = center();
  const event = (x = origin.x, y = origin.y) => ({
    pointerId: 1,
    pointerType: "touch",
    isPrimary: true,
    button: 0,
    clientX: x,
    clientY: y,
    currentTarget: button,
    preventDefault() {},
  });
  return {
    win,
    doc,
    button,
    saved,
    origin,
    event,
    handlers: element.props,
    hold: () => {
      element.props.onPointerDown(event());
      flush(timers);
    },
    flushFrames: () => flush(frames),
    frames,
    timers,
    timerDelays,
    center,
    reads: () => layoutReads,
    navigated: () => navigated,
    guardCalls: () => guardCalls,
    unmount: () => cleanups.forEach((fn) => fn?.()),
  };
}

test("one pointer tap navigates once; a swipe or displaced release never navigates", () => {
  const tap = mount();
  tap.handlers.onPointerDown(tap.event());
  tap.handlers.onPointerUp(tap.event());
  tap.handlers.onClick({ detail: 1, preventDefault() {} });
  assert.equal(tap.navigated(), 1);
  assert.equal(tap.guardCalls(), 1);
  const swipe = mount();
  swipe.handlers.onPointerDown(swipe.event());
  swipe.handlers.onPointerMove(swipe.event(swipe.origin.x, swipe.origin.y - 30));
  swipe.handlers.onPointerUp(swipe.event());
  assert.equal(swipe.navigated(), 0);
  assert.equal(swipe.timers.size, 0);
  const outside = mount();
  outside.handlers.onPointerDown(outside.event());
  outside.handlers.onPointerUp(outside.event(outside.origin.x + 20, outside.origin.y));
  assert.equal(outside.navigated(), 0);
});

test("scroll before the long press cancels navigation; scrolling settles once per platform", () => {
  for (const android of [true, false]) {
    const ui = mount({ android });
    ui.handlers.onPointerDown(ui.event());
    ui.win.dispatchEvent(new Event("scroll"));
    ui.handlers.onPointerUp(ui.event());
    assert.equal(ui.navigated(), 0);
    for (let i = 0; i < 12; i++) ui.win.dispatchEvent(new Event("scroll"));
    assert.equal(ui.timers.size, 1);
    assert.equal(ui.timerDelays.at(-1), android ? 140 : 72);
    ui.unmount();
  }
});

test("keyboard activation remains available and Android's native hold menu is suppressed", () => {
  const ui = mount();
  ui.handlers.onClick({ detail: 0, preventDefault() {} });
  assert.equal(ui.navigated(), 1);
  let prevented = false;
  ui.handlers.onContextMenu({
    preventDefault: () => {
      prevented = true;
    },
  });
  assert.equal(prevented, true);
});

for (const scale of [1, 0.75, 1.2]) {
  test(`held movement is coalesced with zero per-frame layout reads at containing-block scale ${scale}`, () => {
    const ui = mount({ scale });
    ui.hold();
    const reads = ui.reads();
    for (let i = 0; i < 20; i++) ui.handlers.onPointerMove(ui.event(170 + i, 400 + i));
    assert.equal(ui.frames.size, 1);
    ui.flushFrames();
    assert.equal(ui.reads(), reads);
    assert.ok(Math.abs(ui.center().x - 189) < 0.01);
    // Release before the next animation frame still commits the newest sample.
    ui.handlers.onPointerMove(ui.event(194, 421));
    ui.handlers.onPointerUp(ui.event(195, 422));
    assert.equal(ui.frames.size, 0);
    assert.equal(ui.saved.length, 1);
    assert.ok(Math.abs(ui.saved[0].x - 0.5) < 0.001);
    assert.ok(Math.abs(ui.saved[0].y - 0.5) < 0.001);
    assert.ok(Math.abs(ui.center().x - 195) < 0.01);
    assert.equal(ui.button.style.translate, undefined);
    assert.equal(ui.navigated(), 0);
  });
}

for (const reason of ["pointercancel", "blur", "pagehide", "visibilitychange", "Escape"]) {
  test(`${reason} restores the held origin, clears work and allows the next tap`, () => {
    const ui = mount();
    ui.hold();
    ui.handlers.onPointerMove(ui.event(195, 422));
    ui.flushFrames();
    ui.handlers.onPointerMove(ui.event(210, 430));
    if (reason === "pointercancel") ui.handlers.onPointerCancel(ui.event(210, 430));
    else if (reason === "Escape") ui.handlers.onKeyDown({ key: reason, preventDefault() {} });
    else if (reason === "visibilitychange") {
      ui.doc.hidden = true;
      ui.doc.dispatchEvent(new Event(reason));
    } else ui.win.dispatchEvent(new Event(reason));
    assert.equal(ui.frames.size, 0);
    assert.equal(ui.saved.length, 0);
    assert.equal(ui.button.dataset.dragging, "false");
    assert.equal(ui.button.style.translate, undefined);
    assert.ok(Math.abs(ui.center().x - ui.origin.x) < 0.01);
    ui.handlers.onPointerDown(ui.event());
    ui.handlers.onPointerUp(ui.event());
    assert.equal(ui.navigated(), 1);
  });
}

test("a second touch hands control back to pinch zoom without swallowing that touch", () => {
  const ui = mount();
  ui.hold();
  const pinch = Object.assign(new Event("touchmove", { cancelable: true }), { touches: [{}, {}] });
  ui.win.dispatchEvent(pinch);
  assert.equal(pinch.defaultPrevented, false);
  assert.equal(ui.button.dataset.dragging, "false");
  const scroll = Object.assign(new Event("touchmove", { cancelable: true }), { touches: [{}] });
  ui.win.dispatchEvent(scroll);
  assert.equal(scroll.defaultPrevented, false, "global touch guard was removed");
});

test("rotation cancels stale geometry, and unmount removes queued drawing and the touch guard", () => {
  const ui = mount();
  ui.hold();
  ui.handlers.onPointerMove(ui.event(195, 422));
  ui.win.innerWidth = 844;
  ui.win.innerHeight = 390;
  ui.win.dispatchEvent(new Event("resize"));
  assert.equal(ui.button.dataset.dragging, "false");
  assert.equal(ui.saved.length, 0);
  ui.flushFrames();
  const r = ui.button.getBoundingClientRect();
  assert.ok(r.left >= 12 && r.right <= 832 && r.top >= 12 && r.bottom <= 378);
  ui.hold();
  ui.handlers.onPointerMove(ui.event(200, 200));
  ui.unmount();
  assert.equal(ui.frames.size, 0);
  assert.equal(ui.timers.size, 0);
  const scroll = Object.assign(new Event("touchmove", { cancelable: true }), { touches: [{}] });
  ui.win.dispatchEvent(scroll);
  assert.equal(scroll.defaultPrevented, false);
});
