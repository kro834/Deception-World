import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (file) => readFileSync(new URL(`../src/${file}`, import.meta.url), "utf8");
const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, "");
// The body of the first rule whose selector ends with `selector`.
const rule = (css, selector) => {
  const start = css.indexOf(`${selector} {`);
  assert.ok(start >= 0, selector);
  return css.slice(css.indexOf("{", start) + 1, css.indexOf("}", start));
};
// The text of the @media block that opens with `query`.
const mediaBlock = (css, query) => {
  const start = css.indexOf(`@media ${query} {`);
  assert.ok(start >= 0, query);
  let depth = 0;
  for (let index = css.indexOf("{", start); index < css.length; index += 1) {
    if (css[index] === "{") depth += 1;
    if (css[index] === "}") depth -= 1;
    if (depth === 0) return css.slice(start, index + 1);
  }
  throw new Error(`unclosed ${query}`);
};

test("the hero title is capped by the viewport height on landscape screens", () => {
  const css = stripComments(read("styles-world-programme.css"));
  const block = mediaBlock(css, "(min-width: 761px) and (orientation: landscape)");
  assert.match(
    rule(block, ".site-shell.film-edition .film-hero-identity .anime-work-title b"),
    /font-size: clamp\(64px, min\(11vw, 15svh\), 168px\);/,
  );
  // Same selector as the base rule, so it must come after it to win.
  assert.ok(
    css.indexOf("@media (min-width: 761px) and (orientation: landscape)") >
      css.indexOf(".site-shell.film-edition .film-hero-identity .anime-work-title b {"),
  );
});

