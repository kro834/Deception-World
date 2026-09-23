#!/usr/bin/env node
/**
 * Samsung Internet performance harness for /world (Samsung plan phase 0).
 * PERFORMANCE_TARGETS.md ("Samsung Internet") describes the measurement
 * contract. This is a browser script: it is not part of `npm test`.
 *
 * Samsung Internet runs the same Blink as Chrome but gets no server-side field
 * trials, so desktop Chrome through Playwright (which passes
 * --disable-field-trial-config) with a Galaxy viewport stands in for it:
 *   devices   g360 = 360x780 at DPR 3 (SM-S921B); g412 = 412x915 at DPR 3.5
 *             (SM-S928B). Both use a SamsungBrowser/28 UA with touch, and
 *             hardwareConcurrency and deviceMemory are pinned to 8, which
 *             makes them capable, not economy.
 *   settings  si28 = --disable-features=CompositeBGColorAnimation (engines
 *             130/136, SI 28-29); si30 = default flags (engine 143, SI 30).
 *   CPU       4x stands in for S2x class and 6x for A3x/A5x class.
 * The local display runs at 120 Hz without the Android 60 Hz main-frame cap,
 * so the runs model SI on a 120 Hz Galaxy.
 *
 * Every cell runs each variant in its own fresh browser, in one session:
 *   base       BASE_REF_URL, the build before the change (the branch point)
 *   candidate  BASE_URL, the build under test
 *   floor      the base build (the candidate if there is no base) with every
 *              animation and transition off: the cost of scrolling itself
 * The variant order rotates on every round, so machine drift and other
 * agents' Chrome instances hit every variant equally. The script reports the
 * median of the runs (3 by default) and the candidate/base and
 * candidate/floor ratios. Absolute numbers depend on the machine; only the
 * ratios and the frame metrics carry from one session to the next.
 *
 * Modes:
 *   scroll (default)  17 touch drags over about 15 s, top to bottom of /world.
 *                     Metrics:
 *                     - rAF p50/p99 and frames over 34 ms, counting only
 *                       frames while the page moves;
 *                     - compositor DroppedFrame count;
 *                     - main thread ms/s: tasks that run style, paint or
 *                       commit, divided by the gesture time;
 *                     - trace totals for Paint, UpdateLayoutTree, Layerize
 *                       and Commit;
 *                     - whole-document recalcs (UpdateLayoutTree over 500
 *                       elements after the scroll starts);
 *                     - LoAF of 50 ms or more during the scroll.
 *   gpu               Chrome runs with --force-device-scale-factor and
 *                     --force-gpu-mem-available-mb=<mb> (cell suffix, default
 *                     256). Fast 560 px strokes at 1x CPU. It counts
 *                     checkerboarded tiles (the missing_tile_count of cc
 *                     "AppendQuads checkerboard" events) and dropped frames.
 *   load              First visit with the boot playing, CPU throttled from
 *                     navigation. It reports:
 *                     - TBT from FCP;
 *                     - long tasks;
 *                     - LCP;
 *                     - LoAFs after hydration (the first React commit) whose
 *                       scripts force at least 50 ms of style and layout.
 *
 * Usage (both servers are production builds served GET-only; see
 * scripts/serve-ref-build.mjs):
 *   BASE_REF_URL=http://127.0.0.1:8171 BASE_URL=http://127.0.0.1:8172 \
 *   PW_BROWSER_CHANNEL=chrome node scripts/verify-samsung-performance.mjs \
 *     [--mode=scroll|gpu|load] [--cells=g360-4x-si28,g412-4x-si28,...] [--runs=3] \
 *     [--variants=base,candidate,floor] [--floor=base|candidate] \
 *     [--gesture=drag|fling] [--route=/world] [--enforce] [--out=results.json] \
 *     [--keep-traces=<dir>]
 * Cells are <g360|g412>-<cpu>x-<si28|si30>[-<mb>mb]. The defaults are the
 * columns of the definition of done: five scroll cells, two gpu cells
 * (g412 256 MB, g360 128 MB) and two load cells.
 * --enforce exits 1 when a candidate median misses a target of the definition
 * of done (TARGETS below). A target that needs the base or the floor needs
 * that variant in the same session. The targets were written against the
 * pre-plan commit, so BASE_REF_URL must serve the branch point, not an
 * already-improved build.
 * Loopback URLs only, unless BROWSER_ALLOW_EXTERNAL_HOST=1 is set.
 * A full scroll matrix (5 cells, 3 variants, 3 runs) takes about 20 minutes;
 * gpu and load take about 4 minutes each.
 * Noise, measured by comparing d0a9da8 with itself while other agents ran
 * Chrome (PERFORMANCE_TARGETS.md): main thread, UpdateLayoutTree and Paint
 * medians matched to within 10%, but dropped frames at 4x spread 0.81-1.37x
 * and checkerboarded tiles 0.64-0.71x. Rerun a borderline cell with --runs=5.
 */
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// ---------------------------------------------------------------- contract

