import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const readCss = async (path) => (await read(path)).replace(/\/\*[\s\S]*?\*\//g, "");

test("showcase layer is linked by both saga routes after their own skin and before the cinematic sheet", async () => {
  for (const [route, own] of [
    ["rexonance-saga", "resonanceMotionCssUrl"],
    ["extreme-saga", "extremeSagaCssUrl"],
  ]) {
    const source = await read(`src/routes/${route}.tsx`);
    assert.match(source, /styles-saga-showcase\.css\?url/);
    const links = source.slice(source.search(/links:\s*\[/));
    const showcase = links.indexOf("href: sagaShowcaseCssUrl");
    assert.ok(links.indexOf(`href: ${own}`) < showcase, route);
    assert.ok(showcase < links.indexOf("CINEMATIC_STYLESHEET_LINK"), route);
  }
  for (const path of [
    "src/lib/world-head.ts",
    "src/routes/final-stage.tsx",
    "src/routes/world.tsx",
    "src/routes/dream-chapter.tsx",
    "src/routes/__root.tsx",
  ]) {
    assert.doesNotMatch(await read(path), /sagaShowcase|saga-showcase/);
  }
});

test("showcase is a static skin: no motion, media, blur or gesture ownership", async () => {
  const css = await readCss("src/styles-saga-showcase.css");
  assert.doesNotMatch(
    css,
    /touch-action:|overscroll-behavior:|scroll-snap-|animation|@keyframes|url\(|(?<!-)filter\s*:(?!\s*none)|pointer-events\s*:/,
  );
  assert.doesNotMatch(css, /backdrop-filter:/);
  assert.match(css, /focus-visible/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /@media \(prefers-contrast: more\), \(prefers-reduced-transparency: reduce\)/);
});

test("showcase outranks the cinematic sheet and never restyles Final Stage", async () => {
  const css = await readCss("src/styles-saga-showcase.css");
  // A selector is whatever sits between a brace and the next "{" without a
  // declaration or at-rule in between.
  const selectors = [...`}${css}`.matchAll(/[{}]\s*([^{};@]+)\{/g)].flatMap((match) =>
    match[1].split(",").map((selector) => selector.trim()),
  );
  assert.ok(selectors.length > 40);
  for (const selector of selectors) {
    assert.match(selector, /^\.rxs-page\.rxs-page/, selector);
  }
  assert.doesNotMatch(css, /\.fst-/);
  assert.match(css, /\.rxs-page\.rxs-page\.exs-page\s*\{[^}]*--rxs-cyan/);
});

test("showcase leaves rail, slider, select, nav and landscape hero geometry to the earlier sheets", async () => {
  const css = await readCss("src/styles-saga-showcase.css");
  assert.doesNotMatch(css, /\.liquid-(?:selection-lens|rail-surface|selection-surface)/);
  const geometry =
    /\b(?:width|height|min-width|min-height|max-width|padding|margin|gap|grid-template-columns|display|flex|font-size|font|appearance|inset|top|right|bottom|left|position|transform|translate|scale)\s*:/;
  const guarded = css.match(
    /\.rxs-page\.rxs-page[^{]*(?:\.rxs-stage-tabs|\.rxs-p14-ios-(?:slider|track|thumb)|\.rxs-comparison-selector select|\.rxs-p14-native-select select|\.rxs-p14-range-labels button|\.rxs-local-nav-inner|\.rxs-menu-trigger)[^{]*\{[^}]*\}/g,
  );
  assert.ok(guarded && guarded.length >= 6);
  for (const block of guarded) assert.doesNotMatch(block, geometry, block);
  // !important is reserved for the menu trigger, whose frosted material is
  // forced by the root sheet the same way.
  assert.doesNotMatch(css.replace(/\.rxs-menu-trigger[^}]*\}/g, ""), /!important/);
  // The 761–1440 landscape hero grid is measured by verify-cinematic-edition;
  // the column hero applies only outside that range.
  const columnHero = css.match(/@media \(max-width: 760px\),[\s\S]*?\{[\s\S]*?\.rxs-hero \{/);
  assert.ok(columnHero);
  assert.match(columnHero[0], /\(min-width: 1441px\)/);
  assert.match(columnHero[0], /\(orientation: portrait\)/);
});

test("showcase keeps readable floors and the two-neutral palette", async () => {
  const css = await readCss("src/styles-saga-showcase.css");
  assert.doesNotMatch(css, /font-size:\s*(?:[0-9]|1[01])(?:\.\d+)?px\b/);
  assert.match(css, /--sc-ink: #000;/);
  assert.match(css, /--sc-tile: #1d1d1f;/);
  assert.match(css, /--sc-secondary: #86868b;/);
  assert.doesNotMatch(css, /text-shadow:(?!\s*none)/);
});
