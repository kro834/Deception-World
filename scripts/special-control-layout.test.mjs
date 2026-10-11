import assert from "node:assert/strict";
import test from "node:test";
import { assertSpecialControlLayout } from "./special-control-layout.mjs";

const aligned = {
  gap: 16,
  paddingRight: 16,
  borderRight: 0,
  clear: true,
  size: 48,
  overflow: 0,
};

test("F9 aligns to the padded content edge, including fluid and safe-area gutters", () => {
  for (const paddingRight of [16, 33.36, 40.96, 57.6, 72, 88]) {
    assert.doesNotThrow(() =>
      assertSpecialControlLayout({ ...aligned, gap: paddingRight, paddingRight }),
    );
  }
  assert.doesNotThrow(() =>
    assertSpecialControlLayout({ ...aligned, gap: 16.5, borderRight: 0.5 }),
  );
});

test("the one-pixel rounding tolerance is not expanded to accept arbitrary gaps", () => {
  for (const gap of [15, 17]) {
    assert.doesNotThrow(() => assertSpecialControlLayout({ ...aligned, gap }));
  }
  for (const gap of [0, 14.9, 17.1, 32]) {
    assert.throws(() => assertSpecialControlLayout({ ...aligned, gap }), /content-edge/);
  }
  assert.throws(() => assertSpecialControlLayout({ ...aligned, paddingRight: 0 }), /content-edge/);
});

test("F9 does not weaken brand separation, touch target or overflow checks", () => {
  for (const invalid of [{ clear: false }, { size: 47 }, { overflow: 2 }]) {
    assert.throws(
      () => assertSpecialControlLayout({ ...aligned, ...invalid }),
      /separation, target size and overflow/,
    );
  }
});
