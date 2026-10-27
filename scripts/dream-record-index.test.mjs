import assert from "node:assert/strict";
import test from "node:test";
import {
  buildDreamRecordOptions,
  buildDreamRecordFacets,
  dreamRecordExcerpt,
  dreamRecordHighlight,
  dreamRecordNeighbours,
  dreamRecordPassageText,
  dreamRecordSearchTerms,
  filterDreamRecords,
  normalizeDreamRecordSearch,
  resolveDreamRecordLinks,
} from "../src/lib/dream-record-index.ts";
import { DREAM_CHRONICLE } from "../src/components/dream-chapter/dream-chapter-extra-data.ts";
import { DREAM_CHARACTERS } from "../src/components/dream-chapter/dream-chapter-data.ts";

const records = [
  { no: 1, case: "0", place: "人里", cast: ["シエル", "怪作"], text: "白い扉が開く。" },
  { no: 2, case: "1", place: "人里", cast: ["怪作"], segments: [{ text: "団子を囲む。" }] },
  { no: 3, case: "1", place: "永遠亭", cast: ["シエル"], text: "傷を癒やす。" },
];

test("filters combine CASE, person and place with AND semantics and retain source order", () => {
  assert.deepEqual(filterDreamRecords(records, { case: "1", person: "怪作", place: "人里" }), [
    records[1],
  ]);
  assert.deepEqual(filterDreamRecords(records, { case: "1", person: "シエル", place: "人里" }), []);
  assert.deepEqual(filterDreamRecords(records, { person: " 怪作 " }), [records[0], records[1]]);
  assert.deepEqual(filterDreamRecords(records, { case: "9" }), []);
});

test("filter options derive unique canonical values in stable order", () => {
  assert.deepEqual(buildDreamRecordOptions(records), {
    cases: ["0", "1"],
    places: ["人里", "永遠亭"],
    people: ["シエル", "怪作"],
  });
});

test("facet counts omit only their own selection and keep the query and other conditions", () => {
  const facets = buildDreamRecordFacets(records, { case: "1", person: "シエル", place: "人里" });
  assert.equal(facets.cases["0"], 1);
  assert.equal(facets.cases["1"] ?? 0, 0);
  assert.equal(facets.people["怪作"], 1);
  assert.equal(facets.people["シエル"] ?? 0, 0);
  assert.equal(facets.places["永遠亭"], 1);
  assert.equal(facets.places["人里"] ?? 0, 0);
  const queried = buildDreamRecordFacets(records, { query: "団子", person: "シエル" });
  assert.equal(queried.people["怪作"], 1);
  assert.equal(Object.keys(queried.cases).length, 0);
  assert.equal(Object.keys(queried.places).length, 0);
  const duplicated = buildDreamRecordFacets([{ ...records[0], cast: ["シエル", "シエル"] }]);
  assert.equal(duplicated.people["シエル"], 1, "count records, not repeated cast mentions");
});

test("record neighbours use source position across CASE boundaries and handle missing endpoints", () => {
  assert.deepEqual(dreamRecordNeighbours(records, 1), { previous: null, next: records[1] });
  assert.deepEqual(dreamRecordNeighbours(records, 2), { previous: records[0], next: records[2] });
  assert.deepEqual(dreamRecordNeighbours(records, 3), { previous: records[1], next: null });
  assert.deepEqual(dreamRecordNeighbours(records, 99), { previous: null, next: null });
  const sparse = [
    { ...records[0], no: 7 },
    { ...records[2], no: 40 },
  ];
  assert.equal(dreamRecordNeighbours(sparse, 7).next, sparse[1]);
  assert.deepEqual(dreamRecordNeighbours([], 1), { previous: null, next: null });
});

test("saved-pool facets count only retained records while chronological neighbours keep the full source", () => {
  const savedIds = new Set([1, 3]);
  const pool = records.filter((record) => savedIds.has(record.no));
  const facets = buildDreamRecordFacets(pool, { case: "1", person: "シエル" });
  assert.equal(facets.cases["0"], 1);
  assert.equal(facets.cases["1"], 1);
  assert.equal(facets.people["シエル"], 1);
  assert.equal(facets.people["怪作"] ?? 0, 0);
  assert.equal(facets.places["永遠亭"], 1);
  assert.equal(facets.places["人里"] ?? 0, 0);
  assert.equal(dreamRecordNeighbours(records, 1).next, records[1]);
  const empty = buildDreamRecordFacets([], { person: "シエル" });
  assert.deepEqual(Object.keys(empty.cases), []);
  assert.deepEqual(Object.keys(empty.people), []);
  assert.deepEqual(Object.keys(empty.places), []);
});

test("keyword spelling normalizes kana, width and case and splits unique AND terms", () => {
  assert.equal(normalizeDreamRecordSearch("ｼｴﾙ ＣＡＳＥ ガラス"), "しえる case がらす");
  assert.deepEqual(dreamRecordSearchTerms(" シエル\u3000ｼｴﾙ\nCASE "), ["しえる", "case"]);
  assert.deepEqual(dreamRecordSearchTerms(" \u3000 "), []);
});

