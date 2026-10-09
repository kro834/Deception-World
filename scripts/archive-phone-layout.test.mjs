import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

/* Phone reading of the form archive (rx6): no dead sheet control in the
   page flow, table figures beside the sticky names, and the comparison's
   gaps kept out of the Zeus button's right-hand lane. */

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const mobile = read("public/archive-mobile-stability.css");
const comparison = read("public/archive-comparison-modern.css");

test("the selector's 閉じる shows only with the phone sheet", () => {
  assert.match(
    mobile,
    /\[id\$="saga-forms-performance-v5"\]:not\(\.is-selector-sheet-open\):not\(\.is-selector-sheet-closing\)\s*\.selector-heading\s*\.selector-sheet-close \{\s*display: none !important;/,
  );
});

test("phone tables narrow the sticky name column so figures show beside it", () => {
  const phone = mobile.slice(mobile.indexOf("/* Phone tables:"));
  assert.match(
    phone,
    /@media \(max-width: 620px\) \{\s*html\[data-embedded-archive="true"\] \[id\$="saga-forms-performance-v5"\] \.table-responsive \.table th:first-child \{\s*width: 7\.25rem !important;/,
  );
  assert.match(
    phone,
    /\.table:has\(> tbody#saga-ratio-body-v5\) \{\s*min-width: 36rem !important;/,
  );
  assert.match(phone, /:is\(th, td\):nth-child\(2\) \{[\s\S]*?word-break: keep-all;/);
});

test("phone comparison gaps sit beside their label, out of the Zeus lane", () => {
  assert.match(
    comparison,
    /@media \(max-width: 620px\) \{\s*\[id\$="saga-form-compare-ios"\] \.compare-diff-row \{\s*grid-template-columns: auto minmax\(0, 1fr\);\s*\}\s*\[id\$="saga-form-compare-ios"\] \.compare-diff-delta \{\s*justify-self: start;/,
  );
});
