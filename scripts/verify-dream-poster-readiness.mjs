import assert from "node:assert/strict";
import { chromium, webkit } from "playwright";

const base = process.env.BASE_URL || "http://127.0.0.1:8082";
const engine = process.env.PW_ENGINE || "chromium";
const browser = await (engine === "webkit" ? webkit : chromium).launch(
  engine === "webkit" ? {} : { channel: "chrome" },
);

try {
  for (const scenario of ["selection", "latest-selection", "failed-selection", "shuffle", "reduced-shuffle", "cancel-shuffle", "autoplay"]) {
    const page = await browser.newPage({
      viewport: { width: 390, height: 844 },
      reducedMotion: scenario === "reduced-shuffle" ? "reduce" : "no-preference",
    });
    const errors = [];
    let failedOnce = false;
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("**/*", async (route) => {
      const url = route.request().url();
      if (/dream-chapter-poster-(?!01)[0-9]+(?:-delivery)?\.(?:jpeg|webp)/.test(url)) {
        const delay = scenario === "autoplay" ? 6200
          : scenario === "latest-selection" && url.includes("poster-13") ? 400 : 2000;
        await new Promise((resolve) => setTimeout(resolve, delay));
        if (scenario === "failed-selection" && url.includes("poster-14") && !failedOnce) {
          failedOnce = true;
          await route.abort().catch(() => undefined);
          return;
        }
      }
      await route.continue().catch(() => undefined);
    });
    await page.goto(new URL("/dream-chapter", base).href, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => document.documentElement.dataset.dreamChapter === "true");
    await page.locator(".dream-poster-controls").evaluate((element) =>
      element.scrollIntoView({ block: "center", behavior: "instant" }),
    );
    if (scenario !== "autoplay") await page.locator(".dream-poster-lock").click();
    await page.waitForFunction(() => {
      const image = document.querySelector(".dream-poster-current img");
      return image?.complete && image.naturalWidth > 0;
    });
    await page.evaluate(() => {
      window.posterReadiness = { frames: 0, missing: 0, sources: [] };
      window.samplePosters = true;
      const sample = () => {
        const image = document.querySelector(".dream-poster-current img");
        const record = window.posterReadiness;
        record.frames++;
        if (!image?.complete || !image.naturalWidth) record.missing++;
        if (image?.getAttribute("src") !== record.sources.at(-1)) record.sources.push(image?.getAttribute("src"));
        if (window.samplePosters) requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    });
    if (scenario.includes("shuffle")) {
      await page.locator(".dream-poster-shuffle").focus();
      await page.keyboard.press("Enter");
      if (scenario === "cancel-shuffle") await page.locator(".dream-poster-reset").click();
    } else if (scenario !== "autoplay") {
      await page.locator("#dream-poster-tab-13").click();
      if (scenario === "latest-selection") {
        await page.locator("#dream-poster-tab-12").click();
      }
    }
    await page.waitForTimeout(scenario === "autoplay" ? 8500 : 3500);
    const result = await page.evaluate(() => {
      window.samplePosters = false;
      return {
        ...window.posterReadiness,
        selected: document.querySelector('.dream-poster-thumbnails [aria-selected="true"]')?.id,
        busy: document.querySelector(".dream-poster-shuffle")?.getAttribute("aria-busy"),
      };
    });
    console.log(engine, scenario, result);
    assert.ok(result.frames > 20);
    assert.equal(result.missing, 0, `${scenario}: an undecoded poster replaced the visible image`);
    assert.equal(result.busy, "false");
    if (scenario === "selection") assert.equal(result.selected, "dream-poster-tab-13");
    if (scenario === "latest-selection") {
      assert.equal(result.selected, "dream-poster-tab-12");
      assert.ok(!result.sources.includes("/dream-chapter-poster-14.jpeg"), "superseded selection appeared late");
    }
    if (scenario === "failed-selection" || scenario === "cancel-shuffle") {
      assert.equal(result.selected, "dream-poster-tab-0");
    }
    if (scenario === "shuffle" || scenario === "reduced-shuffle") {
      assert.notEqual(result.selected, "dream-poster-tab-0", "shuffle did not select a loaded result");
    }
    if (scenario === "autoplay") assert.equal(result.selected, "dream-poster-tab-1");
    if (scenario === "failed-selection") {
      await page.locator("#dream-poster-tab-13").click();
      await page.waitForFunction(() =>
        document.querySelector("#dream-poster-tab-13")?.getAttribute("aria-selected") === "true",
      );
      assert.equal(await page.locator(".dream-poster-current img").evaluate((image) =>
        image.complete && image.naturalWidth > 0), true);
      console.log(engine, "failed image retried successfully");
    }
    assert.deepEqual(errors, []);
    await page.close();
  }
} finally {
  await browser.close();
}
