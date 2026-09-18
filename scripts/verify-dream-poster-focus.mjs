import assert from "node:assert/strict";
import { chromium, webkit } from "playwright";

const base = process.env.BASE_URL || "http://localhost:8082";
const engine = process.env.PW_ENGINE === "webkit" ? "webkit" : "chromium";
const browserType = engine === "webkit" ? webkit : chromium;
const browser = await browserType.launch(
  engine === "webkit" ? {} : { channel: process.env.PW_BROWSER_CHANNEL || "chrome" },
);

const selectedPoster = (page) =>
  page.locator('.dream-poster-thumbnails [role="tab"][aria-selected="true"]');

async function waitForPosterChange(page, initialId) {
  await page.waitForFunction(
    (id) =>
      document
        .querySelector('.dream-poster-thumbnails [role="tab"][aria-selected="true"]')
        ?.getAttribute("id") !== id,
    initialId,
    { timeout: 12_000 },
  );
}

try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.goto(new URL("/dream-chapter", base).href, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(
    () =>
      document.documentElement.dataset.dreamChapter === "true" &&
      !document.documentElement.hasAttribute("data-route-scroll-settling"),
  );
  await page
    .locator(".dream-poster-thumbnails")
    .evaluate((node) => node.scrollIntoView({ block: "center", behavior: "instant" }));

  const initialTab = selectedPoster(page);
  const initialId = await initialTab.getAttribute("id");
  assert.ok(initialId);
  await initialTab.focus();
  await page.waitForTimeout(5_600);
  assert.equal(
    await selectedPoster(page).getAttribute("id"),
    initialId,
    "focused tab pauses autoplay",
  );
  assert.equal(
    await initialTab.evaluate((element) => document.activeElement === element),
    true,
    "focus remains on the selected tab",
  );

  const reset = page.locator(".dream-poster-reset");
  await (engine === "webkit" ? page.keyboard.press("Alt+Tab") : page.keyboard.press("Tab"));
  // Focus movement within the stage must not briefly restart the timer.
  await reset.focus();
  await page.waitForTimeout(5_600);
  assert.equal(
    await selectedPoster(page).getAttribute("id"),
    initialId,
    "focused controls pause autoplay",
  );

  await page.locator('.dream-chapter-nav a[href="#posters"]').focus();
  await waitForPosterChange(page, initialId);
  const resumedId = await selectedPoster(page).getAttribute("id");
  assert.notEqual(resumedId, initialId, "leaving the poster stage resumes autoplay");

  const lock = page.locator(".dream-poster-lock");
  await lock.focus();
  await page.keyboard.press("Enter");
  assert.equal(await lock.getAttribute("aria-pressed"), "true");
  const lockedId = await selectedPoster(page).getAttribute("id");
  await page.locator('.dream-chapter-nav a[href="#posters"]').focus();
  await page.waitForTimeout(5_600);
  assert.equal(
    await selectedPoster(page).getAttribute("id"),
    lockedId,
    "explicit lock survives leaving the poster stage",
  );

  await lock.focus();
  await page.keyboard.press("Enter");
  assert.equal(await lock.getAttribute("aria-pressed"), "false");
  await page.emulateMedia({ reducedMotion: "reduce" });
  const reducedId = await selectedPoster(page).getAttribute("id");
  await page.locator('.dream-chapter-nav a[href="#posters"]').focus();
  await page.waitForTimeout(5_600);
  assert.equal(
    await selectedPoster(page).getAttribute("id"),
    reducedId,
    "reduced motion keeps autoplay paused after focus leaves",
  );

  console.log(`${engine}: Dream poster focus pause, resume, lock, and reduced motion passed`);
} finally {
  await browser.close();
}
