import assert from "node:assert/strict";
import { chromium, webkit } from "playwright";

const geometry = (page) =>
  page.evaluate(() => {
    const stage = document.querySelector(".world-stage-controls");
    return {
      storyTop: document.getElementById("story").getBoundingClientRect().top + scrollY,
      width: stage.offsetWidth,
      height: stage.offsetHeight,
      buttons: [...stage.querySelectorAll("button")].map((button) => button.offsetWidth),
    };
  });

function assertStable(actual, expected, state) {
  assert.ok(Math.abs(actual.storyTop - expected.storyTop) <= 1, `${state} moved the story`);
  assert.deepEqual(
    { ...actual, storyTop: 0 },
    { ...expected, storyTop: 0 },
    `${state} resized the controls`,
  );
}

const engine = process.env.PW_ENGINE === "webkit" ? webkit : chromium;
const browser = await engine.launch(engine === chromium ? { channel: "chrome" } : {});
try {
  for (const width of [390, 1024]) {
    const page = await browser.newPage({ viewport: { width, height: 844 }, hasTouch: true });
    await page.goto(`${process.env.BASE_URL || "http://localhost:8082"}/world`);
    await page.waitForFunction(
      () => !document.documentElement.hasAttribute("data-route-scroll-settling") &&
        !document.documentElement.hasAttribute("data-loading"),
    );
    const counter = page.locator(".world-stage-controls output");
    const shuffle = page.locator(".poster-shuffle");
    const lock = page.locator(".poster-lock");
    await shuffle.scrollIntoViewIfNeeded();
    await shuffle.focus();
    await page.waitForFunction(
      () =>
        document.querySelector(".world-stage-controls output")?.getAttribute("aria-live") === "polite",
    );
    await page.evaluate(() => document.fonts.ready);
    const initial = await counter.textContent();
    const unlockedGeometry = await geometry(page);
    // A complete 5.2-second autoplay interval must not replace a focused poster.
    await page.waitForTimeout(5600);
    assert.equal(await counter.textContent(), initial, "focused controls pause autoplay");
    // macOS WebKit uses Option+Tab to include buttons in native focus traversal.
    await page.keyboard.press(engine === webkit ? "Alt+Tab" : "Tab");
    assert.equal(
      await page
        .locator(".world-stage-controls")
        .evaluate((node) => node.contains(document.activeElement)),
      true,
    );
    assert.equal(await counter.getAttribute("aria-live"), "polite");
    await page.locator(".topbar .brand").focus();
    await page.waitForFunction(
      () => document.querySelector(".world-stage-controls output")?.getAttribute("aria-live") === "off",
    );
    await page.waitForFunction(
      (value) => document.querySelector(".world-stage-controls output")?.textContent !== value,
      initial,
      { timeout: 12000 },
    );
    await lock.click();
    assert.equal(await lock.getAttribute("aria-pressed"), "true");
    assertStable(await geometry(page), unlockedGeometry, "locking");
    const locked = await counter.textContent();
    await page.locator(".topbar .brand").focus();
    await page.waitForTimeout(5600);
    assert.equal(
      await counter.textContent(),
      locked,
      "explicit lock survives leaving the controls",
    );
    await page.locator(".poster-reset").click();
    await page.waitForFunction(() =>
      document.querySelector(".world-stage-controls output")?.textContent?.trim().startsWith("01 /"),
    );
    assert.equal(await counter.getAttribute("aria-live"), "polite");
    await shuffle.focus();
    await page.keyboard.press("Enter");
    await page.waitForFunction(
      () => document.querySelector(".poster-shuffle")?.getAttribute("aria-busy") === "true",
    );
    assert.equal(await shuffle.evaluate((node) => node === document.activeElement), true);
    assert.equal(await shuffle.getAttribute("aria-disabled"), "true");
    assert.equal(await counter.getAttribute("aria-busy"), "true");
    assertStable(await geometry(page), unlockedGeometry, "shuffling");
    await page.keyboard.press("Enter"); // A second press must not queue a second shuffle.
    await page.waitForFunction(
      () => document.querySelector(".poster-shuffle")?.getAttribute("aria-busy") === "false",
    );
    assert.equal(await shuffle.evaluate((node) => node === document.activeElement), true);
    assert.equal(await counter.getAttribute("aria-busy"), "false");
    assertStable(await geometry(page), unlockedGeometry, "shuffle completion");
    const targets = await page.locator(".world-stage-control-cluster button").evaluateAll((buttons) =>
      buttons.map((button) => ({
        name: button.getAttribute("aria-label"),
        height: button.getBoundingClientRect().height,
        overflow: button.scrollWidth - button.clientWidth,
      })),
    );
    assert.ok(
      targets.every((target) => target.name && target.height >= 44 && target.overflow <= 1),
    );
    console.log(
      `PASS ${width}px: focus pause, automatic resume, persistent lock, reset and named controls`,
    );
    await page.close();
  }
} finally {
  await browser.close();
}
