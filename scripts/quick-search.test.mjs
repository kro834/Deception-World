// rx6: the site-wide quick search, recent searches and the library hub.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import {
  isQuickSearchShortcut,
  isTypingTarget,
  quickSearchBlocked,
} from "../src/components/search/quick-search-shortcut.ts";
import {
  parseRecentSearches,
  pushRecentSearch,
  RECENT_SEARCH_LIMIT,
} from "../src/components/search/search-recent.ts";
import {
  buildLibraryExport,
  continueReading,
  formatVisitClock,
  formatVisitTime,
  groupVisits,
  nextChapter,
} from "../src/lib/library-hub.ts";
import { LIBRARY_ENTRIES } from "../src/lib/library-data.ts";
import * as searchHelpers from "../src/components/search/search-ui-helpers.ts";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const key = (overrides) => ({
  key: "/",
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  shiftKey: false,
  defaultPrevented: false,
  ...overrides,
});

// Execute the component's rendered event handlers, keeping hook state between
// renders. Route loading and DOM focus are owned by the shared gate; this tests
// that each activation hands it the right keyboard intent after closing.
const compiledDialog = ts.transpileModule(read("src/components/search/quick-search-dialog.tsx"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
}).outputText;

function quickSearchFixture() {
  const states = [];
  const refs = [];
  const frames = [];
  const events = [];
  let stateIndex = 0;
  let refIndex = 0;
  let tree;
  const exports = {};
  const result = { document: { id: "zeus", category: "people", to: "/managers/zeus" } };
  runInNewContext(compiledDialog, {
    exports,
    performance: { now: () => 1000 },
    window: { requestAnimationFrame: (action) => frames.push(action) },
    require: (name) => {
      if (name === "react")
        return {
          useState: (initial) => {
            const index = stateIndex++;
            if (!(index in states)) states[index] = initial;
            return [
              states[index],
              (value) => {
                states[index] = typeof value === "function" ? value(states[index]) : value;
              },
            ];
          },
          useRef: (current) => (refs[refIndex++] ??= { current }),
          useMemo: (calculate) => calculate(),
          useDeferredValue: (value) => value,
          useEffect() {},
        };
      if (name === "react/jsx-runtime")
        return {
          jsx: (type, props) => ({ type, props }),
          jsxs: (type, props) => ({ type, props }),
        };
      if (name === "@/components/load-gate")
        return { useLoadGate: () => ({ go: (options) => events.push(["go", options]) }) };
      if (name === "@tanstack/react-router")
        return { useRouter: () => ({ navigate: (options) => events.push(["router", options]) }) };
      if (name === "./search-data")
        return { SEARCH_DOCUMENTS: [], SEARCH_CATEGORIES: [{ id: "all" }, { id: "people" }] };
      if (name === "./search-engine")
        return {
          searchDocuments: (_, query) => (query === "ゼウス" ? [result] : []),
          suggestSearchQueries: () => [],
          groupSearchResults: (results) => [{ category: "people", results }],
        };
      if (name === "./search-recent")
        return {
          useRecentSearches: () => [],
          rememberSearch: (query) => events.push(["remember", query]),
        };
      if (name === "./search-ui-helpers") return searchHelpers;
      if (name === "./use-open-result") return { useOpenResult: () => () => {} };
      if (name === "@/lib/record-art") return { documentArt: () => ({}) };
      if (name === "./search-ui" || name === "@/lib/record-images" || name.endsWith("?url"))
        return {};
      throw new Error(`Unexpected quick-search dependency: ${name}`);
    },
  });
  function render() {
    stateIndex = refIndex = 0;
    tree = exports.default({ open: true, onClose: () => events.push(["close"]) });
  }
  function find(predicate) {
    function visit(node) {
      if (!node || typeof node !== "object") return undefined;
      if (predicate(node)) return node;
      for (const child of [node.props?.children].flat(Infinity)) {
        const found = visit(child);
        if (found) return found;
      }
    }
    return visit(tree);
  }
  function press(key, native = {}) {
    find((node) => node.type === "input").props.onKeyDown({
      key,
      nativeEvent: { key, ...native },
      preventDefault() {},
    });
    render();
  }
  render();
  return {
    events,
    frames,
    find,
    press,
    type(query) {
      find((node) => node.type === "input").props.onChange({ target: { value: query } });
      render();
    },
    click(predicate, overrides = {}) {
      let prevented = false;
      find(predicate).props.onClick({
        detail: 1,
        ...overrides,
        preventDefault: () => {
          prevented = true;
        },
      });
      return prevented;
    },
    flushFrame() {
      assert.equal(frames.length, 1);
      frames.shift()();
    },
  };
}

