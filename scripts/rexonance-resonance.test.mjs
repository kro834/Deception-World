import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  countTemplate,
  formatCount,
  mountRexonanceResonance,
  mountRexonanceAssembly,
  planAssembly,
  assemblyTilePose,
  assemblyCacheStep,
  assemblyPhase,
  rewindAssemblyGold,
  planAssemblyGold,
  ASSEMBLY_BEATS,
} from "../src/lib/rexonance-resonance.js";

/* 2026-10-10 rx11: Rexonance, RESONANCE — the page made dynamic
   (src/styles-rexonance-resonance.css, src/lib/rexonance-resonance.js).
   A depth stage, pinned cuts whose figures count up once and lock, a chip
   turning in 3-D, prism cuts between chapters, the form change as a
   transformation. These pin its safety properties: where it loads, its
   scope, compositor-only finite keyframes, the gates (reduced motion,
   economy, the menu, dialogs and load gate), named scroll timelines, the
   transient hit flags, forced colours, the 12px floor, the owner's
   figures kept as their own text, and the script's lifecycle. */

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const strip = (css) => css.replace(/\/\*[\s\S]*?\*\//g, "");
const source = read("src/styles-rexonance-resonance.css");
const css = strip(source);
const route = read("src/routes/rexonance-saga.tsx");
const page = read("src/components/rexonance-saga/rexonance-saga.tsx");
const script = read("src/lib/rexonance-resonance.js");

const flat = (text) =>
  text.replace(/\s+/g, " ").replace(/\(\s+/g, "(").replace(/\s+\)/g, ")").trim();

// Style rules with their at-rule context, and keyframe blocks by name.
function parse(text) {
  const rules = [];
  const keyframes = new Map();
  const stack = [];
  let prelude = "";
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === "{") {
      const head = flat(prelude);
      prelude = "";
      const frames = head.match(/^@keyframes\s+([\w-]+)$/);
      if (frames) {
        let depth = 1;
        let end = index + 1;
        for (; end < text.length && depth > 0; end += 1) {
          if (text[end] === "{") depth += 1;
          if (text[end] === "}") depth -= 1;
        }
        keyframes.set(frames[1], text.slice(index + 1, end - 1));
        index = end - 1;
        continue;
      }
      if (head.startsWith("@")) {
        stack.push(head);
        continue;
      }
      const end = text.indexOf("}", index);
      rules.push({ selector: head, body: flat(text.slice(index + 1, end)), context: [...stack] });
      index = end;
      continue;
    }
    if (character === "}") {
      stack.pop();
      prelude = "";
    } else if (character === ";") prelude = "";
    else prelude += character;
  }
  return { rules, keyframes };
}

const splitTopLevel = (value, separator = ",") => {
  const parts = [];
  let depth = 0;
  let current = "";
  for (const character of value) {
    if (character === "(") depth += 1;
    if (character === ")") depth -= 1;
    if (character === separator && depth === 0) {
      parts.push(current.trim());
      current = "";
    } else current += character;
  }
  return [...parts, current.trim()].filter(Boolean);
};

const declaration = (body, property) =>
  body.match(new RegExp(`(?:^|;)\\s*${property}\\s*:\\s*([^;]+)`))?.[1].trim();

const sheet = parse(css);

test("scroll tile depth is seeded, reversible and lands exactly on its texture rectangle", () => {
  const options = {
    size: { width: 300, height: 300 },
    core: [150, 150],
    tile: 15,
    pieces: [{ id: "leg", group: "legs", x: 0, y: 0, w: 300, h: 300, seat: [150, 220] }],
  };
  const plan = planAssembly(options);
  assert.deepEqual(plan, planAssembly(options));
  for (const item of plan.tiles) {
    const mid = item.t0 + (item.t1 - item.t0) * 0.7;
    const a = assemblyTilePose(item, mid);
    assemblyTilePose(item, item.t1);
    assert.deepEqual(assemblyTilePose(item, mid), a, "reverse restores identical geometry");
    assert.deepEqual([...assemblyTilePose(item, item.t1)], [item.sx, item.sy, item.tw, item.th, 1]);
    assert.ok(a.every(Number.isFinite));
    assert.ok(item.depth >= 0.35 && item.depth <= 1);
  }
});

test("cache work is bounded and reverse jumps discard future paint before converging", () => {
  let current = 5000;
  const reverse = assemblyCacheStep(current, 1200, 160);
  assert.equal(reverse.reset, true);
  assert.equal(reverse.remove, 0);
  assert.equal(reverse.end, 160);
  current = reverse.end;
  for (let i = 0; i < 20 && current !== 1200; i += 1) {
    const step = assemblyCacheStep(current, 1200, 160);
    assert.ok(step.end - step.start <= 160);
    current = step.end;
  }
  assert.equal(current, 1200);
  const small = assemblyCacheStep(current, 1100, 160);
  assert.equal(small.reset, false);
  assert.equal(small.remove, 100);
  assert.equal(small.pending, false);
});

test("minor reverse restores overlapping retained gold under a shared operation budget", () => {
  const gold = planAssemblyGold({
    pieces: [
      { id: "a", group: "legs", x: 0, y: 0, w: 4, h: 4, seat: [2, 2] },
      { id: "b", group: "legs", x: 2, y: 0, w: 4, h: 4, seat: [4, 2] },
    ],
    gold: { cell: 4, cells: { a: btoa("\x01"), b: btoa("\x01") } },
    landed: new Map([
      ["a", 0.1],
      ["b", 0.2],
    ]),
  });
  assert.deepEqual([...gold.overlaps[0]], [1]);
  assert.deepEqual([...gold.overlaps[1]], [0]);
  const paint = new Uint8Array(8 * 4);
  const rect = (x, y, w, h, value) => {
    for (let row = y; row < y + h; row += 1)
      for (let col = x; col < x + w; col += 1) paint[row * 8 + col] = value;
  };
  rect(0, 0, 6, 4, 1);
  const operations = [];
  const context = {
    clearRect(x, y, w, h) {
      operations.push("clear");
      rect(x, y, w, h, 0);
    },
    drawImage(_art, x, y, w, h) {
      operations.push("repair");
      rect(x, y, w, h, 1);
    },
  };
  const state = { count: 2, dirty: -1, at: 0 };
  assert.equal(rewindAssemblyGold(context, {}, gold, state, 1, 1), 0);
  assert.deepEqual(operations, ["clear"]);
  assert.equal(state.count, 1);
  assert.ok(state.dirty >= 0, "repair remains queued when the frame's budget is exhausted");
  assert.equal(rewindAssemblyGold(context, {}, gold, state, 1, 1), 0);
  assert.deepEqual(operations, ["clear", "repair"]);
  assert.equal(state.dirty, -1);
  for (let y = 0; y < 4; y += 1)
    for (let x = 0; x < 8; x += 1) assert.equal(paint[y * 8 + x], Number(x < 4));
  // Continued reversal clears the remaining cell instead of restarting a
  // large cache rebuild; even a one-operation budget reaches an empty past.
  for (let i = 0; i < 4 && (state.count || state.dirty >= 0); i += 1) {
    const before = operations.length;
    rewindAssemblyGold(context, {}, gold, state, 0, 1);
    assert.ok(operations.length - before <= 1);
  }
  assert.equal(state.count, 0);
  assert.equal(state.dirty, -1);
  assert.ok(paint.every((value) => value === 0));
});

