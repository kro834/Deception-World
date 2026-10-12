import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const script = readFileSync(new URL("./verify-comparison-readability.mjs", import.meta.url), "utf8");

test("comparison verification exercises Extreme buttons and preserves Rexonance native selection", () => {
  // Extreme intentionally adopted the opponent button group; do not restore a select to satisfy this check.
  assert.match(script, /usesButtons = route === "\/extreme-saga"/u);
  assert.match(script, /group\.locator\("button\[aria-pressed\]"\)/u);
  assert.match(script, /await buttons\.nth\(baseline\)\.click\(\)/u);
  assert.match(script, /else await select\.selectOption\(baseline\)/u);
  assert.match(script, /getAttribute\("aria-labelledby"\), "exs-opponent-label"/u);
  assert.match(script, /choice\.name && choice\.code && choice\.unclipped/u);
});

test("all comparison readability and accessible-result pins are retained", () => {
  assert.match(script, /\[320, 390, 1024, 1280\]/u);
  assert.match(script, /assert\.equal\(rows\.length, 4\)/u);
  assert.match(script, /!row\.overlap && row\.inside && row\.aligned/u);
  assert.match(script, /if \(width <= 360\) assert\.ok\(row\.stacked\)/u);
  assert.match(script, /one accessible result per decorated row/u);
  assert.match(script, /comparison row height stays aligned/u);
  assert.match(script, /assert\.deepEqual\(errors, \[\]\)/u);
});