for (const selection of ["query Enter", "all-results arrow selection"]) {
  test(`${selection} requests destination focus only after the quick dialog closes`, () => {
    const dialog = quickSearchFixture();
    dialog.type("  ゼウス  ");
    if (selection === "all-results arrow selection") {
      dialog.press("ArrowUp");
      assert.equal(
        dialog.find((node) => node.type === "input").props["aria-activedescendant"],
        "qs-all",
      );
    }
    dialog.press("Enter");
    assert.deepEqual(dialog.events, [["remember", "ゼウス"], ["close"]]);
    dialog.flushFrame();
    const [kind, options] = dialog.events.at(-1);
    assert.equal(kind, "go");
    assert.equal(options.to, "/search");
    assert.equal(options.search.q, "ゼウス");
    assert.equal(options.focusDestination, true);
  });
}

for (const [query, target] of [
  ["ゼウス", "all"],
  ["", "footer"],
  ["未登録の検索語", "footer"],
]) {
  for (const detail of [0, 1]) {
    test(`${target} search link with ${JSON.stringify(query)} keeps activation detail ${detail}`, () => {
      const dialog = quickSearchFixture();
      dialog.type(query);
      const predicate =
        target === "all"
          ? (node) => node.props?.id === "qs-all"
          : (node) => node.props?.className === "quick-search-full";
      assert.equal(dialog.click(predicate, { detail }), true);
      assert.equal(dialog.events.at(-1)[0], "close");
      dialog.flushFrame();
      const [kind, options] = dialog.events.at(-1);
      assert.equal(kind, "go");
      assert.equal(options.to, "/search");
      assert.equal(options.search.q, query);
      assert.equal(options.focusDestination, detail === 0);
    });
  }
}

test("modified all-results links preserve native navigation and leave the dialog open", () => {
  for (const modifier of ["metaKey", "ctrlKey", "shiftKey", "altKey"]) {
    const dialog = quickSearchFixture();
    dialog.type("ゼウス");
    const predicate = (node) => node.props?.id === "qs-all";
    assert.equal(dialog.find(predicate).props.href, `/search?q=${encodeURIComponent("ゼウス")}`);
    assert.equal(dialog.click(predicate, { [modifier]: true }), false);
    assert.deepEqual(dialog.events, []);
    assert.equal(dialog.frames.length, 0);
  }
});

test("IME confirmation and Enter without results do not launch all-results navigation", () => {
  const dialog = quickSearchFixture();
  dialog.type("ゼウス");
  dialog.press("Enter", { isComposing: true });
  assert.deepEqual(dialog.events, []);
  dialog.type("未登録の検索語");
  dialog.press("Enter");
  assert.deepEqual(dialog.events, []);
  assert.equal(dialog.frames.length, 0);
});

test('"/" and Ctrl/⌘+K open it; other keys, IME and repeats do not', () => {
  assert.ok(isQuickSearchShortcut(key()));
  assert.ok(isQuickSearchShortcut(key({ key: "k", ctrlKey: true })));
  assert.ok(isQuickSearchShortcut(key({ key: "k", metaKey: true })));
  assert.ok(!isQuickSearchShortcut(key({ key: "k" })));
  assert.ok(!isQuickSearchShortcut(key({ key: "/", ctrlKey: true })));
  assert.ok(!isQuickSearchShortcut(key({ key: "k", ctrlKey: true, shiftKey: true })));
  assert.ok(!isQuickSearchShortcut(key({ isComposing: true })));
  assert.ok(!isQuickSearchShortcut(key({ repeat: true })));
  assert.ok(!isQuickSearchShortcut(key({ defaultPrevented: true })));
});

test("typing places and dialogs keep their keys", () => {
  const element = (match, editable = false) => ({
    isContentEditable: editable,
    closest: (selector) => (match && selector.includes(match) ? {} : null),
  });
  assert.ok(isTypingTarget(element("input")));
  assert.ok(isTypingTarget(element("textarea")));
  assert.ok(isTypingTarget(element("dialog")));
  assert.ok(isTypingTarget(element('[role="dialog"]')));
  assert.ok(isTypingTarget(element(null, true)));
  assert.ok(!isTypingTarget(element(null)));
  assert.ok(!isTypingTarget(null));
});