test("stage illumination follows the seal and final forms finish after base assembly", () => {
  assert.ok(ASSEMBLY_BEATS.light[0] >= ASSEMBLY_BEATS.seal[1]);
  assert.equal(ASSEMBLY_BEATS.form[0], ASSEMBLY_BEATS.light[1]);
  assert.equal(ASSEMBLY_BEATS.form[1], 0.975);
  assert.equal(assemblyPhase(0.1).phase, "prepare");
  assert.equal(assemblyPhase(0.4).phase, "assemble");
  assert.equal(assemblyPhase(0.88).phase, "seal");
  assert.equal(assemblyPhase(0.905).phase, "ignite");
  assert.deepEqual(assemblyPhase(0.93), { phase: "complete", complete: true });
  for (const form of ["max", "ultra", "excelsior"]) {
    assert.deepEqual(assemblyPhase(0.93, form), { phase: "evolve", complete: false });
    assert.deepEqual(assemblyPhase(0.975, form), { phase: "complete", complete: true });
    assert.equal(assemblyPhase(1, form, false).complete, false, "missing artwork is not completed");
    assert.equal(assemblyPhase(0.974, form).complete, false, "reverse clears final completion");
  }
});

function scrollAssemblyEnvironment() {
  const listeners = new Map();
  const eventTarget = (name) => ({
    addEventListener: (type, callback) => listeners.set(`${name}:${type}`, callback),
    removeEventListener: (type) => listeners.delete(`${name}:${type}`),
  });
  const node = (extra = {}) => {
    const attrs = new Map();
    return {
      dataset: new Proxy(
        {},
        {
          get: (_, key) => attrs.get(key),
          set: (_, key, value) => (attrs.set(key, value), true),
          deleteProperty: (_, key) => (attrs.delete(key), true),
        },
      ),
      hasAttribute: (name) => attrs.has(name),
      setAttribute: (name, value) => attrs.set(name, value),
      removeAttribute: (name) => attrs.delete(name),
      ...extra,
    };
  };
  const calls = [];
  const canvases = [];
  const makeCanvas = () => {
    const c = { width: 0, height: 0, clientWidth: 600, clientHeight: 600 };
    const ctx = new Proxy(
      {},
      {
        get: (_, key) =>
          key === "getImageData" || key === "createImageData"
            ? (...args) => ({
                data: new Uint8ClampedArray(args.at(-2) * args.at(-1) * 4).fill(255),
              })
            : key === "createRadialGradient"
              ? (...args) => {
                  calls.push({ target: c, method: "createRadialGradient", args });
                  return { addColorStop() {} };
                }
              : (...args) => calls.push({ target: c, method: key, args }),
        set: () => true,
      },
    );
    c.getContext = () => ctx;
    canvases.push(c);
    return c;
  };
  const document = {
    documentElement: node(),
    hidden: false,
    createElement: makeCanvas,
    ...eventTarget("document"),
  };
  const canvas = makeCanvas();
  const frameBox = { offsetHeight: 600 };
  let progress = 0;
  const runway = node({
    ownerDocument: document,
    offsetHeight: 1800,
    getBoundingClientRect: () => ({ top: -progress * 1200 }),
    querySelector: (selector) =>
      selector === "canvas.rzn-canvas" ? canvas : selector === ".rzn-frame" ? frameBox : null,
    querySelectorAll: () => [],
  });
  runway.dataset.form = "standard";
  const frames = new Map();
  const observers = [];
  const imageSources = [];
  const mutationObservers = [];
  let frameId = 0;
  class IntersectionObserver {
    constructor(callback) {
      this.callback = callback;
      observers.push(this);
    }
    observe() {}
    disconnect() {}
  }
  class MutationObserver {
    constructor(callback) {
      this.callback = callback;
      mutationObservers.push(this);
    }
    observe() {}
    disconnect() {}
  }
  class ResizeObserver {
    constructor(callback) {
      this.callback = callback;
    }
    observe() {
      this.callback();
    }
    disconnect() {}
  }
  class Image {
    set src(value) {
      this.url = value;
      imageSources.push(value);
      queueMicrotask(() => this.onload());
    }
  }
  const env = {
    ...eventTarget("window"),
    document,
    navigator: {},
    innerHeight: 600,
    matchMedia: (query) => ({ matches: query.includes("pointer: coarse"), ...eventTarget(query) }),
    getComputedStyle: () => ({ top: "0", getPropertyValue: () => "" }),
    requestAnimationFrame: (callback) => (frames.set(++frameId, callback), frameId),
    cancelAnimationFrame: (id) => frames.delete(id),
    requestIdleCallback: (callback) => setTimeout(() => callback({ timeRemaining: () => 20 }), 0),
    cancelIdleCallback: clearTimeout,
    setTimeout,
    clearTimeout,
    performance,
    IntersectionObserver,
    MutationObserver,
    ResizeObserver,
    Image,
  };
  const frame = () => {
    calls.length = 0;
    for (const [id, callback] of [...frames]) {
      frames.delete(id);
      callback();
    }
    return [...calls];
  };
  const scroll = (value) => {
    progress = value;
    listeners.get("window:scroll")?.();
    return frame();
  };
  return {
    env,
    runway,
    canvas,
    observers,
    canvases,
    frames,
    frame,
    scroll,
    imageSources,
    mutationObservers,
  };
}

