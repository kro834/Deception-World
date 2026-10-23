import assert from "node:assert/strict";
import test from "node:test";
import { isSearchCompositionKey } from "../src/components/search/search-ui-helpers.ts";

test("search confirmation and cancellation keys survive IME event ordering", () => {
  for (const key of ["Enter", "Escape", "ArrowDown"]) {
    assert.equal(isSearchCompositionKey({ key }, true, -Infinity, 100), true);
    assert.equal(isSearchCompositionKey({ key, isComposing: true }, false, -Infinity, 100), true);
    assert.equal(isSearchCompositionKey({ key, keyCode: 229 }, false, -Infinity, 100), true);
  }
  for (const key of ["Enter", "Escape"]) {
    assert.equal(isSearchCompositionKey({ key }, false, 100, 100), true);
    assert.equal(isSearchCompositionKey({ key }, false, 100, 149), true);
    assert.equal(isSearchCompositionKey({ key }, false, 100, 150), false);
    assert.equal(isSearchCompositionKey({ key }, false, -Infinity, 150), false);
  }
  assert.equal(isSearchCompositionKey({ key: "ArrowDown" }, false, 100, 101), false);
  assert.equal(isSearchCompositionKey({ key: "a" }, false, 100, 101), false);
});

let sequence = 0;
async function withStore(action, initial = ["既存の検索"]) {
  const previous = globalThis.window;
  const data = new Map([
    ["dw-search-recent-v1", JSON.stringify(initial)],
    ["unrelated", "keep"],
  ]);
  const blocked = { read: false, write: false, set: false, remove: false };
  const calls = { set: 0, remove: 0 };
  globalThis.window = {
    localStorage: {
      getItem(key) {
        if (blocked.read) throw new Error("read denied");
        return data.get(key) ?? null;
      },
      setItem(key, value) {
        calls.set += 1;
        if (blocked.write || blocked.set) throw new Error("write denied");
        data.set(key, value);
      },
      removeItem(key) {
        calls.remove += 1;
        if (blocked.write || blocked.remove) throw new Error("remove denied");
        data.delete(key);
      },
    },
  };
  try {
    const store = await import(`../src/components/search/search-recent.ts?batch=${sequence++}`);
    await action({ store, blocked, data, calls });
    assert.equal(data.get("unrelated"), "keep");
  } finally {
    if (previous === undefined) delete globalThis.window;
    else globalThis.window = previous;
  }
}

test("individual deletion loads saved history and only removes the requested folded query", async () => {
  await withStore(
    ({ store, data }) => {
      assert.equal(store.forgetSearch(" ｚｅｕｓ "), true);
      assert.deepEqual(store.readRecentSearches(), ["Dream", "ゼウス"]);
      assert.deepEqual(JSON.parse(data.get(store.RECENT_SEARCH_KEY)), ["Dream", "ゼウス"]);
    },
    ["ZEUS", "Dream", "ゼウス"],
  );
});

test("rejected writes keep new searches through subsequent reads and exports", async () => {
  await withStore(({ store, blocked }) => {
    blocked.write = true;
    store.rememberSearch("ゼウス");
    store.rememberSearch("Dream");
    assert.deepEqual(store.readRecentSearches(), ["Dream", "ゼウス", "既存の検索"]);
    store.forgetSearch("ゼウス");
    assert.deepEqual(store.readRecentSearches(), ["Dream", "既存の検索"]);
  });
});

test("a rejected clear reports false and does not resurrect old saved queries in this session", async () => {
  await withStore(({ store, blocked, data }) => {
    blocked.write = true;
    assert.equal(store.clearRecentSearches(), false);
    assert.deepEqual(store.readRecentSearches(), []);
    store.rememberSearch("新しい検索");
    assert.deepEqual(store.readRecentSearches(), ["新しい検索"]);
    assert.deepEqual(JSON.parse(data.get(store.RECENT_SEARCH_KEY)), ["既存の検索"]);
    blocked.write = false;
    store.rememberSearch("復旧後");
    assert.deepEqual(store.readRecentSearches(), ["復旧後", "新しい検索"]);
    assert.equal(store.clearRecentSearches(), true);
    assert.equal(data.has(store.RECENT_SEARCH_KEY), false);
  });
});

test("unavailable reads retain the last usable snapshot and fully blocked storage permits searching", async () => {
  await withStore(({ store, blocked }) => {
    store.rememberSearch("ゼウス");
    blocked.read = true;
    assert.deepEqual(store.readRecentSearches(), ["ゼウス", "既存の検索"]);
    blocked.write = true;
    assert.doesNotThrow(() => store.rememberSearch("Dream"));
    assert.deepEqual(store.readRecentSearches(), ["Dream", "ゼウス", "既存の検索"]);
    assert.equal(store.clearRecentSearches(), false);
    assert.deepEqual(store.readRecentSearches(), []);
  });
});

