import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

/* The character files' brush-up (2026-10-01): one warm focus family, spec
   sheets that never collide, record doorways that show the art whole, a
   変身記録 opener, square HOLD + SLIDE plates, a pagination deck, a
   PREV/NEXT hand-over in register, no loops on a still page, and 夜明護尊's
   redactions. These pins keep the presentation's safety properties: scope,
   the 12px floor, gating, forced colours, the pinned geometry and copy. */

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const stripComments = (source) => source.replace(/\/\*[\s\S]*?\*\//g, "");
const flat = (text) => text.replace(/\s+/g, " ").replace(/\(\s+/g, "(").replace(/\s+\)/g, ")");

const edition = flat(stripComments(await read("src/styles-dossier-edition.css")));
const cinema = flat(stripComments(await read("src/styles-dossier-cinema.css")));
const sovereign = flat(stripComments(await read("src/styles-sovereign-file.css")));

// The body of the first rule whose selector is exactly `selector`.
const body = (css, selector) => {
  const at = css.indexOf(`${selector} {`);
  assert.ok(at >= 0, selector);
  return css.slice(at + selector.length + 2, css.indexOf("}", at));
};
// The text of an at-rule block (balanced braces) starting at `start`.
const block = (css, start) => {
  const open = css.indexOf("{", start);
  let depth = 0;
  for (let i = open; i < css.length; i += 1) {
    if (css[i] === "{") depth += 1;
    if (css[i] === "}") depth -= 1;
    if (depth === 0) return css.slice(open + 1, i);
  }
  return css.slice(open + 1);
};
const blocks = (css, prelude) => {
  const out = [];
  for (let at = css.indexOf(prelude); at >= 0; at = css.indexOf(prelude, at + 1)) {
    out.push(block(css, at));
  }
  return out;
};

test("HOLD + SLIDE draws the one warm ring as an outline, on the files and on Zeus", () => {
  const files = body(
    edition,
    'main.manager-page:not(.is-sovereign) .ios-slide-open[data-keyboard-focus="true"]:focus-visible',
  );
  assert.match(files, /outline: 2px solid var\(--dm-focus\);/);
  assert.match(files, /outline-offset: 4px;/);
  // An outline: the frosted sheet's !important box-shadow cannot drown it.
  assert.doesNotMatch(files, /box-shadow/);
  assert.match(edition, /--dm-focus: #fff0b5;/);
  // Not prefixed with html body: the edition sheet's scope pin.
  assert.doesNotMatch(edition, /html body main/);

  const zeus = body(
    sovereign,
    'main.manager-page.is-sovereign .ios-slide-open[data-keyboard-focus="true"]:focus-visible',
  );
  assert.match(zeus, /outline: 2px solid var\(--sv-focus\);/);
  assert.doesNotMatch(zeus, /box-shadow/);
  assert.match(sovereign, /--sv-focus: #fff0b5;/);

  // The special site's link joins the family (it had a white ring).
  assert.match(
    body(edition, "main.manager-page:not(.is-sovereign) .rider-special-site-link:focus-visible"),
    /outline: 2px solid var\(--dm-focus\);/,
  );

  // The header's mark and レジャス's zoomable portrait too (cyan and accent before).
  assert.match(
    body(
      edition,
      "main.manager-page:not(.is-sovereign) :is(.manager-topbar .brand, button.manager-portrait-frame):focus-visible",
    ),
    /outline: 2px solid var\(--dm-focus\);/,
  );

  // Forced colours: the system highlight.
  const forced = blocks(edition, "@media (forced-colors: active)").join(" ");
  assert.match(
    forced,
    /\.ios-slide-open\[data-keyboard-focus="true"\]:focus-visible, main\.manager-page:not\(\.is-sovereign\) \.rider-special-site-link:focus-visible, main\.manager-page:not\(\.is-sovereign\) :is\(\.manager-topbar \.brand, button\.manager-portrait-frame\):focus-visible \{ outline-color: Highlight;/,
  );
  assert.match(
    blocks(sovereign, "@media (forced-colors: active)").join(" "),
    /\.ios-slide-open\[data-keyboard-focus="true"\]:focus-visible \{ outline-color: Highlight;/,
  );
});

test("the spec sheet on phones: two tracks the rows borrow, the 96px default kept", async () => {
  const band = blocks(edition, "@media (min-width: 375px) and (max-width: 560px)").join(" ");
  assert.match(
    band,
    /\.manager-hero \.manager-facts \{ grid-template-columns: minmax\(96px, max-content\) minmax\(0, 1fr\); column-gap: 14px; \}/,
  );
  assert.match(
    band,
    /\.manager-hero \.manager-facts > div \{ grid-column: 1 \/ -1; grid-template-columns: subgrid; \}/,
  );
  // The pinned 96px rule stays in the reader sheet; this band overrides it.
  assert.match(
    await read("src/styles-dossier-reader.css"),
    /grid-template-columns: 96px minmax\(0, 1fr\);/,
  );
  // Zeus at 320: AUTHORITY fits its cell.
  assert.match(
    blocks(sovereign, "@media (max-width: 339px)").join(" "),
    /#dossier-profile \.manager-facts dt \{ letter-spacing: 0\.04em; \}/,
  );
});

test("the plate lands on its final rect: a clip wipe with no settle push", () => {
  const start = cinema.indexOf("@keyframes dm-arrive-plate");
  assert.ok(start >= 0);
  const frames = block(cinema, start);
  assert.match(frames, /from \{ clip-path: inset\(0 0 100% 0\); \}/);
  assert.match(frames, /to \{ clip-path: inset\(0 0 0 0\); \}/);
  // The load gate samples the push from this keyframe's transform; with
  // none it reads 1, so the docked file's seam follows the plain wipe.
  assert.doesNotMatch(frames, /transform|scale/);
  // Duration, delay and easing unchanged.
  assert.equal(
    cinema.match(
      /dm-arrive-plate 640ms var\(--dm-arrive-ease\) calc\(var\(--dm-arrive-delay\) \+ 60ms\) both/g,
    )?.length,
    2,
  );
});

test("the Rexonance card plays its loops once, by longhands after the last keyframes", async () => {
  const tail = edition.slice(edition.lastIndexOf("@keyframes"));
  const override = tail.slice(tail.indexOf("}", tail.indexOf("}") + 1));
  for (const selector of [
    "main.manager-page:not(.is-sovereign) .form-pickup.is-rexonance-pickup::after",
    "main.manager-page:not(.is-sovereign) .is-rexonance-pickup .form-pickup-visual img",
    "main.manager-page:not(.is-sovereign) .rexonance-card-ornaments i",
    "main.manager-page:not(.is-sovereign) .rexonance-panel-ambient i",
    "main.manager-page:not(.is-sovereign) .rexonance-weapon-grid figure > div::after",
  ]) {
    assert.ok(override.includes(selector), selector);
  }
  assert.match(override, /\{ animation-iteration-count: 1; animation-fill-mode: both; \}/);
  // Longhands only: no shorthand that would restart or re-time the loops.
  assert.doesNotMatch(override, /animation:/);
  assert.doesNotMatch(edition, /infinite/);
  assert.doesNotMatch(cinema, /infinite/);
  // The keyframes and the still tiers stay in the pickup's own sheet.
  const rex = await read("src/styles-world/rexonance-pickup.css");
  assert.match(rex, /@keyframes rexonancePortraitFloat/);
  assert.match(
    rex,
    /html\[data-world-effects="economy"\] \.rexonance-weapon-grid figure > div::after \{\s*animation: none !important;/,
  );
  assert.match(
    rex,
    /@media \(prefers-reduced-motion: reduce\) \{\s*\.form-pickup\.is-rexonance-pickup::after,[\s\S]*?animation: none !important;/,
  );
});

test("pagination: phones keep the list's pinned chip; the deck is paint", async () => {
  // Neither there nor in the two-column band (521-760px): a plate spanning
  // the row moved the Zeus button off its corner at the file's end.
  for (const prelude of [
    "@media (max-width: 520px)",
    "@media (max-width: 359px)",
    "@media (min-width: 521px) and (max-width: 760px)",
  ]) {
    for (const text of blocks(edition, prelude)) {
      for (const [, selector, declarations] of text.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
        if (!selector.includes("dossier-index-return")) continue;
        assert.doesNotMatch(
          declarations,
          /(?:^|;|\s)(?:width|min-width|max-width|height|min-height|margin[\w-]*|padding[\w-]*|inset|left|right):/,
          selector,
        );
      }
    }
  }
  // The pinned box itself.
  assert.match(
    await read("src/styles-dossier-reader.css"),
    /@media \(max-width: 520px\) \{[\s\S]*?\.dossier-index-return \{\s*margin-inline: 22px auto;/,
  );
  // The hairline is the index row's background, not a box.
  const phone = blocks(edition, "@media (max-width: 520px)").join(" ");
  assert.match(phone, /\.manager-pagination \.manager-pagination-index \{ background:/);
  // HUD codes hold one line on tablets; the index is never reordered.
  const tablet = blocks(edition, "@media (min-width: 700px) and (max-width: 1024px)").join(" ");
  assert.match(
    tablet,
    /\.manager-pagination > a small \{ letter-spacing: 0\.06em; white-space: nowrap; \}/,
  );
  assert.doesNotMatch(edition, /(?<![\w-])order:\s*1/);
});

test("new ornaments are scoped, textless, still, at the 12px floor, and gated where they move", () => {
  // Generated boxes are empty.
  for (const [, value] of edition.matchAll(/content:\s*([^;]+);/g))
    assert.equal(value.trim(), '""');
  // Every size in the sheet is 12px or more.
  for (const [, size] of edition.matchAll(/font-size:\s*(\d+(?:\.\d+)?)px/g)) {
    assert.ok(Number(size) >= 12, size);
  }
  // The Michroma kickers of the partner opener and the identity records.
  assert.match(
    body(edition, "main.manager-page:not(.is-sovereign) .rider-partner-forms > header > p"),
    /font-family: var\(--dm-hud\); font-size: 12px;/,
  );
  assert.match(
    edition,
    /:is\(\.rider-archive-civilian > figcaption > p:first-child, \.rider-nightmare-card-copy > p\) \{ font-family: var\(--dm-hud\); font-size: 12px;/,
  );
  // Still ornaments: the static brush-up section sets no animation, and the
  // sheet keeps only its three view-timeline keyframes.
  const gate = edition.indexOf("@supports (animation-timeline: view())");
  assert.doesNotMatch(edition.slice(0, gate), /animation/);
  assert.deepEqual(
    [...edition.matchAll(/@keyframes ([\w-]+)/g)].map((match) => match[1]),
    ["dossier-lock", "dossier-numeral", "dossier-draw-x"],
  );
  // The contents arrow's nudge answers fine pointers only, under both gates.
  const hover = blocks(
    edition,
    "@media (hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)",
  ).join(" ");
  assert.match(
    hover,
    /html:not\(\[data-world-effects="economy"\]\) main\.manager-page:not\(\.is-sovereign\) \.dossier-contents > a:hover \.dossier-contents-arrow \{ translate: 0 2px; \}/,
  );
  assert.doesNotMatch(
    edition.replace(hover, ""),
    /\.dossier-contents-arrow \{[^}]*(?:transition|translate)/,
  );
  // Grades and ghosts stand down under economy rendering.
  assert.match(
    edition,
    /html:not\(\[data-world-effects="economy"\]\) main\.manager-page:not\(\.is-sovereign\) \.form-pickup:not\(\.is-rexonance-pickup\) \.form-pickup-visual > img:is\(/,
  );
  assert.match(
    edition,
    /html:not\(\[data-world-effects="economy"\]\) main\.manager-page:not\(\.is-sovereign\) \.form-pickup:not\(\.is-rexonance-pickup\) \.form-pickup-visual::after \{/,
  );
  assert.match(
    edition,
    /html\[data-world-effects="economy"\] main\.manager-page:not\(\.is-sovereign\) \.rider-partner-forms > header > h2 \{ filter: none; \}/,
  );
  // The desktop doorway keeps the pinned reservation elsewhere and changes
  // nothing below 1100px.
  const desk = blocks(edition, "@media (min-width: 1100px)");
  assert.match(desk.join(" "), /\.form-pickup-visual > img \{ height: 100%; object-fit: contain;/);
  assert.doesNotMatch(
    desk.reduce((css, text) => css.replace(text, ""), edition),
    /object-fit: contain/,
  );
});

test("forced colours: outlined, clipped and redacted type becomes plain ink", () => {
  const forced = blocks(edition, "@media (forced-colors: active)").join(" ");
  assert.match(
    forced,
    /\.manager-portrait-frame \.manager-numeral \{ color: CanvasText; -webkit-text-stroke: 0; background: Canvas; \}/,
  );
  assert.match(
    forced,
    /\.rider-partner-forms > header > h2 \{ color: CanvasText; -webkit-text-fill-color: CanvasText; background: none; filter: none; \}/,
  );
  assert.match(
    forced,
    /\.manager-facts dd\.is-redacted \{ color: CanvasText; background: none; box-shadow: none; \}/,
  );
  assert.match(
    forced,
    /#form-records::before, main\.manager-page:not\(\.is-sovereign\) #form-records::after,/,
  );
  // The edition's first forced-colours block keeps its pins ahead of these.
  const first = edition.indexOf("@media (forced-colors: active)");
  assert.match(
    block(edition, first),
    /\.manager-display-name \{ color: CanvasText; background: none;/,
  );
});

test("夜明護尊's redactions: a class on the value, and not a word changed", async () => {
  const source = await read("src/components/world/yoake-mamori-page.tsx");
  const facts = source.slice(source.indexOf("const facts = ["), source.indexOf("];") + 2);
  assert.equal(
    facts,
    `const facts = [
  ["名前", "▢▢▢\u3000▢▢"],
  ["名前の読み", "▢▢▢\u3000▢▢▢"],
  ["神名", "夜明護尊"],
  ["神名の読み", "よあけまもりのみこと"],
  ["年齢", "不詳"],
  ["能力", "▢▢▢▢▢▢▢▢▢"],
  ["種族", "神"],
  ["身長", "186.4cm"],
  ["体重", "78.7kg"],
  ["好き", "シュザ"],
  ["嫌い", "その他全て"],
  ["一人称", "俺"],
  ["二人称", "お前"],
];`,
  );
  assert.match(
    source,
    /\{facts\.map\(\(\[label, value\]\) => \(\s*<div key=\{label\}>\s*<dt>\{label\}<\/dt>\s*<dd className=\{value\.includes\("▢"\) \? "is-redacted" : undefined\}>\{value\}<\/dd>\s*<\/div>\s*\)\)\}/,
  );
  assert.equal(source.match(/is-redacted/g)?.length, 1);
  assert.match(
    body(edition, "main.manager-page:not(.is-sovereign) .manager-facts dd.is-redacted"),
    /color: rgb\(234 244 255 \/ 36%\);/,
  );
});

test("identity kickers keep one line: Michroma from 1024px, the file's Oxanium below", () => {
  // Michroma sets BEFORE TRANSFORMATION / CAST 334-349px wide against a
  // 230-308px record on phones and 296px at 768, and the line broke before
  // its slash ("/ CAST" led a line; fixer review 2026-10-01).
  const kickers =
    "main.manager-page:not(.is-sovereign) :is(.rider-archive-civilian > figcaption > p:first-child, .rider-nightmare-card-copy > p)";
  const narrow = blocks(edition, "@media (max-width: 1023.98px)").join(" ");
  assert.ok(narrow.includes(kickers), "the sub-1024 block names the kickers");
  const oxanium = narrow.slice(narrow.indexOf(kickers));
  assert.match(
    oxanium.slice(0, oxanium.indexOf("}")),
    /font-family: var\(--dossier-font-interface\); font-weight: 600; letter-spacing: 0\.14em;/,
  );
  const tight = blocks(edition, "@media (max-width: 359.98px)").join(" ");
  assert.ok(tight.includes(`${kickers} { letter-spacing: 0.06em; }`));
  // Size stays at the 12px floor in every band: no band sets a font-size.
  assert.doesNotMatch(oxanium.slice(0, oxanium.indexOf("}")), /font-size/);
});
