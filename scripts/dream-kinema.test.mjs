import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

/* Dream Kinema edition (rx3 dream, 2026-10-03): src/styles-dream-kinema.css,
   linked after the extra sheet and before the cinematic skin. The world guide
   (one indigo band for the four archive corners, their 01–04 index, the
   chronicle timeline, the atlas masonry, numbered arsenal entries), states for
   every control and a motion grammar of hanging, pressing and tying on named
   view timelines, plus the file's 襖 panels. This pins the presentation's
   safety: link order, scope, gating, keyframe properties, finite timings,
   silent generated numerals, the 12px floor, forced colours and the panels'
   inertness. Copy is pinned elsewhere (owner-copy, dream-expansion,
   dream-extra-data); the component files are not touched by this edition. */

const read = (path) =>
  readFileSync(new URL(`../${path}`, import.meta.url), "utf8").replaceAll("\r\n", "\n");
const strip = (css) => css.replace(/\/\*[\s\S]*?\*\//g, "");
const route = read("src/routes/dream-chapter.tsx");
const css = strip(read("src/styles-dream-kinema.css"));

const flat = (text) =>
  text.replace(/\s+/g, " ").replace(/\(\s+/g, "(").replace(/\s+\)/g, ")").trim();

// Style rules with their at-rule context; keyframe blocks by name.
function parse(source) {
  const rules = [];
  const keyframes = [];
  const stack = [];
  let prelude = "";
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (character === "{") {
      const head = flat(prelude);
      prelude = "";
      const frames = head.match(/^@keyframes\s+([\w-]+)$/);
      if (frames) {
        let depth = 1;
        let end = index + 1;
        for (; end < source.length && depth > 0; end += 1) {
          if (source[end] === "{") depth += 1;
          if (source[end] === "}") depth -= 1;
        }
        keyframes.push({ name: frames[1], body: source.slice(index + 1, end - 1) });
        index = end - 1;
        continue;
      }
      if (head.startsWith("@")) {
        stack.push(head);
        continue;
      }
      const end = source.indexOf("}", index);
      rules.push({ selector: head, body: flat(source.slice(index + 1, end)), context: [...stack] });
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

const { rules, keyframes } = parse(css);
const declaration = (body, property) =>
  body.match(new RegExp(`(?:^|;)\\s*${property}\\s*:\\s*([^;]+)`))?.[1].trim();

const FINITE_GATE = 'html:not([data-world-effects="economy"]) .dream-page.dream-page';
const FULL_GATE =
  'html:not([data-world-effects="economy"]):not([data-side-menu-open]):not([data-loading]):not([data-dialog-open]) .dream-page.dream-page';
const REDUCED = "@media (prefers-reduced-motion: no-preference)";
const SUPPORTS = "@supports (animation-timeline: --kn-leaf) and (animation-range: entry 0% entry 100%)";

test("the Kinema sheet loads after the extra sheet and before the cinematic skin, on Dream only", () => {
  assert.match(route, /import dreamKinemaCssUrl from "@\/styles-dream-kinema\.css\?url";/);
  const links = route.slice(route.search(/links:\s*\[/));
  const extra = links.indexOf("href: dreamExtraCssUrl");
  const kinema = links.indexOf("href: dreamKinemaCssUrl");
  const cinematic = links.indexOf("CINEMATIC_STYLESHEET_LINK");
  assert.ok(extra > 0 && kinema > extra && cinematic > kinema, `${extra} ${kinema} ${cinematic}`);
  for (const path of [
    "src/lib/world-head.ts",
    "src/routes/__root.tsx",
    "src/routes/world.tsx",
    "src/routes/rexonance-saga.tsx",
    "src/routes/extreme-saga.tsx",
    "src/routes/final-stage.tsx",
  ]) {
    assert.doesNotMatch(read(path), /dream-kinema|dreamKinema/, path);
  }
});

test("every rule is scoped to the Dream page or its gates", () => {
  assert.ok(rules.length > 60, String(rules.length));
  for (const { selector } of rules) {
    for (const part of splitTopLevel(selector)) {
      assert.match(
        part,
        /^(?:html(?:\[data-world-effects="economy"\]|:not\([^)]*\))*\s+)?\.dream-page\.dream-page\b/,
        part,
      );
    }
  }
  // Pseudo-elements never hide inside :is() (it would silently drop them).
  for (const { selector } of rules) {
    for (const inner of selector.matchAll(/:is\(([^)]*)\)/g)) {
      assert.doesNotMatch(inner[1], /::/, selector);
    }
  }
});

test("no small text, no !important, no images, no loops, no gesture or paint tricks", () => {
  for (const [, size] of css.matchAll(/font-size:\s*([^;]+);/g)) {
    const minimum = size.match(/^clamp\((\d+)px/)?.[1] ?? size.match(/^(\d+)px$/)?.[1];
    assert.ok(minimum != null && Number(minimum) >= 12, size);
  }
  assert.doesNotMatch(css, /!important|url\(|infinite|animation-iteration-count/);
  assert.doesNotMatch(css, /touch-action:|overscroll-behavior:|backdrop-filter:|filter:/);
  assert.doesNotMatch(css, /:has\(\s*dialog|data-rail-lock/);
  assert.doesNotMatch(css, /will-change/);
});

test("generated text is silent: HUD numerals and counters with an empty alternative", () => {
  for (const [, value] of css.matchAll(/(?<![\w-])content:\s*([^;]+);/g)) {
    assert.match(value.trim(), /^(?:""|"\d{2}" \/ ""|counter\(kn-[\w-]+, decimal-leading-zero\) \/ "")$/, value);
  }
  const index = rules
    .filter(({ body }) => /content: "\d{2}" \/ ""/.test(body))
    .map(({ selector, body }) => `${selector.match(/#(\w+)/)[1]}:${body.match(/"(\d{2})"/)[1]}`);
  assert.deepEqual(index, ["chronicle:01", "atlas:02", "relations:03", "arsenal:04"]);
});

test("keyframes move only opacity and transforms, and scroll-linked ones never clip or paint", () => {
  assert.ok(keyframes.length >= 10, String(keyframes.length));
  for (const { name, body } of keyframes) {
    assert.match(name, /^kn-/, name);
    const properties = new Set([...body.matchAll(/([\w-]+)\s*:/g)].map((match) => match[1]));
    for (const property of properties) {
      assert.ok(["opacity", "translate", "scale", "rotate"].includes(property), `${name}: ${property}`);
    }
  }
});

test("time-based motion is finite, gated by reduced motion and economy, and at rest within 0.8s", () => {
  const timed = rules.filter(
    ({ body }) => /animation:\s*kn-/.test(body) && !declaration(body, "animation-timeline"),
  );
  // The fold unrolling and the file's two panels.
  assert.ok(timed.length >= 2, String(timed.length));
  for (const { selector, body, context } of timed) {
    assert.deepEqual(context, [REDUCED], selector);
    for (const part of splitTopLevel(selector)) assert.ok(part.startsWith(FINITE_GATE), part);
    const [, duration, delay = "0"] = body.match(/animation:\s*kn-[\w-]+\s+(\d+)ms[^;]*?(?:\s(\d+)ms)?\s+(?:both|backwards)/);
    assert.ok(Number(duration) + Number(delay) <= 800, `${duration}+${delay}`);
  }
  // A fold's effect is released when it ends (no fill forwards on a list).
  const unroll = timed.find(({ selector }) => selector.includes(".dream-archive-fold[open]"));
  assert.match(unroll.body, /animation: kn-unroll 460ms var\(--ts-ease\) backwards;/);
  // Transitions ease only under the same gate, and only on scale, opacity or translate.
  for (const { selector, body, context } of rules) {
    const transition = declaration(body, "transition");
    if (!transition || transition === "none") continue;
    assert.deepEqual(context, [REDUCED], selector);
    assert.ok(selector.startsWith(FINITE_GATE), selector);
    for (const layer of splitTopLevel(transition)) {
      assert.match(layer, /^(?:scale|opacity|translate)\s/, layer);
    }
  }
});

test("scroll-linked motion runs on named timelines under the full gate", () => {
  const linked = rules.filter(({ body }) => declaration(body, "animation-timeline"));
  assert.ok(linked.length >= 10, String(linked.length));
  const names = new Set();
  for (const { selector, body, context } of linked) {
    assert.deepEqual(context, [REDUCED, SUPPORTS], selector);
    assert.ok(selector.startsWith(FULL_GATE), selector);
    const timeline = declaration(body, "animation-timeline");
    assert.match(timeline, /^--(?:kn-[\w-]+|ts-act|ts-in|ts-rise)$/, selector);
    assert.match(body, /animation: kn-[\w-]+ linear both;/, selector);
    assert.match(declaration(body, "animation-range"), /^(?:entry|cover) \d+% (?:entry|cover) \d+(?:%|px)$/, selector);
    names.add(body.match(/animation: (kn-[\w-]+)/)[1]);
  }
  assert.deepEqual(
    [...names].sort(),
    ["kn-brush", "kn-drawer", "kn-hang", "kn-lock", "kn-press", "kn-stamp", "kn-tie", "kn-unfurl"],
  );
  // Every view timeline this sheet declares is named, block-axis and fully gated.
  const declared = rules.filter(({ body }) => declaration(body, "view-timeline"));
  for (const { selector, body, context } of declared) {
    assert.deepEqual(context, [REDUCED, SUPPORTS], selector);
    assert.ok(selector.startsWith(FULL_GATE), selector);
    assert.match(declaration(body, "view-timeline"), /^--kn-[\w-]+ block$/, selector);
  }
  assert.doesNotMatch(css, /animation-timeline:\s*(?:view|scroll)\(/);
});

test("the file's 襖 panels are inert ornaments under the CLOSE plate and leave the screen", () => {
  const panels = rules.filter(({ selector }) => /\.dream-dossier-dialog\[open\]::(?:before|after)/.test(selector));
  const base = panels.find(({ body }) => body.includes("position: fixed"));
  assert.ok(base, "panel base rule");
  assert.deepEqual(base.context, [REDUCED]);
  assert.match(base.body, /pointer-events: none;/);
  assert.match(base.body, /content: "";/);
  // Below the fixed CLOSE plate (z-index 100 in the chapter sheet).
  assert.ok(Number(declaration(base.body, "z-index")) < 100);
  assert.match(base.body, /animation: kn-fusuma-left 620ms cubic-bezier\(0\.65, 0, 0\.2, 1\) 130ms both;/);
  const left = keyframes.find(({ name }) => name === "kn-fusuma-left");
  const right = keyframes.find(({ name }) => name === "kn-fusuma-right");
  assert.match(flat(left.body), /to \{ translate: -101% 0; \}/);
  assert.match(flat(right.body), /to \{ translate: 101% 0; \}/);
  // They exist only inside the motion gate: reduced motion and economy open the file as before.
  for (const { context } of panels) assert.deepEqual(context, [REDUCED]);
});

test("forced colours drop the band, the panels and the ornaments and keep the numerals legible", () => {
  const forced = rules.filter(({ context }) => context.includes("@media (forced-colors: active)"));
  const text = forced.map(({ selector, body }) => `${selector} { ${body} }`).join("\n");
  assert.match(text, /:is\(#chronicle, #atlas, #relations, #arsenal\) \{ border-image: none; \}/);
  for (const selector of [
    ".dream-page.dream-page #chronicle::before",
    ".dream-page.dream-page .dream-dossier-dialog::before",
    ".dream-page.dream-page .dream-dossier-dialog::after",
  ]) {
    assert.ok(text.includes(selector), selector);
  }
  assert.match(text, /\.dream-atlas-kicker::before[\s\S]*?-webkit-text-fill-color: CanvasText;/);
  assert.match(text, /\.dream-arsenal-list dt::before/);
  assert.match(text, /\.dream-chronicle-list::before \{ background: CanvasText; \}/);
});

test("the world guide: one band for the four corners, the timeline from 981px, balanced columns", () => {
  const ground = rules.find(
    ({ selector, context }) =>
      selector === ".dream-page.dream-page :is(#chronicle, #atlas, #relations, #arsenal)" && !context.length,
  );
  assert.match(ground.body, /border-image: linear-gradient\(var\(--kn-ai\) 0 0\) fill 0 \/ \/ 0 100vw;/);
  const timeline = rules.filter(({ context }) => context.includes("@media (min-width: 981px)"));
  const item = timeline.find(({ selector }) => selector === ".dream-page.dream-page .dream-chronicle-item");
  assert.match(item.body, /grid-template-areas: "meta seal title" "meta seal body";/);
  const atlas = rules.find(
    ({ selector, context }) =>
      selector === ".dream-page.dream-page .dream-atlas-grid > li" && context.includes("@media (min-width: 761px)"),
  );
  assert.match(atlas.body, /break-inside: avoid;/);
  // The arsenal's entries no longer stretch apart from their names.
  const entry = rules.find(
    ({ selector, context }) => selector === ".dream-page.dream-page .dream-arsenal-list > div" && !context.length,
  );
  assert.match(entry.body, /align-content: start;/);
});
