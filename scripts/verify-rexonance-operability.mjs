import assert from "node:assert/strict";
import { chromium, webkit } from "playwright";

const base = process.env.BASE_URL || "http://127.0.0.1:8082";
const engine = process.env.PW_ENGINE || "chromium";
const browser = await (engine === "webkit" ? webkit : chromium).launch(
  engine === "webkit" ? {} : { channel: "chrome" },
);
const profiles = [
  { name: "desktop", viewport: { width: 1440, height: 900 } },
  { name: "laptop-breakpoint", viewport: { width: 901, height: 600 } },
  { name: "tablet-breakpoint", viewport: { width: 900, height: 600 }, hasTouch: true },
  { name: "fold-cover", viewport: { width: 280, height: 653 }, hasTouch: true },
  { name: "phone-390", viewport: { width: 390, height: 844 }, hasTouch: true },
  { name: "tablet-portrait", viewport: { width: 1024, height: 1366 }, hasTouch: true },
  { name: "reduced-motion", viewport: { width: 390, height: 844 }, reducedMotion: "reduce" },
  { name: "forced-colors", viewport: { width: 1280, height: 800 }, forcedColors: "active" },
];
const failures = [];

async function waitForPage(page) {
  await page.locator(".rxs-rexonance-page").waitFor();
  await page.waitForFunction(
    () =>
      document.querySelector(".rxs-stage-tabs")?.dataset.liquidInitialized === "true" &&
      !document.documentElement.hasAttribute("data-route-cover") &&
      !document.querySelector(".load-gate"),
  );
}

async function verifyStage(page, stage) {
  const rail = page.locator(".rxs-stage-tabs");
  await page.waitForFunction(
    (expected) => document.querySelector(".rxs-stage-tabs")?.dataset.stage === expected,
    stage,
  );
  const selected = rail.locator('[aria-selected="true"]');
  assert.equal(await selected.count(), 1);
  assert.equal(await selected.getAttribute("id"), `rxs-stage-tab-${stage}`);
  assert.equal(await selected.getAttribute("tabindex"), "0");
  assert.equal(await rail.locator('button[tabindex="-1"]').count(), 2);
  assert.equal(
    await selected.evaluate((button) => document.activeElement === button),
    true,
    `${stage}: keyboard selection must retain focus on the selected tab`,
  );
  assert.equal(
    await page.locator("#rxs-stage-panel").getAttribute("aria-labelledby"),
    `rxs-stage-tab-${stage}`,
  );
  await page.waitForTimeout(650);
  const lens = await rail.evaluate((root) => {
    const selectedBox = root.querySelector('[aria-selected="true"]').getBoundingClientRect();
    const lensBox = root.querySelector(".liquid-selection-lens").getBoundingClientRect();
    return {
      left: Math.abs(selectedBox.left - lensBox.left),
      top: Math.abs(selectedBox.top - lensBox.top),
      width: Math.abs(selectedBox.width - lensBox.width),
      height: Math.abs(selectedBox.height - lensBox.height),
    };
  });
  for (const [edge, delta] of Object.entries(lens)) {
    assert.ok(delta <= 1.5, `${stage}: lens ${edge} must match selected tab (${delta}px)`);
  }
}

async function verifyStageCopy(page) {
  return page.locator(".rxs-stage-panel").evaluate((panel) => {
    const column = panel.querySelector(":scope > div");
    const elements = [...column.querySelectorAll("small, h3, p, li")];
    const failures = [];
    for (const element of elements) {
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        if (!node.textContent.trim()) continue;
        const range = document.createRange();
        range.selectNodeContents(node);
        for (const box of range.getClientRects()) {
          if (!box.width || !box.height) continue;
          if (box.left < -1.5 || box.right > innerWidth + 1.5) {
            failures.push({ text: node.textContent, left: box.left, right: box.right, innerWidth });
          }
        }
      }
    }
    return failures;
  });
}

async function verifyAnchor(page, id) {
  const desktopLink = page.locator(`.rxs-local-nav nav a[href="#${id}"]`);
  if (await desktopLink.isVisible()) {
    await desktopLink.click();
  } else {
    await page.evaluate((target) => {
      location.hash = target;
    }, id);
  }
  // Long upward jumps from P14 can animate for more than 800ms. Sample the
  // settled destination, not a point along the browser's smooth scroll.
  let lastScroll = null;
  let stableFrames = 0;
  for (let attempt = 0; attempt < 30 && stableFrames < 3; attempt += 1) {
    await page.waitForTimeout(120);
    const scroll = await page.evaluate(() => scrollY);
    stableFrames =
      lastScroll !== null && Math.abs(scroll - lastScroll) < 0.5 ? stableFrames + 1 : 0;
    lastScroll = scroll;
  }
  const position = await page.evaluate((target) => {
    const nav = document.querySelector(".rxs-local-nav").getBoundingClientRect();
    const section = document.getElementById(target).getBoundingClientRect();
    return {
      sectionTop: section.top,
      navBottom: nav.bottom,
      reserve: Number.parseFloat(
        getComputedStyle(document.querySelector("main.rxs-page")).getPropertyValue(
          "--rxs-local-nav-reserve",
        ),
      ),
      rootPadding: Number.parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop),
      margin: Number.parseFloat(getComputedStyle(document.getElementById(target)).scrollMarginTop),
      scrollY,
      active: document.activeElement?.tagName,
    };
  }, id);
  assert.ok(
    position.sectionTop >= position.navBottom + 20 &&
      position.sectionTop <= position.navBottom + 28,
    `${id}: section should land below fixed nav (${JSON.stringify(position)})`,
  );
  assert.equal(position.rootPadding, 0, "Rexonance targets must not double the World nav offset");
  assert.ok(Math.abs(position.reserve - position.navBottom) <= 1.5);
}

