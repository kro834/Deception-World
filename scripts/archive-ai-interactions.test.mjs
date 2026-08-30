import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const readSource = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const oracle = readSource("src/components/world/archive-oracle.tsx");
const roleplay = readSource("src/components/world/archive-roleplay.tsx");
const gestures = readSource("src/components/world/use-liquid-segmented-drag.ts");
const actions = readSource("src/components/world/archive-message-actions.tsx");
const health = readSource("src/lib/archive-ai-health.ts");
const styles = readSource("src/styles-intelligence.css");

test("Search and Persona expose edit, resend, branch, and cancellation controls", () => {
  for (const source of [oracle, roleplay]) {
    assert.match(source, /branchArchiveMessages\(/);
    assert.match(source, /<ArchiveMessageActions/);
    assert.match(source, /<ArchiveComposerEditNotice/);
    assert.match(source, /action: "edit_resend"/);
    assert.match(source, /action: "retry"/);
    assert.match(source, /タップして編集・再送信/);
  }
  assert.match(actions, />[\s\S]*?編集[\s\S]*?<\/button>/);
  assert.match(actions, />[\s\S]*?再送信[\s\S]*?<\/button>/);
  assert.match(actions, /このメッセージ以降を分岐して再送信します/);
});

test("top Liquid Glass selectors hold before capture and keep vertical scrolling available", () => {
  assert.match(gestures, /const TOUCH_HOLD_MS = 260/);
  assert.match(gestures, /const PEN_HOLD_MS = 180/);
  assert.match(gestures, /const PRE_HOLD_TOLERANCE_PX = 9/);
  assert.match(gestures, /root\.setPointerCapture\(event\.pointerId\)/);
  assert.match(gestures, /if \(!heldRef\.current\)[\s\S]*?shouldCancelLiquidHold/);
  assert.match(gestures, /if \(heldRef\.current\) event\.preventDefault\(\)/);
  assert.match(oracle, /useLiquidSegmentedDrag\(\{[\s\S]*?values: \["search", "roleplay"\]/);
  assert.match(roleplay, /useLiquidSegmentedDrag\(\{[\s\S]*?values: \["normal", "pro"\]/);
  assert.match(styles, /touch-action: pan-y pinch-zoom/);
  assert.match(styles, /\[data-liquid-dragging\]/);
});

test("local connection diagnostics are private, bounded, and visible on both surfaces", () => {
  assert.match(health, /const MAX_EVENTS = 48/);
  assert.match(health, /window\.sessionStorage/);
  assert.doesNotMatch(health, /prompt|reply|message|content/i);
  assert.match(oracle, /<ArchiveConnectionHealth/);
  assert.match(roleplay, /<ArchiveConnectionHealth/);
  assert.match(styles, /\.archive-connection-health-panel/);
  assert.match(styles, /@media \(prefers-reduced-transparency: reduce\)/);
});

test("iPad and iPhone layouts keep glass controls and 44px actions", () => {
  assert.match(styles, /@media \(min-width: 761px\) and \(max-width: 920px\)/);
  assert.match(styles, /@media \(max-width: 760px\)/);
  assert.match(styles, /\.archive-message-actions > button \{[\s\S]*?min-height: 44px/);
  assert.match(styles, /\.archive-message-text-button \{[\s\S]*?min-height: 48px/);
  assert.match(styles, /backdrop-filter: blur\(22px\) saturate\(128%\)/);
  assert.match(styles, /env\(safe-area-inset-bottom/);
});
