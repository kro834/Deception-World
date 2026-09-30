import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

/* The World's scroll cost (2026-09-30). Scrolling /world to its end had got
   slower with the annex: at the page end the Zeus button's text pass measured
   every p, li, span ... in the document, including the words inside the
   closed PROFILE and REALMS disclosures. Measuring them laid them out, which
   fetched the Japanese font slices for their rarer kanji, and each slice's
   arrival relaid every text node in the family mid-scroll. The pass now
   passes over words that are not drawn. content-visibility on the annex was
   measured too and bought nothing on top, so the World keeps every section
   laid out and its anchors, 資料目次 jumps and Back restores land exactly as
   before. */

const read = (path) =>
  readFileSync(new URL(`../${path}`, import.meta.url), "utf8").replaceAll("\r\n", "\n");
const strip = (css) => css.replace(/\/\*[\s\S]*?\*\//g, "");

const zeus = read("src/components/zeus-button.tsx");

function readAvoidTextSource() {
  const start = zeus.indexOf("function readAvoidText(");
  const end = zeus.indexOf("\n}\n", start);
  assert.ok(start > 0 && end > start, "readAvoidText is in zeus-button.tsx");
  return zeus.slice(start, end);
}

test("the Zeus text pass checks that a word is drawn before it measures it", () => {
  assert.match(
    zeus,
    /const drawn = \(element: Element\) =>\s*typeof element\.checkVisibility !== "function" \|\| element\.checkVisibility\(\);/,
  );
  const pass = readAvoidTextSource();
  // An element: drawn first, then its box.
  const skip = pass.indexOf("if (!drawn(element)) continue;");
  const box = pass.indexOf("element.getBoundingClientRect()");
  assert.ok(skip > 0 && box > skip, "drawn(element) comes before its getBoundingClientRect()");
  // A walked element's own text: a closed disclosure inside a card is not read.
  const nodeSkip = pass.indexOf("if (node.parentElement && !drawn(node.parentElement)) continue;");
  const holder = pass.indexOf("node.parentElement?.getBoundingClientRect()");
  assert.ok(nodeSkip > 0 && holder > nodeSkip, "drawn(parent) comes before the holder's box");
  assert.ok(pass.indexOf("range.getClientRects()") > nodeSkip, "and before the glyph boxes");
  // What the pass collects is unchanged: the end of a page still counts all text.
  assert.match(pass, /if \(pageEnd && root === document\) collect\(ZEUS_END_TEXT_SELECTOR\);/);
});

test("only words that are not drawn at all are passed over", () => {
  // No options: a closed disclosure's contents and display: none are skipped,
  // content-visibility: auto content is not (it can be on screen before its
  // first render), and opacity or visibility are read by the pass itself.
  assert.doesNotMatch(zeus, /checkVisibility\(\s*\{/);
  const source = zeus
    .match(/const drawn = \(element: Element\) =>\s*([^;]+);/)?.[1]
    ?.replace(/\s+/g, " ");
  assert.ok(source, "drawn() is a single expression");
  const drawn = new Function("element", `return ${source};`);
  // Engines without checkVisibility measure everything, as before.
  assert.equal(drawn({}), true);
  assert.equal(drawn({ checkVisibility: () => true }), true);
  assert.equal(drawn({ checkVisibility: () => false }), false);
});

test("the World keeps its sections laid out, so its anchors land where they did", () => {
  // The contents strip's jumps (smooth, native anchors), Back restores into or
  // below the annex and #re-dive are measured on the real layout; placeholders
  // would move them (a 2000px estimate put 06.1 900px off at 390px).
  for (const path of ["src/styles-world-annex.css", "src/styles-world-mirage.css"]) {
    assert.doesNotMatch(strip(read(path)), /content-visibility|contain-intrinsic-size/, path);
  }
  const annex = read("src/components/world/world-annex.tsx");
  // The disclosures stay native, so a closed one reads as not drawn.
  assert.match(annex, /<details className="wa-profile" onToggle=\{keepProfileInPlace\}>/);
  assert.match(annex, /<details key=\{doc\.office\} className="wa-doc" aria-label=\{doc\.office\}>/);
  for (const [href, id] of [
    ["#cast-roster", 'id="cast-roster"'],
    ["#world-brief", 'id="world-brief"'],
    ["#episode-notes", 'id="episode-notes"'],
    ["#glossary", 'id="glossary"'],
    ["#quotes", 'id="quotes"'],
  ]) {
    assert.ok(annex.includes(`href: "${href}"`), href);
    assert.ok(annex.includes(id), id);
  }
});

/* RE DIVE on landscape tablets (1024-1279px wide, wider than tall): the box
   reads as one spread inside the landing view. I stands over three rows
   beside II | III and IV | V, VI is the phones' sealed strip, the heading
   column carries FRONT / 01 at its foot, and the ground above the box is the
   quarter screen the section asks for. Still paint only; every other width
   keeps its layout. */
const reDive = strip(read("src/styles-world-re-dive.css"));
const LANDSCAPE_TABLET =
  "@media (min-width: 1024px) and (max-width: 1279px) and (orientation: landscape) {";

function landscapeBlock() {
  const start = reDive.indexOf(LANDSCAPE_TABLET);
  assert.ok(start > 0, "the landscape tablet block exists");
  let depth = 0;
  for (let i = reDive.indexOf("{", start); i < reDive.length; i++) {
    if (reDive[i] === "{") depth += 1;
    else if (reDive[i] === "}" && --depth === 0) return reDive.slice(start, i + 1);
  }
  throw new Error("unclosed block");
}

test("RE DIVE on a landscape tablet: one spread in the landing view", () => {
  const block = landscapeBlock();
  // The lip keeps its height, so the transition's picture is unchanged; only
  // the box comes up to a quarter screen under it.
  assert.match(reDive, /--re-dive-edge-h: clamp\(170px, 30vw, 320px\);/);
  assert.match(block, /--rd-band: max\(26svh, calc\(var\(--re-dive-edge-h\) \* 0\.62\)\);/);
  assert.match(block, /padding-top: var\(--rd-band\);/);
  assert.doesNotMatch(block, /--re-dive-edge-h:/);
  // I over the three rows, II-V in DOM order, VI the sealed strip.
  assert.match(block, /grid-template-columns: minmax\(0, 1\.3fr\) repeat\(2, minmax\(0, 1fr\)\);/);
  assert.match(block, /\.signal\.ciel-signal \{\s*grid-column: 1;\s*grid-row: 1 \/ 4;\s*\}/);
  assert.match(block, /\.signal\.is-vacant:last-child \{\s*grid-column: 2 \/ -1;/);
  // Rows come from what is left of the screen, never under 150px.
  assert.match(block, /clamp\(\s*150px,\s*calc\([\s\S]*?100svh[\s\S]*?\/ 2\s*\),\s*240px\s*\)/);
  assert.match(block, /\.re-dive-tab \{\s*align-self: end;\s*\}/);
  // Still paint: nothing moves or is reordered, and no text is set here.
  assert.doesNotMatch(block, /animation|transition|(^|[;{\s])order\s*:|font(-size)?\s*:/);
  // The other layouts stay as they were.
  assert.match(reDive, /@media \(min-width: 600px\) and \(max-width: 1279px\) \{/);
  assert.match(reDive, /@media \(min-width: 1024px\) and \(max-width: 1279px\) \{/);
  assert.match(reDive, /grid-template-columns: minmax\(0, 2fr\) repeat\(5, minmax\(0, 1fr\)\);/);
  // Forced colours still draw every plate as a system line.
  const forced = reDive.slice(reDive.indexOf("@media (forced-colors: active)"));
  assert.match(forced, /\.manager-slot-grid > \.signal\) \{\s*border: 1px solid CanvasText;/);
});
