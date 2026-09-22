import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium, webkit } from "playwright";
import { REXONANCE_SITE_ARTWORK } from "../src/lib/rexonance-site-artwork.ts";
import { checkedOutputPath, checkedUrl } from "./browser-guard.mjs";

const base = checkedUrl(process.env.BASE_URL || "http://127.0.0.1:8082");
const output = process.env.AUDIT_OUT || "/tmp/rexonance-artwork-20260923";
const engine = process.env.PW_ENGINE || "chromium";
const browser = await (engine === "webkit" ? webkit : chromium).launch(
  engine === "webkit" ? undefined : { channel: "chrome" },
);
await mkdir(output, { recursive: true });

async function verifyImage(image, source) {
  await image.evaluate((node) => node.decode());
  const rendered = await image.evaluate((node) => ({
    source: node.getAttribute("src"),
    current: new URL(node.currentSrc).pathname,
    width: node.naturalWidth,
    height: node.naturalHeight,
  }));
  assert.equal(rendered.source, source);
  assert.ok(rendered.current.startsWith(source.replace(/\.webp$/, "-delivery-")), rendered.current);
  // naturalWidth is density-corrected for a width-descriptor srcset.
  assert.match(rendered.current, /-delivery-(640|960|1086)\.webp$/);
  assert.ok(rendered.width > 0);
  assert.ok(Math.abs(rendered.width / rendered.height - 0.75) < 0.001);
  return rendered;
}

try {
  for (const [width, height] of [
    [390, 844],
    [1280, 960],
  ]) {
    const page = await browser.newPage({
      viewport: { width, height },
      hasTouch: true,
      isMobile: true,
      deviceScaleFactor: width < 768 ? 3 : 2,
    });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(new URL("/rexonance-saga", base).href);
    await page.locator('.rxs-stage-tabs[data-liquid-initialized="true"]').waitFor();
    const hero = page.locator(".rxs-hero-visual img");
    await verifyImage(hero, REXONANCE_SITE_ARTWORK.standard);
    assert.equal(
      await page.locator('meta[property="og:image"]').getAttribute("content"),
      REXONANCE_SITE_ARTWORK.standard,
    );
    const preload = page.locator(
      `link[rel="preload"][as="image"][href="${REXONANCE_SITE_ARTWORK.standard}"]`,
    );
    assert.equal(await preload.getAttribute("href"), REXONANCE_SITE_ARTWORK.standard);
    assert.equal(await preload.getAttribute("imagesrcset"), await hero.getAttribute("srcset"));
    assert.equal(
      await page.evaluate(
        (source) =>
          performance
            .getEntriesByType("resource")
            .filter((entry) => new URL(entry.name).pathname === source).length,
        REXONANCE_SITE_ARTWORK.standard,
      ),
      0,
      "no duplicate full-size hero download",
    );
    await page.screenshot({
      path: checkedOutputPath(`${output}/${engine}-${width}-hero.png`, [output]),
    });

    for (const [stage, source] of Object.entries(REXONANCE_SITE_ARTWORK)) {
      const tab = page.locator(`#rxs-stage-tab-${stage}`);
      await tab.tap();
      await page.waitForFunction(
        (value) => document.querySelector(".rxs-stage-tabs")?.getAttribute("data-stage") === value,
        stage,
      );
      const panel = page.locator(".rxs-stage-panel");
      await panel.scrollIntoViewIfNeeded();
      const image = panel.locator("img");
      await page.waitForFunction(
        (value) => document.querySelector(".rxs-stage-panel img")?.getAttribute("src") === value,
        source,
      );
      const rendered = await verifyImage(image, source);
      assert.equal(await tab.getAttribute("aria-selected"), "true");
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      // Capture the settled view, not the existing stage-reveal animation's first frame.
      await panel.evaluate((node) =>
        Promise.all(
          node
            .getAnimations({ subtree: true })
            .filter((animation) => animation.effect?.getTiming().iterations !== Infinity)
            .map((animation) => animation.finished.catch(() => {})),
        ),
      );
      await panel.screenshot({
        path: checkedOutputPath(`${output}/${engine}-${width}-${stage}.png`, [output]),
      });
      console.log(`${engine} ${width} ${stage}: ${rendered.current} PASS`);
    }
    assert.deepEqual(errors, []);
    await page.close();
  }
} finally {
  await browser.close();
}
