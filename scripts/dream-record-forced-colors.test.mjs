import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const style = readFileSync(
  new URL("../src/styles-dream-record-explorer.css", import.meta.url),
  "utf8",
);
const forced = style.slice(style.indexOf("@media (forced-colors: active) {"));

test("selected collection controls pair CanvasText with Canvas and retain a visible non-color selection cue", () => {
  const rule = forced.match(
    /:is\(\.dream-record-collection-views button, \.dream-record-save\)\[aria-pressed="true"\]\s*\{([^}]+)\}/,
  )?.[1];
  assert.ok(rule, "collection selection has a scoped forced-colors rule");
  assert.match(rule, /color:\s*CanvasText\s*;/);
  assert.match(rule, /background:\s*Canvas\s*;/);
  assert.match(rule, /border-color:\s*CanvasText\s*;/);
  assert.match(rule, /border-bottom-width:\s*4px\s*;/);
  assert.match(rule, /text-decoration:\s*underline\s*;/);
  assert.match(rule, /text-decoration-thickness:\s*2px\s*;/);
  assert.doesNotMatch(rule, /Highlight|forced-color-adjust/);
});

test("collection selection does not replace search-match colors or keyboard focus cues", () => {
  assert.match(
    forced,
    /\.dream-record-card mark\s*\{\s*color:\s*HighlightText;\s*background:\s*Highlight;/,
  );
  assert.match(
    forced,
    /\.dream-record-explorer :is\(a, button, input, select\):focus-visible\s*\{\s*outline-color:\s*Highlight;/,
  );
});
