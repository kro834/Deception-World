import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium, webkit } from "playwright";
import { checkedOutputPath, checkedUrl } from "./browser-guard.mjs";

const base = checkedUrl(process.env.BASE_URL || "http://127.0.0.1:8082");
const output = process.env.AUDIT_OUT || "/tmp/other-artwork-audit";
const engine = process.env.PW_ENGINE || "chromium";
const browser = await (engine === "webkit" ? webkit : chromium).launch(
  engine === "webkit" ? undefined : { channel: "chrome" },
);
await mkdir(output, { recursive: true });

try {
  for (const [width, height] of [
    [390, 844],
    [1280, 960],
  ]) {
    const page = await browser.newPage({
      viewport: { width, height },
      hasTouch: true,
      isMobile: true,
    });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(new URL("/world#manager-archive-other", base).href);
    await page.locator("#manager-panel-2").waitFor();
    await page.waitForFunction(
      () => !document.documentElement.hasAttribute("data-route-scroll-settling"),
    );
    const panel = page.locator("#manager-panel-2");
    for (let i = 0; i < 2; i++) {
      await panel.evaluate((node) => node.scrollIntoView({ block: "center", behavior: "instant" }));
      await page.waitForTimeout(250);
    }
    assert.equal(await panel.locator(".other-array > *").count(), 6);
    assert.equal(await panel.locator('a[href="/characters/terra"]').count(), 1);
    assert.equal(await panel.locator('a[href="/characters/luna"]').count(), 1);
    assert.equal(await panel.locator(".archive-placeholder").count(), 2);
    for (const [id, name] of [
      ["haiku", "ハイク"],
      ["fable", "フェイブル"],
    ]) {
      const trigger = page.getByRole("button", { name: `${name}の画像を拡大`, exact: true });
      await trigger.locator("img").evaluate((img) => img.decode());
      assert.ok((await trigger.locator("img").getAttribute("src")).includes(`character-${id}-`));
      await trigger.click();
      const dialog = page.locator(`#other-artwork-${id}[open]`);
      await dialog.waitFor();
      await dialog.locator(".other-artwork-viewer > img").evaluate((img) => img.decode());
      const metrics = await dialog.locator(".other-artwork-viewer > img").evaluate((img) => ({
        fit: getComputedStyle(img).objectFit,
        ratio: img.getBoundingClientRect().width / img.getBoundingClientRect().height,
        originalRatio: img.naturalWidth / img.naturalHeight,
        right: img.getBoundingClientRect().right,
      }));
      assert.equal(metrics.fit, "contain");
      assert.ok(Math.abs(metrics.ratio - metrics.originalRatio) < 0.001);
      assert.ok(metrics.right <= width);
      assert.equal(
        await page.evaluate(() => getComputedStyle(document.documentElement).overflowY),
        "hidden",
      );
      await page.screenshot({
        path: checkedOutputPath(`${output}/${engine}-${width}-${id}.png`, [output]),
      });
      await page.getByRole("button", { name: `${name}の画像を閉じる`, exact: true }).click();
      await dialog.waitFor({ state: "detached" });
      assert.notEqual(
        await page.evaluate(() => getComputedStyle(document.documentElement).overflowY),
        "hidden",
      );

      // Native modal keyboard entry, Escape dismissal and focus restoration.
      // Chrome restores native modal focus after the React portal detaches.
      await page.evaluate(
        () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
      );
      await trigger.focus();
      await page.keyboard.press("Enter");
      await dialog.waitFor();
      await page.keyboard.press("Escape");
      await dialog.waitFor({ state: "detached" });
      assert.equal(await trigger.evaluate((node) => document.activeElement === node), true);
      // Backdrop dismissal uses a gutter outside the image panel.
      await trigger.click();
      await dialog.waitFor();
      await page.mouse.click(4, 100);
      await dialog.waitFor({ state: "detached" });
    }
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      true,
    );
    const startY = await page.evaluate(() => scrollY);
    await page.mouse.move(width - 8, height / 2);
    if (engine === "webkit") {
      // Mobile WebKit does not expose wheel/touch synthesis in Playwright.
      await page.evaluate(() => window.scrollBy({ top: 250, behavior: "instant" }));
    } else await page.mouse.wheel(0, 250);
    await page.waitForTimeout(300);
    assert.ok(
      await page.evaluate((before) => scrollY > before + 50, startY),
      "page scroll resumes after close",
    );
    await panel.evaluate((node) => node.scrollIntoView({ block: "center", behavior: "instant" }));
    await page.waitForTimeout(200);
    await page.screenshot({
      path: checkedOutputPath(`${output}/${engine}-${width}-cards.png`, [output]),
    });
    assert.deepEqual(errors, []);
    console.log(
      `${engine} ${width}x${height}: artwork, six slots, close/escape/backdrop, focus and scrolling PASS`,
    );
    await page.close();
  }
} finally {
  await browser.close();
}
