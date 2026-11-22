import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// Owner (2026-11-22): 「ドリームチャプターは上映が終了している的なやつも追加して」.
// The Dream Chapter is marked 上映終了 as a status label only: the page and
// its content stay fully open, so these checks pin the label, not a block.
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const component = read("src/components/screening-ended.tsx");
const page = read("src/components/dream-chapter/dream-chapter.tsx");

test("the screening-ended wording is the owner's, with no invented dates", () => {
  assert.match(component, /SCREENING_ENDED_LABEL = "上映終了"/);
  assert.match(component, /SCREENING_ENDED_KICKER = "SCREENING ENDED"/);
  assert.match(component, /SCREENING_ENDED_NOTE = "ドリームチャプターの上映は終了しました。"/);
  assert.doesNotMatch(component.replace(/\/\/.*$/gm, ""), /\d+年|\d+月|\d+日/);
  assert.match(component, /isScreeningEnded = \(to: string\) => to === "\/dream-chapter"/);
});

test("the Dream Chapter page shows the notice and stays unblocked", () => {
  assert.match(page, /<ScreeningEndedNotice \/>/);
  // A label, not a gate: the notice sits beside the hero and the desk, and
  // nothing in it intercepts the page.
  assert.doesNotMatch(component, /role="(?:dialog|alertdialog)"|aria-modal|inert|tabIndex/);
  const css = read("src/styles-dream-image-cinema.css");
  const rule = css.slice(css.indexOf(".dream-screening-ended {"));
  assert.doesNotMatch(rule.slice(0, rule.indexOf("}")), /position:\s*(?:fixed|absolute|sticky)|pointer-events/);
});

test("every Dream Chapter listing wears the 上映終了 badge", () => {
  const chrome = read("src/components/world/world-chrome.tsx");
  const dreamEntries = chrome.match(/「ドリームチャプター」<\/span>\s*<ScreeningEndedBadge \/>/g) ?? [];
  assert.equal(dreamEntries.length, 2, "both menu entries");
  assert.match(read("src/components/command-deck/command-deck.tsx"), /isScreeningEnded\(item\.href\) \? <ScreeningEndedBadge \/>/);
  assert.match(read("src/components/search/search-page.tsx"), /isScreeningEnded\(document\.to\) \? <ScreeningEndedBadge \/>/);
  const quick = read("src/components/search/quick-search-dialog.tsx");
  assert.equal((quick.match(/<ScreeningEndedBadge \/>/g) ?? []).length, 2, "result rows and page shortcut");
  assert.match(read("src/components/library/library-page.tsx"), /isScreeningEnded\(entry\.path\) \? <ScreeningEndedBadge \/>/);
});

test("the badge is CSS only and keeps the 12px text floor", () => {
  const css = read("src/styles-chrome-elevation.css");
  const rule = css.slice(css.indexOf(".screening-ended-badge {"));
  const body = rule.slice(0, rule.indexOf("}"));
  assert.match(body, /700 12px/);
  assert.doesNotMatch(body, /url\(|@import/);
});
