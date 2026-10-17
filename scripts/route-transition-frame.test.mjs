import assert from "node:assert/strict";
import test from "node:test";
import { isFlatCoverFrame } from "./route-transition-frame.mjs";

const darkSeal = {
  mean: 0.00333,
  std: 0.01199,
  p99: 0.0308,
  zeusDetailFraction: 0.0232,
};

test("uniform dark cover still fails the no-blank pin", () => {
  assert.equal(
    isFlatCoverFrame({ mean: 0.003, std: 0.001, p99: 0.006, zeusDetailFraction: 0 }, "world-zeus"),
    true,
  );
});

test("the visible 250 ms Zeus seal is not classified as blank", () => {
  assert.equal(isFlatCoverFrame(darkSeal, "world-zeus"), false);
});

test("a single bright speck does not count as Zeus seal detail", () => {
  assert.equal(
    isFlatCoverFrame({ ...darkSeal, zeusDetailFraction: 1 / 33300 }, "world-zeus"),
    true,
  );
});

test("other routes keep the original global flat-frame rule", () => {
  assert.equal(isFlatCoverFrame(darkSeal, "world-saga"), true);
});
