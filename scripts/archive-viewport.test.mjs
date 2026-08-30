import assert from "node:assert/strict";
import test from "node:test";
import {
  archiveIosVisualViewportPanned,
  estimateArchiveIosKeyboardInset,
  measureArchiveIosKeyboardInset,
  ARCHIVE_IOS_KEYBOARD_FALLBACK_PX,
} from "../src/lib/archive-viewport.ts";

test("iPhone keyboard inset is estimated before focus so Safari does not pan", () => {
  const inset = estimateArchiveIosKeyboardInset(844);
  assert.equal(inset >= ARCHIVE_IOS_KEYBOARD_FALLBACK_PX, true);
  assert.equal(inset <= 440, true);
});

test("measured inset ignores leftover iOS 26 offsetTop by using layout minus visual height", () => {
  assert.equal(measureArchiveIosKeyboardInset(844, 508), 336);
  assert.equal(measureArchiveIosKeyboardInset(844, 844), 0);
  assert.equal(archiveIosVisualViewportPanned(0), false);
  assert.equal(archiveIosVisualViewportPanned(120), true);
});
