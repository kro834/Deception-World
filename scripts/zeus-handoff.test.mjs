import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";
import { isAndroidRenderer } from "../src/lib/rendering-profile.js";

/* 2026-10-21 sweep F05/F32: the floating button glided across the page when
   the reader paused (a 1,296 px flip at 1440 over the pinned key visual, a
   0.143 CLS walk from this button alone) and rested on the Rexonance page's
   read-outs, HUD and labels. A relocation the reader did not ask for now
   hands off in place (fade out, move hidden, fade in), a dock keeps its
   glide, a jump with no hand-off is hidden for the frame it lands in, and a
   settle waits for words still arriving under its spots before it decides.
   This runs the component's own handlers and effects (as
   zeus-behavior-refinement.test.mjs does), not a parallel model. */

const read = (path) =>
  readFileSync(new URL(`../${path}`, import.meta.url), "utf8").replaceAll("\r\n", "\n");
const compile = (source) =>
  ts.transpileModule(source, {
    // ES2022: the placement loop iterates candidates.entries().
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
const source = read("src/components/zeus-button.tsx");
const chrome = read("src/styles-chrome-elevation.css");

function mount({ reduced = false, control = null, animations = null, page = false } = {}) {
  const effects = [],
    frames = new Map(),
    timers = new Map(),
    delays = new Map(),
    saved = [];
  let serial = 0;
  class Element extends EventTarget {
    dataset = {};
    attributes = new Map();
    offsetWidth = 60;
    offsetHeight = 60;
    offsetLeft = 0;
    offsetTop = 0;
    offsetParent = null;
    capture = null;
    style = {
      left: "0px",
      top: "0px",
      removeProperty(name) {
        delete this[name];
      },
    };
    rect = null;
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
      if (this.rect) return this.rect;
      const [tx = 0, ty = 0] = (this.style.translate ?? "0 0").split(" ").map(parseFloat);
      const x = parseFloat(this.style.left) + tx;
      const y = parseFloat(this.style.top) + ty;
      return { left: x - 30, right: x + 30, top: y - 30, bottom: y + 30, width: 60, height: 60 };
    }
  }
  const button = new Element();
  const win = new EventTarget(),
    doc = new EventTarget();
  Object.assign(win, {
    innerWidth: 390,
    innerHeight: 844,
    scrollY: 0,
    visualViewport: null,
    requestAnimationFrame(fn) {
      frames.set(++serial, fn);
      return serial;
    },
    cancelAnimationFrame: (id) => frames.delete(id),
    setTimeout(fn, delay) {
      timers.set(++serial, fn);
      delays.set(serial, delay);
      return serial;
    },
    clearTimeout: (id) => timers.delete(id),
    getComputedStyle: () => ({ getPropertyValue: () => "0" }),
    matchMedia: (query) => ({ matches: reduced && /reduce/.test(query) }),
  });
  const timeline = {};
  // The control arrives once the button rests (it scrolls in under it).
  const controls = [];
  const arriving = control ? Object.assign(new Element(), { rect: control }) : null;
  Object.assign(doc, {
    hidden: false,
    timeline,
    documentElement: new Element(),
    scrollingElement: { scrollTop: 0, scrollHeight: 4000 },
    // Only the critical controls answer; the words and art lists are empty.
    querySelectorAll: (selector) => (selector.includes(".episode-pickup-plus") ? controls : []),
    // The Rexonance page, where a crowded settle steps the button aside.
    querySelector: (selector) => (page && selector === ".rxs-rexonance-page" ? {} : null),
    activeElement: null,
    createRange: () => ({}),
    ...(animations ? { getAnimations: () => animations(Element, timeline) } : {}),
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
      if (name === "@/lib/tap-through-guard") return { guardTapThrough: () => {} };
      return {};
    },
  });
  const element = exports.TestButton({
    position: { x: 0.8, y: 0.8 },
    sideMenuOpen: false,
    navigating: false,
    returnImage: false,
    onPositionChange: (position) => saved.push({ ...position }),
    onNavigate: async () => {},
  });
  element.props.ref.current = button;
  const cleanup = effects.map((fn) => fn());
  const flush = (queue) => {
    for (const [id, fn] of [...queue]) {
      queue.delete(id);
      fn();
    }
  };
  const center = () => {
    const rect = button.getBoundingClientRect();
    return { x: (rect.left + rect.right) / 2, y: (rect.top + rect.bottom) / 2 };
  };
  // Arrive: the placement frame, then the two frames of the hidden move.
  flush(frames);
  flush(frames);
  flush(frames);
  if (arriving) controls.push(arriving);
  return {
    win,
    doc,
    button,
    saved,
    frames,
    timers,
    delays,
    center,
    handlers: element.props,
    flushFrames: () => flush(frames),
    flushTimers: () => flush(timers),
    // Controls under the spots (each a full-width band under 45% of the screen).
    setControls(rects) {
      controls.splice(
        0,
        controls.length,
        ...rects.map((rect) => Object.assign(new Element(), { rect })),
      );
    },
    // Scroll, then let the settle timer and its placement frame run.
    settle() {
      win.dispatchEvent(new Event("scroll"));
      flush(timers);
      flush(frames);
    },
    unmount: () => cleanup.forEach((fn) => fn?.()),
  };
}

