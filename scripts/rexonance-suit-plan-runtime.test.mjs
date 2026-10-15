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
  const lightSplits = [];
  const lightJobs = [];
  const stages = [];
  const options = {
    failDraw: false,
    contextAvailable: true,
    lightsAvailable: true,
    lightCommitAvailable: true,
  };
  const art = { kind: "atlas", close: () => closeCount++ };
  const raw = { kind: "raw-gold", close: () => closeCount++ };
  const unlit = { kind: "unlit-atlas" };
  const lights = { kind: "plate-lights" };
  const sources = new Map(
    decoded
      ? [
          [suit.REXONANCE_SUIT_ATLAS.src, art],
          [suit.REXONANCE_SUIT_GOLD_ATLAS.src, raw],
        ]
      : [],
  );
  const context = {
    clearRect() {
      stages.push("atlas");
      drawn.push("clear");
    },
    drawImage(image) {
      if (options.failDraw) throw new Error("invalidated bitmap");
      if (image === lights) return; // Precomputed figure glow is not a working-atlas draw.
      drawn.push(image.kind);
    },
  };
  const canvas = { getContext: () => (options.contextAvailable ? context : null) };
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
  const code = ts.transpileModule(
    source +
      `
    export const __buildState = () => ({ count: building.length, complete: Boolean(PLATES) });
  `,
    { compilerOptions: { module: ts.ModuleKind.CommonJS } },
  ).outputText;
  const runtime = {
    exports,
    atob,
    // Each clock read consumes a small deterministic slice; no test depends
    // on this machine's actual CPU, garbage collector or frame cadence.
    performance: { now: () => (now += 2) },
    document: {
      createElement: () => ({
        getContext() {
          // The full-figure light overlay has its own canvas; working-atlas
          // faults below must not accidentally invalidate this separate buffer.
          if (this.width === suit.REXONANCE_SUIT_SIZE.width) return { drawImage() {} };
          return canvas.getContext();
        },
      }),
    },
    requestAnimationFrame: (callback) => schedule("frame", () => callback(now)),
    cancelAnimationFrame: cancel,
    require(name) {
      if (name === "@/lib/rexonance-calls") return calls;
      if (name === "@/lib/rexonance-suit") return suit;
      if (name === "@/lib/rexonance-suit-gold") return gold;
      if (name === "@/lib/rexonance-unlit.js")
        return {
          splitLights: (...args) => {
            lightSplits.push(args);
            return options.lightsAvailable ? { unlit, lights } : null;
          },
          createSplitLightsJob: (...args) => {
            stages.push("light-setup");
            lightSplits.push(args);
            if (!options.lightsAvailable) return null;
            const job = {
              cursor: 0,
              cancelled: false,
              committed: false,
              slices: [],
              step(until, deadline) {
                stages.push("light-rows");
                const first = job.cursor;
                do {
                  job.cursor += 1;
                  now += 2;
                  if (now >= until || (deadline && deadline.timeRemaining() < 2)) break;
                } while (job.cursor < 12);
                job.slices.push(job.cursor - first);
                return job.cursor >= 12;
              },
              commit() {
                stages.push("light-commit");
                assert.equal(job.cursor, 12, "only complete rows can publish light layers");
                job.committed = true;
                return options.lightCommitAvailable ? { unlit, lights } : null;
              },
              cancel() {
                job.cancelled = true;
              },
            };
            lightJobs.push(job);
            return job;
          },
        };
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
    lightSplits,
    lightJobs,
    stages,
    options,
    sources,
    art,
    raw,
    unlit,
    lights,
    closed: () => closeCount,
    flushUntil(predicate) {
      for (let i = 0; !predicate(); i++) {
        assert.ok(i < 100 && queued.length, "required preparation stage must be reached");
        queued.shift()();
      }
    },
    async prepare(priority) {
      const preparing = exports.prepareRexonanceSuit(priority);
      this.flush();
      return preparing;
    },
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
    cells: Object.fromEntries(
      Object.entries(plan.cells()).map(([key, values]) => [key, Array.from(values)]),
    ),
    surges: plan.planSurges().map((surge) => ({
      ...surge,
      cells: Array.from(surge.cells),
      reach: Array.from(surge.reach),
    })),
    end: plan.planEnd(),
  });
}

