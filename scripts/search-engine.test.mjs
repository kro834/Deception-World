import assert from "node:assert/strict";
import test from "node:test";
import { searchDocuments } from "../src/components/search/search-engine.ts";

const documents = [
  {
    id: "body",
    title: "記録資料",
    category: "archive",
    description: "本文を含む資料です。",
    body: "北の塔で青い仮面を発見した。",
    keywords: ["調査記録"],
    to: "/archive",
  },
  {
    id: "keyword",
    title: "調査の手引き",
    category: "guide",
    description: "現地で確認するための記録です。",
    keywords: ["青い仮面", "北の塔"],
    to: "/guide",
  },
  {
    id: "title-prefix",
    title: "青い仮面の記録",
    category: "archive",
    description: "北の塔で見つかった青い仮面について記録しています。",
    to: "/tower",
  },
  {
    id: "title-exact",
    title: "青い仮面",
    category: "portrait",
    description: "北の塔で見つかった姿を記録しています。",
    to: "/mask",
  },
  {
    id: "kana",
    title: "カタカナ資料",
    category: "archive",
    description: "ひらがなとカタカナの読み分けを扱います。",
    to: "/kana",
  },
  {
    id: "english",
    title: "Blue Mask",
    category: "guide",
    description: "An English language entry.",
    to: "/blue-mask",
  },
];

test("normalizes hiragana, katakana, full-width text, and Latin case", () => {
  assert.deepEqual(searchDocuments(documents, "かたかな").map(({ document }) => document.id), ["kana"]);
  assert.deepEqual(searchDocuments(documents, "ｶﾀｶﾅ").map(({ document }) => document.id), ["kana"]);
  assert.deepEqual(searchDocuments(documents, "BLUE MASK").map(({ document }) => document.id), ["english"]);
  assert.deepEqual(searchDocuments(documents, "ＢＬＵＥ ＭＡＳＫ").map(({ document }) => document.id), ["english"]);
});

test("requires every whitespace-separated term and ranks exact, prefix, title, keyword, then body matches", () => {
  const results = searchDocuments(documents, "北の塔 青い仮面");
  assert.deepEqual(new Set(results.map(({ document }) => document.id)), new Set([
    "title-exact",
    "title-prefix",
    "keyword",
    "body",
  ]));
  assert.deepEqual(searchDocuments(documents, "青い仮面").map(({ document }) => document.id), [
    "title-exact",
    "title-prefix",
    "keyword",
    "body",
  ]);
  assert.deepEqual(searchDocuments(documents, "北の塔 未登録語"), []);
});

test("returns a readable plain-text snippet near a body match when description has no match", () => {
  const [result] = searchDocuments(documents, "青い仮面", "archive").filter(
    ({ document }) => document.id === "body",
  );
  assert.equal(result.snippet, "北の塔で青い仮面を発見した。");
  assert.doesNotMatch(result.snippet, /<[^>]*>/);
});

test("keeps snippet offsets aligned when half-width voiced kana normalize into one character", () => {
  const document = {
    id: "voiced-kana",
    title: "濁点資料",
    category: "archive",
    description: `${"前".repeat(100)}ｶﾞ${"後".repeat(100)}`,
    to: "/voiced-kana",
  };
  const [result] = searchDocuments([document], "が");
  assert.ok(result.snippet.includes("ｶﾞ"));
  assert.ok(result.snippet.length <= 182);
});

test("applies category filtering and keeps source order for empty queries and ties", () => {
  assert.deepEqual(searchDocuments(documents, "", "archive").map(({ document }) => document.id), [
    "body",
    "title-prefix",
    "kana",
  ]);
  const ties = [documents[0], { ...documents[0], id: "body-second" }];
  assert.deepEqual(searchDocuments(ties, "記録資料").map(({ document }) => document.id), [
    "body",
    "body-second",
  ]);
});

test("bounds long input, creates snippets without mutating source documents", () => {
  const source = structuredClone(documents);
  const longQuery = `${"無関係語".repeat(40)}青い仮面`;
  const longResult = searchDocuments(documents, longQuery);
  assert.deepEqual(longResult, []);

  const results = searchDocuments(documents, "青い仮面");
  assert.ok(results.every(({ snippet }) => snippet.length <= 182));
  assert.deepEqual(documents, source);
});

// rx6: aliases, romaji, folding, chapter deep links, dedupe, highlights, suggestions.
import {
  findMatchRanges,
  groupSearchResults,
  looseSearchKey,
  normalizeSearchText,
  suggestSearchQueries,
  toRomaji,
} from "../src/components/search/search-engine.ts";

