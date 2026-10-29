import assert from "node:assert/strict";
import test from "node:test";
import {
  GUARDIAN_REFERENCE_DIRECTIONS,
  parseGuardianLook,
} from "../src/lib/dogs-archive/look.ts";

test("the page look is the default; only look=reference with a known view is a harness", () => {
  assert.deepEqual(parseGuardianLook(""), { look: "page" });
  assert.deepEqual(parseGuardianLook("?dog=5"), { look: "page" });
  assert.deepEqual(parseGuardianLook("?dog=5&look=page"), { look: "page" });
  assert.deepEqual(parseGuardianLook("?look=Reference"), { look: "page" });
  assert.deepEqual(parseGuardianLook("?dog=5&look=reference"), { look: "reference", view: "front" });
  assert.deepEqual(parseGuardianLook("?look=reference&view=back"), { look: "reference", view: "back" });
  assert.deepEqual(parseGuardianLook("?look=reference&view=left"), { look: "reference", view: "left" });
  assert.deepEqual(parseGuardianLook("?look=reference&view=right"), { look: "reference", view: "right" });
  assert.deepEqual(parseGuardianLook("?look=reference&view=top"), { look: "reference", view: "front" });
});

test("the four reference directions are the turnaround sheets' axes", () => {
  assert.deepEqual(GUARDIAN_REFERENCE_DIRECTIONS.front, [0, 0, 1]);
  assert.deepEqual(GUARDIAN_REFERENCE_DIRECTIONS.back, [0, 0, -1]);
  // 左側面 looks at the creature's left flank, so the camera sits on its left (+X).
  assert.deepEqual(GUARDIAN_REFERENCE_DIRECTIONS.left, [1, 0, 0]);
  assert.deepEqual(GUARDIAN_REFERENCE_DIRECTIONS.right, [-1, 0, 0]);
});
