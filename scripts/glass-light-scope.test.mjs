// The room's light is written on the glass in view, never on <html>
// (liquid-glass-light.ts). An inherited custom property changed on <html>
// restyled every element of the page several times a scroll (about 3,700 on
// /world, 0.4-0.6 s each on a throttled phone); on the glass it restyles a
// few small subtrees. Pins where the light goes, that it reaches only what
// is on or near the screen, that the pointer's own control is left to the
// pointer, that rest removes everything, and that the surfaces' lit tokens
// are declared again where the light is.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const source = read("src/lib/liquid-glass-light.ts");
const surfaces = read("src/styles-liquid-glass-surfaces.css");
const controls = read("src/styles-liquid-glass-controls.css");
const glassLib = read("src/lib/liquid-glass.ts");

async function load() {
  const code = ts
    .transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
    })
    .outputText.replace(/^import .*liquid-glass.*$/m, 'const LIQUID_GLASS_TARGETS = [".target"];');
  return import("data:text/javascript;base64," + Buffer.from(code).toString("base64"));
}

/** A tiny page: elements with inline style and attributes, observers driven by hand. */
function fakePage() {
  const timers = new Map();
  let nextTimer = 1;
  let now = 0;
  const listeners = new Map();
  const observers = [];
  class Style {
    props = new Map();
    writes = 0;
    getPropertyValue(name) {
      return this.props.get(name) ?? "";
    }
    setProperty(name, value) {
      this.writes++;
      this.props.set(name, value);
    }
    removeProperty(name) {
      if (this.props.delete(name)) this.writes++;
    }
  }
  class El {
    constructor(name) {
      this.name = name;
      this.style = new Style();
      this.attrs = new Map();
      this.isConnected = true;
    }
    getAttribute(n) {
      return this.attrs.has(n) ? this.attrs.get(n) : null;
    }
    hasAttribute(n) {
      return this.attrs.has(n);
    }
    setAttribute(n, v) {
      this.attrs.set(n, String(v));
    }
    removeAttribute(n) {
      this.attrs.delete(n);
    }
  }
  const root = new El("html");
  const lit = [new El("a"), new El("b"), new El("c")];
  const on = (target) => (type, fn) => listeners.set(`${target}:${type}`, fn);
  const off = (target) => (type) => listeners.delete(`${target}:${type}`);
  const view = {
    innerWidth: 400,
    innerHeight: 800,
    performance: { now: () => now },
    matchMedia: (q) => ({ matches: q.includes("hover") }),
    setTimeout: (fn, ms) => {
      const id = nextTimer++;
      timers.set(id, { fn, at: now + ms });
      return id;
    },
    clearTimeout: (id) => timers.delete(id),
    addEventListener: on("view"),
    removeEventListener: off("view"),
    IntersectionObserver: class {
      constructor(cb) {
        this.cb = cb;
        this.els = new Set();
        observers.push(this);
      }
      observe(el) {
        this.els.add(el);
      }
      unobserve(el) {
        this.els.delete(el);
      }
      disconnect() {
        this.els.clear();
      }
    },
    MutationObserver: class {
      observe() {}
      disconnect() {}
    },
  };
  const doc = {
    defaultView: view,
    documentElement: root,
    body: new El("body"),
    querySelectorAll: () => lit,
    addEventListener: on("doc"),
    removeEventListener: off("doc"),
  };
  const run = (ms) => {
    const end = now + ms;
    for (;;) {
      const due = [...timers].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
      if (!due) break;
      timers.delete(due[0]);
      now = Math.max(now, due[1].at);
      due[1].fn();
    }
    now = end;
  };
  const see = (els, inView) =>
    observers[0].cb(els.map((target) => ({ target, isIntersecting: inView })));
  const fire = (key, event) => listeners.get(key)?.(event);
  return { doc, root, lit, run, see, fire, observers };
}

test("the light is written on the glass in view, never on <html>", async () => {
  const { watchLiquidLight, LIT_ATTRIBUTE } = await load();
  const page = fakePage();
  const stop = watchLiquidLight(page.doc);
  page.run(0); // the first scan
  assert.equal(page.observers[0].els.size, 3);
  const [a, b, c] = page.lit;
  page.see([a, b], true);
  // At rest nothing is written anywhere: the sheet's own light shows.
  assert.equal(a.style.writes + b.style.writes + c.style.writes + page.root.style.writes, 0);

  // A wheel leans the light: only the elements in view take it.
  page.fire("view:wheel", { deltaY: 120 });
  page.run(90);
  assert.equal(page.root.style.writes, 0, "never <html>");
  assert.notEqual(a.style.getPropertyValue("--lg-ly"), "");
  assert.equal(a.style.getPropertyValue("--lg-ly"), b.style.getPropertyValue("--lg-ly"));
  assert.ok(a.hasAttribute(LIT_ATTRIBUTE));
  assert.equal(c.style.writes, 0, "off screen: untouched");

  // Coming into view, an element takes the current light at once.
  page.see([c], true);
  assert.equal(c.style.getPropertyValue("--lg-ly"), a.style.getPropertyValue("--lg-ly"));

  // Unchanged values are not written again.
  const writes = a.style.writes;
  page.fire("view:wheel", { deltaY: 120 });
  page.run(5);
  page.fire("view:wheel", { deltaY: 120 });
  page.run(90);
  assert.ok(a.style.writes - writes <= 2);

  // The scroll relaxes: back at rest the inline light and the mark are gone.
  page.run(2000);
  for (const el of page.lit) {
    assert.equal(el.style.getPropertyValue("--lg-lx"), "");
    assert.equal(el.style.getPropertyValue("--lg-ly"), "");
    assert.ok(!el.hasAttribute(LIT_ATTRIBUTE));
  }
  stop();
});

