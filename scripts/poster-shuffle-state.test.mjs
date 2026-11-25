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
  home.indexOf("  const requestPoster = async"),
  home.indexOf("  const goEpisode ="),
);
const cancel = home.slice(
  home.indexOf("  const cancelPosterShuffle ="),
  home.indexOf("  useEffect(() => mountFilmMotion"),
);
const compiled = ts.transpileModule(
  `${cancel}\n${source}\nglobalThis.shuffle = shufflePoster; globalThis.reset = requestPoster;`,
  {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  },
).outputText;

function harness({ reducedMotion = true, random = 0, deferPresentation = false } = {}) {
  const timers = [];
  const images = [];
  const posters = [];
  const presentations = [];
  const busy = [];
  const failures = [];
  const shuffleActive = { current: false };
  const shuffleRunId = { current: 0 };
  const context = {
    ambientPaused: false,
    heroInViewRef: { current: true },
    useCallback: (callback) => callback,
    motionReduced: reducedMotion,
    poster: 0,
    posterFailure: null,
    prevPoster: null,
    POSTERS: [{ src: "first" }, { src: "second" }, { src: "third" }],
    shuffleActive,
    shuffleRunId,
    shuffleTimers: { current: [] },
    setShuffling: (value) => busy.push(value),
    setLocked: () => {},
    setPosterResetting: () => {},
    cancelPosterFrame: () => {},
    setPosterFailure: (value) => failures.push(value),
    goPoster: async (value, { canShow } = {}) => {
      const ready = deferPresentation
        ? await new Promise((resolve) => presentations.push(resolve))
        : true;
      if (!ready || canShow?.() === false) return false;
      if (value !== context.poster) posters.push(value);
      context.poster = value;
      return true;
    },
    loadPoster: (index, priority = "high") => {
      const image = { index, priority, load: () => {} };
      images.push(image);
      return new Promise((resolve) => {
        image.resolve = () => resolve(true);
        image.timeout = () => resolve(false);
      });
    },
    document: { hidden: false, querySelector: () => null },
    posterShuffleButton: { current: null },
    window: {
      crypto: { getRandomValues: (values) => values.fill(random) },
      clearTimeout: () => {},
      setTimeout: (callback) => timers.push(callback),
    },
  };
  runInNewContext(compiled, context);
  return { ...context, timers, images, posters, presentations, busy, failures };
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
  assert.equal(
    state.timers.length,
    0,
    "the shared loader owns the deadline; there are no preview steps",
  );
});

test("the spinner waits for the actual frame even after detached preload succeeds", async () => {
  const state = harness({ deferPresentation: true });
  state.shuffle();
  state.images[0].resolve();
  await settle();
  assert.equal(state.presentations.length, 1);
  assert.deepEqual(state.busy, [true]);
  assert.deepEqual(state.posters, []);

  state.presentations[0](true);
  await settle();
  assert.deepEqual(state.posters, [state.images[0].index]);
  assert.deepEqual(state.busy, [true, false]);
});

test("a timed-out reduced-motion shuffle clears busy state and cannot replace the poster later", async () => {
  const state = harness();
  state.shuffle();
  state.images[0].timeout();
  await settle();
  assert.deepEqual(state.busy, [true, false]);
  assert.equal(state.shuffleActive.current, false);
  assert.deepEqual(state.posters, []);
  assert.equal(state.failures.at(-1), state.images[0].index, "failure keeps the retry destination");
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
  const state = harness({ reducedMotion: false, random: 1 });
  state.shuffle();

  assert.equal(state.images.length, 2, "only the final and one next poster are requested");
  state.timers[1]();
  await settle();
  assert.deepEqual(state.posters, [], "an undecoded preview must not replace the current poster");

  state.images[1].load();
  await settle();
  state.timers[1]();
  await settle();
  assert.deepEqual(state.posters, [], "loaded pixels are skipped while decode remains pending");

  state.images[1].resolve();
  await settle();
  state.timers[3]();
  await settle();
  assert.deepEqual(state.posters, [1], "a decoded preview can be shown on a later beat");
});

test("shuffle reuses the final preload if the next preview has the same source", () => {
  const state = harness({ reducedMotion: false });
  state.shuffle();
  assert.equal(state.images.length, 1);
  assert.equal(state.images[0].priority, "high");
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
  state.timers[1]();
  await settle();
  assert.deepEqual(
    state.posters,
    [],
    "a stale timer/decode must not replace the successor shuffle's poster",
  );
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
  // Reset stays keyboard reachable, including while cancelling a shuffle.
  const reset = home.slice(
    home.indexOf('className="poster-reset'),
    home.indexOf("（RESET）") + 340,
  );
  assert.match(reset, /aria-disabled=\{poster === 0 && !shuffling && !posterResetting\}/);
  assert.match(
    reset,
    /if \(poster !== 0 \|\| shuffling \|\| posterResetting\) void requestPoster\(0\)/,
  );
  assert.match(source, /const requestPoster = async[\s\S]*?cancelPosterShuffle\(\);/);
  assert.match(source, /const requestPoster = async[\s\S]*?await goPoster\(next/);
  const lock = home.slice(
    home.indexOf('"poster-lock ios26-glass is-locked"'),
    home.indexOf("<output"),
  );
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
