// rx9: the Form Archive's power profile, VS overlay radar and sortable
// leaderboard (public/archive-profile.js / .css). The pure parsers run in
// node's vm with a minimal fake window; the rest are text checks.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const source = read("public/archive-profile.js");
const sheet = read("public/archive-profile.css");

function load(extra = {}) {
  const window = {};
  const timers = [];
  const context = vm.createContext({
    window,
    console,
    setTimeout: (fn) => timers.push(fn),
    ...extra,
  });
  vm.runInContext(source, context, { filename: "archive-profile.js" });
  for (const fn of timers.splice(0)) fn();
  return window.ArchiveProfileInternals;
}

const P = load();

test("the script loads without a document and exposes its parsers", () => {
  assert.equal(typeof P.classifyValue, "function");
  assert.equal(typeof P.parseCompute, "function");
  assert.equal(P.FLOOR, 0.22);
  // A document with no archive root boots quietly.
  const document = {
    readyState: "complete",
    documentElement: { dataset: { archiveKind: "saga" } },
    querySelectorAll: () => [],
  };
  assert.doesNotThrow(() => load({ document }));
});

test("the classifier reads each printed state in the documented order", () => {
  const cases = [
    ["—", "none", null],
    ["", "none", null],
    ["測定不能t", "unmeasurable", null],
    ["測定不能", "unmeasurable", null],
    ["不詳", "unknown", null],
    ["無制限", "unlimited", Infinity],
    ["20.0–400×", "range", 400],
    ["≥8.24×", "lower-bound", 8.24],
    ["≥1,143×", "lower-bound", 1143],
    ["89.8t〜", "lower-bound", 89.8],
    ["0.007秒〜", "lower-bound", 0.007],
    ["5,200.0m（est.）", "estimate", 5200],
    ["左脚360.0t（est.）", "estimate", 360],
    ["10.9t", "exact", 10.9],
    ["1,000E", "exact", 1000],
    ["1", "exact", 1],
    ["マッハ80", "exact", 80],
    ["0.6s/100m", "exact", 0.6],
    // "+ YOPS" is a second system, never a bound.
    ["2.00× + YOPS", "exact", 2],
    ["REXONANCE SCALER《ULTRA》", "qualitative", null],
    ["動的再配分", "qualitative", null],
  ];
  for (const [raw, state, value] of cases) {
    const parsed = P.classifyValue(raw);
    assert.equal(parsed.state, state, raw);
    assert.equal(parsed.value, value, raw);
  }
  const range = P.classifyValue("20.0–400×");
  assert.deepEqual([range.min, range.max], [20, 400]);
  // The printed form is kept as written.
  assert.equal(P.classifyValue("89.8t〜").raw, "89.8t〜");
});

test("compute keeps TOPS and YOPS apart and quotes the figures as printed", () => {
  const plain = P.parseCompute("150TOPS / 50Core（Spark G2）");
  assert.equal(plain.state, "exact");
  assert.equal(plain.tops, 150);
  assert.equal(plain.display, "150TOPS");

  const bounded = P.parseCompute("50,000TOPS〜 / 200Core");
  assert.equal(bounded.state, "lower-bound");
  assert.equal(bounded.tops, 50000);
  assert.equal(bounded.display, "50,000TOPS〜");

  const switching = P.parseCompute("3,000TOPS / 200Core ⇄ 60,000TOPS / 300Core");
  assert.equal(switching.state, "mode-switch");
  assert.deepEqual([switching.min, switching.max], [3000, 60000]);
  assert.equal(switching.display, "3,000TOPS ⇄ 60,000TOPS");

  const dual = P.parseCompute("KHAOS 10,000YOPS / ∞Core + KOSMOS 300TOPS / 300Core");
  assert.equal(dual.state, "exact");
  assert.equal(dual.tops, 300);
  assert.equal(dual.yops, 10000);
  assert.equal(dual.hasYops, true);
  assert.equal(dual.display, "10,000YOPS + 300TOPS");

  const yopsOnly = P.parseCompute("20000YOPS / 200Core「Spark XR」\nParanormal Realizer Pro Max");
  assert.equal(yopsOnly.state, "yops-only");
  assert.equal(yopsOnly.tops, null);
  assert.equal(yopsOnly.yops, 20000);

  // ∞ in a core count or a chip name is not 無制限.
  const legends = P.parseCompute("88888TOPS / 110Core「Spark X∞」");
  assert.equal(legends.state, "exact");
  assert.equal(legends.tops, 88888);

  assert.equal(P.parseCompute("—").state, "none");
  assert.equal(P.parseCompute("REXONANCE SCALER《ULTRA》").state, "qualitative");
});

