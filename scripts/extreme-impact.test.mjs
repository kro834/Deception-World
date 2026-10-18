import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { BEATS, formatTally, mountExtremeImpact, parseTally } from "../src/lib/extreme-impact.js";

/* IMPACT (rx11) on /extreme-saga: src/styles-extreme-impact.css, the hit
   engine src/lib/extreme-impact.js and the hidden drawings and tallies in
   the component. These pins keep it safe: where the sheet loads and what
   it may select; that scroll-linked motion rides named timelines behind
   every gate and the pinned stage is layout that no lock moves; that every
   time-based beat plays from a one-shot key behind the same gates and
   ends by 2 s; what keyframes touch (no flash pair beyond one); the 12px
   floor, silent ornaments, no blur, glow or blend; the forced-colours and
   reduced-motion paths; that every tally is a silent copy of the owner's
   figure; and the engine's lifecycle. */

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const strip = (css) => css.replace(/\/\*[\s\S]*?\*\//g, "");
const source = read("src/styles-extreme-impact.css");
const css = strip(source);
const route = read("src/routes/extreme-saga.tsx");
const component = read("src/components/extreme-saga/extreme-saga.tsx");
const art = read("src/components/extreme-saga/extreme-impact-art.tsx");

// Style rules with their at-rule context, and keyframe blocks by name.
function parse(text) {
  const body = strip(text);
  const flat = (value) =>
    value.replace(/\s+/g, " ").replace(/\(\s+/g, "(").replace(/\s+\)/g, ")").trim();
  const rules = [];
  const keyframes = [];
  const stack = [];
  let prelude = "";
  for (let index = 0; index < body.length; index += 1) {
    const character = body[index];
    if (character === "{") {
      const head = flat(prelude);
      prelude = "";
      const frames = head.match(/^@keyframes\s+([\w-]+)$/);
      if (frames) {
        let depth = 1;
        let end = index + 1;
        for (; end < body.length && depth > 0; end += 1) {
          if (body[end] === "{") depth += 1;
          if (body[end] === "}") depth -= 1;
        }
        keyframes.push({ name: frames[1], body: body.slice(index + 1, end - 1) });
        index = end - 1;
        continue;
      }
      if (head.startsWith("@")) {
        stack.push(head);
        continue;
      }
      const end = body.indexOf("}", index);
      rules.push({ selector: head, body: body.slice(index + 1, end), context: [...stack] });
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

const declarations = (body, property) =>
  [...body.matchAll(new RegExp(`(?:^|;)\\s*${property}\\s*:\\s*([^;]+)`, "g"))].map((match) =>
    match[1].trim(),
  );

const { rules, keyframes } = parse(source);
const SCOPE =
  /^html(?:\[data-press-ready\])?\[data-family="special"\](?::not\(\[[^\]]+\]\)|\[[^\]]+\])* body \.rxs-page\.rxs-page\.exs-page(?:[\s[>:.#]|$)/;
const FULL_GATE =
  /^html\[data-family="special"\]:not\(\[data-world-effects="economy"\]\):not\(\[data-side-menu-open\]\):not\(\[data-loading\]\):not\(\[data-dialog-open\]\) body \.rxs-page\.rxs-page\.exs-page\[data-motion-ready="true"\]/;
const KEYS = /\[data-exi-(?:hit|landed|impact|pop|arrival)="true"\]/;
const timed = (body) =>
  declarations(body, "animation-timeline").some((value) =>
    splitTopLevel(value).some((layer) => !/^(?:auto|none)$/.test(layer)),
  );
const moving = (body) =>
  [...declarations(body, "animation"), ...declarations(body, "animation-name")].some(
    (value) => value !== "none",
  );

test("the sheet loads on /extreme-saga only, after the STAGE scenes and before the cinematic sheet", () => {
  assert.match(route, /import extremeImpactCssUrl from "@\/styles-extreme-impact\.css\?url";/);
  const links = route.slice(route.search(/links:\s*\[/));
  const stage = links.indexOf("href: stageExtremeCssUrl");
  const impact = links.indexOf("href: extremeImpactCssUrl");
  const cinematic = links.indexOf("CINEMATIC_STYLESHEET_LINK");
  assert.ok(stage > 0 && stage < impact && impact < cinematic);
  assert.equal(links.lastIndexOf('rel: "stylesheet"') < cinematic, true);
  for (const path of [
    "src/lib/world-head.ts",
    "src/routes/__root.tsx",
    "src/routes/world.tsx",
    "src/routes/rexonance-saga.tsx",
    "src/routes/final-stage.tsx",
    "src/routes/dream-chapter.tsx",
  ]) {
    assert.doesNotMatch(read(path), /extreme-impact|extremeImpact/, path);
  }
});

test("every rule is scoped to the special family and the doubled Extreme page", () => {
  assert.ok(rules.length > 80, String(rules.length));
  for (const { selector } of rules) {
    for (const part of splitTopLevel(selector)) assert.match(part, SCOPE, part);
  }
  // Never the nav, the side menu, the entry calls or the load gate.
  assert.doesNotMatch(
    css,
    /\.rxs-local-nav|\.rxs-menu-trigger|\.side-panel|#site-side-panel|\.rx-call|\.rx-suit|\.load-gate|\.fst-|\.rxs-rexonance-page/,
  );
  assert.doesNotMatch(css, /:has\(/);
});

test("keyframes are its own, move only opacity and transforms, end, and turn opacity once at most", () => {
  assert.ok(keyframes.length >= 25, String(keyframes.length));
  for (const { name, body } of keyframes) {
    assert.match(name, /^exi-/, name);
    const properties = new Set([...body.matchAll(/([\w-]+)\s*:/g)].map((match) => match[1]));
    for (const property of properties) {
      assert.ok(
        ["opacity", "transform", "translate", "scale", "rotate"].includes(property),
        `${name}: ${property}`,
      );
    }
    const opacities = [...body.matchAll(/opacity:\s*([^;]+);/g)].map((match) =>
      Number.parseFloat(match[1].replace(/^calc\(([\d.]+).*$/, "$1")),
    );
    let turns = 0;
    for (let index = 2; index < opacities.length; index += 1) {
      const before = Math.sign(opacities[index - 1] - opacities[index - 2]);
      const after = Math.sign(opacities[index] - opacities[index - 1]);
      if (before && after && before !== after) turns += 1;
    }
    assert.ok(turns <= 1, `${name}: ${opacities.join(" → ")}`);
  }
  assert.doesNotMatch(css, /\binfinite\b|animation-iteration-count/);
  // The only borrowed keyframes: the overdrive's cut, kept on the art it
  // already wipes (filled backwards, so nothing rests clipped).
  const used = new Set(
    rules.flatMap(({ body }) =>
      [...declarations(body, "animation"), ...declarations(body, "animation-name")].flatMap(
        (value) =>
          [...value.matchAll(/(?<![-\w])((?:exi|exo|ex|mx|sx|sc|dxs)-[\w-]+)/g)].map((m) => m[1]),
      ),
    ),
  );
  for (const name of used) {
    if (name.startsWith("exi-"))
      assert.ok(
        keyframes.some((frame) => frame.name === name),
        name,
      );
    else assert.equal(name, "exo-cut", name);
  }
  for (const { selector, body } of rules) {
    for (const value of declarations(body, "animation"))
      for (const layer of splitTopLevel(value))
        if (/\bexo-cut\b/.test(layer)) {
          assert.match(layer, /\bbackwards$/, layer);
          assert.match(selector, /#exs-stage-panel > figure\[data-exi-impact="true"\] > img$/);
        }
  }
});

test("time-based beats play from one-shot keys behind every gate and end by 2 s", () => {
  let beats = 0;
  for (const { selector, body, context } of rules) {
    if (!moving(body)) continue;
    const layers = splitTopLevel(
      declarations(body, "animation").at(-1) ?? declarations(body, "animation-name").at(-1),
    );
    const timelines = splitTopLevel(declarations(body, "animation-timeline").at(-1) ?? "auto");
    const timeLayers = layers.filter((_, index) =>
      /^(?:auto|none)$/.test(timelines[index % timelines.length]),
    );
    if (!timeLayers.length) continue;
    assert.ok(context.includes("@media (prefers-reduced-motion: no-preference)"), selector);
    for (const part of splitTopLevel(selector)) {
      assert.match(part, FULL_GATE, part);
      assert.match(part, KEYS, part);
    }
    const durations = declarations(body, "animation-duration").at(-1);
    const delays = declarations(body, "animation-delay").at(-1);
    timeLayers.forEach((layer, index) => {
      const own = [...layer.matchAll(/(\d+)ms/g)].map((match) => Number(match[1]));
      const duration =
        own[0] ??
        Number(/(\d+)ms/.exec(splitTopLevel(durations ?? "")[layers.indexOf(layer)] ?? "")?.[1]);
      const delay =
        own[1] ??
        Number(/(\d+)ms/.exec(splitTopLevel(delays ?? "")[layers.indexOf(layer)] ?? "")?.[1] ?? 0);
      assert.ok(Number.isFinite(duration), `${selector}: ${layer} (${index})`);
      assert.ok(duration <= 1500, `${selector}: ${layer}`);
      assert.ok(duration + delay <= 2000, `${selector}: ${layer}`);
      beats += 1;
    });
  }
  assert.ok(beats >= 15, String(beats));
  // Every key outlives the latest beat it starts.
  assert.ok(Object.values(BEATS).every((ms) => ms >= 500));
  assert.ok(BEATS.hit > 2000 && BEATS.arrival > 2000);
});

test("scroll-linked motion rides named timelines behind the full gate, with automatic durations", () => {
  let linked = 0;
  for (const { selector, body, context } of rules) {
    if (!timed(body) && !/view-timeline(?:-name)?\s*:/.test(body)) continue;
    assert.ok(
      context.some((at) => at.startsWith("@supports (animation-timeline: view())")),
      selector,
    );
    assert.ok(context.includes("@media (prefers-reduced-motion: no-preference)"), selector);
    for (const part of splitTopLevel(selector)) assert.match(part, FULL_GATE, part);
    const timelines = declarations(body, "animation-timeline");
    if (!timelines.length) continue;
    linked += 1;
    for (const timeline of splitTopLevel(timelines.at(-1)))
      assert.match(timeline, /^(?:--(?:exi|exo|sc)-[\w-]+|auto)$/, selector);
    for (const duration of splitTopLevel(declarations(body, "animation-duration").at(-1) ?? ""))
      assert.match(duration, /^(?:auto|\d+ms)$/, selector);
    assert.ok(declarations(body, "animation-duration").length, `${selector}: longhands`);
  }
  // rx11 review: the punch's throw and meter, the P14 core, the couplings and
  // the end card play on their hits (each scroll-linked animation restyles its
  // element every frame it is in range), so fewer ride the scroll.
  // rx15 (FIGHT CARD): the punch's cut, dash and speed lines play on the time's
  // hit (the stage no longer pins) and the form's dolly is gone (the duel's
  // seam is the form's motion), so only the cold open's depth rides the scroll.
  assert.ok(linked >= 3, String(linked));
  // Scroll-linked keyframes never repaint (no clip-path, colour or background anywhere here).
  assert.doesNotMatch(css, /@keyframes[^{]+\{[^@]*?(?:clip-path|background|color)\s*:/);
});

// rx15 (FIGHT CARD): the punch stage no longer pins. Its hold left frames of
// an empty lane after the punch was thrown; the one-two now lands on hits,
// the same with or without view timelines, and the page is a screen shorter.
test("the one-two plays on its hits: the punch stage holds no runway", () => {
  assert.equal(rules.filter(({ body }) => /position:\s*sticky|--exi-pin/.test(body)).length, 0);
  assert.doesNotMatch(css, /--exi-pin|--exi-punch|view-timeline:\s*--exi-stage/);
  assert.match(css, /--exi-stage: calc\(100svh - var\(--dxs-nav\)\);/);
  for (const [target, name] of [
    ["~ .exi-band::before", "exi-cut-across"],
    ["> strong", "exi-dash"],
    ["> .exi-streaks", "exi-streak-in"],
  ]) {
    const rule = rules.find(
      ({ selector, body }) =>
        selector.includes('article:nth-child(2)[data-exi-hit="true"]') &&
        selector.endsWith(target) &&
        declarations(body, "animation").some((value) => value.startsWith(`${name} `)),
    );
    assert.ok(rule, target);
    assert.ok(!timed(rule.body), target);
    assert.ok(!rule.context.some((at) => at.startsWith("@supports")), target);
  }
  // rx15 pass 2: the time follows the punch (data-exi-chain), and until its
  // hit the overdrive's dash on the same figure stands down; that dash's
  // timeline is gone, so it held the figure drawn over the wait.
  assert.match(
    component,
    /data-exi-hit=""\s+data-exi-line="mid"\s+data-exi-chain="380"\s*>\s*<i className="exi-streaks"/,
  );
  const standDown = rules.find(({ selector }) =>
    selector.endsWith('article:nth-child(2):not([data-exi-hit="true"]) > strong'),
  );
  assert.ok(standDown);
  assert.match(standDown.body, /^\s*animation: none;\s*$/);
  assert.match(standDown.selector, FULL_GATE);
});

test("unreached arrivals are held back only while the engine is armed", () => {
  const held = rules.filter(
    ({ body }) => /opacity:\s*0;/.test(body) && /data-exi-hit=""/.test(body + ""),
  );
  const holds = rules.filter(({ selector }) => /\[data-exi-hit=""\]/.test(selector));
  assert.ok(holds.length >= 2, String(holds.length + held.length));
  for (const { selector, context } of holds) {
    assert.ok(context.includes("@media (prefers-reduced-motion: no-preference)"), selector);
    for (const part of splitTopLevel(selector)) {
      assert.match(part, FULL_GATE, part);
      assert.match(part, /\[data-exi-armed="true"\]/, part);
    }
  }
});

test("12px floor, no !important, no blur, glow or blend, silent ornaments, one image pair", () => {
  assert.doesNotMatch(css, /font-size:\s*(?:[0-9]|1[01])(?:\.\d+)?px\b/);
  for (const [, size] of css.matchAll(/font(?:-size)?:\s*(?:\d{3}\s+)?(\d+(?:\.\d+)?)px/g))
    assert.ok(Number(size) >= 12, size);
  for (const [, min] of css.matchAll(/font(?:-size)?:\s*(?:\d{3}\s+)?clamp\((\d+(?:\.\d+)?)px/g))
    assert.ok(Number(min) >= 12, min);
  assert.doesNotMatch(
    css,
    /!important|blur\(|backdrop-filter|mix-blend-mode|text-shadow:(?!\s*none)/,
  );
  for (const value of declarations(css.replace(/\n/g, " "), "box-shadow"))
    assert.equal(value, "none", value);
  for (const [, value] of css.matchAll(/(?<![\w-])content:\s*([^;]+);/g))
    assert.match(value.trim(), /^(?:""|none)$/, value);
  const urls = [...css.matchAll(/url\(([^)]*)\)/g)].map((match) => match[1]).sort();
  assert.deepEqual(urls, [
    '"/saga-extreme-middle-20261006.webp"',
    '"/saga-extreme-ultra-20261006.jpeg"',
  ]);
  // The old form stands behind the cut: always the form being replaced.
  for (const { selector, body } of rules.filter(({ body }) => /url\(/.test(body))) {
    const form = selector.match(/figure\[data-form="(ultra|middle)"\]$/)?.[1];
    assert.ok(form, selector);
    assert.match(body, form === "ultra" ? /middle-20261006\.webp/ : /ultra-20261006\.jpeg/);
  }
  // Transitions only with motion allowed and outside economy rendering.
  for (const { selector, body, context } of rules) {
    if (!declarations(body, "transition").some((value) => value !== "none")) continue;
    assert.ok(
      context.some((at) => at.includes("(prefers-reduced-motion: no-preference)")),
      selector,
    );
    for (const part of splitTopLevel(selector))
      assert.match(
        part,
        /^html(?:\[data-press-ready\])?\[data-family="special"\]:not\(\[data-world-effects="economy"\]\)/,
        part,
      );
  }
});

test("forced colours and reduced transparency drop the ornaments and keep the figures", () => {
  const forced = css.slice(css.indexOf("@media (forced-colors: active)"));
  assert.ok(forced.length > 200);
  assert.match(
    forced,
    // (rx11 review: no afterimage copies any more, so no .exi-ghosts to drop.)
    /:is\(\.exi-rays, \.exi-streaks, \.exi-shards, \.exi-ring, \.exi-band, \.exi-tally\) \{\s*display: none;/,
  );
  assert.match(forced, /\.exi-figure > \.exi-real \{\s*opacity: 1;/);
  assert.match(forced, /figure\[data-form\] \{\s*background: Canvas;/);
  assert.match(forced, /::after \{\s*content: none;/);
  assert.match(css, /@media \(prefers-contrast: more\), \(prefers-reduced-transparency: reduce\)/);
});

test("every tally is a silent copy of the owner's figure, which stays in the text", () => {
  const tallies = [
    ...component.matchAll(
      /<(?:b|span) className="exi-figure">\s*<(b|span) className="exi-real">([^<{]+|\{[^}]+\})<\/\1>\s*<\1\s+className="exi-tally"\s+aria-hidden="true"\s+data-exi-tally=(?:"([^"]+)"|\{([^}]+)\})\s*\/>/g,
    ),
  ];
  assert.equal(tallies.length, 8);
  assert.equal((component.match(/data-exi-tally=/g) ?? []).length, 8);
  for (const [, , real, literal, expression] of tallies) {
    if (literal) assert.equal(literal, real.trim());
    else assert.equal(`{${expression}}`, real.trim());
  }
  for (const figure of ["205.6", "0.002", "20,000", "5,000"])
    assert.ok(component.includes(`data-exi-tally="${figure}"`));
  // A tally redraws the figure exactly at its end, zero-padded on the way.
  for (const value of [
    "205.6",
    "20,000",
    "5,000",
    "170.2%",
    "684.4%",
    "20,000%",
    "20.7%",
    "5,000%",
  ]) {
    const parts = parseTally(value);
    assert.equal(formatTally(parts, parts.value), value);
    assert.equal(formatTally(parts, 0).length, value.length);
  }
  // Ornaments are hidden and textless. (rx11 review: the text afterimages
  // were dropped; stopped mid-dash they read as extra digits, "00000.002".)
  for (const ornament of ["exi-ring", "exi-band"])
    assert.match(component, new RegExp(`className="${ornament}" aria-hidden="true"`));
  // Each drawing sits in a hidden HTML box that carries its class (the box
  // animates on the compositor; an SVG target with translate, scale or
  // rotate falls back to the main thread every frame).
  const drawings = [
    ...component.matchAll(
      /<i className="exi-(?:rays|streaks|shards)" aria-hidden="true"(?: data-exi-depth="[-\d.]+")?>\s*<svg\s([^>]*)>/g,
    ),
  ];
  assert.equal(drawings.length, 8);
  for (const [, attributes] of drawings) {
    assert.match(attributes, /aria-hidden="true"/);
    assert.match(attributes, /focusable="false"/);
    assert.doesNotMatch(attributes, /className/);
  }
  assert.doesNotMatch(component, /<svg\s+className="exi-/);
  assert.match(
    art,
    /<svg className="exi-defs" aria-hidden="true" focusable="false" width="0" height="0">/,
  );
  assert.match(component, /useEffect\(\(\) => mountExtremeImpact\(pageRef\.current\), \[\]\);/);
  // The pinned markup the earlier pins read is untouched.
  assert.match(
    component,
    /<section id="p14" className="rxs-p14 rxs-section exs-p14" aria-labelledby="exs-p14-title">/,
  );
  assert.match(component, /<div className="rxs-specs rxs-reveal">/);
});

/* ---------- The engine ---------- */

function eventTarget() {
  const listeners = new Map();
  return {
    listeners,
    addEventListener(name, callback) {
      if (!listeners.has(name)) listeners.set(name, new Set());
      listeners.get(name).add(callback);
    },
    removeEventListener(name, callback) {
      listeners.get(name)?.delete(callback);
      if (!listeners.get(name)?.size) listeners.delete(name);
    },
    emit(name, event = {}) {
      [...(listeners.get(name) || [])].forEach((callback) => callback(event));
    },
  };
}

// A small element tree with the selectors the engine uses.
class Node {
  getBoundingClientRect() {
    return { top: 100, bottom: 200 };
  }
  constructor(tag, attributes = {}, children = []) {
    Object.assign(this, eventTarget());
    this.nodeType = 1;
    this.tagName = tag.toUpperCase();
    this.attributes = new Map(Object.entries(attributes));
    this.children = [];
    this.parentElement = null;
    this.text = "";
    const values = new Map();
    const priorities = new Map();
    this.style = {
      getPropertyValue: (name) => values.get(name) || "",
      getPropertyPriority: (name) => priorities.get(name) || "",
      setProperty: (name, value, priority = "") => {
        values.set(name, value);
        priorities.set(name, priority);
      },
      removeProperty: (name) => {
        values.delete(name);
        priorities.delete(name);
      },
    };
    children.forEach((child) => this.append(child));
  }
  append(child) {
    child.parentElement = this;
    this.children.push(child);
    return child;
  }
  remove() {
    if (!this.parentElement) return;
    const siblings = this.parentElement.children;
    siblings.splice(siblings.indexOf(this), 1);
    this.parentElement = null;
  }
  contains(node) {
    return this === node || [...this.descendants()].includes(node);
  }
  set textContent(value) {
    this.text = value;
  }
  get textContent() {
    return this.text;
  }
  getAttribute(name) {
    return this.attributes.has(name) ? this.attributes.get(name) : null;
  }
  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }
  removeAttribute(name) {
    this.attributes.delete(name);
  }
  hasAttribute(name) {
    return this.attributes.has(name);
  }
  get classes() {
    return (this.getAttribute("class") || "").split(/\s+/).filter(Boolean);
  }
  matchesCompound(compound) {
    const pattern = /(\.[\w-]+)|(#[\w-]+)|(\[([\w-]+)(?:="([^"]*)")?\])|^([a-z]+)/g;
    let match;
    let consumed = 0;
    while ((match = pattern.exec(compound))) {
      consumed += match[0].length;
      if (match[1] && !this.classes.includes(match[1].slice(1))) return false;
      if (match[2] && this.getAttribute("id") !== match[2].slice(1)) return false;
      if (match[3]) {
        if (!this.hasAttribute(match[4])) return false;
        if (match[5] !== undefined && this.getAttribute(match[4]) !== match[5]) return false;
      }
      if (match[6] && this.tagName !== match[6].toUpperCase()) return false;
    }
    return consumed === compound.length;
  }
  matches(selector) {
    return splitTopLevel(selector).some((part) => {
      const is = part.match(/^:is\((.*)\)$/);
      return is ? this.matches(is[1]) : this.matchesCompound(part);
    });
  }
  get nextElementSibling() {
    const siblings = this.parentElement?.children ?? [];
    return siblings[siblings.indexOf(this) + 1] ?? null;
  }
  closest(selector) {
    if (this.matches(selector)) return this;
    return this.parentElement ? this.parentElement.closest(selector) : null;
  }
  *descendants() {
    for (const child of this.children) {
      yield child;
      yield* child.descendants();
    }
  }
  querySelectorAll(selector) {
    const found = new Set();
    for (const part of splitTopLevel(selector)) {
      const child = part.match(/^:scope > (.*)$/);
      const deep = part.match(/^:scope (.*)$/);
      if (child)
        this.children.filter((node) => node.matches(child[1])).forEach((node) => found.add(node));
      else
        for (const node of this.descendants())
          if (node.matches(deep ? deep[1] : part)) found.add(node);
    }
    return [...this.descendants()].filter((node) => found.has(node));
  }
  querySelector(selector) {
    return this.querySelectorAll(selector)[0] ?? null;
  }
}

const h = (tag, attributes, ...children) => new Node(tag, attributes, children);
const tallyRow = () =>
  h(
    "article",
    {},
    h(
      "b",
      { class: "exi-figure" },
      h("b", { class: "exi-real" }),
      h("b", { class: "exi-tally", "data-exi-tally": "170.2%" }),
    ),
  );

function setup({ reduced = false, fine = true, loading = false, saveData = false } = {}) {
  const frames = new Map();
  const timers = new Map();
  const observers = [];
  const watchers = [];
  const images = [];
  let serial = 0;
  let clock = 0;
  const media = (matches) => ({ ...eventTarget(), matches });
  const reducedMotion = media(reduced);
  const finePointer = media(fine);
  const connection = { ...eventTarget(), saveData, effectiveType: "4g" };
  const htmlElement = h("html", {});
  htmlElement.dataset = { worldEffects: "full" };
  if (loading) htmlElement.setAttribute("data-loading", "");
  const document = { ...eventTarget(), hidden: false, documentElement: htmlElement };
  const visual = h("div", { class: "rxs-hero-visual" });
  const rays = h("svg", { class: "exi-rays", "data-exi-depth": "-0.5" });
  const hero = h("section", { class: "rxs-hero exs-hero" }, rays, visual);
  const tally = (value) =>
    h(
      "b",
      { class: "exi-figure" },
      h("b", { class: "exi-real" }),
      h("b", { class: "exi-tally", "data-exi-tally": value }),
    );
  const heading = h("header", { class: "rxs-section-heading", "data-exi-hit": "" });
  const punch = h(
    "article",
    { "data-exi-hit": "", "data-exi-line": "mid" },
    h("strong", {}, tally("205.6")),
  );
  // rx15 pass 2: the time follows the punch as a combination.
  const time = h("article", {
    "data-exi-hit": "",
    "data-exi-line": "mid",
    "data-exi-chain": "380",
  });
  const comparison = h("div", {
    class: "rxs-comparison",
    "data-exi-hit": "",
    "data-exi-rekey": "",
  });
  const performance = h(
    "section",
    { class: "rxs-section", id: "performance" },
    heading,
    punch,
    time,
    comparison,
  );
  const rail = h("div", { class: "rxs-stage-tabs exs-stage-tabs", "data-stage": "middle" });
  const panel = h(
    "div",
    { id: "exs-stage-panel", "data-exi-warm": "/a.webp /b.jpeg" },
    h("figure", { "data-form": "middle" }),
  );
  const stages = h("section", { class: "rxs-section", id: "stages" }, rail, panel);
  const specs = h("div", { class: "rxs-specs" }, h("strong", {}, tally("20,000")));
  const system = h("section", { class: "rxs-section", id: "system" }, specs);
  const footer = h("footer", { class: "rxs-footer" });
  const page = h("main", { class: "rxs-page exs-page" }, hero, performance, stages, system, footer);
  page.ownerDocument = document;
  const environment = {
    ...eventTarget(),
    navigator: { connection },
    innerWidth: 1000,
    innerHeight: 800,
    scrollY: 0,
    performance: { now: () => clock },
    matchMedia: (query) => (query.includes("reduced-motion") ? reducedMotion : finePointer),
    requestAnimationFrame(callback) {
      frames.set(++serial, callback);
      return serial;
    },
    cancelAnimationFrame: (id) => frames.delete(id),
    setTimeout(callback, ms) {
      timers.set(++serial, { callback, at: clock + ms });
      return serial;
    },
    clearTimeout: (id) => timers.delete(id),
    IntersectionObserver: class {
      constructor(callback, options) {
        this.callback = callback;
        this.options = options;
        this.targets = new Set();
        this.disconnected = false;
        observers.push(this);
      }
      observe(target) {
        this.targets.add(target);
      }
      unobserve(target) {
        this.targets.delete(target);
      }
      disconnect() {
        this.disconnected = true;
        this.targets.clear();
      }
    },
    MutationObserver: class {
      constructor(callback) {
        this.callback = callback;
        this.disconnected = false;
        watchers.push(this);
      }
      observe(target, options) {
        this.target = target;
        this.options = options;
      }
      disconnect() {
        this.disconnected = true;
      }
    },
    Image: class {
      constructor() {
        images.push(this);
      }
      decode() {
        return Promise.resolve();
      }
    },
  };
  const live = (filter) =>
    observers.filter((observer) => !observer.disconnected && filter(observer));
  return {
    environment,
    document,
    htmlElement,
    page,
    hero,
    visual,
    rays,
    heading,
    punch,
    time,
    comparison,
    panel,
    rail,
    specs,
    stages,
    reducedMotion,
    finePointer,
    connection,
    frames,
    timers,
    observers,
    watchers,
    images,
    mount: () => mountExtremeImpact(page, environment),
    tick(ms) {
      clock += ms;
      for (const [id, timer] of [...timers]) {
        if (timer.at <= clock) {
          timers.delete(id);
          timer.callback();
        }
      }
    },
    flush(times = 1) {
      for (let i = 0; i < times; i++) {
        const pending = [...frames.values()];
        frames.clear();
        pending.forEach((callback) => callback(clock));
      }
    },
    // Bring every observed element of a line into view.
    reach(target) {
      for (const observer of live((o) => o.targets.has(target)))
        observer.callback([{ target, isIntersecting: true }], observer);
    },
    heroInView(visible = true) {
      for (const observer of live((o) => o.targets.has(hero)))
        observer.callback([{ target: hero, isIntersecting: visible }], observer);
    },
    mutate(target, records) {
      watchers
        .filter((w) => !w.disconnected && w.target === target)
        .forEach((w) => w.callback(records));
    },
    live,
  };
}

test("the engine arms the page, keys scenes it owns and lands a hit once, as a one-shot key", () => {
  const t = setup();
  const cleanup = t.mount();
  assert.equal(t.page.getAttribute("data-exi-armed"), "true");
  // The scenes whose opening tags are pinned are keyed by the engine itself.
  for (const scene of [t.stages, t.specs, t.page.children[4]])
    assert.equal(scene.getAttribute("data-exi-hit"), "");
  // The arrival is keyed with the page shown at the top.
  assert.equal(t.page.getAttribute("data-exi-arrival"), "true");
  t.tick(BEATS.arrival);
  assert.equal(t.page.getAttribute("data-exi-arrival"), "done");
  // Two trigger lines (beside the art warm-up's wide margin).
  const lines = t
    .live((o) => /-20%|-96px/.test(o.options?.rootMargin ?? ""))
    .map((o) => o.options.rootMargin)
    .sort();
  assert.deepEqual(lines, ["0px 0px -20% 0px", "0px 0px -96px 0px"]);
  t.reach(t.heading);
  assert.equal(t.heading.getAttribute("data-exi-hit"), "true");
  t.tick(BEATS.hit);
  assert.equal(t.heading.getAttribute("data-exi-hit"), "done");
  // Unobserved after landing: a second crossing does nothing.
  assert.equal(t.live((o) => o.targets.has(t.heading)).length, 0);
  cleanup();
});

// rx15 pass 2: ROUND 1 lands as a one-two. The time used to answer only to
// its own line, so a slow scroll showed it before the punch; it now follows
// the punch by its own delay, and is still keyed by its line if reached first.
test("a chained hit follows the one before it once, by its own delay, and never replays", () => {
  const t = setup();
  const cleanup = t.mount();
  const mid = () => t.live((o) => /-96px/.test(o.options?.rootMargin ?? ""))[0];
  assert.ok(mid().targets.has(t.time));
  t.reach(t.punch);
  assert.equal(t.punch.getAttribute("data-exi-hit"), "true");
  assert.equal(t.time.getAttribute("data-exi-hit"), "");
  t.tick(379);
  assert.equal(t.time.getAttribute("data-exi-hit"), "");
  t.tick(1);
  assert.equal(t.time.getAttribute("data-exi-hit"), "true");
  // Landed by the chain: its own line no longer watches it.
  assert.equal(mid().targets.has(t.time), false);
  t.tick(BEATS.hit);
  assert.equal(t.time.getAttribute("data-exi-hit"), "done");
  cleanup();

  const offscreen = setup();
  const cleanupOffscreen = offscreen.mount();
  offscreen.time.getBoundingClientRect = () => ({ top: 900, bottom: 1100 });
  offscreen.reach(offscreen.punch);
  offscreen.tick(380);
  assert.equal(
    offscreen.time.getAttribute("data-exi-hit"),
    "",
    "the phone's second hit waits until it is visible",
  );
  offscreen.reach(offscreen.time);
  assert.equal(offscreen.time.getAttribute("data-exi-hit"), "true");
  cleanupOffscreen();

  // Reached first on its own line, it lands there and the punch does not re-key it.
  const u = setup();
  const cleanupU = u.mount();
  u.reach(u.time);
  assert.equal(u.time.getAttribute("data-exi-hit"), "true");
  u.tick(BEATS.hit);
  u.reach(u.punch);
  u.tick(400);
  assert.equal(u.time.getAttribute("data-exi-hit"), "done");
  cleanupU();

  // A hidden page drops the pending follow-up; the time waits for its line again.
  const v = setup();
  const cleanupV = v.mount();
  v.reach(v.punch);
  v.document.hidden = true;
  v.document.emit("visibilitychange");
  v.tick(400);
  assert.equal(v.time.getAttribute("data-exi-hit"), "");
  v.document.hidden = false;
  v.document.emit("visibilitychange");
  assert.ok(v.live((o) => o.targets.has(v.time)).length > 0);
  cleanupV();
  assert.equal(v.timers.size, 0);
});

test("a tally counts up from zero over the owner's figure, lands on it and never runs twice", () => {
  const t = setup();
  const cleanup = t.mount();
  const figure = t.punch.querySelector(".exi-figure");
  const copy = figure.querySelector(".exi-tally");
  // Not reached yet: it waits at zero on its copy (never a final figure that jumps back).
  assert.equal(figure.getAttribute("data-exi-waiting"), "true");
  assert.equal(copy.textContent, "000.0");
  // The section around it landing does not start it: its own hit does.
  t.reach(t.page.querySelector("#performance"));
  assert.equal(figure.hasAttribute("data-exi-counting"), false);
  t.reach(t.punch);
  assert.equal(figure.getAttribute("data-exi-counting"), "true");
  assert.equal(figure.hasAttribute("data-exi-waiting"), false);
  assert.equal(copy.textContent, "000.0");
  t.tick(500);
  t.flush();
  assert.match(copy.textContent, /^\d{3}\.\d$/);
  assert.ok(Number(copy.textContent) > 100 && Number(copy.textContent) < 205.6);
  t.tick(700);
  t.flush();
  assert.equal(figure.hasAttribute("data-exi-counting"), false);
  assert.equal(copy.textContent, "");
  assert.equal(figure.getAttribute("data-exi-landed"), "true");
  t.tick(BEATS.landed);
  assert.equal(figure.getAttribute("data-exi-landed"), "done");
  assert.equal(t.frames.size, 0, "no frame is requested once every tally has landed");
  cleanup();
});

test("sub-tenth 3-decimal sprint times sweep down like a chronograph and clash rows replay their tallies", () => {
  const t = setup();
  const sprintFigure = h(
    "b",
    { class: "exi-figure" },
    h("b", { class: "exi-real" }),
    h("b", { class: "exi-tally", "data-exi-tally": "0.002" }),
  );
  t.time.append(h("strong", {}, sprintFigure));
  const clashRow = h(
    "article",
    { "data-exf-clash": "" },
    h(
      "strong",
      {},
      h(
        "span",
        { class: "exi-figure" },
        h("span", { class: "exi-real" }),
        h("span", { class: "exi-tally", "data-exi-tally": "0.002秒" }),
      ),
    ),
  );
  t.comparison.append(clashRow);
  const cleanup = t.mount();
  const sprintCopy = sprintFigure.querySelector(".exi-tally");
  assert.equal(sprintCopy.textContent, "0.000");
  t.reach(t.time);
  assert.equal(sprintFigure.getAttribute("data-exi-counting"), "true");
  t.tick(300);
  t.flush();
  assert.match(sprintCopy.textContent, /^0\.\d{3}$/);
  assert.ok(Number(sprintCopy.textContent) > 0.002 && Number(sprintCopy.textContent) < 0.999);
  t.tick(900);
  t.flush();
  assert.equal(sprintFigure.getAttribute("data-exi-landed"), "true");

  // When a comparator row clashes into view via data-exf-clash="true", its tally starts measuring.
  const rowFigure = clashRow.querySelector(".exi-figure");
  const rowCopy = clashRow.querySelector(".exi-tally");
  clashRow.setAttribute("data-exf-clash", "true");
  t.mutate(t.comparison, [{ type: "attributes", attributeName: "data-exf-clash", target: clashRow }]);
  assert.equal(rowFigure.getAttribute("data-exi-counting"), "true");
  t.tick(300);
  t.flush();
  assert.match(rowCopy.textContent, /^0\.\d{3}秒$/);
  cleanup();
});

test("rows re-keyed into a reached comparator replay their tallies; a waiting one does not", () => {
  const t = setup();
  const cleanup = t.mount();
  const row = () =>
    h(
      "article",
      {},
      h(
        "span",
        { class: "exi-figure" },
        h("span", { class: "exi-real" }),
        h("span", { class: "exi-tally", "data-exi-tally": "170.2%" }),
      ),
    );
  const early = row();
  t.comparison.append(early);
  t.mutate(t.comparison, [{ addedNodes: [early] }]);
  assert.equal(early.querySelector(".exi-figure").hasAttribute("data-exi-counting"), false);
  t.reach(t.comparison);
  const later = row();
  t.comparison.append(later);
  t.mutate(t.comparison, [{ addedNodes: [later] }]);
  assert.equal(later.querySelector(".exi-figure").getAttribute("data-exi-counting"), "true");
  assert.equal(later.querySelector(".exi-tally").textContent, "000.0%");
  cleanup();
});

test("replacing comparison rows immediately releases waiting and active tally copies", () => {
  const t = setup({ fine: false });
  const cleanup = t.mount();
  t.tick(BEATS.arrival);
  const retired = [];
  for (let index = 0; index < 50; index += 1) {
    const row = t.comparison.append(tallyRow());
    const figure = row.querySelector(".exi-figure");
    const copy = row.querySelector(".exi-tally");
    t.mutate(t.comparison, [{ addedNodes: [row] }]);
    assert.equal(figure.getAttribute("data-exi-waiting"), "true");
    row.remove();
    t.mutate(t.comparison, [{ addedNodes: [], removedNodes: [row] }]);
    assert.equal(figure.hasAttribute("data-exi-waiting"), false);
    assert.equal(copy.textContent, "");
    copy.textContent = "released";
    retired.push(copy);
  }
  t.reach(t.comparison);
  t.tick(BEATS.hit);
  const active = t.comparison.append(tallyRow());
  t.mutate(t.comparison, [{ addedNodes: [active] }]);
  const figure = active.querySelector(".exi-figure");
  const copy = active.querySelector(".exi-tally");
  assert.equal(t.frames.size, 1);
  assert.equal(figure.getAttribute("data-exi-counting"), "true");
  active.remove();
  t.mutate(t.comparison, [{ removedNodes: [active], addedNodes: [] }]);
  assert.equal(t.frames.size, 0, "the last removed tally releases its scheduled frame");
  assert.equal(figure.hasAttribute("data-exi-counting"), false);
  assert.equal(copy.textContent, "");
  assert.equal(t.timers.size, 0);
  copy.textContent = "released";
  retired.push(copy);
  cleanup();
  for (const item of retired)
    assert.equal(item.textContent, "released", "no waiting tally retained until unmount");
});

test("removal retires landed tally timers and observed hits, including stale intersections", () => {
  const t = setup({ fine: false });
  const row = t.comparison.append(tallyRow());
  row.setAttribute("data-exi-hit", "");
  const cleanup = t.mount();
  t.tick(BEATS.arrival);
  const observer = t.live((item) => item.targets.has(row))[0];
  assert.ok(observer);
  row.remove();
  t.mutate(t.comparison, [{ removedNodes: [row], addedNodes: [] }]);
  assert.equal(observer.targets.has(row), false);
  observer.callback([{ target: row, isIntersecting: true }], observer);
  assert.equal(row.getAttribute("data-exi-hit"), "");
  assert.equal(t.frames.size, 0);
  t.reach(t.comparison);
  t.tick(BEATS.hit);
  const landed = t.comparison.append(tallyRow());
  t.mutate(t.comparison, [{ addedNodes: [landed] }]);
  t.tick(900);
  t.flush();
  const figure = landed.querySelector(".exi-figure");
  assert.equal(figure.getAttribute("data-exi-landed"), "true");
  assert.equal(t.timers.size, 1);
  landed.remove();
  t.mutate(t.comparison, [{ removedNodes: [landed], addedNodes: [] }]);
  assert.equal(t.timers.size, 0);
  assert.equal(figure.getAttribute("data-exi-landed"), "done");
  cleanup();
});

test("a re-key batch ignores intermediate rows that are already removed", () => {
  const t = setup();
  const cleanup = t.mount();
  const intermediate = tallyRow();
  const final = t.comparison.append(tallyRow());
  t.mutate(t.comparison, [
    { addedNodes: [intermediate], removedNodes: [] },
    { addedNodes: [final], removedNodes: [intermediate] },
  ]);
  assert.equal(intermediate.querySelector(".exi-figure").hasAttribute("data-exi-waiting"), false);
  assert.equal(final.querySelector(".exi-figure").getAttribute("data-exi-waiting"), "true");
  cleanup();
});

test("a hit moved within the page keeps its pending observer and tally", () => {
  const t = setup({ fine: false });
  const row = t.comparison.append(tallyRow());
  row.setAttribute("data-exi-hit", "");
  const cleanup = t.mount();
  const observer = t.live((item) => item.targets.has(row))[0];
  row.remove();
  t.comparison.append(row);
  t.mutate(t.comparison, [
    { removedNodes: [row], addedNodes: [] },
    { removedNodes: [], addedNodes: [row] },
  ]);
  assert.equal(observer.targets.has(row), true);
  assert.equal(row.querySelector(".exi-figure").getAttribute("data-exi-waiting"), "true");
  t.reach(row);
  assert.equal(row.querySelector(".exi-figure").getAttribute("data-exi-counting"), "true");
  cleanup();
});

test("a change of form keys the new figure only after a reader's cut, and the rail pops", () => {
  const t = setup();
  const cleanup = t.mount();
  const first = h("figure", { "data-form": "ultra" });
  t.panel.append(first);
  t.mutate(t.panel, [{ addedNodes: [first] }]);
  assert.equal(first.hasAttribute("data-exi-impact"), false, "no impact without data-exo-cut");
  t.panel.setAttribute("data-exo-cut", "true");
  const cut = h("figure", { "data-form": "ultra" });
  t.panel.append(cut);
  t.mutate(t.panel, [{ addedNodes: [cut] }]);
  assert.equal(cut.getAttribute("data-exi-impact"), "true");
  t.tick(BEATS.impact);
  assert.equal(cut.getAttribute("data-exi-impact"), "done");
  t.mutate(t.rail, [{ attributeName: "data-stage" }]);
  assert.equal(t.rail.getAttribute("data-exi-pop"), "true");
  t.tick(BEATS.pop);
  assert.equal(t.rail.getAttribute("data-exi-pop"), "done");
  // The component's own timing is untouched: the engine never writes data-stage or the cut flag.
  assert.equal(t.rail.getAttribute("data-stage"), "middle");
  cleanup();
});

test("replaced form figures release their impact timers, even when a cut is no longer active", () => {
  const t = setup({ fine: false });
  const cleanup = t.mount();
  t.tick(BEATS.arrival);
  t.panel.setAttribute("data-exo-cut", "true");
  const figure = t.panel.append(h("figure", { "data-form": "ultra" }));
  t.mutate(t.panel, [{ addedNodes: [figure] }]);
  assert.equal(t.timers.size, 1);
  t.panel.removeAttribute("data-exo-cut");
  figure.remove();
  t.mutate(t.panel, [{ removedNodes: [figure], addedNodes: [] }]);
  assert.equal(t.timers.size, 0);
  assert.equal(figure.getAttribute("data-exi-impact"), "done");
  cleanup();
});

test("reduced motion, economy and Save-Data disarm it; a lifted preference re-arms without remounting", () => {
  const t = setup({ reduced: true });
  const cleanup = t.mount();
  assert.equal(t.page.hasAttribute("data-exi-armed"), false);
  assert.equal(
    t.live((o) => o.options?.rootMargin && o.options.rootMargin !== "150% 0px 150% 0px").length,
    0,
  );
  t.reducedMotion.matches = false;
  t.reducedMotion.emit("change");
  assert.equal(t.page.getAttribute("data-exi-armed"), "true");
  t.reach(t.punch);
  assert.equal(t.punch.querySelector(".exi-figure").getAttribute("data-exi-counting"), "true");
  // Economy mid-count: the count finishes on the owner's figure at once,
  // and a figure still waiting shows its own figure again.
  const waiting = t.specs.querySelector(".exi-figure");
  assert.equal(waiting.getAttribute("data-exi-waiting"), "true");
  t.htmlElement.dataset.worldEffects = "economy";
  t.watchers.filter((w) => w.target === t.htmlElement).forEach((w) => w.callback([]));
  assert.equal(t.page.hasAttribute("data-exi-armed"), false);
  assert.equal(waiting.hasAttribute("data-exi-waiting"), false);
  assert.equal(waiting.querySelector(".exi-tally").textContent, "");
  const figure = t.punch.querySelector(".exi-figure");
  assert.equal(figure.hasAttribute("data-exi-counting"), false);
  assert.equal(figure.getAttribute("data-exi-landed"), "done");
  assert.equal(t.frames.size, 0);
  assert.equal(t.timers.size, 0);
  cleanup();
  const s = setup({ saveData: true });
  const stop = s.mount();
  assert.equal(s.page.hasAttribute("data-exi-armed"), false);
  assert.equal(
    s.observers.some((o) => o.options?.rootMargin === "150% 0px 150% 0px"),
    false,
    "no art warmed on Save-Data",
  );
  stop();
});

test("nothing is keyed behind the load gate's cover, and the arrival waits for the hand-over", () => {
  const t = setup({ loading: true });
  const cleanup = t.mount();
  assert.equal(t.page.getAttribute("data-exi-armed"), "true");
  assert.equal(t.page.hasAttribute("data-exi-arrival"), false);
  assert.equal(t.live((o) => /-20%|-96px/.test(o.options?.rootMargin ?? "")).length, 0);
  t.htmlElement.removeAttribute("data-loading");
  t.watchers.filter((w) => w.target === t.htmlElement).forEach((w) => w.callback([]));
  assert.equal(t.page.getAttribute("data-exi-arrival"), "true");
  assert.ok(t.live((o) => /-20%/.test(o.options?.rootMargin ?? "")).length > 0);
  cleanup();
});

test("a hidden tab and the bfcache suspend every beat; showing again resumes without duplicates", () => {
  const t = setup();
  const cleanup = t.mount();
  t.reach(t.punch);
  t.document.hidden = true;
  t.document.emit("visibilitychange");
  assert.equal(t.frames.size, 0);
  assert.equal(t.timers.size, 0);
  assert.equal(t.live((o) => /-20%|-96px/.test(o.options?.rootMargin ?? "")).length, 0);
  t.document.hidden = false;
  t.document.emit("visibilitychange");
  const lines = t.live((o) => /-20%|-96px/.test(o.options?.rootMargin ?? "")).length;
  assert.ok(lines >= 1);
  // The landed punch is not watched again.
  assert.equal(t.live((o) => o.targets.has(t.punch)).length, 0);
  t.environment.emit("pagehide");
  assert.equal(t.live((o) => /-20%|-96px/.test(o.options?.rootMargin ?? "")).length, 0);
  t.environment.emit("pageshow");
  t.environment.emit("pageshow");
  assert.equal(t.live((o) => /-20%|-96px/.test(o.options?.rootMargin ?? "")).length, lines);
  cleanup();
});

test("a fine pointer turns the hero's layers only while the hero is on screen, eased to rest", () => {
  const t = setup();
  const cleanup = t.mount();
  assert.equal(t.hero.listeners.has("pointermove"), false, "not before the hero is seen");
  t.heroInView(true);
  assert.equal(t.hero.listeners.get("pointermove").size, 1);
  t.hero.emit("pointermove", { pointerType: "mouse", clientX: 1000, clientY: 0 });
  t.hero.emit("pointermove", { pointerType: "mouse", clientX: 1000, clientY: 0 });
  assert.equal(t.frames.size, 1, "one frame per burst");
  t.flush();
  assert.match(
    t.visual.style.getPropertyValue("transform"),
    /^perspective\(1400px\) translate3d\([\d.]+px, -[\d.]+px, 0\) rotateY\([\d.]+deg\)/,
  );
  assert.match(
    t.rays.style.getPropertyValue("transform"),
    /^translate3d\(-[\d.]+px, [\d.]+px, 0\)$/,
  );
  // A touch never steers it.
  t.flush(80);
  const settled = t.visual.style.getPropertyValue("transform");
  t.hero.emit("pointermove", { pointerType: "touch", clientX: 0, clientY: 800 });
  assert.equal(t.frames.size, 0);
  assert.equal(t.visual.style.getPropertyValue("transform"), settled);
  // Leaving glides back to rest and stops asking for frames.
  t.hero.emit("pointerleave");
  t.flush(120);
  assert.equal(t.frames.size, 0);
  assert.match(t.visual.style.getPropertyValue("transform"), /translate3d\(0\.00px, 0\.00px, 0\)/);
  // Out of view or a coarse pointer: listeners off and the inline transforms restored.
  t.heroInView(false);
  assert.equal(t.hero.listeners.has("pointermove"), false);
  assert.equal(t.visual.style.getPropertyValue("transform"), "");
  t.heroInView(true);
  t.finePointer.matches = false;
  t.finePointer.emit("change");
  assert.equal(t.hero.listeners.has("pointermove"), false);
  cleanup();
});

test("the forms' art is warmed once when the stage comes near", async () => {
  const t = setup();
  const cleanup = t.mount();
  const warm = t.observers.find((o) => o.options?.rootMargin === "150% 0px 150% 0px");
  assert.ok(warm);
  assert.equal(t.images.length, 0);
  warm.callback([{ target: t.panel, isIntersecting: true }], warm);
  assert.deepEqual(
    t.images.map((image) => image.src),
    ["/a.webp", "/b.jpeg"],
  );
  assert.equal(warm.disconnected, true);
  warm.callback([{ target: t.panel, isIntersecting: true }], warm);
  t.connection.emit("change");
  assert.equal(t.images.length, 2, "queued deliveries and policy updates never warm twice");
  cleanup();
});

test("art warm-up pauses and re-arms for network, visibility, loading and bfcache gates", () => {
  const gates = [
    {
      name: "Save-Data",
      set: (t, blocked) => {
        t.connection.saveData = blocked;
      },
      emit: (t) => t.connection.emit("change"),
    },
    {
      name: "2g",
      set: (t, blocked) => {
        t.connection.effectiveType = blocked ? "2g" : "4g";
      },
      emit: (t) => t.connection.emit("change"),
    },
    {
      name: "hidden",
      set: (t, blocked) => {
        t.document.hidden = blocked;
      },
      emit: (t) => t.document.emit("visibilitychange"),
    },
    {
      name: "loading",
      set: (t, blocked) =>
        blocked
          ? t.htmlElement.setAttribute("data-loading", "")
          : t.htmlElement.removeAttribute("data-loading"),
      emit: (t) => t.mutate(t.htmlElement, []),
    },
    {
      name: "bfcache",
      set: (t, blocked) => t.environment.emit(blocked ? "pagehide" : "pageshow"),
      emit: (t) => t.connection.emit("change"),
    },
  ];
  for (const gate of gates) {
    const t = setup();
    const cleanup = t.mount();
    const warm = () => t.live((item) => item.options?.rootMargin === "150% 0px 150% 0px")[0];
    const first = warm();
    gate.set(t, true);
    // Deliver before the preference event too: callback-time policy matters.
    first.callback([{ target: t.panel, isIntersecting: true }], first);
    gate.emit(t);
    assert.equal(first.disconnected, true, gate.name);
    assert.equal(warm(), undefined, gate.name);
    assert.equal(t.images.length, 0, gate.name);
    gate.set(t, false);
    gate.emit(t);
    const resumed = warm();
    assert.ok(resumed && resumed !== first, gate.name);
    first.callback([{ target: t.panel, isIntersecting: true }], first);
    assert.equal(t.images.length, 0, `${gate.name}: old callback stays cancelled after resume`);
    resumed.callback([{ target: t.panel, isIntersecting: true }], resumed);
    assert.equal(t.images.length, 2, gate.name);
    cleanup();
  }
});

test("art does not arm behind initial gates, remains content under reduced motion, and cannot start after unmount", () => {
  for (const gate of ["loading", "hidden", "Save-Data"]) {
    const t = setup({ loading: gate === "loading", saveData: gate === "Save-Data" });
    t.document.hidden = gate === "hidden";
    const cleanup = t.mount();
    assert.equal(
      t.live((item) => item.options?.rootMargin === "150% 0px 150% 0px").length,
      0,
      gate,
    );
    cleanup();
  }
  for (const preference of ["reduced", "economy"]) {
    const t = setup({ reduced: preference === "reduced" });
    if (preference === "economy") t.htmlElement.dataset.worldEffects = "economy";
    const cleanup = t.mount();
    const warm = t.live((item) => item.options?.rootMargin === "150% 0px 150% 0px")[0];
    assert.ok(warm, "art is content rather than optional motion");
    warm.callback([{ target: t.panel, isIntersecting: true }], warm);
    assert.equal(t.images.length, 2);
    cleanup();
  }
  const t = setup();
  const cleanup = t.mount();
  const warm = t.live((item) => item.options?.rootMargin === "150% 0px 150% 0px")[0];
  const watcher = t.watchers.find((item) => item.target === t.comparison);
  cleanup();
  warm.callback([{ target: t.panel, isIntersecting: true }], warm);
  const row = t.comparison.append(tallyRow());
  watcher.callback([{ addedNodes: [row] }]);
  assert.equal(t.images.length, 0);
  assert.equal(t.frames.size, 0);
  assert.equal(row.querySelector(".exi-figure").hasAttribute("data-exi-waiting"), false);
});

test("unmount releases every listener, observer, frame and timer, and its own attributes", () => {
  const t = setup();
  const cleanup = t.mount();
  t.heroInView(true);
  t.reach(t.punch);
  t.hero.emit("pointermove", { pointerType: "mouse", clientX: 10, clientY: 10 });
  cleanup();
  cleanup();
  for (const target of [
    t.environment,
    t.document,
    t.reducedMotion,
    t.finePointer,
    t.connection,
    t.hero,
  ])
    assert.equal(target.listeners.size, 0);
  assert.equal(t.frames.size, 0);
  assert.equal(t.timers.size, 0);
  assert.ok(t.observers.every((o) => o.disconnected));
  assert.ok(t.watchers.every((w) => w.disconnected));
  assert.equal(t.page.hasAttribute("data-exi-armed"), false);
  assert.equal(t.stages.hasAttribute("data-exi-hit"), false, "engine-keyed scenes are released");
  assert.equal(t.visual.style.getPropertyValue("transform"), "");
  const figure = t.punch.querySelector(".exi-figure");
  assert.equal(figure.hasAttribute("data-exi-counting"), false);
});
