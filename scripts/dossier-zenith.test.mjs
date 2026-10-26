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
  assert.match(
    list,
    /STAGE_DOSSIER_STYLESHEET_LINK,\s*TABLET_DOSSIER_STYLESHEET_LINK,\s*DOSSIER_ZENITH_STYLESHEET_LINK,\s*$/,
  );
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
  // Owner (2026-10-22): the <nav> now also carries data-numerals, so its tag spans lines.
  const render = nav.slice(nav.indexOf('<nav\n      className="manager-pagination'));
  assert.ok(render.length < nav.length, "the nav element");
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
  // Owner (2026-10-23): 不要なセカンダリラベルを削除（レイアウトで説明）
  // No NEXT FILE or NEXT / RIDER 03 line: the name and its arrow take the second row.
  assert.doesNotMatch(css, /> a:last-child:not\(:first-child\)::before \{\s*grid-row/);
  assert.match(css, /> a:last-child:not\(:first-child\)\s*> b \{\s*grid-row: 2;/);
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

test("the index reads as a way back: an arrow ring, and on the split stage a plate with the file's place", async () => {
  // Owner (2026-10-22): the stage side of the index row stood empty under two small lines.
  const nav = await read("src/components/world/dossier-nav.tsx");
  const index = nav.slice(nav.indexOf('className="dossier-index-return'));
  const link = index.slice(0, index.indexOf("</GuardedLink>"));
  // Decorative: the link keeps its name (人物一覧へ戻る) and its text.
  assert.match(link, /<em className="dossier-index-arrow" aria-hidden="true">/);
  assert.match(link, /<b>一覧へ戻る<\/b>/);
  assert.match(link, /\{items\.length > 1 \? <IndexMeter items=\{items\} idx=\{idx\} \/> : null\}/);
  assert.match(nav, /<em className="dossier-index-meter" aria-hidden="true">/);
  // The ring is a 44px target at the least; the plate puts the way back at the foot.
  const ring = css.match(/> \.dossier-index-return\s*> \.dossier-index-arrow \{([^}]*)\}/)?.[1];
  assert.ok(ring, "arrow ring rule");
  assert.match(ring, /width: 44px;\s*height: 44px;/);
  // Owner (2026-10-23): 不要なセカンダリラベルを削除（レイアウトで説明）
  // No list name or count: the way back and the place rule stand mid-plate.
  assert.doesNotMatch(link, /<i>|indexLabel/);
  assert.match(css, /grid-template-rows: minmax\(0, 1fr\) auto auto minmax\(0, 1fr\);/);
  // Phones: the roster's lit tile marks the place (no meter).
  assert.match(css, /> \.dossier-index-meter \{\s*display: none;/);
});

test("roster faces: the launcher tile's widths with a phone-sized slot, set back in the ink but the file at hand", async () => {
  const nav = await read("src/components/world/dossier-nav.tsx");
  assert.match(nav, /const ROSTER_PORTRAIT_SIZES = \[\s*"\(max-width: 560px\) 40vw",/);
  assert.match(nav, /tile\.variants\.map\(\(cut\) => `\$\{cut\.path\} \$\{cut\.width\}w`\)/);
  // Every tile keeps a face box (欠番 an empty frame), so the rail's columns line up.
  assert.match(
    nav,
    /if \(!src\) return <span className="dossier-roster-portrait" aria-hidden="true" \/>;/,
  );
  // The face is at least 64px each way: the file flip lifts only a picture that large (load-gate pressedArt).
  const face = css.match(/\.dossier-roster\s*\.dossier-roster-portrait \{([^}]*)\}/)?.[1];
  assert.ok(face, "face rule");
  assert.ok(Number(face.match(/width: (\d+)px/)[1]) >= 64);
  assert.ok(Number(face.match(/height: (\d+)px/)[1]) >= 64);
  assert.match(
    css,
    /> li:is\(\.is-current, :has\(> a:focus-visible\)\)\s*\.dossier-roster-portrait\s*> img \{\s*opacity: 1;/,
  );
});

test("六詠's Roman numerals take the site's Roman face (Cinzel) on the end card and the rail", async () => {
  // Owner (2026-10-22): in Michroma, II and III on the end card read as two and three bars.
  const nav = await read("src/components/world/dossier-nav.tsx");
  assert.match(nav, /data-numerals=\{romanList\(items\) \? "roman" : undefined\}/);
  assert.match(nav, /\/\^\[IVX\]\+\$\/\.test\(fileNumeral\(item, index\)\)/);
  const roman = [...css.matchAll(/\[data-numerals="roman"\][^{]*\{([^}]*)\}/g)].map(
    ([, body]) => body,
  );
  // Owner (2026-10-23): 不要なセカンダリラベルを削除（レイアウトで説明）
  // The file's cover numeral (over the name) takes the same face.
  assert.equal(roman.length, 3);
  for (const body of roman) assert.match(body, /font-family: "Cinzel", "Times New Roman", serif;/);
  // The site already loads Cinzel with its core fonts: no new font request.
  assert.match(await read("src/lib/site-fonts.ts"), /family=Cinzel:wght@400\.\.700/);
});

test("the rail never leaves a lone tile: the long lists run two rows of cards or two tiles a row", () => {
  // Owner (2026-10-22): eight riders ran 3+3+2 at 1920px and one tile a row (8 rows) on an iPad in landscape.
  assert.match(css, /grid-template-columns: repeat\(auto-fit, minmax\(192px, 1fr\)\);/);
  assert.doesNotMatch(css, /repeat\(auto-fill, minmax\(2\d\dpx, 1fr\)\)/);
  const tablet = css.slice(css.lastIndexOf("@media (min-width: 561px) {"));
  assert.match(
    tablet.slice(0, tablet.indexOf("\n}\n")),
    /:has\(> li:nth-child\(8\):last-child\)\s*\)\s*\{\s*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/,
  );
  assert.match(
    css,
    /\.dossier-roster:has\(> li:nth-child\(6\):last-child\) \{\s*grid-template-columns: repeat\(3, minmax\(0, 1fr\)\);/,
  );
  assert.match(
    css,
    /\.dossier-roster:has\(> li:nth-child\(8\):last-child\) \{\s*grid-template-columns: repeat\(4, minmax\(0, 1fr\)\);/,
  );
  // The split stage keeps them two a row below 1600px.
  assert.match(css, /\(min-width: 1100px\) and \(max-width: 1599px\) and \(min-height: 540px\)/);
  // Narrow cards set the numeral over the name, so no name is cut.
  assert.match(css, /container: roster-tile \/ inline-size;/);
  assert.match(css, /@container roster-tile \(max-width: 169px\)/);
});

test("Japanese headings and names break between phrases and words, never before 。 or ・", async () => {
  // Owner (2026-10-22): WebKit set 。 alone on a line (変身後の能力を活かした遠距離戦 / 。) and
  // Chrome started a line on ・ (秩序／破壊 / ・固定管轄なし); the text stays as written.
  const nav = await read("src/components/world/dossier-nav.tsx");
  // In the reader module, which the reader tests mount with React alone.
  const reader = await read("src/components/world/dossier-reader.tsx");
  assert.match(reader, /export function PhrasedText\(\{ text \}: \{ text: string \}\)/);
  assert.match(reader, /\(より\|から\|まで\|ので\|\[のをにへとがはでもやてたずなく\]\)/);
  assert.match(reader, /^import \{ useEffect, useState \} from "react";$/m);
  for (const file of [
    "rider-page",
    "manager-stub",
    "related-page",
    "dante-page",
    "ciel-page",
    "yoake-mamori-page",
  ]) {
    const page = await read(`src/components/world/${file}.tsx`);
    assert.match(page, /<h2>\s*<PhrasedText text=\{(s|section)\.title\} \/>\s*<\/h2>/, file);
  }
  const lejas = await read("src/components/world/lejas-page.tsx");
  assert.equal(lejas.match(/<PhrasedText text="/g)?.length, 3);
  // A separator closes the word before it, inside a protected word's box.
  assert.match(nav, /chunks\.push\(parts\[i\] \+ mark\)/);
  // The split stage: the form's name never outgrows the reading column.
  assert.match(
    css,
    /\.form-pickup-copy\s*> h2\s*> b \{\s*font-size: min\(\s*52px,\s*calc\(\(100vw - var\(--sd-stage-w\) - var\(--sd-pad\) - var\(--sd-pad-end\)\) \/ 8\.6\)\s*\);/,
  );
});

test("the contents' chapter names hold their phrases in WebKit; narrow fact cells keep their labels whole", async () => {
  // Owner (2026-10-22): WebKit broke 委ねられた瞬 / 間 in the contents (no auto-phrase there), and
  // OCCUPATION ran 14px past its cell in the partner card at 1366-1440px.
  const reader = await read("src/components/world/dossier-reader.tsx");
  assert.match(reader, /<b>\s*<PhrasedText text=\{section\.title\} \/>\s*<\/b>/);
  assert.match(
    css,
    /@supports not \(word-break: auto-phrase\)\s*\{[^}]*\.dossier-contents-copy\s*b\s*\{\s*word-break: keep-all;/,
  );
  assert.match(
    css,
    /@container identity-records \(min-width: 541px\) and \(max-width: 640px\)\s*\{[^}]*figcaption\s*dl\s*dt\s*\{\s*font-family: var\(--sd-mono\);/,
  );
});
