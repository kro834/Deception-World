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
const compiled = ts.transpileModule(`${source}\nglobalThis.shuffle = shufflePoster;`, {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText;

function harness() {
  const timers = [];
  const images = [];
  const posters = [];
  const busy = [];
  const shuffleActive = { current: false };
  const shuffleRunId = { current: 0 };
  const context = {
    ambientPaused: false,
    motionReduced: true,
    poster: 0,
    prevPoster: null,
    POSTERS: [{ src: "first" }, { src: "second" }, { src: "third" }],
    shuffleActive,
    shuffleRunId,
    shuffleTimers: { current: [] },
    setShuffling: (value) => busy.push(value),
    setLocked: () => {},
    goPoster: (value) => posters.push(value),
    preparePosterImage: () => {},
    window: {
      crypto: { getRandomValues: (values) => values.fill(0) },
      clearTimeout: () => {},
      setTimeout: (callback) => timers.push(callback),
    },
    Image: class {
      complete = false;
      naturalWidth = 0;
      constructor() {
        images.push(this);
      }
      decode() {
        return new Promise((resolve, reject) => {
          this.resolve = resolve;
          this.reject = reject;
        });
      }
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
  assert.equal(state.timers.length, 1, "only the image deadline is scheduled, not preview steps");
});

test("a timed-out reduced-motion shuffle clears busy state and cannot replace the poster later", async () => {
  const state = harness();
  state.shuffle();
  state.timers[0]();
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