// Decode generated occupancy independently of the runtime's atob/popcount
// and BFS. Count only the plate's actual grid, and reject set padding bits:
// otherwise GOLD_TOTAL could allocate cells the plan never initializes.
function maskGrid(base64, piece, unit) {
  if (!base64) return [];
  const bytes = Buffer.from(base64, "base64");
  const columns = Math.ceil(piece.w / unit);
  const rows = Math.ceil(piece.h / unit);
  const size = columns * rows;
  assert.equal(bytes.length, Math.ceil(size / 8), `${piece.id}: mask fits its generated grid`);
  const occupied = [];
  for (let index = 0; index < bytes.length * 8; index++) {
    if (!((bytes[Math.floor(index / 8)] >>> (index % 8)) & 1)) continue;
    assert.ok(index < size, `${piece.id}: padding must not introduce phantom cells`);
    occupied.push({ column: index % columns, row: Math.floor(index / columns) });
  }
  return occupied;
}

const expectedGoldCount = ({ includeDriver = false } = {}) =>
  suit.REXONANCE_SUIT_PIECES.reduce((count, piece) => {
    const grid = maskGrid(
      gold.REXONANCE_SUIT_GOLD_CELLS[piece.id],
      piece,
      gold.REXONANCE_SUIT_GOLD_CELL,
    );
    return (
      count + (includeDriver || !calls.REXONANCE_SUIT_DRIVER.includes(piece.id) ? grid.length : 0)
    );
  }, 0);

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
  assert.deepEqual(ui.drawn, ["clear", "unlit-atlas", "raw-gold"]);
});

test("a generous idle deadline still respects the plan's own short slice budget", async () => {
  const ui = planRuntime();
  const preparing = ui.plan.prepareRexonanceSuit();
  const before = ui.plan.__buildState().count;
  ui.queued.shift()();
  const after = ui.plan.__buildState().count;
  assert.ok(
    after > before && after < suit.REXONANCE_SUIT_PIECES.length,
    "50 ms from requestIdleCallback must not force the remaining 60-plate build",
  );
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
  assert.equal(
    ui.plan.__buildState().count,
    before,
    "promotion must yield rather than rebuild now",
  );
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
  assert.deepEqual(ui.drawn, ["clear", "unlit-atlas", "raw-gold"]);
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
  assert.equal(sliced.plan.GOLD_TOTAL, expectedGoldCount());
  assert.equal(sliced.plan.planEnd(), direct.plan.planEnd());
});

