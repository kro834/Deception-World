import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_CELLS,
  DEVICES,
  SETTINGS,
  TARGETS,
  evaluate,
  median,
  parseCell,
  rafStats,
  schedule,
  summarizeLoad,
  summarizeTrace,
  targetsFor,
} from "./verify-samsung-performance.mjs";

// The browser harness (scripts/verify-samsung-performance.mjs) is not run by
// npm test. These tests pin its measurement contract and the definition of
// done it enforces, and check its trace arithmetic on synthetic events.

test("Samsung harness emulates the two Galaxy classes and both SI engine settings", () => {
  assert.deepEqual(DEVICES.g360.viewport, { width: 360, height: 780 });
  assert.equal(DEVICES.g360.deviceScaleFactor, 3);
  assert.deepEqual(DEVICES.g412.viewport, { width: 412, height: 915 });
  assert.equal(DEVICES.g412.deviceScaleFactor, 3.5);
  for (const device of Object.values(DEVICES)) {
    assert.match(device.userAgent, /Android .*SamsungBrowser\/\d+\.0 Chrome\/1[34]\d\./);
  }
  // SI 28/29 (engines 130/136) ship CompositeBGColorAnimation as experimental;
  // SI 30 (engine 143) has it on, like current Chrome.
  assert.deepEqual(SETTINGS.si28, ["--disable-features=CompositeBGColorAnimation"]);
  assert.deepEqual(SETTINGS.si30, []);
  assert.deepEqual(DEFAULT_CELLS.scroll, [
    "g360-4x-si28",
    "g360-4x-si30",
    "g412-4x-si28",
    "g360-6x-si28",
    "g360-6x-si30",
  ]);
});

test("Samsung harness enforces the definition of done", () => {
  const scroll = TARGETS.scroll;
  for (const cell of DEFAULT_CELLS.scroll) {
    assert.deepEqual(scroll[cell].over34, { max: 0 }, cell);
    assert.deepEqual(scroll[cell].rafP50, { max: 8.6 }, cell);
    assert.deepEqual(scroll[cell].rafP99, { max: 18.6 }, cell);
    assert.deepEqual(scroll[cell].wholeDocumentRecalcs, { max: 0 }, cell);
    assert.deepEqual(scroll[cell].loafs, { max: 0 }, cell);
  }
  const column = (metric) => DEFAULT_CELLS.scroll.map((cell) => scroll[cell][metric]);
  assert.deepEqual(column("dropped"), [
    { vsBase: 0.7, vsFloor: 1.8 },
    { vsBase: 0.6, vsFloor: 1.8 },
    { vsBase: 0.7 },
    { vsBase: 0.6 },
    { vsBase: 0.2 },
  ]);
  assert.deepEqual(
    column("mainMsPerSec").map((rule) => rule.vsBase),
    [0.85, 0.5, 0.75, 0.8, 0.45],
  );
  assert.deepEqual(
    column("paintMs").map((rule) => rule.max),
    [80, 80, 80, 100, 100],
  );
  assert.deepEqual(
    column("updateLayoutTreeMs").map((rule) => rule.vsBase),
    [0.6, 0.75, 0.6, 0.7, 0.6],
  );
  assert.deepEqual(TARGETS.gpu["g412-1x-si28-256mb"], { checkerTiles: { max: 40 } });
  assert.deepEqual(TARGETS.gpu["g360-1x-si28-128mb"], { checkerTiles: { max: 60 } });
  assert.deepEqual(TARGETS.load["g360-4x"], {
    tbt: { max: 550 },
    longTaskMs: { max: 900 },
    forcedLoafsAfterHydration: { max: 0 },
    lcp: { max: 2200 },
  });
  assert.deepEqual(TARGETS.load["g360-6x"], { tbt: { max: 1000 }, longTaskMs: { max: 1800 } });
  // Load targets depend on the CPU rate, not on the flag setting.
  assert.equal(targetsFor("load", parseCell("g360-4x-si28", "load")), TARGETS.load["g360-4x"]);
  assert.equal(targetsFor("load", parseCell("g360-4x-si30", "load")), TARGETS.load["g360-4x"]);
});

