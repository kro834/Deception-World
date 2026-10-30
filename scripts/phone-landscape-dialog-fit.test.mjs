import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (file) => readFileSync(new URL(`../src/${file}`, import.meta.url), "utf8");
const query =
  "@media (orientation: landscape) and (max-height: 500px) and (max-width: 980px) and (pointer: coarse)";
const quick = read("styles-quick-search.css");
const gallery = read("styles-gallery.css");
const chrome = read("styles-command-chrome.css");
function phoneBlock(source) {
  const start = source.indexOf(query);
  assert.ok(start >= 0, "only a short landscape touch viewport receives these overrides");
  let level = 0,
    end = source.indexOf("{", start);
  for (let i = end; i < source.length; i++) {
    if (source[i] === "{") level++;
    if (source[i] === "}" && --level === 0) {
      end = i;
      break;
    }
  }
  const block = source.slice(source.indexOf("{", start) + 1, end);
  for (const selector of block
    .split("}")
    .map((part) => part.split("{")[0].trim())
    .filter(Boolean))
    assert.match(
      selector,
      /html[^\n]*:not\(\[data-ipad-viewport="contained"\]\)/,
      "iPad retains its own layout",
    );
  return block;
}

test("landscape dialogs reserve both left and right safe areas", () => {
  for (const [source, minimum] of [
    [quick, 12],
    [gallery, 8],
  ]) {
    const block = phoneBlock(source);
    for (const side of ["left", "right"]) {
      assert.match(
        block,
        new RegExp(`${side}: max\\(${minimum}px, env\\(safe-area-inset-${side}, 0px\\)\\);`),
      );
    }
    assert.match(block, /width:[^;]*100vw[^;]*safe-area-inset-left[^;]*safe-area-inset-right/s);
    for (const width of [667, 844, 932]) {
      for (const [left, right] of [
        [47, 0],
        [0, 47],
        [47, 47],
      ]) {
        const used = width - Math.max(minimum, left) - Math.max(minimum, right);
        assert.ok(used + Math.max(minimum, left) <= width - right);
      }
    }
  }
});

test("compact landscape search preserves the 44px input floor and vertical result budget", () => {
  const block = phoneBlock(quick);
  assert.match(block, /--qs-top: max\(8px, env\(safe-area-inset-top, 0px\)\)/);
  assert.match(
    block,
    /max-height: calc\(100dvh - var\(--qs-top\) - max\(8px, env\(safe-area-inset-bottom, 0px\)\)\)/,
  );
  assert.match(block, /\.quick-search-field input \{\s*min-height: 44px;/);
  assert.doesNotMatch(block, /font-family:|font-size:/);
});

test("the short menu keeps all seven destinations in one band and viewer controls remain reachable", () => {
  assert.match(phoneBlock(chrome), /grid-template-columns: repeat\(7, minmax\(0, 1fr\)\)/);
  const block = phoneBlock(gallery);
  assert.match(block, /\.gallery-viewer-header \{[^}]*min-height: 44px;[^}]*max-height: 30dvh;/s);
  assert.match(block, /\.gallery-viewer-tools\[open\] \{\s*order: 3;/);
});
