import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

/* ZENITH (2026-10-21): the character files' brush-up sheet
   (src/styles-dossier-zenith.css) and the markup it styles: the record strip
   on every form card (CALL SEQUENCE + SPEC SHEET), the roster rail at the
   end of a file, the record viewer's numbered calls and ruled plates, and
   the next file's numeral. Scoped to the dossier family, nothing under 12px,
   no loops, motion only for full-motion readers, decoration silent. */

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

const css = stripComments(await read("src/styles-dossier-zenith.css"));

test("the zenith sheet is linked last: after the stage sheet, and after the sovereign sheet on Zeus", async () => {
  const head = await read("src/lib/world-head.ts");
  assert.match(head, /import dossierZenithCssUrl from "@\/styles-dossier-zenith\.css\?url";/);
  const dossier = head.slice(head.indexOf("export const DOSSIER_STYLESHEET_LINKS"));
  const list = dossier.slice(0, dossier.indexOf("];"));
  assert.match(list, /STAGE_DOSSIER_STYLESHEET_LINK,\s*DOSSIER_ZENITH_STYLESHEET_LINK,\s*$/);
  const world = head.slice(head.indexOf("export const WORLD_STYLESHEET_LINKS"));
  assert.doesNotMatch(world.slice(0, world.indexOf("];")), /ZENITH/);
  const zeus = await read("src/routes/managers/zeus.tsx");
  assert.ok(
    zeus.indexOf('{ rel: "stylesheet", href: sovereignFileCssUrl }') <
      zeus.lastIndexOf("DOSSIER_ZENITH_STYLESHEET_LINK,"),
  );
});

