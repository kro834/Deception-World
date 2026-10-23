import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import * as data from "../src/lib/library-data.ts";
import * as hub from "../src/lib/library-hub.ts";
import * as storage from "../src/lib/library-storage.ts";
import * as guides from "../src/lib/inquiry-guides.ts";

const compile = (path) =>
  ts.transpileModule(readFileSync(new URL(`../${path}`, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
const jsx = (type, props, key) => ({ type, props, key });
function nodes(tree, predicate) {
  if (Array.isArray(tree)) return tree.flatMap((node) => nodes(node, predicate));
  if (!tree || typeof tree !== "object") return [];
  return [...(predicate(tree) ? [tree] : []), ...nodes(tree.props?.children, predicate)];
}
function text(tree) {
  if (Array.isArray(tree)) return tree.map(text).join("");
  if (tree === null || tree === undefined || typeof tree === "boolean") return "";
  return typeof tree === "object" ? text(tree.props?.children) : String(tree);
}
const sampleIds = data.LIBRARY_ENTRIES.slice(0, 8).map((entry) => entry.id);

function harness({
  ids = sampleIds,
  librarySucceeds = true,
  searchSucceeds = true,
  error = "",
  searches = ["シエル"],
} = {}) {
  const props = {
    saved: { version: 1, bookmarks: [...ids], recent: [{ id: sampleIds[0], at: Date.now() }] },
    ready: true,
    error,
    onBrowseSaved: () => browseCalls++,
  };
  let browseCalls = 0;
  let recentSearches = [...searches];
  let tree;
  let hook = 0;
  let dirty = false;
  let pending = [];
  const hooks = [];
  const focuses = [];
  let targets = new Map();
  class Element {
    constructor(node) {
      this.node = node;
      this.isConnected = true;
    }
    focus() {
      focuses.push(this.node.props.id || this.node.props["aria-label"] || text(this.node));
    }
    querySelector(selector) {
      const node = nodes(this.node.props.children, (item) => item.type === selector)[0];
      return node ? new Element(node) : null;
    }
  }
  const effect = (fn, dependencies) => {
    const index = hook++;
    const previous = hooks[index];
    if (
      !previous ||
      !dependencies ||
      dependencies.some((item, i) => item !== previous.dependencies[i])
    ) {
      pending.push(() => {
        previous?.cleanup?.();
        hooks[index] = { dependencies, cleanup: fn() };
      });
    }
  };
  const exported = {};
  runInNewContext(compile("src/components/library/library-hub.tsx"), {
    exports: exported,
    HTMLElement: Element,
    document: { getElementById: (id) => targets.get(id) },
    require(name) {
      if (name === "react")
        return {
          useState(initial) {
            const index = hook++;
            if (!(index in hooks)) hooks[index] = initial;
            return [
              hooks[index],
              (value) => {
                const next = typeof value === "function" ? value(hooks[index]) : value;
                if (next !== hooks[index]) {
                  hooks[index] = next;
                  dirty = true;
                }
              },
            ];
          },
          useRef(initial) {
            const index = hook++;
            return (hooks[index] ??= { current: initial });
          },
          useEffect: effect,
          useLayoutEffect: effect,
        };
      if (name === "react/jsx-runtime") return { jsx, jsxs: jsx, Fragment: Symbol("Fragment") };
      if (name === "@tanstack/react-router") return { Link: Symbol("Link") };
      if (name === "@/components/load-gate") return { GuardedLink: Symbol("GuardedLink") };
      if (name === "@/components/name-text") return { DisplayName: Symbol("DisplayName") };
      if (name === "@/lib/library-data") return data;
      if (name === "@/lib/library-hub") return hub;
      if (name === "@/lib/library-storage") return storage;
      if (name === "@/lib/record-art") return { pathArt: () => ({}), titleRunStyle: () => ({}) };
      if (name === "./record-art") return { RecordArtFrame: Symbol("Art") };
      if (name === "@/components/search/search-recent")
        return {
          useRecentSearches: () => recentSearches,
          readRecentSearches: () => recentSearches,
          clearRecentSearches: () => {
            recentSearches = [];
            return searchSucceeds;
          },
        };
      if (name === "./library-store")
        return {
          toggleBookmark(id) {
            if (librarySucceeds) props.saved = storage.toggleLibraryBookmark(props.saved, id);
            else props.error = "保存できませんでした。";
          },
          clearLibraryAll() {
            if (librarySucceeds) props.saved = storage.emptyLibrarySaved();
            return librarySucceeds;
          },
          clearLibraryBookmarks() {
            if (librarySucceeds) props.saved = { ...props.saved, bookmarks: [] };
            return librarySucceeds;
          },
          clearLibraryRecent() {
            if (librarySucceeds) props.saved = { ...props.saved, recent: [] };
            return librarySucceeds;
          },
        };
      throw new Error(name);
    },
  });
  function render() {
    do {
      dirty = false;
      hook = 0;
      pending = [];
      tree = exported.LibraryHub(props);
      targets = new Map();
      for (const node of nodes(tree, (item) => typeof item.type === "string")) {
        const target = new Element(node);
        if (node.props.id) targets.set(node.props.id, target);
        if (node.props.ref) node.props.ref.current = target;
      }
      const tasks = pending;
      pending = [];
      for (const task of tasks) task();
    } while (dirty);
    return tree;
  }
  render();
  return {
    props,
    focuses,
    get browseCalls() {
      return browseCalls;
    },
    get tree() {
      return tree;
    },
    buttons(label) {
      return nodes(tree, (node) => node.type === "button" && text(node) === label);
    },
    click(label) {
      const node = this.buttons(label)[0];
      assert.ok(node, `button ${label}`);
      node.props.onClick({ currentTarget: new Element(node) });
      render();
    },
    remove(id) {
      const row = nodes(tree, (node) => node.props?.id === `library-saved-${id}`)[0];
      nodes(row, (node) => node.type === "button")[0].props.onClick();
      render();
    },
    escape() {
      tree.props.onKeyDown({ key: "Escape", preventDefault() {} });
      render();
    },
    rows() {
      return nodes(
        tree,
        (node) => node.type === "li" && node.props.id?.startsWith("library-saved-"),
      );
    },
  };
}

test("saved shelf previews six entries without losing stored order, expands, collapses and opens the saved facet", () => {
  const h = harness();
  assert.equal(h.rows().length, 6);
  assert.deepEqual(h.props.saved.bookmarks, sampleIds);
  assert.equal(h.buttons("残り2件を表示")[0].props["aria-expanded"], false);
  h.click("残り2件を表示");
  assert.equal(h.rows().length, 8);
  assert.equal(h.buttons("最初の6件に戻す")[0].props["aria-expanded"], true);
  h.click("最初の6件に戻す");
  assert.equal(h.rows().length, 6);
  h.click("しおりを絞り込む");
  assert.equal(h.browseCalls, 1);
});

test("removing a saved row transfers focus to a remaining control or the shelf heading", () => {
  const h = harness({ ids: sampleIds.slice(0, 2) });
  h.remove(sampleIds[0]);
  assert.equal(h.focuses.at(-1), `${data.LIBRARY_ENTRIES[1].title}のしおりを解除`);
  h.remove(sampleIds[1]);
  assert.equal(h.focuses.at(-1), "library-shelf-title");
});

test("a denied bookmark removal preserves the row and does not move focus", () => {
  const h = harness({ ids: [sampleIds[0]], librarySucceeds: false });
  h.remove(sampleIds[0]);
  assert.equal(h.rows().length, 1);
  assert.equal(h.focuses.length, 0);
  assert.ok(text(h.tree).includes("保存できませんでした。"));
});

test("removing the last preview row focuses the next saved row brought into view", () => {
  const h = harness();
  h.remove(sampleIds[5]);
  assert.equal(h.rows().length, 6);
  assert.equal(h.focuses.at(-1), `${data.LIBRARY_ENTRIES[6].title}のしおりを解除`);
});

test("bulk bookmark removal requires confirmation, Escape restores its opener, success keeps other data", () => {
  const h = harness({ ids: sampleIds.slice(0, 2) });
  h.click("しおりをすべて解除");
  assert.equal(h.rows().length, 2);
  assert.equal(h.focuses.at(-1), "library-confirm-clear-bookmarks");
  h.escape();
  assert.equal(h.rows().length, 2);
  assert.equal(h.focuses.at(-1), "しおりをすべて解除");
  h.click("しおりをすべて解除");
  h.click("すべて解除する");
  assert.equal(h.rows().length, 0);
  assert.equal(h.props.saved.recent.length, 1);
  assert.ok(text(h.tree).includes("シエル"));
  assert.equal(h.focuses.at(-1), "library-shelf-title");
});

for (const [librarySucceeds, searchSucceeds] of [
  [true, true],
  [false, true],
  [true, false],
  [false, false],
]) {
  test(`clear all reports persistence result for library=${librarySucceeds}, searches=${searchSucceeds}`, () => {
    const h = harness({ librarySucceeds, searchSucceeds });
    h.click("すべて消去");
    assert.equal(h.focuses.at(-1), "library-confirm-clear-all");
    h.click("本当に消去する");
    if (librarySucceeds && searchSucceeds) {
      assert.ok(text(h.tree).includes("しおり・閲覧履歴・検索履歴をすべて消去しました。"));
      assert.equal(h.buttons("すべて消去")[0].props.disabled, true);
    } else {
      assert.ok(text(h.tree).includes("一部の保存データを消去できませんでした。"));
      assert.ok(!text(h.tree).includes("すべて消去しました。"));
      assert.equal(h.buttons("すべて消去")[0].props.disabled, false);
    }
  });
}

test("unavailable library storage is explained at the shelf rather than described as empty history", () => {
  const h = harness({ ids: [], error: "保存データを読み込めませんでした。" });
  h.props.saved.recent = [];
  h.click("すべて消去");
  assert.ok(text(h.tree).includes("しおりを確認できません。"));
  assert.ok(text(h.tree).includes("閲覧履歴を確認できません。"));
  assert.ok(!text(h.tree).includes("閲覧履歴はまだありません。"));
});

test("inquiry choices expose their disclosure state and a focusable guide destination", () => {
  const exported = {};
  runInNewContext(compile("src/components/library/library-inquiry.tsx"), {
    exports: exported,
    require(name) {
      if (name === "react/jsx-runtime") return { jsx, jsxs: jsx };
      if (name === "@/lib/inquiry-guides") return guides;
      if (name === "@tanstack/react-router") return { Link: Symbol("Link") };
      if (name === "@/lib/record-art") return { pathArt: () => ({}), titleRunStyle: () => ({}) };
      if (name === "@/lib/record-images") return { recordImage: () => ({}) };
      if (name === "@/lib/record-arrival") return { watchRecordArrival() {} };
      if (name === "@/styles-record-landing.css?url") return { default: "landing.css" };
      if (name === "./record-art") return { RecordArtFrame: Symbol("Art") };
      throw new Error(name);
    },
  });
  const tree = exported.LibraryInquiry({ guide: "keepers", onGuideChange() {} });
  const choices = nodes(tree, (node) => node.type === "button");
  assert.deepEqual(
    Array.from(choices, (node) => node.props["aria-expanded"]),
    [true, false],
  );
  const jump = nodes(tree, (node) => node.type === "a")[0];
  const heading = nodes(tree, (node) => node.props?.id === jump.props.href.slice(1))[0];
  assert.equal(heading.props.tabIndex, -1);
  assert.equal(
    nodes(exported.LibraryInquiry({ onGuideChange() {} }), (node) => node.type === "a").length,
    0,
  );
});

test("library clear APIs report write refusal and keep the last successful saved snapshot", () => {
  const exported = {};
  let value = JSON.stringify({
    version: 1,
    bookmarks: [sampleIds[0]],
    recent: [{ id: sampleIds[0], at: 1 }],
  });
  let refused = false;
  runInNewContext(compile("src/components/library/library-store.ts"), {
    exports: exported,
    window: {
      localStorage: {
        getItem: () => value,
        setItem: (_key, next) => {
          if (refused) throw new Error("blocked");
          value = next;
        },
      },
      addEventListener() {},
      removeEventListener() {},
    },
    require(name) {
      if (name === "react")
        return {
          useSyncExternalStore(subscribe, get) {
            subscribe(() => {});
            return get();
          },
        };
      if (name === "@/lib/library-storage") return storage;
      throw new Error(name);
    },
  });
  const before = value;
  refused = true;
  for (const method of ["clearLibraryAll", "clearLibraryBookmarks", "clearLibraryRecent"]) {
    assert.equal(exported[method](), false);
    assert.equal(value, before);
    assert.equal(exported.useLibraryStore().saved.bookmarks.length, 1);
  }
  refused = false;
  assert.equal(exported.clearLibraryAll(), true);
  assert.deepEqual(JSON.parse(value), storage.emptyLibrarySaved());
});
