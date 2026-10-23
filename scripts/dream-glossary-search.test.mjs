import assert from "node:assert/strict";
import test from "node:test";
import {
  buildDreamGlossarySearch,
  dreamGlossaryExcerpt,
  filterDreamGlossarySearch,
  focusDreamGlossaryTerm,
} from "../src/lib/dream-glossary-search.ts";
import { DREAM_GLOSSARY } from "../src/components/dream-chapter/dream-chapter-data.ts";
import { DREAM_GLOSSARY_SUPPLEMENT } from "../src/components/dream-chapter/dream-chapter-extra-data.ts";

const entries = buildDreamGlossarySearch(DREAM_GLOSSARY, DREAM_GLOSSARY_SUPPLEMENT);

test("filtered results retain every canonical term's original anchor and source order", () => {
  assert.equal(entries.length, DREAM_GLOSSARY.length);
  assert.deepEqual(
    entries.map((entry) => entry.term),
    DREAM_GLOSSARY.map((entry) => entry.term),
  );
  for (const [index, entry] of entries.entries()) {
    assert.equal(entry.href, `#dream-term-${index + 1}`);
  }
  const result = filterDreamGlossarySearch(entries, "げんそうきょう");
  const canonical = entries.find((entry) => entry.term === "幻想郷");
  assert.ok(result.includes(canonical));
  assert.equal(canonical.href, "#dream-term-12");
  assert.ok(filterDreamGlossarySearch(entries, "\u3000").length === entries.length);
});

test("name, ordinary readings, kana and width normalize without changing displayed source text", () => {
  for (const query of ["べるべっと", "ベルベット", "ﾍﾞﾙﾍﾞｯﾄ"]) {
    assert.deepEqual(
      filterDreamGlossarySearch(entries, query).map((entry) => entry.term),
      ["ベルベットルーム"],
    );
  }
  assert.deepEqual(
    filterDreamGlossarySearch(entries, "ハクレイダイケッカイ").map((entry) => entry.term),
    ["博麗大結界"],
  );
  assert.equal(
    entries.find((entry) => entry.term === "夢主").reading,
    "",
    "do not invent an unsupported story reading",
  );
  assert.equal(entries.find((entry) => entry.term === "心の扉").term, "心の扉");
});

test("definitions, quotes, segmented supplements and speakers remain searchable", () => {
  assert.ok(filterDreamGlossarySearch(entries, "裸婦像").some((entry) => entry.term === "心の扉"));
  assert.ok(
    filterDreamGlossarySearch(entries, "精神最奥").some((entry) => entry.term === "ゴアナイトメア"),
  );
  assert.ok(
    filterDreamGlossarySearch(entries, "水族館").some((entry) => entry.term === "ベルベットルーム"),
  );
  assert.ok(
    filterDreamGlossarySearch(entries, "八雲紫").some((entry) => entry.term === "博麗大結界"),
  );
  assert.ok(
    filterDreamGlossarySearch(entries, "精神の侵略者").some(
      (entry) => entry.term === "ゴアナイトメア",
    ),
  );
});

test("queries combine words with AND semantics and treat punctuation as literal text", () => {
  const matching = filterDreamGlossarySearch(entries, "ナイトメア 記憶");
  assert.deepEqual(
    matching.map((entry) => entry.term),
    ["ナイトメア"],
  );
  assert.deepEqual(filterDreamGlossarySearch(entries, "ナイトメア 実在しない言葉"), []);
  assert.deepEqual(filterDreamGlossarySearch(entries, "[.*"), []);
  assert.deepEqual(filterDreamGlossarySearch(entries, "<script>"), []);
  assert.deepEqual(
    filterDreamGlossarySearch(entries, " ナイトメア\u3000記憶 ナイトメア "),
    matching,
  );
});

test("matching excerpts show supplemental evidence and preserve original wording", () => {
  const room = entries.find((entry) => entry.term === "ベルベットルーム");
  const excerpt = dreamGlossaryExcerpt(room, "水族館");
  assert.ok(excerpt.includes("水族館"));
  assert.ok(room.passages.some((passage) => passage.includes(excerpt.replace(/^…|…$/gu, ""))));
  const noDescription = entries.find((entry) => entry.term === "超深層");
  assert.ok(dreamGlossaryExcerpt(noDescription).includes("超深層"));
});

test("long excerpts reveal late matches without splitting Unicode or exceeding the limit", () => {
  const text = `${"遠い夢🌙。".repeat(70)}ｶﾞﾗｽの扉が開く。${"夜の続き。".repeat(50)}`;
  const [entry] = buildDreamGlossarySearch([{ term: "夢", body: [text] }]);
  const excerpt = dreamGlossaryExcerpt(entry, "がらす", 80);
  assert.ok(excerpt.startsWith("…"));
  assert.ok(excerpt.endsWith("…"));
  assert.ok(excerpt.includes("ｶﾞﾗｽの扉が開く。"));
  assert.ok(Array.from(excerpt).length <= 80);
  assert.ok(text.includes(excerpt.slice(1, -1)));
  assert.ok(!excerpt.includes("�"));
});

function focusDocument(tabIndex = null, succeeds = true) {
  const attributes = new Map(tabIndex === null ? [] : [["tabindex", tabIndex]]);
  const document = { activeElement: null };
  let blur;
  const target = {
    getAttribute: (key) => attributes.get(key) ?? null,
    setAttribute: (key, value) => attributes.set(key, value),
    removeAttribute: (key) => attributes.delete(key),
    focus: (options) => {
      assert.deepEqual(options, { preventScroll: true });
      if (succeeds) document.activeElement = target;
    },
    addEventListener: (type, listener, options) => {
      assert.equal(type, "blur");
      assert.deepEqual(options, { once: true });
      blur = listener;
    },
  };
  document.getElementById = (id) => (id === "dream-term-12" ? target : null);
  return { document, attributes, blur: () => blur?.() };
}

test("native fragment focus temporarily makes the original term focusable and cleans up on blur", () => {
  const fixture = focusDocument();
  assert.equal(focusDreamGlossaryTerm("dream-term-12", fixture.document), true);
  assert.equal(fixture.attributes.get("tabindex"), "-1");
  assert.equal(fixture.attributes.get("data-dream-glossary-focused"), "true");
  fixture.blur();
  assert.equal(fixture.attributes.has("tabindex"), false);
  assert.equal(fixture.attributes.has("data-dream-glossary-focused"), false);
});

test("focus preserves existing tab order and gracefully handles unavailable targets", () => {
  const existing = focusDocument("0");
  focusDreamGlossaryTerm("dream-term-12", existing.document);
  existing.blur();
  assert.equal(existing.attributes.get("tabindex"), "0");
  assert.equal(focusDreamGlossaryTerm("missing", existing.document), false);
  const unavailable = focusDocument(null, false);
  assert.equal(focusDreamGlossaryTerm("dream-term-12", unavailable.document), false);
  assert.equal(unavailable.attributes.size, 0);
});
