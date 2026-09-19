import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL("../src/components/zeus-button.tsx", import.meta.url),
  "utf8",
).replaceAll("\r\n", "\n");

test("queued placement cannot interrupt a gesture and interrupted drags restore their origin", () => {
  assert.match(source, /placementFrame\.current = null;\s*if \(activePointer\.current != null\) return;/);
  assert.match(source, /if \(activePointer\.current == null\) placeButton\(position\)/);
  assert.match(source, /gestureOrigin\.current = \{ \.\.\.pendingPosition\.current \}/);
  assert.match(source, /if \(wasHeld\) restoreGestureOrigin\(\)/);
  assert.match(source, /else if \(wasHeld && cancelled\) \{\s*restoreGestureOrigin\(\)/);
});

test("drag drawing is frame-coalesced and the release flushes the final position", () => {
  assert.match(source, /if \(dragFrame\.current == null\) \{\s*dragFrame\.current = window\.requestAnimationFrame/);
  assert.match(source, /const finishPointer[\s\S]*?cancelDragFrame\(\);[\s\S]*?moveToPointer\(event.clientX, event.clientY\);\s*onPositionChange/);
});

test("Zeus dragging corrects viewport coordinates inside transformed dialogs", () => {
  assert.match(source, /const setVisualCenter = useCallback/);
  assert.match(source, /const parent = button\.offsetParent/);
  assert.match(source, /left \+= deltaX \/ scaleX/);
  assert.match(source, /top \+= deltaY \/ scaleY/);
  assert.match(source, /const actual = setVisualCenter\(centerX, centerY\)/);
});

test("the long-press activation frame keeps the latest finger position", () => {
  assert.match(source, /const latestPointer = useRef/);
  assert.match(source, /latestPointer\.current = \{ x: event\.clientX, y: event\.clientY \}/);
  assert.match(source, /moveToPointer\(latestPointer\.current\.x, latestPointer\.current\.y\)/);
});

test("normal taps and vertical scroll keep native ownership until long-press activates", () => {
  const pointerDown = source.match(
    /onPointerDown=\{\(event\) => \{([\s\S]*?)\n\s*\}\}\n\s*onPointerMove=/,
  )?.[1];
  assert.ok(pointerDown, "Zeus must keep an explicit pointer-down handler");
  const beforeTimer = pointerDown.slice(
    0,
    pointerDown.indexOf("holdTimer.current = window.setTimeout"),
  );
  assert.doesNotMatch(beforeTimer, /event\.preventDefault\(\)/);
  assert.doesNotMatch(beforeTimer, /setPointerCapture\(/);
  assert.match(pointerDown, /held\.current = true;[\s\S]*?setPointerCapture\(event\.pointerId\)/);
  assert.match(source, /document\.addEventListener\("visibilitychange", cancelWhenHidden\)/);
  assert.match(source, /document\.removeEventListener\("visibilitychange", cancelWhenHidden\)/);
});