const round = ({ x, y }) => ({ x: Math.round(x), y: Math.round(y) });
// Home is (312, 675); a control there sends the button one step up (to 587).
const HOME_CONTROL = { left: 290, right: 336, top: 655, bottom: 695, width: 46, height: 40 };

test("a step off a control fades out in place, moves hidden, and fades back in", () => {
  const ui = mount({ control: HOME_CONTROL });
  const home = round(ui.center());
  assert.deepEqual(home, { x: 312, y: 675 });
  assert.equal(ui.button.dataset.relocating, undefined);
  ui.settle();
  // Fading where it is: nothing has moved yet, and nothing glides.
  assert.equal(ui.button.dataset.relocating, "fade-out");
  assert.deepEqual(round(ui.center()), home);
  assert.equal(ui.button.style.translate, undefined, "no FLIP translate: it never glides");
  assert.ok([...ui.delays.values()].includes(120), "a 120 ms fade-out");
  ui.flushTimers();
  // The move itself happens hidden.
  assert.equal(ui.button.dataset.relocating, "moving");
  assert.deepEqual(round(ui.center()), { x: 312, y: 587 });
  assert.equal(ui.button.style.translate, undefined);
  // Shown again two frames on, after the hidden frame has been painted.
  ui.flushFrames();
  assert.equal(ui.button.dataset.relocating, "moving");
  ui.flushFrames();
  assert.equal(ui.button.dataset.relocating, undefined);
  assert.equal(ui.frames.size, 0);
  assert.equal(ui.saved.length, 0, "a step never changes the reader's chosen home");
  ui.unmount();
});

test("under reduced motion the move is hidden at once, with no fade-out", () => {
  const ui = mount({ control: HOME_CONTROL, reduced: true });
  ui.settle();
  assert.equal(ui.button.dataset.relocating, "moving");
  assert.deepEqual(round(ui.center()), { x: 312, y: 587 });
  ui.flushFrames();
  ui.flushFrames();
  assert.equal(ui.button.dataset.relocating, undefined);
  ui.unmount();
});

test("a press while it fades out keeps the button where it is", () => {
  const ui = mount({ control: HOME_CONTROL });
  ui.settle();
  assert.equal(ui.button.dataset.relocating, "fade-out");
  ui.handlers.onPointerDown({
    pointerId: 1,
    pointerType: "touch",
    isPrimary: true,
    button: 0,
    clientX: 312,
    clientY: 675,
    timeStamp: 1000,
    currentTarget: ui.button,
    preventDefault() {},
  });
  assert.equal(ui.button.dataset.relocating, undefined, "lit again in place");
  ui.flushTimers();
  assert.deepEqual(round(ui.center()), { x: 312, y: 675 }, "the dropped hand-off never moves it");
  ui.unmount();
});

