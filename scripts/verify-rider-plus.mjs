import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";
import { checkedOutputPath, checkedUrl } from "./browser-guard.mjs";

const base = checkedUrl(process.env.BASE_URL || "http://127.0.0.1:8082");
const output = process.env.AUDIT_OUT || "/tmp/rider-plus-audit";
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: "chrome" });
async function position(page, control) {
  for (let attempt = 0; attempt < 2; attempt++) {
    await control.evaluate((node) => node.scrollIntoView({ block: "center", behavior: "instant" }));
    await page.waitForTimeout(180);
  }
}
async function inspect(control, label, pressed = false) {
  const metrics = await control.evaluate((node) => {
    const thumb = node.querySelector(".ios-slide-open-thumb");
    const svg = thumb.querySelector("svg");
    const path = svg.querySelector("path");
    const rect = (el) => el.getBoundingClientRect().toJSON();
    return {
      button: rect(node),
      thumb: rect(thumb),
      svg: rect(svg),
      path: rect(path),
      color: getComputedStyle(svg).color,
      background: getComputedStyle(thumb).backgroundColor,
      stroke: parseFloat(getComputedStyle(path).strokeWidth),
      ring: getComputedStyle(thumb.querySelector("i")).display,
    };
  });
  const { button, thumb, svg, path } = metrics;
  assert.equal(metrics.color, "rgb(255, 255, 255)", `${label}: white glyph`);
  assert.ok(
    ["rgb(16, 26, 40)", "rgb(11, 20, 33)"].includes(metrics.background),
    `${label}: opaque dark surface`,
  );
  assert.ok(
    path.width >= (pressed ? 15 : 17) && path.height >= (pressed ? 15 : 17),
    `${label}: plus must have a readable painted size, got ${path.width}x${path.height}`,
  );
  assert.ok(metrics.stroke >= 3, `${label}: plus stroke`);
  assert.equal(metrics.ring, "none", `${label}: inner ring must not compete with glyph`);
  assert.ok(
    thumb.x >= button.x &&
      thumb.right <= button.right &&
      thumb.y >= button.y &&
      thumb.bottom <= button.bottom,
    `${label}: thumb inside rail`,
  );
  assert.ok(
    svg.x >= thumb.x && svg.right <= thumb.right && svg.y >= thumb.y && svg.bottom <= thumb.bottom,
    `${label}: icon inside thumb`,
  );
  assert.ok(
    Math.abs(svg.x + svg.width / 2 - thumb.x - thumb.width / 2) < 1,
    `${label}: centered x`,
  );
  assert.ok(
    Math.abs(svg.y + svg.height / 2 - thumb.y - thumb.height / 2) < 1,
    `${label}: centered y`,
  );
  assert.ok(button.height >= 44 && button.width >= 44, `${label}: touch target`);
  return metrics;
}
try {
  for (const [width, height] of [
    [320, 740],
    [390, 844],
    [1024, 768],
  ]) {
    const page = await browser.newPage({
      viewport: { width, height },
      hasTouch: true,
      isMobile: true,
    });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(new URL("/world", base).href);
    await page
      .locator('.rider-tabs[data-liquid-initialized="true"]')
      .waitFor({ state: "attached" });
    await page.waitForFunction(
      () => !document.documentElement.hasAttribute("data-route-scroll-settling"),
    );
    const tabs = page.locator('.rider-tabs button[role="tab"]');
    assert.equal(await tabs.count(), 8);
    const control = page.locator(".rider-dossier-open");
    const cdp = await page.context().newCDPSession(page);
    const touch = (type, point) =>
      cdp.send("Input.dispatchTouchEvent", { type, touchPoints: point ? [point] : [] });
    let expectedSize;
    for (let index = 0; index < 8; index++) {
      await tabs.nth(index).click();
      await page.waitForFunction(
        (id) =>
          document.querySelector("#rider-active-panel")?.getAttribute("aria-labelledby") === id,
        await tabs.nth(index).getAttribute("id"),
      );
      await position(page, control);
      const metrics = await inspect(control, `${width}/rider-${index + 1}`);
      const size = [metrics.button.width, metrics.button.height];
      expectedSize ??= size;
      assert.deepEqual(size, expectedSize, "all rider controls retain identical dimensions");
      const point = {
        x: metrics.thumb.x + metrics.thumb.width / 2,
        y: metrics.thumb.y + metrics.thumb.height / 2,
      };
      assert.equal(
        await control.evaluate(
          (node, p) => node.contains(document.elementFromPoint(p.x, p.y)),
          point,
        ),
        true,
        "visible hit target",
      );
      await touch("touchStart", point);
      // The hold timer runs on the page main thread and can be delayed while
      // a newly selected rider's artwork/layout settles. Wait for the actual
      // state transition instead of sampling at a fixed 100 ms boundary.
      await page.waitForFunction(
        () => document.querySelector(".rider-dossier-open")?.getAttribute("data-dragging") === "true",
        { timeout: 500 },
      );
      assert.equal(await control.getAttribute("data-dragging"), "true");
      await inspect(control, `${width}/rider-${index + 1}/hold`, true);
      await touch("touchMove", { x: point.x + 16, y: point.y });
      await page.waitForTimeout(40);
      await inspect(control, `${width}/rider-${index + 1}/drag`, true);
      await touch("touchEnd");
      await page.waitForTimeout(350);
      assert.equal(await control.getAttribute("data-dragging"), "false");
      assert.equal(new URL(page.url()).pathname, "/world", "short slide cancels navigation");
      if (index === 0 || index === 7)
        await page.screenshot({
          path: checkedOutputPath(`${output}/${width}-rider-${index + 1}.png`, [output]),
        });
    }
    // The same enlarged plus still opens the selected rider with a tap.
    const final = await inspect(control, `${width}/tap`);
    await page.touchscreen.tap(
      final.thumb.x + final.thumb.width / 2,
      final.thumb.y + final.thumb.height / 2,
    );
    await page.waitForURL("**/riders/cipher");
    assert.deepEqual(errors, []);
    console.log(
      `PASS ${width}: all 8 plus glyphs, hold/drag/cancel, unchanged geometry, tap navigation`,
    );
    await page.close();
  }
} finally {
  await browser.close();
}
