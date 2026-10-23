import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { transform } from "lightningcss";

const css = readFileSync(new URL("../src/styles-tablet-gallery.css", import.meta.url), "utf8");
const baseCss = readFileSync(new URL("../src/styles-gallery.css", import.meta.url), "utf8");

function rule(source, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const body = source.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`))?.[1];
  assert.ok(body, `missing scoped rule: ${selector}`);
  return body;
}

function matchesTarget(width, height) {
  return (
    width >= 560 &&
    width <= 1100 &&
    height >= 501 &&
    height <= 650 &&
    width > height &&
    width / height <= 2
  );
}

test("tablet viewer CSS parses and targets the intended landscape band", () => {
  assert.doesNotThrow(() =>
    transform({ filename: "styles-tablet-gallery.css", code: Buffer.from(css) }),
  );
  assert.match(
    css,
    /@media \(min-width:\s*560px\)[\s\S]*?\(max-width:\s*1100px\)[\s\S]*?\(min-height:\s*501px\)[\s\S]*?\(max-height:\s*650px\)[\s\S]*?\(orientation:\s*landscape\)[\s\S]*?\(max-aspect-ratio:\s*2\s*\/\s*1\)/,
  );
  assert.equal(matchesTarget(900, 600), true);
  assert.equal(matchesTarget(639, 540), true);
  assert.equal(matchesTarget(720, 540), true);
  assert.equal(matchesTarget(390, 844), false);
  assert.equal(matchesTarget(1024, 768), false);
  assert.equal(matchesTarget(1440, 900), false);
});

test("viewer overrides preserve the compact arrangement and existing control sizes", () => {
  assert.match(
    rule(css, 'html[data-family="gallery"] .gallery-page .gallery-viewer .gallery-viewer-shell'),
    /padding:\s*12px;/,
  );
  const header = rule(
    css,
    'html[data-family="gallery"] .gallery-page .gallery-viewer .gallery-viewer-header',
  );
  assert.match(header, /min-height:\s*44px;/);
  assert.match(header, /max-height:\s*30dvh;/);
  assert.match(header, /gap:\s*0 8px;/);
  assert.match(header, /padding-bottom:\s*8px;/);
  assert.match(
    rule(
      css,
      'html[data-family="gallery"] .gallery-page .gallery-viewer .gallery-viewer-tools:not([open])',
    ),
    /flex-basis:\s*auto;[\s\S]*order:\s*1;/,
  );
  assert.match(
    rule(css, 'html[data-family="gallery"] .gallery-page .gallery-viewer .gallery-close-primary'),
    /order:\s*2;/,
  );
  assert.match(
    rule(
      css,
      'html[data-family="gallery"] .gallery-page .gallery-viewer .gallery-viewer-tools[open]',
    ),
    /order:\s*3;/,
  );
  assert.match(
    rule(baseCss, ".gallery-viewer-close,\n.gallery-viewer-footer button"),
    /min-width:\s*44px;[\s\S]*min-height:\s*44px;/,
  );
  assert.match(
    rule(baseCss, ".gallery-viewer-header"),
    /max-height:\s*45dvh;[\s\S]*overflow-y:\s*auto;/,
  );
  assert.doesNotMatch(css, /gallery-viewer-close\s*\{[^}]*min-(?:width|height)\s*:/);
  assert.doesNotMatch(css, /gallery-viewer-tools[^{}]*\{[^}]*(?:max-height|overflow)\s*:/);
  assert.doesNotMatch(
    css,
    /gallery-title-editor|\.gallery-image|touch-action|gallery-viewer-stage/,
  );
});
