import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

/* The sovereign file (/managers/zeus, src/styles-sovereign-file.css): the
   rank-I file in its own gold edition. The sheet is linked on the Zeus
   route only and stays in the document after a visit (React keeps route
   stylesheets), so it is scoped to the sovereign <main> and names its
   keyframes sv-*. It adds no text, keeps every label at 12px or larger,
   retires the old loops, and its motion is finite or scroll-linked, uses
   only opacity, transforms and clip-path, and is gated: the arrival on the
   load gate's hand-over, reduced motion and economy rendering; the
   scroll-linked layer also on the side menu, loading covers and dialogs.
   Forced colours get plain ink and opaque plates. */

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const stripComments = (source) => source.replace(/\/\*[\s\S]*?\*\//g, "");
const flat = (text) =>
  text.replace(/\s+/g, " ").replace(/\(\s+/g, "(").replace(/\s+\)/g, ")").trim();

// Style rules with their at-rule context, and keyframe blocks by name.
function parse(source) {
  const css = stripComments(source);
  const rules = [];
  const keyframes = [];
  const stack = [];
  let prelude = "";
  for (let index = 0; index < css.length; index += 1) {
    const character = css[index];
    if (character === "{") {
      const head = flat(prelude);
      prelude = "";
      const frames = head.match(/^@keyframes\s+([\w-]+)$/);
      if (frames) {
        let depth = 1;
        let end = index + 1;
        for (; end < css.length && depth > 0; end += 1) {
          if (css[end] === "{") depth += 1;
          if (css[end] === "}") depth -= 1;
        }
        keyframes.push({ name: frames[1], body: css.slice(index + 1, end - 1) });
        index = end - 1;
        continue;
      }
      if (head.startsWith("@")) {
        stack.push(head);
        continue;
      }
      const end = css.indexOf("}", index);
      rules.push({ selector: head, body: css.slice(index + 1, end), context: [...stack] });
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

// Top-level selector list items (commas inside :is() and :not() stay put).
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

const source = await read("src/styles-sovereign-file.css");
const { rules, keyframes } = parse(source);
const moving = rules.filter(({ body }) => {
  const shorthand = declaration(body, "animation");
  return (
    (shorthand && !/^none$/.test(shorthand)) ||
    /animation-(name|delay|timeline|range)\s*:/.test(body)
  );
});
const scrollLinked = moving.filter(({ body }) => {
  const timeline = declaration(body, "animation-timeline");
  return timeline && !/^(?:auto|none)$/.test(timeline);
});
const timed = moving.filter((rule) => !scrollLinked.includes(rule));

test("the Zeus route links the sheet last, after the World sheets, and no other route does", async () => {
  const route = await read("src/routes/managers/zeus.tsx");
  assert.match(route, /import sovereignFileCssUrl from "@\/styles-sovereign-file\.css\?url";/);
  assert.match(
    route,
    /stylesheetLinks: \[\s*\.\.\.WORLD_STYLESHEET_LINKS,\s*\{ rel: "stylesheet", href: sovereignFileCssUrl \},?\s*\]/,
  );
  // The sovereign file keeps its own edition: not the dossier sheets.
  assert.doesNotMatch(route, /DOSSIER_STYLESHEET_LINKS|PICKUP_CINEMA/);
  assert.doesNotMatch(await read("src/lib/world-head.ts"), /sovereign/i);
});

test("every rule is scoped to the sovereign file, and every keyframe is sv-*", () => {
  const SCOPE =
    /^(?:html(?:\[[^\]]+\]|:not\([^)]*\))*\s+)?main\.manager-page\.is-sovereign(?=[\s:>.#[]|$)/;
  const ROOT =
    /^(?:html:has\(> body > main\.manager-page\.is-sovereign\)|body:has\(> main\.manager-page\.is-sovereign\))$/;
  assert.ok(rules.length > 150, String(rules.length));
  for (const { selector } of rules) {
    if (/^(from|to|\d+%)$/.test(selector)) continue;
    for (const part of splitTopLevel(selector)) {
      assert.ok(SCOPE.test(part) || ROOT.test(part), part);
    }
  }
  assert.ok(keyframes.length >= 15, String(keyframes.length));
  for (const { name } of keyframes) assert.match(name, /^sv-[a-z-]+$/, name);
  // Every played animation is one of this sheet's keyframes.
  const names = new Set(keyframes.map(({ name }) => name));
  for (const { selector, body } of moving) {
    const list = declaration(body, "animation");
    if (!list) continue;
    for (const layer of splitTopLevel(list)) {
      const name = layer.split(/\s+/)[0];
      assert.ok(names.has(name), `${selector}: ${name}`);
    }
  }
});

test("the sheet adds no text: generated content is empty or silent", () => {
  const values = [...stripComments(source).matchAll(/(?<![\w-])content:\s*([^;]+);/g)];
  assert.ok(values.length >= 10, String(values.length));
  for (const [, value] of values) {
    assert.ok(/^(?:""|none|"[^"]*"\s*\/\s*"")$/.test(value.trim()), value);
  }
});

test("every label is 12px or larger", () => {
  const sizes = [...stripComments(source).matchAll(/font-size:\s*([^;]+);/g)].map(([, value]) =>
    value.trim(),
  );
  assert.ok(sizes.length > 30, String(sizes.length));
  for (const value of sizes) {
    if (value === "0") continue; // a drawn ornament's reset (no glyphs)
    const floor =
      value.match(/^clamp\((\d+(?:\.\d+)?)px/)?.[1] ?? value.match(/^(\d+(?:\.\d+)?)px$/)?.[1];
    assert.ok(floor, `unrecognised font-size ${value}`);
    assert.ok(Number(floor) >= 12, value);
  }
});

test("the old loops are retired and the scale bars rest drawn", () => {
  const css = stripComments(source);
  assert.doesNotMatch(css, /infinite|animation-iteration-count/);
  const still = (selectorPattern) =>
    rules.some(
      ({ selector, body, context }) =>
        selectorPattern.test(selector) &&
        /animation: none;/.test(body) &&
        !context.some((at) => at.startsWith("@media (prefers-reduced-motion")),
    );
  for (const pattern of [
    /\.sovereign-apex-seal$/,
    /\.dossier-identity \.manager-display-name$/,
    /\.sovereign-emblem > i$/,
    /\.sovereign-scale i$/,
    /\.sovereign-aura > i$/,
    /\.manager-portrait-column::before$/,
    /\.sovereign-portrait-effects::before$/,
    /\.sovereign-status::after$/,
    /^main\.manager-page\.is-sovereign::after$/,
  ]) {
    assert.ok(still(pattern), String(pattern));
  }
  const bars = rules.find(({ selector }) => /#dossier-profile \.sovereign-scale i$/.test(selector));
  assert.match(bars.body, /opacity: 1;/);
  assert.match(bars.body, /transform: none;/);
});

test("the arrival waits for the hand-over, is finite and at rest by about 1.4s", () => {
  assert.ok(timed.length >= 20, String(timed.length));
  for (const { selector, body, context } of timed) {
    assert.ok(
      context.includes("@media (prefers-reduced-motion: no-preference)") ||
        context.some((at) => /^@media \(prefers-reduced-motion: no-preference\) and/.test(at)),
      selector,
    );
    for (const part of splitTopLevel(selector)) {
      assert.match(
        part,
        /^html:not\(\[data-world-effects="economy"\]\):not\(\[data-loading\]\)\s/,
        part,
      );
      // Not re-keyed to the side menu or dialogs: closing one must not replay it.
      assert.doesNotMatch(part, /data-side-menu-open|data-dialog-open/, part);
    }
    assert.doesNotMatch(body, /animation-timeline/);
  }
  // The first beat opens with the gate (entranceLead waits at most 160ms).
  assert.match(source, /--sv-arrive: 100ms;/);
  // Durations and delays: every beat ends by 1.4s after the hand-over.
  for (const { body } of timed) {
    const list = declaration(body, "animation");
    if (!list) continue;
    for (const layer of splitTopLevel(list)) {
      const duration = Number(layer.match(/\s(\d+)ms/)?.[1] ?? 0);
      const delay = Number(layer.match(/var\(--sv-arrive\) \+ (\d+)ms/)?.[1] ?? 0) + 100;
      assert.ok(duration > 0, layer);
      assert.ok(duration + delay <= 1400, `${layer}: ${duration + delay}ms`);
    }
  }
  for (const [, extra] of source.matchAll(
    /animation-delay: calc\(var\(--sv-arrive\) \+ (\d+)ms\)/g,
  )) {
    assert.ok(Number(extra) + 100 <= 1100, extra);
  }
  // The plate outranks the reader sheet's still image, and the name and the
  // strips drop their clip at rest (backwards fill), so no ghost is trimmed.
  assert.match(
    source,
    /#dossier-profile\s*\.manager-portrait-frame\s*> img \{\s*animation: sv-unveil [^;]*backwards;/,
  );
  assert.match(source, /animation: sv-inscribe [^;]*backwards;/);
  assert.match(source, /\.sovereign-dominance \{\s*animation: sv-strip [^;]*backwards;/);
});

test("the scroll-linked layer is gated and runs on named timelines only", () => {
  assert.ok(scrollLinked.length >= 8, String(scrollLinked.length));
  const declared = new Set(
    rules.flatMap(({ body }) =>
      [...body.matchAll(/(?:view|scroll)-timeline:\s*(--sv-[\w-]+)/g)].map((m) => m[1]),
    ),
  );
  // The root scroller is named once, on <html>, only while the file is mounted.
  const page = rules.find(({ body }) => /scroll-timeline:/.test(body));
  assert.equal(page.selector, "html:has(> body > main.manager-page.is-sovereign)");
  assert.match(page.body, /scroll-timeline: --sv-page block;/);
  for (const { selector, body, context } of scrollLinked) {
    assert.ok(
      context.some((at) => at.startsWith("@supports (animation-timeline: view())")),
      selector,
    );
    assert.ok(
      context.some((at) => at.startsWith("@media (prefers-reduced-motion: no-preference)")),
      selector,
    );
    for (const part of splitTopLevel(selector)) {
      assert.match(
        part,
        /^html:not\(\[data-world-effects="economy"\]\):not\(\[data-side-menu-open\]\):not\(\[data-loading\]\):not\(\[data-dialog-open\]\)\s/,
        part,
      );
    }
    for (const timeline of splitTopLevel(declaration(body, "animation-timeline"))) {
      assert.ok(timeline === "auto" || declared.has(timeline), `${selector}: ${timeline}`);
    }
  }
  // View timelines are named on their subjects (an anonymous view() would be
  // captured by a clipping ancestor), and declared under the same gate.
  for (const { selector, body } of rules.filter(({ body }) => /view-timeline:/.test(body))) {
    assert.match(declaration(body, "view-timeline"), /^--sv-[\w-]+ block$/, selector);
    assert.match(selector, /:not\(\[data-side-menu-open\]\)/, selector);
  }
});

test("keyframes animate only opacity, transforms and clip-path; scroll-linked ones never clip", () => {
  const scrollNames = new Set();
  for (const { body } of scrollLinked) {
    const layers = splitTopLevel(declaration(body, "animation") ?? "");
    const timelines = splitTopLevel(declaration(body, "animation-timeline"));
    layers.forEach((layer, index) => {
      if (!/^(?:auto|none)$/.test(timelines[index % timelines.length])) {
        scrollNames.add(layer.split(/\s+/)[0]);
      }
    });
  }
  assert.ok(scrollNames.size >= 5, [...scrollNames].join());
  for (const { name, body } of keyframes) {
    for (const [, property] of body.matchAll(/([a-z-]+)\s*:/g)) {
      assert.ok(
        ["opacity", "transform", "translate", "scale", "rotate", "clip-path"].includes(property),
        `${name}: ${property}`,
      );
      if (scrollNames.has(name)) assert.notEqual(property, "clip-path", name);
    }
  }
});

test("forced colours get plain ink, silent ornaments and opaque plates; focus is the warm ring", () => {
  const forced = rules.filter(({ context }) => context.includes("@media (forced-colors: active)"));
  const inForced = (pattern) => forced.find(({ selector }) => pattern.test(selector));
  const ink = inForced(/\.manager-display-name/);
  assert.ok(ink, "gradient text");
  for (const target of [
    ".sovereign-dominance b",
    ".sovereign-apex-seal strong",
    ".sovereign-emblem > span",
  ]) {
    assert.ok(ink.selector.includes(target), target);
  }
  assert.match(ink.body, /color: CanvasText;/);
  assert.match(ink.body, /-webkit-text-fill-color: CanvasText;/);
  assert.match(ink.body, /background: none;/);
  const outlined = inForced(/\.manager-copy-heading > span/);
  assert.match(outlined.selector, /\.manager-section-index > span/);
  assert.match(outlined.selector, /\.dossier-contents-number/);
  assert.match(outlined.body, /-webkit-text-stroke: 0;/);
  assert.match(inForced(/\.manager-topbar$/).body, /background: Canvas;/);
  assert.match(inForced(/> \.dossier-reader$/).body, /background-color: Canvas;/);
  assert.match(inForced(/a\[aria-current\]$/).body, /background: Highlight;/);
  assert.match(inForced(/\.sovereign-portrait-effects/).body, /display: none;/);
  // One warm focus ring on every control of the file.
  const focus = rules.find(({ selector }) => selector.includes(":focus-visible"));
  assert.match(focus.body, /outline: 2px solid var\(--sv-focus\);/);
  assert.match(source, /--sv-focus: #fff0b5;/);
  for (const control of [
    ".brand",
    ".manager-back",
    ".dossier-read-link",
    ".dossier-reader-links a",
    ".dossier-contents > a",
    ".manager-pagination a",
  ]) {
    assert.ok(focus.selector.includes(control), control);
  }
});
