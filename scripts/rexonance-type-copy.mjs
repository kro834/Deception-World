/* 2026-10-21 rx21: Rexonance, TYPE — the copy each Mincho subset must hold.

   The Rexonance page sets its Japanese titles in "Rexonance Mincho"
   (Shippori Mincho B1 ExtraBold, OFL) and its ledes in "Rexonance Mincho
   Text" (the same family at Medium), each self-hosted as a subset of the
   glyphs the page really uses (public/fonts/rexonance-mincho-*.woff2). Each
   weight comes in two files: a small FIRST subset that holds only the first
   screen's glyphs (the hero's line, lede and scroll cue, the bar's name) and
   is preloaded, and the rest, fetched once the page below the hero needs it.

   This module reads that copy from the components, the one source both the
   subsetter and the guard (scripts/rexonance-type.test.mjs) use, so a copy
   change that brings a new glyph fails the guard until the subsets are cut
   again. To cut them (fontTools; the source fonts are Shippori Mincho B1
   from https://github.com/fontdasu/ShipporiMincho):

     node scripts/rexonance-type-copy.mjs display-first > display-first.txt
     pyftsubset ShipporiMinchoB1-ExtraBold.ttf --text-file=display-first.txt \
       --layout-features=palt --no-hinting --flavor=woff2 \
       --output-file=public/fonts/rexonance-mincho-display-first-20261021.woff2

   and likewise display (ExtraBold), text-first and text (Medium). */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const ROOT = new URL("../", import.meta.url);
const read = (path) => readFileSync(new URL(path, ROOT), "utf8");

/** The text of a JSX fragment: no comments, no expressions, no tags. */
const jsxText = (markup) =>
  markup
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\{[^{}]*\}/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();

const between = (source, start, end) => {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  if (from < 0 || to < 0) throw new Error(`missing ${start} … ${end}`);
  return source.slice(from, to);
};

/** A double-quoted JS string literal's value (\u200B and friends decoded). */
const literal = (quoted) => JSON.parse(quoted);

const strings = (source, pattern) =>
  [...source.matchAll(pattern)].map(([, value]) => literal(`"${value}"`));

