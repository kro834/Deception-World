import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const { outputText } = ts.transpileModule(
  readFileSync(
    new URL("../src/components/world/use-world-poster-frames.ts", import.meta.url),
    "utf8",
  ),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
);

function mount() {
  const values = [];
  const effects = [];
  const timers = new Map();
  let position = 0;
  let timerId = 0;
  const exports = {};
  runInNewContext(outputText, {
    exports,
    require: () => ({
      useCallback: (fn) => fn,
      useEffect: (effect, dependencies) => {
        if (!dependencies.length) effects.push(effect());
      },
      useRef: (initial) => (values[position++] ??= { current: initial }),
      useState: (initial) => {
        const index = position++;
        values[index] ??= initial;
        return [
          values[index],
          (value) => {
            values[index] = typeof value === "function" ? value(values[index]) : value;
          },
        ];
      },
    }),
    window: {
      setTimeout: (callback) => {
        timers.set(++timerId, callback);
        return timerId;
      },
      clearTimeout: (id) => timers.delete(id),
    },
  });
  const render = () => {
    position = 0;
    return exports.useWorldPosterFrames();
  };
  return { render, timers, dispose: () => effects[0]() };
}

function loadedImage() {
  let completeDecode;
  const image = {
    currentSrc: "/print.webp",
    complete: true,
    naturalWidth: 1024,
    decode: () =>
      new Promise((resolve) => {
        completeDecode = resolve;
      }),
  };
  return { image, resolve: () => completeDecode() };
}

test("the old poster stays visible while the mounted image decodes and the same frame is promoted", async () => {
  const stage = mount();
  const initial = stage.render();
  const ready = initial.show(5);
  const staged = stage.render();
  const nextFrame = staged.frames.pending;
  const next = loadedImage();
  const work = staged.load(nextFrame, next.image);
  assert.strictEqual(stage.render().frames.current, initial.frames.current);
  next.resolve();
  await work;
  assert.equal(await ready, true);
  assert.strictEqual(stage.render().frames.current, nextFrame);
  assert.strictEqual(stage.render().frames.previous, initial.frames.current);
});

test("the latest poster owns the frame when a previous image finishes late", async () => {
  const stage = mount();
  const initial = stage.render();
  const staleResult = initial.show(13);
  const stale = loadedImage();
  const staleDecode = initial.load(stage.render().frames.pending, stale.image);
  const latest = initial.show(8);
  const latestFrame = stage.render().frames.pending;
  stale.resolve();
  await staleDecode;
  assert.equal(await staleResult, false);
  assert.strictEqual(stage.render().frames.pending, latestFrame);
  assert.strictEqual(stage.render().frames.current, initial.frames.current);

  const next = loadedImage();
  const latestDecode = initial.load(latestFrame, next.image);
  next.resolve();
  await latestDecode;
  assert.equal(await latest, true);
  assert.equal(stage.render().frames.current.index, 8);
});

test("an error retains the decoded poster and the same index is retryable", async () => {
  const stage = mount();
  const initial = stage.render();
  const failed = initial.show(12);
  const failedFrame = stage.render().frames.pending;
  initial.settle(failedFrame, false);
  assert.equal(await failed, false);
  assert.strictEqual(stage.render().frames.current, initial.frames.current);

  const retry = initial.show(12);
  const retryFrame = stage.render().frames.pending;
  assert.notEqual(retryFrame.key, failedFrame.key);
  initial.settle(failedFrame, true);
  assert.strictEqual(stage.render().frames.pending, retryFrame);
  initial.settle(retryFrame, true);
  assert.equal(await retry, true);
  assert.equal(stage.render().frames.current.index, 12);
});

test("the loader rechecks page and selection state before committing a decoded poster", async () => {
  const stage = mount();
  const initial = stage.render();
  let visible = true;
  const result = initial.show(3, { canShow: () => visible });
  const next = loadedImage();
  const decode = initial.load(stage.render().frames.pending, next.image);
  visible = false;
  next.resolve();
  await decode;
  assert.equal(await result, false);
  assert.strictEqual(stage.render().frames.current, initial.frames.current);
});

test("a stalled mounted image times out and unmount settles in-flight work", async () => {
  const stage = mount();
  const initial = stage.render();
  const result = initial.show(9);
  [...stage.timers.values()][0]();
  assert.equal(await result, false);
  assert.equal(stage.timers.size, 0);
  assert.strictEqual(stage.render().frames.current, initial.frames.current);
  const unmounted = initial.show(5);
  stage.dispose();
  assert.equal(await unmounted, false);
  assert.equal(stage.timers.size, 0);
});
