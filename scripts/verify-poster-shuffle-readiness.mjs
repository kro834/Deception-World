import assert from "node:assert/strict";
import { chromium, webkit } from "playwright";

const base = process.env.BASE_URL || "http://127.0.0.1:8082";
const engine = process.env.PW_ENGINE || "chromium";
const browser = await (engine === "webkit" ? webkit : chromium).launch(engine === "webkit" ? {} : { channel: "chrome" });
const currentPoster = (page) =>
  page.locator(".world-stage-image-current").evaluate((image) => new URL(image.currentSrc).pathname);

async function readyShuffle(page) {
  await page.goto(new URL("/world", base).href, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => {
    const image = document.querySelector(".world-stage-image-current");
    return image?.complete && image.naturalWidth > 0 &&
      !document.documentElement.hasAttribute("data-loading") &&
      !document.documentElement.hasAttribute("data-route-scroll-settling");
  });
  const shuffle = page.locator(".poster-shuffle");
  await shuffle.scrollIntoViewIfNeeded();
  await shuffle.focus();
  await page.waitForFunction(() =>
    document.querySelector(".world-stage-controls output")?.getAttribute("aria-live") === "polite",
  );
  return shuffle;
}

try {
  for (const width of [390, 1280]) {
    for (const reducedMotion of ["no-preference", "reduce"]) {
      const delay = 2000;
      const page = await browser.newPage({ viewport: { width, height: 844 }, reducedMotion });
      // Draw poster 02 repeatedly, exercising the previous/current handoff.
      await page.addInitScript(() => Object.defineProperty(window.crypto, "getRandomValues", { value: (values) => values.fill(0) }));
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
      const shuffle = await readyShuffle(page);
      await page.evaluate(() => {
        window.posterReadiness = { frames: 0, missing: [] };
        const until = performance.now() + 3600;
        const sample = () => {
          const image = document.querySelector(".world-stage-image-current");
          const record = window.posterReadiness;
          record.frames += 1;
          const layers = [image, document.querySelector(".world-stage-image-previous")];
          const visible = layers.some((layer) => {
            if (!layer?.complete || layer.naturalWidth === 0) return false;
            const style = getComputedStyle(layer);
            return style.display !== "none" && Number(style.opacity) > 0;
          });
          if (!visible) record.missing.push(layers.map((layer) => layer && ({
            src: layer.currentSrc || layer.getAttribute("src"),
            complete: layer.complete,
            width: layer.naturalWidth,
            opacity: getComputedStyle(layer).opacity,
          })));
          if (performance.now() < until) requestAnimationFrame(sample);
        };
        requestAnimationFrame(sample);
      });
      await shuffle.click();
      await page.waitForFunction(
        () => document.querySelector(".poster-shuffle")?.getAttribute("aria-busy") === "true",
      );
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
      assert.equal(await currentPoster(page), "/poster-card-03-delivery.webp", "a slow final result must not be silently discarded");
      console.log(
        `PASS ${engine} ${width}px / ${reducedMotion} / ${delay}ms: ${record.frames} frames, no unready poster, final selection delivered`,
      );
      await page.close();
    }
  }

  for (const reducedMotion of ["no-preference", "reduce"]) {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion });
    // This result is not the next poster or any warmup preview.
    await page.addInitScript(() => Object.defineProperty(window.crypto, "getRandomValues", { value: (values) => values.fill(12) }));
    let releaseImage;
    const imageGate = new Promise((resolve) => { releaseImage = resolve; });
    await page.route("**/poster-card-16*", async (route) => {
      await imageGate;
      await route.continue().catch(() => undefined);
    });
    const shuffle = await readyShuffle(page);
    const coldRequest = page.waitForRequest("**/poster-card-16*", { timeout: 6000 });
    await shuffle.click();
    await coldRequest;
    assert.equal(await shuffle.getAttribute("aria-busy"), "true");
    await page.waitForTimeout(1800);
    assert.equal(await shuffle.getAttribute("aria-busy"), "true", "a cold final result must remain pending beyond the old shuffle deadline");
    assert.notEqual(await currentPoster(page), "/poster-card-16-delivery.webp");
    releaseImage();
    await page.waitForFunction(() => document.querySelector(".poster-shuffle")?.getAttribute("aria-busy") === "false");
    assert.equal(await currentPoster(page), "/poster-card-16-delivery.webp");
    assert.equal(await page.locator(".world-stage-image-current").evaluate((image) => image.complete && image.naturalWidth > 0), true);
    console.log(`PASS ${engine} ${reducedMotion}: cold final selection waits, then displays decoded pixels`);
    await page.close();
  }

  for (const action of ["reset", "lock"]) {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce" });
    await page.addInitScript(() => Object.defineProperty(window.crypto, "getRandomValues", { value: (values) => values.fill(0) }));
    let releaseImage;
    const imageGate = new Promise((resolve) => { releaseImage = resolve; });
    await page.route("**/poster-card-*", async (route) => {
      // The speculative loader may request this before a click. Hold it
      // through cancellation so the result can only resolve afterwards.
      await imageGate;
      await route.continue().catch(() => undefined);
    });
    const shuffle = await readyShuffle(page);
    const firstPoster = await currentPoster(page);
    assert.match(firstPoster, /^\/deception-world-poster-delivery(?:-\d+)?\.webp$/);
    await shuffle.click();
    await page.waitForFunction(() => document.querySelector(".poster-shuffle")?.getAttribute("aria-busy") === "true");
    const control = page.locator(`.poster-${action}`);
    assert.equal(await control.isEnabled(), true, `${action} must remain available while loading`);
    await control.click();
    assert.equal(await shuffle.getAttribute("aria-busy"), "false");
    releaseImage();
    await page.waitForTimeout(2300);
    assert.equal(await currentPoster(page), firstPoster, "cancelled request changed the poster late");
    if (action === "lock") assert.equal(await control.getAttribute("aria-pressed"), "false");
    console.log(`PASS ${engine} ${action}: busy cleared immediately, late result ignored`);
    await page.close();
  }
} finally {
  await browser.close();
}
