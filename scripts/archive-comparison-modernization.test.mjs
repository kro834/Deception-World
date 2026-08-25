import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const comparisonCss = readFileSync(
  new URL("../public/archive-comparison-modern.css", import.meta.url),
  "utf8",
);
const comparisonJs = readFileSync(
  new URL("../public/archive-comparison-modern.js", import.meta.url),
  "utf8",
);
const archives = [
  "saga-form-archive-standalone.html",
  "realm-form-archive-standalone.html",
  "saga-form-archive-embedded.html",
  "realm-form-archive-embedded.html",
];

test("Saga and Realm archives load one shared modern comparison layer", () => {
  for (const archive of archives) {
    const html = readFileSync(new URL(`../public/${archive}`, import.meta.url), "utf8");
    assert.match(html, /archive-comparison-modern\.css\?v=20260825-r42/);
    assert.match(html, /archive-comparison-modern\.js\?v=20260825-r42/);
  }
});

test("the comparison keeps two readable iPhone columns with stronger type", () => {
  assert.match(
    comparisonCss,
    /\[id\$="saga-form-compare-ios"\] \.compare-layout \{[\s\S]*?grid-template-columns: repeat\(2, minmax\(0, 1fr\)\) !important/,
  );
  assert.match(
    comparisonCss,
    /\.compare-form-card \.detail-head h3 \{[\s\S]*?font-size: clamp\(1\.08rem,[\s\S]*?font-weight: 900 !important/,
  );
  assert.match(comparisonCss, /@media \(max-width: 390px\)/);
  assert.match(comparisonCss, /font-size: max\(12\.5px, 0\.78rem\) !important/);
  assert.match(comparisonCss, /font-variant-numeric: tabular-nums lining-nums/);
});

test("catalog metrics identify the leading side and respect lower running times", () => {
  assert.match(comparisonJs, /const HIGHER_IS_BETTER/);
  assert.match(comparisonJs, /const LOWER_IS_BETTER = \/\^走力\$\//);
  assert.match(comparisonJs, /\["ジャンプ・100m", \[1, -1\]\]/);
  assert.match(comparisonJs, /dataset\.compareResult = result/);
  assert.match(comparisonJs, /badgeText = \{ lead: "優位", trail: "相手優位", tie: "同値" \}/);
  assert.match(comparisonJs, /root\.dataset\.catalogLeads = `\$\{leadsA\}:\$\{leadsB\}`/);
  assert.match(comparisonCss, /\.spec-item\[data-compare-result="lead"\]/);
  assert.match(comparisonCss, /\.compare-advantage-summary/);
});