const people = [
  {
    id: "rider",
    title: "仮面ライダーヴァンダール",
    category: "riders",
    description: "秩序の神が振るう拳。",
    body: "第一章\n序文の段落。\n第二章\n口内には鋭い毒牙を備える。",
    sections: [
      { no: "01", title: "第一章" },
      { no: "02", title: "第二章" },
    ],
    keywords: ["レックス・ロワ"],
    aliases: ["vandal"],
    to: "/riders/vandal",
    hash: "dossier-profile",
  },
  {
    id: "roster",
    title: "序文の記録",
    category: "people",
    description: "ロースターの紹介。",
    to: "/riders/vandal",
    hash: "dossier-profile",
    secondary: true,
  },
  {
    id: "zeus",
    title: "ゼウス",
    category: "people",
    description: "第一位。",
    to: "/managers/zeus",
    hash: "dossier-profile",
  },
  {
    id: "term",
    title: "六詠",
    category: "world",
    description: "ゼウスを頂点とする管理人。",
    to: "/world",
    hash: "wa-term-六詠",
  },
];

test("folds kana, width, ヴ spellings and middle dots; romaji follows Hepburn", () => {
  assert.equal(normalizeSearchText("ｾﾞｳｽ"), "ぜうす");
  assert.equal(looseSearchKey(normalizeSearchText("レックス・ロワ")), "れっくすろわ");
  assert.equal(looseSearchKey(normalizeSearchText("ヴァンダール")), "ばんだーる");
  assert.equal(toRomaji(normalizeSearchText("ゼウス")), "zeusu");
  assert.equal(toRomaji(normalizeSearchText("シュザ")), "shuza");
  assert.equal(toRomaji(normalizeSearchText("レックス")), "rekkusu");
  assert.equal(toRomaji("ちゃっと"), "chatto");
});

test("title hits outrank alias hits, which outrank text hits", () => {
  const ids = (query) => searchDocuments(people, query).map((result) => result.document.id);
  assert.deepEqual(ids("ゼウス"), ["zeus", "term"]);
  assert.equal(searchDocuments(people, "ゼウス")[0].tier, "title");
  assert.equal(searchDocuments(people, "ゼウス")[1].tier, "text");
  assert.deepEqual(ids("ばんだーる"), ["rider"]);
  assert.deepEqual(ids("れっくすろわ"), ["rider"]);
  assert.equal(searchDocuments(people, "れっくすろわ")[0].tier, "alias");
  assert.deepEqual(ids("VANDAL"), ["rider"]);
  assert.deepEqual(ids("zeu"), ["zeus"]);
  assert.equal(ids("ぜう")[0], "zeus");
});

test("one result per dossier, preferring the dossier itself over a roster card", () => {
  const results = searchDocuments(people, "ヴァンダール");
  assert.deepEqual(results.map((result) => result.document.id), ["rider"]);
  // The roster card names it; the dossier (a text hit) stands for both.
  const both = searchDocuments(people, "序文");
  assert.deepEqual(both.map((result) => result.document.id), ["rider"]);
  assert.equal(both[0].via, "序文の記録");
  // Only the roster card matched: it stands in.
  assert.deepEqual(searchDocuments(people, "記録").map((result) => result.document.id), ["roster"]);
});

test("a body hit opens the dossier chapter it was found in; a name hit opens the record", () => {
  const [hit] = searchDocuments(people, "毒牙");
  assert.equal(hit.hash, "character-section-02");
  assert.equal(hit.section, "02 · 第二章");
  assert.match(hit.snippet, /毒牙/);
  const [name] = searchDocuments(people, "ヴァンダール");
  assert.equal(name.hash, "dossier-profile");
  assert.equal(name.section, undefined);
});

test("highlight ranges are source offsets, merged, and survive width folding", () => {
  assert.deepEqual(findMatchRanges("仮面ライダーヴァンダール", ["ばんだーる", "ゔぁんだーる"]), [[6, 12]]);
  assert.deepEqual(findMatchRanges("ｾﾞｳｽとゼウス", ["ぜうす"]), [[0, 4], [5, 8]]);
  const [result] = searchDocuments(people, "毒牙");
  const [start, end] = result.snippetRanges[0];
  assert.equal(result.snippet.slice(start, end), "毒牙");
  assert.deepEqual(searchDocuments(people, "ゼウス")[0].titleRanges, [[0, 3]]);
});

test("close spellings are suggested only when nothing matched", () => {
  assert.deepEqual(searchDocuments(people, "ぜうず"), []);
  assert.ok(suggestSearchQueries(people, "ぜうず").includes("ゼウス"));
  assert.ok(suggestSearchQueries(people, "vandel").includes("vandal"));
  assert.deepEqual(suggestSearchQueries(people, "まったく別の言葉"), []);
});

test("groups follow their best hit when ranked and the given order when browsing", () => {
  const ranked = groupSearchResults(searchDocuments(people, "ゼウス"), ["world", "people", "riders"], true);
  assert.deepEqual(ranked.map((group) => group.category), ["people", "world"]);
  const browse = groupSearchResults(searchDocuments(people, ""), ["world", "people", "riders"], false);
  assert.deepEqual(browse.map((group) => group.category), ["world", "people", "riders"]);
});