test("Samsung harness cells parse, and GPU cells default to a 256 MB tile budget", () => {
  assert.deepEqual(parseCell("g360-6x-si30"), {
    id: "g360-6x-si30",
    device: "g360",
    cpu: 6,
    setting: "si30",
    gpuMemoryMb: undefined,
    label: "g360 6x SI30",
  });
  assert.equal(parseCell("g412-1x-si28", "gpu").gpuMemoryMb, 256);
  assert.equal(parseCell("g360-1x-si28-128mb", "gpu").gpuMemoryMb, 128);
  assert.throws(() => parseCell("s360-4x-si28"), /bad cell/);
  assert.throws(() => parseCell("g360-4x-chrome"), /bad cell/);
});

test("Samsung harness alternates variants so drift hits each one equally", () => {
  const cells = [parseCell("g360-4x-si28"), parseCell("g412-4x-si28")];
  const plan = schedule(cells, ["base", "candidate", "floor"], 3);
  assert.equal(plan.length, 18);
  const order = (round, cell) =>
    plan
      .filter((step) => step.round === round && step.cell === cells[cell])
      .map((step) => step.variant);
  assert.deepEqual(order(0, 0), ["base", "candidate", "floor"]);
  assert.deepEqual(order(1, 0), ["candidate", "floor", "base"]);
  assert.deepEqual(order(2, 0), ["floor", "base", "candidate"]);
  assert.deepEqual(order(0, 1), ["candidate", "floor", "base"]);
  // Every variant runs first once per cell over three rounds.
  assert.equal(new Set([0, 1, 2].map((round) => order(round, 1)[0])).size, 3);
});

test("Samsung harness medians and rAF statistics count only frames while the page moves", () => {
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([4, 1, 3, 2]), 2.5);
  assert.equal(median([null, 5, undefined]), 5);
  assert.equal(median([]), null);
  // [timestamp, scrollY]: idle frames at the start and the end do not count.
  const frames = [
    [0, 0],
    [8.3, 0],
    [16.6, 10],
    [24.9, 20],
    [64.9, 30],
    [73.2, 30],
    [500, 30],
  ];
  const stats = rafStats(frames);
  assert.equal(stats.frames, 4);
  assert.equal(stats.over34, 1);
  assert.equal(stats.rafP50, 8.3);
  assert.equal(stats.rafP99, 40);
});

test("Samsung harness reads main-thread work, recalcs and compositor frames from a trace", () => {
  const main = { pid: 1, tid: 10 };
  const other = { pid: 1, tid: 11 };
  const x = (thread, name, ts, dur, args) => ({ ...thread, ph: "X", name, ts, dur, args });
  const events = [
    { ...main, ph: "M", name: "thread_name", args: { name: "CrRendererMain" } },
    x(main, "RunTask", 0, 50_000),
    x(main, "UpdateLayoutTree", 1_000, 40_000, { elementCount: 1200 }),
    { ...main, ph: "I", name: "scroll-start", ts: 100_000 },
    // A main frame: style, paint and commit inside one task.
    x(main, "RunTask", 200_000, 20_000),
    x(main, "UpdateLayoutTree", 201_000, 4_000, { elementCount: 900 }),
    x(main, "Paint", 206_000, 3_000),
    x(main, "Layerize", 210_000, 2_000),
    x(main, "Commit", 213_000, 1_000),
    // A script-only task is busy time but not a main frame.
    x(main, "RunTask", 300_000, 10_000),
    x(main, "FunctionCall", 301_000, 9_000),
    x(main, "RunTask", 400_000, 8_000),
    x(main, "UpdateLayoutTree", 401_000, 2_000, { elementCount: 120 }),
    // Another thread's work never counts as main-thread work.
    x(other, "RunTask", 200_000, 90_000),
    x(other, "Paint", 201_000, 80_000),
    { ...other, ph: "I", name: "DroppedFrame", ts: 250_000 },
    { ...other, ph: "I", name: "DroppedFrame", ts: 260_000 },
    { ...other, ph: "I", name: "DrawFrame", ts: 270_000 },
    {
      ...other,
      ph: "I",
      name: "TileBasedLayerImpl::AppendQuads checkerboard",
      ts: 280_000,
      args: { missing_tile_count: 7 },
    },
  ];
  const summary = summarizeTrace(events);
  assert.equal(summary.mainThreadFound, true);
  // Totals cover the whole trace; the recalc count covers the scroll only.
  assert.equal(summary.updateLayoutTreeMs, 46);
  assert.equal(summary.paintMs, 3);
  assert.equal(summary.layerizeMs, 2);
  assert.equal(summary.commitMs, 1);
  assert.equal(summary.wholeDocumentRecalcs, 1);
  assert.equal(summary.largestRecalc, 900);
  // Main frames: the pre-scroll task, the 20 ms frame and the 8 ms style task.
  assert.equal(summary.renderTasks, 3);
  assert.equal(summary.renderTaskMs, 78);
  assert.equal(summary.busyMs, 38);
  assert.equal(summary.dropped, 2);
  assert.equal(summary.drawn, 1);
  assert.equal(summary.checkerTiles, 7);
  assert.equal(summary.checkerEvents, 1);
});

