import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

/* The 2-form analyzer's spec difference (public/archive-comparison-modern.js):
   both forms' figures field by field, a bar for each, and how far apart they
   are. It derives a multiple or a gap only where the archive's own figures
   allow it, and never rewrites what the archive prints. */

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const js = read("public/archive-comparison-modern.js").replaceAll("\r\n", "\n");
const css = read("public/archive-comparison-modern.css");

function helpers(rows = new Map()) {
  const header = js.slice(js.indexOf("  const HIGHER_IS_BETTER"), js.indexOf("  const activeCard"));
  const diff = js.slice(js.indexOf("  const DIFF_FIELDS"), js.indexOf("  const diffCell"));
  const context = vm.createContext({ rowsByLabel: () => rows });
  vm.runInContext(
    `${header}\n${diff}\nthis.readFigure = readFigure; this.diffRow = diffRow; this.diffFigures = diffFigures; this.formatMultiple = formatMultiple;`,
    context,
  );
  return context;
}

const figure = (text, direction) => ({ ...helpers().readFigure(text), direction });
const row = (name, a, b, direction) =>
  helpers().diffRow(name, figure(a, direction), figure(b, direction));

test("exact figures in one unit get a multiple, from the stronger side", () => {
  const punch = row("パンチ", "10.9t", "88.9t", 1);
  assert.equal(punch.lead, "b");
  assert.equal(punch.delta, "B ×8.16");
  assert.equal(punch.spoken, "FORM Bが優位、8.16倍");
  assert.equal(punch.shareB, 1);
  assert.ok(Math.abs(punch.shareA - 10.9 / 88.9) < 1e-9);
  // A time is better when it is shorter, and its bar shows speed.
  const run = row("100m", "8秒", "0.6秒", -1);
  assert.equal(run.lead, "b");
  assert.equal(run.delta, "B ×13.3");
  assert.equal(run.shareB, 1);
  assert.equal(row("EMP", "300E", "10E", 1).delta, "A ×30.0");
  assert.equal(row("ジャンプ", "6000m", "42.0m", 1).delta, "A ×143");
  assert.equal(row("パンチ", "33.6t", "33.6t", 1).delta, "同値");
});

test("bounds, mode switches, other units and 無制限 never get a multiple", () => {
  const bound = row("パンチ", "89.8t〜", "100.5t〜", 1);
  assert.equal(bound.lead, "b");
  assert.equal(bound.delta, "B 優位");
  const estimated = row("ジャンプ", "5,200.0m（est.）", "1,033.5m", 1);
  assert.equal(estimated.delta, "A 優位");
  for (const [a, b] of [
    ["300E", "1"],
    ["3,000TOPS / 200Core ⇄ 60,000TOPS / 300Core", "50,000TOPS / 100Core"],
    ["測定不能", "88.9t"],
    ["—", "41.4t"],
  ]) {
    const result = row("項目", a, b, 1);
    assert.equal(result.measured, false, `${a} / ${b}`);
    assert.equal(result.delta, "");
  }
  const unlimited = row("EMP", "無制限", "1,000E", 1);
  assert.equal(unlimited.lead, "a");
  assert.equal(unlimited.delta, "A 優位");
  assert.equal(unlimited.measured, false);
  assert.equal(row("EMP", "無制限", "無制限", 1).delta, "同値");
});

test("height and weight show a plain gap, and none for estimates", () => {
  const height = row("身長", "208.8cm", "235.8cm", 0);
  assert.equal(height.lead, "none");
  assert.equal(height.delta, "B +27.0cm");
  assert.equal(height.spoken, "FORM Bが27.0cm上回る");
  assert.equal(row("身長", "222.2cm（est.）", "210.2cm", 0).delta, "");
  assert.equal(row("体重", "72.3kg", "72.3kg", 0).delta, "同値");
});

