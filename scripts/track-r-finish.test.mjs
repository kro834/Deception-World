import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

/* 2026-10-02 Track R: the Rexonance finish sheet and the Extreme edition
   sheet (dreamx/rx-copy/COPY.md, rx-audit/AUDIT.md). They are route-only,
   scoped to their own page, static but for one finite gated lock-on, keep
   the 12px floor and answer forced colours; the components carry the vetted
   copy, the lede wrappers, the keyboard-aware hint and the Zeus avoid rows. */

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const strip = (css) => css.replace(/\/\*[\s\S]*?\*\//g, "");
const rexonanceCss = strip(read("src/styles-rexonance-finish.css"));
const extremeCss = strip(read("src/styles-extreme-edition.css"));
const rexonanceRoute = read("src/routes/rexonance-saga.tsx");
const extremeRoute = read("src/routes/extreme-saga.tsx");
const rexonance = read("src/components/rexonance-saga/rexonance-saga.tsx");
const extreme = read("src/components/extreme-saga/extreme-saga.tsx");

// Selector lists split at top-level commas only: `:is(a, b)` stays whole.
const splitTopLevel = (value) => {
  const parts = [];
  let depth = 0;
  let current = "";
  for (const character of value) {
    if (character === "(") depth += 1;
    if (character === ")") depth -= 1;
    if (character === "," && depth === 0) {
      parts.push(current.trim());
      current = "";
    } else current += character;
  }
  return [...parts, current.trim()].filter(Boolean);
};

// Keyframe steps (from / to) are not selectors.
const withoutKeyframes = (css) =>
  css.replace(/@keyframes\s+[\w-]+\s*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, "");

const selectors = (css) =>
  [...`}${withoutKeyframes(css)}`.matchAll(/[{}]\s*([^{};@]+)\{/g)].flatMap((match) =>
    splitTopLevel(match[1].replace(/\s+/g, " ")),
  );

test("the sheets load last on their own routes, before the cinematic sheet, and nowhere else", () => {
  const rx = rexonanceRoute.slice(rexonanceRoute.search(/links:\s*\[/));
  const instrument = rx.indexOf("href: rexonanceInstrumentCssUrl");
  const finish = rx.indexOf("href: rexonanceFinishCssUrl");
  assert.ok(instrument > 0 && instrument < finish && finish < rx.indexOf("CINEMATIC_STYLESHEET_LINK"));
  const ex = extremeRoute.slice(extremeRoute.search(/links:\s*\[/));
  const motion = ex.indexOf("href: motionEditionCssUrl");
  const edition = ex.indexOf("href: extremeEditionCssUrl");
  assert.ok(motion > 0 && motion < edition && edition < ex.indexOf("CINEMATIC_STYLESHEET_LINK"));
  for (const path of [
    "src/lib/world-head.ts",
    "src/routes/final-stage.tsx",
    "src/routes/world.tsx",
    "src/routes/__root.tsx",
  ]) {
    assert.doesNotMatch(read(path), /rexonance-finish|extreme-edition/, path);
  }
  assert.doesNotMatch(rexonanceRoute, /extreme-edition/);
  assert.doesNotMatch(extremeRoute, /rexonance-finish/);
});

test("every rule is scoped to its own page, so Final Stage never sees it", () => {
  for (const selector of selectors(rexonanceCss)) {
    assert.match(
      selector,
      /^(?:html:not\(\[data-world-effects="economy"\]\) )?\.rxs-page\.rxs-page\.rxs-rexonance-page\b/,
      selector,
    );
  }
  for (const selector of selectors(extremeCss)) {
    if (selector === 'html[data-mode="world"]:has(.exs-page)') continue;
    assert.match(
      selector,
      /^(?:html:not\(\[data-world-effects="economy"\]\)(?::not\(\[data-loading\]\))? )?\.rxs-page\.rxs-page\.exs-page\b/,
      selector,
    );
  }
  for (const css of [rexonanceCss, extremeCss]) assert.doesNotMatch(css, /\.fst-/);
});

test("static paint: no loops, no gestures, no images, the 12px floor, forced colours", () => {
  for (const css of [rexonanceCss, extremeCss]) {
    assert.doesNotMatch(css, /\binfinite\b|touch-action\s*:|overscroll-behavior\s*:|scroll-snap-|url\(/);
    assert.doesNotMatch(css, /font-size:\s*(?:[0-9]|1[01])(?:\.\d+)?px\b/);
    assert.match(css, /@media \(forced-colors: active\)/);
    // The measured slider and lens are never restyled here.
    assert.doesNotMatch(css, /\.rxs-p14-ios-|\.liquid-selection|\.liquid-rail/);
  }
  // The finish sheet animates nothing; the edition's one keyframe is the
  // dial's finite lock-on, gated by reduced motion, economy and the loading
  // cover, and it moves only opacity and transform.
  assert.doesNotMatch(rexonanceCss, /@keyframes|\banimation\s*:/);
  const frames = [...extremeCss.matchAll(/@keyframes\s+([\w-]+)\s*\{([\s\S]*?)\}\s*\}/g)];
  assert.equal(frames.length, 1);
  assert.equal(frames[0][1], "ex-dial-lock");
  const properties = new Set([...frames[0][2].matchAll(/([\w-]+)\s*:/g)].map((m) => m[1]));
  for (const property of properties) assert.ok(["opacity", "transform"].includes(property), property);
  assert.match(
    extremeCss,
    /@media \(prefers-reduced-motion: no-preference\) \{\s*html:not\(\[data-world-effects="economy"\]\):not\(\[data-loading\]\) \.rxs-page\.rxs-page\.exs-page \.exs-dial \{\s*animation: ex-dial-lock/,
  );
  assert.match(extremeCss, /@media \(prefers-reduced-motion: reduce\) \{\s*\.rxs-page\.rxs-page\.exs-page \.exs-dial \{\s*animation: none/);
  // !important only answers the showcase's forced menu-trigger paint.
  for (const css of [rexonanceCss, extremeCss]) {
    for (const block of css.match(/[^{}]+\{[^}]*!important[^}]*\}/g) ?? []) {
      assert.match(block, /\.rxs-menu-trigger/, block);
    }
  }
});

test("the stage copy reorder is phone-only and leaves the desktop grid alone", () => {
  for (const css of [rexonanceCss, extremeCss]) {
    const phone = css.match(/@media \(max-width: 900px\) \{[\s\S]*?\n\}/)?.[0];
    assert.ok(phone);
    assert.match(phone, /\.rxs-stage-panel > div \{\s*display: contents;/);
    assert.match(phone, /\.rxs-stage-panel > div > small \{\s*order: -2;/);
    assert.match(phone, /\.rxs-stage-panel > div > h3 \{\s*order: -1;/);
    assert.doesNotMatch(css.replace(phone, ""), /display: contents/);
  }
});

test("Extreme gains Rexonance's anchor and focus offsets, an opaque bar and a chapter index", () => {
  assert.match(extremeCss, /html\[data-mode="world"\]:has\(\.exs-page\) \{\s*scroll-padding-top: 0;/);
  assert.match(
    extremeCss,
    /\.rxs-page\.rxs-page\.exs-page \.rxs-section\[id\] \{\s*scroll-margin-block-start: calc\(var\(--rxs-local-nav-reserve, 62px\) \+ 24px\);/,
  );
  assert.match(extremeCss, /:is\(a\[href\], button, input, select, \[tabindex="0"\]\) \{\s*scroll-margin-block-start: calc\(var\(--rxs-local-nav-reserve, 62px\) \+ 12px\);/);
  assert.match(extremeCss, /\.rxs-page\.rxs-page\.exs-page \.rxs-local-nav \{[^}]*backdrop-filter: none;/);
  const index = extreme.match(/<nav className="rxs-chapter-index exs-chapter-index"[^>]*>[\s\S]*?<\/nav>/)?.[0];
  assert.ok(index);
  assert.match(index, /aria-label="エクスプリームの見どころ"/);
  for (const target of ["p14", "stages", "system"]) {
    assert.ok(index.includes(`href="#${target}"`));
    assert.ok(extreme.includes(`<section id="${target}"`));
  }
  assert.doesNotMatch(index, /onClick|onPointer|tabIndex|レクソナンス/);
  assert.match(extreme, /<i className="exs-dial" \/>/);
  assert.match(extreme, /to="\/form-archive"/);
});

test("the components carry the vetted copy shape: lede sentences, keyboard hint, no widget names", () => {
  for (const source of [rexonance, extreme]) {
    assert.match(
      source,
      /<p className="rxs-hero-lede">\s*<span className="rxs-hero-lede-text">\s*<span>[^<]+<\/span>\s*<span>[^<]+<\/span>\s*<\/span>\s*<\/p>/,
    );
    assert.match(source, /タップ・長押し・左右スライド・矢印キーで切り替え/);
    assert.doesNotMatch(source, /iOS標準選択/);
    assert.match(source, /<span>比較する相手<\/span>/);
  }
  // The Ultra title's zero-width marker renders as <wbr />, never as text.
  assert.match(rexonance, /title: "60秒、全部を\\u200B一動作へ。"/);
  assert.match(rexonance, /title\.split\("\\u200B"\)/);
  assert.match(rexonance, /<h3>\{renderStageTitle\(activeStage\.title\)\}<\/h3>/);
  assert.match(rexonance, /機構ごと\s*<wbr \/>\s*組み替える。/);
  // Both sheets hold the phrases together where auto-phrase is missing.
  for (const css of [rexonanceCss, extremeCss]) {
    assert.match(css, /\.rxs-stage-hint\s*\) \{\s*word-break: keep-all;\s*overflow-wrap: anywhere;/);
    assert.match(css, /\.rxs-hero-lede-text > span,[\s\S]*?\{\s*display: inline-block;/);
  }
});

test("the Zeus button steps off the P14 pills and readout", () => {
  const zeus = read("src/components/zeus-button.tsx");
  const avoid = zeus.slice(zeus.indexOf("const ZEUS_AVOID_SELECTOR"), zeus.indexOf('].join(",")'));
  assert.ok(avoid.includes('".rxs-p14-range-labels button"'));
  assert.ok(avoid.includes('".rxs-p14-comparator output"'));
});
