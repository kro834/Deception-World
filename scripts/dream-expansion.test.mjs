import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  DREAM_AGENT_ROSTER,
  DREAM_CASE_NOTES,
  DREAM_CASES,
  DREAM_CAST_ROSTER,
  DREAM_CHARACTERS,
  DREAM_DOLMINENCE,
  DREAM_DOLMINENCE_RECORD,
  DREAM_FACTIONS,
  DREAM_GLOSSARY,
  DREAM_QUOTES,
} from "../src/components/dream-chapter/dream-chapter-data.ts";

/* Dream Chapter expansion (人物一覧, 組織と勢力, 章の言葉, 用語集, 名台詞, 目次).
   The additions come from the owner's story source and sit after the
   existing data. The owner requested rewritten case/crossing prose on
   2026-10-01; posters, headline dossiers and combat records remain pinned. */

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const data = read("src/components/dream-chapter/dream-chapter-data.ts");
const page = read("src/components/dream-chapter/dream-chapter.tsx");
const route = read("src/routes/dream-chapter.tsx");
const css = read("src/styles-dream-annex.css").replace(/\/\*[\s\S]*?\*\//g, "");

const EXPANSION_MARKER =
  "\n// ---------------------------------------------------------------------------\n// Expansion from the owner's story source";

test("Dream preserves posters, headline dossiers and combat records outside approved prose edits", () => {
  const cut = data.indexOf(EXPANSION_MARKER);
  assert.ok(cut > 0, "expansion marker");
  const existing = data
    .slice(0, cut)
    .replace(
      "// あらすじ・人物紹介・用語の説明は原文に基づく要約。\n" +
        "// line / said / quotes と DREAM_QUOTES / DREAM_CASE_NOTES の台詞は原文の引用。\n",
      "",
    );
  const start = existing.indexOf("export const DREAM_CASES =");
  const end = existing.indexOf("export type DossierSection =");
  assert.ok(start > 0 && end > start, "only the case/crossing prose region is exempted");
  // These regions retain the posters, names, quotes and combat records.
  // The reviewed Lupin summaries describe inherited specifications without
  // the former editorial instructions; exact cases have their own guard.
  assert.equal(
    createHash("sha256")
      .update(existing.slice(0, start) + existing.slice(end))
      .digest("hex"),
    "757d90092e2d40428c81b4cdefc919af0e39a7208b892a30fdea5a2124f08957",
  );
  assert.deepEqual(
    DREAM_CASES.map(({ no, title, reading }) => `${no}${title}${reading}`),
    [
      "0交わるINTERSECT",
      "1開くOPEN",
      "2開けるUNLOCK",
      "3明けるDAWN",
      "4来たるARRIVAL",
      "5叛くREVOLT",
    ],
  );
  assert.deepEqual(
    DREAM_CHARACTERS.map(({ name }) => name),
    ["シエル", "東風谷 慶弥", "怪作"],
  );
});

test("the roster, record, factions, glossary, notes and quotes are complete", () => {
  assert.equal(DREAM_CAST_ROSTER.length, 16);
  assert.equal(new Set(DREAM_CAST_ROSTER.map(({ id }) => id)).size, 16);
  for (const entry of DREAM_CAST_ROSTER) {
    assert.ok(entry.name && entry.affiliation && entry.line, entry.id);
    assert.ok(entry.profile.length >= 1, entry.id);
  }
  // The three headline dossiers are not repeated in the roster.
  for (const { name } of DREAM_CHARACTERS) {
    assert.ok(
      !DREAM_CAST_ROSTER.some((entry) => entry.name.replace(/\s/g, "") === name.replace(/\s/g, "")),
    );
  }
  assert.deepEqual(
    DREAM_DOLMINENCE_RECORD.map(({ label }) => label),
    ["拠点", "構成", "行動", "目的"],
  );
  const ids = new Set(DREAM_DOLMINENCE.map(({ id }) => id));
  const filed = DREAM_AGENT_ROSTER.filter((agent) => agent.filed);
  assert.deepEqual(filed.map(({ filed: id }) => id).sort(), [...ids].sort());
  for (const agent of DREAM_AGENT_ROSTER) {
    assert.ok(agent.filed || agent.name, agent.code);
  }
  assert.deepEqual(
    DREAM_FACTIONS.map(({ name }) => name),
    ["縫妖師", "永守組"],
  );
  assert.equal(DREAM_GLOSSARY.length, 13);
  for (const entry of DREAM_GLOSSARY) assert.ok(entry.body.length || entry.said, entry.term);
  assert.equal(DREAM_QUOTES.length, 9);
  assert.deepEqual(
    DREAM_CASE_NOTES.map(({ no }) => no),
    DREAM_CASES.map(({ no }) => no),
  );
});

test("each annex renders as its own section, listed in the 目次", () => {
  const annexes = ["cast-roster", "factions", "case-notes", "glossary", "quotes"];
  for (const id of annexes) {
    assert.match(page, new RegExp(`<section\\s+id="${id}"\\s+className="dream-annex[ "]`), id);
  }
  // The act index keeps its four cells; the annexes live in the contents.
  const actIndex = page.slice(
    page.indexOf("const DREAM_SECTION_LINKS"),
    page.indexOf("\n];", page.indexOf("const DREAM_SECTION_LINKS")),
  );
  assert.equal(actIndex.match(/\{ id: "/g)?.length, 4);
  const contents = page.slice(
    page.indexOf("const DREAM_CONTENTS"),
    page.indexOf("\n];", page.indexOf("const DREAM_CONTENTS")),
  );
  const hrefs = [...contents.matchAll(/href: "#([\w-]+)"/g)].map((match) => match[1]);
  // 2026-10-02 Track D: the four archive corners (出来事, 舞台, 繋がり, 武装) close 第四幕
  // (scripts/dream-extra-ui.test.mjs pins their rows); the 附録 row is unchanged.
  assert.deepEqual(hrefs, [
    "posters",
    "characters",
    "cast-roster",
    "dolminence",
    "factions",
    "cases",
    "case-notes",
    "chronicle",
    "atlas",
    "relations",
    "arsenal",
    "glossary",
    "quotes",
  ]);
  for (const id of hrefs) assert.match(page, new RegExp(`id="${id}"`), id);
  assert.match(page, /<nav className="dream-contents" aria-labelledby="dream-contents-title"/);
  // Filed agents open the existing dossier dialog.
  assert.match(page, /className="dream-agent-open"[\s\S]*?setDolminenceRecord\(filed\)/);
  assert.doesNotMatch(page, /\u3000/);
});

test("the annex sheet loads after the elevation sheet and keeps the page rules", () => {
  const links = route.slice(route.search(/links:\s*\[/));
  const elevation = links.indexOf("href: dreamElevationCssUrl");
  const annex = links.indexOf("href: dreamAnnexCssUrl");
  const cinematic = links.indexOf("CINEMATIC_STYLESHEET_LINK");
  assert.ok(
    elevation > 0 && annex > elevation && cinematic > annex,
    `${elevation} ${annex} ${cinematic}`,
  );

  for (const size of css.matchAll(/font-size:\s*([^;]+);/g)) {
    const minimum = size[1].match(/^clamp\((\d+)px/)?.[1] ?? size[1].match(/^(\d+)px$/)?.[1];
    if (minimum != null) assert.ok(Number(minimum) >= 12, size[1]);
  }
  assert.doesNotMatch(css, /animation|@keyframes|view-timeline|scroll-timeline/);
  assert.doesNotMatch(css, /touch-action:|overscroll-behavior:|backdrop-filter:/);
  assert.doesNotMatch(css, /!important/);
  assert.match(css, /@media \(forced-colors: active\)[\s\S]*-webkit-text-fill-color: CanvasText;/);
  assert.match(
    css,
    /\.dream-contents a:focus-visible,\s*\.dream-page\.dream-page \.dream-agent-open:focus-visible \{\s*outline: 2px solid var\(--ts-fuji\);/,
  );
  assert.match(css, /\.dream-contents a \{[^}]*min-height: 44px;/);
  assert.match(css, /\.dream-agent-open \{[^}]*min-height: 44px;/);
  const selectors = [...css.matchAll(/(?:^|[{};])\s*([^{};@\s][^{};]*)\{/g)]
    .map((match) => match[1].trim())
    .filter((selector) => !/^(?:from|to|\d+%)$/.test(selector));
  for (const group of selectors) {
    assert.match(
      group,
      /^(?:html\[data-world-effects="economy"\]\s+)?\.dream-page\.dream-page\b/,
      group,
    );
  }
});