test("failed sampling falls back to authored masks, never the transparent background or preset driver", () => {
  const plan = planAssembly({
    size: { width: 60, height: 60 },
    tile: 15,
    maskTile: 15,
    core: [30, 30],
    visor: [30, 10],
    sample: null,
    pieces: [
      { id: "plate", group: "legs", x: 0, y: 0, w: 60, h: 60, seat: [7, 7], tiles: "AQ==" },
      {
        id: "driver",
        group: "waist",
        x: 30,
        y: 30,
        w: 15,
        h: 15,
        seat: [37, 37],
        tiles: "AQ==",
        preset: true,
      },
    ],
  });
  assert.equal(plan.tiles.length, 1);
  assert.equal(plan.tiles[0].pieceId, "plate");
  assert.deepEqual([plan.tiles[0].sx, plan.tiles[0].sy], [0, 0]);
});

test("blank bitmap samples retry full decoded art once and never install a zero-tile plan", async () => {
  for (const bothBlank of [false, true]) {
    const t = scrollAssemblyEnvironment();
    const counter = { textContent: "rest" };
    const query = t.runway.querySelector;
    t.runway.querySelector = (selector) => (selector === ".rzn-count" ? counter : query(selector));
    const reads = [];
    const bitmaps = [];
    t.env.createImageBitmap = async (source, ...args) => {
      const bitmap = {
        source,
        width: args.at(-1)?.resizeWidth || 61,
        height: args.at(-1)?.resizeHeight || 121,
        closed: false,
        close() {
          this.closed = true;
        },
      };
      bitmaps.push(bitmap);
      return bitmap;
    };
    const create = t.env.document.createElement;
    t.env.document.createElement = (...args) => {
      const canvas = create(...args);
      const context = canvas.getContext();
      canvas.getContext = () =>
        new Proxy(context, {
          get(target, key) {
            if (key !== "getImageData") return target[key];
            return (...dimensions) => {
              if (canvas.width !== 5 || canvas.height !== 9) return target[key](...dimensions);
              reads.push(canvas);
              return {
                data: new Uint8ClampedArray(5 * 9 * 4).fill(
                  reads.length === 1 || bothBlank ? 0 : 255,
                ),
              };
            };
          },
        });
      return canvas;
    };
    const dispose = mountRexonanceAssembly(
      t.runway,
      {
        figure: "/figure",
        undersuit: "/undersuit",
        size: { width: 61, height: 121 },
        pieces: [{ id: "leg", group: "legs", x: 0, y: 0, w: 61, h: 121, seat: [30, 90] }],
        core: [30, 60],
        visor: [30, 10],
        glow: [],
      },
      t.env,
    );
    try {
      t.observers[0].callback([{ isIntersecting: true }]);
      for (let i = 0; i < 100 && t.runway.dataset.rznState !== "live"; i += 1)
        await new Promise((resolve) => setTimeout(resolve, 5));
      assert.equal(t.runway.dataset.rznState, "live");
      t.scroll(0.5);
      assert.match(counter.textContent, / \/ 45$/, "a blank read cannot suppress assembly");
      assert.equal(reads.length, 2, "one bounded retry, not a repeated preparation loop");
      assert.equal(bitmaps.length, 3);
      assert.equal(bitmaps[2].closed, true, "resized bitmap is released after either read result");
      assert.equal(reads[0].width, 0, "probe backing store is released");
    } finally {
      dispose();
    }
  }
});

test("reactor glow waits for sealed armor and advanced art waits for the ignition wave", async () => {
  const t = scrollAssemblyEnvironment();
  t.runway.dataset.form = "max";
  const dispose = mountRexonanceAssembly(
    t.runway,
    {
      figure: "/figure",
      undersuit: "/undersuit",
      size: { width: 60, height: 120 },
      pieces: [{ id: "leg", group: "legs", x: 0, y: 0, w: 60, h: 120, seat: [30, 90] }],
      core: [30, 60],
      visor: [30, 10],
      glow: [],
      forms: { max: "/max", ultra: "/ultra" },
    },
    t.env,
  );
  try {
    t.observers[0].callback([{ isIntersecting: true }]);
    // Preparation now yields every two rows; CI timer scheduling needs more
    // turns. This is readiness waiting, not the draw-budget assertion below.
    for (let i = 0; i < 1000 && t.runway.dataset.rznState !== "live"; i += 1)
      await new Promise((resolve) => setTimeout(resolve, 5));
    assert.equal(t.runway.dataset.rznState, "live");
    const seal = t.scroll(0.89);
    assert.equal(seal.filter((c) => c.method === "createRadialGradient").length, 0);
    const ignition = t.scroll(0.905);
    assert.equal(ignition.filter((c) => c.method === "createRadialGradient").length, 1);
    assert.equal(t.runway.dataset.rznPhase, "ignite");
    assert.deepEqual(
      t.imageSources,
      ["/figure", "/undersuit"],
      "fully lit advanced art cannot cover ignition",
    );
    t.scroll(0.916);
    assert.equal(t.runway.dataset.rznPhase, "evolve");
    assert.deepEqual(t.imageSources, ["/figure", "/undersuit", "/max", "/ultra"]);
    await new Promise((resolve) => setTimeout(resolve, 0));
    t.scroll(0.975);
    assert.equal(t.runway.dataset.rznFormComplete, "true");
    t.scroll(0.914);
    assert.equal(t.runway.dataset.rznFormComplete, undefined);
    assert.equal(t.runway.dataset.rznPhase, "ignite");
  } finally {
    dispose();
  }
});

test("changing form remeasures CSS figure limits even when canvas dimensions do not change", async () => {
  const t = scrollAssemblyEnvironment();
  t.env.getComputedStyle = () => ({
    top: "0",
    getPropertyValue: (property) =>
      property === "--rzn-fig-h"
        ? "0.99"
        : property === "--rzn-fig-w"
          ? t.runway.dataset.form === "excelsior"
            ? "0.45"
            : "0.9"
          : "",
  });
  const dispose = mountRexonanceAssembly(
    t.runway,
    {
      figure: "/figure",
      undersuit: "/undersuit",
      size: { width: 300, height: 300 },
      pieces: [{ id: "leg", group: "legs", x: 0, y: 0, w: 300, h: 300, seat: [150, 220] }],
      core: [150, 150],
      visor: [150, 30],
      glow: [],
    },
    t.env,
  );
  try {
    t.observers[0].callback([{ isIntersecting: true }]);
    for (let i = 0; i < 100 && t.runway.dataset.rznState !== "live"; i += 1)
      await new Promise((resolve) => setTimeout(resolve, 5));
    const before = t
      .scroll(0.5)
      .find((c) => c.target === t.canvas && c.method === "setTransform" && c.args[0] !== 1);
    assert.equal(before.args[0], 1.8);
    const dimensions = [t.canvas.width, t.canvas.height];
    t.runway.dataset.form = "excelsior";
    t.mutationObservers[0].callback();
    const after = t
      .frame()
      .find((c) => c.target === t.canvas && c.method === "setTransform" && c.args[0] !== 1);
    assert.equal(after.args[0], 0.9);
    assert.deepEqual([t.canvas.width, t.canvas.height], dimensions);
  } finally {
    dispose();
  }
});