export function rexonanceTypeCopy() {
  const page = read("src/components/rexonance-saga/rexonance-saga.tsx");
  const editorial = read("src/components/rexonance-saga/rexonance-editorial.tsx");
  const guide = read("src/components/rexonance-saga/rexonance-assembly-guide.tsx");
  const comparison = read("src/components/rexonance-saga/rexonance-form-comparison.tsx");

  // The forms the page shows (EXCELSIOR's data stays, but is not shown).
  const shown = strings(between(page, "const SHOWN_STAGES", ";"), /"([^"]+)"/g);
  const stagesBlock = between(page, "const STAGES", "const SHOWN_STAGES");
  const stages = [...stagesBlock.matchAll(/^ {2}(\w+): \{\n([\s\S]*?)^ {2}\},$/gm)]
    .filter(([, key]) => shown.includes(key))
    .map(([, , body]) => ({
      label: strings(body, /^ {4}label: "([^"]+)",$/gm)[0],
      title: strings(body, /^ {4}title: "([^"]+)",$/gm)[0],
      ledes: strings(body, /^ {4}lede: "([^"]+)",$/gm),
    }));
  if (stages.length !== shown.length || stages.some(({ label, title, ledes }) => !label || !title || !ledes.length))
    throw new Error("the shown forms' label, title and lede");

  // The comparison baselines' own names (four spaces in), never their
  // metrics' labels (six spaces in).
  const baselines = strings(
    between(page, "const PERFORMANCE_BASELINES", "\n};"),
    /^ {4}label: "([^"]+)",$/gm,
  );
  const plates = strings(between(page, "const CORE_SYSTEMS", "] as const"), /^ {4}title: "([^"]+)",$/gm);
  const chapters = {
    labels: strings(editorial, /^ {4}label: "([^"]+)",$/gm),
    details: strings(editorial, /^ {4}detail: "([^"]+)",$/gm),
  };
  // "P1" and "P2": the P14 comparator's title prints its baseline upper-cased.
  const p14Baselines = strings(between(page, "type P14Baseline", ";"), /"([^"]+)"/g).map((value) =>
    value.toUpperCase(),
  );
  if (baselines.length < 3 || plates.length < 3 || chapters.labels.length < 5 || p14Baselines.length < 2)
    throw new Error("the baselines, the plates, the chapters and the P14 baselines");

  const headings = (source, levels) =>
    [...source.matchAll(new RegExp(`<h([${levels}])[^>]*>([\\s\\S]*?)</h\\1>`, "g"))].map(([, , inner]) =>
      // The hero's Latin name (its <span>) is forged, not Mincho.
      jsxText(inner.replace(/<span(?:\s[^>]*)?>[^<]*<\/span>/g, "")),
    );
  const hero = between(page, '<section className="rxs-hero"', "</section>");
  const heroTitle = headings(hero, "1");
  const heroLede = jsxText(between(hero, '<p className="rxs-hero-lede">', "</p>"));
  const scrollCue = jsxText(between(hero, '<a className="rxs-scroll-cue"', "</a>").replace(/^[^>]*>/, ""));
  const brand = page.match(/<DisplayName value="([^"]+)" \/>/)?.[1];
  if (!heroTitle.length || !heroLede || !scrollCue || !brand) throw new Error("the first screen's copy");

  // Every chapter heading's lede: the header minus its kicker and its title.
  const sectionLedes = [...page.matchAll(/<header className="rxs-section-heading rxs-reveal">([\s\S]*?)<\/header>/g)].map(
    ([, inner]) => jsxText(inner.replace(/<p>[\s\S]*?<\/p>/, "").replace(/<h2[\s\S]*?<\/h2>/, "")),
  );
  const guideLede = jsxText(between(guide, "</h2>", '<p className="rxs-assembly-status"'));

  // The first screen: the hero's line and lede, its scroll cue, the bar's name.
  const displayFirst = [...heroTitle, brand];
  const display = [
    // Every chapter, plate and panel title below the hero, the guide's and the
    // end card's, and the chapter map's labels.
    ...chapters.labels,
    ...headings(page.replace(hero, ""), "2-4"),
    ...headings(guide, "2"),
    ...stages.flatMap(({ label, title }) => [label, title]),
    ...plates,
    ...baselines,
    ...p14Baselines,
    ...[...comparison.matchAll(/<strong>([^<{]+)<\/strong>/g)].map(([, value]) => value),
  ];
  const textFirst = [heroLede, scrollCue];
  const text = [...chapters.details, ...sectionLedes, ...baselines, ...stages.flatMap(({ ledes }) => ledes), guideLede];
  return {
    "display-first": displayFirst.join(""),
    display: display.join(""),
    "text-first": textFirst.join(""),
    text: text.join(""),
  };
}

/** The glyphs a subset holds: the copy's own characters (no control or
    zero-width characters) and the space and no-break space. The two first-
    screen subsets also hold the zero, the glyph CSS's ch unit measures (the
    hero's lede is 28ch wide), so the first screen's measure never waits for
    the larger file; the two lower subsets carry the other digits (a figure
    in a future title still draws in Mincho) and leave out what their
    first-screen subset holds. */
export function rexonanceTypeGlyphs() {
  const copy = rexonanceTypeCopy();
  const DIGITS = "0123456789";
  const set = (value, extra = "") =>
    new Set(
      [...value, " ", "\u00a0", ...extra].filter((character) => /[^\p{C}\s]|[ \u00a0]/u.test(character)),
    );
  const displayFirst = set(copy["display-first"], "0");
  const textFirst = set(copy["text-first"], "0");
  const minus = (all, first) => new Set([...all].filter((character) => !first.has(character)));
  return {
    "display-first": displayFirst,
    display: minus(set(copy.display, DIGITS), displayFirst),
    "text-first": textFirst,
    text: minus(set(copy.text, DIGITS), textFirst),
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const name = process.argv[2];
  const glyphs = rexonanceTypeGlyphs();
  if (!glyphs[name]) {
    console.error(`usage: node scripts/rexonance-type-copy.mjs ${Object.keys(glyphs).join("|")}`);
    process.exitCode = 1;
  } else process.stdout.write([...glyphs[name]].sort().join(""));
}
