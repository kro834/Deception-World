// rx6: the site-wide quick search, recent searches and the library hub.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
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
  assert.match(hub, /clearLibraryAll\(\);\s*clearRecentSearches\(\);/);
});
