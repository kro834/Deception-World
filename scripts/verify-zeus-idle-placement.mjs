import assert from "node:assert/strict";
import { chromium } from "playwright";
import { checkedUrl } from "./browser-guard.mjs";

const base = checkedUrl(process.env.BASE_URL || "http://127.0.0.1:8082");
const browser = await chromium.launch({ channel: "chrome" });
let passed = 0;

try {
  for (const viewport of [
    { width: 390, height: 844 },
    { width: 1024, height: 768 },
  ]) {
    for (const reducedMotion of ["no-preference", "reduce"]) {
      const page = await browser.newPage({ viewport, hasTouch: true, reducedMotion });
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      try {
        await page.goto(new URL("/world", base).href);
        await page.waitForFunction(
          () =>
            document.documentElement.dataset.scrollMotionReady === "true" &&
            !document.documentElement.hasAttribute("data-route-scroll-settling"),
        );
        const button = page.locator(".zeus-button");
        await button.waitFor({ state: "visible" });
        await page.waitForTimeout(1500);
        const center = () =>
          button.evaluate((node) => {
            const rect = node.getBoundingClientRect();
            return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
          });
        const obstacleAt = (point) =>
          page.evaluate((point) => {
            document.getElementById("qa-zeus-obstacle")?.remove();
            // A browser-only fixture with the same class and geometry as a
            // real episode control. No repository or production data changes.
            const obstacle = document.createElement("button");
            obstacle.id = "qa-zeus-obstacle";
            obstacle.className = "episode-pickup-plus";
            obstacle.textContent = "+";
            obstacle.style.cssText = `position:fixed;left:${point.x - 24}px;top:${point.y - 24}px;right:auto;bottom:auto;width:48px;height:48px;transform:none;visibility:visible;pointer-events:auto;z-index:2`;
            document.body.append(obstacle);
            window.dispatchEvent(new Event("scroll"));
          }, point);
        const home = await center();
        await obstacleAt(home);
        await page.waitForTimeout(500);
        const avoided = await center();
        assert.ok(
          Math.hypot(avoided.x - home.x, avoided.y - home.y) > 20,
          "a real overlapping control must still be avoided",
        );
        await page.evaluate(() => {
          document.getElementById("qa-zeus-obstacle").remove();
          window.dispatchEvent(new Event("scroll"));
        });
        await page.waitForTimeout(400);
        const early = await center();
        await page.waitForTimeout(1200);
        const late = await center();
        assert.ok(
          Math.hypot(early.x - late.x, early.y - late.y) < 1,
          "a stopped page must not send the button home on a delayed timer",
        );
        for (let index = 0; index < 3; index++) {
          await page.evaluate(() => document.dispatchEvent(new Event("toggle")));
          await page.waitForTimeout(300);
          const reported = await center();
          assert.ok(
            Math.hypot(reported.x - late.x, reported.y - late.y) < 1,
            "passive layout reports must keep a clear temporary spot",
          );
        }
        await obstacleAt(late);
        await page.waitForTimeout(500);
        const moved = await center();
        assert.ok(
          Math.hypot(moved.x - late.x, moved.y - late.y) > 20,
          "stability must not pin the button over a new control",
        );
        assert.equal(
          await page.evaluate(() => localStorage.getItem("deception-world:zeus-button-position")),
          null,
          "automatic avoidance must never overwrite the user's position",
        );
        assert.deepEqual(errors, []);
        passed++;
        console.log(
          `PASS ${viewport.width}px / ${reducedMotion}: idle stability, repeated layout reports and obstacle avoidance`,
        );
      } finally {
        await page.close();
      }
    }
  }
} finally {
  await browser.close();
}
console.log(`${passed}/4 Zeus idle placement cases passed`);
