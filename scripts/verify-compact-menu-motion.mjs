// Browser integration check. BASE_URL and OUT_DIR select the preview and artifact directory.
import { chromium, webkit } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";

const base = process.env.BASE_URL || "http://127.0.0.1:8808";
const dir = process.env.OUT_DIR || "/tmp/compact-menu-motion";
await mkdir(dir, { recursive: true });
const results = [];
for (const [name, engine] of [
  ["chrome", chromium],
  ["webkit", webkit],
]) {
  const browser = await engine.launch({
    headless: true,
    ...(name === "chrome" ? { channel: "chrome" } : {}),
  });
  try {
    for (const [device, width, height] of [
      ["ipad", 834, 1194],
      ["phone", 844, 390],
    ]) {
      const context = await browser.newContext({
        viewport: { width, height },
        hasTouch: true,
        isMobile: device === "phone",
        userAgent: `Mozilla/5.0 (${device === "phone" ? "iPhone" : "iPad"}; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1`,
      });
      const page = await context.newPage();
      try {
        await page.goto(`${base}/world`, { waitUntil: "domcontentloaded" });
        await page.waitForFunction(
          () => {
            const root = document.documentElement;
            return (
              !!document.querySelector('button[aria-label*="メニューを開く"]') &&
              (root.dataset.ipadMenu === "compact" || root.dataset.phoneLandscapeMenu === "true") &&
              !root.hasAttribute("data-loading") &&
              getComputedStyle(document.body).position !== "fixed"
            );
          },
          null,
          { timeout: 20000 },
        );
        await page.evaluate(() => {
          document.documentElement.style.scrollBehavior = "auto";
          scrollTo({ top: 200, behavior: "instant" });
        });
        await page.waitForFunction(
          () => {
            if (scrollY >= 150) return true;
            scrollTo({ top: 200, behavior: "instant" });
            return false;
          },
          null,
          { timeout: 20000 },
        );
        await page.evaluate(() => scrollTo({ top: 0, behavior: "instant" }));
        await page.waitForFunction(() => scrollY === 0);
        await page.waitForTimeout(1000);
        const before = await page
          .locator('button[aria-label*="メニューを開く"]')
          .first()
          .boundingBox();
        await page.evaluate(() => {
          document.documentElement.style.scrollBehavior = "auto";
          window.__compactFrames = [];
          const start = performance.now();
          function sample() {
            const root = document.documentElement;
            const shell = document.querySelector(
              'button[aria-label*="メニューを開く"] .side-panel-trigger-convergence',
            );
            window.__compactFrames.push({
              time: performance.now() - start,
              motion: root.dataset.ipadMenuMotion || root.dataset.phoneLandscapeMotion,
              rect: shell?.getBoundingClientRect().toJSON(),
            });
            if (performance.now() - start < 1800) requestAnimationFrame(sample);
          }
          requestAnimationFrame(sample);
          scrollTo({ top: 850, behavior: "instant" });
          setTimeout(() => scrollTo({ top: 0, behavior: "instant" }), 250);
        });
        await page.waitForTimeout(1900);
        const frames = await page.evaluate(() => window.__compactFrames);
        const flying = frames.filter((f) => f.motion);
        assert.ok(flying.length, `${name} ${device}: no flight observed`);
        assert.ok(
          Math.abs(flying[0].rect.y - before.y) < 2,
          `${name} ${device}: flight origin differs from button`,
        );
        assert.ok(
          flying.some((f) => f.motion === "expand"),
          `${name} ${device}: reversal not observed`,
        );
        const after = await page
          .locator('button[aria-label*="メニューを開く"]')
          .first()
          .boundingBox();
        assert.ok(Math.abs(after.y - before.y) < 2, `${name} ${device}: did not return`);
        await page.evaluate(() => scrollTo({ top: 850, behavior: "instant" }));
        await page.waitForTimeout(1100);
        const settled = await page
          .locator('button[aria-label*="メニューを開く"]')
          .first()
          .boundingBox();
        assert.ok(
          settled.width >= 60 && settled.height >= 60,
          `${name} ${device}: hit target too small`,
        );
        if (device === "phone") {
          await page.setViewportSize({ width: height, height: width });
          await page.waitForFunction(
            () => !document.documentElement.hasAttribute("data-phone-landscape-menu"),
            null,
            { timeout: 10000 },
          );
          assert.equal(
            await page.evaluate(() =>
              document.documentElement.hasAttribute("data-phone-landscape-menu"),
            ),
            false,
            `${name}: portrait cleanup`,
          );
        }
        results.push({ name, device, before, after, settled, frames });
      } finally {
        await context.close();
      }
    }
    for (const mode of ["forced", "reduced", "economy"]) {
      const context = await browser.newContext({
        viewport: { width: 844, height: 390 },
        hasTouch: true,
        isMobile: true,
        userAgent:
          "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
      });
      const page = await context.newPage();
      try {
        if (mode === "forced") await page.emulateMedia({ forcedColors: "active" });
        if (mode === "reduced") await page.emulateMedia({ reducedMotion: "reduce" });
        await page.goto(`${base}/dream-chapter`, { waitUntil: "domcontentloaded" });
        await page.waitForTimeout(3000);
        if (mode === "economy")
          await page.evaluate(() =>
            document.documentElement.setAttribute("data-world-effects", "economy"),
          );
        await page.evaluate(() => scrollTo({ top: 800, behavior: "instant" }));
        await page.waitForTimeout(300);
        const state = await page.evaluate(() => ({
          hidden: document.documentElement.dataset.phoneLandscapeHidden,
          motion: document.documentElement.dataset.phoneLandscapeMotion,
          header: getComputedStyle(document.querySelector("[data-phone-landscape-header]"))
            .transition,
          nav: getComputedStyle(document.querySelector("[data-phone-landscape-nav]")).transition,
        }));
        assert.equal(state.hidden, "true", `${name} ${mode}: did not scroll`);
        assert.equal(state.motion, undefined, `${name} ${mode}: motion still active`);
        assert.equal(state.header, "none", `${name} ${mode}: header transition remains`);
        assert.equal(state.nav, "none", `${name} ${mode}: nav transition remains`);
        results.push({ name, mode, ...state });
      } finally {
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }
}
await writeFile(`${dir}/results.json`, JSON.stringify(results, null, 2));
console.log(
  `Compact menu browser verification passed: ${results.length} cases; ${dir}/results.json`,
);
