import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const css = readFileSync(
  new URL("../src/styles-interaction-choreography.css", import.meta.url),
  "utf8",
);
test("shared choreography is finite, progressive and leaves gestures and chrome untouched", () => {
  assert.match(css, /prefers-reduced-motion: no-preference/);
  assert.match(css, /html:not\(\[data-world-effects="economy"\]\)/);
  assert.doesNotMatch(css, /infinite|will-change:|touch-action:|position: fixed|scroll-behavior:/);
  assert.doesNotMatch(css, /\.brand|\.topbar|\.form-pickup-dialog|\.rxs-suit/);
  assert.match(css, /pointer-events: none/);
  for (const name of ["label", "caption", "exhibit", "panel", "reading", "reflection"]) {
    assert.match(css, new RegExp(`@keyframes choreography-${name}`));
  }
});
test("new reflection never transforms the original artwork or changes its crop", () => {
  assert.match(css, /\.gallery-work-frame::after/);
  assert.doesNotMatch(css, /object-fit:|object-position:|\bimg\s*\{/);
  assert.match(css, /hover: hover\) and \(pointer: fine/);
});
