import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium, webkit } from "playwright";

// Read-only against the server. Personal bookmark changes use an isolated
// browser context only; this never posts an image or edits a public title.
const base = process.env.BASE_URL || "http://127.0.0.1:8195";
const engine = process.env.QA_ENGINE === "webkit" ? "webkit" : "chromium";
const out = process.env.AUDIT_OUT || `output/playwright/record-discovery-${engine}`;
await mkdir(out, { recursive: true });
const browser = await (engine === "webkit"
  ? webkit.launch()
  : chromium.launch({ channel: "chrome" }));
const report = [];
const ready = (page) =>
  page.waitForFunction(() => {
    const root = document.documentElement;
    return (
      root.dataset.family &&
      !["data-loading", "data-route-cover", "data-route-scroll-settling"].some((key) =>
        root.hasAttribute(key),
      )
    );
  });
const settled = async (page) => {
  await ready(page);
  await page.evaluate(() => document.fonts.ready);
  // SSR already carries the family attribute. Wait for the shelf's existing
  // interactive readiness signal before exercising its hydrated draft state.
  if (await page.locator(".library-page").count()) {
    await page.locator(".library-card button:not([disabled])").first().waitFor();
  }
};
const shot = async (page, name) => {
  await page.evaluate(async () => {
    await Promise.all(
      [...document.images]
        .filter((image) => {
          const rect = image.getBoundingClientRect();
          return rect.height && rect.top < innerHeight && rect.bottom > 0;
        })
        .map((image) => image.decode().catch(() => {})),
    );
  });
  await page.screenshot({ path: `${out}/${name}.png` });
};