const SI_UA = (model) =>
  `Mozilla/5.0 (Linux; Android 14; ${model}) AppleWebKit/537.36 (KHTML, like Gecko) ` +
  "SamsungBrowser/28.0 Chrome/130.0.0.0 Mobile Safari/537.36";

export const DEVICES = {
  g360: {
    viewport: { width: 360, height: 780 },
    deviceScaleFactor: 3,
    userAgent: SI_UA("SM-S921B"),
  },
  g412: {
    viewport: { width: 412, height: 915 },
    deviceScaleFactor: 3.5,
    userAgent: SI_UA("SM-S928B"),
  },
};

export const SETTINGS = {
  si28: ["--disable-features=CompositeBGColorAnimation"],
  si30: [],
};

export const DEFAULT_CELLS = {
  scroll: ["g360-4x-si28", "g360-4x-si30", "g412-4x-si28", "g360-6x-si28", "g360-6x-si30"],
  gpu: ["g412-1x-si28-256mb", "g360-1x-si28-128mb"],
  load: ["g360-4x-si30", "g360-6x-si30"],
};

export const DEFAULT_VARIANTS = {
  scroll: ["base", "candidate", "floor"],
  gpu: ["base", "candidate"],
  load: ["base", "candidate"],
};

/** The floor variant: the cost of scrolling with every animation and transition off. */
export const FLOOR_CSS = "*,*::before,*::after{animation:none!important;transition:none!important}";

const SCROLL_TRACE_CATEGORIES = [
  "devtools.timeline",
  "disabled-by-default-devtools.timeline",
  "disabled-by-default-devtools.timeline.frame",
  "blink.animations",
  "blink.user_timing",
  "benchmark",
];
const GPU_TRACE_CATEGORIES = [
  "devtools.timeline",
  "disabled-by-default-devtools.timeline.frame",
  "blink.user_timing",
  "cc",
  "viz",
  "benchmark",
];

/**
 * Definition of done (Samsung plan, section 9). Values are candidate medians
 * over the runs. `max` is absolute; `vsBase` and `vsFloor` are ratios to the
 * same session's base and floor medians. `wholeDocumentRecalcs` and `loafs`
 * cover the scroll only.
 */
const SCROLL_COMMON = {
  over34: { max: 0 },
  rafP50: { max: 8.6 },
  rafP99: { max: 18.6 },
  wholeDocumentRecalcs: { max: 0 },
  loafs: { max: 0 },
};
export const TARGETS = {
  scroll: {
    "g360-4x-si28": {
      ...SCROLL_COMMON,
      dropped: { vsBase: 0.7, vsFloor: 1.8 },
      mainMsPerSec: { vsBase: 0.85 },
      paintMs: { max: 80 },
      updateLayoutTreeMs: { vsBase: 0.6 },
    },
    "g360-4x-si30": {
      ...SCROLL_COMMON,
      dropped: { vsBase: 0.6, vsFloor: 1.8 },
      mainMsPerSec: { vsBase: 0.5 },
      paintMs: { max: 80 },
      updateLayoutTreeMs: { vsBase: 0.75 },
    },
    "g412-4x-si28": {
      ...SCROLL_COMMON,
      dropped: { vsBase: 0.7 },
      mainMsPerSec: { vsBase: 0.75 },
      paintMs: { max: 80 },
      updateLayoutTreeMs: { vsBase: 0.6 },
    },
    "g360-6x-si28": {
      ...SCROLL_COMMON,
      dropped: { vsBase: 0.6 },
      mainMsPerSec: { vsBase: 0.8 },
      paintMs: { max: 100 },
      updateLayoutTreeMs: { vsBase: 0.7 },
    },
    "g360-6x-si30": {
      ...SCROLL_COMMON,
      dropped: { vsBase: 0.2 },
      mainMsPerSec: { vsBase: 0.45 },
      paintMs: { max: 100 },
      updateLayoutTreeMs: { vsBase: 0.6 },
    },
  },
  gpu: {
    "g412-1x-si28-256mb": { checkerTiles: { max: 40 } },
    "g360-1x-si28-128mb": { checkerTiles: { max: 60 } },
  },
  // Load targets depend on the CPU rate only (keyed <device>-<cpu>x).
  load: {
    "g360-4x": {
      tbt: { max: 550 },
      longTaskMs: { max: 900 },
      forcedLoafsAfterHydration: { max: 0 },
      lcp: { max: 2200 },
    },
    "g360-6x": { tbt: { max: 1000 }, longTaskMs: { max: 1800 } },
  },
};

