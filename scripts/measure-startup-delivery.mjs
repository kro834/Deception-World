import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";

const base = process.env.BASE_URL ?? "http://127.0.0.1:8171";
const bases = (process.env.STARTUP_BASES ?? base).split(",");
const output = process.env.STARTUP_OUTPUT ?? "output/playwright/startup-delivery";
const paths = (process.env.STARTUP_PATHS ?? "/,/world").split(",");
const repeats = Number(process.env.STARTUP_REPEATS ?? 1);
const browser = await chromium.launch({ channel: "chrome" });
const rows = [];
await mkdir(output, { recursive: true });
try {
  for (let repeat = 0; repeat < repeats; repeat++) {
    for (const base of repeat % 2 ? [...bases].reverse() : bases) {
      for (const path of paths) {
        const context = await browser.newContext({
          viewport: { width: 390, height: 844 },
          deviceScaleFactor: 3,
          isMobile: true,
          hasTouch: true,
        });
        const page = await context.newPage();
        const errors = [];
        page.on("pageerror", (error) => errors.push(error.message));
        const cdp = await context.newCDPSession(page);
        await cdp.send("Network.enable");
        await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
        await cdp.send("Network.emulateNetworkConditions", {
          offline: false,
          latency: 60,
          downloadThroughput: 1125000,
          uploadThroughput: 125000,
        });
        await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
        await cdp.send("Performance.enable");
        await context.addInitScript(() => {
          performance.setResourceTimingBufferSize(4000);
          window.__startupMeasure = { readyMs: null, lcp: null, longTasks: [] };
          new PerformanceObserver((entries) => {
            window.__startupMeasure.lcp = entries.getEntries().at(-1)?.startTime;
          }).observe({ type: "largest-contentful-paint", buffered: true });
          new PerformanceObserver((entries) => {
            window.__startupMeasure.longTasks.push(...entries.getEntries().map((e) => e.duration));
          }).observe({ type: "longtask", buffered: true });
          const ready = () => {
            if (window.__startupMeasure.readyMs !== null) return;
            const opening =
              location.pathname === "/" &&
              document.querySelector(".cine-stage.is-playing, .cine-stage.is-complete");
            const world =
              location.pathname === "/world" &&
              document.documentElement.dataset.worldPageVisible === "true";
            if (opening || world) window.__startupMeasure.readyMs = performance.now();
          };
          new MutationObserver(ready).observe(document, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ["class", "data-world-page-visible"],
          });
          document.addEventListener("DOMContentLoaded", ready, { once: true });
        });
        await page.goto(new URL(path, base).href, { waitUntil: "domcontentloaded" });
        await page.waitForFunction(() => window.__startupMeasure?.readyMs !== null, null, {
          timeout: 45000,
        });
        await page.waitForFunction(() => performance.now() >= 12000);
        const sample = await page.evaluate(() => {
          const n = performance.getEntriesByType("navigation")[0];
          const entries = performance.getEntriesByType("resource").map((r) => ({
            name: new URL(r.name).pathname + new URL(r.name).search,
            type: r.initiatorType,
            bytes: r.decodedBodySize,
            transfer: r.transferSize,
            start: r.startTime,
            end: r.responseEnd,
          }));
          const activeStyles = new Set(
            Array.from(document.querySelectorAll('link[rel="stylesheet"]')).map((link) => {
              const url = new URL(link.href);
              return url.pathname + url.search;
            }),
          );
          return {
            ...window.__startupMeasure,
            ttfb: n.responseStart,
            domReady: n.domContentLoadedEventEnd,
            load: n.loadEventEnd,
            fcp: performance.getEntriesByName("first-contentful-paint")[0]?.startTime,
            requestCount: entries.length,
            stylesheetCount: activeStyles.size,
            blockingCssBytes: entries
              .filter((entry) => activeStyles.has(entry.name))
              .reduce((sum, entry) => sum + entry.bytes, 0),
            decodedBytes: entries.reduce((sum, e) => sum + e.bytes, 0),
            fontCssBytes: entries
              .filter((e) => e.name.startsWith("/css2"))
              .reduce((sum, e) => sum + e.bytes, 0),
            largest: [...entries].sort((a, b) => b.bytes - a.bytes).slice(0, 12),
            entries,
          };
        });
        const metrics = Object.fromEntries(
          (await cdp.send("Performance.getMetrics")).metrics.map((m) => [m.name, m.value]),
        );
        const result = {
          base,
          path,
          repeat,
          errors,
          ...sample,
          taskSeconds: metrics.TaskDuration,
          scriptSeconds: metrics.ScriptDuration,
          layoutSeconds: metrics.LayoutDuration,
        };
        rows.push(result);
        const { entries: _entries, largest: _largest, longTasks, ...compact } = result;
        console.log(JSON.stringify({ ...compact, maxLongTask: Math.max(0, ...longTasks) }));
        await page.screenshot({
          path:
            output +
            "/" +
            new URL(base).port +
            "-" +
            repeat +
            "-" +
            (path === "/" ? "opening" : "world") +
            ".png",
        });
        await context.close();
      }
    }
  }
  await writeFile(output + "/report.json", JSON.stringify(rows, null, 2));
} finally {
  await browser.close();
}