test("unmounting mid hand-off leaves no timer or frame behind", () => {
  const ui = mount({ control: HOME_CONTROL });
  ui.settle();
  ui.unmount();
  assert.equal(ui.timers.size, 0);
  assert.equal(ui.frames.size, 0);
  assert.equal(ui.button.dataset.relocating, undefined);
});

test("words still arriving under the spots are waited for, then one decision", () => {
  let state = "running";
  const ui = mount({
    control: HOME_CONTROL,
    animations: (Element, timeline) => {
      const target = Object.assign(new Element(), {
        rect: { left: 250, right: 380, top: 560, bottom: 620, width: 130, height: 60 },
      });
      return [
        {
          playState: state,
          timeline,
          currentTime: 200,
          playbackRate: 1,
          effect: {
            target,
            getComputedTiming: () => ({ endTime: 900 }),
            getKeyframes: () => [{ transform: "translate3d(0, 118%, 0)" }, { transform: "none" }],
          },
        },
        // A colour change and an endless loop never hold the decision.
        {
          playState: "running",
          timeline,
          currentTime: 0,
          playbackRate: 1,
          effect: {
            target,
            getComputedTiming: () => ({ endTime: 300 }),
            getKeyframes: () => [{ color: "red" }, { color: "blue" }],
          },
        },
        {
          playState: "running",
          timeline,
          currentTime: 0,
          playbackRate: 1,
          effect: {
            target,
            getComputedTiming: () => ({ endTime: Infinity }),
            getKeyframes: () => [{ opacity: 0 }, { opacity: 1 }],
          },
        },
      ];
    },
  });
  ui.settle();
  // Nothing decided yet: no hand-off, no move, a look again when they land.
  assert.equal(ui.button.dataset.relocating, undefined);
  assert.deepEqual(round(ui.center()), { x: 312, y: 675 });
  assert.ok([...ui.delays.values()].includes(748), "700 ms left plus a frame's margin");
  state = "finished";
  ui.flushTimers();
  ui.flushFrames();
  assert.equal(ui.button.dataset.relocating, "fade-out", "decided once they have landed");
  ui.unmount();
});