test("the opening, load covers, open dialogs and the open side menu block it", () => {
  const doc = ({ attributes = [], selectors = [] } = {}) => ({
    documentElement: { hasAttribute: (name) => attributes.includes(name) },
    querySelector: (selector) => (selectors.some((item) => selector.includes(item)) ? {} : null),
  });
  assert.ok(quickSearchBlocked(doc(), "/"));
  assert.ok(!quickSearchBlocked(doc(), "/world"));
  assert.ok(quickSearchBlocked(doc({ attributes: ["data-dialog-open"] }), "/world"));
  assert.ok(quickSearchBlocked(doc({ attributes: ["data-loading"] }), "/world"));
  assert.ok(
    quickSearchBlocked(doc({ selectors: ['#site-side-panel[data-open="true"]'] }), "/world"),
  );
});

test("the root pays only for a small host; the overlay and its index load on first use", () => {
  const root = read("src/routes/__root.tsx");
  assert.match(
    root,
    /import \{ QuickSearchHost \} from "@\/components\/search\/quick-search-host";/,
  );
  assert.match(root, /<QuickSearchHost \/>/);
  assert.doesNotMatch(root, /search-data|quick-search-dialog/);
  const host = read("src/components/search/quick-search-host.tsx");
  assert.match(
    read("src/components/search/quick-search-events.ts"),
    /export const loadQuickSearch = \(\) => import\("\.\/quick-search-dialog"\);/,
  );
  assert.match(host, /lazy\(loadQuickSearch\)/);
  assert.doesNotMatch(host, /from "\.\/search-data"|from "\.\/search-engine"/);
  const dialog = read("src/components/search/quick-search-dialog.tsx");
  // Its sheet arrives with it, as a URL (route-css-delivery.test.mjs).
  assert.match(
    dialog,
    /import quickSearchCssUrl from "\.\.\/\.\.\/styles-quick-search\.css\?url";/,
  );
  assert.match(
    dialog,
    /<link rel="stylesheet" href=\{quickSearchCssUrl\} precedence="default" \/>/,
  );
  assert.match(dialog, /<dialog/);
  assert.match(dialog, /role="combobox"/);
  assert.match(dialog, /role="listbox"/);
  assert.match(dialog, /aria-activedescendant=/);
  const chrome = read("src/components/world/world-chrome.tsx");
  assert.match(chrome, /className="side-panel-link-button side-panel-quick-search"/);
  assert.match(chrome, /aria-keyshortcuts="\/ Control\+K Meta\+K"/);
  assert.match(chrome, /window\.requestAnimationFrame\(openQuickSearch\)/);
});

test("the search page is a combobox over a grouped listbox, with ?q= kept after a pause", () => {
  const page = read("src/components/search/search-page.tsx");
  assert.match(page, /role="combobox"/);
  assert.match(page, /aria-controls=\{listboxId\}/);
  assert.match(page, /aria-activedescendant=\{activeOption\?\.id\}/);
  assert.match(page, /role="listbox"/);
  assert.match(page, /role="group"/);
  assert.match(page, /const URL_DELAY_MS = 280;/);
  assert.match(page, /useDeferredValue\(draft\)/);
  assert.match(page, /event\.key === "Escape"/);
  const ui = read("src/components/search/search-ui.tsx");
  assert.match(read("src/components/search/search-ui-helpers.ts"), /export function stepActive/);
  assert.match(ui, /role="option"/);
  assert.match(ui, /aria-selected=\{active\}/);
});

test("search, quick search and library sheets keep the 12px floor and gated motion", () => {
  for (const path of [
    "src/styles-search.css",
    "src/styles-quick-search.css",
    "src/styles-library.css",
  ]) {
    const css = read(path);
    for (const [, size, unit] of css.matchAll(/font-size:\s*([\d.]+)(px|rem)/g)) {
      const px = unit === "rem" ? Number(size) * 16 : Number(size);
      assert.ok(px >= 12, `${path}: ${size}${unit}`);
    }
    // Motion lives only inside reduced-motion gates that also skip economy.
    let outside = css;
    for (let at = outside.indexOf("@media (prefers-reduced-motion: no-preference)"); at >= 0;) {
      let depth = 0;
      let end = outside.indexOf("{", at);
      for (; end < outside.length; end += 1) {
        if (outside[end] === "{") depth += 1;
        else if (outside[end] === "}" && --depth === 0) break;
      }
      const block = outside.slice(at, end + 1);
      assert.match(block, /html:not\(\[data-world-effects="economy"\]\)/, path);
      outside = outside.slice(0, at) + outside.slice(end + 1);
      at = outside.indexOf("@media (prefers-reduced-motion: no-preference)");
    }
    assert.doesNotMatch(outside, /\b(?:animation|transition)\s*:/, `${path}: ungated motion`);
    assert.match(css, /@media \(forced-colors: active\)/);
  }
});

