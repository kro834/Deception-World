// Disposable browser QA; never uses a signed-in browser profile.
// BASE_URL=... BASELINE_URL=... BENCH_RUNS=5 node scripts/verify-rexonance-zenith.mjs
// ZENITH_WEBKIT=1 exercises WebKit too; ZENITH_TRACE=1 saves the end-of-scroll trace.
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium, webkit } from "playwright";

const base = process.env.BASE_URL || "http://127.0.0.1:8564";
const baseline = process.env.BASELINE_URL;
const out = process.env.OUT_DIR || "/private/tmp/rexonance-zenith-verification";
await mkdir(out, { recursive: true });
const pixel = {
  viewport: { width: 412, height: 915 },
  deviceScaleFactor: 2.625,
  isMobile: true,
  hasTouch: true,
  userAgent:
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36",
};
const browser = await chromium.launch({ channel: "chrome" });
const errors = [];
const ready = async (page, url) => {
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(url, { waitUntil: "load" });
  await page.waitForFunction(
    () =>
      document.querySelector("main[data-motion-ready]") &&
      !document.documentElement.hasAttribute("data-loading"),
    null,
    { timeout: 60000 },
  );
  // Override *all* scroll containers. behavior:'instant' also makes every
  // scroll call unambiguous; actual positions are asserted during the probe.
  await page.addStyleTag({ content: "html,body,* { scroll-behavior:auto !important }" });
  await page.waitForTimeout(4000);
};
const report = { functional: [], runs: [] };
const snapshot = (page) =>
  page.evaluate(() => {
    const r = document.querySelector(".rzn-suitup");
    const f = r.querySelector(".rzn-frame");
    return {
      state: r.dataset.rznState,
      height: r.offsetHeight,
      frameHeight: f.offsetHeight,
      percent: r.querySelector(".rzn-percent").textContent,
      constrained: document.documentElement.hasAttribute("data-rzn-constrained"),
      top: r.getBoundingClientRect().top + scrollY,
      pin: parseFloat(getComputedStyle(f).top) || 0,
      hashTop: location.hash
        ? document.querySelector(location.hash)?.getBoundingClientRect().top
        : null,
      timeline:
        CSS.supports("animation-timeline", "view()") &&
        CSS.supports("animation-range", "entry 0% entry 100%"),
    };
  });

