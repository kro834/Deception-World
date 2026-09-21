import assert from "node:assert/strict";
import { chromium, webkit } from "playwright";

const origin = process.env.BASE_URL || "http://localhost:8080";
const engine = process.env.PW_ENGINE || "chromium";
// Chromium delivers native touch through CDP. Desktop WebKit provides a
// wheel/geometry diagnostic, not a claim of testing physical iOS Safari.
const browser = await (engine === "webkit" ? webkit : chromium).launch(
  engine === "webkit" ? {} : { channel: "chrome" },
);

try {
  for (const [width, height, reducedMotion] of [
    [390, 844, "no-preference"],
    [1024, 768, "no-preference"],
    [390, 844, "reduce"],
    [1280, 960, "reduce"],
  ]) {
    const context = await browser.newContext({
      viewport: { width, height },
      hasTouch: true,
      isMobile: engine === "chromium",
      reducedMotion,
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(origin);
    await page.locator(".cine-stage.is-complete").waitFor();
    await page.getByRole("button", { name: "ENTER THE WORLD", exact: true }).tap();
    await page.waitForURL(/\/world$/);

    const arriving = page.locator(
      '[data-opening-handoff-root][data-opening-handoff-phase="arriving"]',
    );
    await arriving.waitFor({ state: "attached" });
    const before = await page.evaluate(() => ({
      scrollY,
      loading: document.documentElement.hasAttribute("data-loading"),
      pointerEvents: getComputedStyle(document.querySelector("[data-opening-handoff-root]"))
        .pointerEvents,
      mode: document.querySelector("[data-opening-handoff-root]").dataset.openingHandoffMode,
      hitOverlay: Boolean(
        document
          .elementFromPoint(innerWidth * 0.7, innerHeight * 0.8)
          ?.closest("[data-opening-handoff-root]"),
      ),
    }));
    assert.equal(before.loading, false, "arrival must release the document loading lock");
    assert.equal(before.pointerEvents, "none", "arrival artwork must pass touch input through");
    assert.equal(before.hitOverlay, false, "a decorative child must not intercept input either");

    const start = { x: width * 0.7, y: height * 0.8 };
    if (engine === "chromium") {
      const cdp = await context.newCDPSession(page);
      await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [start] });
      for (let step = 1; step <= 10; step += 1) {
        await cdp.send("Input.dispatchTouchEvent", {
          type: "touchMove",
          touchPoints: [{ x: start.x, y: start.y - step * 45 }],
        });
      }
      await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    } else {
      await page.mouse.move(start.x, start.y);
      await page.mouse.wheel(0, 450);
    }
    await page.waitForTimeout(120);
    const after = await page.evaluate(() => scrollY);
    assert.ok(
      after > before.scrollY + 40,
      `arrival touch should scroll the world (${before.scrollY} -> ${after})`,
    );
    assert.deepEqual(errors, []);
    console.log(
      JSON.stringify({
        engine,
        viewport: `${width}x${height}`,
        phase: "arriving",
        mode: before.mode,
        scroll: after - before.scrollY,
      }),
    );
    await context.close();
  }
} finally {
  await browser.close();
}
