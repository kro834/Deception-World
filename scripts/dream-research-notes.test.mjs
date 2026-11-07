import test from "node:test";
import assert from "node:assert/strict";
import {
  emptyResearch,
  validateResearch,
  readResearch,
  writeResearch,
  removeResearchQuote,
  DREAM_RESEARCH_KEY,
  createResearchAnchor,
  resolveResearchQuote,
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
test("malformed source, duplicate identifiers and orphaned comparisons are discarded", () => {
  const value = {
    ...valid,
    quotes: [
      ...valid.quotes,
      a,
      { ...a, id: "bad", paragraph: -1 },
      { ...b, id: "foreign", text: "" },
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

const source = (paragraphs, kind = "case", id = "0") => ({
  kind,
  id,
  title: kind === "case" ? "第一話" : "シエル",
  paragraphs: paragraphs.map((text, i) => ({
    id: kind === "case" ? `dream-case-${id}-paragraph-${i + 1}` : `overview-${i + 1}`,
    text,
  })),
});
const anchored = (
  text,
  start,
  end,
  kind = "case",
  id = "0",
  paragraphId = "dream-case-0-paragraph-1",
) => ({
  id: "anchored",
  paragraph: 1,
  text: text.slice(start, end),
  source: { kind, id, title: "保存当時の題", paragraphId },
  anchor: createResearchAnchor(text, start, end),
});

test("v1 snapshots and notes survive source revisions and deleted chapters without a corruption warning", () => {
  const revised = [{ no: "0", paragraphs: ["本文は書き直されました。"] }];
  const result = readResearch({ getItem: () => JSON.stringify(valid) }, revised);
  assert.deepEqual(result, { data: valid, error: "" });
  assert.deepEqual(validateResearch(valid, []), valid);
  assert.equal(resolveResearchQuote(a, []).status, "missing");
  assert.equal(resolveResearchQuote(a, [source(["本文は書き直されました。"])]).status, "missing");
});

test("legacy titleless v1 quote resolves only when its exact text has one occurrence", () => {
  const result = resolveResearchQuote(a, [source(cases[0].paragraphs)]);
  assert.equal(result.status, "resolved");
  assert.equal(result.start, 2);
  assert.equal(result.paragraph.id, "dream-case-0-paragraph-1");
  assert.equal(
    resolveResearchQuote(a, [source([cases[0].paragraphs[0], cases[0].paragraphs[0]])]).status,
    "ambiguous",
  );
});

test("actual selection offsets distinguish repeated words through prefix and suffix", () => {
  const text = "朝の夢。夜の夢。";
  const quote = anchored(text, 6, 7);
  const result = resolveResearchQuote(quote, [source([text])]);
  assert.equal(quote.text, "夢");
  assert.equal(result.status, "resolved");
  assert.equal(result.start, 6);
  assert.equal(result.end, 7);
  assert.deepEqual(createResearchAnchor(text, 0, 1), {
    exact: "朝",
    prefix: "",
    suffix: "の夢。夜の夢。",
  });
  for (const [start, end] of [
    [-1, 2],
    [0, 100],
    [4, 3],
    [1.5, 2],
  ])
    assert.equal(createResearchAnchor(text, start, end), null);
});

test("unchanged local context resolves after paragraphs move or unrelated text is added", () => {
  const original = `${"前".repeat(80)}夢${"後".repeat(80)}`;
  const quote = anchored(original, 80, 81);
  const current = source(["新しい段落", `追記${original}追記`]);
  const result = resolveResearchQuote(quote, [current]);
  assert.equal(result.status, "resolved");
  assert.equal(result.paragraph.id, "dream-case-0-paragraph-2");
  assert.equal(result.start, 82);
  assert.equal(quote.source.title, "保存当時の題");
});

test("duplicate context remains ambiguous even when one candidate has the old paragraph number", () => {
  const text = "前の夢の後";
  const quote = anchored(text, 2, 3);
  assert.equal(resolveResearchQuote(quote, [source([text, text])]).status, "ambiguous");
  assert.equal(resolveResearchQuote(quote, [source([text]), source([text])]).status, "ambiguous");
  assert.equal(resolveResearchQuote(quote, [source(["前の夢は改訂"])]).status, "missing");
});

test("deleted or edited person sources keep both quotes and their mixed-source thought", () => {
  const text = "シエルは夢を守る。";
  const person = anchored(text, 0, 3, "person", "ciel", "overview-1");
  const mixed = {
    version: 1,
    quotes: [a, person],
    notes: [{ id: "mixed", quoteIds: [a.id, person.id], thought: "物語と人物資料を照合する。" }],
  };
  const loaded = validateResearch(mixed, []);
  assert.deepEqual(loaded, mixed);
  assert.equal(resolveResearchQuote(person, [source([text], "person", "ciel")]).status, "resolved");
  assert.equal(resolveResearchQuote(person, [source([text], "case", "ciel")]).status, "missing");
  assert.equal(resolveResearchQuote(person, []).status, "missing");
  assert.equal(
    resolveResearchQuote(person, [source(["シエルの新しい紹介。"], "person", "ciel")]).status,
    "missing",
  );
  assert.equal(loaded.notes.length, 1);
  assert.equal(loaded.quotes[1].text, "シエル");
});

test("malformed contextual anchors are corruption, independently of current source revision", () => {
  const quote = anchored("朝の夢", 2, 3);
  for (const anchor of [
    { ...quote.anchor, exact: "別の文" },
    { ...quote.anchor, prefix: 5 },
    { ...quote.anchor, suffix: "a".repeat(129) },
  ]) {
    const value = { version: 1, quotes: [{ ...quote, anchor }], notes: [] };
    const result = readResearch({ getItem: () => JSON.stringify(value) }, []);
    assert.equal(result.data.quotes.length, 0);
    assert.ok(result.error);
  }
});

test("legacy v1 refuses a unique exact match moved to another paragraph without saved context", () => {
  const current = [source(["改訂で挿入された新段落", cases[0].paragraphs[0]])];
  assert.equal(resolveResearchQuote(a, current).status, "missing");
  const text = cases[0].paragraphs[0];
  const start = text.indexOf(a.text);
  const contextual = {
    ...a,
    source: { kind: "case", id: "0", title: "旧題", paragraphId: "dream-case-0-paragraph-1" },
    anchor: createResearchAnchor(text, start, start + a.text.length),
  };
  const result = resolveResearchQuote(contextual, current);
  assert.equal(result.status, "resolved");
  assert.equal(result.paragraph.id, "dream-case-0-paragraph-2");
  assert.deepEqual(validateResearch({ version: 1, quotes: [a], notes: [] }, []).quotes, [a]);
});

test("published CASE and Ciel overview remain a readable pair when one source disappears", async () => {
  const { DREAM_CASES, DREAM_CHARACTERS } =
    await import("../src/components/dream-chapter/dream-chapter-data.ts");
  const chapter = DREAM_CASES[0];
  const person = DREAM_CHARACTERS.find((item) => item.id === "ciel");
  const section = person.sections.findIndex((item) => item.title === "概要");
  const sources = [
    {
      kind: "case",
      id: chapter.no,
      title: chapter.title,
      paragraphs: [{ id: `dream-case-${chapter.no}-paragraph-1`, text: chapter.paragraphs[0] }],
    },
    {
      kind: "person",
      id: person.id,
      title: person.name,
      paragraphs: [
        {
          id: `dream-person-ciel-section-${section + 1}-paragraph-1`,
          text: person.sections[section].paragraphs[0],
        },
      ],
    },
  ];
  const quotes = sources.map(({ kind, id, title, paragraphs }) => {
    const p = paragraphs[0];
    return {
      ...anchored(p.text, 0, 12, kind, id, p.id),
      id: kind,
      source: { kind, id, title, paragraphId: p.id },
    };
  });
  const notes = [{ id: "pair", quoteIds: ["case", "person"], thought: "二つの出典を読み比べる。" }];
  const snapshot = { version: 1, quotes, notes };
  assert.deepEqual(validateResearch(snapshot), snapshot);
  for (const q of quotes) assert.equal(resolveResearchQuote(q, sources).status, "resolved");
  assert.equal(resolveResearchQuote(quotes[1], sources.slice(0, 1)).status, "missing");
});
