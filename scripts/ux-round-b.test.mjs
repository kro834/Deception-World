import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";

// Usability round B on /world: a keyboard open lands on the dossier, a phone
// rider choice shows its panel, Shift+Tab clears the fixed header, the records
// region answers Home/End, desktop hover reaches the tabs, the 個別資料 pill
// and the record cards, and the slide hint is a description rather than part
// of every control's name.

const read = (path) =>
  readFileSync(new URL(`../${path}`, import.meta.url), "utf8").replaceAll("\r\n", "\n");
const readParts = (path) => {
  const dir = new URL(`../source-parts/${path}/`, import.meta.url);
  return readdirSync(dir)
    .filter((name) => name.endsWith(".part"))
    .sort()
    .map((name) => readFileSync(new URL(name, dir), "utf8"))
    .join("")
    .replaceAll("\r\n", "\n");
};

const home = read("src/components/world/world-home.tsx");
const slide = read("src/components/world/slide-open-control.tsx");
const polish = read("src/styles-world/21.css");
const frosted = read("src/styles-frosted-controls.css");

const between = (source, start, end) => {
  const from = source.indexOf(start);
  assert.ok(from >= 0, `missing ${start}`);
  const to = source.indexOf(end, from + start.length);
  assert.ok(to > from, `missing ${end} after ${start}`);
  return source.slice(from, to);
};

test("the mirrored World home carries this round's changes", () => {
  assert.equal(readParts("src/components/world/world-home.tsx"), home);
});

test("a keyboard open from the rider rail lands focus on the dossier", () => {
  const opener = between(home, 'className="rider-dossier-open"', "/>");
  assert.match(opener, /onOpen=\{\(source\) => \{/);
  assert.match(opener, /focusDestination: source === "keyboard"/);
});

test("a pointer rider choice on a phone reveals the panel once, and only then", () => {
  const reveal = between(home, "const revealRiderPanel = useCallback(", "}, []);");
  // Two frames after the selection, so a keyboard step has moved focus first.
  assert.match(reveal, /requestAnimationFrame\(\(\) =>\s*requestAnimationFrame\(/);
  assert.match(reveal, /matchMedia\("\(max-width: 760px\)"\)\.matches\) return;/);
  assert.match(reveal, /rail\.dataset\.liquidDragging === "true"\) return;/);
  assert.match(reveal, /document\.documentElement\.hasAttribute\("data-rail-lock"\)\) return;/);
  assert.match(reveal, /\[role="tab"\]\[aria-selected="true"\]/);
  assert.match(reveal, /tab\.matches\(":focus-visible"\)\) return;/);
  assert.match(reveal, /getElementById\("rider-active-panel"\)/);
  assert.match(reveal, /if \(top <= window\.innerHeight - 140\) return;/);
  // The scroll is planned from layout, not paint (the console's mx-lift
  // entrance is still settling), and capped by the rail's top so the whole
  // rail stays clear of the header.
  assert.match(reveal, /y \+= n\.offsetTop \+ \(n === el \? 0 : n\.clientTop\);/);
  assert.match(reveal, /layoutTop\(panel\) - window\.innerHeight \* 0\.6,/);
  assert.match(reveal, /layoutTop\(rail\) - headerBottom - 12,/);
  assert.doesNotMatch(reveal, /tab\.getBoundingClientRect\(\)/);
  assert.match(reveal, /\.site-shell > \.topbar/);
  assert.match(reveal, /if \(dy <= 24\) return;/);
  assert.match(reveal, /behavior: reducedMotion \? "auto" : "smooth"/);
  // One scroll per selection: no loop, no timer, no listener of its own.
  assert.equal(reveal.match(/scrollBy\(/g)?.length, 1);
  assert.doesNotMatch(reveal, /setInterval|setTimeout|addEventListener/);
  // Only railselect (a completed pointer or key selection) calls it.
  assert.match(
    home,
    /bindRail\(riderRail\.current, \(i\) => \{\s*selectRider\(i\);\s*revealRiderPanel\(\);\s*\}\)/,
  );
  assert.match(home, /\}, \[selectRider, revealRiderPanel\]\);/);
  const sync = between(home, "function syncRail(", "\n}\n");
  assert.doesNotMatch(sync, /railselect|revealRiderPanel/);
});

test("controls reached by focus stop clear of the fixed header", () => {
  // The pinned zero scroll-padding stays; controls carry the margin instead.
  assert.match(
    polish,
    /html\[data-mode="world"\]:has\(\.site-shell\) \{[^}]*scroll-padding-top: 0;/,
  );
  const rule = polish.match(
    /\.site-shell :where\(a\[href\], button, \[role="tab"\], \[tabindex="0"\]\):where\(:not\(#site-side-panel \*, dialog \*\)\) \{([^}]*)\}/,
  );
  assert.ok(rule, "focus scroll-margin rule");
  assert.match(rule[1], /scroll-margin-top: calc\(88px \+ env\(safe-area-inset-top\)\);/);
  assert.match(rule[1], /scroll-margin-bottom: 16px;/);
});

test("the records rail answers Home/End on the region, and its arrows stay region-only", () => {
  const keys = between(home, 'className="episode-grid"', "{EPISODES.map(");
  assert.match(keys, /aria-label="判明済みエピソードのハイライト。左右キーでも切り替えられます"/);
  const edges = between(keys, "onKeyDownCapture={(event) => {", "}}");
  assert.match(edges, /if \(event\.target !== event\.currentTarget\) return;/);
  assert.match(edges, /if \(event\.key !== "Home" && event\.key !== "End"\) return;/);
  assert.match(edges, /if \(event\.altKey \|\| event\.ctrlKey \|\| event\.metaKey\) return;/);
  assert.match(
    edges,
    /event\.preventDefault\(\);\s*goEpisode\(event\.key === "Home" \? 0 : EPISODES\.length - 1\);/,
  );
  // A focused card's keys never move the rail (episode-pickup.test.mjs,
  // verify-interface-polish.mjs), so the arrows keep their own handler.
  assert.match(
    keys,
    /onKeyDown=\{\(event\) => \{\s*if \(event\.key !== "ArrowLeft" && event\.key !== "ArrowRight"\) return;\s*event\.preventDefault\(\);\s*if \(event\.target !== event\.currentTarget\) return;/,
  );
});

test("desktop hover lights the archive tabs, the dossier pill and the record cards, colour only", () => {
  const hover = between(frosted, "@media (hover: hover) and (pointer: fine) {", "\n}\n");
  for (const selector of [
    'html body :is(.manager-archive-tabs, .world-column-tabs) > button[role="tab"]:not([aria-selected="true"]):hover {',
    "html body .site-shell .rider-dossier-open:hover {",
    "html body .site-shell .episode-card:not(.is-active):hover .episode-card-surface {",
  ]) {
    const at = hover.indexOf(selector);
    assert.ok(at >= 0, selector);
    const body = hover.slice(at, hover.indexOf("}", at));
    assert.doesNotMatch(body, /transform|translate|scale|transition|filter/, selector);
    assert.match(body, /border-color:/, selector);
  }
});

test("the rider tablist is vertical and the slide hint is a description", () => {
  const rail = between(home, "const RiderRail = memo(", "{RIDERS.map(");
  assert.match(rail, /aria-label="八人のメインライダー"\s*aria-orientation="vertical"/);
  assert.match(slide, /aria-label=\{ariaLabel\}/);
  assert.match(
    slide,
    /aria-description="プラスをタップ、または長押ししてから右へスライドして開きます"/,
  );
  assert.doesNotMatch(slide, /aria-label=\{`\$\{ariaLabel\}。/);
});
