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
  const editorial = read("src/components/rexonance-saga/rexonance-editorial.tsx");
  const guide = read("src/components/rexonance-saga/rexonance-assembly-guide.tsx");
  assert.match(source, /<RexonanceChapterMap\s*\/>/);
  const index = editorial.match(/<nav className="rxs-chapter-index\b[^>]*>[\s\S]*?<\/nav>/)?.[0];
  assert.ok(index);
  assert.match(index, /aria-label=/);
  assert.match(index, /<a key=\{chapter.href\} href=\{chapter.href\}>/);
  for (const target of ["performance", "p14", "assembly", "stages", "system"]) {
    assert.ok(editorial.includes(`href: "#${target}"`));
    assert.match(source + guide, new RegExp(`<section\\b[^>]*\\bid="${target}"`));
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

test("P14 calibration rail keeps two discrete baselines and an iOS native picker", () => {
  const source = read("src/components/rexonance-saga/rexonance-saga.tsx");
  const route = read("src/routes/rexonance-saga.tsx");
  const css = read("src/styles-p14-calibration.css");
  const comparator = source.slice(source.indexOf("const P14Comparator"), source.indexOf("// Keep performance selection"));
  assert.match(comparator, /min="1"\s+max="2"\s+step="1"/);
  assert.match(comparator, /value=\{p14Baseline === "p1" \? 1 : 2\}/);
  assert.match(comparator, /nativeIOSSelection\s*\?\s*\(/);
  assert.match(comparator, /<option value="p1">P1比<\/option>/);
  assert.match(comparator, /<option value="p2">P2比<\/option>/);
  assert.match(comparator, /rxs-p14-core-anchor-p1/);
  assert.match(comparator, /rxs-p14-core-anchor-p2/);
  assert.match(comparator, /rxs-p14-native-rail" data-value=\{p14Baseline\} aria-hidden="true"/);
  assert.match(route, /p14CalibrationCssUrl/);
  assert.match(css, /html body \.rxs-page\.rxs-page\.rxs-rexonance-page \.rxs-p14-ios-slider[\s\S]*?background:[\s\S]*?!important/);
  assert.match(css, /html body \.rxs-page\.rxs-page\.rxs-rexonance-page \.rxs-p14-ios-thumb[\s\S]*?background:[\s\S]*?!important/);
  assert.doesNotMatch(css, /html body \.rxs-p14-ios-slider\s*\{/);
  assert.match(css, /touch-action:\s*pan-y/);
  assert.match(css, /@media\s*\(max-width:\s*520px\)/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
  assert.match(css, /data-world-effects="economy"/);
  assert.match(css, /@media\s*\(forced-colors:\s*active\)/);
  assert.match(css, /\.rxs-p14-ios-slider\s*\{\s*background:\s*Canvas\s*!important;\s*box-shadow:\s*none\s*!important;/);
  assert.match(css, /\.rxs-p14-ios-thumb\s*\{\s*background:\s*Canvas\s*!important;\s*box-shadow:\s*none\s*!important;/);
  assert.match(css, /html\[data-world-effects="economy"\] body \.rxs-page\.rxs-page\.rxs-rexonance-page \.rxs-p14-ios-slider[\s\S]*?box-shadow:\s*none\s*!important;/);
  assert.match(css, /html\[data-world-effects="economy"\] \.rxs-page\.rxs-page\.rxs-rexonance-page \.rxs-p14-ios-thumb[\s\S]*?box-shadow:\s*none\s*!important;/);
  assert.doesNotMatch(css, /\binfinite\b|@keyframes/);
});
