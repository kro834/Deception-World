import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../src/components/zeus-button.tsx", import.meta.url), "utf8");

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
  const beforeTimer = pointerDown.slice(0, pointerDown.indexOf("holdTimer.current = window.setTimeout"));
  assert.doesNotMatch(beforeTimer, /event\.preventDefault\(\)/);
  assert.doesNotMatch(beforeTimer, /setPointerCapture\(/);
  assert.match(pointerDown, /held\.current = true;[\s\S]*?setPointerCapture\(event\.pointerId\)/);
  assert.match(source, /document\.addEventListener\("visibilitychange", cancelWhenHidden\)/);
  assert.match(source, /document\.removeEventListener\("visibilitychange", cancelWhenHidden\)/);
});