test("the six axes come from Saga's composite labels and Realm's single ones", () => {
  const lastVinculum = P.extractAxes(
    new Map([
      ["身長・体重", "222.2cm（est.） / 68.5kg（est.）"],
      ["パンチ・キック", "110t / 右脚260.0t / 左脚360.0t（est.）"],
      ["ジャンプ・100m", "5,200.0m（est.） / 0.007秒〜"],
      ["演算", "KHAOS 10,000YOPS / 500Core + KOSMOS 300TOPS / 300Core（P2）"],
      ["EMP", "1"],
    ]),
  );
  assert.equal(lastVinculum.punch.value, 110);
  assert.equal(lastVinculum.kick.display, "左脚360.0t（est.）");
  assert.equal(lastVinculum.kick.state, "estimate");
  assert.equal(lastVinculum.jump.state, "estimate");
  assert.equal(lastVinculum.speed.state, "lower-bound");
  assert.ok(Math.abs(lastVinculum.speed.value - 100 / 0.007) < 1e-6);
  assert.equal(lastVinculum.speed.display, "0.007秒〜");
  assert.equal(lastVinculum.compute.tops, 300);
  assert.equal(lastVinculum.compute.hasYops, true);
  assert.equal(lastVinculum.emp.value, 1);

  // Rexonance after its runtime update: 演算 (YOPS) plus 演算2 (TOPS).
  const rexonance = P.extractAxes(
    new Map([
      ["パンチ・キック", "332.2t / 480.5t"],
      ["ジャンプ・100m", "6000m / 0.00021秒"],
      ["飛行速度", "測定不能"],
      ["演算", "50000YOPS / ∞Core（KHAOS DeuX）"],
      ["演算2", "9000TOPS / 300Core（KOSMOS DeuX）"],
      ["EMP", "無制限"],
    ]),
  );
  assert.equal(rexonance.compute.tops, 9000);
  assert.equal(rexonance.compute.yops, 50000);
  assert.equal(rexonance.compute.display, "50000YOPS + 9000TOPS");
  assert.equal(rexonance.emp.state, "unlimited");

  const extremeUltra = P.extractAxes(
    new Map([
      ["パンチ・キック", "測定不能 / 測定不能"],
      ["ジャンプ・100m", "測定不能 / 測定不能"],
    ]),
  );
  for (const key of ["punch", "kick", "jump", "speed"])
    assert.equal(extremeUltra[key].state, "unmeasurable", key);
  assert.equal(extremeUltra.compute.state, "none");

  const royalBirth = P.extractAxes(
    new Map([
      ["パンチ力", "25.8t"],
      ["キック力", "92.3t"],
      ["ジャンプ力", "測定不能m"],
      ["走力", "0.0000196s/100m"],
      ["演算", "—"],
      ["EMP", "9000E"],
    ]),
  );
  assert.equal(royalBirth.punch.value, 25.8);
  assert.equal(royalBirth.jump.state, "unmeasurable");
  assert.ok(Math.abs(royalBirth.speed.value - 100 / 0.0000196) < 1e-3);
  assert.equal(royalBirth.compute.state, "none");
  assert.equal(royalBirth.emp.value, 9000);

  // Max / Ultra carry no figures at all.
  const max = P.extractAxes(new Map([["段階", "レクソナンスの攻撃限界拡張状態"]]));
  for (const key of ["punch", "kick", "jump", "speed", "compute", "emp"])
    assert.equal(P.axisScore(max[key], { min: 1, max: 10 }), null, key);
});

