import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { DREAM_CASES, DREAM_POSTERS } from "../src/components/dream-chapter/dream-chapter-data.ts";
import { DREAM_CHRONICLE } from "../src/components/dream-chapter/dream-chapter-extra-data.ts";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("the three programme entrances resolve to existing records without tallies", () => {
  const desk = read("src/components/dream-chapter/dream-programme-desk.tsx");
  const chapter = read("src/components/dream-chapter/dream-chapter.tsx");
  const explorer = read("src/components/dream-chapter/dream-record-explorer.tsx");
  const navigation = read("src/components/dream-chapter/dream-story-navigation.tsx");

  assert.ok(DREAM_POSTERS.length > 0);
  assert.equal(DREAM_CASES.length, 6);
  assert.ok(DREAM_CHRONICLE.length > 0);
  assert.match(desk, /href: "#posters"/);
  assert.match(desk, /href: "#dream-chapter-stage"/);
  assert.match(desk, /href: "#dream-record-explorer"/);
  // Owner (2026-10-23): 不要なセカンダリラベルを削除（レイアウトで説明）
  // The tickets name their way in; the counts (15点の絵看板, 53件の出来事) are gone.
  assert.doesNotMatch(desk, /DREAM_POSTERS\.length|DREAM_CHRONICLE\.length/);
  assert.doesNotMatch(desk, /dream-programme-ledger/);
  assert.match(chapter, /id="posters"/);
  assert.match(navigation, /id="dream-chapter-index"/);
  assert.match(explorer, /id="dream-record-explorer"/);
});

test("each chapter companion can link only to its own canonical chronicle events", () => {
  const navigation = read("src/components/dream-chapter/dream-story-navigation.tsx");
  const chronicle = read("src/components/dream-chapter/dream-chapter-extra.tsx");
  const eventNumbers = new Set();

  for (const event of DREAM_CHRONICLE) {
    assert.ok(DREAM_CASES.some((episode) => episode.no === event.case));
    assert.ok(event.title.text && event.place);
    assert.ok(!eventNumbers.has(event.no), `duplicate event number ${event.no}`);
    eventNumbers.add(event.no);
  }

  assert.match(navigation, /DREAM_CHRONICLE\.filter\(\(event\) => event\.case === no\)/);
  assert.match(navigation, /#dream-chronicle-event-\$\{event\.no\}/);
  assert.match(chronicle, /id=\{`dream-chronicle-event-\$\{event\.no\}`\}/);
  // Owner (2026-10-23): 不要なセカンダリラベルを削除（レイアウトで説明）
  // The index and the paragraph guide no longer print paragraph tallies.
  assert.doesNotMatch(navigation, /episode\.paragraphs\.length\}段落/);
  assert.match(navigation, /aria-current=\{location\.current === episode\.no \? "location"/);
});

test("programme and chapter guide have narrow-width and accessibility styles", () => {
  const css = read("src/styles-dream-programme.css");
  assert.match(css, /@media \(max-width: 359px\)/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /@media \(forced-colors: active\)/);
  assert.match(css, /\.dream-programme-ticket:focus-visible/);
  assert.match(css, /#dream-record-explorer\s*\{[^}]*scroll-margin-top:/);
});