test("portrait tablets keep a one-row topbar", () => {
  const css = read("styles-cinematic-edition.css");
  const block = mediaBlock(
    css,
    "(min-width: 761px) and (max-width: 840px) and (min-height: 561px)",
  );
  assert.match(block, /\.topbar \{ grid-template-columns: auto minmax\(0, 1fr\) 48px !important;/);
  assert.match(block, /min-height: 76px;/);
  assert.match(block, /\.topbar nav \{ grid-column: 2; grid-row: 1;/);
  assert.match(block, /\.topbar-actions \{ grid-column: 3 !important; grid-row: 1; \}/);
});

test("the rider heading fits its column and never breaks inside a word", () => {
  const css = stripComments(read("styles-film-direction.css"));
  assert.match(rule(css, ".film-edition .rider-copy-block"), /container-type: inline-size;/);
  assert.match(
    rule(css, ".film-edition .rider-detail h3"),
    /font-size: min\(clamp\(32px, 4vw, 54px\), 13\.5cqi\);/,
  );
  assert.match(
    css,
    /\.film-edition \.rider-detail h3 \.rider-name-line,\s*\.film-edition \.rider-line b \{\s*white-space: nowrap;/,
  );
});

test("the selected rider number is lifted to near-white on the lit lens", () => {
  const css = read("styles-world-programme-sections.css");
  assert.match(
    rule(css, '.site-shell.film-edition .rider-tabs button[aria-selected="true"] small'),
    /color: color-mix\(in srgb, var\(--tab-tone\) 5%, #fff\);/,
  );
  // Inactive numbers keep their tone.
  assert.match(
    rule(css, ".site-shell.film-edition .rider-tabs small"),
    /color: color-mix\(in srgb, var\(--tab-tone\) 58%, #fff\);/,
  );
});

test("the tablet rider rail is two rows of four, and hover is mouse-only and colour-only", () => {
  const css = read("styles-frosted-controls.css");
  const tablet = mediaBlock(css, "(min-width: 561px) and (max-width: 840px)");
  assert.match(tablet, /grid-template-columns: repeat\(4, minmax\(0, 1fr\)\);/);
  assert.doesNotMatch(tablet, /touch-action/);
  const hover = mediaBlock(css, "(hover: hover) and (pointer: fine)");
  assert.match(
    hover,
    /\.rider-tabs > button\[role="tab"\]:not\(\[aria-selected="true"\]\):hover \{/,
  );
  for (const property of hover.matchAll(/^\s*([\w-]+):/gm)) {
    assert.ok(["background", "border-color", "color"].includes(property[1]), property[1]);
  }
});

test("tablet rider art gets a portrait box and phones label the records count", () => {
  const css = read("styles-world/09.css");
  const tablet = mediaBlock(css, "(min-width: 561px) and (max-width: 840px)");
  assert.match(tablet, /\.rider-visual \{\s*height: clamp\(430px, 88vw, 680px\);/);
  const phone = mediaBlock(css, "(max-width: 560px)");
  assert.match(phone, /\.episode-archive-meta p span \{\s*display: block;/);
  // Narrower than 380 px the label would push the pager past the panel.
  assert.match(
    phone,
    /@media \(max-width: 379px\) \{\s*\.episode-archive-meta p span \{\s*display: none;/,
  );
});

test("the rider tabs step with Up/Down as well, other rails stay horizontal", () => {
  const boot = read("lib/liquid/boot.js");
  const start = boot.indexOf("on(root, 'keydown', (e) => {");
  assert.ok(start > 0);
  const handler = boot.slice(start, boot.indexOf("});", start));
  assert.match(
    handler,
    /e\.key === 'ArrowRight' \|\| \(holdToDrag && e\.key === 'ArrowDown'\)\) next = \(current \+ 1\) % list\.length;/,
  );
  assert.match(
    handler,
    /e\.key === 'ArrowLeft' \|\| \(holdToDrag && e\.key === 'ArrowUp'\)\) next = \(current - 1 \+ list\.length\) % list\.length;/,
  );
  // The page must not scroll under a handled key.
  assert.match(handler, /else return;\s*e\.preventDefault\(\);/);
  assert.match(boot, /const holdToDrag = root\.classList\.contains\('rider-tabs'\);/);
});

test("Mirage: the dive's key visual is not projected again, and archive cards stay clear", () => {
  const css = stripComments(read("styles-world-mirage.css"));
  const projector = css.match(/([^{}]+)\{\s*animation: mr-project [^}]*\}/)?.[1] ?? "";
  assert.match(
    projector,
    /:not\(\[data-mirage-boot="done"\]\):not\(\s*\[data-mirage-boot="hud"\]\s*\)/,
  );
  const chip = rule(css, ".site-shell.film-edition.mirage-edition .other-card-code");
  assert.match(chip, /writing-mode: vertical-rl;/);
  assert.match(chip, /left: 0;/);
  assert.match(chip, /line-height: 1;/);
  assert.match(
    rule(css, ".site-shell.film-edition.mirage-edition .manager-slot-grid .other-card-copy"),
    /left: 26px;/,
  );
  // The form name never ends in an ellipsis, at any width (the first rule for
  // it is the unconditional one); narrow cards only tighten the tracking.
  assert.match(
    rule(css, ".site-shell.film-edition.mirage-edition .manager-slot-grid .other-card-copy i"),
    /overflow: visible;\s*text-overflow: clip;\s*white-space: normal;/,
  );
  assert.match(
    mediaBlock(css, "(max-width: 1279px)"),
    /\.manager-slot-grid \.other-card-copy :is\(small, i\) \{\s*letter-spacing: 0\.04em;/,
  );
  // The arrow badge keeps its base position now that no chip sits under it.
  assert.doesNotMatch(css, /\.other-archive-card::after \{\s*top:/);
  assert.match(
    rule(css, ".site-shell.film-edition.mirage-edition .other-artwork-card::after"),
    /background-image: url\("data:image\/svg\+xml,[^"]*M9 4H4v5M15 4h5v5M9 20H4v-5M15 20h5v-5/,
  );
  assert.match(
    rule(css, ".site-shell.film-edition.mirage-edition .archive-placeholder"),
    /border-radius: 0;/,
  );
  assert.match(
    rule(css, ".site-shell.film-edition.mirage-edition .world-column-content"),
    /border-color: transparent;\s*background: none;\s*box-shadow: none;/,
  );
  for (const [selector, colour] of [
    [".dante-copy i", /rgb\(255 138 165 \/ 90%\)/],
    [".archive-placeholder.is-unmanaged", /rgb\(255 112 136 \/ 82%\)/],
    [".archive-placeholder.is-other", /rgb\(105 223 116 \/ 65%\)/],
  ]) {
    assert.match(rule(css, `.site-shell.film-edition.mirage-edition ${selector}`), colour);
  }
  // Landscape phones keep the codes on one line too, without the portrait
  // rail's narrower padding.
  const tabs = mediaBlock(
    css,
    "(min-width: 350px) and (max-width: 560px), (max-height: 560px) and (orientation: landscape)",
  );
  assert.match(tabs, /\.manager-archive-tabs button small \{\s*white-space: nowrap;/);
  assert.doesNotMatch(tabs, /padding/);
  assert.match(
    mediaBlock(css, "(min-width: 350px) and (max-width: 560px)"),
    /\.manager-archive-tabs button\[role="tab"\] \{\s*padding-inline: 4px;/,
  );
});
