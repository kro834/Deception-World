import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import postcss from "postcss";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const source = read("src/styles-extreme-editorial.css");
const sheet = postcss.parse(source);
const route = read("src/routes/extreme-saga.tsx");
const scope = 'html[data-family="special"] body .rxs-page.rxs-page.exs-page';
const normal = (value) => value.replace(/\s+/g, " ").trim();
const rules = [];
sheet.walkRules((rule) => rules.push(rule));
const find = (suffix, media = null) => {
  const match = rules.find((rule) => {
    if (!normal(rule.selector).endsWith(suffix)) return false;
    if (!media) return rule.parent.type === "root";
    return rule.parent.type === "atrule" && normal(rule.parent.params) === media;
  });
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

test("Extreme editorial is route-only, scoped, and follows the fightcard canvas", () => {
  assert.ok(rules.length > 100);
  for (const rule of rules) {
    for (const selector of rule.selectors) {
      assert.ok(normal(selector).startsWith(scope), selector);
    }
  }
  const links = route.slice(route.indexOf("links: ["));
  const fightcard = links.indexOf("href: extremeFightCardCssUrl");
  const editorial = links.indexOf("href: extremeEditorialCssUrl");
  const cinematic = links.indexOf("CINEMATIC_STYLESHEET_LINK");
  assert.ok(fightcard >= 0 && editorial > fightcard && cinematic > editorial);
  for (const path of [
    "src/routes/__root.tsx",
    "src/routes/world.tsx",
    "src/routes/rexonance-saga.tsx",
    "src/routes/final-stage.tsx",
    "src/routes/dream-chapter.tsx",
  ])
    assert.doesNotMatch(read(path), /extremeEditorial|styles-extreme-editorial/);
});

test("the opaque nav covers the safe area and keeps four reachable mobile chapters", () => {
  const nav = find(".rxs-local-nav");
  assert.equal(declaration(nav, "background"), "#080807");
  assert.equal(declaration(nav, "top"), "0");
  assert.equal(declaration(nav, "padding-top"), "env(safe-area-inset-top, 0px)");
  const mobile = find(".rxs-local-nav nav", "(max-width: 680px)");
  assert.equal(declaration(mobile, "display"), "grid");
  assert.equal(declaration(mobile, "grid-template-columns"), "repeat(4, minmax(0, 1fr))");
  assert.equal(declaration(mobile, "grid-column"), "1 / -1");
  const links = find(".rxs-local-nav nav a", "(max-width: 680px)");
  assert.equal(declaration(links, "min-height"), "44px");
  assert.equal(declaration(find(".rxs-local-nav nav a"), "gap"), "6px");
  // Audit #23: the shared lit line marks the chapter (a text underline broke at "02 P14").
  const current = find('.rxs-local-nav nav a[aria-current="location"]');
  assert.equal(declaration(current, "color"), "var(--ext-gold)");
  assert.equal(declaration(current, "text-decoration"), undefined);
});

test("the form canvas has a stable portrait ratio and keeps the rx14 physical limits", () => {
  const canvas = find("#exs-stage-panel > figure");
  assert.equal(declaration(canvas, "aspect-ratio"), "1022 / 1538");
  assert.equal(declaration(canvas, "height"), "auto");
  assert.equal(
    declaration(canvas, "width"),
    "min(100%, 500px, calc(1022px / var(--exf-art-density)))",
  );
  assert.equal(declaration(canvas, "max-height"), "calc(1538px / var(--exf-art-density))");
  const mobile = find("#exs-stage-panel > figure", "(max-width: 680px)");
  assert.equal(declaration(mobile, "height"), "auto");
  assert.match(declaration(mobile, "width"), /1022px \/ var\(--exf-art-density\)/);
  const image = find("#exs-stage-panel > figure > img");
  assert.equal(declaration(image, "object-fit"), "contain");
  assert.equal(declaration(image, "transform"), "none");
  assert.equal(declaration(image, "scale"), "none");
  const copy = find("#exs-stage-panel > div", "(max-width: 680px)");
  assert.equal(declaration(copy, "margin"), "0");
  // The old-form backdrop and seam retain the already audited shared canvas.
  assert.doesNotMatch(source, /background-size:\s*cover|\/\s*cover\s+no-repeat/);
  assert.doesNotMatch(source, /--exf-art-density\s*:/);
});

test("editorial introduces no perpetual or scroll-bound motion and keeps visible focus", () => {
  sheet.walkDecls((item) => {
    if (/^animation/.test(item.prop)) assert.equal(item.value, "none");
    assert.notEqual(item.value, "infinite");
    assert.notEqual(item.prop, "view-timeline");
    assert.notEqual(item.prop, "scroll-timeline");
  });
  const focus = find(":is(a, button, summary):focus-visible");
  assert.equal(declaration(focus, "outline"), "2px solid #ffe1a1");
  assert.equal(declaration(focus, "outline-offset"), "4px");
  assert.equal(
    declaration(find('.exs-opponent-options button[aria-pressed="true"]'), "box-shadow"),
    "inset 0 -2px 0 var(--ext-gold)",
  );
  assert.match(source, /@media \(forced-colors: active\)/);
});

test("functional copy stays at least 12px and live status has its own layout row", () => {
  for (const selector of [
    // (The hero caption went with the poster opening: owner, 2026-10-12.)
    ".exs-chapter-index em",
    ".exs-opponent-label",
    ".exs-catalog-details > summary small",
    ".exs-stage-status",
    ".exs-form-facts dt",
  ]) {
    const rule = find(selector);
    const font = declaration(rule, "font") || declaration(rule, "font-size");
    assert.ok(Number(font.match(/([\d.]+)px/)[1]) >= 12, `${selector}: ${font}`);
  }
  assert.equal(declaration(find(".exs-stage-status"), "grid-row"), "3");
  assert.equal(declaration(find("#exs-stage-panel"), "grid-row"), "4");
  assert.doesNotMatch(source, /font(?:-size)?:[^;]*\b(?:9|10|11)px[^;]*var\(--dx-body\)/);
});

test("320px and 390px comparison values occupy separate rows without shrinking their type", () => {
  const media = "(max-width: 480px)";
  const header = find(".rxs-comparison-metrics > article > header", media);
  assert.equal(declaration(header, "display"), "grid");
  assert.equal(declaration(header, "grid-template-columns"), "minmax(0, 1fr)");
  assert.equal(declaration(header, "row-gap"), "16px");
  const result = find(".rxs-comparison-metrics .rxs-comparison-result", media);
  assert.equal(declaration(result, "grid-template-columns"), "auto minmax(0, 1fr)");
  assert.equal(declaration(result, "margin"), "0");
  assert.equal(declaration(result, "text-align"), "start");
  assert.equal(
    declaration(find(".rxs-comparison-metrics .rxs-comparison-result > em", media), "grid-column"),
    "1 / -1",
  );
  const current = find(
    ".rxs-comparison-metrics > article > header > div > strong",
    "(max-width: 680px)",
  );
  assert.equal(declaration(current, "font-size"), "25px");
  assert.equal(
    declaration(
      find(".rxs-comparison-metrics .rxs-comparison-result > b", "(max-width: 680px)"),
      "font-size",
    ),
    "29px",
  );
  // No narrower breakpoint may quietly reduce the numbers to make them fit.
  for (const rule of rules) {
    if (rule.parent.type !== "atrule" || !/max-width: (?:359|480)px/.test(rule.parent.params))
      continue;
    if (/rxs-comparison/.test(rule.selector))
      assert.equal(declaration(rule, "font-size"), undefined);
  }
});

test("KOSMOS Ultra readouts stay above core rays, separate figures from units, and keep padded spec plates", () => {
  const p14Copy = find("> #p14 .rxs-p14-copy");
  const p14Figure = find("> #p14 .rxs-p14-overview figure");
  assert.equal(declaration(p14Copy, "position"), "relative");
  assert.equal(declaration(p14Copy, "z-index"), "2");
  assert.equal(declaration(p14Figure, "z-index"), "1");
  const p14Value = find("> #p14 .rxs-p14-copy dd");
  assert.equal(declaration(p14Value, "color"), "#fff8ea");
  assert.equal(declaration(p14Value, "font-variant-numeric"), "tabular-nums");
  const p14FigureSpan = find("> #p14 .rxs-p14-copy dd > .exi-figure");
  assert.equal(declaration(p14FigureSpan, "margin-right"), "0.28em");
  const specsCard = find("> #system .rxs-specs > .rxs-spec-group");
  assert.equal(declaration(specsCard, "z-index"), "2");
  assert.match(declaration(specsCard, "padding"), /clamp\(24px/);
  const specsDd = find("> #system .rxs-specs > .rxs-spec-group dd");
  assert.equal(declaration(specsDd, "color"), "#fffaf0");
  assert.equal(declaration(specsDd, "font-variant-numeric"), "tabular-nums");
  assert.equal(declaration(specsDd, "gap"), "0.28em");
  const mobileSpecs = find("> #system .rxs-specs > .rxs-spec-group", "(max-width: 680px)");
  assert.equal(declaration(mobileSpecs, "padding"), "22px 18px");
  const scrollCueSpan = find("> .exs-hero .rxs-scroll-cue > span");
  assert.equal(declaration(scrollCueSpan, "display"), "inline-flex");
  const secondMeter = find("#performance .exi-stage > article:nth-child(2)::after");
  assert.equal(declaration(secondMeter, "grid-row"), "3");
});


