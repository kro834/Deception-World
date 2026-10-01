import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

/* World annex refine (styles-world-annex.css, 2026-10-01): 04-06 read as one
   designed archive. Signature lines broken between phrases and balanced,
   a 資料目次 that holds together at every width, a wall aligned row by row
   (subgrid) that ends clean, graded pale prints, one exit cell on
   OPEN DOSSIER, profiles with a real measure, whole glossary terms,
   LOCATIONS in the kicker grammar, the quotes log's speaker on its line and
   short landscape four abreast. The sheet stays still paint, and
   world-annex.tsx gained a className only: its words, names and aria are
   pinned below. */

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const annex = read("src/components/world/world-annex.tsx");
const css = read("src/styles-world-annex.css").replace(/\/\*[\s\S]*?\*\//g, "");

const S = ".site-shell.film-edition.mirage-edition";
const ECONOMY = `html[data-world-effects="economy"] ${S}`;

/* Style rules with their at-rule context (whitespace normalised). */
function parse(text) {
  const rules = [];
  const stack = [];
  let start = 0;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === "{") {
      const prelude = text
        .slice(start, i)
        .trim()
        .replace(/\s+/g, " ")
        .replace(/\(\s+/g, "(")
        .replace(/\s+\)/g, ")");
      stack.push({ prelude, bodyStart: i + 1 });
      start = i + 1;
    } else if (ch === "}") {
      const block = stack.pop();
      if (!block.prelude.startsWith("@")) {
        rules.push({
          selector: block.prelude,
          body: text.slice(block.bodyStart, i).replace(/\s+/g, " ").trim(),
          context: stack.map((entry) => entry.prelude),
        });
      }
      start = i + 1;
    } else if (ch === ";" && stack.length === 0) start = i + 1;
  }
  assert.equal(stack.length, 0, "balanced braces");
  return rules;
}

const rules = parse(css);
const find = (selector, context = null) =>
  rules.filter(
    (rule) =>
      rule.selector === selector &&
      (context === null
        ? rule.context.length === 0
        : context.every((needle) => rule.context.some((c) => c.includes(needle)))),
  );
const one = (selector, context) => {
  const found = find(selector, context);
  assert.ok(found.length > 0, `${selector} in ${context ?? "top level"}`);
  return found.map((rule) => rule.body).join(" ");
};

test("signature lines keep phrase breaks at every width, balanced", () => {
  // Character breaking (word-break: normal, set flush) split 世界, 銃刀法 and
  // 動くべき in the owner's lines (fixer review 2026-10-01): the signature
  // breaks between phrases everywhere and balances its lines instead.
  const body = one(`${S} .wa-quote.is-signature blockquote p`);
  assert.match(body, /word-break: auto-phrase;/);
  assert.match(body, /line-break: strict;/);
  assert.match(body, /text-wrap: balance;/);
  // The iPhone overflow guard stays with it.
  assert.match(body, /overflow-wrap: anywhere;/);
  // No rule anywhere sets the signature (or any quote) to character breaks.
  const wordBreaks = rules.filter((rule) => /word-break/.test(rule.body));
  for (const rule of wordBreaks) {
    assert.ok(
      /is-signature|\.wa-person h3|\.wa-glossary dt/.test(rule.selector),
      `${rule.selector}: word-break`,
    );
    if (/is-signature/.test(rule.selector)) {
      assert.doesNotMatch(rule.body, /word-break: (?:normal|break-all)/, rule.selector);
      assert.equal(rule.context.length, 0, "one rule for every width");
    }
  }
  // The signature keeps its 14px (15px from 900px).
  assert.match(body, /font-size: 14px;/);
});

