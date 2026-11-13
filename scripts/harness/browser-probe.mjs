#!/usr/bin/env node
// Independent, sequential browser observations. No quality or animation overrides.
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { requestAllowed } from "./browser-policy.mjs";
import { observeBrowserConditions } from "./comparison-conditions.mjs";
import { sampleFrames } from "./frame-sampling.mjs";

const options = {};
for (let i = 2; i < process.argv.length; i += 2) {
  const key = process.argv[i];
  if (
    !key.startsWith("--") ||
    process.argv[i + 1] == null ||
    process.argv[i + 1].startsWith("--")
  ) {
    console.error(`Expected --option value: ${key}`);
    process.exit(2);
  }
  options[key.slice(2)] = process.argv[i + 1];
}
const validKeys = [
  "base-url",
  "baseline-url",
  "output",
  "routes",
  "profiles",
  "engines",
  "samples",
  "scene",
];
const unknown = Object.keys(options).filter((key) => !validKeys.includes(key));
const routes = (options.routes || "/world,/rexonance-saga").split(",").filter(Boolean);
const profiles = (options.profiles || "phone,desktop").split(",").filter(Boolean);
const engines = (options.engines || "chromium,webkit").split(",").filter(Boolean);
const samples = Number(options.samples || 3);
const scene = options.scene || "hero";
const profileOptions = {
  320: {
    viewport: { width: 320, height: 740 },
    deviceScaleFactor: 1,
    isMobile: true,
    hasTouch: true,
  },
  "phone-landscape": {
    viewport: { width: 844, height: 390 },
    deviceScaleFactor: 1,
    isMobile: true,
    hasTouch: true,
  },
  "ipad-portrait": {
    viewport: { width: 768, height: 1024 },
    deviceScaleFactor: 1,
    isMobile: true,
    hasTouch: true,
  },
  "ipad-landscape": {
    viewport: { width: 1024, height: 768 },
    deviceScaleFactor: 1,
    isMobile: true,
    hasTouch: true,
  },
  phone: {
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 1,
    isMobile: true,
    hasTouch: true,
  },
  desktop: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
  "phone-reduced-motion": {
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 1,
    isMobile: true,
    hasTouch: true,
    reducedMotion: "reduce",
  },
  "desktop-reduced-motion": {
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    reducedMotion: "reduce",
  },
};
try {
  if (
    !["hero", "transformation"].includes(scene) ||
    unknown.length ||
    !options["base-url"] ||
    !options.output ||
    !Number.isInteger(samples) ||
    samples < 1 ||
    samples > 100 ||
    !routes.length ||
    !profiles.length ||
    !engines.length ||
    routes.some((r) => !r.startsWith("/") || r.startsWith("//") || r.includes("\\")) ||
    profiles.some((p) => !profileOptions[p]) ||
    engines.some((e) => !["chromium", "webkit"].includes(e))
  )
    throw new Error(
      "Invalid options. Required: --base-url URL --output DIR; supported profiles: 320,phone,phone-landscape,ipad-portrait,ipad-landscape,desktop,phone-reduced-motion,desktop-reduced-motion; engines: chromium,webkit; samples: 1..100.",
    );
  for (const url of [options["base-url"], options["baseline-url"]].filter(Boolean)) {
    const parsed = new URL(url);
    if (
      !["http:", "https:"].includes(parsed.protocol) ||
      !["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname) ||
      parsed.username ||
      parsed.password
    )
      throw new Error("URLs must be local loopback HTTP(S) without credentials");
    for (const route of routes)
      if (new URL(route, parsed).origin !== parsed.origin)
        throw new Error("Routes must stay on the base origin");
  }
} catch (error) {
  console.error(error.message);
  process.exit(2);
}
const output = options.output;
await mkdir(output, { recursive: true });
const report = {
  version: 1,
  startedAt: new Date().toISOString(),
  config: {
    baseUrl: options["base-url"],
    baselineUrl: options["baseline-url"] || null,
    routes,
    profiles,
    engines,
    samples,
    scene,
    profileOptions,
  },
  notes: [
    "Fresh browser context per run; no quality overrides.",
    "Rendering attributes, saved quality, DPR and reduced motion are observed before and after each run; matching observations do not prove equal rendering quality.",
    "Frame timings are a short settled-page observation, not a GPU measurement.",
    "Screenshots are captured after metrics; dynamic visual differences are advisory.",
    "Memory leak testing requires a separate real SPA-cycle test.",
    "Read-only request interception and disabled service workers can affect timing and cache behavior; both sides use the same policy.",
  ],
  runs: [],
  failures: [],
};
let playwright;
try {
  playwright = await import("playwright");
} catch (error) {
  report.failures.push({ stage: "dependency", error: String(error) });
}
const safe = (value) => value.replace(/[^a-zA-Z0-9_-]/g, "_");
const timeout = 15000;
if (playwright)
  for (const engine of engines) {
    let browser;
    try {
      // The repository's existing verifiers use installed Chrome, not a downloaded Chromium.
      browser = await playwright[engine].launch(
        engine === "chromium"
          ? { channel: process.env.PW_BROWSER_CHANNEL || "chrome", timeout }
          : { timeout },
      );
      for (const profile of profiles)
        for (const route of routes)
          for (let sample = 1; sample <= samples; sample++) {
            const sides = options["baseline-url"]
              ? sample % 2
                ? ["baseline", "candidate"]
                : ["candidate", "baseline"]
              : ["candidate"];
            for (const side of sides) {
              const run = { engine, profile, route, sample, side, status: "running", errors: [] };
              report.runs.push(run);
              let context;
              try {
                context = await browser.newContext({
                  ...profileOptions[profile],
                  serviceWorkers: "block",
                });
                context.setDefaultTimeout(timeout);
                context.setDefaultNavigationTimeout(timeout);
                const page = await context.newPage();
                const pageErrors = [];
                page.on("pageerror", (error) => pageErrors.push(error.message));
                await page.addInitScript(() => {
                  window.__harnessLongTasks = { supported: false, entries: [] };
                  try {
                    if (PerformanceObserver.supportedEntryTypes?.includes("longtask")) {
                      window.__harnessLongTasks.supported = true;
                      new PerformanceObserver((list) =>
                        window.__harnessLongTasks.entries.push(
                          ...list
                            .getEntries()
                            .map((e) => ({ startTime: e.startTime, duration: e.duration })),
                        ),
                      ).observe({ type: "longtask", buffered: true });
                    }
                  } catch {
                    /* unsupported */
                  }
                });
                const url = new URL(
                  route,
                  side === "baseline" ? options["baseline-url"] : options["base-url"],
                ).href;
                run.url = url;
                run.blockedRequests = [];
                await context.route("**/*", async (routeRequest) => {
                  const request = routeRequest.request();
                  if (
                    !requestAllowed(
                      request.method(),
                      request.url(),
                      request.isNavigationRequest(),
                      new URL(url).origin,
                    )
                  ) {
                    const target = new URL(request.url());
                    run.blockedRequests.push({
                      method: request.method(),
                      url: `${target.origin}${target.pathname}`,
                      navigation: request.isNavigationRequest(),
                    });
                    return routeRequest.abort("blockedbyclient");
                  }
                  return routeRequest.continue();
                });
                await context.routeWebSocket(/.*/, (socket) => {
                  run.blockedRequests.push({
                    method: "WEBSOCKET",
                    url: "blocked",
                    navigation: false,
                  });
                  socket.close();
                });
                const response = await page.goto(url, { waitUntil: "domcontentloaded" });
                run.httpStatus = response?.status() ?? null;
                if (!response || !response.ok())
                  throw new Error(`Navigation returned ${run.httpStatus ?? "no response"}`);
                await page.locator("main").first().waitFor({ state: "visible" });
                await page.waitForFunction(
                  () =>
                    !document.documentElement.hasAttribute("data-loading") &&
                    !document.querySelector(".load-gate"),
                  null,
                  { timeout },
                );
                run.settle = await page.evaluate(async () => {
                  const bounded = (p, ms) =>
                    Promise.race([
                      p.then(
                        () => true,
                        () => false,
                      ),
                      new Promise((resolve) => setTimeout(() => resolve(false), ms)),
                    ]);
                  const fonts = document.fonts ? await bounded(document.fonts.ready, 5000) : null;
                  const visible = [...document.images].filter((img) => {
                    const r = img.getBoundingClientRect();
                    return (
                      r.width &&
                      r.height &&
                      r.bottom > 0 &&
                      r.right > 0 &&
                      r.top < innerHeight &&
                      r.left < innerWidth
                    );
                  });
                  const images = await bounded(
                    Promise.all(visible.map((img) => img.decode().catch(() => {}))),
                    5000,
                  );
                  return {
                    fontsReady: fonts,
                    visibleImagesSettled: images,
                    visibleImageCount: visible.length,
                    visibleImageFailures: visible.filter((img) => img.complete && !img.naturalWidth)
                      .length,
                  };
                });
                // rAF and observer recording precede screenshots, which can distort frame time.
                run.conditions = await page.evaluate(observeBrowserConditions);
                const frame = await page.evaluate(sampleFrames);
                run.metrics = await page.evaluate((frame) => {
                  const nav = performance.getEntriesByType("navigation")[0];
                  const resources = performance.getEntriesByType("resource");
                  const imageResources = resources.filter(
                    (r) =>
                      r.initiatorType === "img" ||
                      /\.(png|jpe?g|webp|avif|gif|svg)(?:[?#]|$)/i.test(r.name),
                  );
                  const totals = (entries) => ({
                    count: entries.length,
                    transferSize: entries.reduce((n, e) => n + e.transferSize, 0),
                    encodedBodySize: entries.reduce((n, e) => n + e.encodedBodySize, 0),
                    decodedBodySize: entries.reduce((n, e) => n + e.decodedBodySize, 0),
                  });
                  return {
                    frame,
                    longTasks: window.__harnessLongTasks,
                    navigation: nav
                      ? {
                          duration: nav.duration,
                          domContentLoaded: nav.domContentLoadedEventEnd,
                          loadEventEnd: nav.loadEventEnd,
                          responseEnd: nav.responseEnd,
                          transferSize: nav.transferSize,
                        }
                      : null,
                    resources: totals(resources),
                    images: totals(imageResources),
                    resourceTimingNote:
                      "Cross-origin timing and transfer sizes can be hidden without Timing-Allow-Origin; zero does not prove no bytes.",
                  };
                }, frame);
                if (run.metrics.frame.count === 0) throw new Error("No animation frames observed");
                if (run.metrics.frame.completionReason !== "window-complete")
                  throw new Error(
                    "Animation frame observation window did not complete within 3500ms",
                  );
                const screenshot = `${safe(engine)}-${safe(profile)}-${safe(route) || "root"}-${sample}-${side}.png`;
                const before = performance.now();
                await page.screenshot({ path: join(output, screenshot), timeout, scale: "css" });
                run.screenshotMs = performance.now() - before;
                run.screenshot = screenshot;
                if (scene === "transformation") {
                  if (route.split(/[?#]/)[0] !== "/rexonance-saga")
                    throw new Error(`Transformation capture unsupported for route ${route}`);
                  if (profile.endsWith("-reduced-motion"))
                    throw new Error(
                      "Transformation progress capture is unavailable in reduced-motion profiles",
                    );
                  await page.locator(".rzn-suitup").waitFor({ state: "attached", timeout });
                  await page.locator(".rx-call-sequence").waitFor({ state: "detached", timeout });
                  const geometry = await page.evaluate(() => {
                    const runway = document.querySelector(".rzn-suitup");
                    const frame = runway?.querySelector(".rzn-frame");
                    return {
                      top: runway.getBoundingClientRect().top + scrollY,
                      height: runway.offsetHeight,
                      frameHeight: frame?.offsetHeight,
                      pin: Number.parseFloat(frame ? getComputedStyle(frame).top : "0") || 0,
                    };
                  });
                  if (!geometry.frameHeight || geometry.height <= geometry.frameHeight + 100)
                    throw new Error("Transformation runway unavailable or too short");
                  await page.evaluate(
                    (top) =>
                      scrollTo({ top: Math.max(0, top - innerHeight * 4.4), behavior: "instant" }),
                    geometry.top,
                  );
                  await page.waitForTimeout(1800);
                  run.sceneScreenshots = [];
                  for (const progress of [0.06, 0.12, 0.5, 1]) {
                    let actual;
                    for (let attempt = 0; attempt < 3; attempt++) {
                      actual = await page.evaluate(
                        ({ progress }) => {
                          const runway = document.querySelector(".rzn-suitup");
                          const frame = runway.querySelector(".rzn-frame");
                          const top = runway.getBoundingClientRect().top + scrollY;
                          const pin = Number.parseFloat(getComputedStyle(frame).top) || 0;
                          scrollTo({
                            top: Math.ceil(
                              top - pin + progress * (runway.offsetHeight - frame.offsetHeight),
                            ),
                            behavior: "instant",
                          });
                          return null;
                        },
                        { progress },
                      );
                      await page.waitForTimeout(420);
                      actual = await page.evaluate(() => {
                        const runway = document.querySelector(".rzn-suitup");
                        const frame = runway.querySelector(".rzn-frame");
                        const top = runway.getBoundingClientRect().top + scrollY;
                        const pin = Number.parseFloat(getComputedStyle(frame).top) || 0;
                        return (scrollY - (top - pin)) / (runway.offsetHeight - frame.offsetHeight);
                      });
                      if (Math.abs(actual - progress) < 0.002) break;
                    }
                    if (Math.abs(actual - progress) >= 0.002)
                      throw new Error(`Progress ${progress} not reached: ${actual}`);
                    const sceneScreenshot = `${safe(engine)}-${safe(profile)}-${safe(route)}-${sample}-${side}-progress-${progress}.png`;
                    await page.screenshot({
                      path: join(output, sceneScreenshot),
                      timeout,
                      scale: "css",
                    });
                    run.sceneScreenshots.push({ progress, actual, screenshot: sceneScreenshot });
                  }
                }
                run.conditionsAfter = await page.evaluate(observeBrowserConditions);
                run.pageErrors = pageErrors;
                if (pageErrors.length)
                  throw new Error(`${pageErrors.length} uncaught page error(s)`);
                if (
                  !run.settle.fontsReady ||
                  !run.settle.visibleImagesSettled ||
                  run.settle.visibleImageFailures
                )
                  throw new Error("Fonts or visible images did not settle successfully");
                run.status = "passed";
              } catch (error) {
                run.status = "failed";
                run.errors.push(String(error));
                const failedPage = context?.pages().at(-1);
                if (failedPage && !failedPage.isClosed()) {
                  try {
                    run.failureDiagnostics = await failedPage.evaluate(() => {
                      const box = (element) => {
                        if (!element) return null;
                        const { x, y, width, height } = element.getBoundingClientRect();
                        return { x, y, width, height };
                      };
                      return {
                        visibilityState: document.visibilityState,
                        hasFocus: document.hasFocus(),
                        readyState: document.readyState,
                        loading: document.documentElement.getAttribute("data-loading"),
                        url: location.href,
                        viewport: { width: innerWidth, height: innerHeight },
                        canvasCount: document.querySelectorAll("canvas").length,
                        sceneSizes: {
                          main: box(document.querySelector("main")),
                          firstSection: box(document.querySelector("main section")),
                          transformation: box(document.querySelector(".rzn-suitup")),
                          transformationFrame: box(
                            document.querySelector(".rzn-suitup .rzn-frame"),
                          ),
                        },
                        canvases: [...document.querySelectorAll("canvas")].map((canvas) => ({
                          className: canvas.className,
                          width: canvas.width,
                          height: canvas.height,
                          bounds: box(canvas),
                        })),
                      };
                    });
                  } catch (diagnosticError) {
                    run.failureDiagnosticError = String(diagnosticError);
                  }
                  try {
                    const screenshot = `${safe(engine)}-${safe(profile)}-${safe(route) || "root"}-${sample}-${side}-failed.png`;
                    await failedPage.screenshot({
                      path: join(output, screenshot),
                      timeout: Math.min(timeout, 5000),
                      scale: "css",
                    });
                    run.failureScreenshot = screenshot;
                  } catch (screenshotError) {
                    run.failureScreenshotError = String(screenshotError);
                  }
                }
                report.failures.push({
                  engine,
                  profile,
                  route,
                  sample,
                  side,
                  error: String(error),
                });
              } finally {
                if (context) await context.close().catch(() => {});
              }
            }
          }
    } catch (error) {
      report.failures.push({ engine, stage: "launch", error: String(error) });
    } finally {
      if (browser) await browser.close().catch(() => {});
    }
  }
report.finishedAt = new Date().toISOString();
report.status = report.failures.length ? "failed" : "passed";
await writeFile(join(output, "probe.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(
  `Browser probe ${report.status}: ${report.runs.length} runs; ${report.failures.length} failures; ${join(output, "probe.json")}`,
);
if (report.failures.length) process.exitCode = 1;