test("Samsung harness load summary: TBT from FCP and forced style after hydration", () => {
  const summary = summarizeLoad({
    paints: [{ name: "first-contentful-paint", startTime: 800 }],
    longTasks: [
      { start: 300, duration: 400 },
      { start: 900, duration: 120 },
      { start: 1700, duration: 280 },
    ],
    lcp: [
      { startTime: 1200, element: "img.poster-image" },
      { startTime: 2100, element: "::after." },
    ],
    commits: [1550, 1600],
    loafs: [
      { start: 1400, duration: 200, scripts: [{ forced: 120 }] },
      { start: 1700, duration: 280, scripts: [{ forced: 30 }, { forced: 224 }] },
      { start: 2400, duration: 60, scripts: [{ forced: 10 }] },
    ],
  });
  assert.equal(summary.fcp, 800);
  assert.equal(summary.tbt, 70 + 230);
  assert.equal(summary.longTaskMs, 800);
  assert.equal(summary.lcp, 2100);
  assert.equal(summary.lcpElement, "::after.");
  assert.equal(summary.firstCommit, 1550);
  // The 1400 ms frame ends after the first commit, so it counts too.
  assert.equal(summary.forcedLoafsAfterHydration, 2);
  assert.equal(summary.maxForcedMs, 254);
});

test("Samsung harness targets: ratios need the same session's base, and a missing base fails the gate", () => {
  const targets = TARGETS.scroll["g360-4x-si28"];
  const good = {
    over34: 0,
    rafP50: 8.3,
    rafP99: 18.4,
    wholeDocumentRecalcs: 0,
    loafs: 0,
    dropped: 90,
    mainMsPerSec: 180,
    paintMs: 45,
    updateLayoutTreeMs: 340,
  };
  const base = { dropped: 145, mainMsPerSec: 270, updateLayoutTreeMs: 700 };
  const floor = { dropped: 51 };
  const verdicts = evaluate(targets, { candidate: good, base, floor });
  assert.ok(
    verdicts.every((verdict) => verdict.status === "pass"),
    JSON.stringify(verdicts),
  );
  assert.equal(
    verdicts.find((v) => v.metric === "dropped" && v.kind === "vsFloor").ratio.toFixed(2),
    "1.76",
  );

  const slow = evaluate(targets, { candidate: { ...good, dropped: 120 }, base, floor });
  assert.deepEqual(
    slow
      .filter((verdict) => verdict.status === "fail")
      .map((verdict) => `${verdict.metric}:${verdict.kind}`),
    ["dropped:vsBase", "dropped:vsFloor"],
  );

  const noBase = evaluate(targets, { candidate: good, floor });
  assert.deepEqual(
    noBase.filter((verdict) => verdict.status === "missing").map((verdict) => verdict.metric),
    ["dropped", "mainMsPerSec", "updateLayoutTreeMs"],
  );
  // Zero over zero is parity, not a division error.
  const zero = evaluate({ loafs: { vsBase: 1 } }, { candidate: { loafs: 0 }, base: { loafs: 0 } });
  assert.equal(zero[0].status, "pass");
});
