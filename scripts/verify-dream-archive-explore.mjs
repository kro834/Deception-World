import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium, webkit } from "playwright";

const base = process.env.BASE_URL || "http://127.0.0.1:8598";
const engineName = process.env.PW_ENGINE === "webkit" ? "webkit" : "chromium";
const engine = engineName === "webkit" ? webkit : chromium;
const browser = await engine.launch(engineName === "chromium" ? { channel: "chrome" } : {});
const output = new URL(`../output/playwright/dream-archive-explore/${engineName}/`, import.meta.url);
await mkdir(output, { recursive: true });

async function ready(page) {
  await page.waitForFunction(
    () =>
      document.documentElement.dataset.scrollMotionReady === "true" &&
      !document.documentElement.hasAttribute("data-route-scroll-settling"),
  );
  await page.evaluate(() => document.fonts.ready);
}

async function inspect(page) {
  return page.evaluate(() => ({
    hash: location.hash,
    overflow: document.documentElement.scrollWidth - innerWidth,
    atlas: (() => {
      const target = document.getElementById("dream-atlas-4");
      const rect = target.getBoundingClientRect();
      return {
        tag: target.tagName,
        left: rect.left,
        right: rect.right,
        top: rect.top,
        railLeft: target.closest(".dream-atlas-grid").scrollLeft,
      };
    })(),
  }));
}

try {
  for (const viewport of [
    { width: 320, height: 844 },
    { width: 390, height: 844 },
    { width: 1024, height: 768 },
    { width: 1440, height: 900 },
  ]) {
    const page = await browser.newPage({ viewport, reducedMotion: "reduce" });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`${base}/dream-chapter#atlas`);
    await ready(page);

    const atlasIndex = page.getByRole("navigation", { name: "舞台の索引" });
    assert.equal(await atlasIndex.getByRole("link").count(), 15);
    await atlasIndex.getByRole("link", { name: "博麗神社" }).click();
    await page.waitForFunction(() => location.hash === "#dream-atlas-4");
    const landing = await inspect(page);
    assert.equal(landing.atlas.tag, "ARTICLE", JSON.stringify(landing));
    assert.ok(landing.atlas.left >= -1, JSON.stringify(landing));
    assert.ok(landing.atlas.right <= viewport.width + 1, JSON.stringify(landing));
    assert.ok(landing.atlas.top >= 110 && landing.atlas.top < viewport.height, JSON.stringify(landing));
    assert.ok(landing.overflow <= 1, JSON.stringify(landing));
    if (viewport.width === 320 || viewport.width === 1440) {
      await page.screenshot({
        path: new URL(`${viewport.width}x${viewport.height}-atlas.png`, output).pathname,
      });
    }

    const relations = page.locator("#relations");
    const person = relations.getByRole("combobox", { name: "人物から繋がりを辿る" });
    await person.selectOption("シエル");
    assert.match(await relations.getByRole("status").textContent(), /7件/);
    assert.equal(await relations.locator("#dream-relations-circle-1 .dream-relations-tie").count(), 5);
    assert.equal(await relations.locator("#dream-relations-circle-2 .dream-relations-tie").count(), 2);
    await relations
      .getByRole("navigation", { name: "繋がりの索引" })
      .getByRole("link", { name: "幻想郷" })
      .click();
    const circle = relations.locator("#dream-relations-circle-2");
    await page.waitForFunction(() => {
      const target = document.getElementById("dream-relations-circle-2");
      const rect = target.getBoundingClientRect();
      return rect.top >= 100 && rect.top < innerHeight && rect.left >= 0 && rect.right <= innerWidth;
    });
    assert.equal(await circle.evaluate((node) => node.open), true);
    assert.equal(await page.evaluate(() => location.hash), "#dream-relations-circle-2");
    if (viewport.width === 390) {
      await page.waitForTimeout(350);
      await page.screenshot({
        path: new URL(`${viewport.width}x${viewport.height}-relations.png`, output).pathname,
      });
    }

    await circle.locator('a[href="#dream-arsenal-group-1"]').first().click();
    const arsenal = page.locator("#arsenal");
    const saga = arsenal.locator("#dream-arsenal-group-1");
    assert.equal(await page.evaluate(() => location.hash), "#dream-arsenal-group-1");
    assert.equal(await saga.evaluate((node) => node.open), true);
    assert.equal(await saga.locator("dt").count(), 17);

    const search = arsenal.getByRole("searchbox", {
      name: "武装・使い手・記録の言葉から探す",
    });
    await search.fill("アクシスレイカー");
    assert.match(await arsenal.getByRole("status").textContent(), /3件/);
    assert.equal(await saga.locator("dt").count(), 3);
    await arsenal
      .getByRole("navigation", { name: "武装の索引" })
      .getByRole("link", { name: "ドルミネンス" })
      .click();
    const dolminence = arsenal.locator("#dream-arsenal-group-7");
    assert.equal(await dolminence.evaluate((node) => node.open), true);
    assert.equal(await dolminence.locator("dt").count(), 0);
    assert.equal(
      await dolminence.getByRole("button", { name: "検索を解除して全件を見る" }).count(),
      1,
    );
    await dolminence.locator("summary").click();
    assert.equal(await dolminence.evaluate((node) => node.open), false);
    // A second visit to the same fragment must reopen the native fold.
    await arsenal
      .getByRole("navigation", { name: "武装の索引" })
      .getByRole("link", { name: "ドルミネンス" })
      .click();
    assert.equal(await dolminence.evaluate((node) => node.open), true);
    await dolminence.getByRole("button", { name: "検索を解除して全件を見る" }).click();
    assert.equal(await search.inputValue(), "");
    assert.equal(await page.evaluate(() => document.activeElement?.id), "dream-arsenal-search");
    // Owner (2026-10-23): 不要なセカンダリラベルを削除（レイアウトで説明）
    // Cleared, the status is silent again.
    assert.equal((await arsenal.getByRole("status").textContent()).trim(), "");

    await search.fill("存在しない武装XXXX");
    assert.match(await arsenal.getByRole("status").textContent(), /0件/);
    const clear = arsenal.locator(".dream-archive-no-results button");
    assert.equal(await clear.count(), 1);
    await clear.click();
    assert.equal(await search.inputValue(), "");
    assert.equal(await page.evaluate(() => document.activeElement?.id), "dream-arsenal-search");
    if (viewport.width === 1024) {
      await page.screenshot({
        path: new URL(`${viewport.width}x${viewport.height}-arsenal.png`, output).pathname,
      });
    }

    const layout = await page.evaluate(() => {
      const atlas = document.getElementById("atlas");
      return {
        overflow: document.documentElement.scrollWidth - innerWidth,
        atlasRows: getComputedStyle(atlas).gridTemplateRows,
      };
    });
    assert.ok(layout.overflow <= 1, JSON.stringify(layout));
    if (viewport.width === 1440) {
      assert.equal(layout.atlasRows.split(" ").length, 3, JSON.stringify(layout));
    }
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ engine: engineName, viewport, landing, layout, status: "PASS" }));
    await page.close();
  }
} finally {
  await browser.close();
}
