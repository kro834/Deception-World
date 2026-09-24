import assert from "node:assert/strict";
import { chromium, webkit } from "playwright";
import { dossierImageSources } from "../src/lib/dossier-images.ts";
const engine = process.env.PW_ENGINE || "chromium";
const browser = await (engine === "webkit"
  ? webkit.launch()
  : chromium.launch({ channel: "chrome" }));
try {
  for (const width of [390, 1280]) {
    const page = await browser.newPage({ viewport: { width, height: 844 }, deviceScaleFactor: 2 });
    const requests = [],
      errors = [];
    page.on("request", (request) => requests.push(new URL(request.url()).pathname));
    page.on("pageerror", (error) => errors.push(error.message));
    for (const route of ["/riders/saga", "/world"]) {
      await page.goto(`${process.env.BASE_URL || "http://127.0.0.1:8082"}${route}`);
      await page.waitForFunction(
        () =>
          document.documentElement.dataset.mode === "world" &&
          document.documentElement.dataset.worldPageVisible !== undefined &&
          !document.documentElement.hasAttribute("data-route-scroll-settling"),
      );
      await page.waitForTimeout(500);
      const image = page
        .locator(
          route === "/world"
            ? 'img[src="/episode-01-hide-and-seek.jpeg"]'
            : ".manager-portrait-frame img",
        )
        .first();
      await image.scrollIntoViewIfNeeded();
      for (let step = 0; step < 24; step++) {
        const bounds = await image.boundingBox();
        if (bounds && bounds.y >= 0 && bounds.y < 700) break;
        await page.mouse.move(width - 10, 400);
        await page.mouse.wheel(0, bounds ? bounds.y - 300 : 600);
        await page.waitForTimeout(250);
      }
      await image.evaluate((image) =>
        Promise.race([
          image.decode(),
          new Promise((_, reject) =>
            setTimeout(
              () =>
                reject(
                  new Error(
                    `Image decode timeout: ${image.currentSrc}, bounds: ${JSON.stringify(image.getBoundingClientRect())}`,
                  ),
                ),
              10000,
            ),
          ),
        ]),
      );
      const state = await image.evaluate((image) => ({
        src: image.currentSrc,
        width: image.naturalWidth,
        height: image.naturalHeight,
      }));
      assert.match(state.src, /-delivery(?:-\d+)?\.webp$/);
      assert.ok(state.width > 0 && state.height > 0);
      console.log(JSON.stringify({ engine, viewportWidth: width, route, ...state }));
    }
    assert.deepEqual(
      requests.filter((path) => dossierImageSources.includes(path)),
      [],
      "Original JPEG requested alongside WebP",
    );
    assert.deepEqual(errors, []);
    await page.close();
  }
} finally {
  await browser.close();
}
