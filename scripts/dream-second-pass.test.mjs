import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

/* Dream Chapter, second pass (2026-09-30): the menu dive opens onto the lit
   one-sheet (src/styles-dream-arrival.css), 人物一覧 on phones as tiles with
   a PROFILE switch, the compact CASE list, the phone annexes, landscape acts
   that land under the chrome, and measured estimates for skipped sections.
   The copy is pinned elsewhere (owner-copy, dream-expansion). */

const read = (path) =>
  readFileSync(new URL(`../${path}`, import.meta.url), "utf8").replaceAll("\r\n", "\n");
const strip = (css) => css.replace(/\/\*[\s\S]*?\*\//g, "");
const page = read("src/components/dream-chapter/dream-chapter.tsx");
const route = read("src/routes/dream-chapter.tsx");
const arrival = strip(read("src/styles-dream-arrival.css"));
const annex = strip(read("src/styles-dream-annex.css"));
const taisho = strip(read("src/styles-dream-taisho.css"));
const elevation = strip(read("src/styles-dream-elevation.css"));

const rules = (css) =>
  [...css.matchAll(/(?<=^|[{};])\s*([^{};@][^{};]*)\{([^{}]*)\}/g)].map((match) => ({
    selector: match[1].trim().replace(/\s+/g, " "),
    body: match[2].trim(),
  }));

// The bodies of every @media block whose prelude is exactly `query`.
const mediaBlock = (css, query) => {
  const bodies = [];
  for (let start = css.indexOf(`@media ${query} {`); start >= 0;) {
    const open = css.indexOf("{", start);
    let depth = 0;
    let index = open;
    for (; index < css.length; index += 1) {
      if (css[index] === "{") depth += 1;
      if (css[index] === "}") depth -= 1;
      if (depth === 0) break;
    }
    bodies.push(css.slice(open + 1, index));
    start = css.indexOf(`@media ${query} {`, index);
  }
  assert.ok(bodies.length, query);
  return bodies.join("\n");
};

test("the arrival sheet loads after the annex sheet and before the cinematic skin", () => {
  assert.match(route, /import dreamArrivalCssUrl from "@\/styles-dream-arrival\.css\?url";/);
  const links = route.slice(route.search(/links:\s*\[/));
  const annexLink = links.indexOf("href: dreamAnnexCssUrl");
  const arrivalLink = links.indexOf("href: dreamArrivalCssUrl");
  const cinematic = links.indexOf("CINEMATIC_STYLESHEET_LINK");
  assert.ok(annexLink > 0 && arrivalLink > annexLink && cinematic > arrivalLink);
});

test("the dive's ground clears only while a full-tier shutter lifts onto this page", () => {
  const gate = rules(arrival).filter(({ selector }) => selector.includes(".load-gate"));
  assert.equal(gate.length, 1);
  // Scoped to the mounted page, the full tier, the Dream dive and the reveal:
  // the covering phase, the calm and reduced tiers and the dive back to the
  // World keep their ground.
  assert.equal(
    gate[0].selector,
    'html[data-dream-chapter="true"]:not([data-world-effects="economy"]) body .load-gate.has-cine.is-cine-full.rider-route-dive.is-dream-dive.is-revealing',
  );
  assert.equal(gate[0].body.replace(/;$/, ""), "background: transparent");
});

test("the one-sheet rests drawn under the cover and opens when data-loading goes", () => {
  const rest = rules(arrival).find(({ selector }) => selector.startsWith("html[data-loading]"));
  assert.ok(rest);
  assert.match(rest.selector, /^html\[data-loading\] \.dream-page\.dream-page \.dream-hero :is\(/);
  assert.equal(rest.body.replace(/;$/, ""), "animation: none");
  // Every hero part the Taisho opening animates is held.
  const opening = taisho.slice(
    taisho.indexOf("@media (prefers-reduced-motion: no-preference)"),
    taisho.indexOf("@keyframes"),
  );
  for (const part of [
    ".dream-hero-art",
    ".dream-hero-title-name > span",
    ".dream-hero-title-label",
    ".dream-hero-catch > span",
    ".dream-hero-copy > p",
    ".dream-hero-actions",
    ".dream-hero-obi",
  ]) {
    assert.ok(opening.replace(/\s+/g, " ").includes(part), `opening animates ${part}`);
    assert.ok(rest.selector.includes(part), `held under the cover: ${part}`);
  }
  // The sheet adds no motion of its own.
  assert.doesNotMatch(arrival, /@keyframes|transition|!important|view-timeline|scroll\(/);
  assert.doesNotMatch(arrival.replace(/animation: none/g, ""), /animation/);
});

test("the PROFILE switch is a real disclosure, named by its person", () => {
  const roster = page.slice(
    page.indexOf('<ol className="dream-roster"'),
    page.indexOf("</ol>", page.indexOf('<ol className="dream-roster"')),
  );
  assert.match(roster, /<button\s+type="button"\s+className="dream-roster-switch"/);
  assert.match(roster, /aria-expanded=\{openProfiles\.has\(entry\.id\)\}/);
  assert.match(roster, /aria-controls=\{`dream-roster-\$\{entry\.id\}-profile`\}/);
  assert.match(
    roster,
    /aria-labelledby=\{`dream-roster-\$\{entry\.id\} dream-roster-\$\{entry\.id\}-switch`\}/,
  );
  assert.match(
    roster,
    /<div className="dream-roster-body" id=\{`dream-roster-\$\{entry\.id\}-profile`\}>/,
  );
  // Its only words are the HUD label; the name comes from the heading.
  assert.match(
    roster,
    /<span id=\{`dream-roster-\$\{entry\.id\}-switch`\} lang="en">\s*PROFILE\s*<\/span>/,
  );
  assert.match(roster, /<i aria-hidden="true" \/>/);
  assert.doesNotMatch(roster, /aria-label=/);
  // The line follows the name, then the switch, then the profile it opens.
  const order = ["<h3", "<QuoteFigure", "dream-roster-switch", "dream-roster-body"].map((needle) =>
    roster.indexOf(needle),
  );
  assert.deepEqual(
    [...order].sort((a, b) => a - b),
    order,
  );
});

test("the switch exists on phones only, keeps 44px, the fuji ring and forced colours", () => {
  const base = rules(annex).find(
    ({ selector }) => selector === ".dream-page.dream-page .dream-roster-switch",
  );
  assert.equal(base.body.replace(/;$/, ""), "display: none");
  const phone = mediaBlock(
    annex,
    "(max-width: 760px), (max-height: 520px) and (orientation: landscape)",
  );
  const switchRule = rules(phone).find(
    ({ selector }) => selector === ".dream-page.dream-page .dream-roster-switch",
  );
  assert.match(switchRule.body, /min-height: 44px;/);
  assert.match(
    phone,
    /\.dream-roster-switch\[aria-expanded="false"\] \+ \.dream-roster-body \{\s*display: none;\s*\}/,
  );
  // The tiles share their rows' tracks, so one open profile moves no switch.
  assert.match(phone, /grid-template-rows: subgrid;/);
  // The state cell is drawn with borders, which forced colours keep.
  for (const { selector, body } of rules(phone)) {
    if (selector.includes(".dream-roster-switch > i"))
      assert.doesNotMatch(body, /gradient/, selector);
  }
  assert.match(
    annex,
    /\.dream-page\.dream-page \.dream-roster-switch:focus-visible \{\s*outline: 2px solid var\(--ts-fuji\);/,
  );
  const forced = annex.slice(annex.indexOf("@media (forced-colors: active)"));
  assert.match(forced, /\.dream-roster-switch[^{]*\{[^}]*ButtonText[^}]*ButtonFace/);
  assert.match(forced, /\.dream-roster-switch\[aria-expanded="true"\] > i \{[^}]*Highlight/);
  assert.match(forced, /\.dream-annex-heading::before \{\s*display: none;/);
});

test("the compact CASE list keeps its 44px rows and the narrow-phone seal", () => {
  const compact = mediaBlock(
    taisho,
    "(max-width: 760px), (max-height: 520px) and (orientation: landscape)",
  );
  const summary = rules(compact).find(
    ({ selector }) => selector === ".dream-page.dream-page .dream-story-case > summary",
  );
  const height = Number(summary.body.match(/min-height: (\d+)px/)[1]);
  assert.ok(height >= 44, String(height));
  // The rules under 360px come later, so the 記録途中 seal still moves under
  // its title there.
  assert.ok(
    taisho.indexOf("@media (max-width: 359px) {") >
      taisho.indexOf(
        "@media (max-width: 760px), (max-height: 520px) and (orientation: landscape) {",
      ),
  );
});

test("landscape acts land under the chrome and the cast stands three abreast", () => {
  const landscape = mediaBlock(elevation, "(max-height: 520px) and (orientation: landscape)");
  assert.match(
    landscape,
    /scroll-margin-top: max\(124px, calc\(112px \+ env\(safe-area-inset-top\)\)\);/,
  );
  assert.match(landscape, /#cases\.dream-section/);
  assert.match(
    landscape,
    /\.dream-character-grid \{\s*grid-template-columns: repeat\(3, minmax\(0, 1fr\)\);/,
  );
});

test("skipped sections keep a measured estimate and remember their drawn size", () => {
  for (const [css, ids] of [
    [elevation, ["posters", "characters", "dolminence"]],
    [annex, ["cast-roster", "factions", "case-notes", "glossary", "quotes"]],
  ]) {
    for (const id of ids) {
      const values = [
        ...css.matchAll(new RegExp(`#${id} \\{\\s*contain-intrinsic-size: ([^;]+);`, "g")),
      ].map((match) => match[1]);
      assert.ok(values.length >= 5, id);
      for (const value of values) assert.match(value, /^auto \d+px$/, id);
    }
  }
});

test("no Dream sheet sets text under 12px, loops, or adds annex motion", () => {
  for (const css of [taisho, elevation, annex, arrival]) {
    for (const [, size] of css.matchAll(/font-size:\s*([^;]+);/g)) {
      const minimum = size.match(/^clamp\((\d+)px/)?.[1] ?? size.match(/^(\d+)px$/)?.[1];
      if (minimum != null) assert.ok(Number(minimum) >= 12, size);
    }
    assert.doesNotMatch(css, /infinite/);
  }
  assert.doesNotMatch(annex, /animation|@keyframes|view-timeline|scroll-timeline/);
});
