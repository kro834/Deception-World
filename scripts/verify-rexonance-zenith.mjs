// Disposable browser QA; never uses a signed-in browser profile.
// BASE_URL=... BASELINE_URL=... BENCH_RUNS=5 node scripts/verify-rexonance-zenith.mjs
// CAPTURE=1 [CAPTURE_PROFILES=desktop1440,phone390] captures only visual profiles.
// CAPTURE_BASELINE=1 records pre-phase builds without asserting new phase/form attributes.
// BROWSER=webkit selects WebKit; ZENITH_WEBKIT=1 adds WebKit to Chromium's full run.
// ZENITH_TRACE=1 saves the end-of-scroll trace.
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
const profiles = [
  { name: "desktop1440", viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
  {
    name: "phone390",
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
  },
  {
    name: "narrow320",
    viewport: { width: 320, height: 844 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
  },
  {
    name: "tablet1024-landscape",
    viewport: { width: 1024, height: 768 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  },
  {
    name: "reduced-motion390",
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    reducedMotion: "reduce",
  },
];
const requestedProfiles = process.env.CAPTURE_PROFILES?.split(",")
  .map((name) => name.trim())
  .filter(Boolean);
const selectedProfiles = requestedProfiles?.length
  ? profiles.filter((profile) => requestedProfiles.includes(profile.name))
  : profiles;
assert.ok(selectedProfiles.length, "CAPTURE_PROFILES did not match any known profile");
const browserKind = process.env.BROWSER === "webkit" ? webkit : chromium;
assert.ok(!process.env.BROWSER || ["chromium", "chrome", "webkit"].includes(process.env.BROWSER));
const browser = await browserKind.launch(browserKind === chromium ? { channel: "chrome" } : {});
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
      phase: r.dataset.rznPhase || null,
      form: r.dataset.form || null,
      formComplete: r.dataset.rznFormComplete || null,
      sceneComplete: r.hasAttribute("data-rzn-complete") ? "true" : null,
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

const installCanvasDrawProbe = async (context) => {
  await context.addInitScript(() => {
    window.__rznCanvasDraws = [];
    const original = CanvasRenderingContext2D.prototype.drawImage;
    CanvasRenderingContext2D.prototype.drawImage = function (...args) {
      if (this.canvas?.matches?.("canvas.rzn-canvas")) {
        window.__rznCanvasDraws.push({
          t: performance.now(),
          source: args[0]?.constructor?.name || typeof args[0],
        });
      }
      return original.apply(this, args);
    };
  });
};

const canvasEvidence = async (page) =>
  page.evaluate(() => {
    const source = document.querySelector("canvas.rzn-canvas");
    const draws = window.__rznCanvasDraws || [];
    if (!source || !source.width || !source.height) {
      return {
        width: source?.width || 0,
        height: source?.height || 0,
        drawCalls: draws.length,
        drawEvents: draws.slice(-5),
        alphaPixels: 0,
        pixelHash: null,
      };
    }
    const sample = document.createElement("canvas");
    sample.width = 32;
    sample.height = 48;
    const context = sample.getContext("2d", { willReadFrequently: true });
    context.drawImage(source, 0, 0, sample.width, sample.height);
    const pixels = context.getImageData(0, 0, sample.width, sample.height).data;
    let alphaPixels = 0;
    let hash = 2166136261;
    for (let index = 0; index < pixels.length; index += 4) {
      if (pixels[index + 3] > 8) alphaPixels += 1;
      hash ^= pixels[index];
      hash = Math.imul(hash, 16777619);
      hash ^= pixels[index + 1];
      hash = Math.imul(hash, 16777619);
      hash ^= pixels[index + 2];
      hash = Math.imul(hash, 16777619);
      hash ^= pixels[index + 3];
      hash = Math.imul(hash, 16777619);
    }
    return {
      width: source.width,
      height: source.height,
      drawCalls: draws.length,
      drawEvents: draws.slice(-5),
      alphaPixels,
      pixelHash: (hash >>> 0).toString(16).padStart(8, "0"),
    };
  });

async function functional(engine, label, profile, { connection, noTimeline = false } = {}) {
  const context = await engine.newContext(profile);
  await installCanvasDrawProbe(context);
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
    const geometry = await page.evaluate(() => ({
      viewport: { width: innerWidth, height: innerHeight },
      document: {
        width: document.documentElement.scrollWidth,
        height: document.documentElement.scrollHeight,
      },
      overflowX: document.documentElement.scrollWidth > innerWidth,
    }));
    assert.equal(
      geometry.overflowX,
      false,
      `${label}: horizontal overflow ${JSON.stringify(geometry)}`,
    );
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
    } else if (profile.reducedMotion === "reduce") {
      assert.equal(start.state, undefined, `${label}: reduced motion must keep the static scene`);
      const evidence = await canvasEvidence(page);
      assert.equal(
        evidence.width,
        0,
        `${label}: reduced motion must not allocate the scene canvas`,
      );
      assert.equal(
        evidence.drawCalls,
        0,
        `${label}: reduced motion must not draw the scene canvas`,
      );
      const motion = await page.locator(".rzn-suitup").evaluate((runway) => ({
        complete: runway.hasAttribute("data-rzn-complete"),
        activeAnimations: runway
          .getAnimations({ subtree: true })
          .filter((animation) => animation.playState === "running").length,
      }));
      assert.equal(
        motion.activeAnimations,
        0,
        `${label}: reduced motion must not animate the scene`,
      );
      await page.screenshot({ path: `${out}/${label}-reduced-motion-static.png` });
      report.functional.push({
        label,
        geometry,
        ...start,
        evidence,
        motion,
        screenshot: `${label}-reduced-motion-static.png`,
      });
    } else {
      const formTab = page.locator("#rxs-stage-tab-max");
      if (await formTab.count()) {
        await formTab.click();
        await page.waitForFunction(
          () =>
            document.querySelector("#rxs-stage-tab-max")?.getAttribute("aria-selected") === "true",
        );
        await page.waitForFunction(
          () => document.querySelector(".rzn-suitup")?.dataset.form === "max",
        );
      }
      // Trigger warm-up while still 3.4 screens outside the viewport.
      await page.evaluate(
        (top) => scrollTo({ top, behavior: "instant" }),
        Math.max(0, start.top - innerHeightFor(profile) * 4.4),
      );
      await page.waitForTimeout(1600);
      const warm = await snapshot(page);
      assert.notEqual(warm.state, "live", "preparation alone must not activate the scene");
      const milestones = [
        { direction: "forward", progress: 0.1, name: "opening" },
        { direction: "forward", progress: 0.35, name: "arms" },
        { direction: "forward", progress: 0.72, name: "torso" },
        { direction: "forward", progress: 0.84, name: "near-complete" },
        { direction: "forward", progress: 0.975, name: "form-complete" },
        { direction: "forward", progress: 1, name: "complete" },
        { direction: "reverse", progress: 0.84, name: "near-complete" },
        { direction: "reverse", progress: 0.72, name: "torso" },
        { direction: "reverse", progress: 0.35, name: "arms" },
        { direction: "reverse", progress: 0.1, name: "opening" },
      ];
      const phases = [];
      const forwardHashes = new Set();
      if (process.env.CAPTURE_BASELINE !== "1") {
        const firstUnfinished = await snapshot(page);
        assert.notEqual(
          firstUnfinished.formComplete,
          "true",
          `${label}: nonstandard form cannot be complete before .975`,
        );
      }
      for (const { direction, progress, name } of milestones) {
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
        // `live` is set before ResizeObserver measures the newly displayed
        // canvas. Wait for the first actual scrub paint, not a 350 ms guess
        // (cold remote WebKit may still show the static "100" read-out).
        const expectedPercent = Math.round(Math.min(1, progress / 0.93) * 100);
        await page.waitForFunction(
          (expected) => {
            const runway = document.querySelector(".rzn-suitup");
            return (
              runway.querySelector("canvas").width > 0 &&
              Number(runway.querySelector(".rzn-percent").textContent) === expected
            );
          },
          expectedPercent,
          { timeout: 5000 },
        );
        const state = await snapshot(page);
        assert.equal(Number(state.percent), expectedPercent, `${label} scrub ${progress}`);
        if (process.env.CAPTURE_BASELINE !== "1")
          assert.ok(
            ["prepare", "assemble", "seal", "ignite", "evolve", "complete"].includes(state.phase),
            `${label} ${direction}/${progress}: unknown data-rzn-phase ${state.phase}`,
          );
        const evidence = await canvasEvidence(page);
        assert.ok(
          evidence.drawCalls > 0,
          `${label} ${direction}/${progress}: no canvas drawImage evidence`,
        );
        assert.ok(
          evidence.alphaPixels > 0,
          `${label} ${direction}/${progress}: sampled canvas is empty`,
        );
        if (direction === "forward" && progress < 0.975) {
          assert.notEqual(state.formComplete, "true", `${label}: form completed before .975`);
          forwardHashes.add(evidence.pixelHash);
        }
        phases.push({ direction, progress, phase: state.phase });
        if (progress >= 0.975) {
          assert.equal(state.sceneComplete, "true", `${label}: assembly must complete by .975`);
          if (process.env.CAPTURE_BASELINE !== "1") {
            await page.waitForFunction(
              () => document.querySelector(".rzn-suitup")?.dataset.rznFormComplete === "true",
              undefined,
              { timeout: 10000 },
            );
            state.formComplete = await page
              .locator(".rzn-suitup")
              .getAttribute("data-rzn-form-complete");
            assert.equal(
              state.formComplete,
              "true",
              `${label}: selected nonstandard form must resolve by .975`,
            );
            await page.waitForFunction(() => (window.__rznCanvasDraws || []).length > 0);
          }
        }
        const settledEvidence = progress >= 0.975 ? await canvasEvidence(page) : evidence;
        if (direction === "forward" && progress >= 0.975)
          forwardHashes.add(settledEvidence.pixelHash);
        const screenshot = `${label}-${direction}-${name}.png`;
        await page.screenshot({ path: `${out}/${screenshot}` });
        report.functional.push({
          label,
          direction,
          milestone: name,
          ...state,
          geometry,
          canvas: settledEvidence,
          screenshot,
        });
      }
      if (process.env.CAPTURE_BASELINE !== "1")
        assert.ok(
          phases.some(({ phase }) => phase === "complete"),
          `${label}: phase sequence never reached complete`,
        );
      assert.ok(
        forwardHashes.size >= 3,
        `${label}: canvas pixels did not change across forward scrub checkpoints`,
      );
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
      report.functional.push({ label, geometry, phases, ...(await snapshot(page)), fallback });
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
  const captureOnly = process.env.CAPTURE === "1" || process.env.CAPTURE_BASELINE === "1";
  if (!process.env.BENCH_ONLY) {
    for (const profile of selectedProfiles) await functional(browser, profile.name, profile);
    if (!captureOnly && browserKind === chromium) {
      for (const [label, connection] of [
        ["save-data", { saveData: true, effectiveType: "4g" }],
        ["2g", { effectiveType: "2g" }],
      ])
        await functional(browser, label, pixel, { connection });
    }
    if (!captureOnly && process.env.ZENITH_WEBKIT && browserKind === chromium) {
      const wk = await webkit.launch();
      try {
        const ipad = profiles.find((profile) => profile.name === "tablet1024-landscape");
        await functional(wk, "webkit-native", ipad);
        await functional(wk, "webkit-no-timeline", ipad, { noTimeline: true });
      } finally {
        await wk.close();
      }
    }
  }
  if (baseline && !captureOnly) {
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
  if (process.env.ZENITH_TRACE && !captureOnly)
    report.trace = await benchmark(base, "candidate-end", true);
  assert.deepEqual(errors, [], "browser runtime errors");
  await writeFile(`${out}/report.json`, JSON.stringify(report, null, 2));
  console.log(`ZENITH verification passed: ${out}/report.json`);
} finally {
  await browser.close();
}
