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
