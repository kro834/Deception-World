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
    innerWidth: 1280,
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
  const pointer = (clientX, pointerType = "mouse") => ({
    currentTarget: button,
    isPrimary: true,
    pointerType,
    button: 0,
    pointerId: 7,
    clientX,
    clientY: 25,
    preventDefault() {},
    stopPropagation() {},
  });
  return {
    click,
    flush,
    win,
    doc,
    button,
    frames,
    startDrag: () => element.props.onPointerDown(pointer(29)),
    drag: () => element.props.onPointerMove(pointer(149)),
    release: () => element.props.onPointerUp(pointer(149)),
    // Free pointer paths for the abandoned-slide cases (thumb centre at x 29).
    press: (x, type) => element.props.onPointerDown(pointer(x, type)),
    move: (x, type) => element.props.onPointerMove(pointer(x, type)),
    up: (x, type) => element.props.onPointerUp(pointer(x, type)),
    // The label path: the browser's own click ends a body press.
    at: (x, y, type) => ({ ...pointer(x, type), clientY: y }),
    pointerDown: (event) => element.props.onPointerDown(event),
    pointerMove: (event) => element.props.onPointerMove(event),
    pointerLeave: (event) => element.props.onPointerLeave(event),
    labelClick: (x, y) =>
      element.props.onClick({
        detail: 1,
        clientX: x,
        clientY: y,
        preventDefault() {},
        stopPropagation() {},
      }),
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

for (const event of ["orientationchange", "resize"]) {
  test(`${event} cancels a captured slider before stale coordinates can open it`, () => {
    const ui = mount();
    ui.startDrag();
    ui.drag();
    assert.equal(ui.button.dataset.dragging, "true");
    if (event === "resize") ui.win.innerWidth = 390;
    ui.win.dispatchEvent(new Event(event));
    assert.equal(ui.button.dataset.dragging, "false");
    ui.release();
    ui.flush();
    assert.equal(ui.opened(), 0);
    ui.click();
    ui.flush();
    assert.equal(ui.opened(), 1, "the next deliberate activation should still work");
    ui.unmount();
  });
}

test("mobile toolbar height changes do not interrupt a deliberate slider gesture", () => {
  const ui = mount();
  ui.startDrag();
  ui.drag();
  ui.win.innerHeight = 760;
  ui.win.dispatchEvent(new Event("resize"));
  assert.equal(ui.button.dataset.dragging, "true");
  ui.release();
  ui.flush();
  assert.equal(ui.opened(), 1);
  ui.unmount();
});

// An abandoned slide (out past the tap tolerance, then back) is "never mind".
test("a thumb slid out 40px and back to its start never opens (mouse)", () => {
  const ui = mount();
  ui.press(29);
  for (const x of [41, 55, 69]) ui.move(x);
  assert.equal(ui.button.dataset.dragging, "true");
  for (const x of [55, 41, 30, 29]) ui.move(x);
  ui.up(29);
  ui.flush();
  assert.equal(ui.opened(), 0);
  assert.equal(ui.button.dataset.completing, "false");
  ui.unmount();
});

test("a held touch slid out 40px and back never opens", () => {
  const ui = mount();
  ui.press(29, "touch");
  assert.equal(ui.button.dataset.holding, "true");
  ui.flush(); // the hold activates the drag
  assert.equal(ui.button.dataset.dragging, "true");
  for (const x of [45, 69, 45, 29]) ui.move(x, "touch");
  ui.up(29, "touch");
  ui.flush();
  assert.equal(ui.opened(), 0);
  ui.unmount();
});

test("a stationary press and release on the thumb still opens once", () => {
  for (const type of ["mouse", "touch"]) {
    const ui = mount();
    ui.press(29, type);
    if (type === "touch") ui.flush(); // held past the activation
    ui.move(33, type); // natural jitter inside the tap tolerance
    ui.up(30, type);
    ui.flush();
    assert.equal(ui.opened(), 1, type);
    ui.unmount();
  }
});

test("a slide past 40% of the travel still opens once", () => {
  const ui = mount();
  ui.press(29);
  for (const x of [45, 90, 149]) ui.move(x);
  ui.up(149);
  ui.flush();
  assert.equal(ui.opened(), 1);
  ui.unmount();
});

test("the horizontal tap test names the peak-travel guard", () => {
  const source = readFileSync(
    new URL("../src/components/world/slide-open-control.tsx", import.meta.url),
    "utf8",
  );
  assert.match(
    source,
    /const isThumbTap =\s*deltaX < TAP_TOLERANCE && deltaY < TAP_TOLERANCE && peakTravel\.current < TAP_TOLERANCE;/,
  );
  assert.match(source, /peakTravel\.current = Math\.max\(/);
});

// The label (not the thumb) is an ordinary button: a press released in place
// opens, but a press dragged out and back is abandoned, like the thumb's.
test("a label press dragged out 40px and back never opens (mouse)", () => {
  const ui = mount();
  ui.pointerDown(ui.at(150, 25));
  for (const y of [33, 45, 53, 45, 33, 26]) ui.pointerMove(ui.at(150, y));
  ui.labelClick(150, 26);
  ui.flush();
  assert.equal(ui.opened(), 0);
  ui.unmount();
});

test("a label press that leaves the control and comes back never opens (mouse)", () => {
  const ui = mount();
  ui.pointerDown(ui.at(150, 25));
  ui.pointerLeave(ui.at(150, 60));
  ui.labelClick(150, 25);
  ui.flush();
  assert.equal(ui.opened(), 0);
  ui.unmount();
});

test("a label tap with natural jitter still opens once (mouse and touch)", () => {
  for (const type of ["mouse", "touch"]) {
    const ui = mount();
    ui.pointerDown(ui.at(150, 25, type));
    ui.pointerMove(ui.at(154, 28, type));
    // Touch leaves only after its release: never read as a drag away.
    if (type === "touch") ui.pointerLeave(ui.at(154, 28, type));
    ui.labelClick(153, 27);
    ui.flush();
    assert.equal(ui.opened(), 1, type);
    ui.unmount();
  }
});
