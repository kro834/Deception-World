import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { mountRexonanceAssembly } from "../src/lib/rexonance-resonance.js";
import { releasePendingImage, releasePendingImages } from "../src/lib/release-pending-images.js";

/* Audit #31: leaving /rexonance-saga releases the whole page. Five SPA round
   trips to /world kept a detached main.rxs-page (about 1,130 nodes, with its
   canvases) on two retention paths, proven with heap snapshots by
   scripts/verify-rexonance-release.mjs:
   - LoadGate's module-level `lastPress` held the last pressed element
     strongly; a page left without a guarded transition (Back, router
     navigation, a plain link) never took it, so the press kept the page;
   - an image still downloading at unmount (a page <img>, or an Image()
     loader whose handlers close over the page) is a pending activity, and
     on a stalled connection it kept every visit's page.
   These pin the cleanup contract that verify script measures in Chrome. */

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

function loadGatePress() {
  const source = read("src/components/load-gate.tsx");
  const start = source.indexOf("let lastPress");
  const end = source.indexOf("function cineTier(", start);
  assert.ok(start !== -1 && end > start, "LoadGate's press bookkeeping is where it was");
  const code = `${stripTypeScriptTypes(source.slice(start, end))}
globalThis.press = { notePress, takePress, current: () => lastPress };`;
  let now = 1000;
  class Element {
    constructor(isConnected = true) {
      this.isConnected = isConnected;
    }
  }
  class KeyboardEvent {}
  const context = {
    Element,
    KeyboardEvent,
    document: { activeElement: null },
    performance: { now: () => now },
  };
  runInNewContext(code, context);
  return { ...context.press, Element, advance: (ms) => (now += ms) };
}