test("the HUD name fit counts the longest run that cannot break", () => {
  const text = (data) => ({ nodeType: 3, nodeName: "#text", data });
  const el = (nodeName, ...childNodes) => ({ nodeType: 1, nodeName, childNodes });
  const wbr = { nodeType: 1, nodeName: "WBR", childNodes: [] };
  assert.equal(P.longestRun(el("H3", text("ハイブリッドフォーム フルカスタム"))), 10);
  assert.equal(P.longestRun(el("H3", text("レルムロイヤル・ウルトラ"))), 8);
  assert.equal(
    P.longestRun(el("H3", el("SPAN", text("レクソナンス")), wbr, el("SPAN", text("サーガ・")), wbr, el("SPAN", text("マックス")))),
    6,
  );
  assert.equal(P.longestRun(el("H3", text("ラストヴィンクルム"))), 9);
});

test("a state tag is left out when the printed value already says it", () => {
  assert.equal(P.stateTag({ state: "unmeasurable", display: "測定不能t" }), "");
  assert.equal(P.stateTag({ state: "unmeasurable", display: "測定不能" }), "");
  assert.equal(P.stateTag({ state: "unlimited", display: "無制限" }), "");
  assert.equal(P.stateTag({ state: "lower-bound", display: "100.5t〜" }), "下限値");
  assert.equal(P.stateTag({ state: "none", display: "" }), "記載なし");
  assert.equal(P.stateTag({ state: "exact", display: "41.4t" }), "");
});

test("the normaliser is logarithmic per axis with a visible floor", () => {
  const scale = P.makeScale([5.7, 332.2, 10.9, Infinity, null, NaN]);
  assert.deepEqual({ ...scale }, { min: 5.7, max: 332.2 });
  // The lowest figure reaches the first ring (0.25 of the radius) or close.
  assert.equal(P.scoreFor(5.7, scale), 0.22);
  assert.equal(P.scoreFor(332.2, scale), 1);
  assert.ok(Math.abs(P.scoreFor(10.9, scale) - 0.344) < 0.002);
  assert.equal(P.scoreFor(Infinity, scale), 1);
  assert.equal(P.scoreFor(null, scale), null);
  assert.equal(P.scoreFor(0, scale), null);
  // Out-of-scale figures clamp to the floor and the rim.
  assert.equal(P.scoreFor(1, scale), 0.22);
  assert.equal(P.scoreFor(1000, scale), 1);
  // A single-valued axis sits at the rim.
  assert.equal(P.scoreFor(4, P.makeScale([4])), 1);
  assert.equal(P.makeScale([null, Infinity]), null);

  assert.equal(P.axisScore({ state: "unmeasurable", value: null }, scale), null);
  assert.equal(P.axisScore({ state: "qualitative", value: null }, scale), null);
  assert.equal(P.axisScore({ state: "unlimited", value: Infinity }, scale), 1);
  assert.equal(P.axisScore({ state: "yops-only", value: null }, scale), 1);

  // Scales include range ends and exclude ∞.
  const axes = (value) => ({
    punch: value,
    kick: value,
    jump: value,
    speed: value,
    compute: value,
    emp: value,
  });
  const scales = P.buildScales([
    { axes: axes({ state: "exact", value: 150 }) },
    { axes: axes({ state: "mode-switch", value: 60000, min: 3000, max: 60000 }) },
    { axes: axes({ state: "unlimited", value: Infinity }) },
  ]);
  assert.deepEqual({ ...scales.compute }, { min: 150, max: 60000 });
});

