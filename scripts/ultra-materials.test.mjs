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
  assert.match(css, /prefers-reduced-transparency: reduce/);
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
