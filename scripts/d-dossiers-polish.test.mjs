import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const transpile = (path) =>
  ts.transpileModule(read(path), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;

/* SlideOpenControl rendered with a minimal React stand-in, as in
   slide-lifecycle.test.mjs: a 240px pill with its 50px thumb at 4..54px. */
function mountSlide() {
  const timers = new Map();
  let serial = 0;
  let opened = 0;
  const win = new EventTarget();
  Object.assign(win, {
    setTimeout: (fn) => {
      timers.set(++serial, fn);
      return serial;
    },
    clearTimeout: (id) => timers.delete(id),
    requestAnimationFrame: () => ++serial,
    cancelAnimationFrame() {},
    matchMedia: () => ({ matches: false }),
  });
  const exports = {};
  runInNewContext(transpile("src/components/world/slide-open-control.tsx"), {
    exports,
    window: win,
    document: new EventTarget(),
    performance: { now: () => 10 },
    require: (name) => {
      if (name === "react")
        return {
          useRef: (current) => ({ current }),
          useCallback: (fn) => fn,
          useEffect() {},
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
  const element = exports.SlideOpenControl({ ariaLabel: "open", onOpen: () => (opened += 1) });
  const button = {
    dataset: {},
    style: { setProperty() {}, removeProperty() {} },
    getBoundingClientRect: () => ({ left: 0, right: 240, width: 240, top: 0, height: 56 }),
    blur() {},
    hasPointerCapture: () => false,
    releasePointerCapture() {},
  };
  element.props.ref(button);
  element.props.children.at(-1).props.ref.current = {
    getBoundingClientRect: () => ({ left: 4, right: 54, width: 50, top: 3, height: 50 }),
  };
  const pointer = (clientX, clientY = 28, pointerType = "touch") => ({
    isPrimary: true,
    pointerType,
    button: 0,
    pointerId: 1,
    clientX,
    clientY,
    currentTarget: button,
    preventDefault() {},
    stopPropagation() {},
  });
  const click = (clientX, clientY = 28, detail = 1) =>
    element.props.onClick({ detail, clientX, clientY, preventDefault() {}, stopPropagation() {} });
  const flush = () => {
    for (const [id, fn] of [...timers]) {
      timers.delete(id);
      fn();
    }
  };
  return { element, pointer, click, flush, opened: () => opened };
}

test("a stationary tap or click on the pill's label opens it", () => {
  for (const type of ["touch", "mouse"]) {
    const ui = mountSlide();
    ui.element.props.onPointerDown(ui.pointer(150, 28, type));
    ui.element.props.onPointerUp(ui.pointer(150, 28, type));
    ui.click(152, 30);
    ui.flush();
    assert.equal(ui.opened(), 1, type);
  }
});

test("a label press that travelled, or a click without a press, does not open", () => {
  const dragged = mountSlide();
  dragged.element.props.onPointerDown(dragged.pointer(110, 28, "mouse"));
  dragged.click(150);
  dragged.flush();
  assert.equal(dragged.opened(), 0);

  const stray = mountSlide();
  stray.click(150);
  stray.flush();
  assert.equal(stray.opened(), 0);
});

test("a thumb tap opens once: its trailing click is not a second body tap", () => {
  const ui = mountSlide();
  ui.element.props.onPointerDown(ui.pointer(30));
  ui.element.props.onPointerUp(ui.pointer(30));
  ui.click(30);
  ui.flush();
  assert.equal(ui.opened(), 1);
});

test("the whole pill reads as a button on mouse devices, the thumb as a handle", () => {
  const css = read("src/styles-pickup-stability.css");
  const fine = css.match(/@media \(hover: hover\) and \(pointer: fine\) \{[\s\S]*?\n\}/)?.[0] ?? "";
  assert.match(fine, /html \.ios-slide-open \{\s*cursor: pointer;/);
  assert.match(fine, /\.ios-slide-open-thumb \{\s*cursor: grab;/);
  assert.match(fine, /\[data-dragging="true"\][^{]*\{\s*cursor: grabbing;/);
});

/* DossierReader position logic against a page that has reached its end. */
function mountReaderAtEnd({ scrollend = true } = {}) {
  const selections = [];
  const listeners = new Map();
  const frames = new Map();
  const timers = new Map();
  let cleanup;
  let serial = 0;
  const sections = ["dossier-profile", "dossier-index", "form-records"].map((id, index) => ({
    id,
    top: index * 1000,
    scrollMarginTop: "52px",
    getBoundingClientRect() {
      return { top: this.top };
    },
  }));
  const root = { scrollPaddingTop: "96px", scrollHeight: 3000 };
  const window = {
    innerHeight: 1024,
    scrollY: 0,
    ...(scrollend ? { onscrollend: null } : {}),
    addEventListener: (type, callback) => listeners.set(type, callback),
    removeEventListener: (type) => listeners.delete(type),
    requestAnimationFrame: (callback) => {
      frames.set(++serial, callback);
      return serial;
    },
    cancelAnimationFrame: (id) => frames.delete(id),
    setTimeout: (fn) => {
      timers.set(++serial, fn);
      return serial;
    },
    clearTimeout: (id) => timers.delete(id),
  };
  const module = {};
  runInNewContext(transpile("src/components/world/dossier-reader.tsx"), {
    exports: module,
    require: (name) => {
      if (name === "react")
        return {
          useState: () => ["dossier-profile", (id) => selections.push(id)],
          useEffect: (effect) => {
            cleanup = effect();
          },
        };
      if (name === "react/jsx-runtime")
        return {
          jsx: (type, props) => ({ type, props }),
          jsxs: (type, props) => ({ type, props }),
        };
      throw new Error(`Unexpected dependency ${name}`);
    },
    document: {
      documentElement: root,
      getElementById: (id) => sections.find((section) => section.id === id) ?? null,
    },
    window,
    getComputedStyle: (element) => element,
    IntersectionObserver: class {
      observe() {}
      disconnect() {}
    },
  });
  module.DossierReader({ name: "テスト", forms: true });
  const [[id, initialize]] = frames;
  frames.delete(id);
  initialize();
  const runTimers = () => {
    const pending = [...timers.values()];
    timers.clear();
    pending.forEach((fn) => fn());
  };
  return { sections, selections, listeners, timers, runTimers, window, cleanup: () => cleanup() };
}

/* Scroll the mounted reader to its end: the short final section sits at 288px,
   below the 150px line, so the observer alone never selects it. */
function reachEnd(reader) {
  reader.window.scrollY = 3000 - 1024;
  reader.sections[0].top = -1700;
  reader.sections[1].top = -700;
  reader.sections[2].top = 288;
}

test("at the page end the last section in view becomes current once scrolling settles", () => {
  const reader = mountReaderAtEnd();
  assert.equal(reader.selections.at(-1), "dossier-profile");
  assert.ok(reader.listeners.has("scrollend"), "uses scrollend where the browser has it");
  assert.ok(reader.listeners.has("scroll"), "keeps the scroll debounce as a backstop");
  reachEnd(reader);
  reader.listeners.get("scrollend")();
  assert.equal(reader.selections.at(-1), "form-records");
  // Scrolling back up hands the tab back to the section under the line.
  reader.window.scrollY = 1200;
  reader.sections[1].top = 100;
  reader.sections[2].top = 1100;
  reader.listeners.get("scrollend")();
  assert.equal(reader.selections.at(-1), "dossier-index");
  reader.cleanup();
  assert.equal(reader.listeners.size, 0);
});

test("the page end still settles when scrollend is dropped or missing", () => {
  // Chrome can skip scrollend for a wheel scroll clamped by a late layout
  // change, and older Safari has none: the trailing scroll debounce decides.
  for (const scrollend of [true, false]) {
    const reader = mountReaderAtEnd({ scrollend });
    assert.equal(reader.listeners.has("scrollend"), scrollend);
    reachEnd(reader);
    reader.listeners.get("scroll")();
    reader.listeners.get("scroll")();
    assert.equal(reader.timers.size, 1, "each scroll restarts one trailing timer");
    assert.equal(reader.selections.at(-1), "dossier-profile", "nothing settles mid-scroll");
    reader.runTimers();
    assert.equal(reader.selections.at(-1), "form-records");
    reader.listeners.get("scroll")();
    reader.cleanup();
    assert.equal(reader.timers.size, 0, "unmount cancels a pending settle");
    assert.equal(reader.listeners.size, 0);
  }
});

test("dossier jumps land just under the sticky reader at every width", () => {
  const css = read("src/styles-dossier-reader.css");
  const rules = [
    ...css.matchAll(/#form-records, \.manager-copy-section\) \{\s*scroll-margin-top: ([^;]+);/g),
  ];
  assert.deepEqual(
    rules.map((match) => match[1]),
    ["52px"],
  );
});

test("dossier layout polish stays in the non-mirrored override sheets", () => {
  const reader = read("src/styles-dossier-reader.css");
  assert.match(
    reader,
    /main\.manager-page \.rider-archive-identity-records \{\s*width: min\(1200px, calc\(100% - 48px\)\);\s*margin-inline: auto;/,
  );
  assert.match(
    reader,
    /main\.manager-page \.lejas-tap-hint \{\s*top: auto;\s*right: 16px;\s*bottom: 52px;[^}]*font-size: 11px;/,
  );
  assert.match(reader, /\.manager-numeral \{[^}]*min-width: calc\(1lh \+ 17px\);/);
  assert.match(reader, /repeat\(auto-fit, minmax\(min\(100%, 12\.5em\), 1fr\)\)/);

  const pickup = read("src/styles-pickup-stability.css");
  // Reserve a box only until the art loads; a fixed ratio would crop 3:4 art.
  assert.match(pickup, /\.form-pickup-visual > img \{\s*aspect-ratio: auto 2 \/ 3;/);
  assert.doesNotMatch(pickup, /\.form-pickup-visual \{[^}]*aspect-ratio/);
  assert.match(pickup, /\.form-pickup-layout\s*> figure \{\s*position: sticky;/);

  const pagination = read("src/styles-world/11.css");
  assert.doesNotMatch(pagination, /\.manager-pagination-index \{[^}]*order: 1/);
  assert.match(
    read("src/styles-world/15.css"),
    /\.rider-nightmare-card-copy > h2 \{[^}]*word-break: keep-all;/,
  );
  assert.match(
    read("src/styles-other-artwork.css"),
    /\.other-artwork-viewer > img \{[^}]*max-height: calc\(\s*100dvh/,
  );
});
