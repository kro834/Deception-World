import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

/* Dossier, Final Stage and Dream elevation (E1): the decisions a later edit
   must not quietly undo. Each was measured in the browser at 320, 390, 768
   and 1440; the reasons live in the stylesheet comments. */

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const strip = (css) => css.replace(/\/\*[\s\S]*?\*\//g, "");
const flat = (css) => strip(css).replace(/\s+/g, " ");

const dossier = flat(read("src/styles-dossier-reader.css"));
const finalStage = flat(read("src/styles-final-stage.css"));
const dream = flat(read("src/styles-dream-story.css"));
const zeus = read("src/components/zeus-button.tsx");

// The body of the first rule whose selector ends with `selector`, optionally
// searched only after `from`.
const body = (css, selector, from = "") => {
  const start = from ? css.indexOf(from) : 0;
  assert.ok(start >= 0, `missing ${from}`);
  const at = css.indexOf(`${selector} {`, start);
  assert.ok(at >= 0, `missing rule ${selector}`);
  return css.slice(at, css.indexOf("}", at));
};

// The text of the first at-rule block with this prelude, nested rules
// included, that contains `needle`.
const block = (css, prelude, needle = "") => {
  for (let at = css.indexOf(`${prelude} {`); at >= 0; at = css.indexOf(`${prelude} {`, at + 1)) {
    let depth = 0;
    for (let index = css.indexOf("{", at); index < css.length; index += 1) {
      if (css[index] === "{") depth += 1;
      if (css[index] === "}" && --depth === 0) {
        const text = css.slice(at, index + 1);
        if (text.includes(needle)) return text;
        break;
      }
    }
  }
  throw new Error(`missing ${prelude} block with ${needle}`);
};

test("phrase-broken chapter titles never push their card past the column", () => {
  // auto-phrase raises a title's min-content to its longest phrase; without
  // this the 1fr card grew to 372px inside a 354px column at 390px.
  assert.match(
    dossier,
    /main\.manager-page \.manager-copy-section > :is\(\.manager-copy-heading, \.manager-copy-body\) \{ min-width: 0; \}/,
  );
  const title = body(dossier, "main.manager-page #dossier-index .manager-copy-heading h2");
  assert.match(title, /font-size: clamp\(24px, 2\.1vw, 30px\)/);
  assert.match(title, /word-break: auto-phrase/);
  assert.match(title, /text-wrap: balance/);
  // Phones keep their 25px title at the old line height.
  const phone = block(dossier, "@media (max-width: 760px)", "font-size: 25px");
  assert.match(
    phone,
    /#dossier-index \.manager-copy-heading h2 \{ font-size: 25px; line-height: 1\.5; \}/,
  );
  // Tablets stack the title over prose held to a reading measure.
  const tablet = block(
    dossier,
    "@media (min-width: 761px) and (max-width: 1180px)",
    ".manager-copy-section.manager-copy-section",
  );
  assert.match(tablet, /grid-template-columns: minmax\(0, 1fr\);/);
  assert.match(tablet, /\.manager-copy-body \{ max-width: 38em; \}/);
});

test("profile facts are one ruled spec sheet, and the sovereign file keeps its own", () => {
  const panel = body(dossier, "main.manager-page:not(.is-sovereign) .manager-hero .manager-facts");
  assert.match(panel, /gap: 0;/);
  assert.match(panel, /overflow: hidden;/);
  assert.match(panel, /border-radius: var\(--dossier-radius\);/);
  const cell = body(
    dossier,
    "main.manager-page:not(.is-sovereign) .manager-hero .manager-facts > div",
  );
  assert.match(cell, /box-shadow: -1px -1px 0 var\(--facts-rule\);/);
  assert.match(cell, /border: 0;/);
  // Label and value share a row on phones; under 375px they stack again, so
  // 仮面ライダーヴァンダール never splits mid-name at a 360px Galaxy width.
  const phone = block(dossier, "@media (max-width: 560px)", ".manager-facts");
  assert.match(phone, /grid-template-columns: 96px minmax\(0, 1fr\);/);
  const narrow = block(dossier, "@media (max-width: 374px)", ".manager-facts");
  assert.match(narrow, /\.manager-facts > div \{ display: block; \}/);
  assert.match(narrow, /\.manager-facts dt \{ margin-bottom: 4px; \}/);
  assert.throws(() => block(dossier, "@media (max-width: 359px)", ".manager-facts"));
  // The rules are shadows, which forced colours drop: restore a real one.
  assert.match(
    block(dossier, "@media (forced-colors: active)", ".manager-facts"),
    /border-top: 1px solid CanvasText;/,
  );
  // Every spec-sheet rule leaves the sovereign file (Zeus) alone.
  const from = dossier.lastIndexOf("}", dossier.indexOf("--facts-rule:"));
  const sheet = dossier.slice(from).match(/[^{};]*\.manager-hero \.manager-facts[^{]*\{/g) ?? [];
  assert.ok(sheet.length >= 10, String(sheet.length));
  for (const selector of sheet) assert.match(selector, /:not\(\.is-sovereign\)/, selector);
});

test("hero, dossier, records and pagination share one column and one radius", () => {
  assert.match(dossier, /main\.manager-page \{ --dossier-radius: 12px; \}/);
  const phone = block(dossier, "@media (max-width: 760px)", "#dossier-profile,");
  assert.match(
    phone,
    /main\.manager-page \.manager-hero#dossier-profile, main\.manager-page:not\(\.is-sovereign\) \.manager-dossier, main\.manager-page \.rider-archive-identity-records \{ width: calc\(100% - 36px - env\(safe-area-inset-left\) - env\(safe-area-inset-right\)\); \}/,
  );
  assert.match(
    dossier,
    /main\.manager-page:not\(\.is-sovereign\) \.manager-hero \{ width: min\(1256px, calc\(100% - 48px\)\); \}/,
  );
  assert.match(
    dossier,
    /main\.manager-page:not\(\.is-sovereign\) \.manager-pagination \{ width: min\(1200px, calc\(100% - 48px\)\); \}/,
  );
  assert.match(
    dossier,
    /main\.manager-page \.rider-archive-identity-records > \* \{ border-radius: var\(--dossier-radius\); \}/,
  );
  // The sticky reader bar rides on the same phone column instead of
  // overhanging the panels under it by 6px a side.
  const bar = body(dossier, ".dossier-reader", "@media (max-width: 760px)");
  assert.match(
    bar,
    /width: calc\(100% - 36px - env\(safe-area-inset-left\) - env\(safe-area-inset-right\)\);/,
  );
  assert.doesNotMatch(bar, /calc\(100% - 24px\)/);
});

test("the end-of-file list return is a real control and no empty panel remains", () => {
  const tile = body(dossier, ".manager-page .manager-pagination .dossier-index-return");
  assert.match(tile, /min-height: 96px;/);
  assert.match(tile, /border: 1px solid/);
  // background-color, not the shorthand, so the press transition covers it.
  assert.match(tile, /background-color: color-mix/);
  assert.match(
    block(dossier, "@media (min-width: 521px)", "spacer"),
    /\.manager-pagination > \.manager-pagination-spacer \{ display: none; \}/,
  );
  assert.match(
    dossier,
    /\.manager-pagination:has\(> \.manager-pagination-spacer:first-child\) \{ grid-template-columns: auto minmax\(0, 1fr\); \}/,
  );
  // A list of one (no PREV, no NEXT) keeps a centred tile rather than the
  // later one-neighbour rule stretching it into a full-width banner.
  const wide = block(dossier, "@media (min-width: 761px)", "spacer:first-child");
  assert.match(
    wide,
    /\.manager-pagination:has\(> \.manager-pagination-spacer:first-child\):has\( > \.manager-pagination-spacer:last-child \) \{ grid-template-columns: minmax\(0, 1fr\); justify-items: center; \}/,
  );
  assert.ok(
    wide.indexOf(":has( > .manager-pagination-spacer:last-child )") >
      wide.indexOf(":has(> .manager-pagination-spacer:last-child) {"),
    "the list-of-one rule must follow the one-neighbour rules",
  );
  assert.match(
    dossier,
    /\.manager-pagination:has\(> \.manager-pagination-spacer\) > a \{ grid-column: 1 \/ -1; \}/,
  );
  // Wherever the list has a row of its own it is a 48px pill.
  const pill = block(dossier, "@media (max-width: 760px)", "grid-auto-flow: column");
  assert.match(pill, /min-height: 48px;/);
  assert.match(pill, /border-radius: 999px;/);
  // Stacked phones keep it in the names' column, clear of the Zeus corner.
  assert.match(
    block(dossier, "@media (max-width: 520px)", ".dossier-index-return"),
    /\.dossier-index-return \{ margin-inline: 22px auto; \}/,
  );
  // The Zeus button steps off the neighbours' names as well as their arrows,
  // so a mirrored step never lands on the text (the pinned entry stays).
  const avoid = zeus.slice(zeus.indexOf("const ZEUS_AVOID_SELECTOR"), zeus.indexOf('].join(",")'));
  assert.ok(avoid.includes('".manager-pagination > a > span:last-child"'));
  assert.ok(avoid.includes('".manager-pagination > a > :is(small, b)"'));
});

test("the header return chip leads with its arrow and names its list on phones", () => {
  assert.match(
    dossier,
    /\.manager-page \.manager-topbar \.manager-back \{ flex-direction: row-reverse;/,
  );
  assert.match(
    dossier,
    /\.manager-page \.manager-topbar \.manager-back > span \{ display: inline;[^}]*white-space: nowrap;/,
  );
  const narrow = block(dossier, "@media (max-width: 359px)", ".manager-back");
  assert.match(narrow, /width: 48px; height: 48px;/);
  assert.match(narrow, /\.manager-back > span \{ display: none; \}/);
});

test("hover answers only a mouse, and reduced motion drops every lean", () => {
  const hovers = [dossier, finalStage, dream].flatMap((css) =>
    [...css.matchAll(/[^{};]*:hover[^{]*\{/g)].map((match) => ({ css, at: match.index })),
  );
  assert.ok(hovers.length >= 10, String(hovers.length));
  for (const { css, at } of hovers) {
    const before = css.slice(0, at);
    // The reduced-motion resets name the hover states they undo.
    const reset = before.lastIndexOf("@media (prefers-reduced-motion: reduce)");
    if (reset >= 0) {
      const text = block(css.slice(reset), "@media (prefers-reduced-motion: reduce)");
      if (at < reset + text.length) {
        assert.match(text, /translate: none;/);
        continue;
      }
    }
    const open = before.lastIndexOf("@media (hover: hover)");
    assert.ok(open >= 0, css.slice(at, at + 80));
    const within = block(css.slice(open), css.slice(open, css.indexOf(" {", open)));
    assert.ok(at < open + within.length, `outside a hover block: ${css.slice(at, at + 80)}`);
    // The pre-existing coarse (hover: hover) rule in the dossier sheet is the
    // only one without the pointer test.
    const prelude = css.slice(open, css.indexOf("{", open));
    if (!prelude.includes("pointer: fine")) {
      assert.match(css.slice(at, at + 120), /\.dossier-read-link, \.dossier-reader a/);
    }
  }
  for (const [css, lean] of [
    [dossier, ".manager-back:hover i"],
    [dossier, '.ios-slide-open[data-dragging="false"]:hover .ios-slide-open-arrows'],
    [finalStage, ".fst-cast-copy > a:hover i"],
    [dream, ".dream-page.dream-page .dream-back-link:hover > span:first-child"],
  ]) {
    const reduced = css.lastIndexOf("@media (prefers-reduced-motion: reduce)");
    const hover = css.indexOf(`${lean} {`);
    // Same selector, later in the sheet: the reset wins at equal specificity.
    assert.ok(css.indexOf(lean, reduced) > reduced && reduced > hover, lean);
  }
});

test("HUD Latin leads with Oxanium and falls back to the same faces as before", () => {
  const base = strip(read("src/styles-world/01.css")).match(/--font-display:\s*([^;]+);/)[1];
  const token = dossier.match(/:root \{ --font-display: ([^;]+); \}/)[1];
  assert.equal(token, `"Oxanium", ${base.replace(/\s+/g, " ").trim()}`);
  assert.match(dossier, /\.dossier-index-return i\s*\) \{ font-variant-numeric: tabular-nums; \}/);
});

test("the dossier choreography is scroll-linked, gated and never hides a landing", () => {
  const motion = block(
    dossier,
    "@supports (animation-timeline: view()) and (animation-range: entry 0% entry 100%)",
  );
  assert.match(motion, /^@supports[^{]*\{ @media \(prefers-reduced-motion: no-preference\) \{/);
  const rules = [...motion.matchAll(/(html[^{]*)\{([^}]*)\}/g)];
  assert.equal(rules.length, 5);
  for (const [, selector, declarations] of rules) {
    for (const gate of [
      ':not([data-world-effects="economy"])',
      ":not([data-side-menu-open])",
      ":not([data-loading])",
      ":not([data-dialog-open])",
    ]) {
      assert.ok(selector.replace(/\s+/g, "").includes(gate.replace(/\s+/g, "")), gate);
    }
    // Reading stays still: chapter titles and prose never animate.
    assert.doesNotMatch(selector, /manager-copy-(?:heading|body|section)/);
    const range = declarations.match(/animation-range: ([^;]+);/);
    if (range) assert.match(range[1], /entry 100%$/);
  }
  const frames = (name) => dossier.match(new RegExp(`@keyframes ${name} \\{(.*?\\} )\\}`))[1];
  for (const name of ["dossier-rise", "dossier-lift", "dossier-lift-flat"]) {
    for (const [, property] of frames(name).matchAll(/([\w-]+):/g)) {
      assert.ok(["opacity", "translate", "scale"].includes(property), `${name} ${property}`);
    }
  }
  // Android's large cards slide without the fade, as in the Motion edition.
  assert.doesNotMatch(frames("dossier-lift-flat"), /opacity/);
  assert.match(
    motion,
    /html:not\(\[data-world-effects="economy"\]\)\[data-android-renderer\][^{]*\.manager-page :is\(\.form-pickup-card, \.rider-special-site-card\) \{ animation-name: dossier-lift-flat; \}/,
  );
});

test("the Final Stage synopsis reads at a book measure with labels on the 11px floor", () => {
  assert.match(
    finalStage,
    /\.fst-story-copy p \{ max-inline-size: 36em; letter-spacing: 0\.02em; \}/,
  );
  assert.match(finalStage, /\.fst-story-copy p:first-child \{[^}]*font-weight: 500;/);
  const phone = block(finalStage, "@media (max-width: 680px)");
  assert.match(
    phone,
    /\.fst-copy p, \.fst-story-copy p:not\(:first-child\) \{ font-size: 15px; line-height: 1\.95; \}/,
  );
  for (const selector of [
    ".fst-cast-detail figcaption",
    ".fst-gallery figcaption",
    ".fst-cast-copy small",
    ".fst-pickup-visual > span",
    ".fst-pickup-copy p, .fst-pickup-copy small",
    ".fst-page .rxs-hero-copy > p:first-child",
  ]) {
    assert.match(body(finalStage, selector), /font-size: 11px;/, selector);
  }
});

test("a Dream CASE record settles open once, and only with motion allowed", () => {
  const open = block(dream, "@media (prefers-reduced-motion: no-preference)");
  assert.match(
    open,
    /\.dream-story-case\[open\] > \.dream-story-case-body \{ animation: dream-case-open 420ms/,
  );
  assert.doesNotMatch(open, /infinite/);
  const frames = dream.match(/@keyframes dream-case-open \{(.*?\} )\}/)[1];
  for (const [, property] of frames.matchAll(/([\w-]+):/g)) {
    assert.ok(["opacity", "translate"].includes(property), property);
  }
});