/** Columns printed per mode: [key, label, digits]. */
const METRICS = {
  scroll: [
    ["over34", "frames > 34 ms", 0],
    ["rafP50", "rAF p50 (ms)", 1],
    ["rafP99", "rAF p99 (ms)", 1],
    ["dropped", "compositor dropped frames", 0],
    ["mainMsPerSec", "main thread (ms/s)", 0],
    ["busyMsPerSec", "main thread, all tasks (ms/s)", 0],
    ["paintMs", "Paint (ms)", 0],
    ["updateLayoutTreeMs", "UpdateLayoutTree (ms)", 0],
    ["layerizeMs", "Layerize (ms)", 0],
    ["commitMs", "Commit (ms)", 0],
    ["wholeDocumentRecalcs", "whole-document recalcs", 0],
    ["loafs", "LoAF >= 50 ms", 0],
    ["gestures", "gestures", 0],
    ["seconds", "scroll time (s)", 1],
  ],
  gpu: [
    ["checkerTiles", "checkerboarded tiles", 0],
    ["checkerEvents", "checkerboard quads", 0],
    ["missingContentFrames", "frames with missing content", 0],
    ["dropped", "compositor dropped frames", 0],
    ["drawn", "drawn frames", 0],
    ["paintMs", "Paint (ms)", 0],
    ["strokes", "strokes", 0],
  ],
  load: [
    ["fcp", "FCP (ms)", 0],
    ["lcp", "LCP (ms)", 0],
    ["tbt", "TBT from FCP (ms)", 0],
    ["longTaskMs", "long tasks (ms)", 0],
    ["longTasks", "long tasks (n)", 0],
    ["firstCommit", "first React commit (ms)", 0],
    ["forcedLoafsAfterHydration", "LoAF forced >= 50 ms after hydration", 0],
    ["maxForcedMs", "largest forced style+layout (ms)", 0],
  ],
};

// ---------------------------------------------------------------- pure helpers

export function parseCell(spec, mode = "scroll") {
  const match = /^(g360|g412)-(\d+(?:\.\d+)?)x-(si28|si30)(?:-(\d+)mb)?$/.exec(spec);
  if (!match)
    throw new Error(`bad cell "${spec}": expected <g360|g412>-<cpu>x-<si28|si30>[-<mb>mb]`);
  const [, device, cpu, setting, mb] = match;
  return {
    id: spec,
    device,
    cpu: Number(cpu),
    setting,
    gpuMemoryMb: mode === "gpu" ? Number(mb ?? 256) : mb ? Number(mb) : undefined,
    label: `${device} ${cpu}x ${setting.toUpperCase()}${mb ? ` ${mb} MB` : ""}`,
  };
}

export function median(values) {
  const list = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  if (!list.length) return null;
  const middle = list.length >> 1;
  return list.length % 2 ? list[middle] : (list[middle - 1] + list[middle]) / 2;
}

/** Nearest-rank percentile, as the investigations used. */
export function percentile(values, p) {
  const list = [...values].sort((a, b) => a - b);
  return list.length
    ? +list[Math.min(list.length - 1, Math.floor(p * list.length))].toFixed(1)
    : null;
}

/**
 * rAF intervals while the page moves. `frames` holds [timestamp, scrollY]
 * pairs; a frame counts when scrollY changes into it or out of it.
 */
export function rafStats(frames) {
  const intervals = [];
  for (let i = 1; i < frames.length; i++) {
    const moving =
      frames[i][1] !== frames[i - 1][1] ||
      (frames[i + 1] !== undefined && frames[i + 1][1] !== frames[i][1]);
    if (moving) intervals.push(frames[i][0] - frames[i - 1][0]);
  }
  return {
    frames: intervals.length,
    rafP50: percentile(intervals, 0.5),
    rafP99: percentile(intervals, 0.99),
    over34: intervals.filter((interval) => interval > 34).length,
  };
}

const RENDERING_EVENTS = new Set([
  "UpdateLayoutTree",
  "Layout",
  "PrePaint",
  "Paint",
  "Layerize",
  "Commit",
  "Animation",
]);

/**
 * Totals from a Chrome trace. The renderer main thread is the thread of the
 * `markName` user-timing mark, which the page sets when the scroll starts.
 * Without the mark it is the busiest CrRendererMain.
 */
