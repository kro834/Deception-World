import assert from "node:assert/strict";
import test from "node:test";
import {
  buildDreamRecordOptions,
  dreamRecordExcerpt,
  dreamRecordPassageText,
  filterDreamRecords,
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

test("the eight Chronicle entries with Keiya's unspaced name resolve to the canonical character link", () => {
  const canonical = DREAM_CHARACTERS.find((person) => person.name === "東風谷 慶弥");
  assert.ok(canonical);

  const matchingRecords = DREAM_CHRONICLE.filter((record) => record.cast.includes("東風谷慶弥"));
  assert.equal(matchingRecords.length, 8);
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
