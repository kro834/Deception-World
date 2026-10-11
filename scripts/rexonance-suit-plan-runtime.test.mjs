import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";
import * as calls from "../src/lib/rexonance-calls.ts";
import * as suit from "../src/lib/rexonance-suit.ts";
import * as gold from "../src/lib/rexonance-suit-gold.ts";

const source = readFileSync(
  new URL("../src/components/rexonance-saga/rexonance-suit-plan.ts", import.meta.url),
  "utf8",
);

// Exercise the real plan/BFS and preparation queue. Canvas calls are counted;
// image decoding and CPU-throttled first-paint checks belong to browser QA.
function planRuntime({ idle = true, decoded = true, canCancelIdle = true } = {}) {
  let now = 0;
  let closeCount = 0;
  let taskId = 0;
  const queued = [];
  const cancelled = [];
  const drawn = [];
  const options = { failDraw: false, contextAvailable: true };
  const art = { kind: "atlas", close: () => closeCount++ };
  const raw = { kind: "raw-gold", close: () => closeCount++ };
  const sources = new Map(decoded ? [[suit.REXONANCE_SUIT_ATLAS.src, art],
    [suit.REXONANCE_SUIT_GOLD_ATLAS.src, raw]] : []);
  const context = {
    clearRect() { drawn.push("clear"); },
    drawImage(image) {
      if (options.failDraw) throw new Error("invalidated bitmap");
      drawn.push(image.kind);
    },
  };
  const canvas = { getContext: () => options.contextAvailable ? context : null };
  const exports = {};
  const schedule = (kind, callback) => {
    const task = Object.assign(callback, { kind, id: ++taskId });
    queued.push(task);
    return task.id;
  };
  const cancel = (id) => {
    const index = queued.findIndex((task) => task.id === id);
    if (index >= 0) cancelled.push(...queued.splice(index, 1));
  };
  const code = ts.transpileModule(source + `
    export const __buildState = () => ({ count: building.length, complete: Boolean(PLATES) });
  `, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const runtime = {
    exports,
    atob,
    // Each clock read consumes a small deterministic slice; no test depends
    // on this machine's actual CPU, garbage collector or frame cadence.
    performance: { now: () => (now += 2) },
    document: { createElement: () => canvas },
    requestAnimationFrame: (callback) => schedule("frame", () => callback(now)),
    cancelAnimationFrame: cancel,
    require(name) {
      if (name === "@/lib/rexonance-calls") return calls;
      if (name === "@/lib/rexonance-suit") return suit;
      if (name === "@/lib/rexonance-suit-gold") return gold;
      if (name === "@/lib/rexonance-suit-warmup")
        return { rexonanceSuitSource: (url) => sources.get(url) ?? null };
      throw new Error(`unexpected module ${name}`);
    },
  };
  if (idle) {
    runtime.requestIdleCallback = (callback) =>
      schedule("idle", () => callback({ timeRemaining: () => 50 }));
    if (canCancelIdle) runtime.cancelIdleCallback = cancel;
  }
  runInNewContext(code, runtime);
  return {
    plan: exports,
    queued,
    cancelled,
    drawn,
    options,
    sources,
    art,
    raw,
    closed: () => closeCount,
    flush() {
      for (let i = 0; queued.length; i++) {
        assert.ok(i < 100, "sliced preparation must finish");
        queued.shift()();
      }
    },
  };
}

const flushPromises = async () => {
  for (let i = 0; i < 4; i++) await Promise.resolve();
};

function snapshot(plan) {
  return JSON.stringify({
    plates: plan.plates(),
    cells: Object.fromEntries(Object.entries(plan.cells()).map(([key, values]) =>
      [key, Array.from(values)])),
    surges: plan.planSurges().map((surge) => ({
      ...surge, cells: Array.from(surge.cells), reach: Array.from(surge.reach),
    })),
    end: plan.planEnd(),
  });
}

test("overlapping warm/intention preparations share one build and one queued slice", async () => {
  const ui = planRuntime();
  const first = ui.plan.prepareRexonanceSuit();
  const built = ui.plan.__buildState().count;
  assert.ok(built > 0 && built < suit.REXONANCE_SUIT_PIECES.length);
  for (let i = 0; i < 10; i++) assert.equal(ui.plan.prepareRexonanceSuit(), first);
  assert.equal(ui.plan.__buildState().count, built);
  assert.equal(ui.queued.length, 1);
  ui.flush();
  assert.equal(await first, true);
  assert.equal(ui.plan.__buildState().count, suit.REXONANCE_SUIT_PIECES.length);
  assert.deepEqual(ui.drawn, ["clear", "atlas", "raw-gold"]);
});

test("a generous idle deadline still respects the plan's own short slice budget", async () => {
  const ui = planRuntime();
  const preparing = ui.plan.prepareRexonanceSuit();
  const before = ui.plan.__buildState().count;
  ui.queued.shift()();
  const after = ui.plan.__buildState().count;
  assert.ok(after > before && after < suit.REXONANCE_SUIT_PIECES.length,
    "50 ms from requestIdleCallback must not force the remaining 60-plate build");
  assert.equal(ui.queued.length, 1);
  ui.flush();
  assert.equal(await preparing, true);
});

test("high intent promotes a low idle job to one frame without rebuilding or forking it", async () => {
  const ui = planRuntime();
  const preparing = ui.plan.prepareRexonanceSuit();
  const before = ui.plan.__buildState().count;
  const idle = ui.queued[0];
  assert.equal(idle.kind, "idle");
  assert.equal(ui.plan.prepareRexonanceSuit("high"), preparing);
  assert.equal(ui.plan.__buildState().count, before, "promotion must yield rather than rebuild now");
  assert.equal(ui.cancelled[0], idle);
  assert.equal(ui.queued.length, 1);
  assert.equal(ui.queued[0].kind, "frame");
  const frame = ui.queued[0];
  for (let i = 0; i < 10; i++) {
    assert.equal(ui.plan.prepareRexonanceSuit("high"), preparing);
    assert.equal(ui.plan.prepareRexonanceSuit("low"), preparing);
  }
  assert.equal(ui.cancelled.length, 1);
  assert.equal(ui.queued[0], frame);
  idle(); // A host may still deliver an already-cancelled idle callback.
  assert.equal(ui.plan.__buildState().count, before);
  assert.equal(ui.queued[0], frame);
  ui.flush();
  assert.equal(await preparing, true);
  assert.equal(ui.queued.length, 0);
  const drawn = ui.drawn.length;
  idle();
  assert.equal(ui.drawn.length, drawn, "settled callbacks cannot reset the prepared atlas");
  assert.equal(ui.queued.length, 0);
});

test("a new high-priority job stays on frames while the default remains idle", async () => {
  const low = planRuntime();
  const lowJob = low.plan.prepareRexonanceSuit();
  assert.equal(low.queued[0].kind, "idle");
  low.flush();
  assert.equal(await lowJob, true);

  const high = planRuntime();
  const highJob = high.plan.prepareRexonanceSuit("high");
  for (let i = 0; high.queued.length; i++) {
    assert.ok(i < 100, "urgent preparation must not create an endless frame queue");
    assert.equal(high.queued.length, 1);
    assert.equal(high.queued[0].kind, "frame", "high priority cannot return to idle timeout");
    high.queued.shift()();
  }
  assert.equal(await highJob, true);
  assert.equal(snapshot(high.plan), snapshot(low.plan));
});

test("uncancellable stale idle callbacks cannot clear or duplicate a promoted frame", async () => {
  const ui = planRuntime({ canCancelIdle: false });
  const preparing = ui.plan.prepareRexonanceSuit();
  const before = ui.plan.__buildState().count;
  const idle = ui.queued[0];
  assert.equal(ui.plan.prepareRexonanceSuit("high"), preparing);
  assert.equal(ui.cancelled.length, 0);
  assert.equal(ui.queued.length, 2);
  const frame = ui.queued[1];
  assert.equal(frame.kind, "frame");
  ui.queued.shift()();
  assert.equal(ui.plan.__buildState().count, before);
  assert.equal(ui.queued.length, 1);
  assert.equal(ui.queued[0], frame);
  for (let i = 0; i < 10; i++) assert.equal(ui.plan.prepareRexonanceSuit("high"), preparing);
  assert.equal(ui.queued.length, 1);
  ui.flush();
  assert.equal(await preparing, true);
  idle();
  assert.equal(ui.queued.length, 0);
  assert.deepEqual(ui.drawn, ["clear", "atlas", "raw-gold"]);
});

test("a promoted job settles after a draw failure and can retry without reviving old callbacks", async () => {
  const ui = planRuntime();
  const preparing = ui.plan.prepareRexonanceSuit();
  const idle = ui.queued[0];
  ui.options.failDraw = true;
  assert.equal(ui.plan.prepareRexonanceSuit("high"), preparing);
  assert.doesNotThrow(() => ui.flush());
  assert.equal(await preparing, false);
  assert.equal(ui.queued.length, 0);
  assert.equal(ui.plan.isRexonanceSuitPlanReady(), false);
  await flushPromises();
  ui.options.failDraw = false;
  assert.equal(await ui.plan.prepareRexonanceSuit("high"), true);
  const drawn = ui.drawn.length;
  idle();
  assert.equal(ui.drawn.length, drawn);
  assert.equal(ui.queued.length, 0);
  assert.equal(ui.plan.isRexonanceSuitPlanReady(), true);
  assert.equal(ui.closed(), 0);
});

test("the rAF fallback builds the same deterministic gold/tile plan as synchronous use", async () => {
  const sliced = planRuntime({ idle: false });
  const preparing = sliced.plan.prepareRexonanceSuit();
  sliced.flush();
  assert.equal(await preparing, true);
  const direct = planRuntime();
  assert.equal(snapshot(sliced.plan), snapshot(direct.plan));
  assert.equal(sliced.plan.GOLD_TOTAL, 9962);
  assert.equal(sliced.plan.planEnd(), direct.plan.planEnd());
});

test("a foreground call may finish the plan before idle resumes without rebuilding it", async () => {
  const ui = planRuntime();
  const preparing = ui.plan.prepareRexonanceSuit();
  const all = ui.plan.plates();
  ui.flush();
  assert.equal(await preparing, true);
  assert.equal(ui.plan.plates(), all);
  assert.equal(ui.queued.length, 0);
  assert.equal(ui.plan.__buildState().count, 60);
});

test("missing decoded layers settle false and retry only the retained working atlas", async () => {
  const ui = planRuntime({ decoded: false });
  const preparing = ui.plan.prepareRexonanceSuit();
  ui.flush();
  assert.equal(await preparing, false);
  await flushPromises();
  const all = ui.plan.plates();
  ui.sources.set(suit.REXONANCE_SUIT_ATLAS.src, ui.art);
  ui.sources.set(suit.REXONANCE_SUIT_GOLD_ATLAS.src, ui.raw);
  assert.equal(await ui.plan.prepareRexonanceSuit(), true);
  assert.equal(ui.plan.plates(), all);
  assert.deepEqual(ui.drawn, ["clear", "atlas", "raw-gold"]);
  assert.equal(ui.closed(), 0, "the plan borrows warm-up bitmaps and never closes them");
});

test("a draw failure in a later idle slice settles and can safely retry", async () => {
  const ui = planRuntime();
  ui.options.failDraw = true;
  const preparing = ui.plan.prepareRexonanceSuit();
  assert.doesNotThrow(() => ui.flush());
  assert.equal(await preparing, false);
  assert.equal(ui.plan.work.dirty, true);
  await flushPromises();
  ui.options.failDraw = false;
  assert.equal(await ui.plan.prepareRexonanceSuit(), true);
  assert.equal(ui.plan.work.dirty, false);
  assert.equal(ui.closed(), 0);
});

test("a temporarily unavailable 2D context does not poison subsequent preparation", async () => {
  const ui = planRuntime();
  ui.options.contextAvailable = false;
  const preparing = ui.plan.prepareRexonanceSuit();
  ui.flush();
  assert.equal(await preparing, false);
  await flushPromises();
  ui.options.contextAvailable = true;
  assert.equal(await ui.plan.prepareRexonanceSuit(), true);
});

test("idle preparation never resets formed gold while a live call owns the working atlas", async () => {
  const ui = planRuntime();
  const preparing = ui.plan.prepareRexonanceSuit();
  ui.flush();
  assert.equal(await preparing, true);
  await flushPromises();
  ui.plan.work.drawing = 1;
  ui.plan.work.dirty = true;
  assert.equal(await ui.plan.prepareRexonanceSuit(), true);
  assert.equal(ui.drawn.length, 3);
  await flushPromises();
  ui.plan.work.drawing = 0;
  assert.equal(await ui.plan.prepareRexonanceSuit(), true);
  assert.deepEqual(ui.drawn, ["clear", "atlas", "raw-gold", "clear", "atlas", "raw-gold"]);
});

test("plan readiness distinguishes decoded layers, a warm atlas and a previous call's dirty atlas", async () => {
  const ui = planRuntime();
  assert.equal(ui.plan.isRexonanceSuitPlanReady(), false);
  ui.plan.plates();
  assert.equal(ui.plan.isRexonanceSuitPlanReady(), false, "metadata alone is not a prepared atlas");
  assert.equal(await ui.plan.prepareRexonanceSuit(), true);
  assert.equal(ui.plan.isRexonanceSuitPlanReady(), true);
  await flushPromises();
  ui.plan.work.dirty = true;
  ui.plan.work.drawing = 1;
  assert.equal(ui.plan.isRexonanceSuitPlanReady(), true, "the active call owns its working copy");
  ui.plan.work.drawing = 0;
  assert.equal(ui.plan.isRexonanceSuitPlanReady(), false, "a new call must reset formed gold");
  assert.equal(await ui.plan.prepareRexonanceSuit(), true);
  assert.equal(ui.plan.isRexonanceSuitPlanReady(), true);
});
