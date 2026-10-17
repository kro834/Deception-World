// Native operations cannot be interrupted: measure complete callbacks at 4x CPU.
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { chromium } from "playwright";
const browser = await chromium.launch({ channel: "chrome" });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await page.addInitScript(() => {
    let phase = "";
    window.__rexonancePreparationPhase = (value) => { phase = value; };
    window.__preparationSlices = [];
    const wrap = (callback) => (...args) => {
      const start = performance.now();
      const current = phase;
      try { return callback(...args); }
      finally {
        if (current === "nanite-metal-rows" || current === "nanite-seams")
          window.__preparationSlices.push({ phase: current, ms: performance.now() - start });
      }
    };
    const idle = window.requestIdleCallback.bind(window);
    window.requestIdleCallback = (callback, options) => idle(wrap(callback), options);
    const NativeChannel = window.MessageChannel;
    window.MessageChannel = class extends NativeChannel {
      constructor() {
        super();
        const descriptor = Object.getOwnPropertyDescriptor(MessagePort.prototype, "onmessage");
        Object.defineProperty(this.port1, "onmessage", {
          get: () => descriptor.get.call(this.port1),
          set: (callback) => { descriptor.set.call(this.port1, callback ? wrap(callback) : null); },
        });
      }
    };
  });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  await page.goto(`${process.env.BASE_URL || "http://127.0.0.1:4217"}/rexonance-saga`);
  await page.waitForSelector(".rzn-suitup", { timeout: 60000 });
  await page.locator(".rzn-suitup").scrollIntoViewIfNeeded();
  await page.waitForSelector('.rzn-suitup[data-rzn-state="live"]', { timeout: 120000 });
  const rows = await page.evaluate(() => window.__preparationSlices);
  const report = Object.fromEntries(["nanite-metal-rows", "nanite-seams"].map((phase) => {
    const times = rows.filter((r) => r.phase === phase).map((r) => r.ms).sort((a, b) => a - b);
    return [phase, { count: times.length, max: times.at(-1), p95: times[Math.floor(times.length * .95)], over6: times.filter((ms) => ms > 6).length }];
  }));
  await writeFile(process.env.OUT_FILE || "/private/tmp/zenith-preparation-budget.json", JSON.stringify({ report, rows }, null, 2));
  console.log(report);
  for (const [phase, result] of Object.entries(report)) {
    assert.ok(result.count > 0, `${phase}: observed`);
    assert.ok(result.max <= 6, `${phase}: ${result.max} ms exceeds 6 ms`);
  }
} finally { await browser.close(); }
