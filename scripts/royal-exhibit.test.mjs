import assert from "node:assert/strict";
import test from "node:test";
import { REALM_ROYAL, RR_FORM_ORDER } from "../src/components/final-stage/final-stage-data.ts";
import { cropFor, PARTS, PLATES } from "../src/components/final-stage/royal-exhibit-data.ts";

test("each matched detail uses the same shoulder scale and stays inside its supplied portrait", () => {
  for (const part of Object.keys(PARTS)) {
    const referenceScale = 1 / PARTS[part].span;
    for (const [index, key] of RR_FORM_ORDER.entries()) {
      const art = REALM_ROYAL.visuals[index];
      const plate = PLATES[key];
      const crop = cropFor(key, part, art.width, art.height);
      const halfWidth = 0.5 / crop.width;
      const halfHeight = (halfWidth * art.width) / art.height;
      const epsilon = 0.000001;
      assert.ok(Math.abs(plate.shoulderSpan * crop.width - referenceScale) < epsilon, key);
      for (const [axis, halfExtent] of [
        ["x", halfWidth],
        ["y", halfHeight],
      ]) {
        const lo = crop[axis] - halfExtent;
        const hi = crop[axis] + halfExtent;
        assert.ok(lo >= -epsilon && hi <= 1 + epsilon, `${key} ${part} ${axis}: image bounds`);
        assert.ok(
          plate[part][axis] > lo && plate[part][axis] < hi,
          `${key} ${part}: landmark visible`,
        );
      }
    }
  }
});

test("every label and note comes from the corresponding published armor entry", () => {
  assert.deepEqual(
    Object.values(PARTS).map(({ armor }) => REALM_ROYAL.armor[armor].title),
    ["コロネーションリアクター", "レガリアスター", "ソヴリンクローク"],
  );
});
