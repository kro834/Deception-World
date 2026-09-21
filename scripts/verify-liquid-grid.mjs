import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium, webkit } from "playwright";

const base = process.env.BASE_URL || "http://127.0.0.1:8082";
const engine = process.env.PW_ENGINE || "chromium";
const output = process.env.AUDIT_OUT || `/tmp/liquid-grid-${engine}`;
await mkdir(output, { recursive: true });
const browser = await (engine === "webkit" ? webkit : chromium).launch(
  engine === "webkit" ? {} : { channel: "chrome" },
);
const center = (box) => ({ x: box.x + box.width / 2, y: box.y + box.height / 2 });

try {
  for (const viewport of [
    { width: 390, height: 844 },
    { width: 1024, height: 768 },
  ]) {
    const page = await browser.newPage({ viewport, hasTouch: true, isMobile: true });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`${base}/world`, { waitUntil: "networkidle" });
    await page.waitForFunction(
      () => !document.documentElement.hasAttribute("data-route-scroll-settling"),
    );
    const rail = page.locator(".rider-tabs");
    await page
      .locator('.rider-tabs[data-liquid-initialized="true"]')
      .waitFor({ state: "attached" });
    const tabs = rail.locator('button[role="tab"]');
    const cdp = engine === "chromium" ? await page.context().newCDPSession(page) : null;
    const event = async (type, point) => {
      if (cdp)
        await cdp.send("Input.dispatchTouchEvent", { type, touchPoints: point ? [point] : [] });
      else if (type === "touchStart") {
        await page.mouse.move(point.x, point.y);
        await page.mouse.down();
      } else if (type === "touchMove") await page.mouse.move(point.x, point.y);
      else await page.mouse.up();
    };

    // The phone rail is a two-column grid; landscape iPad intentionally keeps
    // its existing one-column dossier layout. Exercise both without changing it.
    const grid = viewport.width < 768;
    const paths = grid
      ? [
          ["right-then-down", [0, 1, 3]],
          ["down-then-right", [0, 2, 3]],
          ["diagonal", [0, 3]],
          ["across-all-rows", [0, 7]],
        ]
      : [
          ["vertical-full-length", [0, 7]],
          ["vertical-backtrack", [0, 3, 1]],
        ];
    for (const [name, indices] of paths) {
      await tabs.first().click();
      for (let attempt = 0; attempt < 2; attempt++) {
        await rail.evaluate((node) => {
          const headerBottom = document.querySelector(".topbar").getBoundingClientRect().bottom;
          window.scrollBy({
            top: node.getBoundingClientRect().top - headerBottom - 24,
            behavior: "instant",
          });
        });
        await page.waitForTimeout(200);
      }
      const boxes = await tabs.evaluateAll((nodes) =>
        nodes.map((node) => {
          const { x, y, width, height } = node.getBoundingClientRect();
          return { x, y, width, height };
        }),
      );
      if (grid) {
        assert.ok(
          Math.abs(boxes[0].x - boxes[1].x) > 40,
          `${viewport.width}: two columns required`,
        );
      } else {
        assert.ok(
          boxes.every((box) => Math.abs(box.x - boxes[0].x) < 2),
          "iPad keeps one column",
        );
      }
      assert.ok(
        Math.abs(boxes[0].y - boxes[2].y) > 40,
        `${viewport.width}: multiple rows required`,
      );
      const points = indices.map((index) => center(boxes[index]));
      assert.ok(
        points.every((point) => point.y > 80 && point.y < viewport.height - 8),
        "path stays visible",
      );
      const before = await page.evaluate(() => scrollY);
      await event("touchStart", points[0]);
      await page.waitForTimeout(160);
      assert.equal(
        await rail.getAttribute("data-liquid-held"),
        "true",
        "hold still enlarges the lens",
      );
      assert.equal(
        await page.evaluate(() => document.documentElement.hasAttribute("data-rail-lock")),
        true,
      );
      for (let segment = 1; segment < points.length; segment++) {
        for (let step = 1; step <= 12; step++) {
          const from = points[segment - 1],
            to = points[segment];
          await event("touchMove", {
            x: from.x + ((to.x - from.x) * step) / 12,
            y: from.y + ((to.y - from.y) * step) / 12,
          });
          await page.waitForTimeout(17);
        }
        const lensCenter = center(
          await rail.locator(":scope > .liquid-selection-lens").boundingBox(),
        );
        const point = points[segment];
        await page.screenshot({
          path: `${output}/${viewport.width}-${name}-segment-${segment}.png`,
        });
        assert.ok(
          Math.abs(lensCenter.x - point.x) < 14 && Math.abs(lensCenter.y - point.y) < 14,
          `${viewport.width} ${name}: lens stopped following both axes: ${JSON.stringify({ lensCenter, point })}`,
        );
      }
      assert.ok(
        Math.abs((await page.evaluate(() => scrollY)) - before) < 2,
        "page stays locked during drag",
      );
      await event("touchEnd");
      const destination = indices.at(-1);
      await page.waitForFunction(
        (id) =>
          document.querySelector("#rider-active-panel")?.getAttribute("aria-labelledby") === id,
        await tabs.nth(destination).getAttribute("id"),
      );
      assert.equal(await tabs.nth(destination).getAttribute("aria-selected"), "true");
      assert.equal(
        await page.evaluate(() => document.documentElement.hasAttribute("data-rail-lock")),
        false,
      );
      console.log(
        `${engine} ${viewport.width} ${name}: lens movement, selected panel and scroll unlock passed`,
      );
    }
    assert.deepEqual(errors, []);
    await page.close();
  }
} finally {
  await browser.close();
}