test("every rule is scoped to the dossier family", () => {
  let count = 0;
  for (const [, selector] of css.matchAll(/(?:^|[{};])\s*([^{}@;]+)\{/g)) {
    for (const part of splitSelector(selector)) {
      count += 1;
      assert.ok(
        /^html(?::not\(\[data-world-effects="economy"\]\))?\[data-family="dossier"\]/.test(part),
        part,
      );
    }
  }
  assert.ok(count > 60, String(count));
});

test("nothing under 12px, no loops, no !important, and generated numbers stay silent", () => {
  assert.doesNotMatch(css, /@keyframes|infinite|!important|backdrop-filter/);
  for (const [, value] of css.matchAll(/(?<![\w-])content:\s*([^;]+);/g)) {
    assert.ok(
      /^(?:""|none|(?:"[A-Z ]+"\s*)?counter\([^)]*\)\s*\/\s*"")$/.test(value.trim()),
      value,
    );
  }
  for (const [, size] of css.matchAll(/font(?:-size)?:\s*(?:\d{3}\s+)?(\d+(?:\.\d+)?)px/g)) {
    assert.ok(Number(size) >= 12, size);
  }
  for (const [, min] of css.matchAll(/font(?:-size)?:\s*(?:\d{3}\s+)?clamp\((\d+(?:\.\d+)?)px/g)) {
    assert.ok(Number(min) >= 12, min);
  }
});

test("movement runs only for full-motion readers; other transitions fade colour or opacity", () => {
  const gate = css.indexOf("@media (prefers-reduced-motion: no-preference)");
  assert.ok(gate > 0);
  let moves = 0;
  for (const rule of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const [, selector, body] = rule;
    const transition = body.match(/transition\s*:([^;]+);/)?.[1] ?? "";
    const moving =
      /(?<![\w-])(?:translate|scale)\s*:\s*(?!none)/.test(body) ||
      /translate|scale/.test(transition);
    if (moving) {
      moves += 1;
      assert.ok(rule.index > gate, selector);
      assert.match(selector.trim(), /^html:not\(\[data-world-effects="economy"\]\)/);
    } else if (transition) {
      for (const part of transition.split(",")) {
        assert.match(part.trim(), /^(?:background-color|color|opacity)\s/);
      }
    }
  }
  assert.ok(moves >= 3, String(moves));
});

test("every form card carries its calls and its spec sheet; the record viewer keeps the full record", async () => {
  const manager = await read("src/components/world/manager-stub.tsx");
  const card = manager.slice(
    manager.indexOf('<div className="form-pickup-copy">'),
    manager.indexOf("<dialog"),
  );
  assert.match(card, /<div className="form-pickup-record">/);
  assert.match(card, /<ol className="form-pickup-calls" aria-label="変身音声">/);
  assert.match(card, /<i aria-hidden="true">\{String\(index \+ 1\)\.padStart\(2, "0"\)\}<\/i>/);
  assert.match(card, /<dl className="form-pickup-spec" aria-label="スペック">/);
  // The last plate closes its row in every column count the sheet uses.
  assert.match(
    css,
    /\.form-pickup-spec\s*> div:last-child:nth-child\(3n \+ 1\)\s*\{\s*grid-column: 1 \/ -1;/,
  );
  assert.match(
    css,
    /\.form-pickup-spec\s*> div:last-child:nth-child\(odd\)\s*\{\s*grid-column: 1 \/ -1;/,
  );
  assert.match(css, /\.form-pickup-stats\s*> div:last-child:nth-child\(odd\)/);
  // A file of several forms numbers them beside PICKUP (silent); one form needs none.
  assert.match(css, /content: "FORM " counter\(zenith-form, decimal-leading-zero\) \/ "";/);
  assert.match(css, /:has\(\s*\.form-pickup ~ \.form-pickup,\s*> div ~ div > \.form-pickup\s*\)/);
  // A short landscape split stage leaves the strip to the record.
  assert.match(
    css,
    /@media \(min-width: 900px\) and \(max-height: 699px\) and \(orientation: landscape\)\s*\{[^}]*> \.form-pickup-record\s*\{\s*display: none;/,
  );
});

test("the roster rail lists the whole list: the current file marked, 欠番 inert, links keep the origin", async () => {
  const nav = await read("src/components/world/dossier-nav.tsx");
  const roster = nav.slice(
    nav.indexOf("function DossierRoster"),
    nav.indexOf("export function DossierNav"),
  );
  assert.match(roster, /<ol className="dossier-roster" aria-label="この一覧の資料">/);
  assert.match(roster, /<span aria-current="page">\{body\}<\/span>/);
  assert.match(
    roster,
    /if \(!item\.href\) \{[\s\S]*?<li key=\{item\.id\} className="is-void">\s*<span>\{body\}<\/span>/,
  );
  assert.match(roster, /search=\{originSearch\}/);
  // Inside the index block of .manager-pagination, so a press keeps the file flip.
  const render = nav.slice(nav.indexOf("export function DossierNav"));
  const index = render.slice(render.indexOf('<div className="manager-pagination-index">'));
  assert.ok(index.indexOf("<DossierRoster") < index.indexOf("</div>"));
  // Touch targets: every tile at least 44px tall.
  const tile = css.match(/\.dossier-roster\s*> li\s*> :is\(a, span\)\s*\{([^}]*)\}/);
  assert.ok(tile, "roster tile rule");
  assert.ok(Number(tile[1].match(/min-height:\s*(\d+)px/)[1]) >= 44);
});

test("the end of a file reads down the screen in the source's (and the Tab) order", async () => {
  // Owner (2026-10-22): the index and rail sat in row 3 under the next card; on phones
  // they shared row 3 with it (hidden, untappable) and on wider screens Tab skipped the card.
  const nav = await read("src/components/world/dossier-nav.tsx");
  const render = nav.slice(nav.indexOf('<nav className="manager-pagination"'));
  const prev = render.indexOf("to={prev.href}");
  const index = render.indexOf('<div className="manager-pagination-index">');
  const next = render.indexOf("to={next.href}");
  assert.ok(prev > 0 && prev < index && index < next, `${prev} ${index} ${next}`);
  const nav3 = "> \\.manager-pagination\\.manager-pagination\\.manager-pagination";
  assert.match(css, new RegExp(`${nav3}\\s*> a:first-child:first-child \\{\\s*grid-row: 1;`));
  assert.match(
    css,
    new RegExp(
      `${nav3}\\s*> \\.manager-pagination-index\\.manager-pagination-index \\{\\s*grid-row: 2;`,
    ),
  );
  assert.match(
    css,
    new RegExp(`> nav${nav3.slice(2)}\\s*> a:last-child:not\\(:first-child\\) \\{\\s*grid-row: 3;`),
  );
  assert.doesNotMatch(css, /grid-row: 3;\s*grid-column: 1 \/ -1;\s*display: grid;/);
});

test("on a short split stage the card's words clear the chapter ruler and a long sheet waits for the record", () => {
  // Owner (2026-10-22): 44px put TRANSFORMATION RECORD under the sticky ruler while stuck.
  const short = css.slice(
    css.indexOf(
      "@media (min-width: 900px) and (min-height: 700px) and (max-height: 920px) and (orientation: landscape)",
    ),
  );
  const block = short.slice(0, short.indexOf("\n}\n"));
  const top = block.match(
    /\.form-pickup-copy:has\(> \.form-pickup-record\)\s*\{[^}]*padding-top:\s*(\d+)px/,
  );
  assert.ok(top && Number(top[1]) >= 64, top?.[1]);
  assert.match(
    block,
    /> \.form-pickup-record-spec:has\(> \.form-pickup-spec > div:nth-child\(8\)\)\s*\{\s*display: none;/,
  );
});

test("the next file's numeral takes the card's first row, sized by the screen's height too", () => {
  // Owner (2026-10-22): absolutely placed, it ran into NEXT FILE and the name on short screens.
  const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter(([, selector]) =>
    /\.dossier-nav-numeral\s*$/.test(selector.trim()),
  );
  assert.ok(rules.length >= 3, String(rules.length));
  for (const [, , body] of rules) assert.doesNotMatch(body, /position:\s*absolute/);
  assert.ok(rules.some(([, , body]) => /grid-row: 1;/.test(body)));
  const sizes = rules
    .map(([, , body]) => body.match(/font(?:-size)?:[^;]*clamp\(([^;]+)\)/)?.[1])
    .filter(Boolean);
  assert.ok(sizes.length >= 2, String(sizes.length));
  for (const size of sizes) assert.match(size, /min\(\d+vw, \d+svh\)/);
  assert.match(css, /> a:last-child:not\(:first-child\)::before \{\s*grid-row: 2;/);
  assert.match(css, /> a:last-child:not\(:first-child\)\s*> b \{\s*grid-row: 3;/);
});

test("the next file's numeral is decorative and hidden in forced colours", async () => {
  const nav = await read("src/components/world/dossier-nav.tsx");
  assert.match(nav, /<i className="dossier-nav-numeral" aria-hidden="true">/);
  assert.match(
    css,
    /@media \(forced-colors: active\)\s*\{\s*html\[data-family="dossier"\][^{]*\.dossier-nav-numeral\s*\{\s*display: none;/,
  );
});

test("related records stack their art over their words in a narrow reading column", () => {
  assert.match(css, /#identity-records \{\s*container: identity-records \/ inline-size;/);
  assert.match(
    css,
    /@container identity-records \(max-width: 540px\)\s*\{[^}]*> :is\(\.rider-archive-civilian, \.rider-nightmare-card\)\s*\{\s*grid-template-columns: minmax\(0, 1fr\);/,
  );
});