test("the 資料目次 holds together: one-line title, equal plates, no empty cell", () => {
  // Phones: 04 | 05, 06.1 alone, 06.2 | 06.3.
  assert.match(one(`${S} .wa-contents li:nth-child(3)`), /grid-column: 1 \/ -1;/);
  assert.equal(find(`${S} .wa-contents li:last-child`).length, 0);
  assert.match(one(`${S} .wa-contents a`), /height: 100%;/);
  // Under 360px the code stacks over the title, which never breaks.
  assert.match(
    one(`${S} .wa-contents-inner`, ["(max-width: 359px)"]),
    /grid-template-columns: minmax\(0, 1fr\);/,
  );
  assert.match(one(`${S} .wa-contents h2`, ["(max-width: 359px)"]), /white-space: nowrap;/);
  // 560-1099: six tracks, 2 + 2 + 2 over 3 + 3.
  const band = ["(min-width: 560px) and (max-width: 1099px)"];
  assert.match(
    one(`${S} .wa-contents ol`, band),
    /grid-template-columns: repeat\(6, minmax\(0, 1fr\)\);/,
  );
  assert.match(
    one(`${S} .wa-contents li, ${S} .wa-contents li:nth-child(3)`, band),
    /grid-column: span 2;/,
  );
  assert.match(one(`${S} .wa-contents li:nth-child(n + 4)`, band), /grid-column: span 3;/);
  // Five abreast from 1100px.
  assert.match(
    one(`${S} .wa-contents ol`, ["(min-width: 1100px)"]),
    /grid-template-columns: repeat\(5, minmax\(0, 1fr\)\);/,
  );
});

test("the wall aligns row by row through subgrid, never display: contents", () => {
  const closed = `${S} .wa-roster > li:not(:has(.wa-profile[open]))`;
  const context = ["@supports (grid-template-rows: subgrid)", "(min-width: 360px)"];
  const li = one(closed, context);
  assert.match(li, /display: grid;/);
  assert.match(li, /grid-row: span 6;/);
  assert.match(li, /grid-template-rows: subgrid;/);
  assert.match(one(`${closed} > .wa-person`, context), /grid-template-rows: subgrid;/);
  const body = one(`${closed} > .wa-person > .wa-person-body`, context);
  assert.match(body, /grid-row: 2 \/ 6;/);
  assert.match(body, /grid-template-rows: subgrid;/);
  assert.match(one(`${closed} > .wa-person > .wa-open`, context), /grid-row: 6;/);
  assert.match(one(`${closed} .wa-person-body > .wa-profile`, context), /grid-row: 4;/);
  // The row gap lives in each tile's foot (a subgrid would open it between
  // its own tracks), and the wall keeps its dense packing.
  assert.match(one(`${S} .wa-roster`, context), /row-gap: 0;/);
  assert.match(css, /\.wa-roster \{[^}]*grid-auto-flow: row dense;/);
  // Lists and articles keep their boxes and roles.
  assert.doesNotMatch(css, /display:\s*contents/);
  // An opened file keeps its documented full row.
  assert.match(one(`${S} .wa-roster > li:has(.wa-profile[open])`), /grid-column: 1 \/ -1;/);
  // The wall ends clean: only a socket without a file, only on a short row,
  // never an opened one.
  const spans = rules.filter((rule) => /:last-child:nth-child/.test(rule.selector));
  assert.ok(spans.length >= 4, String(spans.length));
  for (const rule of spans) {
    assert.match(
      rule.selector,
      /:has\(> \.wa-person\.is-none\):not\(:has\(\.wa-profile\[open\]\)\)$/,
      rule.selector,
    );
    assert.ok(rule.context.some((c) => c.includes("@supports (grid-template-rows: subgrid)")));
  }
});

