import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// The content pages' design brush-up (2026-11-26): the rules a stylesheet
// or the markup can hold, so a later edit does not quietly undo them.
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const after = (css, marker) => {
  const at = css.indexOf(marker);
  assert.ok(at >= 0, marker);
  return css.slice(at);
};
const block = (css, selector) => {
  const at = css.indexOf(`${selector} {`);
  assert.ok(at >= 0, selector);
  return css.slice(at, css.indexOf("}", at));
};

test("the World hero scales from 720px and keeps the approved phone-portrait fit", () => {
  const css = read("src/styles-world-artwork-stage.css");
  const brush = after(css, "/* ---------- Brush-up (2026-11-26)");
  const wide = after(brush, "@media (min-width: 720px) {");
  assert.match(
    wide,
    /h1 \{\s*font-size: min\(var\(--dw-fs-hero, clamp\(26px, 4\.4vw, 64px\)\), 100cqi \/ 9\.6\);/,
  );
  // One CTA family: 44px on a phone, 52px from 720px, pills.
  assert.match(brush, /min-height: var\(--dw-btn-h, 44px\);/);
  assert.match(wide, /min-height: var\(--dw-btn-h-hero, 52px\);/);
  assert.match(brush, /background: var\(\s*--dw-btn-primary-fill,/);
  // The frame hugs the poster from 720px only.
  assert.match(
    wide,
    /\.artwork-stage__aperture \{\s*height: min\(\s*var\(--stage-art-height\),\s*calc\(\(100cqi - 2 \* var\(--world-frame-mat\)\) \/ var\(--world-frame-ar\)/,
  );
  // 249733c8: the phone-portrait height stays as approved.
  assert.match(css, /--stage-art-height: clamp\(224px, calc\(39svh - 42px\), 358px\);/);
  // The lead's bracket is a straight rule (no rounded border from the ring sheet).
  const ring = read("src/styles-ring-world.css");
  assert.doesNotMatch(ring, /\.world-stage-context,/);
  assert.match(brush, /\.world-stage-context \{\s*border-inline-start: 2px solid/);
});

test("World annex prose is set flush", () => {
  const css = read("src/styles-world-annex.css");
  assert.match(
    css,
    /:is\(\.wa-prose, \.wa-locations li p, \.world-column-summary-pane p\) \{\s*word-break: normal;\s*text-wrap-style: pretty;/,
  );
});

test("rider spec labels sit at the 12px label size in a legible tint", () => {
  const css = after(read("src/styles-ring-dossier.css"), "Brush-up (2026-11-26)");
  assert.match(css, /\.manager-facts\s+dt \{[^}]*font-size: var\(--dw-fs-label, 12px\);/);
  assert.match(css, /\.dossier-reader-links\s+> a \{\s*min-height: 44px;/);
});

test("library and search records keep one outline and no empty plates", () => {
  const css = after(read("src/styles-ring-library.css"), "Brush-up (2026-11-26): one outline per card");
  assert.match(css, /\.library-card-actions > :is\(a, button\):not\(#ring-x#ring-x\) \{\s*border-color: transparent !important;/);
  assert.match(css, /\.dxl-art\[data-plate="type"\]:not\(#ring-x#ring-x\)::after \{[\s\S]*?border-radius: 50%;/);
  // The plate keeps the whole name (owner 2026-10-22), only re-framed.
  assert.match(read("src/components/library/record-art.tsx"), /<b style=\{plateRunStyle\(plateWords\(title\)\)\}>/);
  // 続きから fits a long single name to its line.
  assert.match(css, /max\(13px, 100cqi \/ \(var\(--dxl-run, 0\.01\) \* 1\.05\)\)/);
});

test("gallery tiles show a magnifier in one row and keep the gold scheme", () => {
  const page = read("src/components/gallery/gallery-page.tsx");
  assert.match(page, /<span className="gallery-work-hint" aria-hidden="true">/);
  assert.match(page, /。拡大して鑑賞`\}/);
  const css = after(read("src/styles-ring-gallery.css"), "Brush-up (2026-11-26): the tile's meta is one row");
  assert.match(css, /figcaption:not\(#ring-x#ring-x\) \{[^}]*margin-top: -44px;[^}]*pointer-events: none;/);
  assert.match(css, /--ring-g-gold/);
  // Motion stays behind reduced motion and economy.
  assert.match(css, /@media \(prefers-reduced-motion: no-preference\) \{\s*html\[data-family="gallery"\]:not\(\[data-world-effects="economy"\]\)/);
  // The exhibition heading starts at the left on a phone.
  assert.match(css, /\.exhibition-room-heading:not\(#ring-x#ring-x\) \{\s*align-items: flex-start;/);
});

test("the world map groups its shelf by kind without a query", () => {
  const map = read("src/components/world-map/world-map.tsx");
  assert.match(map, /const indexGroups[\s\S]*?q\.trim\(\)\s*\?\s*\[\{ kind: "", nodes: results \}\]/);
  assert.match(map, /<h3 className="wm-index-group-head">/);
  // Rows stay direct children of .wm-index-grid (the Zeus button's word list).
  assert.match(map, /<div className="wm-index-grid">\s*\{group\.nodes\.map/);
  const css = read("src/styles-world-map.css");
  assert.match(block(css, ".wm-index-group-head"), /position: sticky;/);
  assert.match(block(css, ".wm-index-group-head"), /font-size: 13px;/);
});