test("completed advanced forms draw exact prepared art without loose particles or mesh warping", async () => {
  for (const form of ["max", "ultra", "excelsior"]) {
    const t = scrollAssemblyEnvironment();
    t.runway.dataset.form = form;
    const dispose = mountRexonanceAssembly(
      t.runway,
      {
        figure: "/figure",
        undersuit: "/undersuit",
        size: { width: 60, height: 120 },
        pieces: [{ id: "leg", group: "legs", x: 0, y: 0, w: 60, h: 120, seat: [30, 90] }],
        core: [30, 60],
        visor: [30, 10],
        glow: [],
        forms: { max: "/max", ultra: "/ultra", excelsior: "/excelsior", pad: 120 },
      },
      t.env,
    );
    try {
      t.observers[0].callback([{ isIntersecting: true }]);
      for (let i = 0; i < 100 && t.runway.dataset.rznState !== "live"; i += 1)
        await new Promise((resolve) => setTimeout(resolve, 5));
      t.scroll(1);
      await new Promise((resolve) => setTimeout(resolve, 0));
      const complete = t.frame();
      assert.equal(t.runway.dataset.rznFormComplete, "true", form);
      assert.equal(
        complete.filter((c) => c.method === "transform").length,
        0,
        `${form}: no mesh warp`,
      );
      assert.equal(
        complete.filter((c) => c.target === t.canvas && c.method === "fill").length,
        0,
        `${form}: no particle fills`,
      );
      const artwork = complete
        .filter((c) => c.target === t.canvas && c.method === "drawImage")
        .at(-1);
      assert.deepEqual(artwork.args.slice(1), [0, 0, 300, 120]);
      assert.ok(
        complete.some(
          (c) =>
            c.target === t.canvas &&
            c.method === "clearRect" &&
            c.args[2] === 300 &&
            c.args[3] === 120,
        ),
      );
    } finally {
      dispose();
    }
  }
});

test("gold converges while scroll rests, reverse work stays bounded, touch art remains capped", async () => {
  const t = scrollAssemblyEnvironment();
  const dispose = mountRexonanceAssembly(
    t.runway,
    {
      figure: "/figure",
      undersuit: "/undersuit",
      size: { width: 300, height: 300 },
      pieces: [
        { id: "leg", group: "legs", x: 0, y: 0, w: 300, h: 300, ax: 0, ay: 0, seat: [150, 220] },
      ],
      core: [150, 150],
      visor: [150, 30],
      glow: [],
      gold: {
        atlas: "/gold",
        cell: 3,
        cells: { leg: btoa(String.fromCharCode(...new Uint8Array(1250).fill(255))) },
      },
    },
    t.env,
  );
  try {
    t.observers[0].callback([{ isIntersecting: true }]);
    // Two-row preparation yields need additional timer turns on shared CI.
    for (let i = 0; i < 1000 && t.runway.dataset.rznState !== "live"; i += 1)
      await new Promise((resolve) => setTimeout(resolve, 5));
    assert.equal(t.runway.dataset.rznState, "live");
    const first = t.scroll(0.5);
    const byTarget = new Map();
    for (const c of first.filter((c) => c.method === "drawImage" && c.target !== t.canvas))
      byTarget.set(c.target, (byTarget.get(c.target) || 0) + 1);
    const goldLayer = [...byTarget].find(([, count]) => count === 900)?.[0];
    assert.ok(goldLayer, "gold starts with exactly its frame budget");
    let goldDraws = 900;
    let rounds = 0;
    while (t.frames.size && rounds++ < 30) {
      const batch = t.frame();
      const count = batch.filter((c) => c.target === goldLayer && c.method === "drawImage").length;
      assert.ok(count <= 900);
      goldDraws += count;
    }
    assert.equal(goldDraws, 10000, "all gold cells converge without another scroll event");
    assert.equal(t.frames.size, 0, "completed caches stop requesting frames");
    const reverse = t.scroll(0.17);
    assert.equal(
      reverse.filter((c) => c.target === goldLayer && c.method === "clearRect").length,
      1,
      "large reverse clears future gold once",
    );
    assert.ok(reverse.filter((c) => c.method === "clearRect").length <= 3);
    const flight = t.scroll(0.22);
    const textured = flight.filter(
      (c) =>
        c.target === t.canvas &&
        c.method === "drawImage" &&
        c.args.length === 9 &&
        c.args[0]?.getContext,
    );
    assert.ok(textured.length > 0 && textured.length <= 64);
    t.scroll(1);
    assert.equal(t.runway.dataset.rznPhase, "complete");
    assert.equal(t.runway.dataset.rznFormComplete, "true");
    t.scroll(0.8);
    assert.equal(t.runway.dataset.rznPhase, "assemble");
    assert.equal(t.runway.dataset.rznFormComplete, undefined);
  } finally {
    dispose();
  }
  assert.equal(t.runway.dataset.rznPhase, undefined);
  assert.equal(t.runway.dataset.rznFormComplete, undefined);
});
const REDUCED = /prefers-reduced-motion:\s*no-preference/;
const SUPPORTS =
  /^@supports \(animation-timeline: view\(\)\) and \(animation-range: entry 0% entry 100%\)$/;
const FULL_GATE =
  /^html\[data-family="special"\]:not\(\[data-world-effects="economy"\]\):not\(\[data-side-menu-open\]\):not\(\[data-dialog-open\]\) body \.rxs-page\.rxs-page\.rxs-rexonance-page:not\(\[data-route-covered\]\)\[data-motion-ready="true"\]/;

test("loading gates are local to the Rexonance page, not the document root", () => {
  assert.doesNotMatch(css, /data-loading/);
  assert.match(css, /\.rxs-page\.rxs-page\.rxs-rexonance-page\[data-motion-ready="true"\]/);
});

const moves = (body) => {
  const animation = declaration(body, "animation") ?? declaration(body, "animation-name");
  return Boolean(animation) && animation !== "none";
};
const timed = (body) => {
  const timeline = declaration(body, "animation-timeline");
  return Boolean(timeline) && !/^(?:auto|none)$/.test(timeline);
};

