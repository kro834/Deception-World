import assert from "node:assert/strict";
import test from "node:test";
import {
  galleryEmptyMessage,
  galleryFilterConditions,
  galleryFilterResultCount,
} from "../src/components/gallery/gallery-filter-summary-state.ts";

const state = {
  query: "",
  favoritesOnly: false,
  resultCount: 113,
  totalCount: 113,
};

test("discovery summary describes all intersecting conditions without exposing empty filters", () => {
  assert.equal(galleryFilterConditions(state), "");
  assert.equal(galleryFilterConditions({ ...state, query: "　 " }), "");
  assert.equal(
    galleryFilterConditions({
      ...state,
      query: "  青　 金  ",
      categoryLabel: "情景",
      favoritesOnly: true,
    }),
    "適用中の条件は「青 金」の検索、分類「情景」、お気に入りのみです。",
  );
  assert.equal(
    galleryFilterConditions({ ...state, query: "Ｕ００３" }),
    "適用中の条件は「Ｕ００３」の検索です。",
  );
});

test("result count includes the complete loaded collection and zero results", () => {
  assert.equal(galleryFilterResultCount(state), "全113作品のうち113作品を表示しています。");
  assert.equal(
    galleryFilterResultCount({ ...state, resultCount: 0, totalCount: 114 }),
    "全114作品のうち0作品を表示しています。",
  );
});

test("empty search guidance explains intersections and retains number-search advice", () => {
  assert.match(galleryEmptyMessage({ ...state, query: "003" }), /別の言葉や作品番号/);
  for (const filters of [{ categoryLabel: "情景" }, { favoritesOnly: true }]) {
    assert.match(
      galleryEmptyMessage({ ...state, query: "003", ...filters }),
      /中に見つかりません.*絞り込みを解除/,
    );
  }
  assert.match(
    galleryEmptyMessage({ ...state, query: "003", categoryLabel: "情景" }),
    /選択中の分類の中/,
  );
  assert.doesNotMatch(galleryEmptyMessage({ ...state, query: "003", favoritesOnly: true }), /分類/);
});

test("empty favorites, classification and unloaded collections each explain a useful next step", () => {
  assert.match(galleryEmptyMessage({ ...state, favoritesOnly: true }), /♡ お気に入り.*保存/);
  assert.match(
    galleryEmptyMessage({ ...state, categoryLabel: "情景", favoritesOnly: true }),
    /この分類にはお気に入り.*ほかの分類/,
  );
  assert.match(
    galleryEmptyMessage({ ...state, categoryLabel: "みんなの投稿" }),
    /この分類には作品/,
  );
  assert.equal(
    galleryEmptyMessage({ ...state, totalCount: 0, query: "青", favoritesOnly: true }),
    "展示する作品はまだありません。",
  );
});
