import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { DREAM_ARCHIVE_CORNERS } from "../src/components/dream-chapter/dream-chapter-extra-data.ts";

/* 2026-10-02 Track D: the Dream Chapter archive UI — four corners (出来事, 舞台, 繋がり, 武装)
   between 章の言葉 and 用語集, the VOICES leaf inside 名台詞 and the supplements bound into
   the owner's parts (src/components/dream-chapter/dream-chapter-extra.tsx,
   src/styles-dream-extra.css). This pins the presentation's safety properties: sheet order
   and scope, gating, text size, no loops, forced colours, native folds with 48px rows and
   fuji rings, the mount points, the 目次 rows and the measured estimates. The data's own
   rules are pinned by dream-extra-data.test.mjs; the owner's text by owner-copy and
   dream-expansion. */

const read = (path) =>
  readFileSync(new URL(`../${path}`, import.meta.url), "utf8").replaceAll("\r\n", "\n");
const strip = (css) => css.replace(/\/\*[\s\S]*?\*\//g, "");
const page = read("src/components/dream-chapter/dream-chapter.tsx");
const extra = read("src/components/dream-chapter/dream-chapter-extra.tsx");
const route = read("src/routes/dream-chapter.tsx");
const css = strip(read("src/styles-dream-extra.css"));

const FULL_GATE =
  'html:not([data-world-effects="economy"]):not([data-side-menu-open]):not([data-loading]):not([data-dialog-open]) .dream-page.dream-page';

// Selector groups with their at-rule context, and keyframe blocks by name.
const parse = (source) => {
  const rules = [];
  const keyframes = [];
  const stack = [];
  let prelude = "";
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (character === "{") {
      const head = prelude
        .replace(/\s+/g, " ")
        .replace(/\(\s+/g, "(")
        .replace(/\s+\)/g, ")")
        .trim();
      prelude = "";
      const frames = head.match(/^@keyframes\s+([\w-]+)$/);
      if (frames) {
        let depth = 1;
        let end = index + 1;
        for (; end < source.length && depth > 0; end += 1) {
          if (source[end] === "{") depth += 1;
          if (source[end] === "}") depth -= 1;
        }
        keyframes.push({ name: frames[1], body: source.slice(index + 1, end - 1) });
        index = end - 1;
        continue;
      }
      if (head.startsWith("@")) {
        stack.push(head);
        continue;
      }
      const end = source.indexOf("}", index);
      rules.push({
        selector: head,
        body: source.slice(index + 1, end).trim(),
        context: [...stack],
      });
      index = end;
      continue;
    }
    if (character === "}") {
      stack.pop();
      prelude = "";
    } else if (character === ";") prelude = "";
    else prelude += character;
  }
  return { rules, keyframes };
};
const { rules, keyframes } = parse(css);
const splitSelectors = (group) => {
  const parts = [];
  let depth = 0;
  let current = "";
  for (const character of group) {
    if (character === "(") depth += 1;
    if (character === ")") depth -= 1;
    if (character === "," && depth === 0) {
      parts.push(current.trim());
      current = "";
    } else current += character;
  }
  return [...parts, current.trim()].filter(Boolean);
};
const slice = (source, from, to) => {
  const start = source.indexOf(from);
  const end = source.indexOf(to, start);
  assert.ok(start >= 0 && end > start, `${from} … ${to}`);
  return source.slice(start, end);
};

