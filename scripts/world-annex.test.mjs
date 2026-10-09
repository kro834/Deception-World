import assert from "node:assert/strict";
import { worldViewContract } from "./helpers/world-view-contract.mjs";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import {
  WORLD_BRIEF,
  WORLD_CAST_ROSTER,
  WORLD_EPISODE_NOTES,
  WORLD_GLOSSARY,
  WORLD_LOCATIONS,
  WORLD_QUOTES,
} from "../src/components/world/world-annex-data.ts";

/* World annex (資料目次, 世界と組織, 人物一覧, エピソードの記録, 用語集,
   名台詞). The additions come from the owner's story source; the existing
   /world page is unchanged apart from the three places that render them. */

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const home = read("src/components/world/world-home.tsx");
// The columns render from their own data module (rx6); the contract reads both.
const homeView = `${home}\n${read("src/components/world/world-columns-data.ts")}`;
const annex = read("src/components/world/world-annex.tsx");
const data = read("src/components/world/world-annex-data.ts");
const route = read("src/routes/world.tsx");
const css = read("src/styles-world-annex.css").replace(/\/\*[\s\S]*?\*\//g, "");

test("world-home preserves its layout and copy outside explicitly approved edits", () => {
  // Reviewed 2026-10-06: the requested rider hold guide and decorative
  // WorldAtmosphere and shared name-break markup, plus the source-led
  // synopsis expansion requested on 2026-10-06. Reviewed 2026-10-09:
  // the owner requested Column 05 and its two control labels. The first
  // four columns are additionally pinned in world-mystery.test.mjs;
  // the follow-up reading edition adds semantic chapters only to Column 05.
  // records, artwork and displayed spelling remain pinned here.
  // Re-pinned in rx6 (merged over 2026-10-09): the columns moved to
  // world-columns-data.ts (same text, Column 05 appended from
  // world-mystery-data.ts) and each column heading gained an id for
  // /world#world-column-NN search links.
  assert.deepEqual(worldViewContract(homeView), {
    records: "75248085b518563223b7a6a8b8237a8889c3044e7d62fbda436bc6e763cc74ed",
    markup: "29648a801361c1a6c4c859f6857854b220b9d40a30a6f36592a5d489e04568c0",
  });
  // The WorldAnnexRiders hook stays where it was (this file is pinned), but
  // renders nothing: 02 RIDERS and 03 RECORDS sit back to back, and the
  // annex follows RECORDS as chapters 04-06. Nothing sits between the column
  // rail and the riders heading (verify-world-reveal presses the rail beside
  // that part-lit heading on a 412px phone).
  assert.match(annex, /export function WorldAnnexRiders\(\)\s*\{\s*return null;/);
  assert.match(home, /<\/section>\s*<\/section>\s*<section className="riders-section"/);
  assert.match(home, /<\/section>\s*<WorldAnnexRiders \/>\s*<section className="records-section"/);
  assert.match(
    home,
    /<\/section>\s*<\/section>\s*<WorldAnnexRecords \/>\s*<section className="finale-section"/,
  );
});

test("the annex data is complete", () => {
  assert.deepEqual(
    WORLD_BRIEF.map(({ id }) => id),
    ["rikuei", "kanri", "realms", "code"],
  );
  assert.equal(WORLD_LOCATIONS.length, 6);
  assert.equal(WORLD_CAST_ROSTER.length, 14);
  assert.equal(new Set(WORLD_CAST_ROSTER.map(({ id }) => id)).size, 14);
  for (const entry of WORLD_CAST_ROSTER) {
    assert.ok(entry.name && entry.role && entry.profile.length, entry.id);
    if (entry.to) assert.match(entry.to, /^\/(?:riders|managers|characters)\/[\w-]+$/, entry.id);
  }
  assert.deepEqual(
    WORLD_EPISODE_NOTES.map(({ no, title }) => `${no} ${title}`),
    ["01 HIDE-AND-SEEK", "02 LEGENDS", "03 DECEPTION WORLD"],
  );
  assert.deepEqual(
    WORLD_EPISODE_NOTES.map(({ lines }) => lines.length),
    [3, 3, 5],
  );
  assert.ok(WORLD_EPISODE_NOTES.every(({ synopsis }) => synopsis.length === 3));
  assert.equal(WORLD_GLOSSARY.length, 15);
  for (const entry of WORLD_GLOSSARY) assert.ok(entry.body.length || entry.said.length, entry.term);
  assert.equal(WORLD_QUOTES.length, 17);
  // In-story text only: no chat handles, no ideographic indent spaces.
  assert.doesNotMatch(data, /@|\u3000/);
  // Conflicting or undecided facts stay out until the owner settles them.
  for (const held of [
    "採録制",
    "モスコ",
    "ニヒル",
    "ワンコ",
    "プロヴァンス",
    "慶弥",
    "シエル",
    "冤罪",
  ]) {
    assert.ok(!data.includes(held), held);
  }
});

test("the view contract still detects changes to story data, copy and layout", () => {
  const original = worldViewContract(homeView);
  assert.notEqual(
    worldViewContract(homeView.replace('title: "脚本制と採録制"', 'title: "変更"')).records,
    original.records,
  );
  assert.notEqual(
    worldViewContract(homeView.replace("救うべき世界は、目の前にある。", "変更")).markup,
    original.markup,
  );
  assert.notEqual(
    worldViewContract(homeView.replace('className="riders-section"', 'className="changed"')).markup,
    original.markup,
  );
  assert.deepEqual(
    worldViewContract(homeView.replace("onClick={shufflePoster}", "onClick={revisedHandler}")),
    original,
  );
  // This readiness marker changes GPU timing, not artwork or rendered layout.
  assert.deepEqual(
    worldViewContract(homeView.replace(/\s*data-ultra-artwork-ready=\{artworkReady \? "true" : undefined\}/, "")),
    original,
  );
  assert.notEqual(
    worldViewContract(homeView.replace('className="riders-section"', 'className="riders-section" data-ultra-artwork-ready="true"')).markup,
    original.markup,
  );
});

test("each annex is its own section, listed in the contents", () => {
  // The annex now follows 03 RECORDS in chapter order 04-06.
  const ids = ["cast-roster", "world-brief", "episode-notes", "glossary", "quotes"];
  for (const id of ids) {
    assert.match(annex, new RegExp(`<section\\s+id="${id}"\\s+className="world-annex[ "]`), id);
    assert.match(annex, new RegExp(`aria-labelledby="${id}-title"`), id);
  }
  const hrefs = [...annex.matchAll(/href: "#([\w-]+)"/g)].map((match) => match[1]);
  assert.deepEqual(hrefs, ids);
  assert.match(annex, /<nav className="wa-contents" aria-labelledby="wa-contents-title">/);
  // Static documents: the typed reveal and film reveal stay on their blocks.
  assert.doesNotMatch(
    annex,
    /data-text-reveal|data-film-reveal|RevealText|data-performance-region/,
  );
  // The topbar keeps its three chapter links.
  assert.equal(home.match(/<a\s+href="#(?:story|riders|records)"\s+aria-label=/g)?.length, 3);
  assert.match(annex, /aria-label=\{`\$\{entry\.name\}の個別資料を開く`\}/);
});

test("the annex sheet sits before the Mirage face, which stays last", () => {
  const links = route.slice(route.search(/stylesheetLinks:\s*\[/));
  const order = [
    "href: worldReDiveCssUrl",
    "href: worldAnnexCssUrl",
    "href: MIRAGE_FONTS_URL",
    "href: worldMirageCssUrl",
  ].map((needle) => links.indexOf(needle));
  assert.ok(
    order.every((index, i) => index > 0 && (i === 0 || index > order[i - 1])),
    String(order),
  );
});

test("the annex sheet keeps the page rules", () => {
  for (const size of css.matchAll(/font-size:\s*([^;]+);/g)) {
    const minimum = size[1].match(/^clamp\(([\d.]+)px/)?.[1] ?? size[1].match(/^([\d.]+)px$/)?.[1];
    assert.ok(minimum != null && Number(minimum) >= 12, size[1]);
  }
  assert.doesNotMatch(css, /animation|@keyframes|view-timeline|scroll-timeline|transition/);
  assert.doesNotMatch(css, /touch-action:|overscroll-behavior:|backdrop-filter:|!important/);
  assert.match(css, /@media \(forced-colors: active\)[\s\S]*-webkit-text-fill-color: CanvasText;/);
  assert.match(
    css,
    /\.wa-contents a:focus-visible,\s*\.site-shell\.film-edition\.mirage-edition \.wa-open:focus-visible \{\s*outline: 2px solid var\(--mr-focus\);/,
  );
  assert.match(
    css,
    /\.wa-contents a,\s*\.site-shell\.film-edition\.mirage-edition \.wa-open \{[^}]*min-height: 44px;/,
  );
  const selectors = [...css.matchAll(/(?:^|[{};])\s*([^{};@\s][^{};]*)\{/g)]
    .map((match) => match[1].trim())
    .filter((selector) => !/^(?:from|to|\d+%)$/.test(selector));
  for (const group of selectors) {
    // Split on top-level commas only (not those inside :is()).
    for (const part of group.split(/,\s*(?![^()]*\))/)) {
      assert.match(
        part,
        /^(?:html\[data-world-effects="economy"\]\s+)?\.site-shell\.film-edition\.mirage-edition\b/,
        part,
      );
    }
  }
});

test("the annex presentation: chapter openers, portraits, disclosures, the quote rail", () => {
  // Chapter openers are a still clone, never the choreographed class.
  assert.doesNotMatch(annex, /className="section-index"/);
  // Every image is decorative and lazy.
  const imgs = [...annex.matchAll(/<img\b[\s\S]*?\/>/g)].map((match) => match[0]);
  assert.ok(imgs.length >= 4, String(imgs.length));
  for (const img of imgs) {
    assert.match(img, /alt=""/, img);
    assert.match(img, /loading="lazy"/, img);
  }
  // Portrait and episode art: existing site files only.
  const paths = [...annex.matchAll(/"(\/[\w-]+\.(?:jpe?g|webp|png))"/g)].map((match) => match[1]);
  assert.ok(paths.length >= 13, String(paths.length));
  for (const path of paths) {
    assert.ok(existsSync(new URL(`../public${path}`, import.meta.url)), path);
  }
  for (const key of ["rex-loi", "reemu", "shuza"]) {
    assert.ok(existsSync(new URL(`../public/manager-${key}-thumb.jpeg`, import.meta.url)), key);
  }
  // 2026-09-30: the rail is a keyboard stop only while it scrolls (below
  // 700px); the still desktop list is no longer an empty Tab stop.
  assert.match(
    annex,
    /<div\s+ref=\{railRef\}\s+className="wa-quote-rail"\s+role="region"\s+tabIndex=\{scrolls \? 0 : undefined\}\s+aria-labelledby="quotes-title"\s+id="world-quotes-rail"/,
  );
  assert.match(annex, /setScrolls\(rail\.scrollWidth > rail\.clientWidth \+ 1\)/);
  assert.match(annex, /const \[scrolls, setScrolls\] = useState\(true\);/);
  assert.match(css, /scroll-margin-top: calc\(\s*var\(--film-topbar-height/);
  assert.match(css, /summary:focus-visible \{\s*outline: 2px solid var\(--mr-focus\);/);
  // REALMS documents keep the office as their accessible name (it was the
  // old section's aria-label), and no heading sits inside a summary.
  assert.match(
    annex,
    /<details key=\{doc\.office\} className="wa-doc" aria-label=\{doc\.office\}>/,
  );
  assert.doesNotMatch(annex, /<summary>\s*<h\d/);
  // An opened profile takes the next row; dense packing closes the cell it left.
  assert.match(css, /\.wa-roster \{[^}]*grid-auto-flow: row dense;/);
});

test("the PROFILE switch reads as a control and stays under the finger", () => {
  // Native disclosure and its naming stay as they were (find-in-page opens it).
  assert.match(
    annex,
    /<details className="wa-profile" onToggle=\{keepProfileInPlace\}>\s*<summary onClick=\{noteProfileTop\}>\s*<span className="wa-sr">\{entry\.name\}<\/span> <span lang="en">PROFILE<\/span>\s*<\/summary>/,
  );
  // Opening moves the tile to the next row: the summary's top is noted on
  // click and restored with an instant scroll (no smooth scroll, no motion),
  // only after a click, and never above the topbar (its scroll-margin-top).
  assert.match(
    annex,
    /profileTops\.set\(event\.currentTarget, event\.currentTarget\.getBoundingClientRect\(\)\.top\)/,
  );
  assert.match(annex, /if \(!summary \|\| before === undefined\) return;/);
  assert.match(annex, /window\.scrollBy\(\{ top: shift, behavior: "instant" \}\)/);
  assert.match(annex, /getComputedStyle\(summary\)\.scrollMarginTop/);
  // The disclosure retains a 44px hit area and a reversed open chevron.
  // CLOSE is generated with an empty alt so the accessible name stays
  // "<name> PROFILE"; its quiet reading row is distinct from the file exit.
  assert.match(
    css,
    /\.wa-profile > summary,\s*\.site-shell\.film-edition\.mirage-edition \.wa-doc > summary \{[^}]*min-height: 44px;/,
  );
  assert.match(css, /\.wa-profile\[open\] > summary::before,[^{]*\{[^}]*rotate: -135deg;/);
  assert.match(
    css,
    /@container \(min-width: 196px\) \{[^}]*content: "CLOSE" \/ "";[^}]*font-size: 12px;/,
  );
  assert.match(
    css,
    /@media \(forced-colors: active\)[\s\S]*\.wa-profile\[open\] > summary::after,[^{]*\{\s*background: Highlight;/,
  );
});
