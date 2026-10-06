import assert from "node:assert/strict";
import { chromium } from "playwright";

const base = process.env.BASE_URL || "http://127.0.0.1:8084";
const browser = await chromium.launch({ channel: "chrome" });

try {
  for (const width of [320, 390, 768]) {
    const page = await browser.newPage({
      viewport: { width, height: 900 },
      hasTouch: true,
      isMobile: true,
    });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`${base}/world#riders`);
    const rail = page.locator('.rider-tabs[data-liquid-initialized="true"]');
    await rail.waitFor();
    const align = async () => {
      await rail.evaluate((el) =>
        window.scrollBy({ top: el.getBoundingClientRect().top - 110, behavior: "instant" }),
      );
      await page.waitForTimeout(550);
    };
    await align();
    const tabs = rail.locator('button[role="tab"]');
    assert.equal(await tabs.count(), 8);
    const geometry = () =>
      tabs.evaluateAll((nodes) =>
        nodes.map((node) => ({
          height: node.offsetHeight,
          width: node.offsetWidth,
          textHeight: node.querySelector("span").offsetHeight,
        })),
      );
    const before = await geometry();
    const cdp = await page.context().newCDPSession(page);
    const send = (type, points) =>
      cdp.send("Input.dispatchTouchEvent", { type, touchPoints: points });
    const point = async (index, edge = false) => {
      const box = await tabs.nth(index).boundingBox();
      return {
        x: box.x + box.width * (edge ? 0.8 : 0.5),
        y: box.y + box.height * (edge ? 0.7 : 0.5),
        id: 1,
      };
    };
    const selected = () => rail.locator('[aria-selected="true"]').getAttribute("id");
    const unlocked = () =>
      page.evaluate(() => !document.documentElement.hasAttribute("data-rail-lock"));

    // Native scrolling still wins before a hold is recognised.
    let from = await point(4);
    const scrollBefore = await page.evaluate(() => scrollY);
    await send("touchStart", [from]);
    for (let step = 1; step <= 5; step++)
      await send("touchMove", [{ ...from, y: from.y - step * 26 }]);
    await send("touchEnd", []);
    await page.waitForTimeout(350);
    assert.ok(await unlocked());
    assert.ok(
      await page.evaluate((y) => scrollY > y + 30, scrollBefore),
      "the page scrolls across the selector",
    );
    assert.equal(await selected(), "rider-tab-saga");
    await align();

    // A quick tap commits on release, without waiting for the hold timer.
    from = await point(1);
    await send("touchStart", [from]);
    await send("touchEnd", []);
    await page.waitForTimeout(50);
    assert.equal(await selected(), "rider-tab-realm");
    assert.ok(await unlocked());
    await page.waitForTimeout(700);
    await align();
    await page.evaluate(() => {
      window.riderCommits = 0;
      document
        .querySelector(".rider-tabs")
        .addEventListener("railselect", () => window.riderCommits++);
    });

    // An off-centre hold is picked up exactly where it was touched.
    from = await point(0, true);
    await send("touchStart", [from]);
    await page.waitForTimeout(400);
    assert.equal(await rail.getAttribute("data-liquid-held"), "true");
    assert.equal(await unlocked(), false);
    const heldScroll = await page.evaluate(() => scrollY);
    const startLens = await rail.locator(".liquid-selection-lens").boundingBox();
    await send("touchMove", [{ ...from, x: from.x + 4, y: from.y + 4 }]);
    await page.waitForTimeout(80);
    const movedLens = await rail.locator(".liquid-selection-lens").boundingBox();
    assert.ok(
      Math.abs(movedLens.x - startLens.x) < 10,
      `an edge press does not jump to the finger centre: ${JSON.stringify({ startLens, movedLens, from })}`,
    );
    const to = await point(7, true);
    for (let step = 1; step <= 6; step++) {
      await send("touchMove", [
        {
          ...from,
          x: from.x + ((to.x - from.x) * step) / 6,
          y: from.y + ((to.y - from.y) * step) / 6,
        },
      ]);
      await page.waitForTimeout(40);
    }
    assert.equal(await selected(), "rider-tab-realm", "drag preview does not reload the portrait");
    assert.equal(await page.evaluate(() => window.riderCommits), 0);
    assert.ok(
      (await page.locator("[data-rider-selection-status]").textContent()).includes("サイファー"),
    );
    assert.equal(await page.evaluate(() => scrollY), heldScroll);
    assert.deepEqual(await geometry(), before, "holding does not resize the cells or names");
    if (width === 390) await page.screenshot({ path: "/tmp/rider-selector-candidate-held.png" });
    await send("touchEnd", []);
    await page.waitForTimeout(80);
    assert.equal(await selected(), "rider-tab-cipher");
    assert.equal(await page.evaluate(() => window.riderCommits), 1);
    assert.ok(await unlocked());

    // A second finger cancels; releasing either finger cannot commit a candidate.
    await page.waitForTimeout(700);
    await align();
    from = await point(0);
    await send("touchStart", [from]);
    await page.waitForTimeout(400);
    await send("touchStart", [from, { ...from, x: from.x + 25, id: 2 }]);
    assert.ok(await unlocked());
    await send("touchEnd", []);
    assert.equal(await selected(), "rider-tab-cipher");

    await tabs.nth(7).focus();
    await page.keyboard.press("Home");
    assert.equal(await selected(), "rider-tab-saga");
    await page.keyboard.press("ArrowDown");
    assert.equal(await selected(), "rider-tab-realm");
    assert.equal(await tabs.nth(1).evaluate((node) => node === document.activeElement), true);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    assert.deepEqual(errors, []);
    console.log(
      `PASS ${width}px: native scroll, tap, held offset, 2D preview, one commit, multitouch cancellation, keyboard and stable dimensions`,
    );
    await page.close();
  }
} finally {
  await browser.close();
}
