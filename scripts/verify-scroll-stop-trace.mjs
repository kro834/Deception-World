// Independent cold-route diagnostic only: trace overhead must not be mixed
// with verify-scroll-load.mjs primary performance figures.
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { chromium } from "playwright";

const base = new URL(process.env.BASE_URL || "http://127.0.0.1:8082");
assert.ok(["127.0.0.1", "localhost", "[::1]"].includes(base.hostname));
const out = resolve(
  process.env.SCROLL_TRACE_OUTPUT || "/private/tmp/scroll-review/final/dream-stop-trace",
);
const targetY = Number(process.env.SCROLL_TRACE_Y || 3115.328125);
const primeWorld = process.env.SCROLL_TRACE_PRIME_WORLD === "1";
const traceRects = process.env.SCROLL_TRACE_RECTS === "1";
const browser = await chromium.launch({ channel: "chrome" });
await mkdir(out, { recursive: true });
const result = {
  diagnosticHasOverhead: true,
  purpose: "independent cold Dream first-stop Layout initiator; not primary benchmark",
  base: base.origin,
  cpuRate: 4,
  viewport: { width: 412, height: 915 },
  targetY,
  primeWorld,
  slowRectDiagnosticEnabled: traceRects,
  errors: [],
  requestFailures: [],
};
try {
  const context = await browser.newContext({
    viewport: result.viewport,
    deviceScaleFactor: 2.625,
    isMobile: true,
    hasTouch: true,
    reducedMotion: "no-preference",
    userAgent:
      "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36",
  });
  const page = await context.newPage();
  page.on("pageerror", (error) => result.errors.push(String(error)));
  page.on("console", (message) => {
    if (message.type() === "error") result.errors.push(message.text());
  });
  page.on("requestfailed", (request) =>
    result.requestFailures.push({ url: request.url(), error: request.failure()?.errorText }),
  );
  await page.addInitScript(() => {
    localStorage.setItem("dw-ultra-mode-v1", "false");
    const audit = (window.__stopTrace = { longtasks: [], slowRects: [], cvState: new Map() });
    new PerformanceObserver((list) => {
      for (const e of list.getEntries())
        window.__stopTrace.longtasks.push({ at: e.startTime, duration: e.duration });
    }).observe({ type: "longtask", buffered: false });
    document.addEventListener(
      "contentvisibilityautostatechange",
      (event) => {
        audit.cvState.set(event.target, { skipped: event.skipped, at: performance.now() });
      },
      true,
    );
    audit.visibleImages = async () => {
      const images = [...document.images];
      if (images.length === 0) return [];
      return new Promise((resolve) => {
        const seen = new Set(),
          visible = new Set();
        let timeout;
        const finish = () => {
          observer.disconnect();
          clearTimeout(timeout);
          resolve([...visible]);
        };
        const observer = new IntersectionObserver((entries) => {
          for (const entry of entries) {
            seen.add(entry.target);
            if (entry.isIntersecting && entry.intersectionRect.height > 0)
              visible.add(entry.target);
            else visible.delete(entry.target);
          }
          if (seen.size === images.length) finish();
        });
        timeout = setTimeout(finish, 500);
        for (const image of images) observer.observe(image);
      });
    };
    // Match the primary's minimal rAF sampling without any geometry reads.
    audit.startFrames = () => {
      const token = {};
      audit.framesToken = token;
      audit.frames = [];
      let last;
      const tick = (now) => {
        if (audit.framesToken !== token) return;
        if (last !== undefined) audit.frames.push(now - last);
        last = now;
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    };
    audit.stopFrames = () => {
      audit.framesToken = null;
    };
  });
  const cdp = await context.newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  const load = async (path) => {
    await page.goto(new URL(path, base).href, { waitUntil: "load" });
    await page.waitForFunction(
      () =>
        document.querySelector("main") &&
        document.documentElement.hasAttribute("data-press-ready") &&
        !document.querySelector(".load-gate") &&
        !document.documentElement.hasAttribute("data-loading"),
      null,
      { timeout: 30000 },
    );
    await page.evaluate(() => document.fonts.ready);
    await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(1800);
  };
  const settle = async (y) => {
    await page.evaluate((y) => scrollTo({ top: y, behavior: "instant" }), y);
    await page.evaluate(async () => {
      const ready = Promise.all(
        (await window.__stopTrace.visibleImages())
          .filter((image) => image.complete || image.loading !== "lazy")
          .map((image) => image.decode().catch(() => {})),
      );
      await Promise.race([ready, new Promise((done) => setTimeout(done, 2500))]);
    });
    await page.waitForLoadState("networkidle", { timeout: 6000 }).catch(() => {});
    await page.waitForTimeout(1800);
    return page.evaluate(async () => {
      const visible = await window.__stopTrace.visibleImages();
      return {
        actualY: scrollY,
        height: document.documentElement.scrollHeight,
        fonts: document.fonts.status,
        ultra: document.documentElement.dataset.ultraMode || "off",
        visibleImageCount: visible.length,
        missingVisibleImages: visible
          .filter((image) => !image.complete || image.naturalWidth === 0)
          .map((image) => image.currentSrc || image.src),
        modules: performance
          .getEntriesByType("resource")
          .filter((e) => /\/assets\/[^/]+\.js(?:\?|$)/.test(e.name))
          .map((e) => new URL(e.name).pathname),
      };
    });
  };
  const gesture = () =>
    cdp.send("Input.synthesizeScrollGesture", {
      x: 218,
      y: 641,
      yDistance: -900,
      speed: 400,
      preventFling: true,
      gestureSourceType: "touch",
    });
  const idle = async () => {
    await page.evaluate(() => window.__stopTrace.startFrames());
    await page.waitForTimeout(2500);
    await page.evaluate(() => window.__stopTrace.stopFrames());
  };
  if (primeWorld) {
    await load("/world");
    result.prelude = { before: await settle(3732.375) };
    await page.screenshot({ path: join(out, "world-before.png"), animations: "allow" });
    await idle();
    await page.evaluate(() => {
      window.__stopTrace.longtasks = [];
      window.__stopTrace.startFrames();
    });
    await gesture();
    await page.waitForTimeout(2500);
    result.prelude.after = await page.evaluate(() => {
      window.__stopTrace.stopFrames();
      return {
        actualY: scrollY,
        height: document.documentElement.scrollHeight,
        longtasks: window.__stopTrace.longtasks,
      };
    });
    await page.screenshot({ path: join(out, "world-after.png"), animations: "allow" });
    // Match the primary's fixed-bar metadata pass before leaving World.
    await page.evaluate(() => {
      for (const node of document.querySelectorAll(
        ".topbar,.manager-topbar,.dream-site-header,.rxs-header,.rxs-local-nav,.gallery-header,.world-atmosphere,.zeus-button",
      )) {
        getComputedStyle(node);
        node.getBoundingClientRect();
      }
    });
  }
  await load("/dream-chapter");
  result.before = await settle(targetY);
  await page.screenshot({ path: join(out, "before.png"), animations: "allow" });
  await idle();
  if (traceRects)
    await page.evaluate(() => {
      const original = Element.prototype.getBoundingClientRect;
      Element.prototype.getBoundingClientRect = function (...args) {
        const at = performance.now();
        const rect = original.apply(this, args);
        const nativeMs = performance.now() - at;
        if (nativeMs >= 3) {
          const ancestors = [];
          for (
            let node = this.closest(".dream-section,.dream-annex");
            node;
            node = node.parentElement?.closest(".dream-section,.dream-annex")
          ) {
            ancestors.push({
              id: node.id,
              className: node.className,
              cvState: window.__stopTrace.cvState.get(node) || null,
            });
          }
          window.__stopTrace.slowRects.push({
            at,
            nativeMs,
            tag: this.tagName,
            id: this.id,
            className: String(this.className),
            ancestors,
            stack: new Error().stack,
            rect: { top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height },
          });
        }
        return rect;
      };
      window.__stopTrace.restoreRect = () => {
        Element.prototype.getBoundingClientRect = original;
      };
    });
  await cdp.send("Tracing.start", {
    categories:
      "devtools.timeline,disabled-by-default-devtools.timeline,disabled-by-default-devtools.timeline.stack,v8.execute,toplevel,blink.user_timing",
    transferMode: "ReturnAsStream",
  });
  result.start = await page.evaluate(() => {
    window.__stopTrace.longtasks = [];
    window.__stopTrace.startFrames();
    window.__stopTrace.resourceStart = performance.now();
    performance.mark("dream-scroll-start");
    return performance.now();
  });
  await gesture();
  result.stop = await page.evaluate(() => {
    performance.mark("dream-scroll-complete");
    return performance.now();
  });
  await page.waitForTimeout(2500);
  result.after = await page.evaluate(() => {
    window.__stopTrace.stopFrames();
    window.__stopTrace.restoreRect?.();
    return {
      actualY: scrollY,
      height: document.documentElement.scrollHeight,
      longtasks: window.__stopTrace.longtasks,
      frames: window.__stopTrace.frames,
      slowRects: window.__stopTrace.slowRects,
      cvStates: [...window.__stopTrace.cvState.entries()].map(([node, state]) => ({
        id: node.id,
        className: node.className,
        ...state,
      })),
      resources: performance
        .getEntriesByType("resource")
        .filter((e) => e.startTime >= window.__stopTrace.resourceStart)
        .map((e) => ({
          name: e.name,
          startTime: e.startTime,
          duration: e.duration,
          initiatorType: e.initiatorType,
        })),
    };
  });
  const completed = new Promise((resolve) => cdp.once("Tracing.tracingComplete", resolve));
  await cdp.send("Tracing.end");
  const { stream } = await completed;
  let json = "";
  while (true) {
    const { data, eof, base64Encoded } = await cdp.send("IO.read", {
      handle: stream,
      size: 1024 * 1024,
    });
    json += base64Encoded ? Buffer.from(data, "base64").toString("utf8") : data;
    if (eof) break;
  }
  await cdp.send("IO.close", { handle: stream });
  await writeFile(join(out, "dream-stop.trace.json"), json);
  const events = JSON.parse(json).traceEvents;
  const layouts = events
    .filter((e) => e.name === "Layout" && e.ph === "X")
    .sort((a, b) => (b.dur || 0) - (a.dur || 0));
  result.layouts = layouts.slice(0, 20).map((layout) => ({
    ...layout,
    ancestors: events
      .filter(
        (e) =>
          e.ph === "X" &&
          e.pid === layout.pid &&
          e.tid === layout.tid &&
          e.ts <= layout.ts &&
          e.ts + (e.dur || 0) >= layout.ts + (layout.dur || 0) &&
          e !== layout,
      )
      .sort((a, b) => (a.dur || 0) - (b.dur || 0))
      .slice(0, 10),
    recent: events
      .filter(
        (e) =>
          e.pid === layout.pid &&
          e.tid === layout.tid &&
          e.ts >= layout.ts - 2000 &&
          e.ts < layout.ts &&
          /Invalidate|UpdateLayout|ScheduleStyle|FunctionCall/.test(e.name),
      )
      .slice(-10),
  }));
  result.marks = events.filter((e) => /dream-scroll-/.test(e.name));
  assert.ok(result.after.actualY - result.before.actualY > 675, "real touch scroll must move");
  await context.close();
} finally {
  await writeFile(join(out, "dream-stop.summary.json"), JSON.stringify(result, null, 2));
  await browser.close();
}
console.log(
  JSON.stringify({
    output: join(out, "dream-stop.summary.json"),
    stopLongtasks: result.after?.longtasks,
    largestLayoutMs: (result.layouts?.[0]?.dur || 0) / 1000,
    completed: true,
  }),
);