test("the route-change press is held weakly, so Back or router navigation cannot keep a page", () => {
  const source = read("src/components/load-gate.tsx");
  assert.match(source, /let lastPress: \{ target: WeakRef<Element>; at: number \} \| null = null;/);
  assert.match(source, /lastPress = \{ target: new WeakRef\(target\), at: performance\.now\(\) \}/);
  assert.doesNotMatch(source, /lastPress\?\.target\.closest\(/, "every read goes through deref()");

  const press = loadGatePress();
  const card = new press.Element(true);
  press.notePress({ target: card });
  const held = press.current().target;
  assert.notEqual(held, card, "the press never stores the element itself");
  assert.equal(Object.prototype.toString.call(held), "[object WeakRef]");
  assert.equal(held.deref(), card);
  assert.equal(press.takePress(), card, "a connected press inside the window is still read");
  assert.equal(press.current(), null, "and read once");

  press.notePress({ target: new press.Element(false) });
  assert.equal(press.takePress(), null, "a press on a removed page is never used");
  press.notePress({ target: card });
  press.advance(1401);
  assert.equal(press.takePress(), null, "a stale press is never used");
});

function fakeImage({ complete = false } = {}) {
  const attributes = new Map([
    ["src", "/rider-rexonance-max-20260923.webp"],
    ["srcset", "/rider-rexonance-max-20260923-delivery-640.webp 640w"],
  ]);
  return {
    complete,
    attributes,
    onload() {},
    onerror() {},
    removeAttribute: (name) => attributes.delete(name),
    get src() {
      return attributes.get("src") ?? "";
    },
    set src(value) {
      attributes.set("src", value);
    },
  };
}

test("an unfinished image is stopped with an empty src; a finished one is left alone", () => {
  const pending = fakeImage();
  releasePendingImage(pending);
  assert.equal(pending.onload, null, "no handler runs for a page that has gone");
  assert.equal(pending.onerror, null);
  assert.equal(pending.attributes.has("srcset"), false);
  // Removing src leaves Chromium's detached element waiting; an empty src ends it.
  assert.equal(pending.attributes.get("src"), "");

  const finished = fakeImage({ complete: true });
  releasePendingImage(finished);
  assert.equal(finished.attributes.get("src"), "/rider-rexonance-max-20260923.webp");
  assert.equal(typeof finished.onload, "function");

  // Not a real image element (the engine tests' stand-ins): untouched.
  const standIn = { onload() {}, src: "/f.webp" };
  releasePendingImage(standIn);
  assert.equal(standIn.src, "/f.webp");
  assert.equal(typeof standIn.onload, "function");
  assert.doesNotThrow(() => releasePendingImage(null));
});

test("a page's unfinished images are released only once its tree has been removed", () => {
  const images = [fakeImage(), fakeImage({ complete: true })];
  const root = {
    isConnected: true,
    querySelectorAll: (selector) => (selector === "img" ? images : []),
  };
  releasePendingImages(root);
  assert.equal(
    images[0].attributes.get("src"),
    "/rider-rexonance-max-20260923.webp",
    "a live page (an effect rehearsal) keeps its pictures",
  );
  root.isConnected = false;
  releasePendingImages(root);
  assert.equal(images[0].attributes.get("src"), "");
  assert.equal(images[1].attributes.get("src"), "/rider-rexonance-max-20260923.webp");
  assert.doesNotThrow(() => releasePendingImages(null));
});

test("the page releases its unfinished images after removal; the form change its loaders and sheets", () => {
  const page = read("src/components/rexonance-saga/rexonance-saga.tsx");
  assert.match(
    page,
    /import \{ releasePendingImage, releasePendingImages \} from "@\/lib\/release-pending-images";/,
  );
  // A passive cleanup runs after React removed the page (and is skipped by
  // the helper during an effect rehearsal, when the page is still connected).
  assert.match(
    page,
    /useEffect\(\(\) => \{\s*const page = pageRef\.current;\s*return \(\) => releasePendingImages\(page\);\s*\}, \[\]\);/,
  );
  const morph = page.slice(
    page.indexOf("function FormMorph("),
    page.indexOf("const releaseControlFocus"),
  );
  assert.match(morph, /const loaders = new Set<HTMLImageElement>\(\);/);
  assert.match(morph, /loaders\.add\(image\);/);
  assert.match(morph, /sheets\.push\(made\);/);
  assert.match(
    morph,
    /cancelled = true;\s*if \(frame\) cancelAnimationFrame\(frame\);\s*for \(const image of loaders\) releasePendingImage\(image\);\s*loaders\.clear\(\);\s*for \(const done of sheets\) done\.width = done\.height = 0;/,
  );
  assert.doesNotMatch(
    morph,
    /document\.createElement\("canvas"\)[\s\S]*document\.createElement\("canvas"\)/,
    "one sheet factory, so every sheet is owned",
  );
});

function assemblyEnvironment() {
  const target = () => ({ addEventListener() {}, removeEventListener() {} });
  const html = { dataset: {}, hasAttribute: () => false };
  const context2d = new Proxy({}, { get: () => () => ({ addColorStop() {} }) });
  const makeCanvas = () => ({
    width: 0,
    height: 0,
    clientWidth: 800,
    clientHeight: 600,
    getContext: () => context2d,
  });
  const document = { documentElement: html, hidden: false, createElement: makeCanvas, ...target() };
  const canvas = makeCanvas();
  const frame = { offsetHeight: 600 };
  const runway = {
    ownerDocument: document,
    dataset: {},
    offsetHeight: 1800,
    hasAttribute: () => false,
    setAttribute() {},
    removeAttribute() {},
    getBoundingClientRect: () => ({ top: 0, height: 1800 }),
    querySelector: (selector) =>
      ({ "canvas.rzn-canvas": canvas, ".rzn-frame": frame })[selector] ?? null,
    querySelectorAll: () => [],
  };
  const images = [];
  // A real element's shape: pending until told otherwise.
  class Image {
    constructor() {
      this.complete = false;
      this.attributes = new Map();
      images.push(this);
    }
    get src() {
      return this.attributes.get("src") ?? "";
    }
    set src(value) {
      this.attributes.set("src", value);
    }
    removeAttribute(name) {
      this.attributes.delete(name);
    }
  }
  const observers = [];
  class IntersectionObserver {
    constructor(callback) {
      this.callback = callback;
      observers.push(this);
    }
    observe() {}
    disconnect() {}
  }
  class MutationObserver {
    observe() {}
    disconnect() {}
  }
  class ResizeObserver {
    observe() {}
    disconnect() {}
  }
  const env = {
    ...target(),
    navigator: {},
    innerHeight: 900,
    matchMedia: () => ({ matches: false, ...target() }),
    getComputedStyle: () => ({ top: "0", getPropertyValue: () => "" }),
    requestAnimationFrame: () => 1,
    cancelAnimationFrame() {},
    requestIdleCallback: (callback) =>
      setTimeout(() => callback({ didTimeout: false, timeRemaining: () => 20 }), 0),
    cancelIdleCallback: clearTimeout,
    setTimeout,
    clearTimeout,
    performance,
    IntersectionObserver,
    MutationObserver,
    ResizeObserver,
    Image,
  };
  return { env, runway, images, observers };
}

test("the suit-up's dispose stops the pictures still downloading and frees its form sheets", async () => {
  const t = assemblyEnvironment();
  const dispose = mountRexonanceAssembly(
    t.runway,
    {
      figure: "/rexonance-suit-20261010/figure.webp",
      undersuit: "/rexonance-suit-20261010/undersuit.webp",
      size: { width: 60, height: 120 },
      pieces: [{ id: "leg", group: "legs", x: 0, y: 0, w: 60, h: 120, seat: [30, 90] }],
      core: [30, 60],
      visor: [30, 10],
      glow: [],
    },
    t.env,
  );
  for (const observer of t.observers) observer.callback([{ isIntersecting: true }]);
  for (let i = 0; i < 50 && t.images.length < 2; i += 1)
    await new Promise((resolve) => setTimeout(resolve, 2));
  assert.equal(t.images.length, 2, "the near scene starts loading the figure and the undersuit");
  // The figure arrives; the undersuit is still on the network when the reader leaves.
  const [figure, undersuit] = t.images;
  figure.complete = true;
  figure.onload();
  dispose();
  assert.equal(
    figure.src,
    "/rexonance-suit-20261010/figure.webp",
    "a finished picture is untouched",
  );
  assert.equal(undersuit.src, "", "the request still in flight is ended");
  assert.equal(undersuit.onload, null, "and its handlers no longer hold the scene");
  assert.equal(undersuit.onerror, null);

  const engine = read("src/lib/rexonance-resonance.js");
  const cleanup = engine.slice(
    engine.lastIndexOf("  return () => {\n    disposed = true;\n    goStill();"),
  );
  assert.match(
    cleanup,
    /for \(const image of loaders\) releasePendingImage\(image\);\s*loaders\.clear\(\);/,
  );
  // The form sheets (each figure-tall and padded wide) are freed at once.
  assert.match(
    cleanup,
    /formsState\.fig,\s*formsState\.max,\s*formsState\.ultra,\s*formsState\.excelsior,\s*\.\.\.formsState\.warp,\s*\]\)\s*if \(sheet\) sheet\.width = sheet\.height = 0;\s*formsState = null;/,
  );
  // Both of its picture loads go through the one owned loader.
  assert.equal(engine.match(/new environment\.Image\(\)/g)?.length, 1);
});
