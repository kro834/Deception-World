import assert from "node:assert/strict";
import { chromium, webkit } from "playwright";
import { checkedUrl } from "./browser-guard.mjs";

const base = checkedUrl(process.env.BASE_URL || "http://127.0.0.1:8082");
const engineName = process.env.PW_ENGINE || "chromium";
assert.ok(["chromium", "webkit"].includes(engineName), "PW_ENGINE must be chromium or webkit");
const browser = await (engineName === "webkit" ? webkit : chromium).launch(
  engineName === "chromium" ? { channel: process.env.PW_BROWSER_CHANNEL || "chrome" } : {},
);
const viewports = [
  { name: "landscape-844", width: 844, height: 390, mobile: true },
  { name: "phone-390", width: 390, height: 844, mobile: true },
  { name: "desktop-1440", width: 1440, height: 900 },
];

try {
  for (const viewport of viewports) {
    for (const targetId of ["riders", "records"]) {
      const context = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
        ...(viewport.mobile ? { isMobile: true, hasTouch: true } : {}),
        reducedMotion: "no-preference",
      });
      const page = await context.newPage();
      await context.addInitScript(() => {
        Object.defineProperty(Navigator.prototype, "hardwareConcurrency", {
          get: () => 8,
          configurable: true,
        });
        Object.defineProperty(Navigator.prototype, "deviceMemory", {
          get: () => 8,
          configurable: true,
        });
      });
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.goto(new URL("/world", base).href, { waitUntil: "domcontentloaded" });
      await page.waitForSelector(`.site-shell .topbar nav a[href="#${targetId}"]`);
      await page.waitForFunction(
        () =>
          !document.documentElement.hasAttribute("data-loading") &&
          !document.documentElement.hasAttribute("data-route-scroll-settling"),
        undefined,
        { timeout: 20_000 },
      );
      const link = page.locator(`.site-shell .topbar nav a[href="#${targetId}"]`);
      await link.click(); // Use the real link once; do not correct the landing with scrollTo.
      try {
        await page.waitForFunction(
          (id) => {
            const section = document.getElementById(id);
            const margin = parseFloat(getComputedStyle(section).scrollMarginTop);
            return (
              location.hash === `#${id}` &&
              document
                .querySelector('.topbar nav a[aria-current="location"]')
                ?.getAttribute("href") === `#${id}` &&
              Math.abs(section.getBoundingClientRect().top - margin) <= 3 &&
              document.querySelector(".site-shell")?.dataset.worldPhase === id
            );
          },
          targetId,
          { timeout: 10_000 },
        );
      } catch (error) {
        const actual = await page.evaluate((id) => {
          const section = document.getElementById(id);
          return {
            hash: location.hash,
            top: section.getBoundingClientRect().top,
            margin: parseFloat(getComputedStyle(section).scrollMarginTop),
            phase: document.querySelector(".site-shell")?.dataset.worldPhase ?? null,
            current: document
              .querySelector('.topbar nav a[aria-current="location"]')
              ?.getAttribute("href"),
            scrollY: window.scrollY,
          };
        }, targetId);
        throw new Error(
          `${viewport.name} initial #${targetId} did not settle: ${JSON.stringify(actual)}`,
          {
            cause: error,
          },
        );
      }
      // A view-timeline anchor can pull the first landing back *after* it
      // briefly crosses the target margin. Sample again after that motion.
      await page.waitForTimeout(900);
      const landing = await page.evaluate((id) => {
        const section = document.getElementById(id);
        return {
          hash: location.hash,
          top: section.getBoundingClientRect().top,
          margin: parseFloat(getComputedStyle(section).scrollMarginTop),
          phase: document.querySelector(".site-shell")?.dataset.worldPhase ?? null,
          overflow: document.documentElement.scrollWidth > window.innerWidth + 1,
          current: document
            .querySelector('.topbar nav a[aria-current="location"]')
            ?.getAttribute("href"),
        };
      }, targetId);
      assert.equal(landing.hash, `#${targetId}`, `${viewport.name} initial #${targetId} hash`);
      assert.equal(
        landing.current,
        `#${targetId}`,
        `${viewport.name} initial #${targetId} current`,
      );
      assert.ok(
        Math.abs(landing.top - landing.margin) <= 3,
        `${viewport.name} initial #${targetId} landing ${JSON.stringify(landing)}`,
      );
      assert.equal(landing.phase, targetId, `${viewport.name} initial #${targetId} phase`);
      assert.equal(landing.overflow, false, `${viewport.name} initial #${targetId} overflow`);

      await page.locator('.site-shell .topbar nav a[href="#story"]').click();
      await page.waitForFunction(
        () => {
          const story = document.getElementById("story");
          return (
            location.hash === "#story" &&
            document
              .querySelector('.topbar nav a[aria-current="location"]')
              ?.getAttribute("href") === "#story" &&
            Math.abs(
              story.getBoundingClientRect().top -
                parseFloat(getComputedStyle(story).scrollMarginTop),
            ) <= 3 &&
            document.querySelector(".site-shell")?.dataset.worldPhase === "story"
          );
        },
        undefined,
        { timeout: 10_000 },
      );
      await page.waitForTimeout(900);
      const returned = await page.evaluate(() => ({
        hash: location.hash,
        top: document.getElementById("story").getBoundingClientRect().top,
        margin: parseFloat(getComputedStyle(document.getElementById("story")).scrollMarginTop),
        phase: document.querySelector(".site-shell")?.dataset.worldPhase ?? null,
        overflow: document.documentElement.scrollWidth > window.innerWidth + 1,
      }));
      assert.ok(
        Math.abs(returned.top - returned.margin) <= 3,
        `${viewport.name} STORY return ${JSON.stringify(returned)}`,
      );
      assert.equal(returned.hash, "#story");
      assert.equal(returned.phase, "story");
      assert.equal(returned.overflow, false);
      assert.deepEqual(errors, [], `${viewport.name} #${targetId} JS errors`);
      console.log(
        JSON.stringify({
          check: "cold-fragment",
          engineName,
          viewport: viewport.name,
          targetId,
          landing,
          returned,
        }),
      );
      await context.close();
    }
  }
} finally {
  await browser.close();
}
console.log("world cold fragment ok");
