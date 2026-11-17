import assert from "node:assert/strict";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { sampleFrames } from "./harness/frame-sampling.mjs";

function fakeClock(timestamps, visibilityState = "visible", timerLag = 0) {
  let now = 0;
  let serial = 0;
  let index = 0;
  const pending = new Map();
  const cancelledFrames = [];
  const clearedTimers = [];
  const schedule = (kind, at, callback) => {
    const id = serial++;
    pending.set(id, { kind, at, callback });
    return id;
  };
  const context = {
    performance: { now: () => now },
    document: { visibilityState },
    requestAnimationFrame: (callback) => schedule("raf", timestamps[index++] ?? Infinity, callback),
    cancelAnimationFrame(id) {
      cancelledFrames.push(id);
      pending.delete(id);
    },
    setTimeout: (callback, delay) => schedule("timer", now + delay + timerLag, callback),
    clearTimeout(id) {
      clearedTimers.push(id);
      pending.delete(id);
    },
  };
  const result = runInNewContext(`(${sampleFrames.toString()})()`, context);
  let steps = 0;
  while (pending.size) {
    assert.ok(++steps < 1000, "sampler must terminate without extending the wall deadline");
    const [id, event] = [...pending].sort((a, b) => a[1].at - b[1].at)[0];
    assert.ok(Number.isFinite(event.at), "a terminating wall timer must remain scheduled");
    now = event.at;
    pending.delete(id);
    event.callback(now);
  }
  return { result, pending, cancelledFrames, clearedTimers, elapsed: now };
}

test("a first rAF delayed 1600ms still observes a full 1500ms frame window", async () => {
  const clock = fakeClock(Array.from({ length: 16 }, (_, index) => 1600 + index * 100));
  const result = await clock.result;
  assert.equal(result.completionReason, "window-complete");
  assert.equal(result.firstFrameDelayMs, 1600);
  assert.equal(result.elapsedMs, 3100);
  assert.equal(result.callbackCount, 16);
  assert.equal(result.count, 15);
  assert.equal(result.meanMs, 100);
  assert.equal(result.p95Ms, 100);
  assert.equal(result.maxMs, 100);
  assert.equal(result.visibilityState, "visible");
  assert.equal(clock.elapsed, 3100, "successful completion must cancel the 3500ms timer");
  assert.equal(clock.pending.size, 0);
  assert.equal(clock.clearedTimers.length, 1);
});

test("no rAF callbacks time out at the unchanged wall deadline and cancel pending rAF", async () => {
  const clock = fakeClock([], "hidden");
  const result = await clock.result;
  assert.equal(result.completionReason, "timeout");
  assert.equal(result.elapsedMs, 3500);
  assert.equal(result.firstFrameDelayMs, null);
  assert.equal(result.callbackCount, 0);
  assert.equal(result.count, 0);
  assert.equal(result.meanMs, null);
  assert.equal(result.p95Ms, null);
  assert.equal(result.maxMs, null);
  assert.equal(result.visibilityState, "hidden");
  assert.equal(clock.pending.size, 0);
  assert.equal(clock.cancelledFrames.length, 1);
  assert.equal(clock.clearedTimers.length, 1);
});

test("one late callback cannot complete a window or invent a frame interval", async () => {
  const clock = fakeClock([1600]);
  const result = await clock.result;
  assert.equal(result.completionReason, "timeout");
  assert.equal(result.firstFrameDelayMs, 1600);
  assert.equal(result.elapsedMs, 3500);
  assert.equal(result.callbackCount, 1);
  assert.equal(result.count, 0);
  assert.equal(result.meanMs, null);
  assert.equal(clock.pending.size, 0);
  assert.equal(clock.cancelledFrames.length, 1);
});

test("late partial windows retain observed intervals but never extend the wall timeout", async () => {
  const clock = fakeClock([3000, 3100, 3250, 3400, 3600, 4500]);
  const result = await clock.result;
  assert.equal(result.completionReason, "timeout");
  assert.equal(result.elapsedMs, 3500);
  assert.equal(result.callbackCount, 4);
  assert.equal(result.count, 3);
  assert.equal(result.meanMs, 400 / 3);
  assert.equal(result.p95Ms, 150);
  assert.equal(result.maxMs, 150);
  assert.equal(clock.pending.size, 0);
  assert.equal(clock.cancelledFrames.length, 1);
});

test("a timer delayed behind rendering cannot permit success after the wall deadline", async () => {
  const clock = fakeClock([2200, 2300, 2400, 3700], "visible", 1000);
  const result = await clock.result;
  assert.equal(result.completionReason, "timeout");
  assert.equal(result.elapsedMs, 3700);
  assert.equal(result.count, 2, "the interval delivered after the deadline is excluded");
  assert.equal(result.callbackCount, 4);
  assert.equal(clock.pending.size, 0);
  assert.equal(clock.clearedTimers.length, 1);
});
