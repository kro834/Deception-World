import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

/* STAGE (rx10): the World's chapters as lit scenes (src/styles-stage-world.css).
   A repaint and reflow only: linked on /world ahead of the HUD face and the
   last sheet, scoped to the world family and the shell's class chain, no
   text, no motion, nothing under 12px; !important only answers the paint the
   frosted-control and pickup sheets force. */

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
  return [...parts, selector.slice(start)].map((part) => part.replace(/\s+/g, " ").trim());
};

const css = stripComments(await read("src/styles-stage-world.css"));
const SCOPE = 'html[data-family="world"]:root body main.site-shell.film-edition.mirage-edition';

test("the stage sheet loads on /world only, before the HUD face and the last sheet", async () => {
  const route = await read("src/routes/world.tsx");
  assert.match(route, /import stageWorldCssUrl from "@\/styles-stage-world\.css\?url";/);
  const links = route.slice(route.search(/stylesheetLinks:\s*\[/));
  const order = [
    "href: worldTranscriptCssUrl",
    "href: stageWorldCssUrl",
    "href: MIRAGE_FONTS_URL",
    "href: worldMirageCssUrl",
  ].map((needle) => links.indexOf(needle));
  assert.ok(order.every((index, i) => index > 0 && (i === 0 || index > order[i - 1])), String(order));
  assert.equal(
    links.lastIndexOf('rel: "stylesheet"'),
    links.lastIndexOf('{ rel: "stylesheet", href: worldMirageCssUrl }') + 2,
  );
  for (const path of ["src/lib/world-head.ts", "src/routes/__root.tsx"]) {
    assert.doesNotMatch(await read(path), /styles-stage-world/, path);
  }
});

test("every rule is scoped to the world family and the shell, never the bar or the menu", () => {
  let count = 0;
  for (const [, selector] of css.matchAll(/(?:^|[{};])\s*([^{}@;]+)\{/g)) {
    for (const part of splitSelector(selector)) {
      count += 1;
      assert.ok(part.startsWith(SCOPE), part);
      assert.doesNotMatch(part, /topbar|side-panel|site-side-panel|announcement|zeus-button/, part);
    }
  }
  assert.ok(count > 150, String(count));
});

test("the sheet adds no text, no motion, no blur and nothing under 12px", () => {
  for (const [, value] of css.matchAll(/(?<![\w-])content:\s*([^;]+);/g)) {
    assert.ok(/^(?:""|none)$/.test(value.trim()), value);
  }
  assert.doesNotMatch(css, /@keyframes|transition\s*:|backdrop-filter|filter\s*:\s*blur|animation/);
  for (const [, size] of css.matchAll(/font(?:-size)?:\s*(?:\d{3}\s+)?(\d+(?:\.\d+)?)px/g)) {
    assert.ok(Number(size) >= 12, size);
  }
  for (const [, min] of css.matchAll(/font(?:-size)?:\s*(?:\d{3}\s+)?clamp\((\d+(?:\.\d+)?)px/g)) {
    assert.ok(Number(min) >= 12, min);
  }
  // !important only on the paint the older control sheets force.
  for (const [, property] of css.matchAll(/([\w-]+):[^;{}]*!important/g)) {
    assert.match(property, /^(?:border|border-color|border-radius|background|box-shadow)$/, property);
  }
});

test("the story plate keeps its ten painted layers on every tier", () => {
  const block = css.match(
    /@media \(forced-colors: none\) \{\s*html\[data-family="world"\]:root body main\.site-shell\.film-edition\.mirage-edition > #story > \.story-layout \{([^}]*)\}/,
  );
  assert.ok(block, "story plate rule");
  const background = block[1].match(/background:([^;]+);/)[1];
  assert.equal(background.split("linear-gradient").length - 1, 10);
  assert.doesNotMatch(background, /radial-gradient/);
});

test("the marquee bands and the hero HUD layer are hidden, the copy is not", async () => {
  assert.match(css, /> \.mr-ticker \{\s*display: none;/);
  assert.match(css, /> \.hero > \.mr-hero-hud \{\s*visibility: hidden;/);
  // The poster counter stays in the accessibility tree (visually hidden, not display: none).
  assert.match(css, /\.poster-controls\s*> output \{\s*position: absolute;[^}]*clip-path: inset\(50%\);/);
  const home = await read("src/components/world/world-home.tsx");
  for (const id of ["top", "story", "manager-archive", "riders", "riders-return", "records"]) {
    assert.match(home, new RegExp(`id="${id}"`), id);
  }
  assert.match(home, /<i className="mr-redact">欺瞞<\/i>でできている。/);
  const annex = await read("src/components/world/world-annex.tsx");
  for (const id of ["cast-roster", "world-brief", "episode-notes", "glossary", "quotes"]) {
    assert.match(annex, new RegExp(`id="${id}"`), id);
  }
});
