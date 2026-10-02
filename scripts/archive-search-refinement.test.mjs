import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const source = readFileSync(
  new URL("../archives/saga-form-archive-standalone.html", import.meta.url),
  "utf8",
);
const normalization = source.match(/ {2}const normalizeSearchText = [^\n]+;/)?.[0];
assert.ok(normalization, "archive search normalization exists");
const functions = ["visibleItems", "filterForms", "moveSelection", "resetSearch"].map((name) => {
  const declaration = source.match(new RegExp(` {2}function ${name}\\([\\s\\S]*?\\n {2}\\}`))?.[0];
  assert.ok(declaration, `${name} exists in the archive controller`);
  return declaration;
});
const resetBindings = source.match(
  / {2}clearSearch\.addEventListener\('click', resetSearch\);\n {2}noResults\.querySelector\('\.selector-empty-reset'\)\.addEventListener\('click', resetSearch\);/,
)?.[0];
assert.ok(resetBindings, "both clear buttons share the archive reset handler");

function searchHarness() {
  const listeners = new Map();
  const hint = { hidden: false };
  const resetButton = {
    addEventListener: (_type, callback) => listeners.set("empty", callback),
  };
  const items = [
    "S-01 マルチ [試作]",
    "S-02 レクソナンス・マックス",
    "S-03 レクソナンス・ウルトラ",
  ].map((name, index) => {
    const chip = { textContent: name, hidden: false, tabIndex: -1, closest: () => stage };
    const stage = { hidden: false, querySelectorAll: () => [chip] };
    return {
      index,
      chip,
      stage,
      article: { querySelector: () => ({ textContent: name }) },
    };
  });
  const context = vm.createContext({
    items,
    selectedIndex: 0,
    sheetOpen: true,
    selectionCalls: [],
    searchInput: { value: "", focus: () => (context.searchFocused = true) },
    clearSearch: {
      hidden: true,
      tabIndex: -1,
      classList: { toggle() {} },
      addEventListener: (_type, callback) => listeners.set("clear", callback),
    },
    selector: { querySelectorAll: () => items.map((item) => item.stage) },
    tools: { querySelector: () => hint },
    noResults: { hidden: true, querySelector: () => resetButton },
    searchSummary: { firstElementChild: {}, lastElementChild: {} },
    selectForm: (index, options) => context.selectionCalls.push({ index, options }),
  });
  vm.runInContext([normalization, ...functions, resetBindings].join("\n"), context);
  return {
    context,
    matches: () => items.filter((item) => !item.chip.hidden).map((item) => item.index),
    filter(value) {
      context.searchInput.value = value;
      context.filterForms();
    },
    reset: (button) => listeners.get(button)(),
  };
}

test("archive search combines normalized words, names, and form codes", () => {
  const harness = searchHarness();
  harness.filter("ﾚｸｿﾅﾝｽ　ｳﾙﾄﾗ");
  assert.deepEqual(harness.matches(), [2]);
  harness.filter("Ｓ－０３  ｳﾙﾄﾗ");
  assert.deepEqual(harness.matches(), [2]);
  harness.filter("ﾚｸｿﾅﾝｽ");
  assert.deepEqual(harness.matches(), [1, 2]);
  for (const blank of ["", "　 "]) {
    harness.filter(blank);
    assert.deepEqual(harness.matches(), [0, 1, 2]);
    assert.equal(harness.context.noResults.hidden, true);
    assert.equal(harness.context.clearSearch.hidden, true);
  }
});

test("no matches stay empty and regex characters remain literal search text", () => {
  const harness = searchHarness();
  for (const query of ["フォーム 未登録", ".*", "[未登録"]) {
    assert.doesNotThrow(() => harness.filter(query));
    assert.deepEqual(harness.matches(), []);
    assert.equal(harness.context.noResults.hidden, false);
    assert.equal(harness.context.searchSummary.lastElementChild.textContent, "NO MATCH");
  }
  harness.filter("[試作]");
  assert.deepEqual(harness.matches(), [0]);
  harness.filter("[");
  assert.deepEqual(harness.matches(), [0]);
});

test("candidate arrows follow focus while toolbar movement defaults to the selected form", () => {
  const { context } = searchHarness();
  context.selectedIndex = 2;
  const options = { focus: true, announce: true };
  context.moveSelection(1, options, 0);
  assert.equal(context.selectionCalls.at(-1).index, 1);
  assert.equal(context.selectionCalls.at(-1).options, options);
  context.moveSelection(1);
  assert.equal(context.selectionCalls.at(-1).index, 0);
  context.moveSelection(-1, options, 0);
  assert.equal(context.selectionCalls.at(-1).index, 2);
});

test("both clear buttons restore results and input focus without changing form or modal", () => {
  for (const button of ["clear", "empty"]) {
    const harness = searchHarness();
    harness.context.selectedIndex = 2;
    harness.filter("該当なし");
    harness.reset(button);
    assert.equal(harness.context.searchInput.value, "");
    assert.deepEqual(harness.matches(), [0, 1, 2]);
    assert.equal(harness.context.searchFocused, true);
    assert.equal(harness.context.selectedIndex, 2);
    assert.equal(harness.context.sheetOpen, true);
    assert.deepEqual(harness.context.selectionCalls, []);
  }
});
