import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium, webkit } from "playwright";
import { GALLERY_ARTWORKS } from "../src/components/gallery/gallery-data.ts";

const base = process.env.BASE_URL ?? "http://127.0.0.1:4413";
const output = process.env.OUTPUT_DIR ?? "output/playwright/gallery-viewer-polish";
const work = GALLERY_ARTWORKS[0];
const results = [];
await mkdir(output, { recursive: true });

for (const engine of ["chromium", "webkit"]) {
  const browser = await (engine === "webkit"
    ? webkit.launch()
    : chromium.launch({ channel: "chrome" }));
  try {
    for (const width of [320, 834]) {
      const context = await browser.newContext({
        viewport: { width, height: 844 },
        hasTouch: true,
      });
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.goto(`${base}/gallery`, { waitUntil: "networkidle" });
      const opener = page.locator(`[data-gallery-artwork="${work.id}"] .gallery-work-open`);
      await opener.scrollIntoViewIfNeeded();
      await opener.focus();
      const readingPosition = await page.evaluate(() => scrollY);
      await page.keyboard.press("Enter");
      const dialog = page.locator(".gallery-viewer[open]");
      const image = dialog.locator(".gallery-image-full");
      const viewport = dialog.locator(".gallery-image-viewport");
      await page.waitForFunction(() =>
        document.querySelector('.gallery-image-full[data-ready="true"]'),
      );
      // Wait for the dialog entrance to settle before measuring touch targets.
      await page.getByRole("button", { name: "2倍で鑑賞", exact: true }).click({ trial: true });
      assert.equal(await image.getAttribute("src"), work.full, "original artwork source changed");
      assert.equal(await image.evaluate((node) => getComputedStyle(node).objectFit), "contain");
      assert.ok(await dialog.evaluate((node) => node.scrollWidth <= node.clientWidth + 1));
      const toolbarTarget = await dialog
        .locator(".gallery-image-toolbar button")
        .evaluate((node) => {
          const box = node.getBoundingClientRect();
          return {
            width: box.width,
            height: box.height,
            right: box.right,
            viewportWidth: innerWidth,
          };
        });
      await page.screenshot({ path: `${output}/${engine}-${width}-fit.png` });
      assert.ok(
        toolbarTarget.width >= 44 &&
          toolbarTarget.height >= 44 &&
          toolbarTarget.right <= toolbarTarget.viewportWidth,
        `zoom target is clipped or too small: ${JSON.stringify(toolbarTarget)}`,
      );
      await page.getByRole("button", { name: "2倍で鑑賞", exact: true }).click();
      assert.ok(await viewport.evaluate((node) => document.activeElement === node));
      const title = await dialog.locator("h2").innerText();
      const before = await viewport.evaluate((node) => node.scrollLeft);
      await page.keyboard.press("ArrowRight");
      assert.ok(await viewport.evaluate((node) => node.scrollLeft > 0));
      assert.ok((await viewport.evaluate((node) => node.scrollLeft)) > before, "arrow did not pan");
      assert.equal(await dialog.locator("h2").innerText(), title, "zoom arrow navigated away");
      assert.match(
        await viewport.evaluate((node) => getComputedStyle(node).touchAction),
        /pinch-zoom|manipulation/,
      );
      const artworkPoint = () =>
        viewport.evaluate(
          (node, artwork) => {
            const scale = Math.min(
              node.scrollWidth / artwork.width,
              node.scrollHeight / artwork.height,
            );
            const imageWidth = artwork.width * scale;
            const imageHeight = artwork.height * scale;
            return {
              x:
                (node.scrollLeft + node.clientWidth / 2 - (node.scrollWidth - imageWidth) / 2) /
                imageWidth,
              y:
                (node.scrollTop + node.clientHeight / 2 - (node.scrollHeight - imageHeight) / 2) /
                imageHeight,
            };
          },
          { width: work.width, height: work.height },
        );
      const beforeResize = await artworkPoint();
      await page.setViewportSize({ width: 844, height: width });
      await page.waitForTimeout(120);
      const afterResize = await artworkPoint();
      assert.ok(
        Math.abs(beforeResize.x - afterResize.x) < 0.02 &&
          Math.abs(beforeResize.y - afterResize.y) < 0.02,
        `rotation lost the viewed artwork point: ${JSON.stringify({ beforeResize, afterResize })}`,
      );
      await page.setViewportSize({ width, height: 844 });
      await page.getByRole("button", { name: "全体を表示", exact: true }).click();
      assert.ok(
        await dialog
          .locator(".gallery-image-toolbar button")
          .evaluate((node) => node === document.activeElement),
      );
      await page.screenshot({ path: `${output}/${engine}-${width}-viewer.png` });
      await page.getByRole("button", { name: "閉じる", exact: true }).click();
      await page.waitForFunction(() => !document.body.hasAttribute("data-gallery-viewer-lock"));
      assert.ok(await opener.evaluate((node) => node === document.activeElement));
      assert.ok(Math.abs((await page.evaluate(() => scrollY)) - readingPosition) <= 2);
      assert.deepEqual(errors, []);
      await context.close();

      for (const fallback of [false, true]) {
        const recovery = await browser.newContext({ viewport: { width, height: 844 } });
        const recoveryPage = await recovery.newPage();
        let succeed = false;
        let release;
        let gate;
        await recoveryPage.route("**/gallery/**", async (route) => {
          const url = new URL(route.request().url());
          if (url.pathname !== work.full && url.pathname !== work.medium) return route.continue();
          if (url.searchParams.has("retry") && gate) await gate;
          if (succeed || (fallback && url.pathname === work.medium)) return route.continue();
          return route.abort();
        });
        await recoveryPage.goto(`${base}/gallery`, { waitUntil: "networkidle" });
        await recoveryPage
          .locator(`[data-gallery-artwork="${work.id}"] .gallery-work-open`)
          .click();
        const retry = recoveryPage.getByRole("button", {
          name: fallback ? "高画質を再読み込み" : "再読み込み",
          exact: true,
        });
        await retry.waitFor();
        if (!fallback) {
          // A second failure must return focus to the newly rendered retry control.
          gate = new Promise((resolve) => {
            release = resolve;
          });
          await retry.click();
          assert.ok(
            await recoveryPage
              .locator(".gallery-image-viewport")
              .evaluate((node) => node === document.activeElement),
          );
          release();
          await retry.waitFor();
          assert.ok(await retry.evaluate((node) => node === document.activeElement));
        }
        gate = new Promise((resolve) => {
          release = resolve;
        });
        succeed = true;
        await retry.click();
        assert.ok(
          await recoveryPage
            .locator(".gallery-image-viewport")
            .evaluate((node) => node === document.activeElement),
        );
        if (fallback) {
          assert.ok(
            await recoveryPage.locator('.gallery-image-preview[data-ready="true"]').isVisible(),
          );
          // Waiting does not grant permission to steal focus from a new action.
          await recoveryPage.keyboard.press("Tab");
          await recoveryPage.evaluate(() => {
            window.galleryRetryFocusTarget = document.activeElement;
          });
        }
        release();
        await recoveryPage.waitForFunction(() =>
          document.querySelector('.gallery-image-full[data-ready="true"]'),
        );
        if (fallback) {
          assert.ok(
            await recoveryPage.evaluate(
              () => document.activeElement === window.galleryRetryFocusTarget,
            ),
          );
        } else {
          assert.ok(
            await recoveryPage
              .getByRole("button", { name: "2倍で鑑賞", exact: true })
              .evaluate((node) => node === document.activeElement),
          );
        }
        await recovery.close();
      }
      results.push({
        engine,
        width,
        passed: true,
        checks: [
          "fit",
          "zoom-pan",
          "resize",
          "pinch-contract",
          "close-focus",
          "retry-error-focus",
          "retry-success-focus",
          "retry-tab-priority",
        ],
      });
      console.log(`${engine} ${width}px: viewer and retry focus passed`);
    }
  } finally {
    await browser.close();
  }
}
await writeFile(`${output}/results.json`, `${JSON.stringify(results, null, 2)}\n`);
