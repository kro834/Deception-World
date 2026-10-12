import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const css = readFileSync(new URL("../src/styles-rexonance-resonance.css", import.meta.url), "utf8");

test("only already-clipped tall-screen metric cuts defer content, never an anchor or sticky ancestor", () => {
  const rules = [...css.matchAll(/([^{}]+)\{([^{}]*content-visibility\s*:\s*auto[^{}]*)\}/g)];
  assert.equal(rules.length, 1);
  const [rule] = rules;
  assert.match(rule[1], /> #performance\s+\.rxs-headline-metrics\s+> article\s*$/);
  assert.doesNotMatch(rule[1], /data-loading|data-route-covered|data-side-menu-open|data-dialog-open/);
  assert.match(rule[1], /:not\(\[data-world-effects="economy"\]\)/);
  const before = css.slice(0, rule.index);
  assert.match(before.slice(before.lastIndexOf("@media")), /prefers-reduced-motion: no-preference.*min-height: 700px/);
  assert.match(rule[2], /contain-intrinsic-block-size: auto 0px;/);
  assert.doesNotMatch(rule[2], /(?:^|;)\s*(?:height|min-height|position|top|overflow|margin|padding|animation):/);
});
