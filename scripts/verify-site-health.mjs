import assert from "node:assert/strict";
import { chromium } from "playwright";

const base = process.env.BASE_URL || "http://127.0.0.1:8082";
const routes = [
  "/",
  "/world",
  "/characters",
  "/characters/ciel",
  "/characters/dante",
  "/characters/terra",
  "/characters/luna",
  "/characters/yoake-mamori",
  "/managers",
  "/managers/zeus",
  "/managers/rex-loi",
  "/managers/shuza",
  "/managers/lejas",
  "/managers/opus",
  "/managers/reemu",
  "/riders",
  "/riders/saga",
  "/riders/realm",
  "/riders/lore",
  "/riders/vandal",
  "/riders/leddic",
  "/riders/argenome",
  "/riders/over-zeztz",
  "/riders/cipher",
  "/form-archive",
  "/dream-chapter",
  "/rexonance-saga",
  "/extreme-saga",
  "/final-stage",
  "/download",
  "/no-such-record",
];
const results = [];
const browser = await chromium.launch({ channel: process.env.PW_BROWSER_CHANNEL || "chrome" });
try {
  for (const width of [320, 768, 1440]) {
    const context = await browser.newContext({
      viewport: { width, height: 900 },
      hasTouch: true,
      reducedMotion: "reduce",
    });
    const page = await context.newPage();
    let pageErrors = [];
    let httpErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    page.on("response", (response) => {
      if (
        response.status() >= 400 &&
        new URL(response.url()).origin === new URL(base).origin &&
        response.request().resourceType() !== "document"
      ) {
        httpErrors.push([response.status(), response.url()]);
      }
    });
    for (const route of routes) {
      pageErrors = [];
      httpErrors = [];
      const response = await page.goto(new URL(route, base).href, {
        waitUntil: "domcontentloaded",
      });
      await page.waitForTimeout(900);
      // Wake lazy images all the way to the footer, not just the hero.
      for (let step = 0; step < 30; step++) {
        const done = await page.evaluate(() => {
          window.scrollBy({ top: innerHeight * 0.85, behavior: "instant" });
          return scrollY + innerHeight >= document.documentElement.scrollHeight - 1;
        });
        await page.waitForTimeout(65);
        if (done) break;
      }
      await page.waitForTimeout(300);
      const scan = await page.evaluate(() => {
        const duplicateIds = [];
        const ids = new Set();
        for (const node of document.querySelectorAll("[id]")) {
          if (ids.has(node.id)) duplicateIds.push(node.id);
          ids.add(node.id);
        }
        const brokenImages = [...document.images]
          .filter((img) => img.complete && !img.naturalWidth && img.currentSrc)
          .map((img) => img.currentSrc);
        const emptyButtons = [...document.querySelectorAll("button")]
          .filter(
            (node) =>
              !node.textContent.trim() &&
              !node.getAttribute("aria-label") &&
              !node.getAttribute("aria-labelledby") &&
              !node.title,
          )
          .map((node) => node.className);
        // The skip link deliberately finds the visible heading at activation;
        // it keeps the current URL hash rather than requiring an id="main".
        const missingAnchors = [...document.querySelectorAll("a[href]:not(.dw-skip-link)")]
          .map((node) => new URL(node.href))
          .filter(
            (url) =>
              url.origin === location.origin &&
              url.pathname === location.pathname &&
              url.hash &&
              !document.getElementById(decodeURIComponent(url.hash.slice(1))),
          )
          .map((url) => url.hash);
        return {
          overflow: document.documentElement.scrollWidth - innerWidth,
          duplicateIds,
          brokenImages,
          emptyButtons,
          missingAnchors: [...new Set(missingAnchors)],
        };
      });
      const result = { width, route, status: response?.status(), ...scan, pageErrors, httpErrors };
      results.push(result);
      console.log(JSON.stringify(result));
    }
    await context.close();
  }
  for (const result of results) {
    const label = `${result.width}px ${result.route}`;
    assert.equal(result.status, result.route === "/no-such-record" ? 404 : 200, label);
    assert.ok(result.overflow <= 1, `${label}: horizontal document overflow`);
    for (const key of [
      "duplicateIds",
      "brokenImages",
      "emptyButtons",
      "missingAnchors",
      "pageErrors",
      "httpErrors",
    ]) {
      assert.deepEqual(result[key], [], `${label}: ${key}`);
    }
  }
  console.log(`${results.length}/${results.length} site health checks passed`);
} finally {
  await browser.close();
}
