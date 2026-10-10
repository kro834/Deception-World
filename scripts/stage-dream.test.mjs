import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import test from "node:test";

/* STAGE (rx10): the Dream Chapter as a film programme in scenes
   (src/styles-stage-dream.css). A reflow and repaint only: linked last of
   the Dream sheets and before the cinematic edition, scoped to the dream
   family and the doubled page class, no words of its own, no motion,
   nothing under 12px, no !important, and only two published pictures. */

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const stripComments = (source) => source.replace(/\/\*[\s\S]*?\*\//g, "");
const splitSelector = (selector) => {
  const parts = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < selector.length; i += 1) {
    if (selector[i] === "(") depth += 1;
    else if (selector[i] === ")") depth -= 1;
    else if (selector[i] === "," && depth === 0) {
      parts.push(selector.slice(start, i));
      start = i + 1;
    }
  }
  return [...parts, selector.slice(start)].map((part) => part.trim());
};

const css = stripComments(await read("src/styles-stage-dream.css"));

test("the stage sheet is the last Dream sheet, before the cinematic edition, on Dream only", async () => {
  const route = await read("src/routes/dream-chapter.tsx");
  assert.match(route, /import stageDreamCssUrl from "@\/styles-stage-dream\.css\?url";/);
  const links = route.slice(route.search(/links:\s*\[/));
  const reader = links.indexOf('{ rel: "stylesheet", href: dreamReaderCssUrl }');
  const stage = links.indexOf('{ rel: "stylesheet", href: stageDreamCssUrl }');
  const cinematic = links.indexOf("CINEMATIC_STYLESHEET_LINK");
  assert.ok(reader > 0 && stage > reader && cinematic > stage, `${reader} ${stage} ${cinematic}`);
  for (const path of [
    "src/lib/world-head.ts",
    "src/routes/__root.tsx",
    "src/routes/world.tsx",
    "src/routes/rexonance-saga.tsx",
    "src/routes/extreme-saga.tsx",
    "src/routes/final-stage.tsx",
  ]) {
    assert.doesNotMatch(await read(path), /stage-dream|stageDream/, path);
  }
});

test("every rule is scoped to the dream family and the doubled page class", () => {
  let count = 0;
  for (const [, selector] of css.matchAll(/(?:^|[{};])\s*([^{}@;]+)\{/g)) {
    for (const part of splitSelector(selector)) {
      count += 1;
      assert.match(part, /^html\[data-family="dream"\]\s+main\.dream-page\.dream-page\b/, part);
    }
  }
  assert.ok(count > 150, String(count));
  // The shell owns the header, the act bar and the side menu.
  assert.doesNotMatch(css, /dream-site-header|dream-chapter-nav|site-side-panel|side-panel/);
});

test("the sheet adds no words, no motion, no blur and nothing under 12px", () => {
  for (const [, value] of css.matchAll(/(?<![\w-])content:\s*([^;]+);/g)) {
    assert.ok(/^(?:""|none|"[^"]*"\s*\/\s*"")$/.test(value.trim()), value);
  }
  // The seals' numerals: act numerals and scene numbers only.
  for (const [, text] of css.matchAll(/content:\s*"([^"]+)"\s*\/\s*""/g)) {
    assert.match(text, /^(?:I{1,3}|IV|附)\\A \d\d$/, text);
  }
  assert.doesNotMatch(css, /@keyframes|transition\s*:|backdrop-filter|!important|will-change/);
  for (const [, value] of css.matchAll(/animation(?:-name)?\s*:\s*([^;]+);/g)) {
    assert.equal(value.trim(), "none");
  }
  for (const [, size] of css.matchAll(/font(?:-size)?:\s*(?:\d{3}\s+)?(\d+(?:\.\d+)?)px/g)) {
    assert.ok(Number(size) >= 12, size);
  }
  for (const [, min] of css.matchAll(/font(?:-size)?:\s*(?:\d{3}\s+)?clamp\((\d+(?:\.\d+)?)px/g)) {
    assert.ok(Number(min) >= 12, min);
  }
  assert.doesNotMatch(css, /:has\(/);
});

test("the roster's art is two pictures the site already publishes, at card size", async () => {
  const urls = [...css.matchAll(/url\("([^"]+)"\)/g)].map((match) => match[1]);
  assert.deepEqual([...new Set(urls)].sort(), [
    "/civilian-bell-20260826-delivery-360.webp",
    "/dream-chapter-poster-thumb-15.jpeg",
  ]);
  for (const url of urls) {
    const { size } = await stat(new URL(`../public${url}`, import.meta.url));
    assert.ok(size < 40_000, `${url} ${size}`);
  }
  // Keyed on the owner's own roster ids, not on new markup.
  const page = await read("src/components/dream-chapter/dream-chapter.tsx");
  assert.match(page, /aria-labelledby=\{`dream-roster-\$\{entry\.id\}`\}/);
  const data = await read("src/components/dream-chapter/dream-chapter-data.ts");
  assert.match(data, /id: "bell",\s*name: "ベル"/);
  assert.match(data, /id: "machiavel",\s*name: "マキャベル"/);
});

test("the phone rails keep the page's vertical scroll and every record on the page", () => {
  const rail = css.slice(css.indexOf("grid-auto-flow: column;"));
  assert.ok(css.lastIndexOf("@media (max-width: 760px)", css.indexOf("grid-auto-flow: column;")) > 0);
  assert.match(rail, /overflow-x: auto;\s*overflow-y: hidden;/);
  assert.match(rail, /scroll-snap-type: x mandatory;/);
  assert.doesNotMatch(css, /touch-action|display: none;[^}]*dream-(?:atlas|case-notes|agent|quote)/);
  // Nothing in this sheet hides a record: the only display: none is the old
  // frames' ornament and the corners' superseded numbering chips.
  const hidden = [...css.matchAll(/([^{}]+)\{[^}]*display: none;/g)].map((match) => match[1].trim());
  for (const selector of hidden) {
    assert.match(selector, /::(?:before|after)|\.dream-hero::after/, selector);
  }
});

test("each skipped scene carries an estimate in every layout the verify measures", () => {
  const ids = [
    "posters",
    "characters",
    "dolminence",
    "cast-roster",
    "factions",
    "case-notes",
    "chronicle",
    "atlas",
    "relations",
    "arsenal",
    "glossary",
    "quotes",
  ];
  for (const id of ids) {
    const count = css.match(
      new RegExp(`main\\.dream-page\\.dream-page #${id} \\{\\s*contain-intrinsic-size: auto \\d+px;`, "g"),
    )?.length;
    assert.equal(count, 10, id);
  }
});