test("the real plan covers every generated tile and gold mask cell without phantom padding", () => {
  const { plan } = planRuntime();
  const plates = plan.plates();
  const cells = plan.cells();
  const ids = new Set(suit.REXONANCE_SUIT_PIECES.map((piece) => piece.id));
  for (const id of Object.keys(gold.REXONANCE_SUIT_GOLD_CELLS))
    assert.ok(ids.has(id), `${id}: every generated gold mask belongs to a real plate`);
  assert.equal(plates.length, suit.REXONANCE_SUIT_PIECES.length);
  let tiles = 0,
    goldAt = 0;
  for (let index = 0; index < plates.length; index++) {
    const plate = plates[index];
    const piece = suit.REXONANCE_SUIT_PIECES[index];
    assert.equal(plate.piece.id, piece.id, "front-to-back art order is preserved");
    const tileGrid = maskGrid(piece.tiles, piece, suit.REXONANCE_SUIT_TILE);
    assert.ok(tileGrid.length > 0, `${piece.id}: a visible plate must carry artwork tiles`);
    const tile = suit.REXONANCE_SUIT_TILE;
    const expectedTiles = tileGrid.map(({ column, row }) => [
      piece.ax + column * tile,
      piece.ay + row * tile,
      piece.x + column * tile,
      piece.y + row * tile,
    ]);
    assert.deepEqual(
      Array.from(plate.tiles, ({ sx, sy, dx, dy }) => [sx, sy, dx, dy]),
      expectedTiles,
      `${piece.id}: each occupied artwork tile is carried exactly once`,
    );
    tiles += tileGrid.length;

    const maskedGold = maskGrid(
      gold.REXONANCE_SUIT_GOLD_CELLS[piece.id],
      piece,
      gold.REXONANCE_SUIT_GOLD_CELL,
    );
    if (gold.REXONANCE_SUIT_GOLD_CELLS[piece.id])
      assert.ok(maskedGold.length > 0, `${piece.id}: an emitted trim mask cannot be empty`);
    const driver = calls.REXONANCE_SUIT_DRIVER.includes(piece.id);
    const goldGrid = driver ? [] : maskedGold;
    if (driver) {
      assert.equal(plate.fit, 0, `${piece.id}: the finished driver is on the body from the start`);
      assert.equal(plate.from, 0);
      assert.equal(plate.to, 0);
      assert.equal(plate.last, 0);
      assert.equal(plate.first, plate.end, `${piece.id}: finished driver does not form new gold`);
    }
    const unit = gold.REXONANCE_SUIT_GOLD_CELL;
    assert.equal(plate.first, goldAt, `${piece.id}: flat gold arrays have no gaps`);
    assert.equal(
      plate.end - plate.first,
      goldGrid.length,
      `${piece.id}: all trim cells are formed`,
    );
    const expectedCells = goldGrid
      .map(({ column, row }) =>
        [
          piece.x + column * unit,
          piece.y + row * unit,
          piece.ax + column * unit,
          piece.ay + row * unit,
          Math.min(unit, piece.w - column * unit),
          Math.min(unit, piece.h - row * unit),
        ].join(","),
      )
      .sort();
    const actualCells = Array.from({ length: goldGrid.length }, (_, offset) => {
      const at = plate.first + offset;
      return [
        cells.fx[at],
        cells.fy[at],
        cells.ax[at],
        cells.ay[at],
        cells.cw[at],
        cells.ch[at],
      ].join(",");
    }).sort();
    assert.deepEqual(
      actualCells,
      expectedCells,
      `${piece.id}: BFS changes flow order, not the trim geometry`,
    );
    goldAt = plate.end;
  }
  assert.equal(
    plates.reduce((count, plate) => count + plate.tiles.length, 0),
    tiles,
  );
  assert.equal(goldAt, expectedGoldCount());
  assert.equal(plan.GOLD_TOTAL, goldAt, "the allocation matches initialized gold cells exactly");
  for (const array of Object.values(cells)) assert.equal(array.length, goldAt);
  const unusedDriverCells = expectedGoldCount({ includeDriver: true }) - goldAt;
  assert.ok(
    unusedDriverCells > 0,
    "finished driver masks exist but must not allocate phantom cells",
  );
  // Every allocated cell has physical extent; a skipped driver mask must
  // not leave zero-sized, uninitialized cells at the end of the gold arrays.
  assert.ok(Array.from(cells.cw).every((width) => width > 0));
  assert.ok(Array.from(cells.ch).every((height) => height > 0));
});

test("a foreground call may finish the plan before idle resumes without rebuilding it", async () => {
  const ui = planRuntime();
  const preparing = ui.plan.prepareRexonanceSuit();
  const all = ui.plan.plates();
  ui.flush();
  assert.equal(await preparing, true);
  assert.equal(ui.plan.plates(), all);
  assert.equal(ui.queued.length, 0);
  assert.equal(ui.plan.__buildState().count, suit.REXONANCE_SUIT_PIECES.length);
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
  assert.equal(await ui.prepare(), true);
  assert.equal(ui.plan.plates(), all);
  assert.deepEqual(ui.drawn, ["clear", "unlit-atlas", "raw-gold"]);
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
  assert.equal(await ui.prepare(), true);
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
  assert.equal(await ui.prepare(), true);
});

test("idle preparation never resets formed gold while a live call owns the working atlas", async () => {
  const ui = planRuntime();
  const preparing = ui.plan.prepareRexonanceSuit();
  ui.flush();
  assert.equal(await preparing, true);
  await flushPromises();
  ui.plan.work.drawing = 1;
  ui.plan.work.dirty = true;
  assert.equal(await ui.prepare(), true);
  assert.equal(ui.drawn.length, 3);
  await flushPromises();
  ui.plan.work.drawing = 0;
  assert.equal(await ui.prepare(), true);
  assert.deepEqual(ui.drawn, [
    "clear",
    "unlit-atlas",
    "raw-gold",
    "clear",
    "unlit-atlas",
    "raw-gold",
  ]);
});

