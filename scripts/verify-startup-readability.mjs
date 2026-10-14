import assert from "node:assert/strict";
import { chromium, webkit } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";

const base = process.env.BASE_URL ?? "http://127.0.0.1:8199";
const reference = process.env.BASE_REF_URL ?? "http://127.0.0.1:8171";
const output = process.env.STARTUP_OUTPUT ?? "output/playwright/startup-readability";
await mkdir(output, { recursive: true });
const results = [];
for (const engine of (process.env.STARTUP_ENGINES ?? "chromium,webkit").split(",")) {
  const browser = await (engine === "webkit" ? webkit : chromium).launch(
    engine === "webkit" ? {} : { channel: "chrome" },
  );
  try {
    for (const viewport of [
      { width: 320, height: 640 },
      { width: 390, height: 844 },
      { width: 844, height: 390 },
      { width: 1024, height: 768 },
      { width: 1440, height: 900 },
    ]) {
      const pair = [];
      for (const [label, url] of [
        ["reference", reference],
        ["candidate", base],
      ]) {
        const context = await browser.newContext({
          viewport,
          hasTouch: true,
          reducedMotion: "reduce",
        });
        const page = await context.newPage();
        const errors = [],
          failedFonts = [];
        page.on("pageerror", (error) => errors.push(error.message));
        page.on("response", (response) => {
          if (/fonts\.(googleapis|gstatic)\.com/.test(response.url()) && response.status() >= 400)
            failedFonts.push({ url: response.url(), status: response.status() });
        });
        await page.goto(url, { waitUntil: "domcontentloaded" });
        await page.locator(".cine-stage.is-complete").waitFor();
        await page.evaluate(() => document.fonts.ready);
        const sample = await page.evaluate(async () => {
          const loaded = await document.fonts.load('400 16px "Noto Sans JP"', "スキップもう一度");
          const labels = [];
          for (const button of document.querySelectorAll(".cine-btn,.cine-skip")) {
            const walker = document.createTreeWalker(button, NodeFilter.SHOW_TEXT);
            let text;
            while ((text = walker.nextNode())) {
              if (!text.textContent.trim()) continue;
              const range = document.createRange();
              range.selectNodeContents(text);
              const box = range.getBoundingClientRect(),
                parent = text.parentElement,
                style = getComputedStyle(parent);
              labels.push({
                text: text.textContent.trim(),
                width: box.width,
                height: box.height,
                font: style.fontFamily,
                size: style.fontSize,
                weight: style.fontWeight,
                spacing: style.letterSpacing,
              });
            }
          }
          return {
            labels,
            loadedFaces: loaded.length,
            overflow: document.documentElement.scrollWidth - innerWidth,
          };
        });
        assert.ok(
          sample.loadedFaces > 0,
          "Japanese font faces actually loaded, not a fallback-only success",
        );
        assert.ok(sample.overflow <= 1);
        assert.deepEqual(failedFonts, []);
        await page.screenshot({ path: `${output}/${engine}-${viewport.width}-${label}.png` });
        pair.push(sample);
        if (label === "candidate" && viewport.width === 390) {
          await page.getByRole("button", { name: "ディセプションワールドへ入る" }).tap();
          await page.waitForURL("**/world");
          await page.waitForFunction(
            () =>
              !document.documentElement.hasAttribute("data-loading") &&
              document.documentElement.dataset.worldPageVisible === "true",
          );
          await page.evaluate(() => document.fonts.ready);
          assert.equal(
            await page.locator('link[rel="stylesheet"][href*="styles-stage-shell-"]').count(),
            1,
          );
          // Root and World both declare the unchanged HUD subset; test the body-font URL, not their tag count.
          const bodyFonts = await page
            .locator('link[rel="stylesheet"][href*="fonts.googleapis.com/css2?family=Cinzel"]')
            .evaluateAll((links) =>
              links.map((link) => new URL(link.href).searchParams.get("text")),
            );
          assert.ok(bodyFonts.length > 0, "World retains its original body-font stylesheet");
          assert.ok(
            bodyFonts.every((text) => text === null),
            "World never retains the opening-only glyph subset",
          );
          await page.getByRole("button", { name: "メニューを開く" }).click();
          await page.locator('#site-side-panel[data-open="true"]').waitFor();
          await page.keyboard.press("Escape");
          await page.locator('#site-side-panel[data-open="true"]').waitFor({ state: "hidden" });
          await page.goBack();
          await page.waitForURL(new RegExp("/$"));
          await page.locator(".cine-stage.is-complete").waitFor();
        }
        assert.deepEqual(errors, []);
        await context.close();
      }
      assert.equal(pair[1].labels.length, pair[0].labels.length);
      for (let i = 0; i < pair[0].labels.length; i++) {
        const a = pair[0].labels[i],
          b = pair[1].labels[i];
        for (const key of ["text", "font", "size", "weight", "spacing"])
          assert.equal(b[key], a[key], `${engine} ${viewport.width} ${key}`);
        assert.ok(
          Math.abs(b.width - a.width) <= 1,
          `${engine} ${viewport.width} glyph width: ${a.text}: ${a.width} vs ${b.width}`,
        );
        assert.ok(Math.abs(b.height - a.height) <= 1);
      }
      results.push({ engine, viewport, unchangedTypography: true, overflow: 0 });
      console.log(JSON.stringify(results.at(-1)));
    }
  } finally {
    await browser.close();
  }
}
await writeFile(output + "/report.json", JSON.stringify(results, null, 2));