try {
  for (const viewport of [
    { width: 390, height: 844 },
    { width: 1024, height: 1366 },
  ]) {
    const context = await browser.newContext({ viewport, hasTouch: true });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`${base}/library?kind=person&guide=keepers#library-browser`);
    await settled(page);
    const input = page.locator("#library-search");
    await input.fill("ゼウス");
    const card = page
      .locator(".library-card")
      .filter({ has: page.locator('a[href^="/managers/zeus"]') });
    await card.waitFor();
    const cardId = await card.getAttribute("id");
    await card.locator("h3 a").click();
    await page.waitForURL("**/managers/zeus**");
    await settled(page);
    await page.goBack();
    await settled(page);
    assert.equal(await input.inputValue(), "ゼウス", "Back keeps the just-typed library query");
    assert.equal(new URL(page.url()).searchParams.get("kind"), "person");
    assert.equal(new URL(page.url()).searchParams.get("guide"), "keepers");
    await page.reload();
    await settled(page);
    assert.equal(await input.inputValue(), "ゼウス", "reload preserves the filtered shelf");
    assert.equal(await page.locator(".library-card").count(), 1);
    await card.locator("h3 a").click();
    await page.waitForURL("**/managers/zeus**");
    await settled(page);
    await page.locator(".record-return-navigation a").click();
    await page.waitForURL("**/library?**");
    await settled(page);
    await page.waitForFunction((id) => document.activeElement?.id === id, cardId);
    await page.waitForTimeout(650);
    assert.equal(
      await page.evaluate(() => document.activeElement?.id),
      cardId,
      "late effects retain return focus",
    );
    await shot(page, `${viewport.width}-library-return`);

    // Store and filter actual bookmarks in this isolated context, never a server.
    await page.goto(`${base}/library?kind=person#library-browser`);
    await settled(page);
    const firstCards = page.locator(".library-card");
    const savedIds = [];
    for (const index of [0, 1]) {
      const item = firstCards.nth(index);
      savedIds.push(await item.getAttribute("data-library-entry"));
      await item.getByRole("button", { name: /しおりを保存/ }).click();
    }
    await page
      .getByRole("group", { name: "探す資料の範囲" })
      .getByRole("button", { name: /しおりのみ/ })
      .click();
    await page.waitForURL("**scope=saved**");
    assert.equal(await page.locator(".library-card").count(), 2);
    await page
      .locator(".library-card")
      .first()
      .getByRole("button", { name: /しおりを解除/ })
      .click();
    await page.waitForFunction(() => document.querySelectorAll(".library-card").length === 1);
    assert.ok(
      await page.locator(".library-card").evaluate((node) => node.contains(document.activeElement)),
      "removing a saved card keeps keyboard focus on its neighbour",
    );
    await page.reload();
    await settled(page);
    assert.equal(new URL(page.url()).searchParams.get("scope"), "saved");
    await page.locator(".library-card").waitFor();
    assert.equal(await page.locator(".library-card").count(), 1);
    await shot(page, `${viewport.width}-saved-shelf`);

    await page.goto(`${base}/search?category=people`);
    await settled(page);
    const categories = page.getByRole("group", { name: "資料の分類" }).getByRole("button");
    await categories.last().focus();
    await page.keyboard.press("Tab");
    assert.ok(
      await page.evaluate(() =>
        document.activeElement?.matches(".search-result-card, .search-more-option"),
      ),
      "Tab from category controls reaches a result link",
    );
    const searchInput = page.locator("#record-query");
    await searchInput.fill("ゼウス");
    const result = page.locator('.search-result-card[href^="/managers/zeus"]').first();
    await result.waitFor();
    const resultId = await result.getAttribute("id");
    await result.click();
    await page.waitForURL("**/managers/zeus**");
    await settled(page);
    await page.locator(".record-return-navigation a").click();
    await page.waitForURL("**/search?**");
    await settled(page);
    assert.equal(await searchInput.inputValue(), "ゼウス");
    assert.equal(new URL(page.url()).searchParams.get("category"), "people");
    await page.waitForFunction((id) => document.activeElement?.id === id, resultId);
    await shot(page, `${viewport.width}-search-return`);

    // TanStack protects JSON-looking string queries with quotes in the URL.
    // The arrival observer must parse those exactly as the router does.
    if (viewport.width === 390) {
      await page.goto(`${base}/library?q=%222%22&kind=chapter#library-browser`);
      await settled(page);
      assert.equal(await input.inputValue(), "2");
      const numeric = page.locator(".library-card").first();
      const numericId = await numeric.getAttribute("id");
      await numeric.locator("h3 a").click();
      await page.waitForURL("**/dream-chapter**");
      await settled(page);
      await page.locator(".record-return-navigation a").click();
      await page.waitForURL("**/library?**");
      await settled(page);
      await page.waitForFunction((id) => document.activeElement?.id === id, numericId);
      assert.equal(await input.inputValue(), "2", "JSON-looking query roundtrip");
      await page.goto(`${base}/search?q=${encodeURIComponent("ゼウス")}&category=people`);
      await settled(page);
    }

    // Opening by pointer, then closing by keyboard is a mixed-input path.
    const trigger = page.getByRole("button", { name: "メニューを開く", exact: true });
    const before = await page.evaluate(() => scrollY);
    await trigger.click();
    await page.locator('.side-panel[data-open="true"]').waitFor();
    await page.waitForFunction(() =>
      document.querySelector('.side-panel[data-open="true"]')?.contains(document.activeElement),
    );
    await page.keyboard.press("Tab");
    assert.equal(
      await page.evaluate(() => document.activeElement?.classList.contains("side-panel-close")),
      true,
    );
    await page.keyboard.press("Enter");
    await page.waitForFunction(() => !document.documentElement.hasAttribute("data-side-menu-open"));
    await page.waitForFunction(
      () => document.activeElement?.getAttribute("aria-label") === "メニューを開く",
    );
    assert.ok(
      Math.abs((await page.evaluate(() => scrollY)) - before) < 2,
      "closing the menu keeps the page position",
    );
    assert.deepEqual(errors, [], "no browser JS error in the complete reading journey");
    report.push({
      engine,
      viewport,
      libraryBackAndReload: true,
      explicitCardReturn: true,
      savedFacet: true,
      keyboardResults: true,
      mixedInputMenu: true,
      savedIds,
      errors,
    });
    await context.close();
    console.log(
      `PASS ${engine}/${viewport.width}: library/search round trips, saved facet, keyboard, menu`,
    );
  }

  for (const viewport of [
    { width: 320, height: 640 },
    { width: 568, height: 320 },
    { width: 1440, height: 900 },
  ]) {
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    for (const path of [
      "/library?q=ゼウス&kind=person#library-browser",
      "/search?q=ゼウス",
      "/download",
      "/missing-record-discovery",
    ]) {
      const response = await page.goto(new URL(path, base).href);
      await settled(page);
      assert.ok(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
        `${viewport.width} ${path}: no horizontal overflow`,
      );
      if (path.startsWith("/missing")) {
        assert.equal(response.status(), 404);
        assert.equal(await page.locator(".recovery-tiles a").count(), 3);
        assert.equal(
          await page.locator(".app-not-found > a").count(),
          0,
          "no duplicate 404 actions",
        );
      }
      await shot(page, `${viewport.width}-${path.split(/[?#]/)[0].slice(1)}`);
    }
    await page.goto(`${base}/world#records`);
    await settled(page);
    await page.getByRole("button", { name: "メニューを開く", exact: true }).click();
    await page.locator('.side-panel[data-open="true"]').evaluate(async (node) => {
      await Promise.all(
        node
          .getAnimations()
          .filter(
            (animation) =>
              animation.playState === "running" &&
              animation.effect?.getComputedTiming().endTime !== Infinity,
          )
          .map((animation) => animation.finished.catch(() => {})),
      );
    });
    const row = page.locator('.side-panel-links > [aria-current="location"]').first();
    await row.waitFor();
    assert.ok(
      await row.evaluate((node) => {
        const rect = node.getBoundingClientRect();
        const panel = node.closest(".side-panel").getBoundingClientRect();
        const head = node
          .closest(".side-panel")
          .querySelector(".side-panel-head")
          .getBoundingClientRect();
        return rect.top >= head.bottom - 2 && rect.bottom <= panel.bottom + 1;
      }),
      "current chapter is visible even in short landscape",
    );
    await shot(page, `${viewport.width}-world-current-menu`);
    report.push({ engine, viewport, utilityLayouts: true, currentMenuRow: true });
    await context.close();
    console.log(`PASS ${engine}/${viewport.width}: layouts, 404/download, current-location menu`);
  }
  await writeFile(
    `${out}/report.json`,
    JSON.stringify({ base, engine, checks: report }, null, 2) + "\n",
  );
} finally {
  await browser.close();
}
