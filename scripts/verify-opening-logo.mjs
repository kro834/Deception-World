import assert from "node:assert/strict";
import { chromium, webkit } from "playwright";

const origin = process.env.BASE_URL || "http://localhost:8082";
const engine = process.env.PW_ENGINE || "chromium";
const logoPath = "/logo-title-20260915.webp";
const browser = await (engine === "webkit" ? webkit : chromium).launch(
  engine === "webkit" ? {} : { channel: "chrome" },
);

try {
  for (const [width, height] of [[390, 844], [1024, 768], [1280, 960]]) {
    const page = await browser.newPage({ viewport: { width, height }, hasTouch: true });
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.goto(origin);
    await page.locator(".cine-stage.is-complete").waitFor();
    await page.waitForTimeout(700);
    const logo = page.locator(".cine-logo-core");
    await logo.evaluate(image => image.decode());
    const state = await logo.evaluate(image => {
      const { x, y, width, height } = image.getBoundingClientRect();
      return {
        src: new URL(image.currentSrc).pathname,
        naturalWidth: image.naturalWidth,
        naturalHeight: image.naturalHeight,
        fit: getComputedStyle(image).objectFit,
        rect: { x, y, width, height },
        overflow: document.documentElement.scrollWidth > innerWidth,
      };
    });
    assert.equal(state.src, logoPath);
    assert.equal(state.naturalWidth, 1200);
    assert.equal(state.naturalHeight, 800);
    assert.equal(state.fit, "contain");
    assert.ok(Math.abs(state.rect.width / state.rect.height - 1.5) < 0.01);
    assert.ok(state.rect.x >= -1 && state.rect.y >= -1);
    assert.ok(state.rect.x + state.rect.width <= width + 1);
    assert.ok(state.rect.y + state.rect.height <= height + 1);
    assert.equal(state.overflow, false);
    // React can add its own hint alongside the route hint; the browser should
    // still fetch their shared, versioned URL only once.
    assert.ok(await page.locator(`link[rel=preload][href="${logoPath}"]`).count() >= 1);
    assert.equal(await page.evaluate(path => performance.getEntriesByType("resource")
      .filter(entry => new URL(entry.name).pathname === path).length, logoPath), 1);
    const loadedOld = await page.evaluate(() => performance.getEntriesByType("resource")
      .some(entry => /\/logo-title\.(?:webp|jpg)(?:\?|$)/.test(entry.name)));
    assert.equal(loadedOld, false, "Opening fetched a stale logo");
    if (process.env.SAVE_SCREENSHOTS) {
      await page.screenshot({ path: `/tmp/logo-${engine}-${width}.png` });
    }
    await page.getByRole("button", { name: "ENTER THE WORLD", exact: true }).tap();
    const handoff = page.locator("[data-opening-handoff-logo] img");
    await handoff.waitFor({ state: "attached" });
    assert.equal(new URL(await handoff.getAttribute("src"), origin).pathname, logoPath);
    await page.waitForURL(/\/world$/);
    await page.locator("[data-opening-handoff-root]").waitFor({ state: "detached" });
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ engine, viewport: `${width}x${height}`, logo: "new artwork", handoff: "same artwork", bounds: "pass" }));
    await page.close();
  }
} finally {
  await browser.close();
}
