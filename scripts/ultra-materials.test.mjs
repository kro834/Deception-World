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

test("materials are Ultra-only, motion-safe, and preserve original artwork", () => {
  assert.match(css, /html\[data-ultra-mode="on"\]/);
  assert.match(
    css,
    /@media\s*\(not\s*\(forced-colors:\s*active\)\)\s+and\s*\(not\s*\(prefers-reduced-motion:\s*reduce\)\)\s+and\s*\(not\s*\(prefers-reduced-transparency:\s*reduce\)\)\s+and\s*\(not\s*\(prefers-contrast:\s*more\)\)/,
  );
  assert.doesNotMatch(css, /\.gallery-(?:feature-open|work-frame) img\s*\{/);
  assert.doesNotMatch(css, /\bimg\s*\{[^}]*\b(?:filter|transform)\s*:/s);
  assert.doesNotMatch(css, /\b(?:filter|transform)\s*:/);
  assert.doesNotMatch(css, /@keyframes\b|\banimation\s*:/);
});

test("reduced motion, transparency, contrast, and forced colors disable material treatment", () => {
  assert.match(css, /not\s*\(forced-colors:\s*active\)/);
  assert.match(css, /not\s*\(prefers-reduced-motion:\s*reduce\)/);
  assert.match(css, /not\s*\(prefers-reduced-transparency:\s*reduce\)/);
  assert.match(css, /not\s*\(prefers-contrast:\s*more\)/);
  assert.match(css, /\.manager-portrait-frame\s*\{/);
  assert.match(css, /\.poster-frame::after\s*\{/);
});

test("local mount materials stay inside artwork bounds and protect artwork pixels", () => {
  const effects = read("src/styles-ultra-effects.css");
  assert.doesNotThrow(() =>
    transform({ filename: "styles-ultra-effects.css", code: Buffer.from(effects) }),
  );
  const stageRule =
    effects.match(/html\[data-ultra-mode="on"\]\s+\.ultra-effects\s*\{([^}]*)\}/s)?.[1] ?? "";
  assert.match(stageRule, /position:\s*absolute/);
  assert.match(stageRule, /inset:\s*0/);
  assert.match(stageRule, /opacity:\s*1/);
  assert.match(stageRule, /mix-blend-mode:\s*normal/);
  assert.match(stageRule, /border-radius:\s*inherit/);
  assert.match(stageRule, /pointer-events:\s*none/);
  assert.match(stageRule, /--ultra-edge-intensity:\s*0\.6/);
  assert.match(
    effects,
    /html\[data-ultra-mode="on"\]\s+\.ultra-effects\[data-ultra-quality="cinema"\]\s*\{[^}]*--ultra-edge-intensity:\s*0\.85/s,
  );

  // The renderer is a local portal layer on an artwork mount, never a page veil.
  assert.doesNotMatch(effects, /position:\s*fixed/);
  assert.doesNotMatch(effects, /mix-blend-mode:\s*screen/);
  assert.doesNotMatch(effects, /mask-image\s*:/);
  assert.doesNotMatch(effects, /(?:^|\n)\s*@keyframes\b|\banimation\s*:/);
  assert.doesNotMatch(effects, /radial-gradient\s*\(|conic-gradient\s*\(/);
  assert.doesNotMatch(effects, /\b(?:filter|transform)\s*:/);

  for (const preference of [
    "prefers-reduced-motion: reduce",
    "prefers-reduced-transparency: reduce",
    "prefers-contrast: more",
    "forced-colors: active",
  ]) {
    assert.ok(effects.includes(preference), `missing accessibility gate ${preference}`);
  }
  assert.match(
    effects,
    /html\[data-ultra-mode="on"\][^{]*\.ultra-effects\s*\{[^}]*display:\s*none/s,
  );
  assert.match(
    effects,
    /data-ultra-motion="on"[\s\S]*?data-ultra-renderer="gpu"[\s\S]*?\.ultra-effects-canvas\s*\{[^}]*opacity:\s*1/s,
  );
  assert.match(
    effects,
    /data-ultra-paused="true"[\s\S]*?\.ultra-effects-canvas\s*\{[^}]*display:\s*none/s,
  );

  // The static fallback may draw the mount's fine rails, never a free-floating field.
  const fallback =
    effects.match(/\/\* A quiet[\s\S]*?\.ultra-effects-fallback\s*\{([^}]*)\}/)?.[1] ?? "";
  assert.match(fallback, /border:\s*calc\(var\(--ultra-frame-width\) - 2px\) solid transparent/);
  assert.match(fallback, /border-image-source:\s*url\("\/ultra-materials\/frame-rim\.png"\)/);
  assert.match(fallback, /border-image-slice:\s*64\s*;/);
  assert.match(fallback, /background:\s*none/);
  assert.match(fallback, /box-shadow:\s*none/);
  assert.doesNotMatch(fallback, /\bfill\b|(?:radial|conic|linear)-gradient\s*\(/);
});