test("plan readiness distinguishes decoded layers, a warm atlas and a previous call's dirty atlas", async () => {
  const ui = planRuntime();
  assert.equal(ui.plan.isRexonanceSuitPlanReady(), false);
  ui.plan.plates();
  assert.equal(ui.plan.isRexonanceSuitPlanReady(), false, "metadata alone is not a prepared atlas");
  assert.equal(await ui.prepare(), true);
  assert.equal(ui.plan.isRexonanceSuitPlanReady(), true);
  await flushPromises();
  ui.plan.work.dirty = true;
  ui.plan.work.drawing = 1;
  assert.equal(ui.plan.isRexonanceSuitPlanReady(), true, "the active call owns its working copy");
  ui.plan.work.drawing = 0;
  assert.equal(ui.plan.isRexonanceSuitPlanReady(), false, "a new call must reset formed gold");
  assert.equal(await ui.prepare(), true);
  assert.equal(ui.plan.isRexonanceSuitPlanReady(), true);
});

test("single-flight preparation creates unlit layers once and retains them across retries", async () => {
  const ui = planRuntime();
  ui.options.failDraw = true;
  const preparing = ui.plan.prepareRexonanceSuit();
  assert.equal(ui.plan.prepareRexonanceSuit("high"), preparing);
  ui.flush();
  assert.equal(await preparing, false);
  // 2026-10-15: the call's split also asks for its mote layer (its document, then the option).
  assert.equal(ui.lightSplits.length, 1);
  assert.deepEqual(ui.lightSplits[0].slice(0, 5), [
    ui.art,
    0,
    0,
    suit.REXONANCE_SUIT_GOLD_ATLAS.width,
    suit.REXONANCE_SUIT_GOLD_ATLAS.height,
  ]);
  assert.equal(ui.lightSplits[0][6]?.motes, true);
  assert.equal(ui.plan.plateLights().unlit, ui.unlit);
  assert.equal(ui.plan.plateLights().lights, ui.lights);
  await flushPromises();
  ui.options.failDraw = false;
  assert.equal(await ui.plan.prepareRexonanceSuit("high"), true);
  assert.equal(ui.lightSplits.length, 1, "a working-atlas retry must not recreate light layers");
  assert.deepEqual(ui.drawn, ["clear", "clear", "unlit-atlas", "raw-gold"]);
  assert.equal(ui.closed(), 0, "light preparation only borrows decoded atlas bitmaps");
});

test("unavailable light separation falls back safely and can retry before a later call", async () => {
  const ui = planRuntime();
  ui.options.lightsAvailable = false;
  const preparing = ui.plan.prepareRexonanceSuit();
  ui.flush();
  assert.equal(await preparing, true);
  assert.equal(ui.plan.plateLights(), null);
  assert.deepEqual(ui.drawn, ["clear", "atlas", "raw-gold"]);
  assert.equal(ui.plan.isRexonanceSuitPlanReady(), true);
  await flushPromises();
  ui.options.lightsAvailable = true;
  assert.equal(await ui.prepare(), true);
  assert.equal(ui.lightSplits.length, 2);
  assert.deepEqual(ui.drawn, ["clear", "atlas", "raw-gold", "clear", "unlit-atlas", "raw-gold"]);
  assert.equal(ui.closed(), 0);
});

test("light preparation cannot reset or split an atlas while a foreground call owns it", async () => {
  const ui = planRuntime();
  ui.plan.plates();
  ui.plan.forming(ui.art, ui.raw);
  ui.plan.work.drawing = 1;
  ui.plan.work.dirty = true;
  assert.equal(await ui.prepare("high"), true);
  assert.equal(ui.lightSplits.length, 0);
  assert.deepEqual(ui.drawn, ["clear", "atlas", "raw-gold"]);
  assert.equal(ui.plan.work.dirty, true, "the active call retains its formed gold");
  await flushPromises();
  ui.plan.work.drawing = 0;
  assert.equal(await ui.prepare("high"), true);
  assert.equal(ui.lightSplits.length, 1);
  assert.deepEqual(ui.drawn, ["clear", "atlas", "raw-gold", "clear", "unlit-atlas", "raw-gold"]);
});

