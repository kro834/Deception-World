import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

/* STAGE (rx10): the character files' art stage (src/styles-stage-dossier.css).
   A reflow and repaint only: linked last of the dossier sheets (and on the
   first-rank file between the World sheets and its own sheet), scoped to the
   dossier family, no text, no motion, nothing under 12px, no !important. */

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

const css = stripComments(await read("src/styles-stage-dossier.css"));

test("the stage sheet is the last dossier sheet, and the first-rank file links it before its own", async () => {
  const head = await read("src/lib/world-head.ts");
  assert.match(head, /import stageDossierCssUrl from "@\/styles-stage-dossier\.css\?url";/);
  const dossier = head.slice(head.indexOf("export const DOSSIER_STYLESHEET_LINKS"));
  const list = dossier.slice(0, dossier.indexOf("];"));
  assert.match(list, /href: dossierReadingCssUrl \},\s*STAGE_DOSSIER_STYLESHEET_LINK,\s*$/);
  // Not in the World links: every other family stays as it was.
  const world = head.slice(head.indexOf("export const WORLD_STYLESHEET_LINKS"));
  assert.doesNotMatch(world.slice(0, world.indexOf("];")), /STAGE_DOSSIER/);
  const zeus = await read("src/routes/managers/zeus.tsx");
  assert.ok(
    zeus.indexOf("STAGE_DOSSIER_STYLESHEET_LINK,") <
      zeus.indexOf('{ rel: "stylesheet", href: sovereignFileCssUrl }'),
  );
});

test("every rule is scoped to the dossier family", () => {
  let count = 0;
  for (const [, selector] of css.matchAll(/(?:^|[{};])\s*([^{}@;]+)\{/g)) {
    for (const part of splitSelector(selector)) {
      count += 1;
      assert.ok(part.startsWith('html[data-family="dossier"]'), part);
    }
  }
  assert.ok(count > 100, String(count));
});

test("the sheet adds no text, no motion, no blur and nothing under 12px", () => {
  for (const [, value] of css.matchAll(/(?<![\w-])content:\s*([^;]+);/g)) {
    assert.ok(/^(?:""|none|(?:"[^"]*"|counter\([^)]*\))\s*\/\s*"")$/.test(value.trim()), value);
  }
  assert.doesNotMatch(css, /@keyframes|transition\s*:|backdrop-filter|!important/);
  for (const [, value] of css.matchAll(/animation(?:-name)?\s*:\s*([^;]+);/g)) {
    assert.equal(value.trim(), "none");
  }
  for (const [, size] of css.matchAll(/font(?:-size)?:\s*(?:\d{3}\s+)?(\d+(?:\.\d+)?)px/g)) {
    assert.ok(Number(size) >= 12, size);
  }
  for (const [, min] of css.matchAll(/font(?:-size)?:\s*(?:\d{3}\s+)?clamp\((\d+(?:\.\d+)?)px/g)) {
    assert.ok(Number(min) >= 12, min);
  }
});

test("the ids, the load gate's hooks and the pinned controls keep their elements", async () => {
  const rider = await read("src/components/world/rider-page.tsx");
  for (const id of ["dossier-profile", "identity-records", "dossier-index", "form-records"]) {
    assert.match(rider, new RegExp(`id="${id}"`));
  }
  assert.match(rider, /id=\{`character-section-\$\{s\.no\}`\}/);
  // The end card's portrait is decorative: the link keeps its own name.
  const nav = await read("src/components/world/dossier-nav.tsx");
  assert.match(nav, /<span className="dossier-nav-portrait" aria-hidden="true">/);
  assert.match(nav, /alt="" loading="lazy" decoding="async"/);
  assert.match(nav, /aria-label=\{`\$\{next\.name\}の資料へ`\}/);
  // The first rank's seal stays.
  const manager = await read("src/components/world/manager-stub.tsx");
  assert.match(
    manager,
    /className="sovereign-apex-seal" role="img" aria-label="六詠第一位、主権の管理人"/,
  );
});