test("pale prints are graded, statically, and never under economy or forced colours", () => {
  assert.match(annex, /className=\{portrait\.pale \? "wa-portrait is-pale" : "wa-portrait"\}/);
  const grade = "brightness(0.86) contrast(1.08) saturate(0.92)";
  assert.match(
    one(`${S} .wa-portrait.is-pale`),
    new RegExp(`--wa-grade: ${grade.replace(/[()]/g, "\\$&")};`),
  );
  assert.match(one(`${S} .wa-portrait.is-pale img`), /filter: var\(--wa-grade\);/);
  assert.match(one(`${S} .wa-id-photo img`), /filter: var\(--wa-grade\);/);
  assert.match(one(`${ECONOMY} .wa-portrait.is-pale`), /--wa-grade: initial;/);
  assert.match(one(`${ECONOMY} .wa-id-photo`), /--wa-grade: initial;/);
  // Economy keeps the old veil.
  assert.match(one(`${ECONOMY} .wa-portrait.is-pale::before`), /var\(--veil, 12%\)/);
  assert.match(
    one(`${S} .wa-portrait.is-pale, ${S} .wa-id-photo`, ["(forced-colors: active)"]),
    /--wa-grade: initial;/,
  );
  // The grade itself never moves and never blurs.
  assert.doesNotMatch(css, /blur\(/);
});

test("OPEN DOSSIER exits through a textless cell; the face stays its hit box", () => {
  const cell = one(`${S} .wa-person .wa-open > span::after`);
  assert.match(cell, /content: "";/);
  assert.match(cell, /width: 28px;/);
  assert.match(cell, /height: 28px;/);
  const chevron = one(`${S} .wa-person .wa-open > span::before`);
  assert.match(chevron, /content: "";/);
  assert.match(chevron, /pointer-events: none;/);
  // The link's ::after is still the portrait's hit box.
  const hit = one(`${S} .wa-person .wa-open::after`);
  assert.match(hit, /content: "";/);
  assert.match(hit, /position: absolute;/);
  assert.match(hit, /inset: 0 0 auto;/);
  assert.match(hit, /z-index: 3;/);
  assert.match(hit, /aspect-ratio: 4 \/ 5;/);
  for (const rule of rules.filter((r) => /\.wa-open::after/.test(r.selector))) {
    assert.doesNotMatch(rule.body, /content: "[^"]/, rule.selector);
  }
  // The link itself is never positioned (its ::after measures the file).
  for (const rule of rules.filter((r) => /\.wa-open$/.test(r.selector))) {
    assert.doesNotMatch(rule.body, /position:/, rule.selector);
  }
  // Pointer and keyboard fill the cell at once; forced colours draw a button.
  assert.match(
    one(`${S} .wa-person .wa-open:hover > span::after`, ["(hover: hover) and (pointer: fine)"]),
    /background: var\(--mr-gold\);/,
  );
  assert.match(
    one(`${S} .wa-person .wa-open:focus-visible > span::after`),
    /background: var\(--mr-gold\);/,
  );
  assert.match(
    one(`${S} .wa-person .wa-open > span::after`, ["(forced-colors: active)"]),
    /border-color: ButtonText;/,
  );
});

