import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

/* The character files in the World page's projection grammar
   (src/styles-dossier-edition.css). A re-skin only: the sheet adds no text,
   leaves the sovereign file (Zeus) to its own design, and its motion is
   scroll-linked, finite and gated. */

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const stripComments = (source) => source.replace(/\/\*[\s\S]*?\*\//g, "");
const SCOPE = "main.manager-page:not(.is-sovereign)";
// Top-level selector list items (commas inside :is() and :not() stay put).
const splitSelector = (selector) => {
  const parts = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < selector.length; i += 1) {
    if (selector[i] === "(") depth += 1;
    else if (selector[i] === ")") depth -= 1;
    else if (selector[i] === "," && depth === 0) {
      parts.push(selector.slice(start, i));
      start = i + 1;
    }
  }
  return [...parts, selector.slice(start)];
};

test("every dossier route but the sovereign file loads the dossier sheets", async () => {
  const head = await read("src/lib/world-head.ts");
  const links = head.slice(head.indexOf("export const DOSSIER_STYLESHEET_LINKS"));
  const order = [
    "...WORLD_STYLESHEET_LINKS",
    "href: DOSSIER_HUD_FONTS_URL",
    "href: dossierEditionCssUrl",
  ].map((needle) => links.indexOf(needle));
  assert.ok(order[0] > 0, String(order));
  assert.deepEqual([...order].sort((a, b) => a - b), order);
  assert.match(head, /import dossierEditionCssUrl from "@\/styles-dossier-edition\.css\?url";/);
  // The same HUD subset as /world, so a file opened from there reuses it.
  const world = await read("src/routes/world.tsx");
  const worldFonts = world.match(/MIRAGE_FONTS_URL =\s*"([^"]+)"/)?.[1];
  const dossierFonts = head.match(/DOSSIER_HUD_FONTS_URL =\s*"([^"]+)"/)?.[1];
  assert.ok(worldFonts);
  assert.equal(dossierFonts, worldFonts);
  // Both rider heads, known id or not.
  const rider = head.slice(head.indexOf("export function createRiderHead"));
  assert.equal(rider.match(/stylesheetLinks: DOSSIER_STYLESHEET_LINKS/g)?.length, 2);

  for (const name of ["lejas", "opus", "reemu", "rex-loi", "shuza"]) {
    const route = await read(`src/routes/managers/${name}.tsx`);
    assert.match(route, /createWorldHead/, name);
    assert.match(route, /stylesheetLinks: DOSSIER_STYLESHEET_LINKS,/, name);
  }
  for (const name of ["luna", "terra"]) {
    const route = await read(`src/routes/characters/${name}.tsx`);
    assert.match(route, /stylesheetLinks: DOSSIER_STYLESHEET_LINKS,/, name);
  }
  // Page sheets keep their colours by loading after the dossier sheets.
  assert.match(
    await read("src/routes/characters/ciel.tsx"),
    /\[\.\.\.DOSSIER_STYLESHEET_LINKS, \{ rel: "stylesheet", href: cielCssUrl \}\]/,
  );
  assert.match(
    await read("src/routes/characters/dante.tsx"),
    /\[\.\.\.DOSSIER_STYLESHEET_LINKS, \{ rel: "stylesheet", href: danteCss \}\]/,
  );
  assert.doesNotMatch(await read("src/routes/managers/zeus.tsx"), /DOSSIER_STYLESHEET_LINKS/);
});

test("the sheet re-skins the files only: scoped, no text, the shared radius overridden", async () => {
  const css = stripComments(await read("src/styles-dossier-edition.css"));
  for (const [, selector] of css.matchAll(/(?:^|[{};])\s*([^{}@;]+)\{/g)) {
    if (/^\s*(from|to|\d+%)\s*$/.test(selector)) continue;
    for (const part of splitSelector(selector)) {
      assert.ok(part.includes(SCOPE), part.trim());
    }
  }
  for (const [, value] of css.matchAll(/content:\s*([^;]+);/g)) {
    assert.equal(value.trim(), '""');
  }
  // The pinned default stays in the reader sheet; this sheet overrides it.
  assert.match(css, /main\.manager-page:not\(\.is-sovereign\) \{\s*--dossier-radius: 4px;/);
  assert.match(
    await read("src/styles-dossier-reader.css"),
    /main\.manager-page \{\s*--dossier-radius: 12px;\s*\}/,
  );
  // The Rexonance pickup keeps its own ornaments.
  assert.match(css, /\.form-pickup:not\(\.is-rexonance-pickup\)\s*\.form-pickup-card::after/);
  // Forced colours get real ink for the chrome name and the outlined numerals.
  const forced = css.slice(css.indexOf("@media (forced-colors: active)"));
  assert.match(forced, /\.manager-display-name \{[^}]*color: CanvasText;[^}]*background: none;/);
  assert.match(forced, /-webkit-text-stroke: 0;/);
});

test("motion is scroll-linked, finite, compositor-only and gated", async () => {
  const css = stripComments(await read("src/styles-dossier-edition.css"));
  const gate = css.indexOf("@supports (animation-timeline: view())");
  assert.ok(gate > 0);
  assert.match(css.slice(gate), /^@supports[^{]*\{\s*@media \(prefers-reduced-motion: no-preference\)/);
  assert.doesNotMatch(css.slice(0, gate), /animation/);
  const motion = css.slice(gate, css.indexOf("@keyframes"));
  const rules = [...motion.matchAll(/([^{}]+)\{([^{}]*animation:[^{}]*)\}/g)];
  assert.ok(rules.length >= 3);
  for (const [, selector, body] of rules) {
    for (const part of splitSelector(selector)) {
      assert.match(
        part,
        /html:not\(\[data-world-effects="economy"\]\):not\(\[data-side-menu-open\]\):not\(\[data-loading\]\):not\(\s*\[data-dialog-open\]\s*\)/,
      );
    }
    assert.match(body, /animation-timeline: view\(block\);/);
    assert.doesNotMatch(body, /infinite/);
  }
  for (const [, frames] of css.matchAll(/@keyframes [\w-]+ \{([\s\S]*?)\n\}/g)) {
    for (const [, property] of frames.matchAll(/([a-z-]+):/g)) {
      assert.ok(["opacity", "scale", "translate"].includes(property), property);
    }
  }
});
