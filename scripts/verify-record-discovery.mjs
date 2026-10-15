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
let activePage;
const prepareContext = (context) => {
  context.setDefaultTimeout(20_000);
  context.setDefaultNavigationTimeout(45_000);
};
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
  await page.evaluate(() =>
    Promise.race([document.fonts.ready, new Promise((resolve) => setTimeout(resolve, 5000))]),
  );
  // SSR already carries the family attribute. Wait for the shelf's existing
  // interactive readiness signal before exercising its hydrated draft state.
  if (await page.locator(".library-page").count()) {
    await page.locator(".library-card button:not([disabled])").first().waitFor();
    await page.waitForFunction(() => document.documentElement.dataset.worldPageVisible === "true");
  } else if (new URL(page.url()).pathname === "/world") {
    await page.waitForFunction(() => document.documentElement.dataset.worldPageVisible === "true");
  }
  // Hydration may start the hash landing after SSR's first readiness check.
  await ready(page);
};
const shot = async (page, name) => {
  await page.evaluate(async () => {
    await Promise.all(
      [...document.images]
        .filter((image) => {
          const rect = image.getBoundingClientRect();
          return image.complete && rect.height && rect.top < innerHeight && rect.bottom > 0;
        })
        .map((image) =>
          Promise.race([
            image.decode().catch(() => {}),
            new Promise((resolve) => setTimeout(resolve, 1500)),
          ]),
        ),
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
    prepareContext(context);
    const page = await context.newPage();
    activePage = page;
    console.log(`CHECK ${engine}/${viewport.width}: library journey`);
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
    console.log(`CHECK ${engine}/${viewport.width}: saved shelf`);
    await page.goto(`${base}/library?kind=person#library-browser`);
    await settled(page);
    const firstCards = page.locator(".library-card");
    const savedIds = [];
    for (const index of [0, 1]) {
      const item = firstCards.nth(index);
      savedIds.push(await item.getAttribute("data-library-entry"));
      await item.getByRole("button", { name: /しおりを保存/ }).tap();
    }
    await page
      .getByRole("group", { name: "探す資料の範囲" })
      .getByRole("button", { name: /しおりのみ/ })
      .tap();
    await page.waitForURL("**scope=saved**");
    assert.equal(await page.locator(".library-card").count(), 2);
    // Repeat using a mouse after real touch: WebKit must not move the target
    // between pointerdown and click in either input mode.
    await page
      .getByRole("group", { name: "探す資料の範囲" })
      .getByRole("button", { name: /^すべての資料/ })
      .click();
    await page.waitForURL((url) => !url.searchParams.has("scope"));
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
      .tap();
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

    console.log(`CHECK ${engine}/${viewport.width}: search journey`);
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
      for (const rawQuery of ["%222%22", "2"]) {
        await page.goto(`${base}/library?q=${rawQuery}&kind=chapter#library-browser`);
        await settled(page);
        assert.equal(await input.inputValue(), "2");
        const numeric = page.locator(".library-card").first();
        const numericId = await numeric.getAttribute("id");
        await numeric.locator("h3 a").click();
        await page.waitForURL("**/dream-chapter**");
        await settled(page);
        if (rawQuery === "2") await page.goBack();
        else await page.locator(".record-return-navigation a").click();
        await page.waitForURL("**/library?**");
        await settled(page);
        await page.waitForFunction((id) => document.activeElement?.id === id, numericId);
        assert.equal(await input.inputValue(), "2", "JSON-looking query roundtrip");
      }
      await page.goto(`${base}/search?q=${encodeURIComponent("ゼウス")}&category=people`);
      await settled(page);
    }

    // Opening by pointer, then closing by keyboard is a mixed-input path.
    const trigger = page.getByRole("button", { name: "メニューを開く", exact: true });
    const triggerBounds = await trigger.boundingBox();
    assert.ok(
      triggerBounds &&
        triggerBounds.y >= 0 &&
        triggerBounds.y + triggerBounds.height <= viewport.height,
      "the sticky menu opener is already visible without scrolling",
    );
    const point = {
      x: triggerBounds.x + triggerBounds.width / 2,
      y: triggerBounds.y + triggerBounds.height / 2,
    };
    assert.ok(
      await trigger.evaluate(
        (node, point) => node.contains(document.elementFromPoint(point.x, point.y)),
        point,
      ),
      "the visible opener receives the pointer",
    );
    const before = await page.evaluate(() => scrollY);
    // WebKit's locator scrollIntoViewIfNeeded moves an already-visible sticky
    // opener by 83px before pointerdown. Use its measured visible position,
    // matching a real mouse press, rather than attributing that move to menu close.
    await page.mouse.click(point.x, point.y);
    await page.locator('.side-panel[data-open="true"]').waitFor();
    await page.waitForFunction(() =>
      document.querySelector('.side-panel[data-open="true"]')?.contains(document.activeElement),
    );
    const openedOffset = await page.evaluate(() => scrollY);
    // macOS WebKit uses Option-Tab to include native buttons in its tab order.
    await page.keyboard.press(engine === "webkit" ? "Alt+Tab" : "Tab");
    assert.equal(
      await page.evaluate(() => document.activeElement?.classList.contains("side-panel-close")),
      true,
    );
    await page.keyboard.press("Enter");
    await page.waitForFunction(() => !document.documentElement.hasAttribute("data-side-menu-open"));
    await page.waitForFunction(
      () => document.activeElement?.getAttribute("aria-label") === "メニューを開く",
    );
    const closedOffset = await page.evaluate(() => scrollY);
    assert.ok(
      Math.abs(closedOffset - before) < 2,
      `closing the menu keeps the page position (${before} → ${openedOffset} → ${closedOffset})`,
    );
    assert.deepEqual(errors, [], "no browser JS error in the complete reading journey");
    report.push({
      engine,
      viewport,
      libraryBackAndReload: true,
      explicitCardReturn: true,
      savedFacet: true,
      savedFacetTouchAndMouse: true,
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
    prepareContext(context);
    const page = await context.newPage();
    activePage = page;
    for (const path of [
      "/library?q=ゼウス&kind=person#library-browser",
      "/search?q=ゼウス",
      "/download",
      "/missing-record-discovery",
    ]) {
      console.log(`CHECK ${engine}/${viewport.width}: ${path}`);
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
    await page.waitForFunction(() => {
      const panel = document.querySelector('.side-panel[data-open="true"]');
      if (!panel) return false;
      const rect = panel.getBoundingClientRect();
      return rect.left >= -1 && rect.right <= innerWidth + 1;
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
} catch (error) {
  if (activePage && !activePage.isClosed()) {
    console.error(
      "Failure state:",
      await activePage.evaluate(() => ({
        url: location.href,
        active: document.activeElement?.outerHTML.slice(0, 500),
        scope: Array.from(document.querySelectorAll(".library-scope-row button")).map((node) => ({
          text: node.textContent,
          pressed: node.getAttribute("aria-pressed"),
        })),
        errors: document.querySelector(".library-browse-error")?.textContent,
        attributes: Array.from(document.documentElement.attributes, (item) => [
          item.name,
          item.value,
        ]),
      })),
    );
    await activePage.screenshot({ path: `${out}/failure.png` }).catch(() => {});
  }
  throw error;
} finally {
  await browser.close();
}