test("an opened profile on a phone runs at the file's measure", () => {
  const open = `${S} .wa-person:has(.wa-profile[open])`;
  const phone = ["(max-width: 559px)"];
  assert.match(one(open, phone), /display: block;/);
  assert.match(one(`${open} > .wa-portrait`, phone), /float: left;/);
  assert.match(one(`${open} > .wa-portrait`, phone), /width: max\(120px, 34%\);/);
  assert.match(one(`${open} > .wa-open`, phone), /clear: both;/);
  // The profile stops being a size container only here; CLOSE keeps to the
  // widths where the switch has room (the 196px container rule's measure).
  assert.match(one(`${open} .wa-profile`, phone), /container-type: normal;/);
  const close = one(`${open} .wa-profile[open] > summary::after`, [
    "(min-width: 384px) and (max-width: 559px)",
  ]);
  assert.match(close, /content: "CLOSE" \/ "";/);
  assert.match(close, /font-size: 12px;/);
  assert.match(css, /\.wa-profile \{\s*container-type: inline-size;/);
  // Wide files cap the prose.
  assert.match(one(`${S} .wa-profile-body`, ["(min-width: 900px)"]), /max-inline-size: 38em;/);
});

test("glossary terms, LOCATIONS, the quotes log and short landscape", () => {
  const glossary = one(`${S} .wa-glossary > div`, ["(min-width: 700px) and (max-width: 1099px)"]);
  assert.match(glossary, /grid-template-columns: 232px minmax\(0, 1fr\);/);
  // LOCATIONS: a kicker row and prism line, and no generated count.
  assert.match(one(`${S} .wa-locations > .wa-code`), /display: flex;/);
  const line = one(`${S} .wa-locations > .wa-code::after`);
  assert.match(line, /content: "";/);
  for (const rule of rules.filter((r) => /wa-locations/.test(r.selector))) {
    assert.doesNotMatch(rule.body, /content: "[^"]/, rule.selector);
    assert.doesNotMatch(rule.body, /counter\(/, rule.selector);
  }
  assert.match(
    one(`${S} .wa-locations h3`, ["(forced-colors: active)"]),
    /-webkit-text-fill-color: CanvasText;/,
  );
  // The speaker sits on the quote's first line.
  const caption = one(`${S} .wa-quote-band .wa-quote figcaption`, ["(min-width: 700px)"]);
  assert.match(caption, /align-self: start;/);
  assert.match(caption, /min-height: calc\(clamp\(18px, 1\.5vw, 22px\) \* 1\.6\);/);
  // Phones: a short ink tail, still ink at the section's foot.
  const tail = one(`${S} .wa-quotes`, ["(max-width: 699px)"]);
  assert.match(tail, /padding-bottom: 48px;/);
  assert.match(tail, /var\(--mr-ink\)\)/);
  // Short landscape: four abreast.
  assert.match(
    one(`${S} .wa-roster`, ["(max-height: 500px) and (min-width: 700px) and (max-width: 1099px)"]),
    /grid-template-columns: repeat\(4, minmax\(0, 1fr\)\);/,
  );
});

