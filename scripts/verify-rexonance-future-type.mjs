// BASE_URL=... BROWSER=webkit node scripts/verify-rexonance-future-type.mjs
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium, webkit } from "playwright";

const engine = process.env.BROWSER === "webkit" ? "webkit" : "chrome";
const browser = await (engine === "webkit"
  ? webkit.launch()
  : chromium.launch({ channel: "chrome" }));
const out = `output/playwright/cpu-preparation/type-${engine}`;
await mkdir(out, { recursive: true });
const results = [];
try {
  for (const width of process.env.WIDTHS
    ? process.env.WIDTHS.split(",").map(Number)
    : [320, 390, 1024, 1440]) {
    const context = await browser.newContext({
      viewport: { width, height: width < 768 ? 844 : 900 },
      deviceScaleFactor: width < 768 ? 3 : 1,
      hasTouch: width <= 1024,
      isMobile: width <= 1024,
    });
    // Identical to the A/B preparation probe: the host's external DNS is
    // unavailable. No local stylesheet or font is replaced by this isolation.
    await context.route("https://fonts.googleapis.com/**", (r) =>
      r.fulfill({ contentType: "text/css", body: "" }),
    );
    await context.route("https://grok.com/grok-app-builder/extensions.js", (r) =>
      r.fulfill({ contentType: "text/javascript", body: "" }),
    );
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(`${process.env.BASE_URL || "http://127.0.0.1:8082"}/rexonance-saga`, {
      waitUntil: "load",
    });
    await page.waitForFunction(
      () =>
        document.querySelector("main[data-motion-ready]") &&
        !document.documentElement.hasAttribute("data-loading"),
    );
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(2200);
    await page.addStyleTag({ content: "html,body {scroll-behavior:auto!important}" });
    const fonts = await page.evaluate(() => ({
      title: getComputedStyle(document.querySelector(".rxs-hero h1")).fontFamily,
      lede: getComputedStyle(document.querySelector(".rxs-hero-lede")).fontFamily,
      dormantRequests: performance
        .getEntriesByType("resource")
        .filter((r) => /rexonance-mincho/.test(r.name))
        .map((r) => r.name),
      overflow: document.documentElement.scrollWidth - innerWidth,
    }));
    assert.match(fonts.title, /Rexonance Forge/);
    assert.doesNotMatch(fonts.lede, /Mincho|Serif/);
    assert.deepEqual(fonts.dormantRequests, [], "unused Mincho never downloads");
    assert.ok(fonts.overflow <= 1, `${width}: no horizontal overflow`);
    await page.screenshot({ path: `${out}/hero-${width}.png` });

    const tabs = page.locator(".rxs-stage-tabs");
    await tabs.scrollIntoViewIfNeeded();
    await page.waitForFunction(
      () => document.querySelector(".rxs-stage-tabs")?.dataset.liquidInitialized === "true",
    );
    await page.keyboard.press("Tab");
    await page.locator("#rxs-stage-tab-standard").focus();
    for (const [key, expected] of [
      ["ArrowRight", "max"],
      ["End", "ultra"],
      ["Home", "standard"],
    ]) {
      await page.keyboard.press(key);
      await page.waitForFunction(
        (stage) => document.querySelector(".rxs-stage-tabs")?.dataset.stage === stage,
        expected,
      );
      assert.equal(
        await tabs.locator('[aria-selected="true"]').getAttribute("id"),
        `rxs-stage-tab-${expected}`,
      );
    }
    const focus = await page.locator("#rxs-stage-tab-standard").evaluate((el) => ({
      active: document.activeElement === el,
      visible: el.matches(":focus-visible"),
      outline: getComputedStyle(el).outlineWidth,
    }));
    assert.deepEqual(focus, { active: true, visible: true, outline: "2px" });
    const clipped = await tabs.evaluate((el) =>
      [...el.querySelectorAll("button")]
        .filter((b) => b.scrollWidth > b.clientWidth + 1)
        .map((b) => b.textContent),
    );
    assert.deepEqual(clipped, [], `${width}: form tab labels fit`);
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${out}/tabs-${width}.png` });

    const press = async () => {
      const button = page.locator("#rxs-stage-tab-standard");
      await button.scrollIntoViewIfNeeded();
      const box = await button.boundingBox();
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      try {
        await page.waitForTimeout(200);
        return await button.evaluate((el) => ({
          scale: getComputedStyle(el).scale,
          active: el.matches(":active"),
          top: el.getBoundingClientRect().top,
          hit: document.elementFromPoint(
            el.getBoundingClientRect().x + el.clientWidth / 2,
            el.getBoundingClientRect().y + el.clientHeight / 2,
          )?.tagName,
        }));
      } finally {
        await page.mouse.up();
      }
    };
    const normalScale = await press();
    assert.ok(
      Math.abs(parseFloat(normalScale.scale) - 0.98) < 0.001,
      `short press feedback ${JSON.stringify(normalScale)}`,
    );
    await page.emulateMedia({ reducedMotion: "reduce" });
    const reducedScale = await press();
    assert.ok(
      reducedScale.scale === "none" || parseFloat(reducedScale.scale) === 1,
      "reduced motion stays still",
    );
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.evaluate(() =>
      document.documentElement.setAttribute("data-world-effects", "economy"),
    );
    const economyScale = await press();
    assert.ok(
      economyScale.scale === "none" || parseFloat(economyScale.scale) === 1,
      "economy stays still",
    );
    await page.waitForFunction(
      () => document.querySelector(".rzn-suitup")?.dataset.rznState !== "live",
    );
    assert.deepEqual(errors, []);
    results.push({ width, fonts, focus, normalScale, reducedScale, economyScale });
    console.log(`PASS ${engine} ${width}: futuristic type, keyboard, press and calm tiers`);
    await context.close();
  }
  await writeFile(`${out}/report.json`, JSON.stringify(results, null, 2));
} finally {
  await browser.close();
}
