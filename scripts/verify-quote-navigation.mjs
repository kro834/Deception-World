import assert from "node:assert/strict";
import { chromium } from "playwright";

// Run against a built preview or a development server.
const base = process.env.BASE_URL || "http://localhost:8082";
const browser = await chromium.launch({ channel: "chrome" });
try {
  for (const width of [320, 390, 699, 700, 1280]) {
    for (const reducedMotion of ["reduce", "no-preference"]) {
      const page = await browser.newPage({
        viewport: { width, height: 844 },
        hasTouch: true,
        reducedMotion,
      });
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.goto(`${base}/world#quotes`, { waitUntil: "networkidle" });
      await page.waitForTimeout(1000);
      const rail = page.locator("#world-quotes-rail");
      const controls = page.locator(".wa-quote-controls");
      const counter = controls.locator("output");
      const previous = page.getByRole("button", { name: "前の名台詞へ", exact: true });
      const next = page.getByRole("button", { name: "次の名台詞へ", exact: true });
      const count = await rail.locator(".wa-quote-band > li").count();
      const waitForIndex = async (index) => {
        // Native smooth-scroll timing belongs to the browser. Verify its
        // endpoint rather than assuming a fixed animation duration.
        await page.waitForFunction(
          (index) => {
            const node = document.querySelector("#world-quotes-rail");
            const item = node.querySelectorAll(".wa-quote-band > li")[index];
            const inset = parseFloat(getComputedStyle(node).scrollPaddingLeft) || 0;
            const left =
              node.scrollLeft +
              item.getBoundingClientRect().left -
              node.getBoundingClientRect().left -
              node.clientLeft -
              inset;
            const target = Math.min(node.scrollWidth - node.clientWidth, Math.max(0, left));
            return Math.abs(node.scrollLeft - target) < 2;
          },
          index,
          { timeout: 5000 },
        );
        await page.waitForTimeout(250);
        assert.equal(
          await counter.innerText(),
          `${String(index + 1).padStart(2, "0")} / ${String(count).padStart(2, "0")}`,
        );
      };

      if (width >= 700) {
        assert.equal(await controls.isVisible(), false);
        assert.equal(await rail.evaluate((node) => node.tabIndex), -1);
      } else {
        assert.equal(await previous.isDisabled(), true);
        for (const button of [previous, next]) {
          const box = await button.boundingBox();
          assert.ok(box.width >= 48 && box.height >= 48);
        }
        await rail.focus();
        const pageY = await page.evaluate(() => scrollY);
        await page.keyboard.press("End");
        await waitForIndex(count - 1);
        assert.equal(await next.isDisabled(), true);
        assert.ok(Math.abs((await page.evaluate(() => scrollY)) - pageY) < 2, "End moved the page");
        await page.keyboard.press("Home");
        await waitForIndex(0);
        assert.equal(await previous.isDisabled(), true);
        assert.ok(
          Math.abs((await page.evaluate(() => scrollY)) - pageY) < 2,
          "Home moved the page",
        );
        await page.keyboard.press("ArrowRight");
        await waitForIndex(1);
        await page.keyboard.press("ArrowLeft");
        await waitForIndex(0);
        // Repeated taps must not lose steps to an in-flight smooth scroll.
        for (let i = 0; i < 3; i++) await next.tap();
        await waitForIndex(3);
        await previous.tap();
        await waitForIndex(2);
        if (width === 390) {
          const cdp = await page.context().newCDPSession(page);
          const box = await rail.boundingBox();
          const y = Math.max(100, box.y + 50);
          await cdp.send("Input.dispatchTouchEvent", {
            type: "touchStart",
            touchPoints: [{ x: width - 45, y }],
          });
          for (let i = 1; i <= 10; i++) {
            await cdp.send("Input.dispatchTouchEvent", {
              type: "touchMove",
              touchPoints: [{ x: width - 45 - i * 20, y }],
            });
            await page.waitForTimeout(25);
          }
          await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
          await page.waitForTimeout(1000);
          const swipedIndex = Number((await counter.innerText()).split("/")[0]) - 1;
          assert.ok(swipedIndex > 2, "swiping did not move the quote rail");
          await waitForIndex(swipedIndex);
          const before = await page.evaluate(() => scrollY);
          await cdp.send("Input.dispatchTouchEvent", {
            type: "touchStart",
            touchPoints: [{ x: 90, y }],
          });
          for (let i = 1; i <= 10; i++) {
            await cdp.send("Input.dispatchTouchEvent", {
              type: "touchMove",
              touchPoints: [{ x: 90, y: y - i * 12 }],
            });
            await page.waitForTimeout(20);
          }
          await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
          await page.waitForTimeout(400);
          assert.ok(
            (await page.evaluate(() => scrollY)) > before + 12,
            "vertical scrolling was blocked",
          );
          await cdp.detach();
          await rail.focus();
          await page.keyboard.press("Home");
          await waitForIndex(0);
          // Put the new arrow row at the floating Zeus button's resting
          // height. The button must step off the whole row, not just text.
          const dock = await page.locator(".zeus-button").last().boundingBox();
          const arrow = await next.boundingBox();
          await page.evaluate(
            (delta) => window.scrollBy({ top: delta, behavior: "instant" }),
            arrow.y + arrow.height / 2 - dock.y - dock.height / 2,
          );
          await page.waitForTimeout(1200);
          assert.equal(
            await next.evaluate((button) => {
              const rect = button.getBoundingClientRect();
              return button.contains(
                document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2),
              );
            }),
            true,
            "Zeus covered the quote navigation arrow",
          );
          await page.screenshot({
            path: `/tmp/world-quote-navigation-${width}-${reducedMotion}.png`,
          });
        }
      }
      assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
        false,
      );
      assert.deepEqual(errors, []);
      console.log(`PASS ${width}px / ${reducedMotion}: quote navigation and page scrolling`);
      await page.close();
    }
  }
} finally {
  await browser.close();
}