test("the resonance sheet loads after the STAGE scenes, before the cinematic sheet, on its route only", () => {
  assert.match(
    route,
    /import rexonanceResonanceCssUrl from "@\/styles-rexonance-resonance\.css\?url"/,
  );
  const links = route.slice(route.search(/links:\s*\[/));
  const stage = links.indexOf("href: stageRexonanceCssUrl");
  const resonance = links.indexOf("href: rexonanceResonanceCssUrl");
  const cinematic = links.indexOf("CINEMATIC_STYLESHEET_LINK");
  assert.ok(stage > 0 && stage < resonance && resonance < cinematic);
  assert.ok(links.lastIndexOf('rel: "stylesheet"') < cinematic);
  for (const path of [
    "src/lib/world-head.ts",
    "src/routes/__root.tsx",
    "src/routes/world.tsx",
    "src/routes/extreme-saga.tsx",
    "src/routes/final-stage.tsx",
    "src/routes/dream-chapter.tsx",
  ]) {
    assert.doesNotMatch(read(path), /rexonance-resonance/, path);
  }
});

test("every rule is scoped to the Rexonance page and leaves the bar, the menu and the calls alone", () => {
  assert.ok(sheet.rules.length > 80, String(sheet.rules.length));
  for (const { selector } of sheet.rules) {
    for (const part of splitTopLevel(selector)) {
      assert.match(
        part,
        /^html(?:\[data-press-ready\])?(?:\[data-family="special"\]|\[data-world-effects="economy"\])(?::not\(\[[^\]]+\]\)| ?:not\(\s*\[[^\]]+\]\s*\))* body \.rxs-page\.rxs-page\.rxs-rexonance-page\b/,
        part,
      );
      assert.doesNotMatch(
        part,
        /\.exs-|\.fst-|\.rxs-local-nav|\.rxs-menu-trigger|\.side-panel|#site-side-panel|\.rx-call|\.rx-suit|\.load-gate/,
        part,
      );
    }
  }
});

test("keyframes are this sheet's own, move only opacity and transforms, and never loop", () => {
  assert.doesNotMatch(css, /\binfinite\b|animation-iteration-count|!important/);
  assert.ok(sheet.keyframes.size >= 25, String(sheet.keyframes.size));
  for (const [name, body] of sheet.keyframes) {
    assert.match(name, /^rsn-/, name);
    for (const [, property] of body.matchAll(/([\w-]+)\s*:/g)) {
      assert.ok(
        ["opacity", "transform", "translate", "scale", "rotate"].includes(property),
        `${name}: ${property}`,
      );
    }
  }
  // No blend modes, filters or blurs on anything this sheet paints.
  assert.doesNotMatch(css, /mix-blend-mode|backdrop-filter|blur\(/);
  for (const value of css.matchAll(/(?<![\w-])filter\s*:\s*([^;]+);/g))
    assert.equal(value[1].trim(), "none");
});

const scrollLinked = ({ body, context }) =>
  timed(body) || (moves(body) && context.some((at) => SUPPORTS.test(at)));

test("scroll-linked motion rides named timelines, behind the full gate, with no clip-path", () => {
  const scroll = sheet.rules.filter(scrollLinked);
  assert.ok(scroll.length >= 25, String(scroll.length));
  for (const { selector, body, context } of scroll) {
    assert.ok(
      context.some((at) => SUPPORTS.test(at)),
      selector,
    );
    assert.ok(
      context.some((at) => REDUCED.test(at)),
      selector,
    );
    for (const part of splitTopLevel(selector)) assert.match(part, FULL_GATE, part);
    for (const timeline of splitTopLevel(declaration(body, "animation-timeline") ?? "")) {
      assert.match(timeline, /^(?:--[\w-]+|auto)$/, `${selector}: ${timeline}`);
    }
  }
  // The keyframes a timeline plays never animate clip-path or colour.
  for (const { body } of scroll) {
    const names = splitTopLevel(
      declaration(body, "animation-name") ?? declaration(body, "animation") ?? "",
    ).map((layer) => splitTopLevel(layer, " ")[0]);
    for (const name of names) {
      const frames = sheet.keyframes.get(name);
      if (!frames) continue;
      assert.doesNotMatch(frames, /clip-path|color|background/, name);
    }
  }
  // Timelines are declared once motion is granted (persistent flags only).
  for (const { selector, body, context } of sheet.rules) {
    if (!/view-timeline|timeline-scope/.test(body)) continue;
    assert.ok(
      context.some((at) => SUPPORTS.test(at)),
      selector,
    );
    for (const part of splitTopLevel(selector)) {
      assert.match(
        part,
        /^html\[data-family="special"\]:not\(\[data-world-effects="economy"\]\)(?::not\(\[[^\]]+\]\)| ?:not\(\s*\[[^\]]+\]\s*\))* body \.rxs-page\.rxs-page\.rxs-rexonance-page\[data-motion-ready="true"\]/,
        part,
      );
    }
  }
});