export function summarizeTrace(
  events,
  { markName = "scroll-start", wholeDocumentElements = 500 } = {},
) {
  const key = (event) => `${event.pid}:${event.tid}`;
  const mark = events.find((event) => event.name === markName && event.ph !== "E");
  let mainKey = mark ? key(mark) : null;
  if (!mainKey) {
    const names = {};
    for (const event of events)
      if (event.name === "thread_name") names[key(event)] = event.args?.name;
    const counts = {};
    for (const event of events)
      if (names[key(event)] === "CrRendererMain")
        counts[key(event)] = (counts[key(event)] || 0) + 1;
    mainKey = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  }
  const since = mark?.ts ?? -Infinity;
  const totals = { Paint: 0, UpdateLayoutTree: 0, Layout: 0, PrePaint: 0, Layerize: 0, Commit: 0 };
  const tasks = [];
  const rendering = [];
  let busyMs = 0;
  let wholeDocumentRecalcs = 0;
  let largestRecalc = 0;
  let dropped = 0;
  let drawn = 0;
  let checkerTiles = 0;
  let checkerEvents = 0;
  let missingContentFrames = 0;
  for (const event of events) {
    if (event.name === "DroppedFrame") dropped++;
    else if (event.name === "DrawFrame") drawn++;
    else if (/AppendQuads checkerboard$/.test(event.name)) {
      checkerEvents++;
      checkerTiles += event.args?.missing_tile_count ?? 0;
    } else if (
      event.name === "PipelineReporter" &&
      event.ph === "b" &&
      event.args?.chrome_frame_reporter?.has_missing_content
    )
      missingContentFrames++;
    if (event.ph !== "X" || !event.dur || key(event) !== mainKey) continue;
    if (event.name in totals) totals[event.name] += event.dur / 1000;
    if (RENDERING_EVENTS.has(event.name)) rendering.push(event);
    if (event.name === "RunTask") {
      tasks.push(event);
      if (event.ts >= since) busyMs += event.dur / 1000;
    }
    if (event.name === "UpdateLayoutTree" && event.ts >= since) {
      const elements = event.args?.elementCount ?? 0;
      largestRecalc = Math.max(largestRecalc, elements);
      if (elements > wholeDocumentElements) wholeDocumentRecalcs++;
    }
  }
  // Main-frame tasks: a task that contains style, paint or commit work.
  tasks.sort((a, b) => a.ts - b.ts);
  rendering.sort((a, b) => a.ts - b.ts);
  let renderTaskMs = 0;
  let renderTasks = 0;
  let cursor = 0;
  for (const task of tasks) {
    const end = task.ts + task.dur;
    while (cursor < rendering.length && rendering[cursor].ts < task.ts) cursor++;
    let framed = false;
    for (let j = cursor; j < rendering.length && rendering[j].ts < end; j++)
      if (["Commit", "Paint", "UpdateLayoutTree"].includes(rendering[j].name)) framed = true;
    if (framed) {
      renderTaskMs += task.dur / 1000;
      renderTasks++;
    }
  }
  return {
    mainThreadFound: mainKey !== null,
    paintMs: Math.round(totals.Paint),
    updateLayoutTreeMs: Math.round(totals.UpdateLayoutTree),
    layoutMs: Math.round(totals.Layout),
    prePaintMs: Math.round(totals.PrePaint),
    layerizeMs: Math.round(totals.Layerize),
    commitMs: Math.round(totals.Commit),
    renderTaskMs: Math.round(renderTaskMs),
    renderTasks,
    busyMs: Math.round(busyMs),
    wholeDocumentRecalcs,
    largestRecalc,
    dropped,
    drawn,
    checkerTiles,
    checkerEvents,
    missingContentFrames,
  };
}

/** Load metrics from the PerformanceObserver buffers the page collected. */
export function summarizeLoad({ longTasks, loafs, lcp, paints, commits }) {
  const fcp = paints.find((entry) => entry.name === "first-contentful-paint")?.startTime ?? 0;
  const firstCommit = commits[0] ?? null;
  const forced = (loaf) => loaf.scripts.reduce((sum, script) => sum + (script.forced || 0), 0);
  const afterHydration =
    firstCommit === null ? [] : loafs.filter((loaf) => loaf.start + loaf.duration > firstCommit);
  const forcedAfter = afterHydration.filter((loaf) => forced(loaf) >= 50);
  return {
    fcp: Math.round(fcp),
    lcp: lcp.length ? Math.round(lcp.at(-1).startTime) : null,
    lcpElement: lcp.at(-1)?.element ?? null,
    tbt: Math.round(
      longTasks
        .filter((task) => task.start >= fcp)
        .reduce((sum, task) => sum + Math.max(0, task.duration - 50), 0),
    ),
    longTaskMs: Math.round(longTasks.reduce((sum, task) => sum + task.duration, 0)),
    longTasks: longTasks.length,
    firstCommit: firstCommit === null ? null : Math.round(firstCommit),
    forcedLoafsAfterHydration: forcedAfter.length,
    maxForcedMs: Math.round(Math.max(0, ...afterHydration.map(forced))),
  };
}

/** Targets for a cell, or null when the definition of done names none. */
export function targetsFor(mode, cell) {
  if (mode === "load") return TARGETS.load[`${cell.device}-${cell.cpu}x`] ?? null;
  return TARGETS[mode]?.[cell.id] ?? null;
}

/**
 * Checks the candidate medians against the targets. A ratio target whose
 * base or floor was not measured is reported as "missing"; --enforce counts
 * it as a failure, so a gate cannot pass by leaving the base out.
 */
export function evaluate(targets, medians) {
  const results = [];
  if (!targets) return results;
  const candidate = medians.candidate ?? {};
  for (const [metric, rule] of Object.entries(targets)) {
    const value = candidate[metric];
    const check = (kind, limit, reference) => {
      if (value === null || value === undefined) {
        results.push({ metric, kind, limit, status: "missing", detail: "no candidate value" });
        return;
      }
      if (kind === "max") {
        results.push({ metric, kind, limit, value, status: value <= limit ? "pass" : "fail" });
        return;
      }
      if (reference === null || reference === undefined) {
        results.push({
          metric,
          kind,
          limit,
          value,
          status: "missing",
          detail: `no ${kind === "vsBase" ? "base" : "floor"} run`,
        });
        return;
      }
      const ratio = reference === 0 ? (value === 0 ? 1 : Infinity) : value / reference;
      results.push({
        metric,
        kind,
        limit,
        value,
        reference,
        ratio,
        status: ratio <= limit ? "pass" : "fail",
      });
    };
    if (rule.max !== undefined) check("max", rule.max);
    if (rule.vsBase !== undefined) check("vsBase", rule.vsBase, medians.base?.[metric]);
    if (rule.vsFloor !== undefined) check("vsFloor", rule.vsFloor, medians.floor?.[metric]);
  }
  return results;
}

