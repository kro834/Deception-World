import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium, webkit } from "playwright";

// Geometry evidence from the real production build. This is viewport/touch
// emulation, not physical-device coverage, and never writes gallery records.
const base = process.env.BASE_URL || "http://127.0.0.1:8272";
const engineName = process.env.PW_ENGINE === "webkit" ? "webkit" : "chromium";
const engine = engineName === "webkit" ? webkit : chromium;
const output = process.env.AUDIT_OUT || `output/playwright/tablet-baseline-${engineName}`;
const matrix = [
  [320, 780],
  [390, 844],
  [507, 1024],
  [639, 834],
  [720, 540],
  [768, 1024],
  [820, 1180],
  [900, 600],
  [1024, 768],
  [1024, 1366],
  [1080, 720],
  [1180, 820],
  [1366, 1024],
  [1440, 900],
].filter(
  ([width]) => !process.env.PW_WIDTHS || process.env.PW_WIDTHS.split(",").includes(String(width)),
);
await mkdir(output, { recursive: true });
const browser = await engine.launch(engineName === "chromium" ? { channel: "chrome" } : {});
const results = [];

async function ready(page) {
  await page.waitForFunction(
    () =>
      document.documentElement.dataset.scrollMotionReady === "true" &&
      !document.documentElement.hasAttribute("data-loading") &&
      !document.documentElement.hasAttribute("data-route-scroll-settling"),
  );
  await page.evaluate(() =>
    Promise.race([document.fonts.ready, new Promise((resolve) => setTimeout(resolve, 4000))]),
  );
  await page.waitForTimeout(200);
}

async function scan(page, selectors) {
  return page.evaluate(
    (queries) => ({
      overflow: document.documentElement.scrollWidth - innerWidth,
      layout: Object.fromEntries(
        queries.map((selector) => [
          selector,
          [...document.querySelectorAll(selector)].slice(0, 8).map((node) => {
            const style = getComputedStyle(node);
            return {
              rect: node.getBoundingClientRect().toJSON(),
              display: style.display,
              columns: style.gridTemplateColumns,
              font: style.fontSize,
              padding: style.padding,
              position: style.position,
              overflow: style.overflow,
              stage: style.getPropertyValue("--sd-stage-w"),
            };
          }),
        ]),
      ),
    }),
    selectors,
  );
}

try {
  for (const [width, height] of matrix) {
    const context = await browser.newContext({
      viewport: { width, height },
      hasTouch: width < 1440,
      reducedMotion: "reduce",
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    for (const route of ["/world", "/characters/ciel", "/dream-chapter", "/search"]) {
      const label = `${width}x${height}-${route.replaceAll("/", "-").slice(1)}`;
      const response = await page.goto(`${base}${route}`, { waitUntil: "domcontentloaded" });
      assert.equal(response.status(), 200, route);
      await ready(page);
      await page.screenshot({ path: `${output}/${label}.png` });
      const selectors =
        route === "/world"
          ? [
              ".hero",
              ".poster-stage",
              ".hero-copy",
              ".hero-context",
              ".manager-slot-grid",
              ".wa-roster",
            ]
          : route === "/characters/ciel"
            ? [
                ".manager-page",
                ".manager-hero",
                ".dossier-identity",
                ".manager-card",
                ".dossier-section",
              ]
            : route === "/search"
              ? [".search-page", ".search-categories", ".search-results"]
              : [".dream-hero", ".dream-prologue", ".dream-contents", ".dream-reading-entry"];
      const result = { width, height, route, ...(await scan(page, selectors)) };
      assert.ok(result.overflow <= 1, `${label} document overflow ${result.overflow}`);
      if (route === "/world") {
        await page
          .locator("#cast-roster")
          .evaluate((node) => node.scrollIntoView({ block: "start", behavior: "instant" }));
        await page.waitForTimeout(250);
        await page.screenshot({ path: `${output}/${label}-cast.png` });
      }
      if (route === "/dream-chapter") {
        const trigger = page.getByRole("button", { name: "読書室を開く" });
        await trigger.scrollIntoViewIfNeeded();
        await trigger.click();
        await page.locator(".dream-reading-room[open]").waitFor();
        await page.waitForTimeout(200);
        result.reading = await scan(page, [
          ".dream-reading-room",
          ".dream-reading-workspace",
          ".dream-reading-sidebar",
          ".dream-reading-scroll",
          ".dream-reading-paper",
          ".dream-reading-topbar",
          ".dream-reading-footer",
        ]);
        await page.screenshot({ path: `${output}/${label}-reading.png` });
        await page.getByRole("button", { name: "読書室を閉じる" }).click();
        await page.locator(".dream-reading-room").waitFor({ state: "detached" });
      }
      results.push(result);
      console.log(`PASS ${engineName} ${label}: measured; errors=${errors.length}`);
    }
    assert.deepEqual(errors, [], `${width}x${height} page errors`);
    await context.close();
  }
} finally {
  await writeFile(`${output}/geometry.json`, JSON.stringify(results, null, 2));
  await browser.close();
}
