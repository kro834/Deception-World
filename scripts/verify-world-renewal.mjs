// BASE_URL=http://127.0.0.1:8195 node scripts/verify-world-renewal.mjs
// Browser smoke test for deterministic frames, graph layout, navigation and settings.
import assert from "node:assert/strict";
import { chromium, webkit } from "playwright";
const base = process.env.BASE_URL || "http://127.0.0.1:8194";
const browser = await chromium.launch({ channel: process.env.PW_BROWSER_CHANNEL || "chrome" });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  for (const rider of ["rexonance", "far-from", "illusionculum", "meta-unitas"]) {
    await page.goto(`${base}/transformation-lab?rider=${rider}&at=0.7`);
    await page.waitForFunction(
      () => document.querySelector(".lab-engine")?.dataset.rznDrawnAt === "0.7",
      null,
      { timeout: 60000 },
    );
    const canvas = page.locator(".rzn-canvas");
    const frame = () => canvas.evaluate((element) => element.toDataURL());
    const original = await frame();
    await page.getByRole("slider", { name: "変身の進行" }).fill("0.3");
    await page.waitForFunction(
      () => document.querySelector(".lab-engine")?.dataset.rznDrawnAt === "0.3",
    );
    await page.getByRole("slider", { name: "変身の進行" }).fill("0.7");
    await page.waitForFunction(
      () => document.querySelector(".lab-engine")?.dataset.rznDrawnAt === "0.7",
    );
    assert.equal(await frame(), original, `${rider}: frame differs after reversing`);
  }
  await page.goto(`${base}/world-map`);
  await page.waitForTimeout(1500);
  const overlaps = await page.locator(".wm-canvas svg").evaluate((svg) => {
    const nodes = [...svg.querySelectorAll(".wm-node")].map((node) => ({
      name: node.getAttribute("aria-label"),
      rect: node.getBoundingClientRect(),
    }));
    const result = [];
    for (let i = 0; i < nodes.length; i++)
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i].rect,
          b = nodes[j].rect;
        if (a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top)
          result.push([nodes[i].name, nodes[j].name]);
      }
    return result;
  });
  assert.deepEqual(overlaps, [], "default graph labels overlap");
  await page.goto(`${base}/world-map?source=${encodeURIComponent("/characters/ciel")}`);
  await page.waitForTimeout(1500);
  assert.equal(await page.locator("aside h2").innerText(), "シエル");
  await page.getByRole("button", { name: "人物 ベル・アレイン" }).click();
  await page.waitForTimeout(300);
  assert.equal(await page.locator("aside h2").innerText(), "ベル・アレイン");
  await page.reload();
  await page.waitForTimeout(500);
  assert.equal(await page.locator("aside h2").innerText(), "ベル・アレイン");
  await page.getByRole("button", { name: "メニューを開く" }).click();
  const menu = page.getByRole("dialog", { name: "サイトメニュー" });
  await menu
    .getByRole("link", { name: /世界関係図/ })
    .first()
    .waitFor();
  assert.ok(await menu.getByRole("link", { name: /世界関係図/ }).count());
  assert.ok(await menu.getByRole("link", { name: /変身・フォーム研究室/ }).count());
  await menu.getByRole("button", { name: "軽量", exact: true }).click();
  await page.waitForTimeout(1500);
  assert.equal(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem("deception-world:render-quality:v1") || "{}").quality,
    ),
    "lightweight",
  );
  assert.equal(await page.evaluate(() => document.documentElement.dataset.worldEffects), "economy");
  const reduced = await browser.newPage({
    reducedMotion: "reduce",
    viewport: { width: 390, height: 844 },
  });
  await reduced.goto(`${base}/transformation-lab?rider=far-from&form=ultra`);
  await reduced.locator(".lab-static").waitFor({ timeout: 30000 });
  assert.ok(
    await reduced
      .locator(".lab-static")
      .evaluate((image) => image.complete && image.naturalWidth > 0),
  );
  await reduced.close();
  assert.deepEqual(errors, [], "browser page errors");
  console.log(
    "Chrome: 4 deterministic frames, graph, source navigation, menu, quality and reduced motion passed",
  );
} finally {
  await browser.close();
}
const webkitBrowser = await webkit.launch();
try {
  const page = await webkitBrowser.newPage({
    viewport: { width: 768, height: 1024 },
    isMobile: true,
    hasTouch: true,
  });
  for (const route of ["/world-map", "/transformation-lab"]) {
    await page.goto(base + route);
    await page.waitForTimeout(1000);
    for (const [width, height] of [
      [768, 1024],
      [1024, 768],
      [768, 1024],
    ]) {
      await page.setViewportSize({ width, height });
      assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth),
        width,
        `${route}: horizontal overflow at ${width}`,
      );
    }
  }
  await page.setViewportSize({ width: 844, height: 390 });
  for (const route of ["/world-map", "/transformation-lab"]) {
    await page.goto(base + route);
    await page.waitForTimeout(1500);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 844);
    await page.getByRole("button", { name: "メニューを開く" }).click();
    await page.getByRole("button", { name: "メニューを閉じる" }).click();
    if (route === "/world-map") {
      await page.getByRole("button", { name: "拡大", exact: true }).click();
      assert.ok(await page.getByRole("status").filter({ hasText: "115%" }).count());
    } else {
      const slider = page.getByRole("slider", { name: "変身の進行" });
      await slider.fill("0.5");
      assert.equal(await slider.inputValue(), "0.5");
      await page.getByRole("button", { name: "完成", exact: true }).click();
      assert.equal(await slider.inputValue(), "1");
    }
  }
  console.log("WebKit: iPad portrait, landscape and return passed");
} finally {
  await webkitBrowser.close();
}
