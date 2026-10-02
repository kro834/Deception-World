import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const css = readFileSync(new URL("../public/archive-elevation.css", import.meta.url), "utf8");
const root =
  "html[data-embedded-archive] :is(#saga-forms-performance-v5, #edition-panel-realm #realm--saga-forms-performance-v5)";
const rule = (selector) => {
  const start = css.indexOf(`${root} ${selector} {`);
  assert.ok(start >= 0, `missing ${selector}`);
  return css.slice(start, css.indexOf("}", start));
};

test("archive selection has a static check, distinct from focus and the unselected arrow", () => {
  assert.match(rule(".chip-mark"), /display: grid !important/);
  assert.match(rule(".chip-mark"), /width: 16px !important/);
  assert.match(rule(".chip-mark::after"), /border-right: 1\.5px solid currentColor/);
  assert.match(
    rule(".form-chip.is-selected .chip-mark::after"),
    /border-left: 2px solid currentColor/,
  );
  assert.match(
    rule(".form-chip.is-selected .chip-mark::after"),
    /border-bottom: 2px solid currentColor/,
  );
  assert.match(rule(".form-chip.is-selected"), /background: #142e3b !important/);
});

test("archive search retains a single native-input clear affordance and a touch-sized empty-state action", () => {
  assert.match(rule(".selector-search input::-webkit-search-cancel-button"), /display: none/);
  assert.match(rule(".selector-empty-reset"), /min-height: 44px/);
  assert.match(rule(".selector-empty"), /color: var\(--ar-text-2\)/);
  assert.match(rule(".selector-empty p"), /line-height: 1\.6/);
});

test("archive mobile controls do not show the scrolling prose through their background", () => {
  assert.match(rule(".mobile-dock"), /background: #04080f !important/);
  assert.match(rule(".mobile-dock .dock-current"), /background: #142e3b !important/);
  assert.match(rule(".mobile-dock"), /backdrop-filter: none !important/);
});

test("both embedded archives request the revised design stylesheet", () => {
  for (const archive of ["saga", "realm"]) {
    for (const file of [
      `archives/${archive}-form-archive-standalone.html`,
      `public/${archive}-form-archive-embedded.html`,
    ]) {
      const source = readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
      assert.match(source, /archive-elevation\.css\?v=20261003-elev3/);
    }
  }
});
