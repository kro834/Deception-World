import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");

test("reading and exhibition paint cannot replace typography, scrolling or gesture handling", () => {
  for (const file of [
    "src/styles-world-exhibition.css",
    "src/styles-dream-refinement.css",
    "src/styles-dossier-reading.css",
    "src/styles-rexonance-instrument.css",
  ]) {
    const css = read(file);
    assert.doesNotMatch(
      css,
      /\bfont-size\s*:|\btouch-action\s*:|\bscroll-snap-|\boverscroll-behavior\s*:/,
    );
    assert.doesNotMatch(css, /\b(?:animation|animation-name)\s*:|@keyframes|url\(/);
    assert.match(css, /@media\s*\(forced-colors:\s*active\)/);
  }
});

test("refinement assets are delivered by their own routes", () => {
  for (const [route, sheet] of [
    ["index", "opening-refinement"],
    ["world", "world-exhibition"],
    ["dream-chapter", "dream-refinement"],
    ["rexonance-saga", "rexonance-edition"],
  ]) {
    assert.ok(read(`src/routes/${route}.tsx`).includes(`styles-${sheet}.css?url`));
    assert.ok(!read("src/lib/world-head.ts").includes(`styles-${sheet}.css?url`));
  }
});

test("Rexonance chapter shortcuts use native anchors with real section targets", () => {
  const source = read("src/components/rexonance-saga/rexonance-saga.tsx");
  const index = source.match(/<nav className="rxs-chapter-index"[^>]*>[\s\S]*?<\/nav>/)?.[0];
  assert.ok(index);
  assert.match(index, /aria-label=/);
  for (const target of ["p14", "stages", "system"]) {
    assert.ok(index.includes(`href="#${target}"`));
    assert.ok(source.includes(`<section id="${target}"`));
  }
  assert.doesNotMatch(index, /onClick|onPointer|tabIndex/);
});

test("Rexonance aperture is decorative static vector art with no extra image requests", () => {
  const source = read("src/components/rexonance-saga/rexonance-aperture.tsx");
  assert.match(source, /aria-hidden="true"/);
  assert.match(source, /focusable="false"/);
  assert.doesNotMatch(
    source,
    /<image|<animate|<foreignObject|useEffect|requestAnimationFrame|fetch\(/,
  );
});

test("opening refinement keeps its one-shot arrival conditional on motion preferences", () => {
  const css = read("src/styles-opening-refinement.css");
  assert.match(css, /@media\s*\(prefers-reduced-motion:\s*no-preference\)/);
  assert.match(css, /html:not\(\[data-world-effects="economy"\]\)/);
  assert.match(css, /animation-name:\s*op-title-unseal/);
  assert.doesNotMatch(css, /\binfinite\b|\banimation-duration\s*:|\banimation-delay\s*:/);
});

test("frequent comparison and section updates stay inside memoised controls", () => {
  const rex = read("src/components/rexonance-saga/rexonance-saga.tsx");
  const dream = read("src/components/dream-chapter/dream-chapter.tsx");
  assert.match(rex, /const P14Comparator = memo\(function P14Comparator/);
  const rexPage = rex.slice(rex.indexOf("export function RexonanceSaga()"));
  assert.doesNotMatch(rexPage, /setP14Baseline/);
  assert.match(rexPage, /<P14Comparator nativeIOSSelection=\{nativeIOSSelection\}/);
  assert.match(dream, /const DreamSectionNav = memo\(function DreamSectionNav/);
  const dreamPage = dream.slice(dream.indexOf("export function DreamChapter()"));
  assert.doesNotMatch(dreamPage, /setActiveSection/);
  assert.match(dreamPage, /<DreamSectionNav \/>/);
  assert.match(dream, /landings \?\?= sections\.map/);
  assert.match(dream, /const invalidateLayout = \(\) => \{\s*landings = null/);
  assert.match(dream, /removeEventListener\("visibilitychange", invalidateLayout\)/);
});
