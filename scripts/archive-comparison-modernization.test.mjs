import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

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
    const html = readFileSync(
      new URL(`../${archive.dir}/${archive.file}`, import.meta.url),
      "utf8",
    );
    assert.match(html, /archive-comparison-modern\.css\?v=20260918-readable/);
    assert.match(html, /archive-comparison-modern\.js\?v=20260918-readable/);
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

test("catalog metric results expose and refresh screen-reader text in the row DOM", () => {
  const helperSource = comparisonJs.match(
    / {2}const clearResults = \(root\) => \{[\s\S]*?\n {2}\};\n\n {2}const decorate = \(row, result, label\) => \{[\s\S]*?\n {2}\};/,
  )?.[0];
  assert.ok(helperSource, "comparison accessibility helpers should remain available");

  const children = [];
  const item = {
    dataset: {},
    attributes: new Map([["aria-label", "既存の行名"]]),
    appendChild(child) {
      children.push(child);
    },
    removeAttribute(name) {
      this.attributes.delete(name);
    },
  };
  const createElement = () => ({
    className: "",
    textContent: "",
    attributes: new Map(),
    setAttribute(name, value) {
      this.attributes.set(name, value);
    },
    remove() {
      this.removed = true;
    },
  });
  const root = {
    querySelectorAll(selector) {
      if (selector === ".spec-item[data-compare-result]") return [item];
      if (selector === ".spec-compare-badge")
        return children.filter((child) => child.className === "spec-compare-badge");
      if (selector === ".compare-result-a11y")
        return children.filter((child) => child.className.includes("compare-result-a11y"));
      return [];
    },
  };
  const context = vm.createContext({ document: { createElement } });
  vm.runInContext(
    `${helperSource}\nthis.clearResults = clearResults; this.decorate = decorate;`,
    context,
  );

  context.decorate({ item, value: "50t" }, "lead", "パンチ力");
  const note = children.find((child) => child.className.includes("compare-result-a11y"));
  assert.equal(note?.textContent, "パンチ力: この形態が比較優位。値 50t");
  assert.equal(note?.attributes.size, 0, "the readable note must not be aria-hidden");
  assert.equal(
    item.attributes.get("aria-label"),
    "既存の行名",
    "existing row semantics stay intact",
  );

  context.clearResults(root);
  assert.equal(note?.removed, true);
  assert.equal(
    item.attributes.get("aria-label"),
    "既存の行名",
    "clearing only removes owned result nodes",
  );
});

test("mobile comparison labels keep an eleven pixel readable minimum", () => {
  assert.match(
    comparisonCss,
    /\.compare-side legend \{[\s\S]*?font-size: max\(11px, 0\.6875rem\) !important/,
  );
  assert.match(
    comparisonCss,
    /\.compare-form-card \.viz-badge \{[\s\S]*?font-size: max\(11px, 0\.6875rem\) !important/,
  );
  assert.match(
    comparisonCss,
    /\.compare-form-card \.spec-item \.text-muted \{[\s\S]*?font-size: max\(11px, 0\.6875rem\) !important/,
  );
  assert.match(comparisonCss, /\.spec-compare-badge \{[\s\S]*?font-size: 11px/);
  assert.match(comparisonCss, /\.compare-advantage-summary span \{[\s\S]*?font-size: 11px/);
  assert.match(comparisonCss, /\.compare-advantage-summary small \{[\s\S]*?font-size: 11px/);
});

test("matching catalog fields stay in the same horizontal row", () => {
  assert.match(
    comparisonCss,
    /\.compare-form-card \.viz-grid \{[\s\S]*?grid-template-columns: minmax\(0, 1fr\) !important/,
  );
  assert.match(comparisonCss, /min-height: var\(--compare-row-height, 5\.15rem\) !important/);
  assert.match(comparisonJs, /const alignSpecRows = \(cardA, cardB\) =>/);
  assert.match(comparisonJs, /createPlaceholder\(label\)/);
  assert.match(comparisonJs, /rowA\.style\.order = order/);
  assert.match(
    comparisonJs,
    /rowB\.style\.setProperty\("--compare-row-height", `\$\{height\}px`\)/,
  );
  assert.match(
    comparisonJs,
    /artwork\.style\.setProperty\("height", `\$\{artworkHeight\}px`, "important"\)/,
  );
  assert.match(comparisonJs, /root\.dataset\.catalogRowsAligned = String\(alignedRows\)/);
  assert.match(comparisonCss, /min-height: var\(--compare-row-height, 5\.05rem\) !important/);
  assert.match(comparisonCss, /min-height: var\(--compare-row-height, 5rem\) !important/);
  assert.match(
    comparisonJs,
    /clearResults\(root\);[\s\S]*?querySelectorAll\("\.compare-spec-placeholder"\)[\s\S]*?const rowsA = rowsByLabel\(cardA\)/,
  );
  assert.match(
    comparisonJs,
    /rowsA\.forEach\([\s\S]*?decorate\([\s\S]*?const alignedRows = alignSpecRows\(cardA, cardB\);/,
  );
  assert.equal(comparisonJs.match(/alignSpecRows\(cardA, cardB\)/g)?.length, 1);
  assert.match(
    comparisonCss,
    /\.compare-form-card \.detail-lead \{[\s\S]*?min-height: var\(--compare-lead-height, auto\) !important/,
  );
  assert.match(comparisonJs, /card\.style\.removeProperty\("--compare-lead-height"\)/);
  assert.match(
    comparisonJs,
    /const leadA = cardA\.querySelector\("\.detail-lead"\)[\s\S]*?Math\.max\([\s\S]*?leadA\.scrollHeight[\s\S]*?leadB\.scrollHeight[\s\S]*?cardA\.style\.setProperty\("--compare-lead-height", `\$\{height\}px`\)[\s\S]*?cardB\.style\.setProperty\("--compare-lead-height", `\$\{height\}px`\)/,
  );
});