test("light readback, budgeted rows, commit and working atlas each occupy separate tasks", async () => {
  const ui = planRuntime();
  const preparing = ui.plan.prepareRexonanceSuit();
  ui.flushUntil(() => ui.plan.__buildState().complete);
  assert.equal(
    ui.lightJobs.length,
    0,
    "plate generation never starts the pixel pass in its final slice",
  );
  assert.deepEqual(ui.stages, []);
  ui.queued.shift()();
  const job = ui.lightJobs[0];
  assert.equal(job.cursor, 0, "readback/setup must not also process rows");
  assert.equal(ui.plan.plateLights(), null);
  assert.equal(ui.plan.isRexonanceSuitPlanReady(), false);
  ui.queued.shift()();
  assert.ok(job.cursor > 0 && job.cursor < 12);
  ui.flushUntil(() => job.cursor === 12);
  assert.ok(job.slices.length >= 4, "the full pass is split under the six-ms budget");
  assert.ok(job.slices.every((rows) => rows > 0 && rows <= 3));
  assert.equal(
    ui.plan.plateLights(),
    null,
    "complete private buffers are not public before commit",
  );
  assert.deepEqual(ui.drawn, []);
  ui.queued.shift()();
  assert.equal(ui.plan.plateLights().unlit, ui.unlit);
  assert.equal(job.cancelled, true, "private readback buffers are released after publication");
  assert.deepEqual(ui.drawn, [], "commit must not draw the working atlas in the same task");
  assert.equal(ui.plan.isRexonanceSuitPlanReady(), false);
  ui.queued.shift()();
  assert.equal(await preparing, true);
  assert.equal(ui.plan.isRexonanceSuitPlanReady(), true);
  assert.deepEqual(ui.stages, [
    "light-setup",
    ...job.slices.map(() => "light-rows"),
    "light-commit",
    "atlas",
  ]);
  assert.deepEqual(ui.drawn, ["clear", "unlit-atlas", "raw-gold"]);
  assert.equal(ui.queued.length, 0);
});

test("priority promotion retains a partial light-job cursor and rejects stale idle slices", async () => {
  const ui = planRuntime({ canCancelIdle: false });
  const preparing = ui.plan.prepareRexonanceSuit();
  ui.flushUntil(() => (ui.lightJobs[0]?.cursor ?? 0) > 0);
  const job = ui.lightJobs[0];
  const cursor = job.cursor;
  const idle = ui.queued[0];
  assert.equal(ui.plan.prepareRexonanceSuit("high"), preparing);
  assert.equal(ui.lightJobs.length, 1);
  assert.equal(job.cursor, cursor, "promotion only changes scheduling, not row progress");
  const frame = ui.queued[1];
  assert.equal(frame.kind, "frame");
  ui.queued.shift()();
  assert.equal(job.cursor, cursor, "the stale idle cannot advance a promoted light job");
  assert.equal(ui.queued[0], frame);
  ui.flush();
  assert.equal(await preparing, true);
  assert.equal(ui.lightJobs.length, 1);
  const stages = ui.stages.length;
  idle();
  assert.equal(ui.stages.length, stages);
  assert.equal(ui.queued.length, 0);
});

test("a live call taking over a partial or committed light job never resets its atlas", async () => {
  for (const phase of ["rows", "complete", "committed"]) {
    const ui = planRuntime();
    ui.plan.plates();
    ui.plan.forming(ui.art, ui.raw);
    const preparing = ui.plan.prepareRexonanceSuit();
    assert.equal(
      ui.plan.isRexonanceSuitPlanReady(),
      false,
      "a previous raw fallback is not ready during a new private light pass",
    );
    ui.flushUntil(() => {
      const job = ui.lightJobs[0];
      return phase === "committed"
        ? Boolean(ui.plan.plateLights())
        : Boolean(job && (phase === "rows" ? job.cursor > 0 : job.cursor === 12));
    });
    const published = ui.plan.plateLights();
    ui.plan.work.drawing = 1;
    ui.plan.work.dirty = true;
    ui.flush();
    assert.equal(await preparing, true);
    assert.equal(ui.lightJobs[0].cancelled, true);
    assert.equal(ui.plan.plateLights(), published, "a live call's light choice cannot be replaced");
    assert.deepEqual(ui.drawn, ["clear", "atlas", "raw-gold"]);
    assert.equal(ui.plan.work.dirty, true);
    assert.equal(ui.plan.isRexonanceSuitPlanReady(), true, "live ownership remains ready");
    await flushPromises();
    ui.plan.work.drawing = 0;
    assert.equal(await ui.prepare("high"), true);
    assert.equal(ui.lightJobs.length, phase === "committed" ? 1 : 2);
    assert.deepEqual(ui.drawn, ["clear", "atlas", "raw-gold", "clear", "unlit-atlas", "raw-gold"]);
    assert.equal(ui.closed(), 0);
  }
});