try {
  for (const profile of profiles.filter(
    (item) => !process.env.PW_PROFILE || item.name === process.env.PW_PROFILE,
  )) {
    const context = await browser.newContext(profile);
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    try {
      await page.goto(`${base}/rexonance-saga`, { waitUntil: "networkidle" });
      await waitForPage(page);
      const tabs = page.locator(".rxs-stage-tabs button");
      await tabs.first().focus();
      const copyStarts = [];
      for (const [key, stage] of [
        ["ArrowRight", "max"],
        ["End", "ultra"],
        ["ArrowRight", "standard"],
        ["ArrowLeft", "ultra"],
        ["Home", "standard"],
      ]) {
        await page.keyboard.press(key);
        await verifyStage(page, stage);
        assert.deepEqual(await verifyStageCopy(page), [], `${stage}: text must fit the viewport`);
        copyStarts.push(
          await page
            .locator(".rxs-stage-panel")
            .evaluate(
              (panel) =>
                panel.querySelector(":scope > div > small").getBoundingClientRect().top -
                panel.querySelector("figure").getBoundingClientRect().top,
            ),
        );
      }
      if (profile.viewport.width >= 901) {
        assert.ok(
          Math.max(...copyStarts) - Math.min(...copyStarts) <= 1.5,
          `Desktop form changes must retain the copy start (${copyStarts.join(", ")})`,
        );
      }

      const comparison = page.getByLabel("レクソナンスの比較対象", { exact: true });
      await comparison.focus();
      // macOS headless native select menus do not consume synthetic keyboard
      // selection (even a standalone HTML select behaves that way). Exercise
      // DOM selection and keyboard modality separately, as the picker QA does.
      await comparison.selectOption("vinculum");
      await page.keyboard.press("Escape");
      await page.waitForTimeout(150);
      assert.equal(await comparison.inputValue(), "vinculum");
      assert.equal(
        await page.locator(".rxs-comparison-metrics").getAttribute("data-baseline"),
        "vinculum",
      );
      assert.equal(
        await comparison.evaluate((control) => document.activeElement === control),
        true,
      );

      const slider = page.getByLabel("P14の比較対象", { exact: true });
      await slider.focus();
      await page.keyboard.press("End");
      assert.equal(await slider.inputValue(), "2");
      assert.equal(await page.locator(".rxs-p14-metrics").getAttribute("data-baseline"), "p2");
      assert.equal(await slider.evaluate((control) => document.activeElement === control), true);
      await page.keyboard.press("Home");
      assert.equal(await slider.inputValue(), "1");
      assert.equal(await page.locator(".rxs-p14-metrics").getAttribute("data-baseline"), "p1");

      // Focus the controls with actual Tab navigation from the slider and
      // confirm that browser scrolling leaves them clear of the fixed bar.
      await page.keyboard.press("Tab");
      const focusPosition = await page.evaluate(() => {
        const active = document.activeElement;
        const bounds = active.getBoundingClientRect();
        const nav = document.querySelector(".rxs-local-nav").getBoundingClientRect();
        return {
          tag: active.tagName,
          top: bounds.top,
          bottom: bounds.bottom,
          navBottom: nav.bottom,
        };
      });
      assert.ok(
        focusPosition.top >= focusPosition.navBottom,
        `Tab focus must clear the fixed bar (${JSON.stringify(focusPosition)})`,
      );

      for (const id of ["performance", "p14", "stages", "system"]) {
        await verifyAnchor(page, id);
      }

      const landscape = { width: profile.viewport.height, height: profile.viewport.width };
      let touchSession = null;
      let overflowBeforeHold = null;
      if (engine === "chromium" && profile.hasTouch) {
        await tabs.first().scrollIntoViewIfNeeded();
        overflowBeforeHold = await page.evaluate(() => ({
          root: document.documentElement.style.overflow,
          body: document.body.style.overflow,
        }));
        const tabBox = await tabs.first().boundingBox();
        touchSession = await context.newCDPSession(page);
        await touchSession.send("Input.dispatchTouchEvent", {
          type: "touchStart",
          touchPoints: [{ x: tabBox.x + tabBox.width / 2, y: tabBox.y + tabBox.height / 2 }],
        });
        await page.waitForFunction(() => document.documentElement.dataset.railLock === "true");
      }
      await page.setViewportSize(landscape);
      if (touchSession) {
        await touchSession.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
        await page.waitForFunction(() => !document.documentElement.hasAttribute("data-rail-lock"));
        assert.deepEqual(
          await page.evaluate(() => ({
            root: document.documentElement.style.overflow,
            body: document.body.style.overflow,
          })),
          overflowBeforeHold,
          "Rotation during a held tab must release its document scroll lock",
        );
      }
      await page.waitForTimeout(450);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await tabs.nth(2).focus();
      await page.keyboard.press("End");
      await verifyStage(page, "ultra");
      assert.deepEqual(
        await verifyStageCopy(page),
        [],
        "rotated stage: no horizontal text clipping",
      );
      await verifyAnchor(page, "stages");
      assert.deepEqual(errors, []);
      console.log(
        `PASS ${engine}/${profile.name}: keyboard, lens, selectors, anchors, orientation`,
      );
    } catch (error) {
      failures.push({ profile: profile.name, message: error.message });
      console.error(`FAIL ${engine}/${profile.name}: ${error.message}`);
      await page.screenshot({ path: `/tmp/rexonance-operability-${engine}-${profile.name}.png` });
    } finally {
      await context.close();
    }
  }
  assert.deepEqual(failures, [], JSON.stringify(failures, null, 2));
} finally {
  await browser.close();
}