test("pending adds merge with another tab's latest searches when quota recovers", async () => {
  await withStore(({ store, blocked, data }) => {
    blocked.set = true;
    assert.equal(store.rememberSearch("タブAの検索"), false);
    data.set(store.RECENT_SEARCH_KEY, JSON.stringify(["タブBの検索", "既存の検索"]));
    assert.deepEqual(store.readRecentSearches(), ["タブAの検索", "タブBの検索", "既存の検索"]);
    blocked.set = false;
    assert.equal(store.rememberSearch("復旧後"), true);
    assert.deepEqual(JSON.parse(data.get(store.RECENT_SEARCH_KEY)), [
      "復旧後",
      "タブAの検索",
      "タブBの検索",
      "既存の検索",
    ]);
  });
});

test("recovered removals preserve another tab's additions and replay earlier unsaved removals", async () => {
  await withStore(
    ({ store, blocked, data }) => {
      blocked.set = true;
      assert.equal(store.forgetSearch("削除対象"), false);
      assert.equal(store.rememberSearch("タブAの検索"), false);
      data.set(store.RECENT_SEARCH_KEY, JSON.stringify(["タブBの検索", "削除対象", "既存の検索"]));
      blocked.set = false;
      assert.equal(store.forgetSearch("存在しない語"), true);
      assert.deepEqual(JSON.parse(data.get(store.RECENT_SEARCH_KEY)), [
        "タブAの検索",
        "タブBの検索",
        "既存の検索",
      ]);
    },
    ["削除対象", "既存の検索"],
  );
});

test("clear intent survives rejected removeItem and applies before later searches", async () => {
  await withStore(({ store, blocked, data }) => {
    blocked.remove = true;
    assert.equal(store.clearRecentSearches(), false);
    assert.deepEqual(store.readRecentSearches(), []);
    data.set(store.RECENT_SEARCH_KEY, JSON.stringify(["タブBの検索", "既存の検索"]));
    assert.deepEqual(store.readRecentSearches(), []);
    blocked.remove = false;
    assert.equal(store.rememberSearch("消去後の検索"), true);
    assert.deepEqual(JSON.parse(data.get(store.RECENT_SEARCH_KEY)), ["消去後の検索"]);
    assert.equal(store.clearRecentSearches(), true);
    assert.equal(data.has(store.RECENT_SEARCH_KEY), false);
  });
});

test("getItem denial never writes a stale snapshot even when setItem and removeItem are allowed", async () => {
  await withStore(({ store, blocked, data, calls }) => {
    assert.equal(store.rememberSearch("読み込み済み"), true);
    const writes = { ...calls };
    blocked.read = true;
    data.set(
      store.RECENT_SEARCH_KEY,
      JSON.stringify(["タブBの検索", "読み込み済み", "既存の検索"]),
    );
    assert.equal(store.rememberSearch("未保存"), false);
    assert.equal(store.forgetSearch("読み込み済み"), false);
    assert.deepEqual(calls, writes);
    assert.deepEqual(store.readRecentSearches(), ["未保存", "既存の検索"]);
    blocked.read = false;
    assert.equal(store.rememberSearch("復旧後"), true);
    assert.deepEqual(JSON.parse(data.get(store.RECENT_SEARCH_KEY)), [
      "復旧後",
      "未保存",
      "タブBの検索",
      "既存の検索",
    ]);
    blocked.read = true;
    const beforeClear = { ...calls };
    assert.equal(store.clearRecentSearches(), false);
    assert.deepEqual(calls, beforeClear);
    assert.deepEqual(store.readRecentSearches(), []);
    blocked.read = false;
    assert.equal(store.clearRecentSearches(), true);
    assert.equal(data.has(store.RECENT_SEARCH_KEY), false);
  });
});

test("pending replay keeps the eight-item bound and folds duplicate widths, case and spaces", async () => {
  await withStore(({ store, blocked, data }) => {
    blocked.set = true;
    store.rememberSearch("　ＺＥＵＳ　");
    store.rememberSearch(" a   b ");
    data.set(
      store.RECENT_SEARCH_KEY,
      JSON.stringify(["zeus", "Ａ Ｂ", ...Array.from({ length: 8 }, (_, index) => `語${index}`)]),
    );
    blocked.set = false;
    assert.equal(store.rememberSearch("復旧後"), true);
    const saved = JSON.parse(data.get(store.RECENT_SEARCH_KEY));
    assert.equal(saved.length, 8);
    assert.deepEqual(saved.slice(0, 4), ["復旧後", "a b", "ＺＥＵＳ", "語0"]);
    assert.equal(
      saved.filter((query) => query.normalize("NFKC").toLowerCase() === "zeus").length,
      1,
    );
  });
});
