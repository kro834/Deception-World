import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (file) => readFileSync(new URL(`../src/${file}`, import.meta.url), "utf8");

test("rider action supplies a dark rounded surface without the shared glass sheet", () => {
  const css = read("styles-world-programme-sections.css");
  const rule = css.match(/\.site-shell\.film-edition \.rider-dossier-open \{([^}]+)\}/)?.[1];
  assert.ok(rule);
  assert.match(rule, /background: #122132 !important/);
  assert.match(rule, /border-radius: 999px/);
  assert.match(rule, /color: #fff/);
  assert.doesNotMatch(rule, /background: var\(--programme-paper\)/);
});

test("rider action gives labels and arrows readable contrast at tablet sizes", () => {
  const css = read("styles-world-neo.css");
  const label = (part) =>
    css.match(
      new RegExp(`\\.rider-dossier-open \\.ios-slide-open-label ${part} \\{([^}]+)\\}`),
    )?.[1];
  assert.match(label("small"), /color: #b9ebfa/);
  assert.match(label("small"), /font-size: 11px/);
  assert.match(label("b"), /color: #fff/);
  assert.match(label("b"), /font-size: 13px/);
  assert.match(css, /\.rider-dossier-open \.ios-slide-open-arrows \{[^}]*opacity: 1/s);
  assert.match(css, /\.rider-dossier-open \.ios-slide-open-arrows i \{[^}]*opacity: 1 !important/s);
  assert.match(
    css,
    /\.rider-dossier-open \.ios-slide-open-fill \{[^}]*background: rgb\(111 227 255 \/ 8%\)/s,
  );
});
