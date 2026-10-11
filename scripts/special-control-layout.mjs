import assert from "node:assert/strict";

export function assertSpecialControlLayout(layout, label = "special header") {
  // rx14 F9 makes the inner bar full-width with the shared shell gutter.
  // Its DOMRect includes padding and borders; the trigger aligns to the
  // content edge, not the outer border edge. Use resolved CSS lengths so
  // fluid gutters and safe-area insets retain the same one-pixel tolerance.
  const inset = layout.paddingRight + layout.borderRight;
  assert.ok(
    Math.abs(layout.gap - inset) <= 1,
    `${label}: menu content-edge alignment ${JSON.stringify(layout)}`,
  );
  assert.ok(
    layout.clear && layout.size >= 48 && layout.overflow <= 1,
    `${label}: header separation, target size and overflow ${JSON.stringify(layout)}`,
  );
}
