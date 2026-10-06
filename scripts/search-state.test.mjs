import assert from "node:assert/strict";
import test from "node:test";
import { validateSearchState } from "../src/components/search/search-state.ts";

test("coerces primitive query values and rejects arrays and objects", () => {
  assert.equal(validateSearchState({ q: 42 }).q, "42");
  assert.equal(validateSearchState({ q: false }).q, "false");
  assert.equal(validateSearchState({ q: null }).q, "null");
  assert.equal(validateSearchState({ q: ["invalid"] }).q, undefined);
  assert.equal(validateSearchState({ q: { text: "invalid" } }).q, undefined);
  assert.equal(validateSearchState({ q: "x".repeat(130) }).q, "x".repeat(120));
});

test("keeps only recognized categories and lets the page default unknown values to all", () => {
  assert.deepEqual(validateSearchState({ category: "people" }), {
    q: undefined,
    category: "people",
    shown: undefined,
  });
  assert.equal(validateSearchState({ category: "all" }).category, "all");
  assert.equal(validateSearchState({ category: "unknown" }).category, undefined);
});

test("clamps visible-result count and rejects non-finite values", () => {
  assert.equal(validateSearchState({ shown: 10 }).shown, 24);
  assert.equal(validateSearchState({ shown: 24 }).shown, 24);
  assert.equal(validateSearchState({ shown: 47.9 }).shown, 47);
  assert.equal(validateSearchState({ shown: 144 }).shown, 144);
  assert.equal(validateSearchState({ shown: 900 }).shown, 144);
  assert.equal(validateSearchState({ shown: "Infinity" }).shown, undefined);
  assert.equal(validateSearchState({ shown: Number.POSITIVE_INFINITY }).shown, undefined);
  assert.equal(validateSearchState({ shown: "not-a-number" }).shown, undefined);
  assert.equal(validateSearchState({ shown: Symbol("invalid") }).shown, undefined);
});
