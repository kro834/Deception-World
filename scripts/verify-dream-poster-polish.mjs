import assert from "node:assert/strict";
import { chromium, webkit } from "playwright";

const base = process.env.BASE_URL || "http://localhost:8082";
const engine = process.env.PW_ENGINE || "chromium";
const browserType = engine === "webkit" ? webkit : chromium;
const browser = await browserType.launch(
  engine === "webkit" ? {} : { channel: process.env.PW_BROWSER_CHANNEL || "chrome" },
);

const viewports = [
  { name: "phone-320", width: 320, height: 720 },
  { name: "iphone-390", width: 390, height: 844 },
  { name: "tablet-1024", width: 1024, height: 768 },
];

async function openPosterArchive(page) {
  await page.goto(new URL("/dream-chapter", base).href, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(
    () =>
      document.documentElement.dataset.dreamChapter === "true" &&
      !document.documentElement.hasAttribute("data-route-scroll-settling"),
  );
  const section = page.locator(".dream-poster-controls");
  await section.evaluate((element) =>
    element.scrollIntoView({ block: "start", behavior: "instant" }),
  );
  await page.waitForTimeout(800);
  await page.locator(".dream-poster-current").waitFor({ state: "visible" });
}

async function checkLayout(page, viewport) {
  const figure = page.locator(".dream-poster-current");
  const caption = figure.locator("figcaption");
  const geometry = await figure.evaluate((element) => {
    const figureBounds = element.getBoundingClientRect();
    const captionElement = element.querySelector("figcaption");
    if (!captionElement) throw new Error("poster caption is missing");
    const captionBounds = captionElement.getBoundingClientRect();
    const borderBottom = Number.parseFloat(getComputedStyle(element).borderBottomWidth) || 0;
    return {
      figureBottom: figureBounds.bottom,
      captionBottom: captionBounds.bottom,
      borderBottom,
      captionPosition: getComputedStyle(captionElement).position,
    };
  });
  assert.equal(geometry.captionPosition, "relative", `${viewport.name}: caption left normal flow`);
  assert.ok(
    Math.abs(geometry.captionBottom - (geometry.figureBottom - geometry.borderBottom)) <= 1.5,
    `${viewport.name}: caption bottom does not meet figure border (${JSON.stringify(geometry)})`,
  );
  await caption.waitFor({ state: "visible" });

  const controls = page.locator(".dream-poster-controls button");
  assert.equal(await controls.count(), 3, `${viewport.name}: expected three poster controls`);
  for (const control of await controls.all()) {
    const metrics = await control.evaluate((element) => {
      const label = element.querySelector(":scope > span:not(.liquid-pointer-glow)");
      if (!label) throw new Error("poster control label is missing");
      return {
        height: element.getBoundingClientRect().height,
        label: label.textContent?.trim(),
        clientWidth: label.clientWidth,
        scrollWidth: label.scrollWidth,
      };
    });
    assert.ok(metrics.height >= 48, `${viewport.name}: ${metrics.label} target is under 48px`);
    assert.ok(
      metrics.scrollWidth <= metrics.clientWidth + 1,
      `${viewport.name}: ${metrics.label} is truncated (${metrics.scrollWidth} > ${metrics.clientWidth})`,
    );
  }

  const lock = page.locator(".dream-poster-lock");
  await lock.click();
  await assert.doesNotReject(lock.getByText("UNLOCK", { exact: true }).waitFor());
  const unlockFits = await lock
    .locator(":scope > span:not(.liquid-pointer-glow)")
    .evaluate((element) => element.scrollWidth <= element.clientWidth + 1);
  assert.equal(unlockFits, true, `${viewport.name}: UNLOCK is truncated`);
  await lock.click();
}

async function checkKeyboardShuffle(page, viewport) {
  const shuffle = page.locator(".dream-poster-shuffle");
  const reset = page.locator(".dream-poster-reset");
  await shuffle.focus();
  await page.keyboard.press("Enter");
  await page.waitForFunction(
    () => document.querySelector(".dream-poster-shuffle")?.getAttribute("aria-busy") === "true",
  );
  assert.equal(await shuffle.evaluate((element) => document.activeElement === element), true);

  // A second activation while busy must leave the same run active and focused.
  await page.keyboard.press("Enter");
  assert.equal(await shuffle.getAttribute("aria-disabled"), "true");
  assert.equal(await shuffle.evaluate((element) => document.activeElement === element), true);

  // macOS WebKit includes native buttons in Option+Tab traversal.
  await page.keyboard.press(engine === "webkit" ? "Alt+Tab" : "Tab");
  assert.equal(
    await reset.evaluate((element) => document.activeElement === element),
    true,
    `${viewport.name}: RESET is not reachable while SHUFFLE is busy`,
  );
  await page.keyboard.press("Enter");
  await page.waitForFunction(
    () => document.querySelector(".dream-poster-shuffle")?.getAttribute("aria-busy") === "false",
  );
  assert.equal(await shuffle.getAttribute("aria-disabled"), "false");
}

async function checkReducedMotion(page, viewport) {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openPosterArchive(page);
  const shuffle = page.locator(".dream-poster-shuffle");
  await shuffle.focus();
  await page.keyboard.press("Enter");
  assert.equal(
    await shuffle.getAttribute("aria-busy"),
    "false",
    `${viewport.name}: reduced-motion shuffle entered its timed busy sequence`,
  );
  assert.equal(await shuffle.evaluate((element) => document.activeElement === element), true);
}

try {
  for (const viewport of viewports) {
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    await openPosterArchive(page);
    await checkLayout(page, viewport);
    await checkKeyboardShuffle(page, viewport);
    await checkReducedMotion(page, viewport);
    console.log(`${engine} ${viewport.name}: Dream poster polish passed`);
    await context.close();
  }
} finally {
  await browser.close();
}
