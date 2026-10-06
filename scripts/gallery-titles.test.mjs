import assert from "node:assert/strict";
import test from "node:test";
import {
  GALLERY_TITLES_KEY,
  readGalleryTitles,
  saveGalleryTitle,
} from "../src/components/gallery/gallery-titles.ts";

function storage(initial = null) {
  let value = initial;
  return {
    getItem: () => value,
    setItem: (key, next) => {
      assert.equal(key, GALLERY_TITLES_KEY);
      value = next;
    },
  };
}

test("new browsers have only numbers, and each browser's title storage is independent", () => {
  const first = storage(),
    second = storage();
  assert.deepEqual(readGalleryTitles(first), {});
  saveGalleryTitle(first, "g66", " 私の作品名 ");
  assert.deepEqual(readGalleryTitles(first), { g66: "私の作品名" });
  assert.deepEqual(readGalleryTitles(second), {});
});
test("saved titles survive another read, can be re-edited, and empty titles restore numbers", () => {
  const local = storage();
  saveGalleryTitle(local, "g01", "初めのタイトル");
  assert.equal(readGalleryTitles(local).g01, "初めのタイトル");
  saveGalleryTitle(local, "g01", "改訂版");
  assert.equal(readGalleryTitles(local).g01, "改訂版");
  saveGalleryTitle(local, "g01", "  ");
  assert.deepEqual(readGalleryTitles(local), {});
});
test("saving reads fresh storage and preserves another tab's changes to other pictures", () => {
  const local = storage();
  saveGalleryTitle(local, "g01", "一番");
  saveGalleryTitle(local, "g02", "二番");
  saveGalleryTitle(local, "g01", "一番の再編集");
  assert.deepEqual(readGalleryTitles(local), { g01: "一番の再編集", g02: "二番" });
});
test("corrupt or unexpected saved entries cannot inject markup or poison the title map", () => {
  for (const raw of ["{", "null", "[]", "42"])
    assert.deepEqual(readGalleryTitles(storage(raw)), {});
  assert.deepEqual(
    readGalleryTitles(
      storage(
        JSON.stringify({
          g01: "<script>text only</script>",
          __bad: "bad",
          g02: 2,
          g03: "",
          g04: "a".repeat(101),
        }),
      ),
    ),
    { g01: "<script>text only</script>" },
  );
});
test("quota, disabled storage and excessive titles fail rather than report a false save", () => {
  const local = storage();
  assert.throws(() => saveGalleryTitle(local, "g01", "a".repeat(101)));
  assert.throws(() => saveGalleryTitle(local, "__proto__", "bad"));
  assert.throws(() =>
    saveGalleryTitle(
      {
        getItem: () => null,
        setItem: () => {
          throw new Error("quota");
        },
      },
      "g01",
      "title",
    ),
  );
  assert.deepEqual(readGalleryTitles(local), {});
});