test("time-based hits are gated, keyed to transient flags, finite and quick", () => {
  let checked = 0;
  for (const rule of sheet.rules) {
    const { selector, body, context } = rule;
    if (scrollLinked(rule) || !moves(body)) continue;
    checked += 1;
    assert.ok(
      context.some((at) => REDUCED.test(at)),
      selector,
    );
    for (const part of splitTopLevel(selector)) {
      assert.match(part, FULL_GATE, part);
      assert.match(part, /\[data-rsn-(?:state|hit|arrive|form|in)/, part);
    }
    for (const layer of splitTopLevel(declaration(body, "animation") ?? "")) {
      const times = [...layer.matchAll(/(\d+)ms/g)].map((match) => Number(match[1]));
      const [duration = 0, delay = 0] = times;
      // The form change waits for the card (the rest guard's 380 ms at most).
      const entrance = /--rxp-entrance-delay/.test(layer) ? 380 : 0;
      assert.ok(duration > 0 && duration <= 1500, `${selector}: ${layer}`);
      assert.ok(duration + delay + entrance <= 2200, `${selector}: ${layer}`);
    }
  }
  assert.ok(checked >= 14, String(checked));
  // The script clears every flag after its hit has played. (data-rsn-pulse
  // is gone: owner, 2026-10-11, the core no longer rings with each lock.)
  for (const flag of ["data-rsn-hit", "data-rsn-arrive", "data-rsn-form", "data-rsn-in"]) {
    assert.ok(script.includes(`"${flag}"`), flag);
  }
  assert.match(script, /element\.removeAttribute\(name\)/);
});

test("transitions answer presses and hovers on the compositor, never in economy or reduced motion", () => {
  const transitions = sheet.rules.filter(({ body }) =>
    /(?:^|;)\s*transition(?:-[\w-]+)?\s*:/.test(body),
  );
  assert.ok(transitions.length >= 3);
  for (const { selector, body, context } of transitions) {
    assert.ok(
      context.some((at) => REDUCED.test(at)),
      selector,
    );
    for (const part of splitTopLevel(selector)) {
      assert.match(part, /:not\(\[data-world-effects="economy"\]\)/, part);
    }
    const value = declaration(body, "transition");
    if (value && value !== "none") {
      for (const layer of splitTopLevel(value)) {
        assert.match(layer, /^(?:scale|translate) \d+ms /, `${selector}: ${layer}`);
      }
    }
  }
  // Hovers belong to fine pointers.
  for (const { selector, context } of sheet.rules) {
    if (!/:hover/.test(selector)) continue;
    assert.ok(
      context.some((at) => /\(hover: hover\) and \(pointer: fine\)/.test(at)),
      selector,
    );
  }
});

test("the pinned cuts are a layout of the persistent preferences, never of the menu or dialogs", () => {
  const sticky = sheet.rules.filter(({ body }) => /position: sticky/.test(body));
  assert.equal(sticky.length, 1);
  const [{ selector, context }] = sticky;
  assert.ok(context.some((at) => REDUCED.test(at)));
  assert.match(selector, /:not\(\[data-world-effects="economy"\]\)/);
  // The route-cover marker gates motion only; the pinned cuts must keep their scroll geometry.
  assert.doesNotMatch(
    selector,
    /data-side-menu-open|data-dialog-open|data-loading|data-route-covered|data-motion-ready/,
  );
});

test("text keeps its 12px floor; generated text is silent; forced colours drop every ornament", () => {
  for (const [, value] of css.matchAll(/font-size:\s*([^;]+);/g)) {
    const px = value.match(/^(\d+(?:\.\d+)?)px$/);
    if (px) assert.ok(Number(px[1]) >= 12, value);
    const clamp = value.match(/^clamp\((\d+(?:\.\d+)?)px,/);
    if (clamp) assert.ok(Number(clamp[1]) >= 12, value);
  }
  for (const [, value] of css.matchAll(/(?<![\w-])content:\s*([^;]+);/g)) {
    assert.match(value.trim(), /^(?:""|"[^"]*" \/ "")$/, value);
  }
  const forced = sheet.rules
    .filter(({ context }) => context.some((at) => /forced-colors:\s*active/.test(at)))
    .map(({ selector, body }) => `${selector} { ${body} }`)
    .join("\n");
  for (const ornament of [
    ".rsn-depth",
    ".rsn-field",
    ".rsn-form",
    ".rsn-coda",
    ".rsn-glint",
    ".rsn-count",
    ".rxs-hero-copy::before",
    "h1::after",
    ".rxs-section::before",
  ]) {
    assert.ok(forced.includes(ornament), ornament);
  }
  assert.match(forced, /display: none/);
  // The counters paint only with forced colours off.
  const armed = sheet.rules.filter(({ selector }) => /data-rsn-state="armed"/.test(selector));
  assert.ok(armed.length >= 2);
  for (const { context } of armed) {
    assert.ok(context.some((at) => /forced-colors: none/.test(at) && REDUCED.test(at)));
  }
});

test("each figure keeps the owner's value as its own text; its counter is a hidden mirror", () => {
  for (const [value, suffix] of [
    ["650", "<span>%\\+</span>"],
    ["900", "<span>%</span>"],
    // owner request 2026-10-16: FORGE (rx18) sets the wave as its own mark; the text is unchanged
    ['50,000<i className="rxf-wave">〜</i>', "\\s*<span>YOPS</span>"],
    ["9,000", "<span>TOPS</span>"],
  ]) {
    assert.match(
      page,
      new RegExp(
        `<strong data-rsn-count="">\\s*${value}${suffix}\\s*<b className="rsn-count" aria-hidden="true">\\s*${value}${suffix}\\s*</b>\\s*</strong>`,
      ),
      value,
    );
  }
  for (const value of ["90%", "約0.06ms", "96%"]) {
    assert.match(
      page,
      new RegExp(
        `<dd data-rsn-count="">\\s*${value}\\s*<b className="rsn-count" aria-hidden="true">\\s*${value}\\s*</b>\\s*</dd>`,
      ),
      value,
    );
  }
  // Owner (2026-10-17): the comparison and P14 read-outs count too (they
  // were skipped); the result's mirror is a span, so the b rules stay off it.
  for (const [open, value, mirror, close] of [
    ["strong", "{metric.current}", "b", "strong"],
    ["b", "{metric.relative}", "span", "b"],
    ["strong", "{metric.relative[p14Baseline]}", "b", "strong"],
  ]) {
    const figure = value.replace(/[[\]{}.]/g, "\\$&");
    assert.match(
      page,
      new RegExp(
        `<${open} data-rsn-count="">\\s*${figure}\\s*<${mirror} className="rsn-count" aria-hidden="true">\\s*${figure}\\s*</${mirror}>\\s*</${close}>`,
      ),
      value,
    );
  }
  // Every ornament the layer adds is hidden from assistive technology.
  for (const ornament of ["rsn-field", "rsn-form", "rsn-coda", "rsn-glint"]) {
    assert.match(page, new RegExp(`className="${ornament}" aria-hidden="true"`), ornament);
  }
  assert.match(
    page,
    /<div className="rxs-hero-visual" aria-hidden="true">[\s\S]*?<span className="rsn-depth">/,
  );
  // One mount, never restarted by a form, menu or baseline change.
  assert.match(
    page,
    /useEffect\(\(\) => \(lower \? mountRexonanceResonance\(pageRef\.current\) : undefined\), \[lower\]\);/,
  );
});

test("the counter prints the owner's figures at every step without reflowing", () => {
  const cases = [
    ["650", ["0", "325", "650"]],
    ["50,000〜", ["0〜", "25,000〜", "50,000〜"]],
    ["9,000", ["0", "4,500", "9,000"]],
    ["90%", ["0%", "45%", "90%"]],
    ["約0.06ms", ["約0.00ms", "約0.03ms", "約0.06ms"]],
  ];
  for (const [text, expected] of cases) {
    const template = countTemplate(text);
    assert.ok(template, text);
    const printed = [0, 0.5, 1].map((share) => formatCount(template, template.value * share));
    assert.deepEqual(printed, expected, text);
    // The host retains its final text and reserves layout. Its absolute
    // mirror need not print fake zeroes to occupy the same character count.
    for (const step of printed) assert.ok(step.length <= text.length, text);
    assert.equal(printed.at(-1), text);
  }
  assert.equal(countTemplate("REXONANCE"), null);
});

/* ---------------- the script, in a minimal environment ---------------- */
function environment({ reduced = false, economy = false, fine = false, timelines = true } = {}) {
  const listeners = new Map();
  const target = (name) => ({
    addEventListener(type, callback) {
      listeners.set(`${name}:${type}`, callback);
    },
    removeEventListener(type, callback) {
      if (listeners.get(`${name}:${type}`) === callback) listeners.delete(`${name}:${type}`);
    },
  });
  const media = (matches, name) => ({ matches, ...target(`media ${name}`) });
  const attributes = (node) => {
    node.attributes = new Map();
    node.dataset = new Proxy(
      {},
      {
        get: (_, key) =>
          node.attributes.get(
            `data-${String(key).replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`,
          ),
        set: (_, key, value) => {
          node.attributes.set(
            `data-${String(key).replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`,
            String(value),
          );
          return true;
        },
      },
    );
    node.setAttribute = (name, value) => node.attributes.set(name, String(value));
    node.removeAttribute = (name) => node.attributes.delete(name);
    node.hasAttribute = (name) => node.attributes.has(name);
    node.getAttribute = (name) => node.attributes.get(name) ?? null;
    return node;
  };
  const html = attributes({});
  if (economy) html.setAttribute("data-world-effects", "economy");
  const document = { documentElement: html, hidden: false, ...target("document") };
  const makeFigure = (text, suffix = "") => {
    const ownText = { nodeType: 3, data: text };
    const overlayText = { nodeType: 3, data: text };
    const overlay = { childNodes: [overlayText] };
    const parent = attributes({});
    const host = attributes({
      own: ownText,
      overlay,
      parentElement: parent,
      querySelector: (selector) => (selector === ".rsn-count" ? overlay : null),
      closest: (selector) => (selector === ".rxs-headline-metrics" && suffix ? {} : null),
    });
    return host;
  };
  const figures = [makeFigure("650", "%+"), makeFigure("約0.06ms")];
  const pageNode = attributes({
    ownerDocument: document,
    style: { setProperty() {}, removeProperty() {} },
    querySelectorAll: (selector) => (selector === "[data-rsn-count]" ? figures : []),
    querySelector: () => null,
  });
  const observers = [];
  class IntersectionObserver {
    constructor(callback, options) {
      this.callback = callback;
      this.options = options;
      this.targets = new Set();
      observers.push(this);
    }
    observe(node) {
      this.targets.add(node);
    }
    unobserve(node) {
      this.targets.delete(node);
    }
    disconnect() {
      this.targets.clear();
      this.disconnected = true;
    }
  }
  const mutationObservers = [];
  class MutationObserver {
    constructor(callback) {
      this.callback = callback;
      mutationObservers.push(this);
    }
    observe() {}
    disconnect() {
      this.disconnected = true;
    }
  }
  let now = 0;
  let frameId = 0;
  const frames = new Map();
  let timerId = 0;
  const timers = new Map();
  const env = {
    ...target("window"),
    navigator: {},
    matchMedia: (query) =>
      media(
        query.includes("reduce") ? reduced : query.includes("pointer: fine") ? fine : false,
        query,
      ),
    CSS: { supports: () => timelines },
    performance: { now: () => now },
    requestAnimationFrame: (callback) => {
      frames.set(++frameId, callback);
      return frameId;
    },
    cancelAnimationFrame: (id) => frames.delete(id),
    setTimeout: (callback, ms) => {
      timers.set(++timerId, { callback, at: now + ms });
      return timerId;
    },
    clearTimeout: (id) => timers.delete(id),
    IntersectionObserver,
    MutationObserver,
    innerWidth: 1440,
    innerHeight: 900,
  };
  const advance = (ms) => {
    const end = now + ms;
    while (now < end) {
      now = Math.min(end, now + 16);
      for (const [id, callback] of [...frames]) {
        frames.delete(id);
        callback(now);
      }
      for (const [id, timer] of [...timers]) {
        if (timer.at <= now) {
          timers.delete(id);
          timer.callback();
        }
      }
    }
  };
  return {
    env,
    pageNode,
    html,
    document,
    figures,
    makeFigure,
    observers,
    mutationObservers,
    listeners,
    advance,
    frames,
    timers,
  };
}

test("reduced motion and economy never arm a figure, and leave nothing behind", () => {
  for (const options of [{ reduced: true }, { economy: true }]) {
    const t = environment(options);
    const dispose = mountRexonanceResonance(t.pageNode, t.env);
    for (const figure of t.figures) {
      assert.equal(figure.getAttribute("data-rsn-state"), null);
      assert.equal(figure.overlay.childNodes[0].data, figure.own.data);
    }
    dispose();
    assert.equal(t.frames.size, 0);
    assert.equal(t.timers.size, 0);
    assert.equal([...t.listeners.keys()].length, 0, [...t.listeners.keys()].join());
    assert.ok(t.mutationObservers.every((observer) => observer.disconnected));
  }
});

test("a figure counts once from zero, locks with a transient hit, and hands back its own text", () => {
  const t = environment();
  const dispose = mountRexonanceResonance(t.pageNode, t.env);
  const [cut, readout] = t.figures;
  // Armed: the mirror shows zeros; the figure's own text is untouched.
  assert.equal(cut.getAttribute("data-rsn-state"), "armed");
  assert.equal(cut.overlay.childNodes[0].data, "0");
  assert.equal(readout.overlay.childNodes[0].data, "約0.00ms");
  assert.equal(cut.own.data, "650");
  // The arrival flag is set once the page is handed over, then cleared.
  assert.equal(t.pageNode.getAttribute("data-rsn-arrive"), "true");
  const [counts] = t.observers;
  counts.callback([{ isIntersecting: true, target: cut }]);
  assert.equal(cut.getAttribute("data-rsn-state"), "count");
  t.advance(450);
  const midway = cut.overlay.childNodes[0].data;
  assert.match(midway, /^\d{3}$/);
  assert.ok(Number(midway) > 0 && Number(midway) < 650, midway);
  t.advance(500);
  assert.equal(cut.getAttribute("data-rsn-state"), "lock");
  assert.equal(cut.overlay.childNodes[0].data, "650");
  assert.equal(cut.parentElement.getAttribute("data-rsn-hit"), "true");
  // Owner (2026-10-11): the armour's core no longer rings with each lock.
  assert.equal(t.pageNode.getAttribute("data-rsn-pulse"), null);
  t.advance(2600);
  assert.equal(cut.getAttribute("data-rsn-state"), "done");
  assert.equal(cut.parentElement.getAttribute("data-rsn-hit"), null);
  assert.equal(t.pageNode.getAttribute("data-rsn-pulse"), null);
  assert.equal(t.pageNode.getAttribute("data-rsn-arrive"), null);
  // Done is final: a second intersection never counts it again.
  counts.callback([{ isIntersecting: true, target: cut }]);
  assert.equal(cut.getAttribute("data-rsn-state"), "done");
  assert.equal(cut.own.data, "650");
  dispose();
  assert.equal(cut.getAttribute("data-rsn-state"), null);
  assert.equal(readout.getAttribute("data-rsn-state"), null);
  assert.equal(readout.overlay.childNodes[0].data, "約0.06ms");
  assert.ok(t.observers.every((observer) => observer.disconnected));
});

// Owner (2026-10-17): the 01 comparison and the P14 read-outs are re-rendered
// with their baseline, so their figures must be read when they appear.
test("a figure the page renders later is armed and counts; one it removes is dropped", () => {
  const t = environment();
  const dispose = mountRexonanceResonance(t.pageNode, t.env);
  const [counts] = t.observers;
  const later = t.makeFigure("547.4%");
  t.figures.push(later);
  const pageObserver = t.mutationObservers.at(-1);
  pageObserver.callback();
  assert.equal(later.getAttribute("data-rsn-state"), "armed");
  assert.equal(later.overlay.childNodes[0].data, "0.0%");
  assert.ok(counts.targets.has(later));
  counts.callback([{ isIntersecting: true, target: later }]);
  assert.equal(later.getAttribute("data-rsn-state"), "count");
  t.advance(1000);
  assert.equal(later.getAttribute("data-rsn-state"), "lock");
  assert.equal(later.overlay.childNodes[0].data, "547.4%");
  // Replaced by the page (a baseline change): the old figure is forgotten.
  const gone = t.figures.pop();
  gone.isConnected = false;
  const replacement = t.makeFigure("376.7%");
  t.figures.push(replacement);
  // Pending: the arrival flag, the lock and the hit; only the lock is the figure's own.
  const pending = t.timers.size;
  pageObserver.callback();
  assert.ok(!counts.targets.has(gone));
  assert.equal(replacement.getAttribute("data-rsn-state"), "armed");
  assert.equal(replacement.overlay.childNodes[0].data, "0.0%");
  assert.equal(t.timers.size, pending - 1, "the removed figure's lock timer is cleared");
  dispose();
  assert.equal(replacement.getAttribute("data-rsn-state"), null);
  assert.ok(t.observers.every((observer) => observer.disconnected));
  assert.ok(t.mutationObservers.every((observer) => observer.disconnected));
});

test("hiding the page ends a running count on its value; a route cover holds a count back", () => {
  const t = environment();
  const dispose = mountRexonanceResonance(t.pageNode, t.env);
  const [cut, readout] = t.figures;
  const [counts] = t.observers;
  counts.callback([{ isIntersecting: true, target: cut }]);
  t.advance(200);
  t.document.hidden = true;
  t.listeners.get("document:visibilitychange")();
  assert.equal(cut.getAttribute("data-rsn-state"), "done");
  assert.equal(cut.overlay.childNodes[0].data, "650");
  assert.equal(t.frames.size, 0);
  t.document.hidden = false;
  t.listeners.get("document:visibilitychange")();
  // Under a cover the readout waits, then counts once the cover lifts.
  t.html.setAttribute("data-loading", "true");
  counts.callback([{ isIntersecting: true, target: readout }]);
  assert.equal(readout.getAttribute("data-rsn-state"), "armed");
  t.html.removeAttribute("data-loading");
  t.mutationObservers[0].callback([]);
  assert.equal(readout.getAttribute("data-rsn-state"), "count");
  t.advance(1500);
  assert.equal(readout.overlay.childNodes[0].data, "約0.06ms");
  dispose();
});

test("withdrawing motion hands every waiting figure back at once", () => {
  const t = environment();
  const dispose = mountRexonanceResonance(t.pageNode, t.env);
  const [cut] = t.figures;
  t.html.setAttribute("data-world-effects", "economy");
  t.mutationObservers[0].callback([]);
  assert.equal(cut.getAttribute("data-rsn-state"), null);
  assert.equal(cut.overlay.childNodes[0].data, "650");
  t.html.removeAttribute("data-world-effects");
  t.mutationObservers[0].callback([]);
  assert.equal(cut.getAttribute("data-rsn-state"), "armed");
  dispose();
  assert.equal(cut.overlay.childNodes[0].data, "650");
});

test("a reverse scrub repaints the armour under each ornament tile it takes off (owner, 2026-10-16)", async () => {
  // Welds now follow the paint order; an ornament cell over the armour is
  // the same cell twice. Taking the ornament's weld off clears that cell, so
  // the armour beneath must be drawn again: no hole under the ornaments.
  const t = scrollAssemblyEnvironment();
  const dispose = mountRexonanceAssembly(
    t.runway,
    {
      figure: "/figure",
      undersuit: "/undersuit",
      base: "/base",
      ornaments: ["tail", "ribbon"],
      size: { width: 60, height: 60 },
      pieces: [
        { id: "rib", group: "ribbon", x: 0, y: 0, w: 60, h: 60, seat: [30, 8] },
        { id: "leg", group: "legs", x: 0, y: 0, w: 60, h: 60, seat: [30, 52] },
      ],
      core: [30, 30],
      visor: [30, 6],
      glow: [],
    },
    t.env,
  );
  try {
    t.observers[0].callback([{ isIntersecting: true }]);
    for (let i = 0; i < 200 && t.runway.dataset.rznState !== "live"; i += 1)
      await new Promise((resolve) => setTimeout(resolve, 5));
    assert.equal(t.runway.dataset.rznState, "live");
    t.scroll(0.85);
    for (let rounds = 0; t.frames.size && rounds < 30; rounds += 1) t.frame();
    const reverse = t.scroll(0.7);
    const cleared = reverse.filter(
      (c) => c.method === "clearRect" && c.args[2] === 15 && c.args[3] === 15,
    );
    assert.ok(cleared.length > 0, "the reverse takes ornament welds off");
    for (const clear of cleared) {
      const after = reverse.slice(reverse.indexOf(clear) + 1).find((c) => c.target === clear.target);
      assert.equal(after?.method, "drawImage", "the armour beneath is drawn again");
      assert.deepEqual(after.args.slice(5), clear.args, "into exactly that cell");
    }
  } finally {
    dispose();
  }
});
