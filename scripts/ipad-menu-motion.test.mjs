import assert from "node:assert/strict";
import test from "node:test";
import {
  getIpadMenuMotionGeometry,
  advanceIpadMenuSpring,
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

test("spring travel agrees across 30, 60, 90 and 120 Hz and seats within the lifetime", () => {
  const final = [];
  for (const hz of [30, 60, 90, 120]) {
    let state = { pose: { x: 972, y: -38 }, velocity: {} };
    let furthest = -Infinity;
    for (let frame = 0; frame < hz * 0.9; frame++) {
      state = advanceIpadMenuSpring(state, { x: 970, y: 626 }, 1000 / hz);
      furthest = Math.max(furthest, state.pose.y);
    }
    assert.ok(furthest > 626 && furthest < 632, "overshoot stays below 1% of a 664px flight");
    assert.ok(Math.abs(state.pose.y - 626) < 0.01);
    assert.ok(Math.abs(state.velocity.y) < 0.1);
    final.push(state.pose.y);
  }
  assert.ok(Math.max(...final) - Math.min(...final) < 1e-8);
  assert.equal(IPAD_MENU_MOTION_SETTLE_MS, 900);
});

test("a spring reversal preserves position and momentum and settles at the new destination", () => {
  let state = { pose: { x: 0, y: 0, fold: 0 }, velocity: {} };
  for (let frame = 0; frame < 9; frame++) {
    state = advanceIpadMenuSpring(state, { x: 2, y: 664, fold: 1 }, 1000 / 60);
  }
  const before = structuredClone(state);
  const reversed = advanceIpadMenuSpring(state, { x: 0, y: 0, fold: 0 }, 0);
  assert.deepEqual(reversed, before, "retarget itself must not teleport or discard velocity");
  assert.deepEqual(state, before, "the solver never mutates a captured frame");
  for (let frame = 0; frame < 54; frame++) {
    state = advanceIpadMenuSpring(state, { x: 0, y: 0, fold: 0 }, 1000 / 60);
  }
  assert.ok(Math.abs(state.pose.y) < 0.01);
  assert.ok(Math.abs(state.velocity.y) < 0.1);
  assert.ok(Math.abs(state.pose.fold) < 0.001);
});

test("a delayed frame is bounded, and invalid or negative elapsed time does not advance motion", () => {
  const state = { pose: { y: 0 }, velocity: { y: 0 } };
  const target = { y: 664 };
  for (const dt of [0, -1, NaN, Infinity]) {
    assert.deepEqual(advanceIpadMenuSpring(state, target, dt), state);
  }
  assert.deepEqual(
    advanceIpadMenuSpring(state, target, 10_000),
    advanceIpadMenuSpring(state, target, 64),
  );
});

test("the visible shell lands on the real button bounds without a translucent duplicate", async () => {
  const { getCompactMenuPose, paintCompactMenuShell } =
    await import("../src/lib/compact-menu-motion.js");
  const element = { style: {} };
  const host = { x: 941, y: 597 };
  const target = getCompactMenuPose(rect(940, 596, 60, 60), true);
  let state = { pose: getCompactMenuPose(rect(950, -60, 44, 44), false), velocity: {} };
  for (let frame = 0; frame < 54; frame++) state = advanceIpadMenuSpring(state, target, 1000 / 60);
  paintCompactMenuShell(element, state, host);
  assert.ok(Math.abs(parseFloat(element.style.width) - 60) < 0.01);
  assert.ok(Math.abs(parseFloat(element.style.height) - 60) < 0.01);
  assert.ok(Math.abs(parseFloat(element.style.borderRadius) - 30) < 0.01);
  const translated = [...element.style.transform.matchAll(/(-?[\d.]+)px/g)].map((value) =>
    Number(value[1]),
  );
  assert.ok(Math.abs(translated[0] + 1) < 0.01);
  assert.ok(Math.abs(translated[1] + 1) < 0.01);
  assert.equal(element.style.opacity, "1");
});

test("native inline declarations including priority survive shell painting exactly", async () => {
  const {
    captureCompactMenuStyles,
    restoreCompactMenuStyles,
    paintCompactMenuShell,
    getCompactMenuPose,
  } = await import("../src/lib/compact-menu-motion.js");
  const original = "transform: none !important; opacity: 0.7; --route-accent: gold;";
  const element = { style: { cssText: original } };
  const snapshot = captureCompactMenuStyles(element);
  paintCompactMenuShell(
    element,
    { pose: getCompactMenuPose(rect(10, 20, 60, 60), true), velocity: {} },
    { x: 0, y: 0 },
  );
  element.style.cssText = "width: 60px;";
  restoreCompactMenuStyles(element, snapshot);
  assert.equal(element.style.cssText, original);
});