test("the extra sheet loads after the refinement sheet and before the cinematic skin", () => {
  assert.match(route, /import dreamExtraCssUrl from "@\/styles-dream-extra\.css\?url";/);
  const links = route.slice(route.search(/links:\s*\[/));
  const refinement = links.indexOf("href: dreamRefinementCssUrl");
  const extraLink = links.indexOf("href: dreamExtraCssUrl");
  const cinematic = links.indexOf("CINEMATIC_STYLESHEET_LINK");
  assert.ok(refinement > 0 && extraLink > refinement && cinematic > extraLink);
  assert.doesNotMatch(route, /mirage|motion-edition/i);
});

test("every rule is scoped to the Dream page or its gates; no small text, loops or paint tricks", () => {
  assert.ok(rules.length > 80, String(rules.length));
  for (const { selector } of rules) {
    for (const part of splitSelectors(selector)) {
      assert.match(
        part,
        /^(?:html(?:\[data-world-effects="economy"\]|:not\([^)]*\))*\s+)?\.dream-page\.dream-page\b/,
        part,
      );
    }
  }
  for (const [, size] of css.matchAll(/font-size:\s*([^;]+);/g)) {
    const minimum = size.match(/^clamp\((\d+)px/)?.[1] ?? size.match(/^(\d+)px$/)?.[1];
    assert.ok(minimum != null, size);
    assert.ok(Number(minimum) >= 12, size);
  }
  assert.doesNotMatch(css, /infinite|!important|url\(/);
  assert.doesNotMatch(css, /touch-action:|overscroll-behavior:|backdrop-filter:/);
  assert.doesNotMatch(css, /:has\(\s*dialog|data-rail-lock/);
  // No vh heights, no fixed heights on text boxes.
  assert.doesNotMatch(css, /height:\s*\d+(?:vh|svh|dvh)/);
});

test("motion is finite or on one named view timeline, under the full gate, transform only", () => {
  assert.deepEqual(
    keyframes.map(({ name }) => name),
    ["ts-archive-spine"],
  );
  for (const { body } of keyframes) {
    const properties = [...body.matchAll(/([\w-]+)\s*:/g)].map((match) => match[1]);
    assert.deepEqual([...new Set(properties)], ["transform"]);
  }
  const timed = rules.filter(({ body }) => /animation-timeline|view-timeline/.test(body));
  assert.equal(timed.length, 2);
  for (const { selector, context } of timed) {
    assert.ok(selector.startsWith(FULL_GATE), selector);
    assert.deepEqual(context, [
      "@media (prefers-reduced-motion: no-preference)",
      "@supports (animation-timeline: --ts-archive) and (animation-range: entry 0% entry 100%)",
    ]);
  }
  const spine = timed.find(({ selector }) => selector.endsWith(".dream-chronicle-list::before"));
  assert.match(spine.body, /animation: ts-archive-spine linear both;/);
  assert.match(spine.body, /animation-timeline: --ts-archive;/);
  assert.match(spine.body, /animation-range: entry 0% cover 50%;/);
  const timeline = timed.find(({ selector }) => selector.endsWith(" .dream-chronicle-list"));
  assert.match(timeline.body, /view-timeline: --ts-archive block;/);
  // Every transition is gated the same way or switched off.
  for (const { selector, body, context } of rules) {
    if (!/transition:(?!\s*none)/.test(body)) continue;
    assert.ok(
      context.includes("@media (prefers-reduced-motion: no-preference)") ||
        context.includes("@media (hover: hover) and (pointer: fine)"),
      selector,
    );
    // Only transform (the fold cell) or the hover tint ease; never paint or layout.
    assert.doesNotMatch(
      body,
      /transition:[^;]*(?:background|border|clip-path|height|width|margin|padding)[^;]*;/,
      selector,
    );
  }
  assert.match(
    css,
    /@media \(prefers-reduced-motion: reduce\) \{\s*\.dream-page\.dream-page \.dream-archive-fold > summary \{\s*transition: none;/,
  );
  assert.match(
    css,
    /html\[data-world-effects="economy"\] \.dream-page\.dream-page \.dream-archive-fold > summary \{\s*transition: none;/,
  );
  // Vermilion plates stay still: the seal, the knot and the open cell never animate.
  for (const { selector, body } of rules) {
    if (/dream-archive-seal|dream-relations-knot > b/.test(selector))
      assert.doesNotMatch(body, /animation|transition/, selector);
  }
});

test("folds are native details with a 48px summary, a drawn cell, the fuji ring and forced colours", () => {
  assert.match(extra, /<details className="dream-archive-fold" open=\{index === 0\}>/);
  assert.match(extra, /<details key=\{group\.group\} className="dream-archive-fold">/);
  // ADDITIONAL AGENTS and INDEX are closed leaf folds (twelve rows / fifteen entries would
  // make the phone ledger and the dictionary a third longer again).
  assert.equal(extra.match(/<details className="dream-archive-fold is-leaf">/g)?.length, 2);
  assert.doesNotMatch(extra, /is-leaf" open/);
  assert.match(extra, /<summary>[\s\S]*?<i aria-hidden="true" \/>\s*<\/summary>/);
  const summary = rules.find(
    ({ selector }) => selector === ".dream-page.dream-page .dream-archive-fold > summary",
  );
  assert.match(summary.body, /min-height: 48px;/);
  assert.match(summary.body, /list-style: none;/);
  assert.match(summary.body, /cursor: pointer;/);
  assert.match(css, /\.dream-archive-fold > summary::-webkit-details-marker \{\s*display: none;/);
  assert.match(
    css,
    /\.dream-page\.dream-page \.dream-archive-fold > summary:focus-visible \{\s*outline: 2px solid var\(--ts-fuji\);/,
  );
  for (const { selector, body } of rules) {
    if (selector.includes(".dream-archive-fold > summary > i"))
      assert.doesNotMatch(body, /gradient/, selector);
  }
  const forced = css.slice(css.indexOf("@media (forced-colors: active)"));
  assert.match(forced, /-webkit-text-fill-color: CanvasText;/);
  assert.match(forced, /background: Canvas;/);
  assert.match(forced, /\.dream-archive-fold > summary > i \{[^}]*ButtonText[^}]*ButtonFace/);
  assert.match(forced, /\.dream-archive-fold\[open\] > summary > i \{[^}]*Highlight/);
  assert.match(forced, /\.dream-atlas-wave \{\s*display: none;/);
});

test("the corners mount as annexes between 章の言葉 and 用語集; VOICES is a leaf of 名台詞", () => {
  const corners = slice(page, '<section id="case-notes"', '<section id="glossary"');
  assert.match(
    corners,
    /<DreamChronicle id="chronicle" \/>\s*<DreamAtlas id="atlas" \/>\s*<DreamRelations id="relations" \/>\s*<DreamArsenal id="arsenal" \/>/,
  );
  for (const [component, id] of [
    ["DreamChronicle", "chronicle"],
    ["DreamAtlas", "atlas"],
    ["DreamRelations", "relations"],
    ["DreamArsenal", "arsenal"],
  ]) {
    const body = slice(extra, `export function ${component}(`, "\n}\n");
    assert.match(
      body,
      new RegExp(
        `<section\\s+id=\\{id\\}\\s+className="dream-annex dream-archive dream-${id}"\\s+aria-labelledby="${id}-title"\\s*>`,
      ),
      component,
    );
    assert.match(body, /<CornerHeading id=\{id\}/);
    assert.match(body, /data-dream-reveal/);
  }
  assert.match(
    extra,
    /<header className="dream-annex-heading">\s*<p lang="en">\{corner\.kicker\}<\/p>\s*<h2 id=\{`\$\{id\}-title`\}>/,
  );
  assert.doesNotMatch(page, /id="voices"/);
  assert.doesNotMatch(extra, /id="voices"/);
  const quotes = slice(page, '<section id="quotes"', "<footer");
  assert.match(quotes, /<\/ol>\s*<VoicesLeaf \/>\s*<\/section>/);
  // Pure render: no effects, handlers, images or dialogs in the archive.
  assert.doesNotMatch(
    extra,
    /<img|<dialog|onPointer|onTouch|onClick|preventDefault|acquireViewportScrollLock|useEffect|useState|useRef/,
  );
  assert.ok(
    !extra.includes(String.fromCharCode(0x3000)),
    "no ideographic space in the archive markup",
  );
  // The act index keeps its four cells.
  const actIndex = slice(page, "const DREAM_SECTION_LINKS", "\n];");
  assert.equal(actIndex.match(/\{ id: "/g)?.length, 4);
});

test("the supplements sit after the owner's text at every mount point", () => {
  assert.match(
    page,
    /\{character\.sections\.map\([\s\S]*?\)\)\}\s*<DossierSupplement id=\{character\.id\} after=\{character\.sections\.length\} \/>/,
  );
  assert.match(page, /<\/section>\s*<DossierSupplement id=\{record\.id\} after=\{2\} \/>/);
  assert.match(
    page,
    /\{entry\.profile\.map\([\s\S]*?\)\)\}\s*<RosterSupplement id=\{entry\.id\} \/>\s*<\/div>/,
  );
  assert.match(
    page,
    /\{agent\.line \? <p className="dream-agent-line">「\{agent\.line\}」<\/p> : null\}\s*<AgentSupplement code=\{agent\.code\} \/>/,
  );
  assert.match(page, /<\/ol>\s*<AgentAdditions \/>\s*<\/section>/);
  assert.match(
    page,
    /\{row\.note \? <p className="dream-record-note">\{row\.note\}<\/p> : null\}\s*<RecordSupplement label=\{row\.label\} \/>/,
  );
  assert.match(
    page,
    /\{member\.spoken \? `「\$\{member\.note\}」` : member\.note\}\s*<FactionMemberNote id=\{faction\.id\} name=\{member\.name\} \/>/,
  );
  assert.match(page, /\) : null\}\s*<FactionSupplement id=\{faction\.id\} \/>\s*<\/section>/);
  assert.match(
    page,
    /\{entry\.said \? <QuoteFigure text=\{entry\.said\} by=\{entry\.by\} \/> : null\}\s*<GlossarySupplement term=\{entry\.term\} \/>/,
  );
  assert.match(page, /<\/dl>\s*<GlossaryIndex \/>\s*<\/section>/);
  // The archive's eyebrows are the data file's HUD labels, in English.
  for (const label of ["record", "voices", "additions", "index"]) {
    assert.match(extra, new RegExp(`DREAM_ARCHIVE_LABELS\\.${label}`));
  }
  assert.match(extra, /<p className="dream-archive-eyebrow" lang="en">/);
  assert.match(extra, /<p className="dream-archive-leaf-label" lang="en">/);
});

test("the 目次 closes 第四幕 with the four corners and keeps 附録; phones get three link rows", () => {
  const contents = slice(page, "const DREAM_CONTENTS", "\n];");
  const act = slice(contents, 'act: "第四幕"', "\n  },");
  assert.deepEqual(
    [...act.matchAll(/href: "#([\w-]+)"/g)].map((match) => match[1]),
    ["cases", "case-notes", "chronicle", "atlas", "relations", "arsenal"],
  );
  for (const corner of DREAM_ARCHIVE_CORNERS) {
    assert.equal(corner.act, "第四幕");
    assert.ok(act.includes(`archiveCornerTitle("${corner.id}")`), corner.id);
  }
  const appendix = slice(contents, 'act: "附録"', "\n  },");
  assert.deepEqual(
    [...appendix.matchAll(/href: "#([\w-]+)"/g)].map((match) => match[1]),
    ["glossary", "quotes"],
  );
  const phone = rules.filter(({ context }) => context.includes("@media (max-width: 760px)"));
  const odd = phone.find(
    ({ selector }) => selector === ".dream-page.dream-page .dream-contents li > a:nth-of-type(odd)",
  );
  assert.equal(odd.body, "grid-column: 2;");
  const label = phone.find(
    ({ selector }) => selector === ".dream-page.dream-page .dream-contents li > small",
  );
  assert.match(label.body, /grid-row: 1 \/ span 3;/);
});

test("the corners, #quotes and the grown annexes carry measured estimates in every layout block", () => {
  // Ten blocks: base (1440), ≤1299 (1194), ≤1100 (1024), ≤980 (768), ≤760 (412), ≤400 (390),
  // ≤359 (320), landscape (844x390), landscape ≤760 (667x375), ≥1600 (1920) — finer than the
  // annex sheet's, because the atlas and the ledger change column counts between 1024 and
  // 1194 and wrap enough between 390 and 412 to leave the 120px landing tolerance.
  const blocks = [
    "",
    "@media (max-width: 1299px)",
    "@media (max-width: 1100px)",
    "@media (max-width: 980px)",
    "@media (max-width: 760px)",
    "@media (max-width: 400px)",
    "@media (max-width: 359px)",
    "@media (max-height: 520px) and (orientation: landscape)",
    "@media (max-height: 520px) and (orientation: landscape) and (max-width: 760px)",
    "@media (min-width: 1600px)",
  ];
  for (const id of [
    "cast-roster",
    "factions",
    "chronicle",
    "atlas",
    "relations",
    "arsenal",
    "glossary",
    "quotes",
  ]) {
    const estimates = rules.filter(
      ({ selector, body }) =>
        selector === `.dream-page.dream-page #${id}` && body.includes("contain-intrinsic-size"),
    );
    assert.deepEqual(
      estimates.map(({ context }) => context.join(" ")),
      blocks,
      id,
    );
    const values = estimates.map(({ body }) => body.match(/contain-intrinsic-size: ([^;]+);/)[1]);
    for (const value of values) assert.match(value, /^auto \d+px$/, id);
    // Placeholders are not estimates.
    assert.ok(new Set(values).size > 3, `${id}: ${values.join(", ")}`);
  }
  // In the sheet the base rules come first and the wide block last, so each layout's own
  // estimate wins the cascade.
  const order = [
    "#chronicle {",
    "@media (max-width: 1299px)",
    "@media (max-width: 359px)",
    "@media (min-width: 1600px)",
    "@keyframes ts-archive-spine",
  ].map((needle) => css.indexOf(needle));
  assert.deepEqual(
    [...order].sort((a, b) => a - b),
    order,
  );
});
