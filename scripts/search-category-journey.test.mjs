import assert from "node:assert/strict";
import test from "node:test";
import { SEARCH_CATEGORIES, isSearchCategory } from "../src/lib/search-categories.ts";
import { validateSearchState } from "../src/components/search/search-state.ts";
import { recordReturnSourceSearch } from "../src/lib/record-return-state.ts";

test("every displayed category survives a filtered search and reading-return journey", () => {
  for (const { id } of SEARCH_CATEGORIES) {
    const source = validateSearchState({ q: "サーガ", category: id, shown: 72 });
    const returned = recordReturnSourceSearch("/search", source);
    assert.ok(returned, id);
    const restored = validateSearchState(returned);
    assert.equal(restored.q, source.q, id);
    assert.equal(restored.category ?? "all", id);
    assert.equal(restored.shown, source.shown, id);
  }
});

test("unknown and non-string categories cannot enter a saved reading journey", () => {
  for (const value of ["obsolete", "__proto__", "constructor", ["people"], {}, null, 0]) {
    assert.equal(isSearchCategory(value), false);
    assert.equal(validateSearchState({ category: value }).category, undefined);
    assert.deepEqual(recordReturnSourceSearch("/search", { q: "人物", category: value }), {
      q: "人物",
    });
  }
});
