// Browser integration check. BASE_URL and OUT_DIR select the preview and artifact directory.
import { chromium, webkit } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";

const base = process.env.BASE_URL || "http://127.0.0.1:8808";
const dir = process.env.OUT_DIR || "/tmp/compact-menu-motion";

async function placeCompactLauncher(page) {
  await page.waitForFunction(
    () => {
      // Initial scroll restoration can win over a scripted setup jump.
      // The recorded flight below still uses a single scroll in each direction.
      if (scrollY < 150) {
        scrollTo({ top: 850, behavior: "instant" });
        return false;
      }
      const { dataset } = document.documentElement;
      return (
        (dataset.ipadMenuScrolled === "true" || dataset.phoneLandscapeHidden === "true") &&
        !dataset.ipadMenuMotion &&
        !dataset.phoneLandscapeMotion
      );
    },
    null,
    { timeout: 20000 },
  );
}

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
    for (const [device, orientation, width, height] of [
      ["ipad", "portrait", 834, 1194],
      ["ipad", "landscape", 1194, 834],
      ["phone", "landscape", 844, 390],
    ]) {
      const label = `${name} ${device} ${orientation}`;
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
              (parseFloat(root.style.getPropertyValue("--ipad-header-exit-distance")) > 0 ||
                parseFloat(root.style.getPropertyValue("--phone-landscape-chrome-height")) > 0) &&
              !root.hasAttribute("data-loading") &&
              !root.hasAttribute("data-route-scroll-settling") &&
              getComputedStyle(document.body).position !== "fixed"
            );
          },
          null,
          { timeout: 20000 },
        );
        await page.evaluate(() => {
          document.documentElement.style.scrollBehavior = "auto";
        });
        await placeCompactLauncher(page);
        const trigger = page.locator('button[aria-label*="メニューを開く"]').first();
        const settled = await trigger.boundingBox();
        assert.ok(settled.width >= 60 && settled.height >= 60, `${label}: hit target too small`);
        assert.ok(
          settled.x >= 0 &&
            settled.y >= 0 &&
            settled.x + settled.width <= width &&
            settled.y + settled.height <= height,
          `${label}: compact launcher is outside the viewport`,
        );
        assert.ok(
          await trigger.evaluate((button) => {
            const { x, y, width, height } = button.getBoundingClientRect();
            return button.contains(document.elementFromPoint(x + width / 2, y + height / 2));
          }),
          `${label}: compact launcher does not receive hits`,
        );
        await page.evaluate(() => scrollTo({ top: 0, behavior: "instant" }));
        await page.waitForFunction(() => {
          const { dataset } = document.documentElement;
          return (
            scrollY === 0 &&
            dataset.ipadMenuScrolled !== "true" &&
            dataset.phoneLandscapeHidden !== "true" &&
            !dataset.ipadMenuMotion &&
            !dataset.phoneLandscapeMotion
          );
        });
        const before = await trigger.boundingBox();
        const frames = await page.evaluate(
          () =>
            new Promise((resolve) => {
              const root = document.documentElement;
              const samples = [];
              let originY;
              let reversing = false;
              let expanded = false;
              const start = performance.now();
              function sample(now) {
                const shell = document.querySelector(
                  'button[aria-label*="メニューを開く"] .side-panel-trigger-convergence',
                );
                const motion = root.dataset.ipadMenuMotion || root.dataset.phoneLandscapeMotion;
                const rect = shell?.getBoundingClientRect().toJSON();
                samples.push({ time: now - start, scrollY, motion, rect });
                // Reverse an observed, still-moving flight. A timer started by
                // scrollTo can turn around before a busy browser paints a frame.
                if (motion === "converge" && rect) {
                  originY ??= rect.y;
                  if (!reversing && Math.abs(rect.y - originY) > 8) {
                    reversing = true;
                    scrollTo({ top: 0, behavior: "instant" });
                  }
                }
                if (motion === "expand") expanded = true;
                if ((expanded && !motion && scrollY === 0) || now - start >= 4000) resolve(samples);
                else requestAnimationFrame(sample);
              }
              requestAnimationFrame(sample);
              scrollTo({ top: 850, behavior: "instant" });
            }),
        );
        await writeFile(
          `${dir}/${name}-${device}-${orientation}-flight.json`,
          JSON.stringify({ before, frames }, null, 2),
        );
        const launch = frames.find((frame) => frame.motion === "converge" && frame.rect);
        assert.ok(launch, `${label}: no outward flight observed`);
        assert.ok(
          Math.abs(launch.rect.x - before.x) < 2 && Math.abs(launch.rect.y - before.y) < 2,
          `${label}: flight origin differs from button`,
        );
        assert.ok(
          frames.some((frame) => frame.motion === "expand"),
          `${label}: reversal not observed`,
        );
        const lastFrame = frames.at(-1);
        assert.ok(lastFrame.scrollY === 0 && !lastFrame.motion, `${label}: return did not settle`);
        const after = await trigger.boundingBox();
        assert.ok(
          Math.abs(after.x - before.x) < 2 && Math.abs(after.y - before.y) < 2,
          `${label}: did not return`,
        );
        if (device === "phone") {
          await placeCompactLauncher(page);
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
        results.push({ name, device, orientation, before, after, settled, frames });
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
        await page.waitForFunction(() => {
          const root = document.documentElement;
          return (
            root.dataset.phoneLandscapeMenu === "true" &&
            !root.hasAttribute("data-loading") &&
            !root.hasAttribute("data-route-scroll-settling") &&
            document.body.style.position !== "fixed" &&
            document.querySelector("[data-phone-landscape-nav]")
          );
        });
        // The Dream header can still remeasure as its entry assets settle.
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