test("recent searches are bounded, deduplicated and tolerant of bad storage", () => {
  assert.deepEqual(parseRecentSearches(null), []);
  assert.deepEqual(parseRecentSearches("not json"), []);
  assert.deepEqual(parseRecentSearches('{"a":1}'), []);
  assert.deepEqual(parseRecentSearches('["ゼウス", 3, "ゼウス", " ", "zeus"]'), ["ゼウス", "zeus"]);
  let list = [];
  for (let index = 0; index < 12; index += 1) list = pushRecentSearch(list, `語${index}`);
  assert.equal(list.length, RECENT_SEARCH_LIMIT);
  assert.equal(list[0], "語11");
  list = pushRecentSearch(list, " 語5 ");
  assert.equal(list[0], "語5");
  assert.equal(list.filter((item) => item === "語5").length, 1);
  assert.deepEqual(pushRecentSearch(["ZEUS"], "zeus"), ["zeus"]);
});

test("the library hub picks up where the reader left off and dates the history", () => {
  const now = new Date(2026, 9, 9, 15, 0).getTime();
  assert.equal(formatVisitTime(now - 10_000, now), "たった今");
  assert.equal(formatVisitTime(now - 5 * 60_000, now), "5分前");
  assert.equal(formatVisitTime(now - 3 * 3_600_000, now), "3時間前");
  assert.equal(formatVisitTime(new Date(2026, 9, 8, 22, 0).getTime(), now), "昨日");
  assert.equal(formatVisitTime(new Date(2026, 9, 5, 12, 0).getTime(), now), "4日前");
  assert.equal(formatVisitTime(new Date(2026, 8, 28, 12, 0).getTime(), now), "9月28日");
  assert.equal(formatVisitClock(new Date(2026, 9, 8, 21, 4).getTime(), now), "21:04");
  const saved = {
    version: 1,
    bookmarks: ["saga"],
    recent: [
      { id: "zeus", at: now - 3_600_000 * 20 },
      { id: "dream-case-2", at: now - 60_000 },
      { id: "realm", at: now - 86_400_000 * 3 },
    ],
  };
  const resume = continueReading(saved);
  assert.equal(resume.entry.id, "dream-case-2");
  assert.equal(resume.next.id, "dream-case-3");
  assert.equal(
    nextChapter(LIBRARY_ENTRIES.find((entry) => entry.id === "dream-case-5")),
    undefined,
  );
  assert.equal(continueReading({ version: 1, bookmarks: [], recent: [] }), undefined);
  assert.deepEqual(
    groupVisits(saved.recent, now).map((group) => [
      group.label,
      group.visits.map((v) => v.entry.id),
    ]),
    [
      ["今日", ["dream-case-2"]],
      ["昨日", ["zeus"]],
      ["それ以前", ["realm"]],
    ],
  );
  const exported = buildLibraryExport(saved, ["ゼウス"], now);
  assert.equal(exported.format, "deception-world-library");
  assert.deepEqual(exported.bookmarks, [
    { id: "saga", title: "仮面ライダーサーガ", path: "/riders/saga" },
  ]);
  assert.deepEqual(exported.searches, ["ゼウス"]);
  assert.equal(exported.recent.length, 3);
});

test("the library page puts the hub before the guides and offers export and a confirmed clear", () => {
  const page = read("src/components/library/library-page.tsx");
  assert.ok(page.indexOf("<LibraryHub") < page.indexOf("<LibraryInquiry"));
  const hub = read("src/components/library/library-hub.tsx");
  assert.match(hub, /書き出す（JSON）/);
  assert.match(hub, /本当に消去する/);
  assert.match(
    hub,
    /const libraryCleared = kind === "all" \? clearLibraryAll\(\) : clearLibraryBookmarks\(\);/,
  );
  assert.match(hub, /const searchesCleared = clearRecentSearches\(\);/);
  assert.match(hub, /libraryCleared && searchesCleared/);
});

test("keys typed while the overlay first loads are kept and seeded into the field", () => {
  const host = readFileSync(
    new URL("../src/components/search/quick-search-host.tsx", import.meta.url),
    "utf8",
  );
  const dialog = readFileSync(
    new URL("../src/components/search/quick-search-dialog.tsx", import.meta.url),
    "utf8",
  );
  assert.match(host, /pendingRef\.current \+= event\.key/);
  assert.match(host, /!event\.isComposing/);
  assert.match(host, /seed=\{seed\}/);
  assert.match(dialog, /if \(seed\) \{\s*setDraft\(seed\);\s*onSeeded\?\.\(\);/);
});
