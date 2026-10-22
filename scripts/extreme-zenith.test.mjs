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
  // The catalog: closes in two columns on wide screens, one list a row on phones.
  const catalog = "> #performance .exs-catalog-details .rxs-processing-comparison";
  assert.equal(declaration(find(catalog, "(min-width: 1100px)"), "grid-template-columns"), "repeat(2, minmax(0, 1fr))");
  assert.equal(declaration(find(`${catalog} > p`, "(min-width: 1100px)"), "grid-column"), "1");
  assert.equal(declaration(find(`${catalog} > .exs-unavailable`, "(min-width: 1100px)"), "grid-column"), "2");
  assert.equal(declaration(find(`${catalog} > div`, "(max-width: 680px)"), "grid-template-columns"), "minmax(0, 1fr)");
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

test("review fixes: equal ROUND 1 cards, whole chapter plates, gold-door ring, uncapped verdict", () => {
  // Both stage cards fill their column (the punch card had shrunk to its figure).
  const card = find("#performance .exi-stage > article");
  assert.equal(declaration(card, "justify-self"), "stretch");
  assert.equal(declaration(card, "justify-items"), "start");
  // Phones: the plate spans the card; below 360px the four bouts stand one a row.
  assert.equal(declaration(find("> .exs-chapter-index small", "(max-width: 480px)"), "grid-column"), "1 / -1");
  assert.equal(declaration(find("> .exs-chapter-index small", "(max-width: 480px)"), "white-space"), "nowrap");
  assert.equal(declaration(find("> .exs-chapter-index", "(max-width: 359px)"), "grid-template-columns"), "minmax(0, 1fr)");
  // The footer doors paint the ring in their slanted shape; the gold door's is ink.
  assert.equal(declaration(find("> .rxs-footer > a:first-of-type"), "--exz-ring"), "#080807");
  const ring = find("> .rxs-footer > a:focus-visible::after");
  assert.equal(declaration(ring, "background"), "var(--exz-ring)");
  assert.match(declaration(ring, "clip-path"), /^polygon\( ?evenodd/);
  assert.equal(declaration(find("> .rxs-footer > a:focus-visible::after", "(forced-colors: active)"), "content"), "none");
  // The verdict runs the console's measure at every width, as its notes do.
  const verdict = rules.find(
    (rule) =>
      mediaOf(rule) === null &&
      rule.selectors.some((selector) => normal(selector).endsWith("> #performance .exs-catalog-details .rxs-processing-comparison > p")) &&
      declaration(rule, "max-width") === "none",
  );
  assert.ok(verdict, "the verdict is uncapped outside the wide media query");
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

// Round 2 (2026-10-22).
test("round 2: forced-colour figures and plates, the phone eyebrow, the door ring tied to the door", () => {
  const forced = "(forced-colors: active)";
  // Chrome's text backplate: the big figures draw in CanvasText without one,
  // so their tall runs no longer cover the labels beside them.
  const figure = find(".exi-figure > .exi-real", forced);
  assert.equal(declaration(figure, "forced-color-adjust"), "none");
  assert.equal(declaration(figure, "color"), "CanvasText");
  assert.equal(declaration(figure, "-webkit-text-fill-color"), "CanvasText");
  // Selected plates keep HighlightText on Highlight, without the backplate.
  const adjusted = (suffix) =>
    rules.some(
      (rule) =>
        mediaOf(rule) === forced &&
        rule.selectors.some((selector) => normal(selector).endsWith(suffix)) &&
        declaration(rule, "forced-color-adjust") === "none",
    );
  assert.ok(adjusted('a[aria-current="location"] > span'), "the chapter in view");
  assert.ok(adjusted(".rxs-brand > span"), "the pill");
  const pressed = find('.exs-opponent-options button[aria-pressed="true"]', forced);
  assert.equal(declaration(pressed, "forced-color-adjust"), "none");
  assert.equal(declaration(pressed, "background"), "Highlight");
  assert.equal(declaration(find("> #system .rxs-specs > .exo-joint", forced), "border-color"), "CanvasText");
  // The two-line phone eyebrow has room between its lines.
  assert.equal(declaration(find(".exs-hero .rxs-hero-copy > p:first-child", "(max-width: 760px)"), "line-height"), "1.45");
  // The painted ring's slant offsets are measured for a 56px door cut 14px
  // (every door is 56px tall at 320-1920 in Chrome and WebKit). If the door
  // changes, recompute the ring's points with it.
  const editorial = read("src/styles-extreme-editorial.css");
  const door = editorial.slice(editorial.indexOf("> .rxs-footer > a.rxs-footer-return {"));
  assert.match(door.slice(0, 400), /min-height: 56px;/);
  assert.match(door.slice(0, 400), /clip-path: polygon\(0 0, 100% 0, calc\(100% - 14px\) 100%, 0 100%\);/);
  const ring = declaration(find("> .rxs-footer > a:focus-visible::after"), "clip-path");
  for (const point of ["calc(100% - 15.6px) calc(100% - 2px)", "calc(100% - 17.1px) calc(100% - 4px)"])
    assert.ok(ring.includes(point), point);
});