async function functional(engine, label, profile, { connection, noTimeline = false } = {}) {
  const context = await engine.newContext(profile);
  if (connection)
    await context.addInitScript((value) => {
      Object.defineProperty(navigator, "connection", {
        value: { ...value, addEventListener() {}, removeEventListener() {} },
      });
    }, connection);
  if (noTimeline) {
    await context.addInitScript(() => {
      const supports = CSS.supports.bind(CSS);
      CSS.supports = (...args) =>
        args.some((arg) => /animation-timeline|animation-range/.test(arg))
          ? false
          : supports(...args);
    });
    // Disable the matching native @supports branches as well as JS feature
    // detection: this tests the real WebKit painter on the fallback rules.
    await context.route(/\.css(?:\?|$)/, async (route) => {
      const response = await route.fetch();
      const css = (await response.text()).replace(
        /\(animation-timeline\s*:\s*view\(\)\)/g,
        "(zenith-unsupported:yes)",
      );
      await route.fulfill({ response, body: css });
    });
  }
  const page = await context.newPage();
  for (const hash of connection ? ["p14", "stages", "system"] : [""]) {
    await ready(page, `${base}/rexonance-saga${hash ? `#${hash}` : ""}`);
    const start = await snapshot(page);
    if (connection) {
      assert.equal(start.constrained, true, label);
      assert.equal(start.state, undefined, label);
      assert.ok(start.height <= start.frameHeight + 2, `${label}: compact runway`);
      await page.waitForTimeout(1600);
      const end = await snapshot(page);
      assert.ok(Math.abs(start.hashTop - end.hashTop) < 2, `${label} #${hash}: anchor drift`);
      assert.ok(
        start.hashTop > 0 && start.hashTop < 180,
        `${label} #${hash}: arrival ${start.hashTop}`,
      );
      report.functional.push({ label, hash, ...end });
    } else {
      // Trigger warm-up while still 3.4 screens outside the viewport.
      await page.evaluate(
        (top) => scrollTo({ top, behavior: "instant" }),
        Math.max(0, start.top - innerHeightFor(profile) * 4.4),
      );
      await page.waitForTimeout(1600);
      const warm = await snapshot(page);
      assert.notEqual(warm.state, "live", "preparation alone must not activate the scene");
      for (const progress of [0.1, 0.35, 0.72, 0.84, 1, 0.35]) {
        await page.evaluate(
          ({ start, progress }) =>
            scrollTo({
              top: start.top - start.pin + progress * (start.height - start.frameHeight),
              behavior: "instant",
            }),
          { start, progress },
        );
        await page.waitForFunction(
          () => document.querySelector(".rzn-suitup").dataset.rznState === "live",
        );
        await page.waitForTimeout(350);
        const state = await snapshot(page);
        assert.equal(
          Number(state.percent),
          Math.round(Math.min(1, progress / 0.93) * 100),
          `${label} scrub ${progress}`,
        );
        if (progress === 0.35) await page.screenshot({ path: `${out}/${label}-arms.png` });
      }
      await page.evaluate(() =>
        document.querySelector("#system").scrollIntoView({ behavior: "instant" }),
      );
      await page.waitForTimeout(200);
      const fallback = await page.evaluate(() => ({
        entered: document.querySelector(".rzn-trinity").hasAttribute("data-rsn-in"),
        animations: document
          .getAnimations()
          .map((a) => ({ name: a.animationName, timeline: a.timeline?.constructor.name })),
      }));
      if (noTimeline) {
        assert.equal(fallback.entered, true, "WebKit fallback scene should play once");
        assert.ok(
          !fallback.animations.some(
            (a) => /^rzn-/.test(a.name || "") && /^(View|Scroll)Timeline$/.test(a.timeline),
          ),
          "ZENITH fallback must not depend on scroll timelines",
        );
      }
      report.functional.push({ label, ...(await snapshot(page)), fallback });
    }
  }
  await context.close();
}
const innerHeightFor = (profile) => profile.viewport.height;

const percentile = (values, p) =>
  [...values].sort((a, b) => a - b)[Math.min(values.length - 1, Math.floor(values.length * p))] ||
  0;
async function benchmark(url, label, trace = false) {
  const context = await browser.newContext(pixel);
  await context.addInitScript(() => {
    window.__zenith = { frames: [], long: [], loaf: [], idle: [] };
    let last = 0;
    const tick = (t) => {
      if (last) window.__zenith.frames.push({ t, d: t - last, y: scrollY });
      last = t;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    new PerformanceObserver((list) =>
      window.__zenith.long.push(
        ...list.getEntries().map((e) => ({ t: e.startTime, d: e.duration })),
      ),
    ).observe({ type: "longtask", buffered: true });
    try {
      new PerformanceObserver((list) =>
        window.__zenith.loaf.push(
          ...list.getEntries().map((e) => ({
            t: e.startTime,
            d: e.duration,
            blocking: e.blockingDuration,
            scripts: e.scripts.map((s) => ({
              name: s.sourceFunctionName,
              duration: s.duration,
              url: s.sourceURL,
            })),
          })),
        ),
      ).observe({ type: "long-animation-frame", buffered: true });
    } catch {
      /* Long Animation Frames is optional instrumentation. */
    }
    const idle = window.requestIdleCallback;
    if (idle)
      window.requestIdleCallback = (fn, options) =>
        idle.call(
          window,
          (deadline) => {
            const start = performance.now();
            fn(deadline);
            window.__zenith.idle.push({ t: start, d: performance.now() - start, y: scrollY });
          },
          options,
        );
  });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  await cdp.send("Performance.enable");
  await ready(page, `${url}/rexonance-saga`);
  const metrics = async () =>
    Object.fromEntries(
      (await cdp.send("Performance.getMetrics")).metrics.map((m) => [m.name, m.value]),
    );
  const before = await metrics();
  const events = [];
  let traced;
  if (trace) {
    cdp.on("Tracing.dataCollected", (e) => events.push(...e.value));
    traced = new Promise((resolve) => cdp.once("Tracing.tracingComplete", resolve));
    await cdp.send("Tracing.start", {
      categories:
        "devtools.timeline,disabled-by-default-devtools.timeline,v8.execute,blink,cc,gpu,blink.user_timing",
      transferMode: "ReportEvents",
    });
  }
  const marks = await page.evaluate(async () => {
    const total = document.documentElement.scrollHeight - innerHeight;
    const sections = [...document.querySelectorAll("main > *")].map((e) => ({
      name: e.id || e.className,
      y: e.getBoundingClientRect().top + scrollY,
    }));
    const start = performance.now();
    let maxPositionError = 0;
    await new Promise((resolve) => {
      let y = 0;
      const step = () => {
        y = Math.min(total, y + 24);
        scrollTo({ top: y, behavior: "instant" });
        maxPositionError = Math.max(maxPositionError, Math.abs(scrollY - y));
        if (y === total) resolve();
        else requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
    performance.mark("zenith-scroll-end");
    return {
      start,
      stop: performance.now(),
      total,
      sections,
      maxPositionError,
      smooth: getComputedStyle(document.documentElement).scrollBehavior,
    };
  });
  await page.waitForTimeout(1500);
  const after = await metrics();
  const data = await page.evaluate(
    (start) => ({
      ...window.__zenith,
      frames: window.__zenith.frames.filter((f) => f.t >= start),
      end: performance.now(),
    }),
    marks.start,
  );
  assert.equal(marks.smooth, "auto");
  assert.ok(marks.maxPositionError <= 1, `instant scroll error ${marks.maxPositionError}`);
  const frames = data.frames.map((f) => f.d);
  const frameInterval = percentile(frames, 0.5);
  // A missed 60 Hz frame is about 33.3 ms, not necessarily >33.4 ms.
  const missedFrames = data.frames.filter((f) => f.d > frameInterval * 1.5);
  const long = data.long.filter((e) => e.t >= marks.start);
  const taskMs = (after.TaskDuration - before.TaskDuration) * 1000;
  const result = {
    label,
    url,
    ...marks,
    taskMs,
    msPerFrame: taskMs / frames.length,
    scriptMs: (after.ScriptDuration - before.ScriptDuration) * 1000,
    styleMs: (after.RecalcStyleDuration - before.RecalcStyleDuration) * 1000,
    layoutMs: (after.LayoutDuration - before.LayoutDuration) * 1000,
    frameCount: frames.length,
    p50: percentile(frames, 0.5),
    p95: percentile(frames, 0.95),
    p99: percentile(frames, 0.99),
    maxFrame: Math.max(...frames),
    missedFrames,
    over33: data.frames.filter((f) => f.d > 33.4),
    longTasks: long,
    tbt: long.reduce((sum, e) => sum + Math.max(0, e.d - 50), 0),
    idle: data.idle.filter((e) => e.t >= marks.start),
    loaf: data.loaf.filter((e) => e.t >= marks.start),
    endFrames: data.frames.filter((f) => f.t >= marks.stop),
  };
  if (trace) {
    await cdp.send("Tracing.end");
    await traced;
    await writeFile(`${out}/${label}-trace.json`, JSON.stringify(events));
    const end = events.find((e) => e.name === "zenith-scroll-end")?.ts;
    result.endTrace = events
      .filter((e) => e.ph === "X" && e.ts >= end && e.dur > 4000)
      .sort((a, b) => b.dur - a.dur)
      .slice(0, 25)
      .map((e) => ({ name: e.name, ms: e.dur / 1000, afterEnd: (e.ts - end) / 1000, tid: e.tid }));
  }
  await writeFile(`${out}/${label}.json`, JSON.stringify(result, null, 2));
  console.log(
    JSON.stringify({
      label,
      taskMs: Math.round(taskMs),
      msPerFrame: result.msPerFrame.toFixed(2),
      p95: result.p95,
      over33: result.over33.length,
      endDrops: missedFrames.filter((f) => f.t >= marks.stop).length,
      longTasks: long.length,
    }),
  );
  await context.close();
  return result;
}

try {
  if (!process.env.BENCH_ONLY) {
    await functional(browser, "chromium-touch", pixel);
    for (const [label, connection] of [
      ["save-data", { saveData: true, effectiveType: "4g" }],
      ["2g", { effectiveType: "2g" }],
    ])
      await functional(browser, label, pixel, { connection });
    if (process.env.ZENITH_WEBKIT) {
      const wk = await webkit.launch();
      try {
        const ipad = {
          viewport: { width: 1024, height: 768 },
          isMobile: true,
          hasTouch: true,
          deviceScaleFactor: 2,
        };
        await functional(wk, "webkit-native", ipad);
        await functional(wk, "webkit-no-timeline", ipad, { noTimeline: true });
      } finally {
        await wk.close();
      }
    }
  }
  if (baseline) {
    for (let i = 0; i < Number(process.env.BENCH_RUNS || 5); i++) {
      // Alternate AB then BA to reduce temperature/order bias.
      const pair = [
        [baseline, `base-${i + 1}`],
        [base, `candidate-${i + 1}`],
      ];
      if (i % 2) pair.reverse();
      for (const [url, label] of pair) report.runs.push(await benchmark(url, label));
    }
  }
  if (process.env.ZENITH_TRACE) report.trace = await benchmark(base, "candidate-end", true);
  assert.deepEqual(errors, [], "browser runtime errors");
  await writeFile(`${out}/report.json`, JSON.stringify(report, null, 2));
  console.log(`ZENITH verification passed: ${out}/report.json`);
} finally {
  await browser.close();
}
