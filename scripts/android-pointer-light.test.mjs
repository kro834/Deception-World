import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

// 2026-11-23 (owner: phones equal PC in high quality mode): press-only
// tracking and the hidden glows are for lightweight Android only.
test("lightweight Android follows presses only in the liquid pointer light", () => {
  const pointer = read("src/components/world/use-liquid-pointer-light.ts");
  assert.match(
    pointer,
    /if \(root\.hasAttribute\("data-android-renderer"\) && root\.dataset\.worldEffects === "economy"\)\s*return trackPressesOnly\(\);/,
  );
  const presses = pointer.slice(
    pointer.indexOf("function trackPressesOnly"),
    pointer.indexOf("export function useLiquidPointerLight"),
  );
  // A press keeps the Dream chapter's pressed scale and touch glow...
  assert.match(presses, /target\.dataset\.liquidPointerPressed = "true";/);
  assert.match(presses, /target\.dataset\.liquidPointerActive = "true";/);
  // ...placed once per press in the next frame, never per pointer move.
  assert.equal(presses.match(/getBoundingClientRect\(\)/g)?.length, 1);
  assert.equal(presses.match(/requestAnimationFrame\(place\)/g)?.length, 1);
  assert.doesNotMatch(presses, /pointermove|pointerover|pointerout|focusin/);
  // The World's own pointer glows are hidden on lightweight Android.
  assert.match(
    read("src/styles-android-performance.css"),
    /html\[data-world-effects="economy"\]\[data-android-renderer\]\s*:is\([^)]*\.liquid-pointer-glow[^)]*\)\s*\{\s*display: none !important;/,
  );
});