/** Round-robin schedule: each round visits every cell and rotates the variant order. */
export function schedule(cells, variants, runs) {
  const plan = [];
  for (let round = 0; round < runs; round++)
    cells.forEach((cell, index) => {
      const shift = (round + index) % variants.length;
      for (const variant of [...variants.slice(shift), ...variants.slice(0, shift)])
        plan.push({ round, cell, variant });
    });
  return plan;
}

// ---------------------------------------------------------------- browser side

// Headless Chrome reports the host's cores; Android with 4 or fewer is economy.
const PIN_CAPABLE = () => {
  for (const [name, value] of [
    ["hardwareConcurrency", 8],
    ["deviceMemory", 8],
  ])
    try {
      Object.defineProperty(Navigator.prototype, name, { get: () => value, configurable: true });
    } catch {
      /* already pinned */
    }
};

// Records React commits (development and production builds) through the devtools hook.
const REACT_COMMITS = () => {
  window.__commits = [];
  let id = 0;
  window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
    supportsFiber: true,
    renderers: new Map(),
    isDisabled: false,
    checkDCE() {},
    inject(renderer) {
      this.renderers.set(++id, renderer);
      return id;
    },
    onScheduleFiberRoot() {},
    onCommitFiberUnmount() {},
    onPostCommitFiberRoot() {},
    onCommitFiberRoot() {
      window.__commits.push(performance.now());
    },
  };
};

const LOAD_OBSERVERS = () => {
  const buffers = (window.__perf = { longTasks: [], loafs: [], lcp: [], paints: [] });
  const observe = (type, push) => {
    try {
      new PerformanceObserver((list) => list.getEntries().forEach(push)).observe({
        type,
        buffered: true,
      });
    } catch {
      /* unsupported entry type */
    }
  };
  observe("longtask", (entry) =>
    buffers.longTasks.push({ start: entry.startTime, duration: entry.duration }),
  );
  observe("long-animation-frame", (entry) =>
    buffers.loafs.push({
      start: entry.startTime,
      duration: entry.duration,
      scripts: entry.scripts.map((script) => ({
        forced: script.forcedStyleAndLayoutDuration,
        source: `${(script.sourceURL || "").split("/").pop()}:${script.sourceFunctionName}`,
      })),
    }),
  );
  observe("largest-contentful-paint", (entry) =>
    buffers.lcp.push({
      startTime: entry.startTime,
      element: entry.element
        ? `${entry.element.tagName.toLowerCase()}.${String(entry.element.className || "").split(" ")[0]}`
        : entry.url,
    }),
  );
  observe("paint", (entry) =>
    buffers.paints.push({ name: entry.name, startTime: entry.startTime }),
  );
};

async function waitForWorld(page, route) {
  if (route.startsWith("/world")) {
    await page.waitForSelector(".site-shell", { timeout: 60_000 });
    await page.waitForFunction(() => document.documentElement.dataset.mode === "world", undefined, {
      timeout: 60_000,
    });
  }
  // Hydrated: a React commit has landed (a pre-paint data-mode alone is not enough).
  await page.waitForFunction(() => (window.__commits || []).length > 0, undefined, {
    timeout: 60_000,
  });
  await page
    .waitForFunction(
      () => {
        const shell = document.querySelector(".site-shell");
        return (
          !shell ||
          !shell.classList.contains("mirage-edition") ||
          shell.dataset.mirageBoot === "done"
        );
      },
      undefined,
      { timeout: 30_000 },
    )
    .catch(() => {});
  await page
    .waitForFunction(
      () => !document.documentElement.hasAttribute("data-route-scroll-settling"),
      undefined,
      {
        timeout: 10_000,
      },
    )
    .catch(() => {});
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
}

async function launch(chromium, cell, mode) {
  const device = DEVICES[cell.device];
  const args = [...SETTINGS[cell.setting]];
  if (mode === "gpu")
    args.push(
      `--force-device-scale-factor=${device.deviceScaleFactor}`,
      `--force-gpu-mem-available-mb=${cell.gpuMemoryMb}`,
    );
  const browser = await chromium.launch({
    channel: process.env.PW_BROWSER_CHANNEL || "chrome",
    args,
  });
  const context = await browser.newContext({
    viewport: device.viewport,
    deviceScaleFactor: device.deviceScaleFactor,
    isMobile: true,
    hasTouch: true,
    userAgent: process.env.SI_UA || device.userAgent,
    locale: "ja-JP",
  });
  await context.addInitScript(PIN_CAPABLE);
  await context.addInitScript(REACT_COMMITS);
  return { browser, context };
}

function readTrace(path, keepDir, name) {
  const text = readFileSync(path, "utf8");
  if (keepDir) writeFileSync(join(keepDir, `${name}.json`), text);
  rmSync(path, { force: true });
  const parsed = JSON.parse(text);
  return Array.isArray(parsed) ? parsed : parsed.traceEvents;
}

