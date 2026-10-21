import assert from "node:assert/strict";
import { chromium, webkit } from "playwright";

const engine = process.env.PW_ENGINE === "webkit" ? webkit : chromium;
const browser = await engine.launch(engine === chromium ? { channel: "chrome" } : {});
const base = process.env.BASE_URL || "http://localhost:8082";
const ready = (page) =>
  page.waitForFunction(
    () =>
      document.documentElement.dataset.scrollMotionReady === "true" &&
      !document.documentElement.hasAttribute("data-route-scroll-settling"),
  );
const show = (locator) =>
  locator.evaluate((node) => node.scrollIntoView({ block: "center", behavior: "instant" }));
try {
  for (const viewport of [
    { width: 320, height: 740 },
    { width: 390, height: 844 },
    { width: 1024, height: 768 },
    { width: 1280, height: 960 },
  ]) {
    const page = await browser.newPage({ viewport, hasTouch: true });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`${base}/characters/dante`);
    await ready(page);
    assert.match(await page.title(), /ダンテ/);
    assert.equal(await page.locator("h1 .manager-display-name").textContent(), "ダンテ／ヴァルグ");
    assert.equal(await page.locator('[aria-label="ヴァルグの人物録"] > div').count(), 10);
    for (const name of ["原圧", "界外実体", "重勢", "不退", "深紅冠", "重相復元", "存在捕食", "認知追跡"])
      assert.equal(await page.getByRole("heading", { name, exact: true }).count(), 1);
    assert.equal(await page.locator(".manager-copy-section").count(), 17);
    const varg = page.locator(".varg-portrait img");
    await show(varg);
    await varg.evaluate((img) => img.decode());
    // Width-descriptor srcsets report density-corrected naturalWidth, not file pixels.
    assert.ok(await varg.evaluate((img) => img.naturalWidth > 0 && img.currentSrc.includes("character-varg-20261021")));
    assert.equal(await varg.evaluate((img) => getComputedStyle(img).objectFit), "contain");
    await page.screenshot({ path: `/tmp/varg-${process.env.PW_ENGINE || "chromium"}-${viewport.width}.png` });
    await page.waitForFunction(
      () => getComputedStyle(document.querySelector(".dante-entry-glitch")).opacity === "0",
    );
    assert.equal(
      await page
        .locator(".dante-entry-glitch")
        .evaluate((node) => getComputedStyle(node).pointerEvents),
      "none",
    );
    assert.ok(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
      "page horizontal overflow",
    );
    await page.screenshot({
      path: `/tmp/dante-${process.env.PW_ENGINE || "chromium"}-${viewport.width}.png`,
    });
    const portrait = page.locator(".manager-portrait-frame img");
    assert.ok(await portrait.evaluate((image) => image.complete && image.naturalWidth > 0));
    for (const [index, name] of ["ポラリス", "エニグマ"].entries()) {
      const open = page.getByRole("button", {
        name: new RegExp(`仮面ライダールーラー・${name}モードをピックアップ`),
      });
      await show(open);
      await open.locator(".ios-slide-open-thumb").tap();
      const dialog = page.locator("dialog[open]");
      await dialog.waitFor({ state: "visible" });
      assert.match(await dialog.textContent(), index ? /0.016秒／100m/ : /0.008秒／100m/);
      await dialog.locator(".form-pickup-layout img").evaluate((image) => image.decode());
      await page.screenshot({
        path: `/tmp/dante-${process.env.PW_ENGINE || "chromium"}-${viewport.width}-${index}.png`,
      });
      // Zeus is a viewport-fixed portal inside the top-layer dialog; measure
      // the content panel rather than including that floating control.
      const dimensions = await dialog.locator(".form-pickup-panel").evaluate((node) => ({
        width: node.clientWidth,
        scroll: node.scrollWidth,
      }));
      assert.ok(
        dimensions.scroll <= dimensions.width + 1,
        `dialog horizontal overflow: ${JSON.stringify(dimensions)}`,
      );
      await dialog.getByRole("button", { name: "閉じる", exact: true }).click();
      await dialog.waitFor({ state: "hidden" });
    }
    for (const selector of [".manager-back", ".dossier-index-return"]) {
      const back = page.locator(selector);
      await show(back);
      await back.click();
      await page.waitForURL("**/world#manager-archive-dogs");
      await ready(page);
      await page.waitForFunction(
        () => document.querySelector("#manager-tab-3")?.getAttribute("aria-selected") === "true",
      );
      assert.deepEqual(await page.locator('.manager-archive-tabs button b').allTextContents(), ["六詠", "管理外", "その他", "犬"]);
      await page.locator('#manager-tab-2').click();
      await page.locator('#manager-panel-2').waitFor();
      assert.equal(await page.locator('#manager-panel-2 a[href="/characters/terra"]').count(), 1);
      assert.equal(await page.locator('#manager-panel-2 a[href="/characters/dante"]').count(), 0);
      await page.locator('#manager-tab-3').click();
      await page.locator('#manager-panel-3').waitFor();
      const entry = page.getByRole("link", { name: "第二の犬 ダンテ／ヴァルグの人物資料を開く", exact: true });
      await show(entry);
      await entry.locator("img").evaluate((img) => img.decode());
      assert.ok(await entry.locator("img").evaluate((img) => img.currentSrc.includes("character-varg-20261021")));
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), "four-tab archive horizontal overflow");
      await page.screenshot({ path: `/tmp/dogs-fourth-${process.env.PW_ENGINE || "chromium"}-${viewport.width}.png` });
      await entry.click();
      await page.waitForURL("**/characters/dante#character-section-04");
      await ready(page);
    }
    await page.emulateMedia({ reducedMotion: "reduce" });
    assert.equal(
      await page.locator(".dante-entry-glitch").evaluate((node) => getComputedStyle(node).display),
      "none",
    );
    assert.deepEqual(errors, []);
    console.log(
      `${process.env.PW_ENGINE || "chromium"} ${viewport.width}: portrait, modes, navigation, overflow, reduced motion passed`,
    );
    await page.close();
  }
} finally {
  await browser.close();
}
