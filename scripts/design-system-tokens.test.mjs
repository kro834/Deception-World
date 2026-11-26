// The shared design system (2026-11-26 brush-up, package G): one type scale,
// one surface and radius family, one palette and one button family on :root
// (src/styles-ring.css), and the reusable flush-prose hook
// (src/styles-future-interface.css). Pages read these with fallbacks, so the
// names and values are a contract.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (file) => readFileSync(new URL("../" + file, import.meta.url), "utf8");
const ring = read("src/styles-ring.css");
const future = read("src/styles-future-interface.css");

const block = (css, selector) => {
  const start = css.indexOf(selector + " {");
  assert.ok(start >= 0, `missing block ${selector}`);
  return css.slice(start, css.indexOf("\n}", start));
};
const rootBlock = block(ring, ":root");
const tokenIn = (css, name) => {
  const match = css.match(new RegExp(`\\n\\s*${name.replace(/-/g, "\\-")}:\\s*([^;]+);`));
  return match?.[1].trim();
};

test("the type scale and its floors are on :root", () => {
  const expected = {
    "--dw-fs-floor": "11px",
    "--dw-fs-label": "12px",
    "--dw-fs-small": "13px",
    "--dw-fs-body": "15px",
    "--dw-lh-body": "1.9",
    "--dw-fs-h3": "clamp(18px, 1.2vw + 14px, 22px)",
    "--dw-fs-h2": "clamp(26px, 2.4vw + 16px, 40px)",
  };
  for (const [name, value] of Object.entries(expected)) {
    assert.equal(tokenIn(rootBlock, name), value, name);
  }
});

test("the surface, radius and button tokens are on :root", () => {
  const expected = {
    "--dw-r-control": "12px",
    "--dw-r-card": "20px",
    "--dw-r-panel": "28px",
    "--dw-r-pill": "999px",
    "--dw-btn-h": "44px",
    "--dw-btn-h-hero": "52px",
    "--dw-btn-pad-x": "20px",
    "--dw-header-h": "64px",
    "--dw-header-mark": "44px",
  };
  for (const [name, value] of Object.entries(expected)) {
    assert.equal(tokenIn(rootBlock, name), value, name);
  }
  for (const name of [
    "--dw-btn-primary-fill",
    "--dw-btn-primary-ink",
    "--dw-btn-outline",
    "--dw-btn-font",
    "--dw-border",
    "--dw-line",
    "--dw-surface",
    "--dw-tint",
  ]) {
    assert.ok(tokenIn(rootBlock, name), `${name} defined`);
  }
  assert.equal(tokenIn(rootBlock, "--dw-ice"), "var(--ring-key)");
  assert.equal(tokenIn(rootBlock, "--dw-gold"), "var(--ring-gold)");
});

test("body, cards and the header grow from 720px", () => {
  const wide = ring.slice(ring.indexOf("@media (min-width: 720px) {\n  :root {"));
  const scope = wide.slice(0, wide.indexOf("\n}\n"));
  assert.equal(tokenIn(scope, "--dw-fs-body"), "16px");
  assert.equal(tokenIn(scope, "--dw-r-card"), "28px");
  assert.equal(tokenIn(scope, "--dw-header-h"), "76px");
  assert.equal(tokenIn(scope, "--dw-header-mark"), "48px");
});

test("the gallery family keeps its gold primary (owner, 2026-11-26)", () => {
  const gallery = block(ring, 'html[data-family="gallery"]');
  assert.match(tokenIn(gallery, "--dw-btn-primary-fill"), /--ring-gold/);
  assert.doesNotMatch(tokenIn(gallery, "--dw-btn-primary-fill"), /--ring-key|--ring-pink/);
});

test("the tokens select nothing beyond :root and the family scope", () => {
  const start = ring.indexOf("--dw-fs-floor");
  const end = ring.indexOf("@supports (transition-timing-function: linear(0, 1))");
  const region = ring.slice(start, end);
  const selectors = [...region.matchAll(/\n([^\s{}/*][^{}]*)\{/g)].map((m) => m[1].trim());
  assert.deepEqual(selectors, ["@media (min-width: 720px)", 'html[data-family="gallery"]']);
});

test("long-form prose has a reusable flush hook", () => {
  const rule = future.slice(future.indexOf(":where(.dw-prose, [data-prose]),"));
  const body = rule.slice(rule.indexOf("{"), rule.indexOf("}"));
  assert.match(rule, /^:where\(\.dw-prose, \[data-prose\]\),\n:where\(\.dw-prose, \[data-prose\]\) :where\(p, li\) \{/);
  assert.match(body, /word-break: normal;/);
  assert.match(body, /line-break: strict;/);
  assert.match(body, /text-wrap-style: pretty;/);
  // Flush, never character-anywhere: names keep their seams.
  assert.doesNotMatch(body, /anywhere|auto-phrase|keep-all/);
  // After the phrase-breaking baseline, so it wins at equal (zero) specificity.
  assert.ok(
    future.indexOf(":where(p, li) {\n  word-break: auto-phrase;") <
      future.indexOf(":where(.dw-prose, [data-prose]),"),
  );
});
