import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const readCss = async () =>
  (await read("src/styles-dream-taisho.css")).replace(/\/\*[\s\S]*?\*\//g, "");
const selectorGroups = (css) =>
  [...css.matchAll(/(?:^|[{};])\s*([^{};@\s][^{};]*)\{/g)]
    .map((match) => match[1].trim())
    .filter((selector) => !/^(?:from|to|\d+%)$/.test(selector));
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
  return [...parts, current.trim()];
};
const ruleBody = (css, selector) => {
  const start = css.indexOf(`${selector} {`);
  assert.ok(start >= 0, selector);
  return css.slice(start, css.indexOf("}", start));
};

test("Taisho layer and its Mincho faces load after the Dream sheets, before cinematic", async () => {
  const source = await read("src/routes/dream-chapter.tsx");
  assert.match(source, /import dreamTaishoCssUrl from "@\/styles-dream-taisho\.css\?url";/);
  assert.match(source, /family=Shippori\+Mincho\+B1:wght@500;800/);
  assert.match(source, /family=Shippori\+Mincho:wght@400;500;700/);
  assert.match(source, /display=swap/);
  const links = source.slice(source.search(/links:\s*\[/));
  const order = [
    "href: dreamChapterCssUrl",
    "href: dreamFilmCssUrl",
    "href: dreamStoryCssUrl",
    "href: DREAM_FONTS_URL",
    "href: dreamTaishoCssUrl",
    "CINEMATIC_STYLESHEET_LINK",
  ].map((needle) => links.indexOf(needle));
  assert.ok(
    order.every((index) => index > 0),
    String(order),
  );
  assert.deepEqual(
    [...order].sort((a, b) => a - b),
    order,
  );
});

test("every rule is scoped to the doubled Dream page class", async () => {
  const css = await readCss();
  const groups = selectorGroups(css);
  assert.ok(groups.length > 150, String(groups.length));
  for (const group of groups) {
    for (const selector of splitSelectors(group)) {
      assert.match(
        selector,
        /^(?:html:not\(\[data-world-effects="economy"\]\)\s+)?\.dream-page\.dream-page\b/,
        selector,
      );
    }
  }
});

test("motion is finite, gated and never isolates the logo blend", async () => {
  const css = await readCss();
  const gate = css.indexOf("@media (prefers-reduced-motion: no-preference)");
  assert.ok(gate > 0);
  assert.doesNotMatch(css.slice(0, gate), /animation:(?!\s*none)/);
  assert.doesNotMatch(css, /infinite|animation-iteration-count/);
  const rules = [...css.matchAll(/animation:\s*([^;]+);/g)].map((match) => match[1]);
  assert.ok(rules.filter((rule) => rule !== "none").length >= 6);
  const gated = css.slice(gate, css.indexOf("@keyframes"));
  for (const group of selectorGroups(gated)) {
    if (/animation-play-state|data-dream-hero-active/.test(group)) continue;
    for (const selector of splitSelectors(group)) {
      assert.match(selector, /^html:not\(\[data-world-effects="economy"\]\)/, selector);
    }
  }
  assert.match(
    gated,
    /\[data-dream-hero-active="false"\] \.dream-hero-art \{\s*animation-play-state: paused;/,
  );
  // The logo's black matte only disappears while no ancestor between it and
  // the art forms a stacking context.
  assert.doesNotMatch(gated, /:is\(\.dream-hero-copy,|\.dream-hero-copy\s*\{/);
  for (const selector of [".dream-hero-copy", ".dream-hero-field", ".dream-hero-vignette"]) {
    const body = ruleBody(css, `.dream-page.dream-page ${selector}`);
    assert.match(body, /z-index: auto;/, selector);
    assert.doesNotMatch(body, /transform:(?!\s*none)|filter:|opacity:|isolation:/, selector);
  }
});

test("chrome is opaque and accessibility modes are restated", async () => {
  const css = await readCss();
  assert.match(ruleBody(css, ".dream-page.dream-page .dream-site-header"), /background: #130c17;/);
  const transparency = css.slice(css.indexOf("@media (prefers-reduced-transparency: reduce)"));
  assert.match(transparency, /\.dream-site-header \{\s*background: #130c17;/);
  assert.match(css, /@media \(prefers-contrast: more\)/);
  assert.match(css, /@media \(forced-colors: active\)[\s\S]*-webkit-text-fill-color: CanvasText;/);
  assert.doesNotMatch(css, /touch-action:|overscroll-behavior:|backdrop-filter:(?!\s*none)/);
  for (const match of css.matchAll(/([^;{}]+)!important/g)) {
    assert.match(match[1], /^\s*(?:background|box-shadow):/, match[0]);
  }
  assert.match(css, /#cases\.dream-section \{\s*scroll-margin-top: max\(164px/);
});

test("type never drops below 12px", async () => {
  const css = await readCss();
  const sizes = [...css.matchAll(/font-size:\s*([^;]+);/g)].map((match) => match[1]);
  assert.ok(sizes.length > 50);
  for (const size of sizes) {
    const minimum = size.match(/^clamp\((\d+)px/)?.[1] ?? size.match(/^(\d+)px$/)?.[1];
    if (minimum == null) continue;
    assert.ok(Number(minimum) >= 12, size);
  }
});

test("the page reads as a four-act film programme", async () => {
  const source = await read("src/components/dream-chapter/dream-chapter.tsx");
  for (const act of ["第一幕", "第二幕", "第三幕", "第四幕"]) {
    assert.match(source, new RegExp(`className="dream-act-mark" aria-hidden="true">\\s*${act}`));
  }
  assert.match(source, /<div className="dream-hero-title" aria-hidden="true">/);
  assert.match(
    source,
    /<section className="dream-prologue" id="prologue" aria-labelledby="prologue-title">/,
  );
  assert.match(source, /<dl className="dream-credits" aria-label="登場記録">/);
  assert.doesNotMatch(source, /\u3000/);
});
