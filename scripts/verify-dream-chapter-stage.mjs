import { chromium, webkit } from "playwright";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
const base = process.env.BASE || "http://127.0.0.1:8618";
const out = "output/playwright/dream-chapter-stage";
await mkdir(out, { recursive: true });
for (const [name, engine, width, height, touch] of [
  ["chrome-desktop", chromium, 1440, 900, false],
  ["webkit-phone", webkit, 390, 844, true],
  ["webkit-small", webkit, 320, 740, true],
  ["webkit-ipad", webkit, 1024, 768, true],
]) {
  const browser = await engine.launch(engine === chromium ? { channel: "chrome" } : {});
  try {
    const page = await browser.newPage({
      viewport: { width, height },
      hasTouch: touch,
      isMobile: touch,
    });
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.route("https://fonts.googleapis.com/**", (route) => route.abort());
    await page.goto(`${base}/dream-chapter`, { waitUntil: "domcontentloaded" });
    const stage = page.locator(".dream-chapter-stage");
    await stage.waitFor();
    await page.locator('.dream-programme-ticket[href="#dream-chapter-stage"]').click();
    await page.waitForFunction(() => location.hash === "#dream-chapter-stage");
    await stage.evaluate((el) => el.scrollIntoView({ block: "start", behavior: "instant" }));
    await page.waitForTimeout(800);
    const slider = stage.locator("input[type=range]");
    const next = stage.getByRole("button", { name: "次の章をプレビュー" });
    const prev = stage.getByRole("button", { name: "前の章をプレビュー" });
    assert.equal(await prev.isDisabled(), true);
    await next.click();
    assert.notEqual(
      await stage
        .locator(".dream-chapter-stage-sheet")
        .evaluate((el) => getComputedStyle(el).animationName),
      "none",
      "chapter switch animates",
    );
    await page.waitForTimeout(90);
    await page.screenshot({ path: `${out}/${name}-turn.png` });
    await page.waitForTimeout(650);
    assert.equal(await slider.inputValue(), "1");
    assert.equal(await stage.locator("h3").textContent(), "開く");
    await slider.focus();
    await page.keyboard.press("End");
    assert.equal(await slider.inputValue(), "5");
    assert.equal(await next.isDisabled(), true);
    await page.keyboard.press("Home");
    assert.equal(await slider.inputValue(), "0");
    if (touch) {
      const rail = await slider.boundingBox();
      await page.touchscreen.tap(rail.x + rail.width - 8, rail.y + rail.height / 2);
      assert.equal(await slider.inputValue(), "5", "touch can select last chapter");
    }
    await slider.fill("2");
    await slider.fill("4");
    await slider.fill("3");
    await page.waitForTimeout(650);
    assert.equal(await stage.locator("h3").textContent(), "明ける");
    assert.equal(await slider.inputValue(), "3", "rapid scrubbing settles on selected chapter");
    const bounds = await stage.boundingBox();
    assert(bounds && bounds.x >= -1 && bounds.x + bounds.width <= width + 1, "stage fits viewport");
    await stage.screenshot({ path: `${out}/${name}.png` });
    await stage.getByRole("link", { name: "この章を読む" }).click();
    await page.waitForFunction(() => document.querySelector("#dream-case-3")?.open === true);
    assert.equal(new URL(page.url()).hash, "#dream-case-3");
    await stage.evaluate((el) => el.scrollIntoView({ block: "start", behavior: "instant" }));
    await page.emulateMedia({ reducedMotion: "reduce" });
    await next.click();
    assert.equal(
      await stage
        .locator(".dream-chapter-stage-sheet")
        .evaluate((el) => getComputedStyle(el).animationName),
      "none",
    );
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.evaluate(() => {
      document.documentElement.dataset.worldEffects = "economy";
    });
    await prev.click();
    assert.equal(
      await stage
        .locator(".dream-chapter-stage-sheet")
        .evaluate((el) => getComputedStyle(el).animationName),
      "none",
    );
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ name, status: "PASS", errors }));
  } finally {
    await browser.close();
  }
}