test("a drop near the edge still glides onto it (the reader's own move)", () => {
  assert.match(source, /dockNext\.current = true;\s*pendingPosition\.current = docked;/);
  assert.match(source, /if \(relocate && dock && !reducedGlide\(\)\) \{\s*startGlide\(/);
});

test("the hand-off's styles: transparent while fading, hidden with no transition for the move", () => {
  assert.match(
    chrome,
    /html body \.zeus-button\[data-relocating="fade-out"\] \{\s*opacity: 0;\s*\}/,
  );
  assert.match(
    chrome,
    /html body \.zeus-button\[data-relocating="moving"\] \{\s*visibility: hidden;\s*opacity: 0;\s*pointer-events: none;\s*transition: none;\s*\}/,
  );
  const gated = chrome.slice(chrome.indexOf("@media (prefers-reduced-motion: no-preference)"));
  assert.match(
    gated,
    /html:not\(\[data-world-effects="economy"\]\) body \.zeus-button\[data-relocating="fade-out"\] \{\s*transition: opacity 0\.12s ease-out;/,
  );
});

test("the Rexonance page's read-outs, HUD and key visual are kept clear", () => {
  const page = source.slice(
    source.indexOf("const ZEUS_AVOID_PAGE_TEXT_SELECTOR"),
    source.indexOf("const ZEUS_AVOID_ART_SELECTOR"),
  );
  for (const selector of [
    '".rxs-p14-overview :is(dt, dd)"',
    '".rxs-p14-metrics article > :not(.rxs-p14-values)"',
    '".rxs-comparison-formula"',
    '".rxs-comparison-key"',
    '".rxs-comparison-note"',
    '".rxs-headline-metrics :is(small, p)"',
    '".rxl-stage-slate"',
    '".rxs-section-heading > p"',
    '".rxe-chapter-map-heading small"',
    '".rzn-call .rzn-chip"',
    '".rzn-parts .rzn-part"',
    '".rzn-readout"',
    '".rzn-nanites"',
    '".rxs-p14-values i"',
    '"#rxs-p14-baseline-help"',
    '".rxs-p14-method-note"',
    '".rxe-form-status-heading"',
    '".rzn-form-code"',
    '".rxs-p14-copy > small"',
    '".rxs-assembly-status"',
  ]) {
    assert.ok(page.includes(selector), selector);
  }
  assert.match(
    source,
    /collect\(ZEUS_AVOID_TEXT_SELECTOR\);\s*collect\(ZEUS_AVOID_PAGE_TEXT_SELECTOR\);/,
  );
  assert.match(source, /const ZEUS_AVOID_ART_SELECTOR = "\.rxs-hero-visual img";/);
  // A page-wide flip gives way to an own-side spot that rests on no word.
  assert.match(
    source,
    /const givesWay = nearMiss !== null && \(farSide \|\| index >= ZEUS_NEAR_CANDIDATES\);\s*const obstructed =\s*givesWay \|\|/,
  );
  assert.match(source, /if \(nearMiss\) return nearMiss;/);
});

// Three full-width bands, each under 45% of the screen: every spot is blocked.
const band = (top, bottom) => ({
  left: 0,
  right: 390,
  top,
  bottom,
  width: 390,
  height: bottom - top,
});
const EVERYWHERE = [band(80, 400), band(400, 720), band(720, 844)];

test("crowded on the Rexonance page, it steps aside in place and comes back once a spot clears", () => {
  const ui = mount({ page: true });
  const home = round(ui.center());
  ui.setControls(EVERYWHERE);
  ui.settle();
  assert.equal(ui.button.dataset.parked, "true", "stepped aside rather than resting on them");
  assert.deepEqual(round(ui.center()), home, "it does not move to step aside");
  assert.equal(ui.button.dataset.relocating, undefined);
  ui.setControls([]);
  ui.settle();
  assert.equal(ui.button.dataset.parked, undefined, "back at the next settle with a clear spot");
  assert.deepEqual(round(ui.center()), home);
  // Back somewhere else: the move lands while it is still hidden.
  ui.setControls(EVERYWHERE);
  ui.settle();
  assert.equal(ui.button.dataset.parked, "true");
  ui.setControls([HOME_CONTROL]);
  ui.settle();
  assert.equal(ui.button.dataset.parked, undefined);
  assert.equal(
    ui.button.dataset.relocating,
    "moving",
    "no fade-out at the old spot: it was hidden",
  );
  assert.deepEqual(round(ui.center()), { x: 312, y: 587 });
  ui.unmount();
});

test("off the Rexonance page, or with keyboard focus, it does not step aside", () => {
  const elsewhere = mount();
  elsewhere.setControls(EVERYWHERE);
  elsewhere.settle();
  assert.equal(elsewhere.button.dataset.parked, undefined, "other pages keep the old fallback");
  elsewhere.unmount();
  const focused = mount({ page: true });
  focused.doc.activeElement = focused.button;
  focused.setControls(EVERYWHERE);
  focused.settle();
  assert.equal(focused.button.dataset.parked, undefined, "a focused button stays in view");
  focused.unmount();
  assert.match(
    chrome,
    /html body \.zeus-button\[data-parked="true"\]:not\(\[data-navigating="true"\]\):not\(:focus-visible\) \{\s*visibility: hidden;\s*opacity: 0;\s*pointer-events: none;\s*\}/,
  );
  // The state is the page's: a new route shows the button again.
  assert.match(source, /routeKey=\{pathname\}/);
  assert.match(
    source,
    /if \(button\?\.dataset\.parked\) delete button\.dataset\.parked;\s*\}, \[routeKey\]\);/,
  );
  // A spot the reader dropped it on is theirs: never counted as crowded.
  assert.match(
    source,
    /if \(report && !droppedHere\.current\) report\.crowded = true;\s*return fallback\?\.candidate \?\? candidates\[0\] \?\? preferred;/,
  );
});