test("the sheet stays still paint at the 12px floor", () => {
  assert.doesNotMatch(css, /animation|@keyframes|view-timeline|scroll-timeline|transition/);
  assert.doesNotMatch(css, /touch-action:|overscroll-behavior:|backdrop-filter:|!important/);
  for (const [, value] of css.matchAll(/font-size:\s*([^;]+);/g)) {
    const floor = value.match(/^clamp\(([\d.]+)px/)?.[1] ?? value.match(/^([\d.]+)px$/)?.[1];
    assert.ok(floor != null && Number(floor) >= 12, value);
  }
  // State changes are instant; the only translate is the exit cell's 2px
  // nudge and the chevron's centring.
  for (const rule of rules.filter((r) => /translate:/.test(r.body))) {
    assert.match(
      rule.selector,
      /wa-open.*> span::(?:after|before)|is-vacant::(?:after|before)|summary/,
      rule.selector,
    );
  }
});

test("world-annex.tsx keeps every word, name and aria attribute", () => {
  const texts = [...annex.matchAll(/>([^<>{}]*[^\s<>{}][^<>{}]*)</g)]
    .map((match) => match[1].replace(/\s+/g, " ").trim())
    .filter((text) => text && !/^[=&|;)(,.:?]/.test(text) && !/=>/.test(text));
  assert.deepEqual(texts, [
    "PROFILE",
    "item.by ? (",
    "OPEN DOSSIER",
    "件名",
    "最終判定",
    "LOCATIONS",
    "舞台",
    "スワイプ・左右キーで切替",
    "EPISODE",
    "STAGE",
    "ARCHIVE INDEX",
    "資料目次",
  ]);
  const attrs = [
    ...annex.matchAll(
      /\b(aria-[\w-]+|alt|title|lang|role|id|href|tabIndex)=(\{`[^`]*`\}|"[^"]*"|\{[^{}]*\})/g,
    ),
  ].map((match) => `${match[1]}=${match[2]}`);
  const count = (value) => attrs.filter((attr) => attr === value).length;
  assert.equal(attrs.length, 67);
  assert.equal(count('aria-hidden="true"'), 12);
  assert.equal(count('alt=""'), 5);
  assert.equal(count('lang="en"'), 5);
  for (const attr of [
    'aria-labelledby="cast-roster-title"',
    'title="人物一覧"',
    "aria-labelledby={`wa-person-${entry.id}`}",
    "aria-label={`${entry.name}の個別資料を開く`}",
    'aria-labelledby="world-brief-title"',
    'title="世界と組織"',
    "aria-label={doc.office}",
    'aria-labelledby="wa-locations-title"',
    'role="region"',
    "tabIndex={scrolls ? 0 : undefined}",
    'aria-label="表示中の名台詞"',
    'aria-label="前の名台詞へ"',
    'aria-label="次の名台詞へ"',
    'title="エピソードの言葉"',
    'title="用語集"',
    'title="名台詞"',
    'aria-labelledby="wa-contents-title"',
  ]) {
    assert.equal(count(attr), 1, attr);
  }
  // The chapter labels, kicker codes and the contents' codes and titles.
  for (const literal of [
    '<ChapterOpener no="04" label="CAST FILES" />',
    '<ChapterOpener no="05" label="WORLD FILES" />',
    '<ChapterOpener no="06" label="ARCHIVE LOG" />',
    'code="CHARACTERS"',
    'code="WORLD BRIEF"',
    'code="EPISODE LINES"',
    'code="KEYWORDS"',
    'code="QUOTES"',
    "count={`${pad(WORLD_CAST_ROSTER.length)} PERSONS`}",
    '{ href: "#cast-roster", code: "04", label: "人物一覧" }',
    '{ href: "#world-brief", code: "05", label: "世界と組織" }',
    '{ href: "#episode-notes", code: "06.1", label: "エピソードの言葉" }',
    '{ href: "#glossary", code: "06.2", label: "用語集" }',
    '{ href: "#quotes", code: "06.3", label: "名台詞" }',
  ]) {
    assert.ok(annex.includes(literal), literal);
  }
});

test("OPEN DOSSIER keeps one line: the link is an inline-size container the label reads", () => {
  // Plates run 128-265px across the wall's bands; two-line labels (OPEN /
  // DOSSIER on every tile at every width) were a fixer finding, 2026-10-01.
  const link = one(`${S} .wa-person .wa-open`);
  // Inline-size only: a size container would take the plate's height from
  // nothing, and the link stays unpositioned (its ::after is the face's box).
  assert.match(link, /container: wa-open \/ inline-size;/);
  assert.doesNotMatch(link, /container-type: size|position:/);
  const label = one(`${S} .wa-person .wa-open > span`);
  assert.match(label, /white-space: nowrap;/);
  assert.doesNotMatch(label, /text-wrap/);
  // Narrow plates: the 六詠 cards' Oxanium 600; wide ones: Michroma.
  assert.match(label, /font-family: var\(--mr-mono\); font-weight: 600;/);
  const wide = one(`${S} .wa-person .wa-open > span`, ["@container wa-open (min-width: 188px)"]);
  assert.match(wide, /font-family: var\(--mr-hud\);/);
  // The narrowest plates keep the cell, smaller, on the switch's edge.
  const narrow = ["@container wa-open (max-width: 135.98px)"];
  assert.match(one(`${S} .wa-person .wa-open > span::after`, narrow), /width: 24px; height: 24px;/);
  assert.match(one(`${S} .wa-person .wa-open > span::before`, narrow), /right: 17px;/);
  // Every container rule restyles the label or its pseudos only, at 12px.
  const queried = rules.filter((r) => r.context.some((c) => c.startsWith("@container wa-open")));
  assert.ok(queried.length >= 3);
  for (const rule of queried) {
    assert.match(rule.selector, /\.wa-open > span(?:::(?:before|after))?$/, rule.selector);
    assert.doesNotMatch(rule.body, /font-size|content:/, rule.selector);
  }
});
