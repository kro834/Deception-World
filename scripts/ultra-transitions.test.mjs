import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { transform } from "lightningcss";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const css = read("src/styles-ultra-transitions.css");
const root = 'html[data-ultra-mode="on"][data-ultra-motion="on"]';

function styleRules(source) {
  const rules = [];
  const clean = source.replace(/\/\*[\s\S]*?\*\//g, "");
  const matchingBrace = (text, opening) => {
    let depth = 0;
    for (let index = opening; index < text.length; index++) {
      if (text[index] === "{") depth++;
      if (text[index] === "}" && --depth === 0) return index;
    }
    throw new Error("unclosed CSS block");
  };
  const visit = (text, context = []) => {
    let cursor = 0;
    while (cursor < text.length) {
      const opening = text.indexOf("{", cursor);
      if (opening < 0) break;
      const closing = matchingBrace(text, opening);
      const prelude = text.slice(cursor, opening).trim();
      const body = text.slice(opening + 1, closing);
      if (prelude.startsWith("@")) {
        if (!prelude.startsWith("@keyframes") && !prelude.startsWith("@-webkit-keyframes")) {
          visit(body, [...context, prelude]);
        }
      } else {
        rules.push({ selector: prelude, body: body.trim(), context });
      }
      cursor = closing + 1;
    }
  };
  visit(clean);
  return rules;
}

const splitSelectors = (selector) => {
  const parts = [];
  let depth = 0;
  let start = 0;
  for (let index = 0; index < selector.length; index++) {
    if (selector[index] === "(" || selector[index] === "[") depth++;
    if (selector[index] === ")" || selector[index] === "]") depth--;
    if (selector[index] === "," && depth === 0) {
      parts.push(selector.slice(start, index).trim());
      start = index + 1;
    }
  }
  return [...parts, selector.slice(start).trim()];
};

test("Ultra transition sheet parses and every enhancement is explicitly gated", () => {
  assert.doesNotThrow(() =>
    transform({ filename: "styles-ultra-transitions.css", code: Buffer.from(css) }),
  );
  assert.match(css, /@media\s*\(prefers-reduced-motion:\s*no-preference\)\s*and\s*\(forced-colors:\s*none\)/);

  const rules = styleRules(css);
  const animated = rules.filter(({ body }) =>
    [...body.matchAll(/(?:^|;)\s*(animation(?:-[\w-]+)?)\s*:\s*([^;]+)/gm)].some(
      ([, , value]) => !/^none(?:\s|!|$)/i.test(value.trim()),
    ),
  );
  assert.ok(animated.length >= 8, "transition effects and resets are present");
  for (const { selector, context } of animated) {
    const accessibilityOverride = context.some((entry) =>
      /prefers-reduced-motion:\s*reduce|prefers-reduced-transparency:\s*reduce|prefers-contrast:\s*more|forced-colors:\s*active/.test(entry),
    );
    for (const part of splitSelectors(selector)) {
      if (accessibilityOverride) {
        assert.ok(part.includes('html[data-ultra-mode="on"]'), `accessibility reset must remain Ultra-scoped: ${part}`);
      } else {
        assert.ok(part.includes(root), `missing Ultra and motion gates: ${part}`);
        assert.ok(context.includes("@media (prefers-reduced-motion: no-preference) and (forced-colors: none)"));
      }
    }
  }
  for (const { selector, context } of rules) {
    const accessibilityOverride = context.some((entry) =>
      /prefers-reduced-motion:\s*reduce|prefers-reduced-transparency:\s*reduce|prefers-contrast:\s*more|forced-colors:\s*active/.test(entry),
    );
    for (const part of splitSelectors(selector)) {
      if (/html:not\(\[data-ultra-(?:mode|motion)=/.test(part)) continue;
      if (accessibilityOverride) {
        assert.ok(part.includes('html[data-ultra-mode="on"]'), `fallback must stay Ultra-scoped: ${part}`);
      } else {
        assert.ok(part.includes(root), `static effect missing default-off/motion gates: ${part}`);
      }
    }
  }
});

test("the route shutter keeps its existing clock, geometry, and four opaque panels", () => {
  const gate = read("src/components/load-gate.tsx");
  const cinema = read("src/styles-transition-cinema.css");
  assert.match(gate, /<span className="dwc-shutter" aria-hidden="true">\s*<i className="is-left"\s*\/>\s*<i className="is-right"\s*\/>\s*<i className="is-top"\s*\/>\s*<i className="is-bottom"\s*\/>/);
  assert.match(css, /--ultra-shutter-close:\s*var\(--dwc-close,\s*320ms\)/);
  assert.match(css, /--ultra-shutter-close:\s*300ms/);
  assert.match(css, /animation:\s*ultra-file-light-lift\s+var\(--ultra-shutter-close\)/);
  assert.match(css, /animation:\s*ultra-file-light-land\s+160ms/);
  assert.match(cinema, /animation:\s*dwc-carry-land\s+var\(--dwc-reveal\)/);
  assert.match(cinema, /animation:\s*dwc-carry-dock\s+200ms/);
  assert.match(cinema, /\.dwc-shutter\s*>\s*i\s*\{[^}]*background:\s*#04080f/s);

  // The added optics only alter timing functions and pseudo-element paint.
  // The moving shutter panels retain the existing translate animations.
  const rules = styleRules(css);
  const geometry = /^(?:position|inset|inset-block|inset-inline|top|right|bottom|left|width|height|min-width|min-height|max-width|max-height|transform|translate|perspective|filter|backdrop-filter)$/;
  for (const { selector, body } of rules) {
    if (!selector.includes(".load-gate") && !selector.includes(".dwc-shutter")) continue;
    const isDecoration = /::(?:before|after)/.test(selector);
    const declarations = body.matchAll(/(?:^|;)\s*([\w-]+)\s*:/g);
    for (const [, property] of declarations) {
      assert.ok(!geometry.test(property) || isDecoration, `${property} changes gate geometry in ${selector}`);
      if (selector.includes(".dwc-shutter") && selector.includes("> i") && !isDecoration) {
        assert.ok(!/^animation(?:-duration)?$/.test(property), `${property} changes shutter clock in ${selector}`);
      }
    }
  }
});

test("the shutter light stays on inert inner edges with no gradient across the four faces", () => {
  assert.match(css, />\s*\.dwc-shutter\s*>\s*i::after\s*\{[^}]*pointer-events:\s*none/s);
  assert.match(css, />\s*\.dwc-shutter\s*>\s*:is\(\.is-left,\s*\.is-right\)::after\s*\{[^}]*background:\s*linear-gradient\(\s*180deg/s);
  assert.match(css, />\s*\.dwc-shutter\s*>\s*:is\(\.is-top,\s*\.is-bottom\)::after\s*\{[^}]*background:\s*linear-gradient\(\s*90deg/s);
  assert.doesNotMatch(css, /\.dwc-shutter\s*>\s*i\s*\{[^}]*\bbackground(?:-image)?\s*:/s);
  assert.match(css, /\.dwc-carry::before\s*\{[^}]*pointer-events:\s*none/s);
  assert.match(css, /\.gallery-curtain-cloth::before\s*\{[^}]*pointer-events:\s*none/s);
  assert.match(galleryCurtainSource(), /className="gallery-curtain-cloth"/);
});

test("Ultra transitions reset immediately when disabled or accessibility preferences require it", () => {
  for (const gate of ['html:not([data-ultra-mode="on"])', 'html:not([data-ultra-motion="on"])']) {
    assert.ok(css.includes(gate), gate);
  }
  assert.match(css, /content:\s*none;\s*animation:\s*none;/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
  assert.match(css, /prefers-reduced-transparency:\s*reduce/);
  assert.match(css, /prefers-contrast:\s*more/);
  assert.match(css, /forced-colors:\s*active/);
  assert.match(css, /animation:\s*none\s*!important/);
  assert.match(css, /box-shadow:\s*none\s*!important/);
});

function galleryCurtainSource() {
  return read("src/components/gallery/gallery-curtain.tsx");
}
