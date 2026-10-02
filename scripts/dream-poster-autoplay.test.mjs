import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { createReadyPosterLoader } from "../src/lib/ready-poster-loader.js";

// Execute the component's actual effect, including its guards and cleanup,
// rather than keeping a second implementation of its retry loop in the test.
const source = readFileSync(
  new URL("../src/components/dream-chapter/dream-chapter.tsx", import.meta.url),
  "utf8",
);
const tree = ts.createSourceFile(
  "dream-chapter.tsx",
  source,
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX,
);
let effect;
function visit(node) {
  if (ts.isCallExpression(node) && node.expression.getText(tree) === "useEffect") {
    const callback = node.arguments[0]?.getText(tree);
    if (
      callback?.includes("const selection = posterSelectionId.current") &&
      callback.includes("commitPoster(next)")
    )
      effect = callback;
  }
  ts.forEachChild(node, visit);
}
visit(tree);
assert.ok(effect, "the actual Dream autoplay effect must be found");
const compiled = ts.transpileModule(`globalThis.startAutoplay = ${effect};`, {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText;
const settle = () => new Promise((resolve) => setImmediate(resolve));

function harness(overrides = {}) {
  const timers = new Map();
  const images = [];
  const commits = [];
  const loads = [];
  let serial = 0;
  const clock = {
    setTimeout(callback, delay) {
      timers.set(++serial, { callback, delay });
      return serial;
    },
    clearTimeout: (id) => timers.delete(id),
  };
  class PosterImage extends EventTarget {
    complete = false;
    naturalWidth = 0;
    constructor() {
      super();
      images.push(this);
      this.decoded = new Promise((resolve) => {
        this.resolve = resolve;
      });
    }
    decode() {
      return this.decoded;
    }
    load() {
      this.complete = true;
      this.naturalWidth = 1000;
      this.dispatchEvent(new Event("load"));
    }
    fail() {
      this.dispatchEvent(new Event("error"));
    }
  }
  const loader = createReadyPosterLoader(
    (image, value) => {
      image.src = value;
    },
    {
      ImageClass: PosterImage,
      clock,
    },
  );
  const context = {
    window: clock,
    posterLocked: false,
    posterShuffling: false,
    posterLoading: false,
    posterControlsFocused: false,
    posterVisible: true,
    posterMotionEnabled: true,
    menuOpen: false,
    character: null,
    dolminenceRecord: null,
    posterIndex: 0,
    posterSelectionId: { current: 0 },
    DREAM_POSTERS: [{ src: "one" }, { src: "two" }, { src: "three" }],
    loadPoster(index, priority) {
      loads.push({ index, priority });
      return loader.load(context.DREAM_POSTERS[index].src, priority);
    },
    commitPoster: (index) => commits.push(index),
    ...overrides,
  };
  runInNewContext(compiled, context);
  const cleanup = context.startAutoplay();
  return {
    context,
    timers,
    images,
    commits,
    loads,
    loader,
    cleanup,
    fire(delay) {
      const next = [...timers].find(([, timer]) => timer.delay === delay);
      assert.ok(next, `a ${delay}ms timer must be scheduled`);
      const [id, timer] = next;
      timers.delete(id);
      timer.callback();
    },
  };
}

test("autoplay retries a timeout and load failure, then publishes only a decoded retry", async () => {
  const h = harness();
  h.fire(5200);
  h.fire(8000);
  await settle();
  assert.deepEqual(h.commits, []);
  assert.equal(h.timers.size, 1);
  h.fire(5200);
  h.images[1].fail();
  await settle();
  assert.deepEqual(h.commits, []);
  h.fire(10400);
  h.images[2].load();
  await settle();
  assert.deepEqual(h.commits, [], "network completion alone cannot replace the current poster");
  h.images[2].resolve();
  await settle();
  assert.deepEqual(h.commits, [1]);
  assert.equal(h.timers.size, 0);
  assert.deepEqual(h.loads, [
    { index: 1, priority: "low" },
    { index: 1, priority: "low" },
    { index: 1, priority: "low" },
  ]);
  h.cleanup();
  h.loader.dispose();
});

test("repeated failures back off to a bounded thirty-second interval", async () => {
  const h = harness();
  h.fire(5200);
  for (const delay of [5200, 10400, 20800, 30000, 30000]) {
    h.images.at(-1).fail();
    await settle();
    assert.equal(h.timers.size, 1);
    h.fire(delay);
  }
  assert.deepEqual(h.commits, []);
  h.cleanup();
  h.loader.dispose();
  await settle();
  assert.equal(h.timers.size, 0);
});

test("cleanup removes a scheduled retry without starting another request", async () => {
  const h = harness();
  h.fire(5200);
  h.images[0].fail();
  await settle();
  assert.equal(h.timers.size, 1);
  h.cleanup();
  assert.equal(h.timers.size, 0);
  assert.equal(h.loads.length, 1);
  h.loader.dispose();
});

test("cleanup invalidates both late success and late failure of a pending load", async () => {
  for (const ready of [true, false]) {
    const h = harness();
    h.fire(5200);
    h.cleanup();
    if (ready) {
      h.images[0].load();
      h.images[0].resolve();
    } else h.images[0].fail();
    await settle();
    assert.deepEqual(h.commits, []);
    assert.equal(h.timers.size, 0, "late failure must not resurrect a retry timer");
    h.loader.dispose();
  }
});

test("a newer manual selection suppresses stale autoplay success and retry", async () => {
  for (const ready of [true, false]) {
    const h = harness();
    h.fire(5200);
    h.context.posterSelectionId.current++;
    if (ready) {
      h.images[0].load();
      h.images[0].resolve();
    } else h.images[0].fail();
    await settle();
    assert.deepEqual(h.commits, []);
    assert.equal(h.timers.size, 0);
    h.cleanup();
    h.loader.dispose();
  }
});

test("late decode from a timed-out attempt cannot defeat its retry", async () => {
  const h = harness();
  h.fire(5200);
  h.images[0].load();
  h.fire(8000);
  await settle();
  h.fire(5200);
  h.images[0].resolve();
  await settle();
  assert.deepEqual(h.commits, []);
  h.images[1].load();
  h.images[1].resolve();
  await settle();
  assert.deepEqual(h.commits, [1]);
  h.cleanup();
  h.loader.dispose();
});

test("all autoplay pause guards leave requests and timers untouched", () => {
  for (const override of [
    { posterLocked: true },
    { posterShuffling: true },
    { posterLoading: true },
    { posterControlsFocused: true },
    { posterVisible: false },
    { posterMotionEnabled: false },
    { menuOpen: true },
    { character: {} },
    { dolminenceRecord: {} },
  ]) {
    const h = harness(override);
    assert.equal(h.cleanup, undefined);
    assert.equal(h.timers.size, 0);
    assert.equal(h.loads.length, 0);
    h.loader.dispose();
  }
});
