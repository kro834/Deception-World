import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { failedChunkUrl, loaderChunkUrl } from "../src/lib/chunk-retry.js";

const source = readFileSync(new URL("../src/components/load-gate.tsx", import.meta.url), "utf8");
const deadlineSource = readFileSync(
  new URL("../src/lib/route-warmup-deadline.ts", import.meta.url),
  "utf8",
).replaceAll("export ", "");
const tree = ts.createSourceFile(
  "load-gate.tsx",
  source,
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX,
);
const pieces = {};
function visit(node) {
  if (ts.isFunctionDeclaration(node) && node.name?.text === "createTransitionLayerLoader")
    pieces.loader = node.getText(tree);
  if (ts.isFunctionDeclaration(node) && node.name?.text === "navigateUnderCover")
    pieces.navigate = node.getText(tree);
  if (ts.isFunctionDeclaration(node) && node.name?.text === "settleUnderCover")
    pieces.paint = node.getText(tree);
  if (!ts.isIfStatement(node)) {
    ts.forEachChild(node, visit);
    return;
  }
  if (node.expression.getText(tree) === "transitionCovered") pieces.opening = node.getText(tree);
  if (node.expression.getText(tree) === "needsIllusionculumSequence")
    pieces.illusionculum = node.getText(tree);
  ts.forEachChild(node, visit);
}
visit(tree);
assert.ok(pieces.loader && pieces.opening && pieces.illusionculum && pieces.navigate && pieces.paint);

const code = ts.transpileModule(
  `${deadlineSource}
   ${pieces.navigate}
   ${pieces.paint}
   ${pieces.loader.replace("import(/* @vite-ignore */ url.href)", "importRetry(url.href)")}
   globalThis.makeLoader = createTransitionLayerLoader;
   globalThis.openWorld = async () => { ${pieces.opening} };
   globalThis.prepareIllusionculum = async () => {
     let illusionculumPlayback;
     let startedAt;
     ${pieces.illusionculum}
     return { playback: illusionculumPlayback, startedAt };
   };`,
  { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } },
).outputText;

function fixture() {
  const timers = new Map();
  const frames = new Map();
  const events = [];
  const never = new Promise(() => {});
  const window = {
    setTimeout(fn, duration) {
      const id = Symbol();
      timers.set(id, { fn, duration });
      return id;
    },
    clearTimeout(id) {
      timers.delete(id);
    },
    requestAnimationFrame(fn) {
      const id = Symbol();
      frames.set(id, fn);
      return id;
    },
    cancelAnimationFrame(id) {
      frames.delete(id);
    },
  };
  const controller = new AbortController();
  const context = {
    window,
    setTimeout: window.setTimeout,
    clearTimeout: window.clearTimeout,
    requestSignal: controller.signal,
    reportDelay: () => events.push(["delay"]),
    URL,
    failedChunkUrl,
    loaderChunkUrl,
    waits: [],
    wait(duration) {
      context.waits.push(duration);
      return never;
    },
    transitionCovered: true,
    transitionId: { current: 1 },
    to: "/world",
    assets: ["/world.webp"],
    router: {
      preloadRoute: async () => undefined,
      subscribe: () => () => undefined,
    },
    preloadAssets: () => never,
    setOpeningSnapshot: (value) => events.push(["snapshot", value]),
    setDocumentLoading: (value) => events.push(["loading", value]),
    navigate: async ({ to }) => events.push(["navigate", to]),
    focusDestination: true,
    focusRouteDestination: (hash) => events.push(["focus", hash]),
    finishOpeningHandoff(token, restoreFocus) {
      context.openingHandoff.current = null;
      events.push(["finish", token, restoreFocus]);
    },
    hash: "roster",
    navigationSearch: undefined,
    needsIllusionculumSequence: true,
    isCurrent: () => context.transitionId.current === 1,
    illusionculumTransition: { current: null },
    requestId: 1,
    createEntryPlayback: () => ({ cancel() {} }),
    rexonanceCoverCancel: { current: null },
    clock: { wait: (promise) => promise },
    performance: { now: () => 50 },
  };
  runInNewContext(code, context);
  return {
    context,
    controller,
    events,
    timers,
    frames,
    expire(duration) {
      for (const [id, timer] of timers) {
        if (timer.duration !== duration) continue;
        timers.delete(id);
        timer.fn();
      }
    },
  };
}