/** A touch point that starts a page scroll: not a rail, a button or a link. */
const pickScrollPoint = () => {
  for (const y of [0.72, 0.55, 0.85, 0.4].map((f) => Math.round(innerHeight * f)))
    for (const x of [Math.round(innerWidth / 2), 10, innerWidth - 10]) {
      const element = document.elementFromPoint(x, y);
      if (
        element &&
        getComputedStyle(element).touchAction !== "none" &&
        !element.closest(
          ".liquid-swipe-tabs, .episode-grid, .ios-slide-open, .zeus-button, .rw-gate-button, button, a",
        )
      )
        return { x, y };
    }
  return { x: 10, y: Math.round(innerHeight * 0.72) };
};

async function measureScroll(
  chromium,
  { url, cell, variant, route, gesture, mode, tracePath, keepDir, name },
) {
  const { browser, context } = await launch(chromium, cell, mode);
  try {
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(url + route, { waitUntil: "load", timeout: 120_000 });
    await waitForWorld(page, route);
    if (variant === "floor") await page.addStyleTag({ content: FLOOR_CSS });
    await page.waitForTimeout(mode === "gpu" ? 2500 : 1500);
    const cdp = await context.newCDPSession(page);
    if (cell.cpu !== 1) await cdp.send("Emulation.setCPUThrottlingRate", { rate: cell.cpu });
    await page.evaluate(() => {
      window.__frames = [];
      window.__loafs = [];
      window.__recording = true;
      const loop = (time) => {
        window.__frames.push([time, scrollY]);
        if (window.__recording) requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
      new PerformanceObserver((list) =>
        list
          .getEntries()
          .forEach((entry) =>
            window.__loafs.push({ start: entry.startTime, duration: entry.duration }),
          ),
      ).observe({ type: "long-animation-frame" });
    });
    await browser.startTracing(page, {
      path: tracePath,
      categories: mode === "gpu" ? GPU_TRACE_CATEGORIES : SCROLL_TRACE_CATEGORIES,
    });
    await page.evaluate(() => performance.mark("scroll-start"));
    const started = Date.now();
    let gestures = 0;
    const viewport = DEVICES[cell.device].viewport;
    for (let i = 0; i < (mode === "gpu" ? 40 : 60); i++) {
      const { y, max } = await page.evaluate(() => ({
        y: scrollY,
        max: document.documentElement.scrollHeight - innerHeight,
      }));
      if (y >= max - (mode === "gpu" ? 50 : 4)) break;
      if (mode === "gpu") {
        // The GPU audit's strokes (scratchpad gpu/scroll2.mjs), so tile counts stay comparable.
        await cdp.send("Input.synthesizeScrollGesture", {
          x: 24,
          y: Math.round(viewport.height * 0.8),
          yDistance: -560,
          speed: 2400,
          gestureSourceType: "touch",
          repeatCount: 1,
        });
      } else {
        const point = await page.evaluate(pickScrollPoint);
        if (gesture === "fling") {
          await cdp.send("Input.synthesizeScrollGesture", {
            x: point.x,
            y: point.y,
            yDistance: -Math.min(320, point.y - 60),
            xDistance: 0,
            speed: 2600,
            gestureSourceType: "touch",
            preventFling: false,
          });
          await page.waitForTimeout(250);
        } else {
          await cdp.send("Input.synthesizeScrollGesture", {
            x: point.x,
            y: point.y,
            yDistance: -Math.min(480, point.y - 60),
            xDistance: 0,
            speed: 700,
            gestureSourceType: "touch",
            preventFling: true,
          });
          await page.waitForTimeout(60);
        }
      }
      gestures++;
    }
    const elapsed = Date.now() - started;
    await page.waitForTimeout(mode === "gpu" ? 800 : 400);
    await browser.stopTracing();
    if (cell.cpu !== 1) await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
    const data = await page.evaluate(() => {
      window.__recording = false;
      return {
        frames: window.__frames,
        loafs: window.__loafs,
        y: scrollY,
        max: document.documentElement.scrollHeight - innerHeight,
      };
    });
    const trace = summarizeTrace(readTrace(tracePath, keepDir, name));
    if (!trace.mainThreadFound) throw new Error("no renderer main thread in the trace");
    const seconds = elapsed / 1000;
    return {
      ...rafStats(data.frames),
      ...trace,
      mainMsPerSec: Math.round(trace.renderTaskMs / seconds),
      busyMsPerSec: Math.round(trace.busyMs / seconds),
      loafs: data.loafs.filter((loaf) => loaf.duration >= 50).length,
      loafMaxMs: Math.round(Math.max(0, ...data.loafs.map((loaf) => loaf.duration))),
      gestures,
      strokes: gestures,
      seconds: +seconds.toFixed(1),
      reachedEnd: data.y >= data.max - 60,
      errors: errors.slice(0, 3),
    };
  } finally {
    await browser.close();
  }
}

async function measureLoad(chromium, { url, cell, route }) {
  const { browser, context } = await launch(chromium, cell, "load");
  try {
    await context.addInitScript(LOAD_OBSERVERS);
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const cdp = await context.newCDPSession(page);
    if (cell.cpu !== 1) await cdp.send("Emulation.setCPUThrottlingRate", { rate: cell.cpu });
    await page.goto(url + route, { waitUntil: "load", timeout: 120_000 });
    await waitForWorld(page, route);
    // A reader's first input ends LCP. Without one, the hero poster's 5.2 s
    // autoplay keeps adding larger candidates, and LCP measures the carousel
    // instead of the load.
    await page.keyboard.press("Shift");
    await page.waitForTimeout(4000);
    const observed = await page.evaluate(() => ({ ...window.__perf, commits: window.__commits }));
    if (cell.cpu !== 1) await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
    return { ...summarizeLoad(observed), errors: errors.slice(0, 3) };
  } finally {
    await browser.close();
  }
}

// ---------------------------------------------------------------- report

const format = (value, digits) =>
  value === null || value === undefined ? "-" : Number(value).toFixed(digits);
const ratioText = (value, reference) =>
  value === null || value === undefined || reference === null || reference === undefined
    ? "-"
    : reference === 0
      ? value === 0
        ? "1.00"
        : "inf"
      : (value / reference).toFixed(2);

function report(mode, cells, variants, results, gesture) {
  const lines = [];
  let failures = 0;
  let missing = 0;
  for (const cell of cells) {
    const runs = Object.fromEntries(
      variants.map((variant) => [
        variant,
        results.filter((r) => r.cell === cell.id && r.variant === variant && r.metrics),
      ]),
    );
    const medians = {};
    for (const variant of variants) {
      if (!runs[variant].length) continue;
      medians[variant] = {};
      for (const [key] of METRICS[mode])
        medians[variant][key] = median(runs[variant].map((r) => r.metrics[key]));
    }
    const count = Math.max(0, ...variants.map((variant) => runs[variant].length));
    lines.push(
      "",
      `### ${cell.label} (${mode === "scroll" ? `${gesture}, ` : ""}median of ${count})`,
      "",
    );
    const header = [
      "metric",
      ...variants,
      "cand/base",
      ...(variants.includes("floor") ? ["cand/floor"] : []),
      "runs (base / candidate)",
    ];
    lines.push(`| ${header.join(" | ")} |`, `|${header.map(() => "---").join("|")}|`);
    for (const [key, label, digits] of METRICS[mode]) {
      const row = [label, ...variants.map((variant) => format(medians[variant]?.[key], digits))];
      row.push(ratioText(medians.candidate?.[key], medians.base?.[key]));
      if (variants.includes("floor"))
        row.push(ratioText(medians.candidate?.[key], medians.floor?.[key]));
      const list = (variant) =>
        runs[variant]?.map((r) => format(r.metrics[key], digits)).join(", ") || "-";
      row.push(`${list("base")} / ${list("candidate")}`);
      lines.push(`| ${row.join(" | ")} |`);
    }
    const verdicts = evaluate(targetsFor(mode, cell), medians);
    if (verdicts.length) {
      lines.push("", "Targets (candidate median):");
      for (const verdict of verdicts) {
        const label = METRICS[mode].find(([key]) => key === verdict.metric)?.[1] ?? verdict.metric;
        const bound =
          verdict.kind === "max"
            ? `<= ${verdict.limit}`
            : `<= ${verdict.limit}x ${verdict.kind === "vsBase" ? "base" : "floor"}`;
        const actual =
          verdict.status === "missing"
            ? verdict.detail
            : verdict.kind === "max"
              ? String(verdict.value)
              : `${verdict.ratio === Infinity ? "inf" : verdict.ratio.toFixed(2)}x (${verdict.value} vs ${verdict.reference})`;
        lines.push(`- ${verdict.status.toUpperCase()} ${label} ${bound}: ${actual}`);
        if (verdict.status === "fail") failures++;
        if (verdict.status === "missing") missing++;
      }
    }
    const incomplete = results.filter(
      (r) => r.cell === cell.id && r.metrics && r.metrics.reachedEnd === false,
    ).length;
    if (incomplete) lines.push(`- note: ${incomplete} run(s) stopped before the end of the page`);
    const failed = results.filter((r) => r.cell === cell.id && r.error);
    for (const r of failed)
      lines.push(`- run failed: ${r.variant} round ${r.round + 1}: ${r.error}`);
    const pageErrors = [
      ...new Set(results.filter((r) => r.cell === cell.id).flatMap((r) => r.metrics?.errors ?? [])),
    ];
    if (pageErrors.length) lines.push(`- page errors: ${pageErrors.slice(0, 3).join(" | ")}`);
  }
  return { text: lines.join("\n"), failures, missing };
}

// ---------------------------------------------------------------- main

function parseArgs(argv) {
  const options = {};
  for (const arg of argv) {
    const match = /^--([^=]+)(?:=(.*))?$/.exec(arg);
    if (!match) throw new Error(`unexpected argument ${arg}`);
    options[match[1]] = match[2] ?? true;
  }
  return options;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    const source = readFileSync(fileURLToPath(import.meta.url), "utf8");
    console.log(source.slice(source.indexOf("/**"), source.indexOf("*/") + 2));
    return;
  }
  const { checkedUrl } = await import("./browser-guard.mjs");
  const mode = options.mode || "scroll";
  if (!METRICS[mode]) throw new Error(`--mode must be scroll, gpu or load, got ${mode}`);
  const gesture = options.gesture || "drag";
  if (!["drag", "fling"].includes(gesture)) throw new Error("--gesture must be drag or fling");
  const route = options.route || "/world";
  const runs = Number(options.runs || 3);
  const cells = (options.cells ? String(options.cells).split(",") : DEFAULT_CELLS[mode]).map(
    (spec) => parseCell(spec.trim(), mode),
  );
  const candidateUrl = checkedUrl(
    (process.env.BASE_URL || "http://127.0.0.1:8082").replace(/\/$/, ""),
  );
  const baseUrl = process.env.BASE_REF_URL
    ? checkedUrl(process.env.BASE_REF_URL.replace(/\/$/, ""))
    : null;
  let variants = options.variants
    ? String(options.variants).split(",")
    : [...DEFAULT_VARIANTS[mode]];
  for (const variant of variants)
    if (!["base", "candidate", "floor"].includes(variant))
      throw new Error(`unknown variant ${variant}`);
  if (!baseUrl) {
    if (variants.includes("base"))
      console.error(
        "BASE_REF_URL is not set: skipping the base variant; ratios to base are not measured.",
      );
    variants = variants.filter((variant) => variant !== "base");
  }
  if (mode !== "scroll") variants = variants.filter((variant) => variant !== "floor");
  const floorOn = options.floor || (baseUrl ? "base" : "candidate");
  const urls = {
    base: baseUrl,
    candidate: candidateUrl,
    floor: floorOn === "base" ? baseUrl : candidateUrl,
  };
  if (!urls.floor) throw new Error("--floor=base needs BASE_REF_URL");

  const { chromium } = await import("playwright");
  const keepDir = options["keep-traces"] ? resolve(String(options["keep-traces"])) : null;
  if (keepDir) mkdirSync(keepDir, { recursive: true });
  const scratch = mkdtempSync(join(tmpdir(), "verify-samsung-"));
  const plan = schedule(cells, variants, runs);
  const results = [];
  console.error(
    `${mode}: ${cells.map((c) => c.id).join(", ")} | ${variants.join(", ")} x ${runs} = ${plan.length} runs\n` +
      `  base ${urls.base ?? "-"}  candidate ${urls.candidate}  floor ${variants.includes("floor") ? `${floorOn} (${urls.floor})` : "-"}`,
  );
  try {
    for (const [index, step] of plan.entries()) {
      const name = `${mode}-${step.cell.id}-${step.variant}-r${step.round + 1}`;
      const job = {
        url: urls[step.variant],
        cell: step.cell,
        variant: step.variant,
        route,
        gesture,
        mode,
        tracePath: join(scratch, `${name}.json`),
        keepDir,
        name,
      };
      let metrics = null;
      let error = null;
      for (let attempt = 0; attempt < 2 && !metrics; attempt++) {
        try {
          metrics =
            mode === "load" ? await measureLoad(chromium, job) : await measureScroll(chromium, job);
          error = null;
        } catch (caught) {
          error = caught.message.split("\n")[0];
        }
      }
      results.push({
        cell: step.cell.id,
        variant: step.variant,
        round: step.round,
        metrics,
        error,
      });
      const brief = metrics
        ? METRICS[mode]
            .slice(0, 8)
            .map(([key, , digits]) => `${key}=${format(metrics[key], digits)}`)
            .join(" ")
        : `FAILED ${error}`;
      console.error(
        `[${index + 1}/${plan.length}] ${step.cell.id} ${step.variant} r${step.round + 1}: ${brief}`,
      );
    }
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }

  const { text, failures, missing } = report(mode, cells, variants, results, gesture);
  console.log(`## Samsung Internet ${mode} (${new Date().toISOString()})`);
  console.log(
    `base ${urls.base ?? "-"} | candidate ${urls.candidate}${variants.includes("floor") ? ` | floor on ${floorOn}` : ""}`,
  );
  console.log(text);
  const out = options.out
    ? resolve(String(options.out))
    : join(tmpdir(), `verify-samsung-performance-${mode}-${Date.now()}.json`);
  writeFileSync(
    out,
    JSON.stringify(
      { mode, route, gesture, runs, urls, floorOn, cells, variants, results },
      null,
      1,
    ),
  );
  console.log(`\nRaw runs: ${out}`);
  if (options.enforce) {
    if (failures || missing) {
      console.log(`ENFORCE: ${failures} target(s) missed, ${missing} not measurable`);
      process.exitCode = 1;
    } else console.log("ENFORCE: every target met");
  }
}

const invokedDirectly = (() => {
  try {
    return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
})();
if (invokedDirectly) {
  main().catch((error) => {
    console.error(process.env.DEBUG ? error : `verify-samsung-performance: ${error.message}`);
    process.exit(1);
  });
}
