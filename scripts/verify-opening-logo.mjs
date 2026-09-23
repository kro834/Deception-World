import assert from "node:assert/strict";
import { chromium, webkit } from "playwright";

const origin = process.env.BASE_URL || "http://localhost:8082";
const engine = process.env.PW_ENGINE || "chromium";
// The opening's two alpha-keyed logos (2026-09-24): the ice logo burns and
// the prism logo stays. Each is one srcset family of delivery widths.
const firstLogo = /^\/logo-title-ice-20260924-delivery-(?:640|960|1280|1536)\.webp$/;
const finalLogo = /^\/logo-title-prism-20260924-delivery-(?:640|960|1280|1536)\.webp$/;
const browser = await (engine === "webkit" ? webkit : chromium).launch(
  engine === "webkit" ? {} : { channel: "chrome" },
);

try {
  for (const [width, height] of [[390, 844], [1024, 768], [1280, 960]]) {
    const page = await browser.newPage({ viewport: { width, height }, hasTouch: true });
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.goto(origin);
    await page.locator(".cine-stage.is-complete").waitFor({ timeout: 15000 });
    await page.waitForTimeout(700);
    const logo = page.locator(".cine-logo-core");
    await logo.evaluate(image => image.decode());
    const state = await logo.evaluate(image => {
      const { x, y, width, height } = image.getBoundingClientRect();
      const first = document.querySelector(".cine-logo-first");
      return {
        src: new URL(image.currentSrc).pathname,
        first: new URL(first.currentSrc || first.src).pathname,
        naturalWidth: image.naturalWidth,
        naturalHeight: image.naturalHeight,
        fit: getComputedStyle(image).objectFit,
        opacity: Number(getComputedStyle(image).opacity),
        firstOpacity: Number(getComputedStyle(first).opacity),
        rect: { x, y, width, height },
        overflow: document.documentElement.scrollWidth > innerWidth,
      };
    });
    assert.match(state.src, finalLogo);
    assert.match(state.first, firstLogo);
    assert.equal(state.opacity, 1, "the prism logo stays after the burn");
    assert.equal(state.firstOpacity, 0, "the ice logo has burnt away");
    assert.ok(Math.abs(state.naturalWidth / state.naturalHeight - 1.5) < 0.01);
    assert.equal(state.fit, "contain");
    assert.ok(Math.abs(state.rect.width / state.rect.height - 1.5) < 0.01);
    assert.ok(state.rect.x >= -1 && state.rect.y >= -1);
    assert.ok(state.rect.x + state.rect.width <= width + 1);
    assert.ok(state.rect.y + state.rect.height <= height + 1);
    assert.equal(state.overflow, false);
    // The route preloads the ice logo with the <img> layers' srcset and sizes,
    // so every layer (and the burn's ImageBitmaps, from the HTTP cache) uses
    // one candidate of each logo.
    assert.ok(await page.locator('link[rel=preload][imagesrcset*="logo-title-ice-20260924"]').count() >= 1);
    const fetched = await page.evaluate(() => performance.getEntriesByType("resource")
      .map(entry => new URL(entry.name).pathname)
      .filter(path => /\/logo-title/.test(path)));
    const candidates = [...new Set(fetched)];
    assert.equal(candidates.filter(path => firstLogo.test(path)).length, 1, JSON.stringify(fetched));
    assert.equal(candidates.filter(path => finalLogo.test(path)).length, 1, JSON.stringify(fetched));
    assert.ok(
      fetched.every(path => firstLogo.test(path) || finalLogo.test(path)),
      `Opening fetched a stale logo ${JSON.stringify(fetched)}`,
    );
    if (process.env.SAVE_SCREENSHOTS) {
      await page.screenshot({ path: `/tmp/logo-${engine}-${width}.png` });
    }
    await page.getByRole("button", { name: "ENTER THE WORLD", exact: true }).tap();
    const handoff = page.locator("[data-opening-handoff-logo] img");
    await handoff.waitFor({ state: "attached" });
    assert.equal(new URL(await handoff.getAttribute("src"), origin).pathname, state.src);
    await page.waitForURL(/\/world$/);
    await page.locator("[data-opening-handoff-root]").waitFor({ state: "detached" });
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ engine, viewport: `${width}x${height}`, logo: state.src, handoff: "same artwork", bounds: "pass" }));
    await page.close();
  }
} finally {
  await browser.close();
}
