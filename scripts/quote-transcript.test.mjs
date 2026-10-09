import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import {
  mountQuoteTranscript,
  transcriptGraphemes,
  transcriptTimeline,
} from "../src/lib/quote-transcript.js";

class Target {
  listeners = new Map();
  addEventListener(type, handler) {
    const listeners = this.listeners.get(type) ?? new Set();
    listeners.add(handler);
    this.listeners.set(type, listeners);
  }
  removeEventListener(type, handler) {
    this.listeners.get(type)?.delete(handler);
  }
  dispatch(type, event = {}) {
    for (const handler of this.listeners.get(type) ?? []) handler(event);
  }
  get listenerCount() {
    return [...this.listeners.values()].reduce((sum, listeners) => sum + listeners.size, 0);
  }
}

function harness({
  texts = ["「誰が、世界を見ているのか。」"],
  reduced = false,
  economy = false,
  colors = false,
  disabled = false,
  io = true,
} = {}) {
  const doc = new Target();
  const motion = Object.assign(new Target(), { matches: reduced });
  const forcedColors = Object.assign(new Target(), { matches: colors });
  const frames = new Map();
  const observers = [];
  const mutations = [];
  let id = 0;
  let now = 0;
  let selection = null;
  doc.hidden = false;
  const rootAttributes = new Set();
  doc.documentElement = {
    dataset: { worldEffects: economy ? "economy" : "normal" },
    hasAttribute: (attribute) => rootAttributes.has(attribute),
  };
  doc.getSelection = () => selection;
  const nodes = texts.map((text) => {
    const attrs = new Map();
    const glyphs = transcriptGraphemes(text).map((glyph) => {
      const classes = new Set();
      return {
        textContent: glyph,
        classList: {
          add: (...names) => names.forEach((name) => classes.add(name)),
          remove: (...names) => names.forEach((name) => classes.delete(name)),
          contains: (name) => classes.has(name),
        },
      };
    });
    return {
      textContent: text,
      glyphs,
      querySelectorAll: () => glyphs,
      getAttribute: (name) => attrs.get(name) ?? null,
      hasAttribute: (name) => attrs.has(name),
      setAttribute: (name, value) => attrs.set(name, value),
      removeAttribute: (name) => attrs.delete(name),
    };
  });
  doc.defaultView = {
    matchMedia: (query) => (query.includes("reduced-motion") ? motion : forcedColors),
    requestAnimationFrame(callback) {
      frames.set(++id, callback);
      return id;
    },
    cancelAnimationFrame: (key) => frames.delete(key),
    IntersectionObserver: io
      ? class {
          constructor(callback) {
            this.callback = callback;
            observers.push(this);
          }
          observe() {}
          disconnect() {
            this.disconnected = true;
          }
        }
      : undefined,
    MutationObserver: class {
      constructor(callback) {
        this.callback = callback;
        mutations.push(this);
      }
      observe() {}
      disconnect() {
        this.disconnected = true;
      }
    },
  };
  const root = {
    ownerDocument: doc,
    querySelectorAll: () => nodes,
    contains: (node) => nodes.includes(node),
  };
  const dispose = mountQuoteTranscript(root, { disabled });
  return {
    doc,
    nodes,
    frames,
    observers,
    mutations,
    motion,
    forcedColors,
    dispose,
    visible(index = 0, visible = true) {
      observers[0]?.callback([
        { target: nodes[index], isIntersecting: visible, intersectionRatio: visible ? 1 : 0 },
      ]);
    },
    step(ms = 20) {
      now += ms;
      const pending = [...frames.values()];
      frames.clear();
      pending.forEach((callback) => callback(now));
    },
    advance(ms = 4200) {
      for (let elapsed = 0; elapsed < ms; elapsed += 20) this.step();
    },
    setReduced(value) {
      motion.matches = value;
      motion.dispatch("change");
    },
    setEconomy(value) {
      doc.documentElement.dataset.worldEffects = value ? "economy" : "normal";
      mutations[0]?.callback([]);
    },
    setHidden(value) {
      doc.hidden = value;
      doc.dispatch("visibilitychange");
    },
    setOverlay(value) {
      if (value) rootAttributes.add("data-side-menu-open");
      else rootAttributes.delete("data-side-menu-open");
      mutations[0]?.callback([]);
    },
    select(node = nodes[0]) {
      selection = { isCollapsed: false, anchorNode: node };
      doc.dispatch("selectionchange");
    },
    written(index = 0) {
      return nodes[index].glyphs.filter((glyph) => glyph.classList.contains("is-written")).length;
    },
  };
}

