import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { transform } from "lightningcss";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const css = read("src/styles-ultra-materials.css");

test("Ultra material sheet parses and addresses real components", () => {
  assert.doesNotThrow(() =>
    transform({ filename: "styles-ultra-materials.css", code: Buffer.from(css) }),
  );
  const gallery = read("src/components/gallery/gallery-page.tsx");
  const world = read("src/components/world/world-home.tsx");
  const dossier = read("src/components/world/rider-page.tsx");
  for (const className of ["gallery-feature-open", "gallery-work-frame", "gallery-filters"]) {
    assert.match(gallery, new RegExp(className));
    assert.match(css, new RegExp(className));
  }
  for (const className of ["poster-frame", "episode-card-surface"]) {
    assert.match(world, new RegExp(className));
    assert.match(css, new RegExp(className));
  }
  for (const className of ["manager-portrait-frame", "manager-facts"]) {
    assert.match(dossier, new RegExp(className));
    assert.match(css, new RegExp(className));
  }
});

test("materials and motion are Ultra-only and obey accessibility gates", () => {
  assert.match(css, /html\[data-ultra-mode="on"\]/);
  assert.match(css, /\[data-ultra-motion="on"\]/);
  assert.match(css, /@media \(forced-colors: none\)/);
  assert.match(css, /prefers-reduced-motion: no-preference/);
  assert.match(css, /prefers-reduced-transparency: no-preference/);
  assert.match(css, /prefers-contrast: no-preference/);
  assert.match(css, /prefers-reduced-transparency: reduce/);
  assert.match(css, /prefers-contrast: more/);
  assert.match(css, /@media \(forced-colors: active\)/);
  for (const attribute of [
    "data-ultra-paused",
    "data-loading",
    "data-dialog-open",
    "data-side-menu-open",
  ]) {
    assert.match(css, new RegExp(`:not\\(\\s*\\[${attribute}`));
  }
  assert.doesNotMatch(css, /\.gallery-(?:feature-open|work-frame) img\s*\{/);
  assert.doesNotMatch(
    css,
    /(?:^|\n)\s*html\[data-ultra-mode="on"\]\s+(?:body|\.gallery-viewer-stage|\.gallery-image-viewport)\b/,
  );
});

test("reduced-transparency and forced-colors fallbacks reach the full manager portrait selector", () => {
  const fallback = css.slice(css.indexOf("@media (prefers-reduced-transparency: reduce)"));
  assert.match(
    fallback,
    /main\.manager-page:not\(\.is-sovereign\)\s*\.manager-hero\s*\.manager-portrait-frame/,
  );
  assert.match(
    fallback,
    /@media \(forced-colors: active\)[\s\S]*?\.manager-hero\s*\.manager-portrait-frame/,
  );
  assert.match(fallback, /\.poster-frame::after\s*\{[^}]*opacity:\s*0;\s*animation:\s*none/s);
  assert.doesNotMatch(css, /\.poster-frame\s*\{[^}]*animation:/s);
});

test("scene light adapts to quality and protects exhibition and reading surfaces", () => {
  const effects = read("src/styles-ultra-effects.css");
  assert.doesNotThrow(() =>
    transform({ filename: "styles-ultra-effects.css", code: Buffer.from(effects) }),
  );
  assert.match(
    effects,
    /\.ultra-effects\[data-ultra-quality="cinema"\]\s*\{\s*opacity:\s*var\(--ultra-cinema-light-strength\)/,
  );
  for (const chrome of ["gallery", "dream"]) {
    assert.match(
      effects,
      new RegExp(
        `html\\[data-ultra-mode="on"\\]\\[data-viewport-chrome="${chrome}"\\]\\s*\\.ultra-effects\\s*\\{[^}]*--ultra-light-strength:[^}]*--ultra-cinema-light-strength:`,
        "s",
      ),
    );
  }
  assert.doesNotMatch(effects, /(?:body|main|img)\s*\{[^}]*(?:filter|transform):/s);
  assert.match(effects, /mix-blend-mode:\s*screen/);
});
