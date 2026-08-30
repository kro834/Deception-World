import assert from "node:assert/strict";
import test from "node:test";
import {
  archiveIosVisualViewportPanned,
  estimateArchiveIosKeyboardInset,
  measureArchiveIosKeyboardInset,
  resolveArchiveIosKeyboardFrame,
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

test("the AI shell fills the visual viewport instead of lifting a fixed composer", () => {
  const open = resolveArchiveIosKeyboardFrame({
    focused: true,
    compact: true,
    layoutHeight: 844,
    visualHeight: 508,
    offsetTop: 336,
  });
  assert.equal(open.heightPx, 508);
  assert.equal(open.offsetPx, 336);
  assert.equal(open.state, "open");
  const opening = resolveArchiveIosKeyboardFrame({
    focused: true,
    compact: true,
    layoutHeight: 844,
    visualHeight: 780,
    offsetTop: 48,
  });
  assert.equal(opening.state, "opening");
  const closed = resolveArchiveIosKeyboardFrame({
    focused: false,
    compact: true,
    layoutHeight: 844,
    visualHeight: 508,
    offsetTop: 336,
  });
  assert.equal(closed.heightPx, null);
  assert.equal(closed.offsetPx, 0);
  assert.equal(closed.state, "closed");
});
