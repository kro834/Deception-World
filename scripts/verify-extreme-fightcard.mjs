import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";

const base = process.env.BASE_URL || "http://127.0.0.1:4194";
const auditOut = process.env.AUDIT_OUT;
if (auditOut) await mkdir(auditOut, { recursive: true });
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
    const p14Visibility = await page
      .locator(".rxs-p14-overview dl > div:nth-child(3)")
      .evaluate((row) =>
        new Promise((resolve) => {
          const value = row.querySelector("dd");
          const start = performance.now();
          let rowOpacity = 1;
          let valueOpacity = 1;
          const sample = () => {
            rowOpacity = Math.min(rowOpacity, Number(getComputedStyle(row).opacity));
            valueOpacity = Math.min(valueOpacity, Number(getComputedStyle(value).opacity));
            if (performance.now() - start < 1200) requestAnimationFrame(sample);
            else resolve({ rowOpacity, valueOpacity });
          };
          sample();
        }),
      );
    assert.ok(
      p14Visibility.rowOpacity > 0.99,
      `P14 TUNING parent fades out: ${p14Visibility.rowOpacity} at ${width}px`,
    );
    assert.ok(
      p14Visibility.valueOpacity > 0.99,
      `P14 result disappears: ${p14Visibility.valueOpacity} at ${width}px`,
    );
    if (auditOut) await page.screenshot({ path: `${auditOut}/${width}-tuning.png` });

    await page.locator("#stages").evaluate((el) => el.scrollIntoView({ behavior: "instant" }));
    await page.waitForTimeout(800);
    const labels = await page
      .locator('.exs-stage-tabs button[role="tab"] > :is(span, small)')
      .evaluateAll((els) =>
        els.map((el) => {
          const box = el.getBoundingClientRect();
          const parent = el.parentElement.getBoundingClientRect();
          return {
            text: el.textContent,
            height: box.height,
            line: parseFloat(getComputedStyle(el).lineHeight),
            whiteSpace: getComputedStyle(el).whiteSpace,
            fits: box.left >= parent.left && box.right <= parent.right,
            font: parseFloat(getComputedStyle(el).fontSize),
          };
        }),
      );
    for (const label of labels) {
      assert.ok(
        label.height <= label.line + 1 && label.fits,
        `${width}px name/code wraps/overflows: ${JSON.stringify(label)}`,
      );
      assert.ok(label.font >= 12);
    }
    if (width === 320) {
      // Owner (2026-10-23): 不要なセカンダリラベルを削除（レイアウトで説明）: a tab holds its
      // form's name alone (the English code under it went).
      for (const text of ["ウルトラ"]) {
        const label = labels.find((item) => item.text?.trim() === text);
        assert.ok(label, `320px ULTRA tab is missing ${text}`);
        assert.ok(
          label.height <= label.line + 1 && label.fits,
          `320px ULTRA ${text} must stay on one line inside its tab: ${JSON.stringify(label)}`,
        );
      }
    }
    if (width >= 1100) {
      for (const id of ["stages", "system"]) {
        await page.locator(`#${id}`).evaluate((el) => el.scrollIntoView({ behavior: "instant" }));
        await page.waitForTimeout(600);
        const lines = await page.locator(`#${id} > .rxs-section-heading`).evaluate((el) => {
          const box = el.getBoundingClientRect();
          const nodes = [...el.querySelectorAll(".exo-line")];
          const [left, right] = nodes.map((line) => line.getBoundingClientRect());
          return {
            sameRow: Math.abs(left.top - right.top) < 1,
            rightCorner: right.left >= box.left + box.width / 2,
            fits:
              left.right <= right.left + 1 &&
              right.right <= box.right + 1 &&
              nodes.every(
                (line) =>
                  line.scrollWidth <= line.clientWidth + 1 &&
                  line.getBoundingClientRect().height <=
                    parseFloat(getComputedStyle(line).lineHeight) + 1,
              ),
          };
        });
        assert.ok(
          lines.sameRow && lines.rightCorner && lines.fits,
          `${width}px ${id} headline must fill both corners: ${JSON.stringify(lines)}`,
        );
        if (auditOut) await page.screenshot({ path: `${auditOut}/${width}-${id}.png` });
      }
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
        p14MinimumOpacity: p14Visibility.valueOpacity,
        p14MinimumRowOpacity: p14Visibility.rowOpacity,
        labels: "pass",
        heading: "pass",
      }),
    );
    await page.close();
  }
} finally {
  await browser.close();
}