test("graphemes preserve Japanese, combining marks and joined emoji exactly", () => {
  const text = "「観測 👩‍🚀 é 🐕」";
  const glyphs = transcriptGraphemes(text);
  assert.equal(glyphs.join(""), text);
  assert.ok(glyphs.includes("👩‍🚀"));
  assert.ok(glyphs.includes("é"));
});

test("all pacing is deterministic and bounded, including punctuation-heavy records", () => {
  for (const text of ["", "誰だ。", "！？、…".repeat(300), "世界".repeat(500)]) {
    const glyphs = transcriptGraphemes(text);
    const times = transcriptTimeline(glyphs, 2);
    assert.deepEqual(times, transcriptTimeline(glyphs, 2));
    assert.equal(times.length, glyphs.length);
    assert.ok(times.every((time, index) => time >= 0 && (index === 0 || time >= times[index - 1])));
    assert.ok((times.at(-1) ?? 0) <= 3600);
  }
  assert.deepEqual(transcriptTimeline(["あ", "。"]), [30, 246]);
});

test("SSR shows the original once accessibly; decorative glyphs cannot inject markup", () => {
  const exports = {};
  const require = createRequire(import.meta.url);
  const source = readFileSync(
    new URL("../src/components/world/quote-transcript.tsx", import.meta.url),
    "utf8",
  );
  runInNewContext(
    ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
    }).outputText,
    {
      exports,
      require: (id) => (id === "@/lib/quote-transcript.js" ? { transcriptGraphemes } : require(id)),
    },
  );
  const html = renderToStaticMarkup(
    React.createElement(exports.QuoteTranscript, { text: "「誰？ 👩‍🚀 <script>」" }),
  );
  assert.match(html, /class="wa-transcript-source">「誰？ 👩‍🚀 &lt;script&gt;」<\/span>/);
  assert.match(html, /class="wa-transcript-visual" aria-hidden="true"/);
  assert.equal((html.match(/class="wa-transcript-source"/g) ?? []).length, 1);
  assert.doesNotMatch(html, /<script>|aria-live|data-transcript-phase=/);
});

test("only visible records write, there is one scheduler, and finished records stay still", () => {
  const h = harness({ texts: ["「誰が見ている。」", "「経路はない。」"] });
  assert.equal(h.frames.size, 0);
  assert.equal(h.observers.length, 1);
  h.visible();
  h.visible(1);
  assert.equal(h.frames.size, 1);
  h.advance(320);
  assert.ok(h.written() > 0 && h.written() < h.nodes[0].glyphs.length);
  assert.equal(h.nodes[0].getAttribute("data-transcript-phase"), "writing");
  assert.equal(h.nodes[0].textContent, "「誰が見ている。」");
  h.advance();
  assert.equal(h.frames.size, 0);
  assert.equal(h.nodes[0].getAttribute("data-transcript-phase"), null);
  h.visible(0, false);
  h.visible();
  assert.equal(h.frames.size, 0, "completed records never automatically replay");
  h.dispose();
});

test("a record has just one short interference window, never a repeating fault", () => {
  const h = harness();
  h.visible();
  let windows = 0,
    previous = false,
    faultFrames = 0;
  for (let time = 0; time < 4200; time += 20) {
    h.step();
    const fault = h.nodes[0].hasAttribute("data-transcript-fault");
    if (fault && !previous) windows += 1;
    if (fault) faultFrames += 1;
    previous = fault;
  }
  assert.equal(windows, 1);
  assert.ok(faultFrames > 0 && faultFrames <= 10);
  assert.equal(h.frames.size, 0);
  h.dispose();
});

