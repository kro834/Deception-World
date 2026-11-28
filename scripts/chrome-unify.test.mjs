// One header grammar (2026-11-26 brush-up, package G; owner: every page shares
// one header layout and one menu button, the gallery keeps only its gold).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (file) => readFileSync(new URL("../" + file, import.meta.url), "utf8");
const unify = read("src/styles-chrome-unify.css");
const root = read("src/routes/__root.tsx");
const rules = unify.replace(/\/\*[\s\S]*?\*\//g, "");

test("the header grammar sheet is linked after the spectrum, off the title", () => {
  assert.match(root, /import chromeUnifyCss from "\.\.\/styles-chrome-unify\.css\?url";/);
  assert.match(
    root,
    /\{ rel: "stylesheet", href: futureSpectrumCss \},[\s\S]{0,240}\{ rel: "stylesheet", href: chromeUnifyCss \},/,
  );
});

test("every bar's DW mark takes the shared diameter with its glyph inside the ring", () => {
  for (const mark of [
    /\.brand\s*> \.brand-sigil\.brand-sigil\.brand-sigil \{[^}]*width: var\(--dw-header-mark\);[^}]*height: var\(--dw-header-mark\);/,
    /a\.search-brand\s*\)::before \{[^}]*width: var\(--dw-header-mark\);[^}]*border-radius: 50%;/,
    /\.rxs-brand\.rxs-brand::before \{[^}]*width: var\(--dw-header-mark\);[^}]*height: var\(--dw-header-mark\);/,
    /\.rxs-brand\.rxs-brand::after \{[^}]*width: var\(--dw-header-mark\);[^}]*font-size: calc\(var\(--dw-header-mark\) \* 0\.22\);/,
    /\.brand-mark\.brand-mark \{[^}]*width: var\(--dw-header-mark\);[^}]*border-radius: 50%;/,
  ]) {
    assert.match(rules, mark);
  }
  // The name clears the larger ring on the special sites.
  assert.match(
    rules,
    /\.rxs-brand\.rxs-brand \{\s*padding-left: calc\(var\(--dw-header-mark\) \+ 12px\);/,
  );
});

test("the gallery, tours, lab and world map gain the same ring; the gallery's is gold", () => {
  for (const host of ["a.gallery-brand", ".lab-topbar > a:first-child", "a.wm-back"]) {
    assert.ok(unify.includes(host), host);
  }
  assert.match(rules, /\)::before \{\s*content: "DW";\s*content: "DW" \/ "";/);
  assert.match(rules, /a\.gallery-brand::before \{[^}]*color: var\(--dw-gold\);/);
});

test("the gallery family's trigger draws the shared four cells, not three bars", () => {
  assert.match(
    rules,
    /html\[data-family="gallery"\][^{]*\.side-panel-trigger-glyph\.side-panel-trigger-glyph \{[^}]*display: grid;[^}]*grid-template-columns: repeat\(2, 7px\);/,
  );
  assert.match(
    rules,
    /glyph\.side-panel-trigger-glyph::after \{[^}]*background: var\(--ring-gold\);/,
  );
});

test("the shared bars draw no lit seam on the left edge", () => {
  for (const file of [
    "src/styles-stage-shell.css",
    "src/styles-command-chrome.css",
    "src/styles-future-spectrum.css",
  ]) {
    assert.doesNotMatch(read(file), /0 3px, transparent 3px/, file);
  }
});

test("the iPad portrait menu starts its rows under the head, not at the screen's foot", () => {
  const ring = read("src/styles-ring-chrome.css");
  const block = ring.slice(
    ring.lastIndexOf("@media (min-width: 640px) and (max-width: 1019px) and (min-height: 561px) {"),
  );
  assert.match(block, /grid-template-rows: 76px auto auto minmax\(0, 1fr\);/);
  assert.match(block, /> \.side-panel-group \{\s*align-self: start;/);
  // The dial keeps its size there, so the longest list clears its plate.
  assert.doesNotMatch(block, /--orbit-(r|disc):/);
});

test("the bars' context links share the compact button height and the pill", () => {
  assert.match(
    rules,
    /a\.world-return-link\s*\) \{\s*box-sizing: border-box;\s*min-height: var\(--dw-btn-h\);\s*height: var\(--dw-btn-h\);\s*border-radius: var\(--dw-r-pill\);/,
  );
});

test("the grammar sheet is paint and box only", () => {
  assert.doesNotMatch(rules, /animation|transition|@keyframes|backdrop-filter|filter:\s*blur/);
});

test("/exhibition renders the gallery family's header: the gold ring, the pill and the dots menu", () => {
  const route = read("src/routes/exhibition.tsx");
  const bar = read("src/components/exhibition/exhibition-bar.tsx");
  const barCss = read("src/styles-exhibition-bar.css").replace(/\/\*[\s\S]*?\*\//g, "");
  // The bar is the gallery's header.gallery-topbar inside a .gallery-page, so the grammar's
  // selectors (the gold ring, the pill, the iPad launcher) reach it without a copy.
  assert.match(
    route,
    /<div className="gallery-page exhibition-page">\s*<ExhibitionBar \/>\s*<main/,
  );
  assert.match(bar, /<header className="gallery-topbar">/);
  assert.match(bar, /<Link className="gallery-brand" to="\/world">/);
  assert.match(bar, /<Link to="\/gallery">/);
  assert.match(bar, /<SideMenuTrigger open=\{menuOpen\} onOpenChange=\{setMenuOpen\} \/>/);
  assert.match(
    bar,
    /<SideMenuLayer context="gallery" open=\{menuOpen\} onOpenChange=\{setMenuOpen\} \/>/,
  );
  // The box sheet follows the ring sheet and gives the room its top offset under the bar.
  assert.match(
    route,
    /href: ringGalleryCssUrl \},[\s\S]{0,200}\{ rel: "stylesheet", href: barCssUrl \},/,
  );
  assert.match(barCss, /\.exhibition-page > header\.gallery-topbar \{[^}]*position: fixed;/);
  assert.match(barCss, /var\(--dw-header-h, var\(--sh-bar-h, 64px\)\)/);
  assert.match(
    barCss,
    /main\.exhibition-room\.exhibition-room-curated \{\s*padding-top: calc\(\s*var\(--exhibition-bar\)/,
  );
  // The halo's sideways clip (f826b7e) stays, and the bar sheet is paint and box only.
  assert.match(
    read("src/styles-ring-gallery.css"),
    /html\[data-family="gallery"\] body main\.exhibition-room \{\s*overflow-x: clip;/,
  );
  assert.doesNotMatch(barCss, /animation|transition|@keyframes|backdrop-filter|filter:\s*blur/);
  // The iPad launcher and the viewport edge follow the bar: /exhibition is a gallery chrome route.
  assert.match(
    read("src/lib/viewport-chrome.js"),
    /case "\/gallery-tours":[\s\S]{0,200}case "\/exhibition":\s*return "gallery";/,
  );
});
