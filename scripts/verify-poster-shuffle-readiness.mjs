import assert from "node:assert/strict";
import { chromium } from "playwright";

const base = process.env.BASE_URL || "http://127.0.0.1:8082";
const browser = await chromium.launch({ channel: "chrome" });
try {
  for (const width of [390, 1280]) {
    for (const delay of [300, 1500]) {
      const page = await browser.newPage({ viewport: { width, height: 844 } });
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.route("**/*", async (route) => {
        if (
          route.request().resourceType() === "image" &&
          /poster-card-/.test(route.request().url())
        ) {
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
        await route.continue().catch(() => undefined);
      });
      await page.goto(new URL("/world", base).href);
      await page.waitForFunction(() => {
        const image = document.querySelector(".poster-image-current");
        return image?.complete && image.naturalWidth > 0;
      });
      const shuffle = page.locator(".poster-shuffle");
      await shuffle.scrollIntoViewIfNeeded();
      await shuffle.focus();
      await page.evaluate(() => {
        window.posterReadiness = { frames: 0, missing: [] };
        const until = performance.now() + 2400;
        const sample = () => {
          const image = document.querySelector(".poster-image-current");
          const record = window.posterReadiness;
          record.frames += 1;
          if (!image || !image.complete || !image.naturalWidth) {
            record.missing.push(image?.getAttribute("src") || "absent");
          }
          if (performance.now() < until) requestAnimationFrame(sample);
        };
        requestAnimationFrame(sample);
      });
      await shuffle.click();
      await page.waitForFunction(
        () => document.querySelector(".poster-shuffle")?.getAttribute("aria-busy") === "false",
      );
      await page.waitForTimeout(1000);
      const record = await page.evaluate(() => window.posterReadiness);
      assert.ok(record.frames > 20);
      assert.deepEqual(
        record.missing,
        [],
        `${width}px / ${delay}ms: shuffle must keep readable pixels`,
      );
      assert.deepEqual(errors, []);
      console.log(
        `PASS ${width}px / ${delay}ms: ${record.frames} frames, no unready poster, busy released`,
      );
      await page.close();
    }
  }
} finally {
  await browser.close();
}
