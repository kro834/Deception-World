import { chromium, webkit } from "playwright";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
const base = process.env.BASE || "http://127.0.0.1:8618";
const out = process.env.AUDIT_OUT || "output/playwright/dream-chapter-stage";
const matrix = [
  ["chrome-desktop", chromium, 1440, 1000, false],
  ["webkit-desktop", webkit, 1440, 1000, false],
  ["webkit-phone", webkit, 390, 844, true],
  ["webkit-small", webkit, 320, 740, true],
  ["webkit-ipad", webkit, 1024, 768, true],
  ["webkit-portrait", webkit, 768, 1024, true],
  ["webkit-landscape", webkit, 667, 375, true],
].filter(([name]) => !process.env.CASES || process.env.CASES.split(",").includes(name));
await mkdir(out, { recursive: true });
const report = [];
for (const [name, engine, width, height, touch] of matrix) {
  const browser = await engine.launch(engine === chromium ? { channel: "chrome" } : {});
  try {
    const page = await browser.newPage({
      viewport: { width, height },
      hasTouch: touch,
      isMobile: touch,
    });
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    if (process.env.LIVE_FONTS !== "1")
      await page.route("https://fonts.googleapis.com/**", (route) => route.abort());
    await page.goto(`${base}/dream-chapter`, { waitUntil: "domcontentloaded" });
    const stage = page.locator(".dream-chapter-stage");
    await stage.locator(".dream-chapter-stage-chapters").waitFor();
    await page.waitForTimeout(800);
    await page.locator('.dream-programme-ticket[href="#dream-chapter-stage"]').click();
    await page.waitForFunction(() => location.hash === "#dream-chapter-stage");
    await page.waitForFunction(
      () => {
        const stage = document.querySelector(".dream-chapter-stage");
        return (
          Math.abs(
            stage.getBoundingClientRect().top - parseFloat(getComputedStyle(stage).scrollMarginTop),
          ) < 4
        );
      },
      null,
      { timeout: 10000 },
    );
    const landing = await stage.evaluate((el) => ({
      top: el.getBoundingClientRect().top,
      nav: document.querySelector(".dream-chapter-nav").getBoundingClientRect().bottom,
    }));
    assert(
      landing.top >= landing.nav - 2 && landing.top < height - 44,
      `native landing ${JSON.stringify(landing)}`,
    );
    const slider = stage.getByRole("slider", { name: "章をめくる" });
    const next = stage.getByRole("button", { name: "次の章をプレビュー" });
    const prev = stage.getByRole("button", { name: "前の章をプレビュー" });
    const keys = stage.locator(".dream-chapter-stage-chapters button");
    const wings = stage.locator(".dream-chapter-stage-wings > span");
    assert.equal(await keys.count(), 6);
    assert.equal(await wings.count(), 6);
    assert.equal(await prev.isDisabled(), true);
    await next.click();
    await page.waitForFunction(
      () => document.querySelector(".dream-chapter-stage input").value === "1",
    );
    assert.notEqual(
      await wings.first().evaluate((el) => getComputedStyle(el).animationName),
      "none",
    );
    assert.equal(
      await stage
        .locator(".dream-chapter-stage-copy")
        .evaluate((el) => getComputedStyle(el).opacity),
      "1",
      "copy never fades while scenery turns",
    );
    await page.waitForTimeout(90);
    await page.screenshot({ path: `${out}/${name}-turn.png` });
    await page.waitForTimeout(850);
    assert.equal(
      await stage.evaluate(
        (el) =>
          [el, ...el.querySelectorAll("*")]
            .flatMap((node) => node.getAnimations())
            .filter((a) => a.playState === "running").length,
      ),
      0,
      "animation finishes, no idle animation",
    );
    assert.equal(await stage.locator("h3").textContent(), "開く");
    await slider.focus();
    await page.keyboard.press("End");
    assert.equal(await slider.inputValue(), "5");
    assert.equal(await next.isDisabled(), true);
    assert.equal(
      await slider.evaluate((el) => el === document.activeElement),
      true,
      "slider keeps focus during switch",
    );
    await page.keyboard.press("Home");
    assert.equal(await slider.inputValue(), "0");
    if (touch) {
      await slider.scrollIntoViewIfNeeded();
      const rail = await slider.boundingBox();
      await page.touchscreen.tap(rail.x + rail.width - 8, rail.y + rail.height / 2);
      await page.waitForFunction(
        () => document.querySelector(".dream-chapter-stage input").value === "5",
        null,
        { timeout: 3000 },
      );
      assert.equal(await slider.inputValue(), "5", "touch selects the last chapter");
    }
    for (let index = 0; index < 6; index++) {
      if (touch) await keys.nth(index).tap();
      else await keys.nth(index).click();
      assert.equal(await slider.inputValue(), String(index));
      assert.equal(
        await stage.locator(".dream-chapter-stage-enter").getAttribute("href"),
        `#dream-case-${index}`,
      );
      assert.equal(
        await stage.locator('.dream-chapter-stage-chapters [aria-pressed="true"]').count(),
        1,
      );
      assert.equal(await keys.nth(index).getAttribute("aria-pressed"), "true");
    }
    await slider.fill("2");
    await slider.fill("4");
    await slider.fill("3");
    await page.waitForTimeout(950);
    assert.equal(await stage.locator("h3").textContent(), "明ける");
    assert.equal(await slider.inputValue(), "3", "rapid scrubbing settles on selected chapter");
    const bounds = await stage.boundingBox();
    assert(bounds && bounds.x >= -1 && bounds.x + bounds.width <= width + 1, "stage fits viewport");
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1),
      false,
      "page does not overflow",
    );
    const hitboxes = await keys.evaluateAll((nodes) =>
      nodes.map((n) => ({
        width: n.getBoundingClientRect().width,
        height: n.getBoundingClientRect().height,
      })),
    );
    assert(
      hitboxes.every((b) => b.width >= 44 && b.height >= 44),
      "paper keys have usable touch targets",
    );
    if (width <= 700 && height >= 700) {
      const sightline = await stage.evaluate((el) => {
        const theatre = el.querySelector(".dream-chapter-stage-theatre").getBoundingClientRect();
        const controls = el.querySelector(".dream-chapter-stage-controls").getBoundingClientRect();
        const nav = document.querySelector(".dream-chapter-nav").getBoundingClientRect();
        return { span: controls.bottom - theatre.top, available: innerHeight - nav.bottom - 32 };
      });
      assert(
        sightline.span <= sightline.available,
        `scenery and controls fit together ${JSON.stringify(sightline)}`,
      );
    }
    await stage.evaluate((el) => el.scrollIntoView({ block: "start", behavior: "instant" }));
    await page.screenshot({ path: `${out}/${name}.png` });
    await stage.getByRole("link", { name: "この章を読む" }).click();
    await page.waitForFunction(() => document.querySelector("#dream-case-3")?.open === true);
    assert.equal(new URL(page.url()).hash, "#dream-case-3");
    await page.goBack();
    await page.waitForFunction(() => location.hash === "#dream-chapter-stage");
    assert.equal(await slider.inputValue(), "3", "return preserves preview selection");
    await page.emulateMedia({ reducedMotion: "reduce" });
    await next.click();
    assert.equal(await wings.first().evaluate((el) => getComputedStyle(el).animationName), "none");
    await page.emulateMedia({ reducedMotion: "no-preference" });
    for (const mode of ["economy", "static", "saver", "motion-off"]) {
      await page.evaluate((mode) => {
        if (mode === "motion-off") {
          delete document.documentElement.dataset.worldEffects;
          document.documentElement.dataset.motionEnabled = "false";
        } else document.documentElement.dataset.worldEffects = mode;
      }, mode);
      await keys.nth(2).click();
      await keys.nth(4).click();
      assert.equal(
        await wings.first().evaluate((el) => getComputedStyle(el).animationName),
        "none",
        mode,
      );
      assert.equal(
        await stage
          .locator(".dream-chapter-stage-door i")
          .first()
          .evaluate((el) => getComputedStyle(el).animationName),
        "none",
        mode,
      );
      assert.equal(await slider.inputValue(), "4", mode + " still selectable");
    }
    assert.deepEqual(errors, []);
    const result = { name, status: "PASS", landing, errors };
    report.push(result);
    console.log(JSON.stringify(result));
  } finally {
    await browser.close();
  }
}
await writeFile(`${out}/report.json`, JSON.stringify({ base, results: report }, null, 2));
