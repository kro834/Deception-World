import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile } from "node:fs/promises";
import { chromium, request } from "playwright";

const base = process.env.BASE_URL || "http://127.0.0.1:8082";
const output = process.env.OUTPUT_DIR || "/private/tmp/extreme-artwork";
await mkdir(output, { recursive: true });
const provenance = JSON.parse(
  await readFile(new URL("../public/extreme-image-provenance.json", import.meta.url), "utf8"),
);
const delivery = await request.newContext();
try {
  for (const source of provenance.sources) {
    for (const asset of source.outputs) {
      const response = await delivery.get(base + asset.path);
      assert.equal(response.status(), 200);
      const bytes = await response.body();
      assert.equal(bytes.length, asset.bytes);
      assert.equal(createHash("sha256").update(bytes).digest("hex"), asset.sha256);
    }
  }
} finally {
  await delivery.dispose();
}

const browser = await chromium.launch({ channel: "chrome" });
try {
  for (const width of [390, 1440]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, hasTouch: true });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(base + "/extreme-saga", { waitUntil: "networkidle" });
    assert.equal(
      await page.locator('meta[property="og:image"]').getAttribute("content"),
      "/saga-extreme-middle-20261006.jpeg",
    );
    await page.waitForFunction(
      () =>
        document.querySelector('img[src="/saga-extreme-middle-20261006.webp"]')?.naturalWidth ===
        1023,
    );
    await page.locator("#stages").scrollIntoViewIfNeeded();
    for (const stage of ["middle", "ultra", "middle"]) {
      await page.locator(`#exs-stage-tab-${stage}`).click();
      const image = page.locator(`#exs-stage-panel figure[data-form="${stage}"] img`);
      await image.waitFor();
      const expected = provenance.sources.find((source) => source.id === stage);
      await page.waitForFunction(
        ({ stage, width, height }) => {
          const image = document.querySelector(`#exs-stage-panel figure[data-form="${stage}"] img`);
          return image?.naturalWidth === width && image?.naturalHeight === height;
        },
        { stage, width: expected.width, height: expected.height },
      );
      assert.equal(
        await image.getAttribute("src"),
        `/saga-extreme-${stage}-20261006.${stage === "middle" ? "webp" : "jpeg"}`,
      );
      // data-exo-cut deliberately remains set after the first change; the
      // finite 420ms image slash, not that marker, determines the settled art.
      await image.evaluate((node) =>
        Promise.all(
          node
            .getAnimations()
            .filter((animation) => animation.animationName === "exo-cut")
            .map((animation) => animation.finished),
        ),
      );
      await page.waitForTimeout(600);
      await page.screenshot({ path: `${output}/special-${width}-${stage}.png` });
    }
    await page.goto(base + "/riders/saga", { waitUntil: "networkidle" });
    const card = page.locator(".form-pickup").filter({
      has: page.locator('.form-pickup-visual > img[src="/saga-extreme-middle-20261006.jpeg"]'),
    });
    assert.equal(await card.count(), 1);
    await card.locator(".form-pickup-plus").click();
    const dialog = page.locator(".form-pickup-dialog[open]");
    await dialog.waitFor();
    const primary = dialog.locator(".form-pickup-layout > figure img");
    assert.equal(await primary.getAttribute("src"), "/saga-extreme-middle-20261006.jpeg");
    await primary.evaluate((node) => node.decode());
    await page.screenshot({ path: `${output}/pickup-${width}-primary.png` });
    for (const stage of ["middle", "ultra"]) {
      const asset = `/saga-extreme-${stage}-20261006.jpeg`;
      const image = dialog.locator(`.form-pickup-gallery img[src="${asset}"]`);
      await image.scrollIntoViewIfNeeded();
      await image.evaluate((node) => node.decode());
      const expected = provenance.sources.find((source) => source.id === stage);
      assert.deepEqual(await image.evaluate((node) => [node.naturalWidth, node.naturalHeight]), [
        expected.width,
        expected.height,
      ]);
      await page.screenshot({ path: `${output}/pickup-${width}-${stage}.png` });
    }
    await page.keyboard.press("Escape");
    await dialog.waitFor({ state: "hidden" });
    await page.locator(".side-panel-trigger").click();
    await page.locator('.side-panel-links a[href="/gallery"]').click();
    await page.waitForURL(base + "/gallery");
    await page.locator(".gallery-filters button").nth(1).click();
    assert.equal(
      await page.locator(".gallery-filters button").nth(1).getAttribute("aria-pressed"),
      "true",
    );
    assert.deepEqual(errors, []);
    console.log(
      `Chrome ${width}px: new Middle/Ultra art in special site, pickup dialogs, and menu-to-gallery navigation passed`,
    );
    await context.close();
  }
  console.log("All replacement image delivery hashes match the published provenance manifest");
} finally {
  await browser.close();
}
