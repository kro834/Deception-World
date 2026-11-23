import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const css = (name) => readFileSync(new URL(`../src/${name}`, import.meta.url), "utf8");

// The block of the first rule whose selector text contains `selector`.
function ruleBody(source, selector) {
  const at = source.indexOf(selector);
  assert.notEqual(at, -1, `${selector} is missing`);
  const open = source.indexOf("{", at);
  return source.slice(open + 1, source.indexOf("}", open));
}

test("the rider console's corner ticks follow its rounded corners instead of poking out", () => {
  const body = ruleBody(css("styles-world-special.css"), "> .rider-console::after {");
  assert.match(body, /border-radius:\s*inherit/);
});

test("the quick-search foot never gives its height back, so the history link is not cut by the sheet", () => {
  const body = ruleBody(css("styles-quick-search.css"), ".quick-search-foot {");
  assert.match(body, /flex-shrink:\s*0/);
});

test("the exhibition page clips its own sideways overflow (the halo hangs past the edge)", () => {
  const body = ruleBody(css("styles-ring-gallery.css"), "body main.exhibition-room {");
  assert.match(body, /overflow-x:\s*clip/);
});

test("a gallery tour card's top hairline starts where its 28px corner ends", () => {
  const body = ruleBody(css("styles-gallery-tour-entrance.css"), ".gallery-tour-course::before {");
  assert.match(body, /inset:\s*0 28px auto/);
});
