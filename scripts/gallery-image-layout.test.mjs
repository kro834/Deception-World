import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const baseCss = readFileSync(new URL("../src/styles-gallery.css", import.meta.url), "utf8");
const fallbackCss = readFileSync(
  new URL("../src/styles-gallery-image-fallback.css", import.meta.url),
  "utf8",
);

test("standard and full images share a bounded grid track without disabling zoom", () => {
  assert.match(
    fallbackCss,
    /\.gallery-image-canvas\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\);[^}]*grid-template-rows:\s*minmax\(0,\s*1fr\);/,
  );
  assert.match(fallbackCss, /\.gallery-image-canvas img\s*\{[^}]*min-width:\s*0;/);
  assert.match(baseCss, /\.gallery-viewer-stage img\s*\{[^}]*object-fit:\s*contain;/);
  assert.match(
    baseCss,
    /\.gallery-viewer-image\[data-zoomed="true"\] \.gallery-image-canvas\s*\{[^}]*width:\s*200%;[^}]*height:\s*200%;/,
  );
});
