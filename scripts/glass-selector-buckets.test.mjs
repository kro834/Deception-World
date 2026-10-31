// QA 2026-10-31: with glass on, the iPads spent more time in style
// recalculation. The glass sheets' `… :is(a, b, c)`-ended selectors had no
// key and were tried on every element; the PostCSS step keys them without
// changing what they match or how much they weigh.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  bucketSelector,
  glassSelectorBuckets,
  specificity,
  splitList,
} from "./glass-selector-buckets.mjs";

const read = (file) => readFileSync(new URL("../" + file, import.meta.url), "utf8");

test("a list-ended selector becomes one keyed selector per key", () => {
  const out = bucketSelector(
    'html[data-button-style="liquid"] body :is(.topbar nav a, .manager-back, .rxs-local-nav nav a):not(#lg-glass)::after',
  );
  assert.deepEqual(out, [
    'html[data-button-style="liquid"] body :where(a):is(.topbar nav a, .rxs-local-nav nav a):not(#lg-glass)::after',
    'html[data-button-style="liquid"] body :where(.manager-back):is(.manager-back):not(lg-pad):not(lg-pad):not(#lg-glass)::after',
  ]);
});

test("every arm weighs what the original list weighed", () => {
  const cases = [
    'html body :is(.a nav b, .c > i, #d, [data-press="in"]):not(#z)',
    "html body :is(.side-panel-trigger:not(:is([data-x], [data-y]) *), .episode-controls button)",
    "html :is(.a .b .c, d)::before",
    "html :where(.topbar nav a, .x > b)",
  ];
  for (const selector of cases) {
    const want = specificity(selector);
    const arms = bucketSelector(selector);
    assert.ok(arms.length > 1, selector);
    for (const arm of arms) assert.deepEqual(specificity(arm), want, arm);
  }
});

test("each arm is keyed by something every match of its arguments carries", () => {
  assert.deepEqual(
    bucketSelector('x :is(.a nav b, #d.e, [data-press="in"], span.f)').map(
      (arm) => /:where\(([^)]*)\)/.exec(arm)[1],
    ),
    ["b", "#d", "[data-press]", ".f"],
  );
  assert.deepEqual(
    bucketSelector("x :is(.a nav b, .c > i)").map((arm) => /:where\(([^)]*)\)/.exec(arm)[1]),
    ["b", "i"],
  );
});

test("selectors the engine already keys, and risky lists, are left alone", () => {
  for (const selector of [
    "html body .topbar:is(.a, .b)",
    "html body :is(.a)",
    "html body [data-lg-seg]::after",
    "html body :is(.a, .b *)",
    "html body :is(.a::-webkit-slider-thumb, .b)",
    "html body :is(.a\\:b, .c)",
  ])
    assert.deepEqual(bucketSelector(selector), [selector]);
});

test("the list split respects brackets, parentheses and quotes", () => {
  assert.deepEqual(splitList('.a:not(.b, .c), [title="x,y"], d'), [
    ".a:not(.b, .c)",
    '[title="x,y"]',
    "d",
  ]);
});

test("the step runs on the liquid glass sheets only, wired into Vite", () => {
  const plugin = glassSelectorBuckets();
  const rule = (file) => {
    const node = {
      selectors: ["html :is(.a, .b)"],
      parent: { type: "root" },
    };
    plugin.Once({
      source: { input: { file } },
      walkRules: (visit) => visit(node),
    });
    return node.selectors;
  };
  assert.equal(rule("/repo/src/styles-liquid-glass-controls.css?url").length, 2);
  assert.equal(rule("/repo/src/styles-liquid-glass.css").length, 2);
  assert.deepEqual(rule("/repo/src/styles.css?url"), ["html :is(.a, .b)"]);
  const config = read("vite.config.ts");
  assert.match(
    config,
    /import \{ glassSelectorBuckets \} from "\.\/scripts\/glass-selector-buckets\.mjs"/,
  );
  assert.match(config, /css: \{ postcss: \{ plugins: \[glassSelectorBuckets\(\)\] \} \}/);
});
