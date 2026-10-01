import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

/* Android restyle cost of the World sheets (2026-10-01).
   Chrome keeps ONE invalidation set for every compound written after a
   :has() (and its descendants) in any sheet, and replays it from each :has()
   anchor whose subtree changes. /world has <body> anchors
   (body:has(.load-gate) and others), so every DOM swap under <body> (poster
   autoplay, the 六詠 and rider tabs, a PROFILE toggle) restyled every element
   on the page that matched it. The refine round put `> h3`,
   `> summary::after`, .wa-quote, .wa-role and .wa-person after :has() in
   styles-world-annex.css: a swap restyled ~380 elements on a Pixel instead
   of ~160 (8-11 ms against 3-5 ms at 4x CPU). The wall now writes nothing
   after a :has() but a sibling, and its rules key on the element they style:
   - every :has() argument ends in a class, id or attribute (never `> h3`);
   - a :has() is on the element a rule styles (`.wa-person:not(:has(...))`,
     `.wa-role:not(:has(~ ...))`, `li:has(...)` only restyle themselves), or
     is followed by one sibling combinator to a class (`... ~ .wa-open`):
     sibling sets reach the anchor's own siblings, never <body>'s subtree;
   - the one exception is the desktop hover face (there since before the
     refine round; no Android phone matches its media query);
   - the other World sheets write nothing after a :has() at all. */

const read = (path) =>
  readFileSync(new URL(`../${path}`, import.meta.url), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

const SHEETS = [
  "src/styles-world-annex.css",
  "src/styles-world-refine.css",
  "src/styles-world-reveal.css",
  "src/styles-chrome-elevation.css",
];

/* Style rules with their at-rule context (whitespace normalised). */
function parse(text) {
  const rules = [];
  const stack = [];
  let start = 0;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === "{") {
      stack.push({ prelude: text.slice(start, i).trim().replace(/\s+/g, " ") });
      start = i + 1;
    } else if (ch === "}") {
      const block = stack.pop();
      if (!block.prelude.startsWith("@")) {
        rules.push({ selector: block.prelude, context: stack.map((entry) => entry.prelude) });
      }
      start = i + 1;
    } else if (ch === ";" && stack.length === 0) start = i + 1;
  }
  assert.equal(stack.length, 0, "balanced braces");
  return rules;
}

/* Split at top level (outside (), [] and quotes) where `at(text, i)` says so. */
function splitTop(text, at) {
  const parts = [];
  let depth = 0;
  let quote = null;
  let last = 0;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quote) {
      if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'") quote = ch;
    else if (ch === "(" || ch === "[") depth += 1;
    else if (ch === ")" || ch === "]") depth -= 1;
    else if (depth === 0) {
      const width = at(text, i);
      if (width) {
        parts.push(text.slice(last, i));
        last = i + width;
        i += width - 1;
      }
    }
  }
  parts.push(text.slice(last));
  return parts.map((part) => part.trim()).filter(Boolean);
}

const selectorList = (text) => splitTop(text, (s, i) => (s[i] === "," ? 1 : 0));

/* Compounds and combinators of one complex selector, in order. */
const tokens = (selector) =>
  splitTop(selector.replace(/\s*([>+~])\s*/g, " $1 "), (s, i) => (s[i] === " " ? 1 : 0));
const compounds = (selector) => tokens(selector).filter((part) => !/^[>+~]$/.test(part));

