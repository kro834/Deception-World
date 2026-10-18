import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { isAndroidRenderer } from "../src/lib/rendering-profile.js";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const compile = (source) =>
  ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
const source = read("src/components/zeus-button.tsx");

// Execute the actual component handlers/effects, not a parallel gesture model.
function mount(scale = 1) {
  const effects = [],
    frames = new Map(),
    timers = new Map(),
    saved = [];
  let serial = 0,
    navigated = 0,
    guarded = 0;
  class Element extends EventTarget {
    dataset = {};
    attributes = new Map();
    capture = null;
    offsetWidth = 60;
    offsetHeight = 60;
    offsetLeft = 0;
    offsetTop = 0;
    offsetParent = null;
    style = {
      left: "0px",
      top: "0px",
      removeProperty(name) {
        delete this[name];
      },
    };
    setAttribute(name, value) {
      this.attributes.set(name, value);
    }
    getAttribute(name) {
      return this.attributes.get(name) ?? null;
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
      const [tx = 0, ty = 0] = (this.style.translate ?? "0 0").split(" ").map(parseFloat);
      const x = (parseFloat(this.style.left) + tx) * scale;
      const y = (parseFloat(this.style.top) + ty) * scale;
      const size = 60 * scale * (this.dataset.dragging === "true" ? 1.075 : 1);
      return {
        left: x - size / 2,
        right: x + size / 2,
        top: y - size / 2,
        bottom: y + size / 2,
        width: size,
        height: size,
      };
    }
  }
  const button = new Element();
  if (scale !== 1) {
    button.offsetParent = Object.assign(new Element(), {
      offsetWidth: 1000,
      offsetHeight: 1000,
      getBoundingClientRect: () => ({ width: 1000 * scale, height: 1000 * scale }),
    });
  }
  const win = new EventTarget(),
    doc = new EventTarget();
  Object.assign(win, {
    innerWidth: 390,
    innerHeight: 844,
    visualViewport: null,
    requestAnimationFrame(fn) {
      frames.set(++serial, fn);
      return serial;
    },
    cancelAnimationFrame: (id) => frames.delete(id),
    setTimeout(fn) {
      timers.set(++serial, fn);
      return serial;
    },
    clearTimeout: (id) => timers.delete(id),
    getComputedStyle: () => ({ getPropertyValue: () => "0" }),
  });
  Object.assign(doc, {
    hidden: false,
    documentElement: new Element(),
    scrollingElement: { scrollTop: 0, scrollHeight: 2000 },
    querySelectorAll: () => [],
    createRange: () => ({}),
  });
  const geometry = {},
    resize = {},
    exports = {};
  runInNewContext(compile(read("src/lib/zeus-drag.ts")), { exports: geometry });
  runInNewContext(compile(read("src/lib/viewport-resize.ts")), { exports: resize, window: win });
  runInNewContext(compile(source) + "\nexports.TestButton = ZeusButton;", {
    exports,
    window: win,
    document: doc,
    navigator: { userAgent: "Desktop" },
    Element,
    HTMLElement: Element,
    HTMLButtonElement: Element,
    MutationObserver: class {
      observe() {}
      disconnect() {}
    },
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
      if (name === "@/lib/tap-through-guard") return { guardTapThrough: () => guarded++ };
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
  const cleanup = effects.map((fn) => fn());
  const flush = (queue) => {
    for (const [id, fn] of [...queue]) {
      queue.delete(id);
      fn();
    }
  };
  flush(frames);
  const center = () => {
    const rect = button.getBoundingClientRect();
    return { x: (rect.left + rect.right) / 2, y: (rect.top + rect.bottom) / 2 };
  };
  const event = (point = center(), extra = {}) => ({
    pointerId: 1,
    pointerType: "touch",
    isPrimary: true,
    button: 0,
    clientX: point.x,
    clientY: point.y,
    timeStamp: 1000,
    currentTarget: button,
    preventDefault() {},
    ...extra,
  });
  return {
    win,
    doc,
    button,
    saved,
    frames,
    timers,
    center,
    event,
    handlers: element.props,
    flushFrames: () => flush(frames),
    flushTimers: () => flush(timers),
    navigated: () => navigated,
    guarded: () => guarded,
    hold() {
      element.props.onPointerDown(event());
      flush(timers);
    },
    unmount: () => cleanup.forEach((fn) => fn?.()),
  };
}

for (const scale of [0.75, 1, 1.2]) {
  test(`pressing an in-flight dodge freezes its drawn center at scale ${scale}`, () => {
    const ui = mount(scale);
    ui.button.dataset.relocating = "true";
    ui.button.style.translate = "-40px -40px";
    const before = ui.center();
    const press = ui.event({ x: before.x + 7, y: before.y - 4 });
    ui.handlers.onPointerDown(press);
    assert.ok(Math.hypot(ui.center().x - before.x, ui.center().y - before.y) < 0.01);
    assert.equal(ui.button.style.translate, undefined);
    assert.equal(ui.button.dataset.relocating, undefined);
    ui.flushTimers();
    ui.handlers.onPointerMove(ui.event({ x: before.x + 37, y: before.y + 26 }));
    ui.flushFrames();
    assert.ok(Math.hypot(ui.center().x - before.x - 30, ui.center().y - before.y - 30) < 0.01);
    ui.handlers.onPointerCancel(ui.event());
    assert.ok(Math.hypot(ui.center().x - before.x, ui.center().y - before.y) < 0.01);
    assert.equal(ui.saved.length, 0, "cancellation never changes the chosen home");
    assert.equal(ui.navigated(), 0);
    ui.unmount();
  });

  test(`an edge drop saves the rendered resting boundary at scale ${scale}`, () => {
    const ui = mount(scale);
    ui.hold();
    ui.handlers.onPointerUp(ui.event({ x: 15, y: 422 }));
    assert.equal(ui.saved.length, 1);
    assert.ok(Math.abs(ui.saved[0].x - (12 + 30 * scale) / 390) < 0.00001);
    assert.equal(ui.navigated(), 0);
    assert.equal(ui.guarded(), 1, "touch drop's compatibility click cannot hit a card below");
    ui.unmount();
  });
}

for (const held of [false, true]) {
  test(`a second finger cancels the ${held ? "held drag" : "pending hold"} before it moves`, () => {
    const ui = mount();
    ui.handlers.onPointerDown(ui.event());
    if (held) ui.flushTimers();
    const another = Object.assign(new Event("pointerdown", { cancelable: true }), {
      pointerId: 2,
      pointerType: "touch",
      isPrimary: false,
    });
    ui.win.dispatchEvent(another);
    ui.flushTimers();
    ui.handlers.onPointerUp(ui.event());
    assert.equal(
      another.defaultPrevented,
      false,
      "native pinch/scroll still owns the second finger",
    );
    assert.equal(ui.button.dataset.dragging, "false");
    assert.equal(ui.timers.size, 0);
    assert.equal(ui.saved.length, 0);
    assert.equal(ui.navigated(), 0);
    ui.handlers.onPointerDown(ui.event());
    ui.handlers.onPointerUp(ui.event());
    assert.equal(ui.navigated(), 1, "the next ordinary tap remains usable");
    ui.unmount();
  });
}

for (const resume of ["pageshow", "visibilitychange"]) {
  test(`${resume} reconciles a changed viewport once without a resize or saved-position write`, () => {
    const ui = mount();
    ui.win.dispatchEvent(new Event("scroll"));
    // Phone scroll now owns both collision settling and its independent reveal timer.
    assert.equal(ui.timers.size, 2);
    ui.doc.hidden = true;
    ui.doc.dispatchEvent(new Event("visibilitychange"));
    assert.equal(ui.timers.size, 0, "suspended collision work is removed");
    ui.win.innerWidth = 320;
    ui.win.innerHeight = 390;
    ui.doc.hidden = false;
    (resume === "pageshow" ? ui.win : ui.doc).dispatchEvent(new Event(resume));
    (resume === "pageshow" ? ui.win : ui.doc).dispatchEvent(new Event(resume));
    assert.equal(ui.frames.size, 1, "duplicate resume signals are frame-coalesced");
    ui.flushFrames();
    const rect = ui.button.getBoundingClientRect();
    assert.ok(rect.left >= 12 && rect.right <= 308 && rect.top >= 12 && rect.bottom <= 378);
    assert.equal(ui.saved.length, 0);
    assert.equal(ui.timers.size, 0);
    ui.unmount();
    ui.win.dispatchEvent(new Event("pageshow"));
    ui.doc.dispatchEvent(new Event("visibilitychange"));
    assert.equal(ui.frames.size, 0, "resume listeners are removed with their portal");
  });
}

test("both Zeus image variants stay low priority while preserving their thumbnail sources", () => {
  // The optional, tenth-tap secret artwork is not an ordinary navigation
  // image. Both established variants must retain their exact delivery policy.
  const images = (source.match(/<img\b[\s\S]*?\/>/g) ?? []).filter((image) =>
    /className="zeus-button-image\s/.test(image),
  );
  assert.equal(images.length, 2);
  for (const image of images) assert.match(image, /fetchPriority="low"/);
  assert.match(images[0], /srcSet=\{CIEL_BUTTON_SRCSET\}/);
  assert.match(images[1], /srcSet=\{CIEL_BUTTON_SRCSET\}/);
});

test("phone scrolling hides Zeus until idle and cancels its reveal work on disposal", () => {
  const ui = mount();
  ui.win.dispatchEvent(new Event("scroll"));
  assert.equal(ui.button.dataset.scrolling, "true");
  ui.win.dispatchEvent(new Event("scroll"));
  assert.equal(ui.timers.size, 2, "repeated scrolls replace timers instead of accumulating work");
  ui.flushTimers();
  assert.equal(ui.button.dataset.scrolling, undefined);
  ui.flushFrames();
  assert.equal(ui.saved.length, 0, "reading never changes the chosen saved position");
  ui.win.dispatchEvent(new Event("scroll"));
  ui.unmount();
  assert.equal(ui.button.dataset.scrolling, undefined);
  assert.equal(ui.timers.size, 0);
  ui.win.dispatchEvent(new Event("scroll"));
  assert.equal(ui.timers.size, 0);
});

test("a held drag and wider screens do not acquire phone reading suppression", () => {
  const ui = mount();
  ui.hold();
  ui.win.dispatchEvent(new Event("scroll"));
  assert.equal(ui.button.dataset.scrolling, undefined);
  ui.handlers.onPointerCancel(ui.event());
  ui.win.innerWidth = 1024;
  ui.win.dispatchEvent(new Event("scroll"));
  assert.equal(ui.button.dataset.scrolling, undefined);
  ui.unmount();
});