for (const failure of ["rejection", "deadline"]) {
  test(`opening ${failure} skips cover and arrival waits and releases the handoff`, async () => {
    const { context, events, expire } = fixture();
    const renderer = () => null;
    let requests = 0;
    const retries = [];
    context.importRetry = async (url) => {
      retries.push(url);
      return renderer;
    };
    context.openingHandoffLayer = context.makeLoader(
      () => {
        if (++requests > 1) return Promise.resolve(renderer);
        if (failure === "rejection")
          return Promise.reject(
            new Error("Failed to fetch https://example.test/assets/opening.js"),
          );
        return new Promise(() => {});
      },
      (loaded) => loaded,
      3000,
    );
    const layer = context.openingHandoffLayer.load();
    context.openingHandoff = { current: { token: 1, covered: { promise: layer.then(Boolean) } } };
    const result = context.openWorld();
    if (failure === "deadline") expire(3000);
    await result;
    assert.deepEqual(events, [
      ["snapshot", null],
      ["loading", false],
      ["navigate", "/world"],
      ["focus", "roster"],
      ["finish", 1, undefined],
    ]);
    assert.deepEqual(context.waits, [3000]);
    assert.equal(await context.openingHandoffLayer.load(), renderer);
    if (failure === "rejection") {
      assert.equal(requests, 1);
      assert.match(retries[0], /^https:\/\/example\.test\/assets\/opening\.js\?retry=/);
    } else {
      assert.equal(requests, 2);
      assert.deepEqual(retries, []);
    }
  });
}

test("a stalled opening route preload releases its cover and keeps the current title", async () => {
  const { context, events, expire, timers } = fixture();
  context.openingHandoffLayer = { cached: true };
  context.openingHandoff = { current: { token: 1, covered: { promise: Promise.resolve(true) } } };
  let finishRoute;
  context.router.preloadRoute = () => new Promise((resolve) => { finishRoute = resolve; });
  const result = context.openWorld();
  await Promise.resolve();
  assert.equal(typeof finishRoute, "function");
  expire(12_000);
  await result;
  assert.deepEqual(events, [["delay"], ["finish", 1, undefined]]);
  assert.equal(timers.size, 0);
  finishRoute();
  await Promise.resolve();
  assert.equal(events.some(([event]) => event === "navigate"), false);
});

test("a newer navigation aborts opening readiness without committing or releasing its cover", async () => {
  const { context, controller, events, timers } = fixture();
  context.openingHandoffLayer = { cached: true };
  context.openingHandoff = { current: { token: 1, covered: { promise: Promise.resolve(true) } } };
  let finishRoute;
  context.router.preloadRoute = () => new Promise((resolve) => { finishRoute = resolve; });
  const result = context.openWorld();
  await Promise.resolve();
  context.transitionId.current = 2;
  context.openingHandoff.current = { token: 2 };
  controller.abort();
  await result;
  assert.deepEqual(events, []);
  assert.equal(context.openingHandoff.current.token, 2);
  assert.equal(timers.size, 0);
  finishRoute();
});

test("opening arrival lets the destination scroll and completes even without painted frames", async () => {
  const { context, events, frames, timers, expire } = fixture();
  const destination = { path: "/world" };
  context.openingHandoffLayer = { cached: true };
  context.openingHandoff = {
    current: {
      token: 1,
      covered: { promise: Promise.resolve(true) },
      destination: { promise: Promise.resolve(destination) },
      animation: { promise: Promise.resolve() },
    },
  };
  const result = context.openWorld();
  for (let turn = 0; !frames.size && turn < 24; turn += 1) await Promise.resolve();
  assert.equal(frames.size, 1);
  assert.ok(events.some(([event, value]) => event === "snapshot" && value.phase === "arriving"));
  assert.deepEqual(events.at(-1), ["loading", false]);
  const paintTimer = [...timers.values()].find(({ duration }) => duration < 1000);
  assert.ok(paintTimer, "the pending frame must have a short deadline");
  expire(paintTimer.duration);
  await result;
  assert.deepEqual(events.at(-1), ["finish", 1, undefined]);
  assert.equal(frames.size, 0);
  assert.equal(timers.size, 0);
});

test("Illusionculum falls back cleanly on a stalled import and can play on the next entry", async () => {
  const { context, timers, expire } = fixture();
  let finishLateImport;
  const stalled = new Promise((resolve) => {
    finishLateImport = resolve;
  });
  const renderer = () => null;
  let requests = 0;
  context.illusionculumEntrySequence = context.makeLoader(
    () => (++requests === 1 ? stalled : Promise.resolve(renderer)),
    (loaded) => loaded,
    1800,
  );
  const fallback = context.prepareIllusionculum();
  expire(1800);
  const result = await fallback;
  assert.equal(result.playback, undefined);
  assert.equal(result.startedAt, 50);
  assert.equal(context.illusionculumTransition.current, null);
  assert.equal(context.rexonanceCoverCancel.current, null);
  assert.match(source, /needsIllusionculumSequence && !illusionculumPlayback\)\s*\? CALM_TIMINGS/);

  const retry = await context.prepareIllusionculum();
  assert.ok(retry.playback);
  assert.equal(context.illusionculumTransition.current, 1);
  assert.equal(context.rexonanceCoverCancel.current, retry.playback.cancel);
  finishLateImport(() => null);
  await stalled;
  assert.equal(context.illusionculumEntrySequence.cached, renderer);
  assert.equal(timers.size, 0);
});