test("keyword AND search combines title, source passage, cast and place with facets", () => {
  const source = [
    { ...records[0], title: { text: "白い扉" }, text: "ｶﾞﾗｽの向こう。" },
    { ...records[1], title: { text: "白い部屋" }, text: "ガラスの向こう。" },
    { ...records[2], title: { text: "朝食" } },
  ];
  assert.deepEqual(filterDreamRecords(source, { query: "白い がらす しえる 人里" }), [source[0]]);
  assert.deepEqual(filterDreamRecords(source, { query: "ガラス", person: "怪作", case: "1" }), [
    source[1],
  ]);
  assert.deepEqual(filterDreamRecords(source, { query: "ガラス", place: "永遠亭" }), []);
  assert.deepEqual(filterDreamRecords(source, { query: "存在しない言葉" }), []);
  assert.deepEqual(filterDreamRecords(source, { query: "   " }), source);
  assert.deepEqual(
    filterDreamRecords(source, { query: "[.*" }),
    [],
    "query is literal text, not a regular expression",
  );
  assert.deepEqual(
    filterDreamRecords(records, { query: "団子 怪作" }),
    [records[1]],
    "segmented passages are searchable",
  );
});

test("query-near excerpts surface late matches and keep original source spelling", () => {
  const source = `${"前の場面。".repeat(45)}ｶﾞﾗｽの扉が開く。${"後の場面。".repeat(35)}`;
  const excerpt = dreamRecordExcerpt({ text: source }, 90, "がらす");
  assert.ok(excerpt.startsWith("…"));
  assert.ok(excerpt.endsWith("…"));
  assert.ok(excerpt.includes("ｶﾞﾗｽの扉が開く。"));
  assert.ok(Array.from(excerpt).length <= 90);
  assert.ok(source.includes(excerpt.slice(1, -1)), "no canonical passage words are rewritten");
  assert.equal(dreamRecordExcerpt({ text: "シエルの声。" }, 90, "しえる"), "シエルの声。");
  assert.equal(
    dreamRecordExcerpt({ text: source }, 90, "本文にはない"),
    dreamRecordExcerpt({ text: source }, 90),
  );
});

test("highlight runs map normalized matches to exact original Unicode text", () => {
  const source = "声：ｶﾞﾗｽ、ガラス、か\u3099らす。<b>";
  const runs = dreamRecordHighlight(source, "がらす");
  assert.equal(runs.map((run) => run.text).join(""), source);
  assert.deepEqual(
    runs.filter((run) => run.match).map((run) => run.text),
    ["ｶﾞﾗｽ", "ガラス", "か\u3099らす"],
  );
  assert.deepEqual(dreamRecordHighlight("シエル", "し しえる"), [{ text: "シエル", match: true }]);
  assert.deepEqual(dreamRecordHighlight("<b>", "<b>"), [{ text: "<b>", match: true }]);
  assert.deepEqual(dreamRecordHighlight("本文", ""), [{ text: "本文", match: false }]);
});

test("passage summaries support both canonical passage shapes and stay compact", () => {
  assert.equal(dreamRecordPassageText(records[1]), "団子を囲む。");
  assert.equal(dreamRecordExcerpt(records[0]), "白い扉が開く。");
  assert.equal(dreamRecordExcerpt({ text: "abcdef" }, 4), "abc…");
  assert.equal(dreamRecordExcerpt({ segments: [{ text: "声" }, { text: "と景色" }] }), "声 と景色");
});

test("links target the exact Chronicle event and existing CASE, Atlas and person records", () => {
  const links = resolveDreamRecordLinks(records[0], {
    cases: [{ no: "0" }],
    places: [{ name: "人里" }],
    people: [{ name: "シエル", href: "#dream-character-ciel" }],
  });
  assert.deepEqual(links, {
    chronicleHref: "#dream-chronicle-event-1",
    synopsisHref: "#dream-case-0",
    placeHref: "#dream-atlas-1",
    people: [{ name: "シエル", href: "#dream-character-ciel" }],
  });

  assert.deepEqual(
    resolveDreamRecordLinks(
      { ...records[0], case: "8", place: "未知の場所", cast: ["未知の人物"] },
      {},
    ),
    { chronicleHref: null, synopsisHref: null, placeHref: null, people: [] },
  );
});

test("person link matching ignores whitespace only and preserves the Chronicle display name", () => {
  const record = { ...records[0], no: 42, cast: ["東風谷慶弥"] };
  const person = { name: "東風谷 慶弥", href: "#dream-roster-keiya" };

  assert.deepEqual(resolveDreamRecordLinks(record, { people: [person] }).people, [
    { name: "東風谷慶弥", href: "#dream-roster-keiya" },
  ]);
  assert.deepEqual(
    resolveDreamRecordLinks(record, {
      people: [person, { name: "東風谷\t慶弥", href: "#dream-roster-duplicate" }],
    }).people,
    [],
  );
});

test("the ten Chronicle entries including the headquarters split resolve Keiya's canonical character link", () => {
  const canonical = DREAM_CHARACTERS.find((person) => person.name === "東風谷 慶弥");
  assert.ok(canonical);

  const matchingRecords = DREAM_CHRONICLE.filter((record) => record.cast.includes("東風谷慶弥"));
  assert.equal(matchingRecords.length, 10);
  assert.equal(matchingRecords.at(-1).no, 54, "the headquarters split also links to Keiya");
  for (const record of matchingRecords) {
    assert.deepEqual(
      resolveDreamRecordLinks(record, {
        people: DREAM_CHARACTERS.map((person) => ({
          name: person.name,
          href: `#dream-character-${person.id}`,
        })),
      }).people.filter((link) => link.name === "東風谷慶弥"),
      [{ name: "東風谷慶弥", href: `#dream-character-${canonical.id}` }],
    );
  }
});

test("the explorer options and visible count come from the existing Chronicle records", () => {
  const options = buildDreamRecordOptions(DREAM_CHRONICLE);
  assert.equal(options.cases.length, 6);
  assert.ok(options.places.length > 1);
  assert.ok(options.people.length > 1);
  assert.ok(DREAM_CHRONICLE.length > 8);
  assert.equal(filterDreamRecords(DREAM_CHRONICLE).length, DREAM_CHRONICLE.length);
});