/* The compound's own (top-level) classes, ids and attributes. */
function features(compound) {
  const top = splitTop(compound, () => 0)[0] ?? "";
  let flat = "";
  let depth = 0;
  for (const ch of top) {
    if (ch === "(") depth += 1;
    if (depth === 0) flat += ch;
    if (ch === ")") depth -= 1;
  }
  return {
    classes: [...flat.matchAll(/\.([\w-]+)/g)].map((m) => m[1]),
    keyed: /[.#[]/.test(flat.replace(/::?[\w-]+/g, "")),
  };
}

/* Every :has(...) argument in a selector, nested ones included. */
function hasArguments(selector) {
  const out = [];
  let from = 0;
  for (;;) {
    const at = selector.indexOf(":has(", from);
    if (at < 0) return out;
    let depth = 0;
    let end = at + 4;
    for (; end < selector.length; end += 1) {
      if (selector[end] === "(") depth += 1;
      if (selector[end] === ")" && --depth === 0) break;
    }
    out.push(selector.slice(at + 5, end));
    from = at + 5;
  }
}

function audit(path) {
  const found = [];
  for (const rule of parse(read(path))) {
    for (const selector of selectorList(rule.selector)) {
      if (!selector.includes(":has(")) continue;
      for (const argument of hasArguments(selector)) {
        for (const relative of selectorList(argument)) {
          const tail = compounds(relative).at(-1);
          assert.ok(
            features(tail).keyed,
            `${path}: :has() argument ends in a bare element: ${selector}`,
          );
        }
      }
      // The compounds after the last one carrying a :has(), with the
      // combinator before each (" " for a descendant).
      const chain = [];
      let combinator = " ";
      for (const token of tokens(selector)) {
        if (/^[>+~]$/.test(token)) combinator = token;
        else {
          chain.push({ combinator, compound: token });
          combinator = " ";
        }
      }
      const anchor = chain.findLastIndex((part) => part.compound.includes(":has("));
      const after = chain.slice(anchor + 1);
      if (after.length) found.push({ selector, context: rule.context, after });
    }
  }
  return found;
}

test("every :has() argument in the World sheets ends in a class, id or attribute", () => {
  for (const path of SHEETS) audit(path);
});

test("the annex writes nothing after a :has() but one sibling", () => {
  // Pointing at OPEN DOSSIER brightens the face: desktop pointers only.
  const HOVER =
    ".site-shell.film-edition.mirage-edition .wa-person:has(.wa-open:hover) .wa-portrait img";
  const found = audit("src/styles-world-annex.css");
  const siblings = found.filter(({ selector }) => selector !== HOVER);
  assert.equal(found.length - siblings.length, 1, "the hover face");
  const hover = found.find(({ selector }) => selector === HOVER);
  assert.deepEqual(hover.context, ["@media (hover: hover) and (pointer: fine)"]);
  assert.ok(siblings.length > 0, "the opened file's exit follows its body");
  for (const { selector, after } of siblings) {
    assert.equal(after.length, 1, `more than one compound after :has(): ${selector}`);
    assert.match(after[0].combinator, /^[~+]$/, `descendant or child after :has(): ${selector}`);
    assert.ok(features(after[0].compound).keyed, `bare element after :has(): ${selector}`);
  }
});

test("the other World sheets write nothing after a :has()", () => {
  for (const path of SHEETS.slice(1)) assert.deepEqual(audit(path), [], path);
});

test("the wall's closed and opened files key on their own elements", () => {
  const css = read("src/styles-world-annex.css").replace(/\s+/g, " ");
  const S = ".site-shell.film-edition.mirage-edition";
  for (const selector of [
    `${S} .wa-person > .wa-portrait:has(~ :where(.wa-person-body) > .wa-profile[open])`,
    `${S} .wa-person > .wa-person-body:has(> .wa-profile[open])`,
    `${S} .wa-person .wa-person-body > .wa-profile[open]`,
    `${S} .wa-person-body:has(> .wa-profile[open]) ~ .wa-open`,
    `${S} .wa-person-body:has(> .wa-profile[open]) ~ .wa-open::after`,
    `${S} .wa-roster > li > .wa-person:not(:has(.wa-profile[open]))`,
    `${S} .wa-roster > li > .wa-person > .wa-portrait`,
    `${S} .wa-roster > li > .wa-person > .wa-person-body:not(:has(> .wa-profile[open]))`,
    `${S} .wa-roster > li > .wa-person > .wa-open`,
    `${S} .wa-roster > li > .wa-person .wa-person-body > .wa-profile:not([open])`,
    `${S} .wa-roster > li .wa-person-body > .wa-role:not(:has(~ .wa-profile[open]))`,
    `${S} .wa-roster > li .wa-person-body > h3`,
    `${S} .wa-roster > li .wa-person-body > .wa-quote:not(:has(~ .wa-profile[open]))`,
    `${S} .wa-person-body > .wa-quote:has(~ .wa-profile[open])`,
    `${S} .wa-person .wa-profile[open] .wa-quote`,
    `${S} .wa-person .wa-profile[open] > .wa-profile-body > .wa-quote`,
    `${S} .wa-roster .wa-person > .wa-person-body > .wa-profile[open] > summary::after`,
  ]) {
    assert.ok(css.includes(`${selector} {`) || css.includes(`${selector},`), selector);
  }
  // None of the wide forms come back: nothing is written after the file's or
  // the row's :has().
  assert.doesNotMatch(css, /\.wa-person:has\(\.wa-profile\[open\]\) [^{,]/);
  assert.doesNotMatch(
    css,
    /li(?::[\w-]+(?:\([^)]*\))?)*:not\(:has\(\.wa-profile\[open\]\)\) [^{,]/,
  );
});
