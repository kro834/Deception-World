import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const home = readFileSync(
  new URL("../src/components/world/world-home.tsx", import.meta.url),
  "utf8",
);
const source = home.slice(
  home.indexOf("  const shufflePoster = () => {"),
  home.indexOf("  const goEpisode ="),
);
const cancel = home.match(/const cancelPosterShuffle = useCallback\([\s\S]*?\n {2}}, \[\]\);/)[0];
const compiled = ts.transpileModule(`${cancel}\n${source}\nglobalThis.shuffle = shufflePoster;`, {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText;

function harness({ reducedMotion = true } = {}) {
  const timers = [];
  const images = [];
  const posters = [];
  const busy = [];
  const shuffleActive = { current: false };
  const shuffleRunId = { current: 0 };
  const context = {
    ambientPaused: false,
    heroInViewRef: { current: true },
    useCallback: (callback) => callback,
    motionReduced: reducedMotion,
    poster: 0,
    prevPoster: null,
    POSTERS: [{ src: "first" }, { src: "second" }, { src: "third" }],
    shuffleActive,
    shuffleRunId,
    shuffleTimers: { current: [] },
    setShuffling: (value) => busy.push(value),
    setLocked: () => {},
    goPoster: (value) => posters.push(value),
    loadPoster: (index, priority) => {
      const image = { index, priority, load: () => {} };
      images.push(image);
      return new Promise((resolve) => {
        image.resolve = () => resolve(true);
        image.timeout = () => resolve(false);
      });
    },
    window: {
      crypto: { getRandomValues: (values) => values.fill(0) },
      clearTimeout: () => {},
      setTimeout: (callback) => timers.push(callback),
    },
  };
  runInNewContext(compiled, context);
  return { ...context, timers, images, posters, busy };
}

const settle = () => new Promise((resolve) => setImmediate(resolve));

test("reduced-motion shuffle stays busy during decode and completes without preview animation", async () => {
  const state = harness();
  state.shuffle();
  assert.deepEqual(state.busy, [true]);
  assert.equal(state.shuffleActive.current, true);
  state.shuffle();
  assert.equal(state.images.length, 1, "repeat activation must not start a second shuffle");
  state.images[0].resolve();
  await settle();
  assert.deepEqual(state.busy, [true, false]);
  assert.equal(state.shuffleActive.current, false);
  assert.equal(state.posters.length, 1);
  assert.equal(state.timers.length, 0, "the shared loader owns the deadline; there are no preview steps");
});

test("a timed-out reduced-motion shuffle clears busy state and cannot replace the poster later", async () => {
  const state = harness();
  state.shuffle();
  state.images[0].timeout();
  await settle();
  assert.deepEqual(state.busy, [true, false]);
  assert.equal(state.shuffleActive.current, false);
  assert.deepEqual(state.posters, []);
  state.images[0].resolve();
  await settle();
  assert.deepEqual(state.posters, []);
  assert.deepEqual(state.busy, [true, false]);
});

test("cancelled reduced-motion decode cannot overwrite a newer interaction", async () => {
  const state = harness();
  state.shuffle();
  state.shuffleRunId.current += 1;
  state.shuffleActive.current = false;
  state.setShuffling(false);
  state.images[0].resolve();
  await settle();
  assert.deepEqual(state.posters, []);
  assert.deepEqual(state.busy, [true, false]);
});

test("normal-motion previews skip undecoded posters and use them after decode", async () => {
  const state = harness({ reducedMotion: false });
  state.shuffle();

  assert.equal(state.images.length, 3, "the final poster preload is reused when it is also a preview");
  state.timers[0]();
  await settle();
  assert.deepEqual(state.posters, [], "an undecoded preview must not replace the current poster");

  state.images[0].load();
  await settle();
  state.timers[0]();
  await settle();
  assert.deepEqual(state.posters, [], "loaded pixels are still skipped while decode remains pending");

  state.images.forEach((image) => image.resolve());
  await settle();
  state.timers[1]();
  await settle();
  assert.equal(state.posters.length, 1, "a decoded preview can be shown on a later beat");
});

test("late normal-motion preview decode from a cancelled shuffle cannot affect its successor", async () => {
  const state = harness({ reducedMotion: false });
  state.shuffle();
  const cancelledImages = [...state.images];
  state.shuffleActive.current = false;
  state.shuffleRunId.current += 1;
  state.shuffle();

  cancelledImages.forEach((image) => image.resolve());
  await settle();
  state.timers[0]();
  await settle();
  assert.deepEqual(state.posters, [], "a stale timer/decode must not replace the successor shuffle's poster");
});

test("a cancelled final settle cannot clear the busy state of a newer shuffle", async () => {
  const state = harness({ reducedMotion: false });
  state.shuffle();
  state.images[0].resolve();
  await settle();
  await state.timers[9]();
  const oldSettle = state.timers.at(-1);
  state.shuffleActive.current = false;
  state.shuffleRunId.current += 1;
  state.shuffle();
  oldSettle();
  assert.equal(state.shuffleActive.current, true);
  assert.equal(state.busy.at(-1), true);
});

test("reset and lock are available to cancel image work while shuffle is busy", () => {
  const reset = home.slice(home.indexOf('className="poster-reset'), home.indexOf('className={\n                  locked'));
  assert.match(reset, /disabled=\{poster === 0 && !shuffling\}/);
  assert.match(reset, /cancelPosterShuffle\(\);\s*goPoster\(0\)/);
  const lock = home.slice(home.indexOf('"poster-lock ios26-glass is-locked"'), home.indexOf('<output'));
  assert.doesNotMatch(lock, /disabled=\{shuffling\}/);
  assert.match(lock, /cancelPosterShuffle\(\);\s*setLocked/);
});

for (const reducedMotion of [true, false]) {
  test(`offscreen decode is cancelled before the scroll-settled React state (reduced=${reducedMotion})`, async () => {
    const state = harness({ reducedMotion });
    state.shuffle();
    state.heroInViewRef.current = false;
    state.images[0].resolve();
    await settle();
    if (!reducedMotion) await state.timers[9]();
    assert.deepEqual(state.posters, []);
    assert.equal(state.shuffleActive.current, false);
    assert.equal(state.busy.at(-1), false);
  });
}
