// Overlap pass (2026-11-23), special sites: frame lines that stuck out of their
// rounded plates and labels that ran into each other on iPhone / iPad widths.
// Each rule below was measured in a browser first; these tests pin the CSS that
// fixed it so a later sheet does not bring the overlap back.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (name) => readFileSync(new URL(`../src/${name}`, import.meta.url), "utf8");
const ring = read("styles-ring-special.css");
const layout = read("styles-rexonance-layout-20261021.css");

/** The body of the first rule whose selector text contains `needle`. */
const ruleBody = (css, needle, from = 0) => {
  const at = css.indexOf(needle, from);
  assert.notEqual(at, -1, `missing ${needle}`);
  const open = css.indexOf("{", at);
  return css.slice(open + 1, css.indexOf("}", open));
};

test("Rexonance's square corner brackets take the radius of the plates the ring system rounded", () => {
  const body = ruleBody(ring, ":is(.rxs-comparison, .rxs-p14-comparator, .rxe-form-comparison, .rxe-form-status)::before");
  assert.match(body, /border-radius:\s*inherit/);
});

test("Extreme's pill challenger buttons trim their square left rail to the pill", () => {
  const body = ruleBody(ring, "#top.exs-page[data-command-special]:not(#ring-b)\n    .exs-opponent-options\n    button {");
  assert.match(body, /overflow:\s*clip/);
});

test("an iPad landscape / small laptop (1100px to 1279px) stacks the P14 delta over the readings too", () => {
  const at = layout.indexOf("@media (min-width: 1100px) and (max-width: 1279.98px)");
  assert.notEqual(at, -1);
  const block = layout.slice(at, layout.indexOf("\n}\n", at));
  assert.match(block, /"delta delta"/);
  assert.match(block, /"\. values"/);
});

test("the P14 reading pill is sized from its widest figure, so 約11.4% stays inside it", () => {
  assert.match(layout, /grid-template-columns:\s*96px calc\(clamp\(26px, 2\.6vw, 36px\) \* 4\.55 \+ 24px\)/);
  // phones: 4.55em of 26px is 118px plus the pill's 20px padding
  assert.match(layout, /@media \(min-width: 375px\) and \(max-width: 700px\)[\s\S]*?grid-template-columns:\s*72px 142px/);
});

test("the Rexonance form stage insets its copy from the frame and keeps the points' numerals off their rail", () => {
  assert.match(layout, /> #stages\s+\.rxs-stage-panel\s+> div \{\s*padding-inline: clamp\(14px, 3\.4vw, 32px\);/);
  assert.match(layout, /> #stages\s+\.rxs-stage-panel\s+li \{\s*padding-inline-start: 14px;/);
  const at = layout.indexOf("> :is(small, h3, p, ul) {");
  assert.notEqual(at, -1);
  assert.match(layout.slice(at, at + 120), /margin-inline: clamp\(14px, 4vw, 28px\)/);
});

test("a 375px to 469px phone stacks the P14 delta over the readings instead of squeezing it to 60px", () => {
  const at = layout.indexOf("@media (min-width: 375px) and (max-width: 469.98px)");
  assert.notEqual(at, -1);
  const block = layout.slice(at, layout.indexOf("\n}\n", at));
  assert.match(block, /"delta delta"/);
  assert.match(block, /"\. values"/);
});
