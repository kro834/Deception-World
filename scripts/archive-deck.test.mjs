// rx8: the Form Archive's Deck edition — portrait chips, the desktop select
// deck, the backdrop hero and the facing analyzer.
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import { archiveForms, thumbMapSource } from "./build-archive-thumbs.mjs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const deck = read("public/archive-deck.css");

test("both archives link the deck sheet last, after the armour layer", () => {
  for (const archive of ["saga", "realm"]) {
    for (const source of [
      read(`archives/${archive}-form-archive-standalone.html`),
      read(`public/${archive}-form-archive-embedded.html`),
    ]) {
      const armour = source.indexOf("/archive-armour.css?v=");
      const sheet = source.indexOf("/archive-deck.css?v=20261010-deck");
      assert.ok(armour > 0 && sheet > armour, archive);
      assert.ok(source.indexOf("/archive-elevation.css?v=20261006-elev4") < armour, archive);
    }
  }
});

test("every form chip has its portrait, and the map is current", () => {
  const forms = archiveForms();
  assert.equal(forms.filter((form) => form.archive === "saga").length, 17);
  assert.equal(forms.filter((form) => form.archive === "realm").length, 9);
  for (const { thumb } of forms)
    assert.ok(existsSync(new URL(`../public${thumb}`, import.meta.url)), thumb);
  // Regenerate with `node scripts/build-archive-thumbs.mjs` after an archive edit.
  assert.ok(deck.includes(thumbMapSource(forms)));
});

test("the deck is layout and paint only, and answers forced colours", () => {
  assert.doesNotMatch(deck, /@keyframes|animation|transition|infinite|setInterval/);
  assert.match(deck, /@media \(forced-colors: active\)/);
  // The selected chip keeps its plate colour under the portrait (the
  // search verify reads it).
  assert.equal((deck.match(/background-color: #142e3b !important/g) ?? []).length, 3);
  // The desktop deck: the console leaves the sticky column.
  assert.match(
    deck,
    /@media \(min-width: 1181px\)[\s\S]*?grid-template-columns: minmax\(0, 1fr\) !important;/,
  );
  assert.match(
    deck,
    /\.selector-console \{\s*position: relative !important;\s*top: auto !important;/,
  );
  // Card names keep the site's 12px floor.
  for (const [, size] of deck.matchAll(/font-size: (\d+)px/g)) assert.ok(Number(size) >= 12, size);
});