test("the archive's own text is shown unchanged and 演算 stays text", () => {
  // A printed value: text nodes, with <br> where the archive breaks a line.
  const spec = (label, value) => [
    label,
    {
      item: {
        querySelector: () => ({
          childNodes: value
            .split("<br>")
            .flatMap((text, index) => [
              ...(index ? [{ nodeName: "BR", childNodes: [] }] : []),
              { nodeType: 3, nodeValue: text },
            ]),
        }),
      },
      value: value.replaceAll("<br>", ""),
    },
  ];
  const rows = new Map([
    spec("身長・体重", "207.8cm / 72.3kg（共通値）"),
    spec("パンチ・キック", "110t / 右脚260.0t / 左脚360.0t（est.）"),
    spec("演算", "20000YOPS / 200Core「Spark XR」<br>Paranormal Realizer Pro Max"),
    spec("ジャンプ・100m", "42.0m / 8秒"),
  ]);
  const figures = helpers(rows).diffFigures({});
  assert.deepEqual([...figures.keys()], ["身長", "体重", "演算", "ジャンプ", "100m"]);
  // Full-width brackets stay full width (the parser reads an NFKC copy),
  // and a printed line break stays a line break.
  assert.equal(
    figures.get("演算").text,
    "20000YOPS / 200Core「Spark XR」\nParanormal Realizer Pro Max",
  );
  assert.equal(figures.get("身長").text, "207.8cm");
  assert.equal(figures.get("演算").number, null);
  assert.equal(figures.get("100m").direction, -1);
  // A field with an extra declared value (two kick legs) is not split.
  assert.equal(figures.has("パンチ"), false);
});

test("the panel is a labelled table placed before the cards, with new copy only", () => {
  assert.match(js, /<h3 class="compare-diff-title" id="\$\{titleId\}">スペック差分<\/h3>/);
  assert.match(js, /<div class="compare-diff-table" role="table" aria-labelledby="\$\{titleId\}">/);
  assert.match(js, /<span role="columnheader">FORM A<\/span>/);
  // Divs: both archives force table layout on every table, tr and td.
  assert.doesNotMatch(
    js.slice(js.indexOf("const diffCell")),
    /createElement\("(td|th|tr|table)"\)/,
  );
  assert.match(
    js,
    /const anchor = root\.querySelector\(":scope \.compare-layout"\);\s*if \(anchor\) anchor\.before\(panel\);/,
  );
  assert.match(
    js,
    /renderDiff\(root, sideA, sideB, cardA, cardB\);\n {4}const alignedRows = alignSpecRows\(cardA, cardB\);/,
  );
  assert.match(js, /倍率と差は表示値から計算。下限値（〜）と演算には倍率を付けていません。/);
  assert.match(js, /数値で比べられる項目はありません。/);
});

test("the analyzer's first measurement waits until it is near, used or idle", () => {
  const init = js.slice(js.indexOf("  const initialize = () => {"));
  assert.doesNotMatch(init, /setTimeout\(refresh, 120\)|setTimeout\(refresh, 720\)/);
  assert.match(init, /new IntersectionObserver\([\s\S]*?\{ rootMargin: "100% 0px" \}/);
  assert.match(init, /const refreshOnUse = \(\) => \{\s*start\(\);\s*refresh\(\);/);
  assert.match(init, /window\.addEventListener\("pageshow", refreshIfStarted\)/);
  assert.match(init, /window\.ArchiveComparisonUI = \{ refresh: refreshIfStarted, start \}/);
  // fonts.ready flushes layout when read; it is read once the analyzer starts.
  const start = init.slice(
    init.indexOf("const start = () => {"),
    init.indexOf("const refreshIfStarted"),
  );
  assert.match(start, /document\.fonts\?\.ready\.then\(refresh\)/);
  assert.equal(init.match(/document\.fonts/g)?.length, 1);
  // Row heights are read in one pass, then written.
  assert.match(
    js,
    /const heights = pairs\.map\(\(\[rowA, rowB\]\) => Math\.max\(naturalHeight\(rowA\), naturalHeight\(rowB\)\)\);/,
  );
});

test("the difference panel keeps 12px text, gated motion and forced-colour bars", () => {
  const block = css.slice(css.indexOf("/* Spec difference"));
  for (const [, size] of block.matchAll(/font(?:-size)?:[^;]*?(\d+(?:\.\d+)?)px/g)) {
    assert.ok(Number(size) >= 12, `font size ${size}px`);
  }
  assert.match(
    block,
    /@media \(prefers-reduced-motion: no-preference\) \{\s*html:not\(\[data-world-effects="economy"\]\) [^{]*\.compare-diff-bar i \{\s*transition: transform/,
  );
  assert.doesNotMatch(block, /transition:[^;]*(width|height|left)/);
  assert.match(
    block,
    /@media \(forced-colors: active\)[\s\S]*?\.compare-diff-bar \{[\s\S]*?forced-color-adjust: none;/,
  );
  assert.match(block, /\.compare-diff-bar i \{[\s\S]*?background: CanvasText !important;/);
});
