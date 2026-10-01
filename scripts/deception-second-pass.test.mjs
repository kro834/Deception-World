import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

/* Deception World, second pass (2026-10-02): the presentation fixes outside
   the reveal and the slide control (those are pinned by world-reveal,
   scroll-paint-budget and slide-lifecycle). Each fix is paint or layout in
   its page's own scope, still or behind both motion gates, and never adds
   text. */

const read = (path) =>
  readFileSync(new URL(`../${path}`, import.meta.url), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\s+/g, " ");

const edition = read("src/styles-dossier-edition.css");
const chrome = read("src/styles-chrome-elevation.css");
const refine = read("src/styles-world-refine.css");
const annex = read("src/styles-world-annex.css");

const F = "main.manager-page:not(.is-sovereign)";

test("the partner pair keeps each card's copy under its own art, two columns only", () => {
  assert.match(
    edition,
    new RegExp(
      `@media \\(min-width: 761px\\) \\{ ${F.replace(/[.()]/g, "\\$&")} \\.rider-archive-identity-records\\.has-partner > \\.rider-archive-civilian \\{ grid-template-rows: auto 1fr; \\} \\}`,
    ),
  );
});

test("the Rexonance ring closes the rule on phones and keeps its wide-card place", () => {
  assert.match(
    edition,
    /@media \(max-width: 760px\) \{ main\.manager-page:not\(\.is-sovereign\) \.is-rexonance-pickup \.rexonance-card-ornaments i:nth-child\(3\) \{ right: 18px; bottom: 12px; width: 30px; \} \}/,
  );
});

test("record viewers on the files: CLOSE ends the bar, the top-right bracket is sized away", () => {
  const rule = edition.match(
    /main\.manager-page:not\(\.is-sovereign\) \.form-pickup-dialog\.form-pickup-dialog:not\(\.is-rexonance-dialog, \.fst-pickup-dialog\)::before, main\.manager-page:not\(\.is-sovereign\) \.rider-nightmare-dialog\.rider-nightmare-dialog::before \{([^}]*)\}/,
  );
  assert.ok(rule, "scoped to the files' form and nightmare dialogs");
  assert.equal(
    rule[1].trim(),
    "background-size: var(--pc-arm) 2px, 2px var(--pc-arm), 0 0, 0 0, min(40%, 256px) 5px, auto;",
  );
});

test("PREV / NEXT: an instant lit foot on fine pointers, the lean only under both gates", () => {
  assert.match(
    edition,
    /@media \(hover: hover\) and \(pointer: fine\) \{ main\.manager-page:not\(\.is-sovereign\) \.manager-pagination > a:hover \{ box-shadow: inset 0 -2px 0 [^;]+; \} \}/,
  );
  const gated =
    /@media \(hover: hover\) and \(pointer: fine\) and \(prefers-reduced-motion: no-preference\) \{([\s\S]*?)\} \}/.exec(
      edition,
    )[1];
  for (const [selector, body] of [
    [".manager-pagination > a > span:last-child", "transition: translate 200ms"],
    [".manager-pagination > a:first-child:hover > span:last-child", "translate: -4px 0;"],
    [".manager-pagination > a:last-child:hover > span:last-child", "translate: 4px 0;"],
  ]) {
    assert.ok(
      gated.includes(`html:not([data-world-effects="economy"]) ${F} ${selector} { ${body}`),
      selector,
    );
  }
  // The lean lives nowhere else.
  const outside = edition.replace(gated, "");
  assert.doesNotMatch(
    outside,
    /manager-pagination > a(?::\w+-child)?(?::hover)? > span:last-child \{/,
  );
});

test("the menu's SYSTEM group drops its codes under 431px, without :has()", () => {
  assert.match(
    chrome,
    /@media \(max-width: 430px\) \{ html body #site-side-panel > \.side-panel-group:last-child \.side-panel-links > a > span \{ flex-basis: 100%; \} \}/,
  );
  assert.doesNotMatch(chrome, /:has\(/);
});

test("the files' menu trigger is square from the first paint (root sheet, same 4px)", () => {
  assert.match(
    chrome,
    /html body \.detail-topbar-actions > \.side-panel-trigger\.ios26-glass \{ border-radius: 4px; background: rgb\(4 8 15 \/ 92%\) !important;/,
  );
});

test("STORY's kicker holds one line; scoped to the World root", () => {
  assert.match(
    refine,
    /main\.site-shell\.film-edition\.mirage-edition \.story-layout \.story-heading \.eyebrow > span \{ white-space: nowrap; \}/,
  );
});

test("the cast wall's hover face keys on the portrait plate, never its img", () => {
  assert.match(
    annex,
    /@media \(hover: hover\) and \(pointer: fine\) \{[^@]*\.wa-person > \.wa-portrait:has\(~ \.wa-open:hover\) \{ filter: brightness\(1\.08\) saturate\(1\.05\); \}/,
  );
  assert.doesNotMatch(annex, /\.wa-open:hover\) \.wa-portrait img/);
});

test("every new rule stays at the 12px floor and generates no text", () => {
  for (const css of [edition, chrome, refine]) {
    for (const [, size] of css.matchAll(/font-size:\s*(\d+(?:\.\d+)?)px/g)) {
      assert.ok(Number(size) >= 12, size);
    }
  }
  for (const [, value] of edition.matchAll(/content:\s*([^;]+);/g))
    assert.equal(value.trim(), '""');
});