test("leaderboard keys: bounds above equals, ranges by max, 100m by 1/t, YOPS-only first", () => {
  const exact = P.cellSortKey("8.24×");
  const bound = P.cellSortKey("≥8.24×");
  assert.ok(bound.primary > exact.primary);
  assert.deepEqual({ ...P.cellSortKey("20.0–400×") }, { primary: 400, secondary: 20 });
  assert.equal(P.cellSortKey("38,095×").primary, 38095);
  assert.equal(P.cellSortKey("60.0× + YOPS").primary, 60);
  assert.equal(P.cellSortKey("測定不能"), null);
  assert.equal(P.cellSortKey("動的再配分"), null);
  assert.equal(P.cellSortKey("—"), null);
  assert.ok(Math.abs(P.cellSortKey("0.6s/100m", "time").primary - 1 / 0.6) < 1e-9);
  assert.ok(
    P.cellSortKey("0.0000196s/100m", "time").primary > P.cellSortKey("0.001s/100m", "time").primary,
  );
  const yops = P.cellSortKey("20000YOPS / 200Core「Spark XR」");
  assert.equal(yops.primary, Infinity);
  assert.ok(yops.primary > P.cellSortKey("88888TOPS / 110Core").primary);

  const entries = ["1.00×", "測定不能", "≥9.22×", "8.16×", "動的再配分", "8.16×"].map(
    (text, index) => ({ index, key: P.cellSortKey(text) }),
  );
  const down = [...P.orderRows(entries, "descending")].map((entry) => entry.index);
  assert.deepEqual(down, [2, 3, 5, 0, 1, 4]);
  const up = [...P.orderRows(entries, "ascending")].map((entry) => entry.index);
  assert.deepEqual(up, [0, 3, 5, 2, 1, 4]);
  const ranks = P.rankEntries(entries);
  assert.deepEqual(
    entries.map((entry) => ranks.get(entry) ?? null),
    [4, null, 1, 2, null, 2],
  );
});

test("the layer stays out of storage, dialogs and the analyzer's class names", () => {
  assert.doesNotMatch(source, /localStorage|sessionStorage|indexedDB/);
  assert.doesNotMatch(source, /createElement\(\s*["']dialog|<dialog|showModal/);
  assert.doesNotMatch(source, /document\.title\s*=/);
  // Every class this script writes uses its own prefixes.
  const written = [
    ...[...source.matchAll(/class(?:Name)?\s*=\s*\\?["'`]([^"'`$]+)/g)].map((m) => m[1]),
    ...[...source.matchAll(/classList\.add\(([^)]*)\)/g)].map((m) => m[1]),
  ].join(" ");
  assert.ok(written.length > 0);
  for (const token of written.split(/[\s"',]+/).filter(Boolean))
    assert.match(token, /^(archive-|ap-|avp-)/, token);
  // It never creates the controllers' reserved elements.
  assert.doesNotMatch(source, /form-chip["'`]\s*;|\.className\s*=\s*["'`](?:form-chip|art-trigger|spec-item|compare-)/);
  // A classic script (no modules) for the opaque-origin frame.
  assert.doesNotMatch(source, /^\s*(import|export)\s/m);
});

test("both archives link the profile sheet last and its script after the analyzer", () => {
  for (const archive of ["saga", "realm"]) {
    for (const html of [
      read(`archives/${archive}-form-archive-standalone.html`),
      read(`public/${archive}-form-archive-embedded.html`),
    ]) {
      const deck = html.indexOf("/archive-deck.css?v=20261010-deck");
      const sheetAt = html.indexOf('<link rel="stylesheet" href="/archive-profile.css?v=20261010-rx9">');
      assert.ok(deck > 0 && sheetAt > deck, archive);
      const modern = html.indexOf("/archive-comparison-modern.js?v=20261009-diff");
      const script = html.indexOf('<script src="/archive-profile.js?v=20261010-rx9" defer></script>');
      assert.ok(modern > 0 && script > modern, archive);
    }
  }
});

test("the sheet is still paint with the 12px floor, focus rings and forced colours", () => {
  const css = sheet.replace(/\/\*[\s\S]*?\*\//g, "");
  assert.doesNotMatch(css, /@keyframes|animation|transition/);
  assert.doesNotMatch(css, /100vw|word-break:\s*break-all|line-break:\s*anywhere/);
  assert.match(css, /@media \(forced-colors: active\)/);
  assert.match(css, /\.archive-sort:focus-visible \{\s*outline: 2px solid var\(--ar-focus/);
  assert.match(css, /min-height: 44px !important;/);
  for (const [, size] of css.matchAll(/font-size: (\d+(?:\.\d+)?)px/g))
    assert.ok(Number(size) >= 12, size);
  for (const [, size] of css.matchAll(/font: \d+ (\d+)px/g)) assert.ok(Number(size) >= 12, size);
  // It styles only its own elements, never the analyzer's.
  assert.doesNotMatch(css, /\.compare-/);
});
