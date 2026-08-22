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
