// Local-only fault injection: never changes gallery data or a live deployment.
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium, webkit } from "playwright";
const base = new URL(process.env.BASE_URL || "http://127.0.0.1:8248");
assert.ok(["127.0.0.1", "localhost"].includes(base.hostname));
const out = process.env.OUT_DIR || "output/playwright/rexonance-loading-recovery";
await mkdir(out, { recursive: true });
const engine = process.env.BROWSER === "webkit" ? webkit : chromium;
const browser = await engine.launch(engine === chromium ? { channel: "chrome" } : {});
const results = [];
try {
  for (const mode of ["resize-notice", "decode-exception", "network-recovery"]) {
    const context = await browser.newContext({
      viewport: { width: 1024, height: 768 },
      hasTouch: true,
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    let blocked = mode === "network-recovery";
    let aborted = 0;
    await page.route("**/rexonance-suit-20261016/figure.webp", (route) => {
      if (blocked) {
        aborted++;
        return route.abort();
      }
      return route.continue();
    });
    await page.addInitScript((fault) => {
      window.__loadingFaults = 0;
      if (fault === "resize-notice") {
        const Native = window.ResizeObserver;
        window.ResizeObserver = class extends Native {
          observe(target, ...args) {
            if (target.matches(".rzn-suitup,.rzn-canvas")) {
              window.__loadingFaults++;
              return;
            }
            return super.observe(target, ...args);
          }
        };
      }
      if (fault === "decode-exception") {
        const decode = HTMLImageElement.prototype.decode;
        HTMLImageElement.prototype.decode = function (...args) {
          if (this.src.includes("/rexonance")) {
            window.__loadingFaults++;
            throw new Error("injected decoder failure");
          }
          return decode.apply(this, args);
        };
        const bitmap = window.createImageBitmap;
        window.createImageBitmap = function (source, ...args) {
          if (source instanceof HTMLImageElement && source.src.includes("/rexonance")) {
            window.__loadingFaults++;
            throw new Error("injected bitmap failure");
          }
          return bitmap.call(this, source, ...args);
        };
      }
    }, mode);
    try {
      await page.goto(new URL("/rexonance-saga", base).href, { waitUntil: "domcontentloaded" });
      await page.locator(".rzn-suitup").waitFor({ state: "attached", timeout: 60000 });
      // Do not race the route curtain's own scroll restoration. It may
      // legitimately move the page to the top after an early test scroll.
      await page.waitForFunction(
        () =>
          !document.documentElement.hasAttribute("data-loading") &&
          !document.querySelector(".load-gate"),
        null,
        { timeout: 60000 },
      );
      await page.locator(".rzn-suitup").scrollIntoViewIfNeeded();
      if (blocked) {
        await page.locator('.rzn-suitup[data-rzn-load="error"]').waitFor({ timeout: 60000 });
        assert.ok(aborted >= 3, "required request exhausted its bounded retries");
        blocked = false;
        await page.evaluate(() => window.dispatchEvent(new Event("online")));
      }
      await page.waitForFunction(
        () => {
          const runway = document.querySelector('.rzn-suitup[data-rzn-state="live"]');
          const canvas = runway?.querySelector("canvas.rzn-canvas");
          return canvas?.width > 0 && canvas.height > 0 && !runway.hasAttribute("data-rzn-arming");
        },
        null,
        { timeout: 60000 },
      );
      const faults = await page.evaluate(() => window.__loadingFaults);
      if (mode !== "network-recovery") assert.ok(faults > 0, "fault injection actually exercised");
      assert.deepEqual(errors, [], "no unhandled browser exception");
      await page.screenshot({ path: `${out}/${engine.name()}-${mode}.png` });
      results.push({ mode, faults, aborted, errors, live: true });
      console.log(`PASS ${engine.name()}/${mode}`);
    } catch (error) {
      const state = await page.evaluate(() => {
        const runway = document.querySelector(".rzn-suitup");
        const canvas = runway?.querySelector("canvas.rzn-canvas");
        return {
          dataset: { ...runway?.dataset },
          faults: window.__loadingFaults,
          scrollY,
          rect: runway?.getBoundingClientRect().toJSON(),
          canvas: canvas
            ? {
                width: canvas.width,
                height: canvas.height,
                cssWidth: canvas.clientWidth,
                cssHeight: canvas.clientHeight,
              }
            : null,
        };
      });
      results.push({ mode, state, errors, failure: error.message });
      await page.screenshot({ path: `${out}/${engine.name()}-${mode}-failure.png` });
      console.log(JSON.stringify({ mode, state, errors }));
      throw error;
    } finally {
      await context.close();
    }
  }
} finally {
  await writeFile(`${out}/${engine.name()}-report.json`, JSON.stringify(results, null, 2));
  await browser.close();
}
