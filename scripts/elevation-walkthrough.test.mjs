import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

/* The final walkthrough of the four elevation batches (E1-E4): the
   integration fixes made once they were seen together at 390, 768 and
   1440. Each was measured in the browser; the reasons live beside the rules. */

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const flat = (css) => css.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\s+/g, " ");

const future = flat(read("src/styles-future-interface.css"));
const dossier = flat(read("src/styles-dossier-reader.css"));
const rexonance = flat(read("src/styles-rexonance-saga.css"));
const finalStage = flat(read("src/styles-final-stage.css"));
const riderPage = read("src/components/world/rider-page.tsx");

const body = (css, selector) => {
  const at = css.indexOf(`${selector} {`);
  assert.ok(at >= 0, `missing rule ${selector}`);
  return css.slice(at, css.indexOf("}", at));
};

test("phrase breaking never splits 半汎用式ライダーシステム as システ／ム。 on phones", () => {
  // The compound is one phrase wider than a 360-390px column at 25px; the
  // zero-width space is its only break, and it reads 半汎用式／ライダーシステム.
  assert.ok(riderPage.includes('title: "万物を拒絶する、半汎用式\\u200bライダーシステム。",'));
  assert.ok(!riderPage.includes('title: "万物を拒絶する、半汎用式ライダーシステム。"'));
});

test("prose of five lines and more stays flush, as the dossier chapters do", () => {
  assert.match(
    future,
    /:where\(\.rider-partner-copy, \.rxs-p14-copy, \.fst-cast-copy\) :where\(p, li\) \{ word-break: normal; \}/,
  );
  // It follows the baseline's own flush rule, at the same zero specificity.
  assert.ok(
    future.indexOf(":where(.rider-partner-copy") >
      future.indexOf(":where(.manager-copy-body, .fst-story-copy"),
  );
});

test("the special sites' closing kicker stands over its title on every width", () => {
  const kicker = body(rexonance, ".rxs-footer > div p");
  // The World's `footer p` centred it and hid it below 841px.
  assert.match(kicker, /display: block;/);
  assert.match(kicker, /text-align: start;/);
  assert.match(kicker, /font-size: 11px;/);
});

test("Final Stage's closing title takes its own row beside three links", () => {
  const at = finalStage.indexOf("@media (min-width: 1101px) { .fst-page .rxs-footer {");
  assert.ok(at >= 0, "wide Final Stage footer");
  const wide = finalStage.slice(at, finalStage.indexOf("} }", at) + 3);
  assert.match(wide, /grid-template-columns: minmax\(0, 1fr\) repeat\(3, auto\);/);
  assert.match(wide, /\.fst-page \.rxs-footer > div \{ grid-column: 1 \/ -1; \}/);
  assert.match(wide, /\.fst-page \.rxs-footer > a:first-of-type \{ grid-column-start: 2; \}/);
});

test("the partner record joins the dossier's label voice and spec rows", () => {
  assert.match(
    dossier,
    /\.rider-nightmare-card-copy > p, \.rider-partner-forms > header > p \) \{ font-size: 12px;/,
  );
  assert.match(
    body(dossier, "main.manager-page.manager-page .rider-partner-card .rider-partner-en-name"),
    /font-size: 11px !important;/,
  );
  const row = body(dossier, "main.manager-page .rider-partner-card dl > div");
  assert.match(row, /grid-template-columns: minmax\(84px, max-content\) minmax\(0, 1fr\);/);
  assert.match(row, /column-gap: 12px;/);
  // Two columns of facts stack each label over its value.
  const wide = dossier.slice(
    dossier.indexOf("@media (min-width: 761px) { main.manager-page .rider-partner-card dl > div {"),
  );
  assert.match(wide, /^[^}]*grid-template-columns: minmax\(0, 1fr\);/);
});

test("the end-of-file list tile wears the file's surface corner", () => {
  assert.match(
    body(dossier, ".manager-page .manager-pagination .dossier-index-return"),
    /border-radius: var\(--dossier-radius, 12px\);/,
  );
});
