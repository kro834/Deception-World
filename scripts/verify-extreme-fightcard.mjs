import assert from "node:assert/strict";
import { chromium } from "playwright";

const base = process.env.BASE_URL || "http://127.0.0.1:4194";
const browser = await chromium.launch({ channel: process.env.PW_BROWSER_CHANNEL || "chrome" });
try {
  for (const [width, height] of [
    [320, 740],
    [390, 844],
    [1100, 900],
    [1440, 1000],
    [1024, 1366],
  ]) {
    const page = await browser.newPage({ viewport: { width, height }, hasTouch: true });
    await page.goto(`${base}/extreme-saga`);
    await page.waitForFunction(
      () =>
        !document.documentElement.hasAttribute("data-loading") &&
        document.querySelector('.exs-page[data-motion-ready="true"]'),
    );
    await page.waitForTimeout(250);
    const punch = page.locator("#performance .exi-stage > article:first-child");
    await punch.evaluate((el) =>
      window.scrollTo({
        top: scrollY + el.getBoundingClientRect().top - innerHeight + 120,
        behavior: "instant",
      }),
    );
    await page.waitForFunction(
      () =>
        !!document.querySelector("#performance .exi-stage > article")?.getAttribute("data-exi-hit"),
      null,
      { timeout: 700 },
    );

    const overview = page.locator(".rxs-p14-overview");
    await overview.evaluate((el) =>
      window.scrollTo({
        top: scrollY + el.getBoundingClientRect().top - innerHeight / 2,
        behavior: "instant",
      }),
    );
    const minimum = await page.locator(".rxs-p14-overview dl > div:nth-child(3) dd").evaluate(
      (el) =>
        new Promise((resolve) => {
          const start = performance.now();
          let opacity = 1;
          const sample = () => {
            opacity = Math.min(opacity, Number(getComputedStyle(el).opacity));
            if (performance.now() - start < 1200) requestAnimationFrame(sample);
            else resolve(opacity);
          };
          sample();
        }),
    );
    assert.ok(minimum > 0.99, `P14 result disappears: ${minimum} at ${width}px`);

    await page.locator("#stages").evaluate((el) => el.scrollIntoView({ behavior: "instant" }));
    await page.waitForTimeout(800);
    const labels = await page.locator(".exs-stage-tabs small").evaluateAll((els) =>
      els.map((el) => {
        const box = el.getBoundingClientRect();
        const parent = el.parentElement.getBoundingClientRect();
        return {
          text: el.textContent,
          height: box.height,
          line: parseFloat(getComputedStyle(el).lineHeight),
          fits: box.left >= parent.left && box.right <= parent.right,
          font: parseFloat(getComputedStyle(el).fontSize),
        };
      }),
    );
    for (const label of labels) {
      assert.ok(
        label.height <= label.line + 1 && label.fits,
        `${width}px label wraps/overflows: ${JSON.stringify(label)}`,
      );
      assert.ok(label.font >= 12);
    }
    if (width >= 1100) {
      for (const id of ["performance", "p14"]) {
        await page.locator(`#${id}`).evaluate((el) => el.scrollIntoView({ behavior: "instant" }));
        await page.waitForTimeout(600);
        const corners = await page.locator(`#${id} > .rxs-section-heading`).evaluate((el) => {
          const box = el.getBoundingClientRect();
          const title = el.querySelector("h2").getBoundingClientRect();
          const intro = el.querySelector(":scope > span").getBoundingClientRect();
          return {
            right: intro.left > box.left + box.width * 0.5,
            separate: title.right <= intro.left + 1,
          };
        });
        assert.ok(
          corners.right && corners.separate,
          `${width}px ${id} lacks separate right corner`,
        );
      }
    }
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0);
    console.log(
      JSON.stringify({
        viewport: `${width}x${height}`,
        roundTrigger: "pass",
        p14MinimumOpacity: minimum,
        labels: "pass",
        heading: "pass",
      }),
    );
    await page.close();
  }
} finally {
  await browser.close();
}
