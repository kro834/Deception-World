import test from "node:test";
import assert from "node:assert/strict";
import {
  emptyResearch,
  validateResearch,
  readResearch,
  writeResearch,
  removeResearchQuote,
  DREAM_RESEARCH_KEY,
} from "../src/lib/dream-research-store.js";
const cases = [
  { no: "0", paragraphs: ["朝の夢から目を覚ます。夢の続き。"] },
  { no: "1", paragraphs: ["夜の夢に戻る。"] },
];
const a = { id: "a", caseNo: "0", paragraph: 1, text: "夢から目を覚ます" };
const b = { id: "b", caseNo: "1", paragraph: 1, text: "夜の夢" };
const valid = {
  version: 1,
  quotes: [a, b],
  notes: [{ id: "note", quoteIds: ["a", "b"], thought: "二つの夢の境界を考える。" }],
};
test("arbitrary exact excerpts preserve source and paired thought across reload", () => {
  let raw;
  const storage = {
    setItem(key, value) {
      assert.equal(key, DREAM_RESEARCH_KEY);
      raw = value;
    },
    getItem() {
      return raw;
    },
  };
  assert.equal(writeResearch(storage, valid), true);
  assert.deepEqual(readResearch(storage, cases), { data: valid, error: "" });
});
test("invalid source, duplicate identifiers, foreign text and orphaned comparisons are discarded", () => {
  const value = {
    ...valid,
    quotes: [
      ...valid.quotes,
      a,
      { ...a, id: "bad", paragraph: 9 },
      { ...b, id: "foreign", text: "改変された文章" },
    ],
    notes: [
      ...valid.notes,
      { id: "orphan", quoteIds: ["a", "missing"], thought: "x" },
      { id: "same", quoteIds: ["a", "a"], thought: "x" },
    ],
  };
  assert.deepEqual(validateResearch(value, cases), valid);
});
test("malformed persisted values recover without throwing or silently overwriting storage", () => {
  for (const raw of ["{", "null", '{"version":2}', '{"version":1,"quotes":{},"notes":[]}']) {
    const result = readResearch(
      {
        getItem() {
          return raw;
        },
      },
      cases,
    );
    assert.deepEqual(result.data, emptyResearch());
    assert.ok(result.error);
  }
  assert.ok(
    readResearch(
      {
        getItem() {
          throw Error("denied");
        },
      },
      cases,
    ).error,
  );
});
test("quota or permission failure is explicit and leaves supplied state untouched", () => {
  const original = structuredClone(valid);
  assert.equal(
    writeResearch(
      {
        setItem() {
          throw Error("quota");
        },
      },
      valid,
    ),
    false,
  );
  assert.deepEqual(valid, original);
});
test("removing a quote also removes dependent comparisons while retaining unrelated quotes", () => {
  assert.deepEqual(removeResearchQuote(valid, "a"), { version: 1, quotes: [b], notes: [] });
  assert.deepEqual(valid.quotes, [a, b]);
});
test("oversized thoughts and excerpts cannot exhaust the reader during restoration", () => {
  assert.equal(
    validateResearch({ ...valid, notes: [{ ...valid.notes[0], thought: "x".repeat(8001) }] }, cases)
      .notes.length,
    0,
  );
  assert.equal(
    validateResearch(
      {
        ...valid,
        quotes: Array.from({ length: 110 }, (_, i) => ({ ...a, id: `q${i}` })),
        notes: [],
      },
      cases,
    ).quotes.length,
    100,
  );
});
