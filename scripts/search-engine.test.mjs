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
