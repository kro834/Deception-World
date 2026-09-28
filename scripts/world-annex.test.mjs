import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  WORLD_BRIEF,
  WORLD_CAST_ROSTER,
  WORLD_EPISODE_NOTES,
  WORLD_GLOSSARY,
  WORLD_LOCATIONS,
  WORLD_QUOTES,
} from "../src/components/world/world-annex-data.ts";

/* World annex (資料目次, 世界と組織, 人物一覧, エピソードの言葉, 用語集,
   名台詞). The additions come from the owner's story source; the existing
   /world page is unchanged apart from the three places that render them. */

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const home = read("src/components/world/world-home.tsx");
const annex = read("src/components/world/world-annex.tsx");
const data = read("src/components/world/world-annex-data.ts");
const route = read("src/routes/world.tsx");
const css = read("src/styles-world-annex.css").replace(/\/\*[\s\S]*?\*\//g, "");

test("world-home.tsx is byte for byte its earlier self plus the annex hooks", () => {
  const hooks = ['import { WorldAnnexRecords, WorldAnnexRiders } from "./world-annex";\n'];
  let stripped = home;
  for (const hook of hooks) {
    assert.ok(stripped.includes(hook), hook);
    stripped = stripped.replace(hook, "");
  }
  for (const name of ["WorldAnnexRiders", "WorldAnnexRecords"]) {
    assert.equal(home.split(`<${name} />`).length, 2, name);
    stripped = stripped.replace(`\n      <${name} />\n`, "");
  }
  // SHA-256 of world-home.tsx before the annex (every existing string on
  // /world). Update only on the owner's request to change that copy.
  assert.equal(
    createHash("sha256").update(stripped).digest("hex"),
    "50bdfab3cbf6fe8e8e9c1d3aed6ba1ecc2a100346c647993f796f1ed10becc98",
  );
  // Each group follows the chapter it extends. Nothing sits between the
  // column rail and the riders heading (verify-world-reveal presses the rail
  // beside that part-lit heading on a 412px phone).
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
  assert.equal(WORLD_LOCATIONS.length, 5);
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
  for (const episode of WORLD_EPISODE_NOTES) assert.equal(episode.lines.length, 3);
  assert.equal(WORLD_GLOSSARY.length, 13);
  for (const entry of WORLD_GLOSSARY) assert.ok(entry.body.length || entry.said.length, entry.term);
  assert.equal(WORLD_QUOTES.length, 10);
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

test("each annex is its own section, listed in the contents", () => {
  const ids = ["world-brief", "cast-roster", "episode-notes", "glossary", "quotes"];
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