test("the control under the mouse keeps the pointer's own light", async () => {
  const { watchLiquidLight } = await load();
  const page = fakePage();
  const stop = watchLiquidLight(page.doc);
  page.run(0);
  const [a, b] = page.lit;
  page.see([a, b], true);
  a.style.setProperty("--lg-px", "40%");
  a.style.setProperty("--lg-lx", "0.10");
  page.fire("doc:pointermove", { pointerType: "mouse", clientX: 400, clientY: 0 });
  page.run(90);
  assert.equal(a.style.getPropertyValue("--lg-lx"), "0.10");
  assert.notEqual(b.style.getPropertyValue("--lg-lx"), "");
  // The pointer lets go (liquid-glass.ts removes its properties): the next
  // write gives the control the room's light.
  a.style.removeProperty("--lg-px");
  a.style.removeProperty("--lg-lx");
  page.fire("doc:pointermove", { pointerType: "mouse", clientX: 390, clientY: 0 });
  page.run(90);
  assert.equal(a.style.getPropertyValue("--lg-lx"), b.style.getPropertyValue("--lg-lx"));
  // Off: everything removed.
  stop();
  for (const el of [a, b]) assert.equal(el.style.getPropertyValue("--lg-lx"), "");
});

test("a finger's press (the pool only) does not take the control from the room", async () => {
  const { watchLiquidLight, LIT_ATTRIBUTE } = await load();
  const page = fakePage();
  const stop = watchLiquidLight(page.doc);
  page.run(0);
  const [a, b] = page.lit;
  page.see([a, b], true);
  page.fire("view:wheel", { deltaY: 120 });
  page.run(90);
  const leaned = a.style.getPropertyValue("--lg-ly");
  assert.notEqual(leaned, "");
  // A tap writes the pool where the finger landed (liquid-glass.ts), and
  // keeps it for a while after the release.
  a.style.setProperty("--lg-px", "40%");
  page.fire("view:wheel", { deltaY: 360 });
  page.run(90);
  assert.equal(a.style.getPropertyValue("--lg-ly"), b.style.getPropertyValue("--lg-ly"));
  // Back at rest, the tapped control's lean comes off too (never stranded).
  page.run(2000);
  assert.equal(a.style.getPropertyValue("--lg-lx"), "");
  assert.equal(a.style.getPropertyValue("--lg-ly"), "");
  assert.ok(!a.hasAttribute(LIT_ATTRIBUTE));
  assert.equal(a.style.getPropertyValue("--lg-px"), "40%");
  stop();
});

test("the lit list covers every rule lit by the room, and the surfaces' tokens follow it", async () => {
  const { LIT_EXTRAS } = await load();
  // Every selector the sheets light by --lg-lx outside the controls' list.
  const selects = controls.match(/5\. Styled selects[\s\S]*?:is\(([\s\S]*?)\):not\(\[multiple\]\)/)[1];
  for (const s of selects.split(",").map((x) => x.trim()).filter(Boolean)) assert.ok(LIT_EXTRAS.includes(s), s);
  const list = (name) =>
    surfaces
      .match(new RegExp(`/\\* lgs:${name} \\*/([\\s\\S]*?)/\\* /lgs:${name} \\*/`))[1]
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean);
  for (const s of [...list("frames"), ...list("panels"), ".saga-cinema .toast"]) assert.ok(LIT_EXTRAS.includes(s), s);
  assert.match(glassLib, /"\.zeus-button",/);
  // The lit tokens are declared again on what carries the light, economy too.
  const clean = surfaces.replace(/\/\*[\s\S]*?\*\//g, "");
  assert.match(
    clean,
    /html\[data-button-style="liquid"\],\s*html\[data-button-style="liquid"\] \[data-lg-lit\] \{\s*--lgs-frame:[\s\S]*?--lgs-panel:[^}]*\}/,
  );
  assert.match(
    clean,
    /html\[data-button-style="liquid"\]\[data-world-effects="economy"\],\s*html\[data-button-style="liquid"\]\[data-world-effects="economy"\] \[data-lg-lit\] \{\s*--lgs-frame:[\s\S]*?--lgs-panel:[^}]*\}/,
  );
  // Only the lit tokens there: the bars' and blur tokens stay on <html>.
  const litRule = clean.match(/\[data-lg-lit\] \{([^}]*)\}/)[1];
  assert.doesNotMatch(litRule, /--lgs-(bar|blur|dim|sat|ink|well|radius)/);
  // Nothing writes the light on the root any more.
  assert.doesNotMatch(source, /root\.style\.(setProperty|removeProperty)\("--lg-l[xy]"/);
  assert.doesNotMatch(source, /documentElement\.style/);
});
