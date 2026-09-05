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
  { file: "saga-form-archive-standalone.html", dir: "archives" },
  { file: "realm-form-archive-standalone.html", dir: "archives" },
  { file: "saga-form-archive-embedded.html", dir: "public" },
  { file: "realm-form-archive-embedded.html", dir: "public" },
];

test("Saga and Realm archives load one shared modern comparison layer", () => {
  for (const archive of archives) {
    const html = readFileSync(new URL(`../${archive.dir}/${archive.file}`, import.meta.url), "utf8");
    assert.match(html, /archive-comparison-modern\.css\?v=20260905-anime/);
    assert.match(html, /archive-comparison-modern\.js\?v=20260826-r43/);
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

test("matching catalog fields stay in the same horizontal row", () => {
  assert.match(comparisonCss, /\.compare-form-card \.viz-grid \{[\s\S]*?grid-template-columns: minmax\(0, 1fr\) !important/);
  assert.match(comparisonCss, /min-height: var\(--compare-row-height, 5\.15rem\) !important/);
  assert.match(comparisonJs, /const alignSpecRows = \(cardA, cardB\) =>/);
  assert.match(comparisonJs, /createPlaceholder\(label\)/);
  assert.match(comparisonJs, /rowA\.style\.order = order/);
  assert.match(comparisonJs, /rowB\.style\.setProperty\("--compare-row-height", `\$\{height\}px`\)/);
  assert.match(comparisonJs, /artwork\.style\.setProperty\("height", `\$\{artworkHeight\}px`, "important"\)/);
  assert.match(comparisonJs, /root\.dataset\.catalogRowsAligned = String\(alignedRows\)/);
});
