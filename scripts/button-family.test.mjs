// One button family (2026-11-26 brush-up, package G; coordinator's default,
// decision 5): the prism primary on World, the chrome and the opening's
// ENTER (gold in the gallery family, src/styles-ring.css), 44px compact and
// 52px hero, and the primaries keep their fill under the optional glass.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (file) => readFileSync(new URL("../" + file, import.meta.url), "utf8");
const strip = (css) => css.replace(/\/\*[\s\S]*?\*\//g, "");
const opening = strip(read("src/styles-opening-ring.css"));
const home = strip(read("src/styles-ring-home.css"));
const glass = strip(read("src/styles-liquid-glass.css"));

test("the opening's ENTER is the prism primary at the hero height; もう一度 matches its height", () => {
  assert.match(
    opening,
    /\.cine-replay-slot > \.cine-btn:not\(#opr\) \{\s*min-height: var\(--dw-btn-h-hero, 52px\);/,
  );
  assert.match(
    opening,
    /\.cine-replay-slot > \.cine-btn-primary:not\(#opr\) \{\s*color: var\(--dw-btn-primary-ink, #061423\);\s*background: var\(\s*--dw-btn-primary-fill,/,
  );
  assert.doesNotMatch(opening, /#494840/, "the greige plate is gone");
  // The tagline: 12px and more, at 0.7 of its light.
  assert.match(
    opening,
    /\.cine-title-caption:not\(#opr\) \{\s*font-size: clamp\(12px, 0\.85vw, 13px\);\s*color: rgb\(216 227 237 \/ 0\.7\);/,
  );
});

test("the dashboard's door, sigil and title speak the same grammar", () => {
  assert.match(
    home,
    /\.command-deck \.command-deck-enter\.command-deck-enter \{\s*background: var\(\s*--dw-btn-primary-fill,/,
  );
  assert.match(
    home,
    /\.command-deck \.command-deck-enter\.command-deck-enter \{\s*min-height: var\(--dw-btn-h-hero, 52px\);/,
  );
  assert.match(
    home,
    /\.command-deck-brand-mark\.command-deck-brand-mark \{[^}]*width: var\(--dw-header-mark, 44px\);[^}]*font-size: calc\(var\(--dw-header-mark, 44px\) \* 0\.22\);/,
  );
  assert.match(home, /\.command-deck\[data-scene="world"\] \.command-deck-title h1 > span \{/);
});

test("under the glass the primaries keep the prism as the glass's base layer", () => {
  const start = glass.indexOf(".cine-btn.cine-btn-primary.cine-btn-primary,");
  assert.ok(start > 0);
  const rule = glass.slice(start, glass.indexOf("}", start));
  assert.match(rule, /\.command-deck \.command-deck-enter\.command-deck-enter,/);
  assert.match(rule, /\.primary-action\.primary-action\.primary-action/);
  assert.match(rule, /--lg-fill: linear-gradient\(\s*112deg,/);
  // After the opening's cream rule and the milky filled plates, so it wins.
  assert.ok(start > glass.indexOf("--lg-fill: rgb(243 236 222 / 0.78);"));
  assert.ok(start > glass.indexOf("--lg-fill: rgb(236 246 249 / 0.74);"));
});
