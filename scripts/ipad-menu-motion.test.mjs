import assert from "node:assert/strict";
import test from "node:test";
import {
  getIpadMenuMotionGeometry,
  IPAD_MENU_MOTION_SETTLE_MS,
} from "../src/lib/ipad-menu-mode.js";

const rect = (left, top, width, height) => ({ left, top, width, height });

test("motion geometry returns the signed center-to-center vector", () => {
  assert.deepEqual(
    getIpadMenuMotionGeometry(rect(400, 80, 100, 40), rect(900, 700, 60, 60), {
      width: 1200,
      height: 800,
    }),
    { x: -480, y: -630 },
  );
  assert.deepEqual(
    getIpadMenuMotionGeometry(rect(40, 180, 80, 40), rect(10, 20, 60, 60), {
      width: 1024,
      height: 768,
    }),
    { x: 40, y: 150 },
  );
});

test("motion geometry uses rectangle centers when the header and trigger differ in size", () => {
  assert.deepEqual(
    getIpadMenuMotionGeometry(rect(12, 18, 312, 64), rect(900, 620, 60, 60), {
      width: 1024,
      height: 768,
    }),
    { x: -762, y: -600 },
  );
});

test("motion geometry clamps horizontal travel to the viewport and vertical travel to viewport plus safety margin", () => {
  assert.deepEqual(
    getIpadMenuMotionGeometry(rect(10_000, 10_000, 200, 100), rect(0, 0, 20, 20), {
      width: 1024,
      height: 768,
    }),
    { x: 1024, y: 888 },
  );
  assert.deepEqual(
    getIpadMenuMotionGeometry(rect(-10_000, -10_000, 20, 20), rect(10_000, 10_000, 200, 100), {
      width: 1024,
      height: 768,
    }),
    { x: -1024, y: -888 },
  );
});

test("motion geometry rounds both coordinates to hundredths of a CSS pixel", () => {
  assert.deepEqual(
    getIpadMenuMotionGeometry(rect(10.123, 20.235, 0.004, 0.004), rect(0, 0, 0.004, 0.004), {
      width: 100,
      height: 100,
    }),
    { x: 10.12, y: 20.24 },
  );
});

test("motion geometry rejects absent rectangles or viewport", () => {
  const validHeader = rect(0, 0, 20, 20);
  const validTrigger = rect(40, 40, 20, 20);
  const viewport = { width: 100, height: 100 };
  for (const input of [
    [null, validTrigger, viewport],
    [validHeader, null, viewport],
    [validHeader, validTrigger, null],
    [undefined, validTrigger, viewport],
  ]) {
    assert.equal(getIpadMenuMotionGeometry(...input), null);
  }
});

test("motion geometry rejects non-positive rectangle dimensions", () => {
  const viewport = { width: 100, height: 100 };
  for (const invalid of [
    rect(0, 0, 0, 20),
    rect(0, 0, 20, 0),
    rect(0, 0, -1, 20),
    rect(0, 0, 20, -1),
  ]) {
    assert.equal(getIpadMenuMotionGeometry(invalid, rect(40, 40, 20, 20), viewport), null);
    assert.equal(getIpadMenuMotionGeometry(rect(0, 0, 20, 20), invalid, viewport), null);
  }
});

test("motion geometry rejects non-finite rectangle coordinates and dimensions", () => {
  const viewport = { width: 100, height: 100 };
  for (const invalid of [
    rect(Number.NaN, 0, 20, 20),
    rect(0, Number.POSITIVE_INFINITY, 20, 20),
    rect(0, 0, Number.NEGATIVE_INFINITY, 20),
    rect(0, 0, 20, Number.NaN),
  ]) {
    assert.equal(getIpadMenuMotionGeometry(invalid, rect(40, 40, 20, 20), viewport), null);
  }
});

test("motion geometry rejects non-positive and non-finite viewport dimensions", () => {
  const header = rect(0, 0, 20, 20);
  const trigger = rect(40, 40, 20, 20);
  for (const viewport of [
    { width: 0, height: 100 },
    { width: 100, height: -1 },
    { width: Number.NaN, height: 100 },
    { width: 100, height: Number.POSITIVE_INFINITY },
  ]) {
    assert.equal(getIpadMenuMotionGeometry(header, trigger, viewport), null);
  }
});

test("motion geometry leaves measured layout objects untouched", () => {
  const header = Object.freeze(rect(14.4, 50.2, 240, 80));
  const trigger = Object.freeze(rect(880.8, 640.6, 60, 60));
  const viewport = Object.freeze({ width: 1024, height: 768 });
  const before = [structuredClone(header), structuredClone(trigger), structuredClone(viewport)];
  getIpadMenuMotionGeometry(header, trigger, viewport);
  assert.deepEqual([header, trigger, viewport], before);
});

test("the root motion state outlives the longest decorative animation but remains short-lived", () => {
  const latestDecorativeFinish = 720 + 76;
  assert.ok(IPAD_MENU_MOTION_SETTLE_MS > latestDecorativeFinish);
  assert.ok(IPAD_MENU_MOTION_SETTLE_MS <= 1000);
});
