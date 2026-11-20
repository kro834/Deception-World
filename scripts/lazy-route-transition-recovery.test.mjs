import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { failedChunkUrl, loaderChunkUrl } from "../src/lib/chunk-retry.js";

const source = readFileSync(new URL("../src/components/load-gate.tsx", import.meta.url), "utf8");
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
assert.ok(pieces.loader && pieces.opening && pieces.illusionculum);

const code = ts.transpileModule(
  `${pieces.loader.replace("import(/* @vite-ignore */ url.href)", "importRetry(url.href)")}
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
  };
  const context = {
    window,
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
    router: { preloadRoute: () => never },
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
    events,
    timers,
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
      ["finish", 1, false],
      ["navigate", "/world"],
      ["focus", "roster"],
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
