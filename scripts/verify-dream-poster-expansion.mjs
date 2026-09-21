import assert from "node:assert/strict";
import { chromium, webkit } from "playwright";

// Run against a fresh local preview after the poster assets have been built.
const base = process.env.BASE_URL || "http://localhost:8082";
const engine = process.env.PW_ENGINE === "webkit" ? "webkit" : "chromium";
const browserType = engine === "webkit" ? webkit : chromium;
const browser = await browserType.launch(
  engine === "webkit" ? {} : { channel: process.env.PW_BROWSER_CHANNEL || "chrome" },
);

const viewports = [
  { name: "iphone-375", width: 375, height: 812 },
  { name: "iphone-390", width: 390, height: 844 },
  { name: "ipad-1024", width: 1024, height: 768 },
  { name: "ipad-1194", width: 1194, height: 834 },
];

const tabs = (page) => page.locator('.dream-poster-thumbnails [role="tab"]');
const selectedTab = (page) =>
  page.locator('.dream-poster-thumbnails [role="tab"][aria-selected="true"]');
const posterImage = (page) => page.locator(".dream-poster-current > img");

async function openPosterArchive(page) {
  await page.goto(new URL("/dream-chapter", base).href, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(
    () =>
      document.documentElement.dataset.dreamChapter === "true" &&
      !document.documentElement.hasAttribute("data-route-scroll-settling") &&
      document.querySelectorAll('.dream-poster-thumbnails [role="tab"]').length === 15,
  );
  await page
    .locator(".dream-poster-stage")
    .evaluate((node) => node.scrollIntoView({ block: "center", behavior: "instant" }));
  await posterImage(page).waitFor({ state: "visible" });
}

async function safeClick(page, locator) {
  await locator.evaluate((node) =>
    node.scrollIntoView({ block: "center", inline: "center", behavior: "instant" }),
  );
  await page.waitForTimeout(200);
  const point = await locator.evaluate((node) => {
    const rect = node.getBoundingClientRect();
    const candidates = [
      [0.5, 0.5],
      [0.25, 0.5],
      [0.75, 0.5],
      [0.5, 0.25],
      [0.5, 0.75],
    ];
    for (const [horizontal, vertical] of candidates) {
      const x = rect.left + rect.width * horizontal;
      const y = rect.top + rect.height * vertical;
      const hit = document.elementFromPoint(x, y);
      if (hit && node.contains(hit)) return { x, y };
    }
    return null;
  });
  assert.ok(point, "poster control must have a genuinely unobstructed hit target");
  await page.mouse.click(point.x, point.y);
}

async function assertSelectedImage(page, expectedIndex, label) {
  await page.waitForFunction(
    (index) =>
      document.querySelector('.dream-poster-thumbnails [role="tab"][aria-selected="true"]')?.id ===
      `dream-poster-tab-${index}`,
    expectedIndex,
  );
  const selected = selectedTab(page);
  assert.equal(await selected.count(), 1, `${label}: exactly one poster tab is selected`);
  assert.equal(await selected.getAttribute("id"), `dream-poster-tab-${expectedIndex}`);
  const image = posterImage(page);
  await image.evaluate((node) => node.decode?.().catch(() => undefined));
  const result = await image.evaluate((node) => ({
    src: node.currentSrc || node.src,
    naturalWidth: node.naturalWidth,
    complete: node.complete,
  }));
  assert.ok(result.complete && result.naturalWidth > 0, `${label}: selected poster decoded`);
  assert.equal(
    result.src,
    new URL(`/dream-chapter-poster-${String(expectedIndex + 1).padStart(2, "0")}.jpeg`, base).href,
    `${label}: main poster URL matches its selected thumbnail`,
  );
}

async function assertPosterGeometry(page, viewport, expectContain = true) {
  const geometry = await page.locator(".dream-poster-current").evaluate((figure) => {
    const image = figure.querySelector("img");
    const caption = figure.querySelector("figcaption");
    if (!image || !caption) throw new Error("poster image or caption is missing");
    const frame = figure.getBoundingClientRect();
    const captionRect = caption.getBoundingClientRect();
    return {
      objectFit: getComputedStyle(image).objectFit,
      overflow: getComputedStyle(figure).overflow,
      captionInside:
        captionRect.left >= frame.left - 1 &&
        captionRect.right <= frame.right + 1 &&
        captionRect.top >= frame.top - 1 &&
        captionRect.bottom <= frame.bottom + 1,
    };
  });
  if (expectContain)
    assert.equal(geometry.objectFit, "contain", `${viewport.name}: full poster uses contain`);
  assert.equal(geometry.overflow, "hidden", `${viewport.name}: poster figure clips its contents`);
  assert.equal(geometry.captionInside, true, `${viewport.name}: caption stays inside the figure`);
}

async function assertReachableTargets(page, viewport) {
  const allTabs = tabs(page);
  for (let index = 0; index < 15; index += 1) {
    const tab = allTabs.nth(index);
    await tab.evaluate((node) =>
      node.scrollIntoView({ block: "nearest", inline: "center", behavior: "instant" }),
    );
    const metrics = await tab.evaluate((node) => {
      const tabRect = node.getBoundingClientRect();
      const stripRect = node.parentElement?.getBoundingClientRect();
      if (!stripRect) throw new Error("thumbnail strip is missing");
      return {
        width: tabRect.width,
        height: tabRect.height,
        visible:
          tabRect.left >= stripRect.left - 1 &&
          tabRect.right <= stripRect.right + 1 &&
          tabRect.top >= stripRect.top - 1 &&
          tabRect.bottom <= stripRect.bottom + 1,
      };
    });
    assert.ok(
      metrics.width >= 44 && metrics.height >= 44,
      `${viewport.name}: tab ${index + 1} is at least 44px`,
    );
    if (viewport.width >= 1024) {
      assert.equal(
        metrics.visible,
        true,
        `${viewport.name}: tab ${index + 1} is reachable in the thumbnail strip`,
      );
    }
  }
}

async function assertKeyboardNavigation(page, viewport) {
  const first = tabs(page).first();
  await first.focus();
  await page.keyboard.press("End");
  await assertSelectedImage(page, 14, `${viewport.name}: End`);
  assert.equal(await selectedTab(page).evaluate((node) => document.activeElement === node), true);

  await page.keyboard.press("ArrowRight");
  await assertSelectedImage(page, 0, `${viewport.name}: ArrowRight wraps from 15 to 1`);
  await page.keyboard.press("End");
  await page.keyboard.press("Home");
  await assertSelectedImage(page, 0, `${viewport.name}: Home`);

  // Focus in the poster stage pauses autoplay; this short stability check catches an immediate race.
  const focusedId = await selectedTab(page).getAttribute("id");
  await page.waitForTimeout(1_300);
  assert.equal(
    await selectedTab(page).getAttribute("id"),
    focusedId,
    `${viewport.name}: focused tab remains selected`,
  );
}

async function assertControls(page, viewport) {
  const lock = page.locator(".dream-poster-lock");
  const reset = page.locator(".dream-poster-reset");
  const shuffle = page.locator(".dream-poster-shuffle");

  // Keyboard selection intentionally locks autoplay in the existing component.
  if ((await lock.getAttribute("aria-pressed")) === "true") await safeClick(page, lock);
  await safeClick(page, lock);
  assert.equal(await lock.getAttribute("aria-pressed"), "true", `${viewport.name}: lock engages`);
  await safeClick(page, lock);
  assert.equal(await lock.getAttribute("aria-pressed"), "false", `${viewport.name}: lock releases`);

  await safeClick(page, shuffle);
  await page.waitForFunction(
    () => document.querySelector(".dream-poster-shuffle")?.getAttribute("aria-busy") === "true",
    undefined,
    { timeout: 2_000 },
  );
  await page.waitForFunction(
    () => document.querySelector(".dream-poster-shuffle")?.getAttribute("aria-busy") === "false",
    undefined,
    { timeout: 4_000 },
  );
  const selectedId = await selectedTab(page).getAttribute("id");
  const selectedIndex = Number(selectedId?.replace("dream-poster-tab-", ""));
  assert.ok(
    Number.isInteger(selectedIndex) && selectedIndex >= 0 && selectedIndex < 15,
    `${viewport.name}: shuffle settles on an in-range poster`,
  );
  await assertSelectedImage(page, selectedIndex, `${viewport.name}: shuffled poster`);

  await safeClick(page, reset);
  await assertSelectedImage(page, 0, `${viewport.name}: reset returns to poster 1`);
}

async function assertPageScrolls(page, viewport) {
  const scroll = await page.evaluate(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
    const before = scrollY;
    window.scrollBy({ top: 240, behavior: "instant" });
    return {
      before,
      after: scrollY,
      rootOverflow: getComputedStyle(document.documentElement).overflowY,
      bodyOverflow: getComputedStyle(document.body).overflowY,
    };
  });
  assert.ok(scroll.after > scroll.before, `${viewport.name}: document scrolling remains unlocked`);
  assert.notEqual(scroll.rootOverflow, "hidden", `${viewport.name}: root is not scroll-locked`);
  assert.notEqual(scroll.bodyOverflow, "hidden", `${viewport.name}: body is not scroll-locked`);
}

try {
  for (const viewport of viewports) {
    const context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
      hasTouch: true,
      isMobile: engine === "chromium" && viewport.width < 600,
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));

    await openPosterArchive(page);
    assert.equal(await tabs(page).count(), 15, `${viewport.name}: all 15 poster tabs render`);
    await assertPosterGeometry(page, viewport, false);
    await assertReachableTargets(page, viewport);

    for (let index = 8; index < 15; index += 1) {
      await safeClick(page, tabs(page).nth(index));
      await assertSelectedImage(
        page,
        index,
        `${viewport.name}: tab ${String(index + 1).padStart(2, "0")}`,
      );
      await assertPosterGeometry(page, viewport);
    }

    await assertKeyboardNavigation(page, viewport);
    await assertControls(page, viewport);
    await assertPageScrolls(page, viewport);
    assert.deepEqual(errors, [], `${viewport.name}: page errors`);
    console.log(`${engine} ${viewport.name}: 15-poster archive passed`);
    await context.close();
  }
} finally {
  await browser.close();
}