test("leaving the viewport or hiding the document pauses and resumes without a time jump", () => {
  const h = harness({ texts: ["「観測する主体も、その経路も、依然として定義されていない。」"] });
  h.visible();
  h.advance(320);
  const written = h.written();
  assert.ok(written > 0);
  h.visible(0, false);
  assert.equal(h.frames.size, 0);
  assert.equal(h.nodes[0].getAttribute("data-transcript-phase"), null);
  h.advance(8000);
  h.visible();
  h.step();
  assert.equal(h.written(), written);
  h.setHidden(true);
  assert.equal(h.frames.size, 0);
  h.advance(8000);
  h.setHidden(false);
  h.step();
  assert.equal(h.written(), written);
  h.advance();
  assert.equal(h.nodes[0].getAttribute("data-transcript-phase"), null);
  h.dispose();
});

for (const option of ["disabled", "reduced", "economy", "colors"]) {
  test(`${option} displays complete source without a writing frame`, () => {
    const h = harness({ [option]: true });
    h.visible();
    h.advance();
    assert.equal(h.frames.size, 0);
    assert.equal(h.nodes[0].getAttribute("data-transcript-phase"), null);
    assert.equal(h.written(), 0);
    h.dispose();
  });
}

test("changing motion or economy policy mid-record settles it to readable source", () => {
  for (const change of ["setReduced", "setEconomy"]) {
    const h = harness();
    h.visible();
    h.advance(320);
    h[change](true);
    assert.equal(h.frames.size, 0);
    assert.equal(h.nodes[0].getAttribute("data-transcript-phase"), null);
    h[change](false);
    assert.equal(h.frames.size, 0);
    h.dispose();
  }
});

test("opening an overlay suspends the log and closing it resumes the retained clock", () => {
  const h = harness();
  h.visible();
  h.advance(320);
  const written = h.written();
  h.setOverlay(true);
  assert.equal(h.frames.size, 0);
  assert.equal(h.nodes[0].getAttribute("data-transcript-phase"), null);
  h.advance(8000);
  h.visible(0, false);
  h.visible();
  assert.equal(h.nodes[0].getAttribute("data-transcript-phase"), null);
  assert.equal(h.frames.size, 0);
  h.setOverlay(false);
  h.step();
  assert.equal(h.written(), written);
  h.advance();
  assert.equal(h.frames.size, 0);
  h.dispose();
});

test("selecting source or invoking find completes the log without hijacking input", () => {
  for (const action of ["select", "find"]) {
    const h = harness();
    h.visible();
    h.advance(320);
    if (action === "select") h.select();
    else
      h.doc.dispatch("keydown", {
        metaKey: true,
        key: "f",
        preventDefault() {
          assert.fail("native find must remain available");
        },
      });
    assert.equal(h.frames.size, 0);
    assert.equal(h.nodes[0].getAttribute("data-transcript-phase"), null);
    h.dispose();
  }
  const outside = harness();
  outside.visible();
  outside.advance(320);
  outside.select({});
  assert.equal(outside.frames.size, 1);
  outside.dispose();
});

test("unmounting cleans all observers, listeners, frames and presentation attributes", () => {
  const h = harness();
  h.visible();
  h.advance(320);
  h.dispose();
  h.dispose();
  assert.equal(h.frames.size, 0);
  assert.equal(h.doc.listenerCount + h.motion.listenerCount + h.forcedColors.listenerCount, 0);
  assert.ok([...h.observers, ...h.mutations].every((observer) => observer.disconnected));
  assert.equal(h.nodes[0].getAttribute("data-transcript-phase"), null);
  assert.equal(h.written(), 0);
});

test("missing viewport APIs and empty roots gracefully keep the static document", () => {
  const h = harness({ io: false });
  h.visible();
  h.advance();
  assert.equal(h.frames.size, 0);
  assert.equal(h.nodes[0].getAttribute("data-transcript-phase"), null);
  h.dispose();
  assert.doesNotThrow(() => mountQuoteTranscript(null)());
  const empty = harness({ texts: [] });
  empty.dispose();
  const blank = harness({ texts: [""] });
  blank.visible();
  blank.advance();
  assert.equal(blank.frames.size, 0);
  blank.dispose();
});
