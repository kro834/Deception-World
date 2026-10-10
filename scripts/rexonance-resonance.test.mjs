import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  countTemplate,
  formatCount,
  mountRexonanceResonance,
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
const REDUCED = /prefers-reduced-motion:\s*no-preference/;
const SUPPORTS = /^@supports \(animation-timeline: view\(\)\) and \(animation-range: entry 0% entry 100%\)$/;
const FULL_GATE =
  /^html\[data-family="special"\]:not\(\[data-world-effects="economy"\]\):not\(\[data-side-menu-open\]\):not\(\[data-loading\]\):not\(\[data-dialog-open\]\) body \.rxs-page\.rxs-page\.rxs-rexonance-page\[data-motion-ready="true"\]/;
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
      assert.match(part, /\[data-rsn-(?:state|hit|pulse|arrive|form|in)/, part);
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
  // The script clears every flag after its hit has played.
  for (const flag of ["data-rsn-hit", "data-rsn-pulse", "data-rsn-arrive", "data-rsn-form", "data-rsn-in"]) {
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
  assert.doesNotMatch(selector, /data-side-menu-open|data-dialog-open|data-loading|data-motion-ready/);
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
    ["50,000", "<span>YOPS</span>"],
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
  // Every ornament the layer adds is hidden from assistive technology.
  for (const ornament of ["rsn-field", "rsn-form", "rsn-coda", "rsn-glint"]) {
    assert.match(page, new RegExp(`className="${ornament}" aria-hidden="true"`), ornament);
  }
  assert.match(page, /<div className="rxs-hero-visual" aria-hidden="true">[\s\S]*?<span className="rsn-depth">/);
  // One mount, never restarted by a form, menu or baseline change.
  assert.match(page, /useEffect\(\(\) => mountRexonanceResonance\(pageRef\.current\), \[\]\);/);
});

test("the counter prints the owner's figures at every step without reflowing", () => {
  const cases = [
    ["650", ["000", "325", "650"]],
    ["50,000", ["00,000", "25,000", "50,000"]],
    ["9,000", ["0,000", "4,500", "9,000"]],
    ["90%", ["00%", "45%", "90%"]],
    ["約0.06ms", ["約0.00ms", "約0.03ms", "約0.06ms"]],
  ];
  for (const [text, expected] of cases) {
    const template = countTemplate(text);
    assert.ok(template, text);
    const printed = [0, 0.5, 1].map((share) => formatCount(template, template.value * share));
    assert.deepEqual(printed, expected, text);
    for (const step of printed) assert.equal(step.length, text.length, text);
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
          node.attributes.get(`data-${String(key).replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`),
        set: (_, key, value) => {
          node.attributes.set(`data-${String(key).replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`, String(value));
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
      media(query.includes("reduce") ? reduced : query.includes("pointer: fine") ? fine : false, query),
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
  return { env, pageNode, html, document, figures, observers, mutationObservers, listeners, advance, frames, timers };
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
  assert.equal(cut.overlay.childNodes[0].data, "000");
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
  assert.match(t.pageNode.getAttribute("data-rsn-pulse"), /^[ab]$/);
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
