import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import postcss from "postcss";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const sheet = postcss.parse(read("src/styles-extreme-zenith.css"));
const route = read("src/routes/extreme-saga.tsx");
const scope = 'html[data-family="special"] body .rxs-page.rxs-page.exs-page';
const normal = (value) => value.replace(/\s+/g, " ").trim();
const rules = [];
sheet.walkRules((rule) => rules.push(rule));
const mediaOf = (rule) => (rule.parent.type === "atrule" ? normal(rule.parent.params) : null);
const find = (suffix, media = null) => {
  const match = rules.find(
    (rule) => rule.selectors.some((selector) => normal(selector).endsWith(suffix)) && mediaOf(rule) === media,
  );
  assert.ok(match, `Missing rule: ${suffix} ${media || ""}`);
  return match;
};
const declaration = (rule, property) => {
  let value;
  rule.walkDecls(property, (item) => {
    value = normal(item.value);
  });
  return value;
};
const heading = ":is(#performance, #p14, #stages, #system) > .rxs-section-heading > h2";

test("ZENITH is route-only, scoped, and loads after the editorial sheet", () => {
  assert.ok(rules.length > 60);
  for (const rule of rules)
    for (const selector of rule.selectors) assert.ok(normal(selector).startsWith(scope), selector);
  const links = route.slice(route.indexOf("links: ["));
  const editorial = links.indexOf("href: extremeEditorialCssUrl");
  const zenith = links.indexOf("href: extremeZenithCssUrl");
  const cinematic = links.indexOf("CINEMATIC_STYLESHEET_LINK");
  assert.ok(editorial >= 0 && zenith > editorial && cinematic > zenith);
  for (const path of ["src/routes/__root.tsx", "src/routes/world.tsx", "src/routes/rexonance-saga.tsx"])
    assert.doesNotMatch(read(path), /extremeZenith|styles-extreme-zenith/);
});

test("the struck heading lines carry their own metal (a lifted line left its parent's text clip)", () => {
  assert.equal(declaration(find(`> ${heading}`), "background"), "none");
  const line = find(`> ${heading} > .exo-line`);
  assert.equal(declaration(line, "background"), "var(--exe-gold-metal)");
  assert.equal(declaration(line, "background-clip"), "text");
  assert.equal(declaration(line, "-webkit-background-clip"), "text");
  assert.equal(declaration(line, "-webkit-text-fill-color"), "transparent");
  // The plain-ink modes reach the lines too.
  assert.equal(declaration(find(`> ${heading} > .exo-line`, "(prefers-contrast: more)"), "-webkit-text-fill-color"), "currentcolor");
  assert.equal(declaration(find(`> ${heading} > .exo-line`, "(forced-colors: active)"), "-webkit-text-fill-color"), "CanvasText");
});

test("the wordmark's 3-D copies sit on their text and the brand pill reads ink on gold", () => {
  const span = find(".exs-hero .rxs-hero-copy > h1 > span");
  assert.equal(declaration(span, "padding"), "0");
  assert.equal(declaration(span, "clip-path"), "none");
  const brand = find(".rxs-brand span");
  assert.equal(declaration(brand, "-webkit-text-fill-color"), "#080807");
});

test("the wide form switch shares one control row with its hint and live readout", () => {
  const media = "(min-width: 1024px)";
  const switcher = find("> #stages .rxs-stage-switcher", media);
  assert.equal(declaration(switcher, "grid-template-columns"), "minmax(0, 500px) minmax(48px, 1fr) auto");
  assert.equal(declaration(find("> #stages .rxs-stage-switcher > .rxs-stage-tabs.liquid-swipe-tabs", media), "grid-row"), "1 / span 2");
  assert.equal(declaration(find("> #stages .rxs-stage-switcher > .rxs-stage-hint", media), "grid-column"), "3");
  assert.equal(declaration(find("> #stages .exs-stage-status", media), "grid-column"), "3");
  assert.equal(declaration(find("> #stages #exs-stage-panel", media), "grid-column"), "1 / -1");
  const rail = find("> #stages .rxs-stage-switcher::before", media);
  assert.equal(declaration(rail, "pointer-events"), "none");
});

test("the tape's figures never run under their result plates, and the slants cut no letters", () => {
  // Tablets stack the card (figure, then the plate across it).
  const tablet = "(min-width: 681px) and (max-width: 1023px)";
  assert.equal(declaration(find("> #performance .rxs-comparison-metrics > article > header", tablet), "display"), "grid");
  assert.equal(declaration(find("> #performance .rxs-comparison-metrics .rxs-comparison-result", tablet), "width"), "100%");
  // Large phones keep the row, the figure keeps its width.
  const phone = "(min-width: 481px) and (max-width: 680px)";
  assert.equal(declaration(find("> #performance .rxs-comparison-metrics > article > header > div", phone), "flex"), "none");
  // The name in the brand does not inherit the pill's slanted cut.
  assert.equal(declaration(find(".rxs-brand b span"), "clip-path"), "none");
  // 320px: the challenger plates stand one over the other.
  assert.equal(declaration(find(".exs-opponent-options", "(max-width: 359px)"), "grid-template-columns"), "minmax(0, 1fr)");
  // 320–389px: the chapter links drop their slanted ends.
  assert.equal(declaration(find(".rxs-local-nav nav a", "(max-width: 389px)"), "clip-path"), "none");
  // The P14 dials: the unit etched small beside the number.
  assert.equal(declaration(find("> #p14 .rxs-p14-copy dd:has(> .exi-figure)"), "font-size"), "15px");
  assert.equal(declaration(find("> #p14 .rxs-p14-copy dd > .exi-figure"), "font-size"), "clamp(26px, 2.8vw, 38px)");
  // Below 1280px the dials stack across the copy column (two were 108–246px wide).
  assert.equal(
    declaration(find("> #p14 .rxs-p14-copy dl", "(min-width: 681px) and (max-width: 1279px)"), "grid-template-columns"),
    "minmax(0, 1fr)",
  );
});

test("floors: HUD labels at 12px or more, one-line titles at 320px, rings inside slanted controls", () => {
  sheet.walkDecls("font-size", (item) => {
    const px = /^(\d+(?:\.\d+)?)px$/.exec(item.value);
    if (px) assert.ok(Number(px[1]) >= 12, `${item.parent.selector}: ${item.value}`);
  });
  assert.equal(declaration(find(`> ${heading}`, "(max-width: 359px)"), "font-size"), "25px");
  const focus = rules.find((rule) => normal(rule.selector).endsWith(":focus-visible"));
  assert.ok(focus);
  assert.equal(declaration(focus, "outline-offset"), "-4px");
});

test("motion here is hover and focus only, and stands still under reduced motion", () => {
  sheet.walkDecls(/^animation/, (item) => assert.fail(`${item.parent.selector} animates`));
  let reduced = false;
  sheet.walkAtRules("media", (rule) => {
    if (normal(rule.params) !== "(prefers-reduced-motion: reduce)") return;
    rule.walkDecls("transition", (item) => {
      if (item.value === "none") reduced = true;
    });
  });
  assert.ok(reduced);
  // Lifts under the pointer only where motion is welcome.
  sheet.walkDecls("translate", (item) => {
    if (item.value === "0 1px") return; // the press under the finger
    const media = item.parent.parent;
    assert.ok(media.type === "atrule" && /prefers-reduced-motion: no-preference/.test(media.params), item.parent.selector);
  });
});
