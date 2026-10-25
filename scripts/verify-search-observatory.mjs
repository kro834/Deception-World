import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium, webkit } from "playwright";

const base = process.env.BASE_URL || "http://127.0.0.1:8289";
const engine = process.env.PW_ENGINE || "chromium";
assert.ok(["chromium", "webkit"].includes(engine));
const out = `output/playwright/astra-search-${engine}`;
await mkdir(out, { recursive: true });
const browser = await (engine === "webkit"
  ? webkit.launch()
  : chromium.launch({ channel: "chrome" }));
const report = [];

async function ready(page, path) {
  await page.goto(new URL(path, base).href);
  await page.waitForFunction(() => document.documentElement.dataset.worldPageVisible === "true");
  await page.waitForFunction(
    () =>
      !["data-loading", "data-route-cover", "data-route-scroll-settling"].some((key) =>
        document.documentElement.hasAttribute(key),
      ),
  );
  await page.evaluate(() => document.fonts.ready);
}

async function overflow(page) {
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth - innerWidth),
    0,
    "the viewport has no horizontal overflow",
  );
}

try {
  for (const width of [320, 390, 834, 1440]) {
    const page = await browser.newPage({
      viewport: { width, height: 900 },
      reducedMotion: "reduce",
    });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await ready(page, "/search");
    await page.locator(".search-observatory").waitFor();
    const categories = page.locator(".search-categories button");
    assert.equal(await categories.count(), 8);
    assert.equal(
      await categories.evaluateAll((buttons) =>
        buttons.every((button) => {
          const box = button.getBoundingClientRect();
          return box.left >= 0 && box.right <= innerWidth && box.height >= 44;
        }),
      ),
      true,
      "all eight browse classifications fit the page and remain tappable",
    );
    await overflow(page);
    await page.screenshot({ path: `${out}/${width}-browse.png` });

    // Jumping changes the reading position and focus, never the search state.
    const jumps = page.locator(".search-section-nav a");
    assert.ok((await jumps.count()) > 1);
    const destination = await jumps.last().getAttribute("href");
    assert.ok(destination.startsWith("#"), "section controls retain a native fragment href");
    const beforeJump = page.url();
    await jumps.last().click();
    assert.equal(page.url(), beforeJump);
    assert.equal(await page.evaluate(() => document.activeElement?.id), destination.slice(1));
    const focused = await page.evaluate(() => document.activeElement.getBoundingClientRect().top);
    assert.ok(
      focused >= 0 && focused < 250,
      "the selected category heading is visible below the chrome",
    );

    // The category count is the same set exposed by the full classification.
    const riderCount = Number(await categories.nth(2).locator("span").textContent());
    await categories.nth(2).click();
    await page.waitForFunction(
      () => new URL(location.href).searchParams.get("category") === "riders",
    );
    assert.equal(await page.locator(".search-group").count(), 1);
    assert.equal(Number(await page.locator(".search-group-head > b").textContent()), riderCount);

    await ready(page, "/search?q=ゼウス");
    const input = page.locator("#record-query");
    await input.waitFor();
    assert.equal(
      await categories.count(),
      4,
      "an entered query exposes only categories with matches, plus all",
    );
    assert.equal(
      await categories.evaluateAll((buttons) =>
        buttons.every((button) => Number(button.querySelector("span").textContent) > 0),
      ),
      true,
    );
    await page.keyboard.press("Control+k");
    assert.equal(await input.evaluate((node) => node === document.activeElement), true);
    assert.equal(
      await page.locator("dialog.quick-search[open]").count(),
      0,
      "/search keeps its local keyboard shortcut",
    );
    const cards = page.locator(".search-result-card");
    assert.ok((await cards.count()) > 1);
    assert.ok((await cards.first().getAttribute("href")).startsWith("/"));
    const cardMetrics = await cards.evaluateAll((nodes) =>
      nodes.map((node) => ({
        width: node.getBoundingClientRect().width,
        artWidth: node.querySelector(".dxl-art").getBoundingClientRect().width,
        bodyWidth: node.querySelector(".search-result-body").getBoundingClientRect().width,
        titleSize: Number.parseFloat(
          getComputedStyle(node.querySelector(".search-result-title")).fontSize,
        ),
      })),
    );
    assert.ok(
      cardMetrics.every(
        (card) => card.artWidth >= 70 && card.bodyWidth > 150 && card.titleSize >= 16,
      ),
    );
    assert.ok(
      Math.max(...cardMetrics.map((card) => card.width)) -
        Math.min(...cardMetrics.map((card) => card.width)) <
        2,
      "the final result does not grow larger than earlier results",
    );
    const firstResultTop = await cards.first().evaluate((node) => node.getBoundingClientRect().top);
    assert.ok(
      firstResultTop < 720,
      "searched results begin above the fold on phones, tablets and desktop",
    );
    await overflow(page);
    await page.screenshot({ path: `${out}/${width}-find.png` });
    await cards.first().scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${out}/${width}-records.png` });

    await input.fill("zzzzzzzzzzzzzzzz");
    await page.locator(".search-empty").waitFor();
    await overflow(page);
    await page
      .locator(".search-empty")
      .getByRole("button", { name: "検索語を消す", exact: true })
      .click();
    assert.equal(await input.inputValue(), "");
    await page.locator(".search-section-nav").waitFor();

    await ready(page, "/search?q=ゼウス&category=riders");
    const selectedEmptyCategory = page.locator('.search-categories button[aria-pressed="true"]');
    assert.match(await selectedEmptyCategory.textContent(), /ライダー/);
    assert.equal(
      Number(await selectedEmptyCategory.locator("span").textContent()),
      0,
      "an empty selected category remains visible and recoverable",
    );
    await page
      .locator(".search-empty")
      .getByRole("button", { name: /すべての分類で探す/ })
      .click();
    await page.locator(".search-result-card").first().waitFor();

    await ready(page, "/library");
    await page.keyboard.press("Control+k");
    const dialog = page.locator("dialog.quick-search[open]");
    await dialog.waitFor();
    const quickInput = dialog.getByRole("combobox");
    await page.screenshot({ path: `${out}/${width}-quick-browse.png` });
    await quickInput.fill("ゼウス");
    await dialog.locator(".quick-search-option.is-record").first().waitFor();
    const quickRecords = dialog.locator(".quick-search-option.is-record");
    assert.equal(await dialog.locator(".quick-search-art").count(), await quickRecords.count());
    assert.ok(
      (await dialog.locator(".quick-search-option-place").allTextContents()).some((label) =>
        label.includes("六詠資料"),
      ),
      "quick results identify their destination",
    );
    await quickInput.press("ArrowDown");
    const activeId = await quickInput.getAttribute("aria-activedescendant");
    assert.ok(activeId);
    assert.equal(await page.locator(`[id="${activeId}"]`).getAttribute("aria-selected"), "true");
    assert.equal(await dialog.evaluate((node) => node.scrollWidth <= node.clientWidth), true);
    await page.screenshot({ path: `${out}/${width}-quick-find.png` });
    await quickInput.press("Escape");
    assert.equal(await quickInput.inputValue(), "");
    await quickInput.press("Escape");
    await dialog.waitFor({ state: "hidden" });
    assert.deepEqual(errors, []);
    report.push({ width, firstResultTop, cardMetrics, errors });
    console.log(
      `PASS ${engine}/${width}: browse, jump focus, category counts, query, no-hit, quick search`,
    );
    await page.close();
  }
  for (const mode of engine === "chromium" ? ["economy", "forced-colors"] : ["economy"]) {
    const page = await browser.newPage({
      viewport: { width: 320, height: 568 },
      reducedMotion: "reduce",
      ...(mode === "forced-colors" ? { forcedColors: "active" } : {}),
    });
    await ready(page, `/search?q=${encodeURIComponent("長".repeat(120))}`);
    if (mode === "economy")
      await page.evaluate(() =>
        document.documentElement.setAttribute("data-world-effects", "economy"),
      );
    await page.locator(".search-empty").waitFor();
    await overflow(page);
    assert.equal(
      await page
        .locator("#record-query")
        .evaluate((node) => Number.parseFloat(getComputedStyle(node).fontSize)),
      16,
    );
    await page.screenshot({ path: `${out}/320-${mode}-long-query.png` });
    await ready(page, "/library");
    if (mode === "economy")
      await page.evaluate(() =>
        document.documentElement.setAttribute("data-world-effects", "economy"),
      );
    await page.keyboard.press("Control+k");
    const dialog = page.locator("dialog.quick-search[open]");
    await dialog.waitFor();
    await dialog.getByRole("combobox").fill("ゼウス");
    await dialog.locator(".quick-search-option.is-record").first().waitFor();
    assert.equal(
      await dialog.locator(".quick-search-panel").evaluate((node) => {
        const box = node.getBoundingClientRect();
        return box.top >= 0 && box.bottom <= innerHeight && node.scrollWidth <= node.clientWidth;
      }),
      true,
      "the compact dialog fits a short phone in fallback rendering modes",
    );
    await page.screenshot({ path: `${out}/320-${mode}-quick.png` });
    report.push({ mode, width: 320, height: 568 });
    console.log(`PASS ${engine}/${mode}: long query, short viewport, readable input, dialog fit`);
    await page.close();
  }
} finally {
  await browser.close();
}
await writeFile(`${out}/report.json`, JSON.stringify({ base, engine, report }, null, 2) + "\n");