test("a failed light commit preserves raw fallback readiness and can retry later", async () => {
  const ui = planRuntime();
  ui.options.lightCommitAvailable = false;
  assert.equal(await ui.prepare(), true);
  assert.equal(ui.plan.plateLights(), null);
  assert.equal(ui.lightJobs[0].cancelled, true);
  assert.equal(ui.plan.isRexonanceSuitPlanReady(), true);
  assert.deepEqual(ui.drawn, ["clear", "atlas", "raw-gold"]);
  await flushPromises();
  ui.options.lightCommitAvailable = true;
  assert.equal(await ui.prepare("high"), true);
  assert.equal(ui.lightJobs.length, 2);
  assert.equal(ui.plan.isRexonanceSuitPlanReady(), true);
  assert.equal(ui.closed(), 0);
});

test("a decoder replacing the borrowed atlas discards private rows before rebuilding", async () => {
  const ui = planRuntime();
  const preparing = ui.plan.prepareRexonanceSuit();
  ui.flushUntil(() => (ui.lightJobs[0]?.cursor ?? 0) > 0);
  const replaced = { kind: "replacement-atlas" };
  ui.sources.set(suit.REXONANCE_SUIT_ATLAS.src, replaced);
  ui.flush();
  assert.equal(await preparing, true);
  assert.equal(ui.lightJobs.length, 2);
  assert.equal(ui.lightJobs[0].cancelled, true);
  assert.equal(ui.lightJobs[0].committed, false);
  assert.equal(ui.lightSplits[1][0], replaced);
  assert.equal(ui.closed(), 0);
});

test("a finite entry timeout may fire between pixel slices without cancelling the shared plan", async () => {
  const ui = planRuntime();
  const timers = new Map();
  const exports = {};
  const entrySource = readFileSync(
    new URL("../src/lib/rexonance-entry-preparation.ts", import.meta.url),
    "utf8",
  );
  runInNewContext(
    ts.transpileModule(entrySource, {
      compilerOptions: { module: ts.ModuleKind.CommonJS },
    }).outputText,
    {
      exports,
      window: {
        setTimeout(callback, duration) {
          timers.set(1, { callback, duration });
          return 1;
        },
        clearTimeout(id) {
          timers.delete(id);
        },
      },
    },
  );
  let shared;
  const entry = exports.prepareRexonanceEntry({
    decoded: Promise.resolve(true),
    prepare: () => (shared = ui.plan.prepareRexonanceSuit("high")),
    deadlineMs: 120,
  });
  await flushPromises();
  ui.flushUntil(() => (ui.lightJobs[0]?.cursor ?? 0) > 0);
  assert.equal(ui.plan.plateLights(), null);
  assert.equal(ui.queued.length, 1);
  assert.equal(timers.get(1).duration, 120);
  timers.get(1).callback();
  assert.equal(await entry.promise, false);
  assert.equal(timers.size, 0);
  assert.equal(
    ui.lightJobs[0].cancelled,
    false,
    "one expired intent cannot destroy shared row progress",
  );
  ui.flush();
  assert.equal(await shared, true);
  assert.equal(await entry.promise, false, "late plan completion cannot revive an expired intent");
  assert.equal(ui.queued.length, 0);
  assert.equal(ui.plan.isRexonanceSuitPlanReady(), true);
  assert.equal(ui.closed(), 0);
});
