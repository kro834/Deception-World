// BASE_URL=http://127.0.0.1:8851 node scripts/verify-transformation-lab-comparison.mjs
import assert from "node:assert/strict";
import { webkit } from "playwright";
import { checkedUrl } from "./browser-guard.mjs";

const base = checkedUrl(process.env.BASE_URL || "http://127.0.0.1:8851");
const url = new URL("/transformation-lab", base);
const browser = await webkit.launch();
const progress = "0.62";

async function drawn(page, count) {
  await page.waitForFunction(
    ({ count, progress }) => {
      const engines = [...document.querySelectorAll(".lab-engine")];
      return engines.length === count && engines.every((e) => e.dataset.rznDrawnAt === progress);
    },
    { count, progress },
  );
}

try {
  const page = await browser.newPage({
    viewport: { width: 768, height: 1024 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2,
  });
  await page.goto(
    url + "?rider=illusionculum&form=ultraMore&compare=meta-unitas&side=b&at=" + progress,
  );
  await drawn(page, 2);
  const [a, b] = await page
    .locator(".rzn-canvas")
    .evaluateAll((canvases) =>
      canvases.map((c) => [
        c.offsetWidth,
        c.offsetHeight,
        c.getBoundingClientRect().top,
        c.width,
        c.height,
      ]),
    );
  assert.deepEqual(a, b, "a wrapped form name must not displace its frame");
  assert.ok(a[3] >= a[0] && a[4] >= a[1], "live backing stores must fill the optical frames");
  const selected = await page.locator(".lab-side-b .rzn-canvas").elementHandle();
  for (const [width, height] of [
    [320, 568],
    [390, 844],
    [667, 375],
    [844, 390],
    [1024, 768],
  ]) {
    await page.setViewportSize({ width, height });
    await drawn(page, width <= 680 ? 1 : 2);
    assert.ok(
      await selected.evaluate(
        (c) =>
          c === document.querySelector(".lab-side-b .rzn-canvas") && c.width > 0 && c.height > 0,
      ),
      "resize discarded the selected engine",
    );
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), width);
    if (width === 320) {
      const buttons = await page
        .locator(".lab-transport")
        .first()
        .locator("button")
        .evaluateAll((items) => items.map((b) => b.getBoundingClientRect().toJSON()));
      assert.ok(buttons.every((b) => b.top === buttons[0].top && b.width >= 44 && b.height >= 44));
    }
    if (height <= 390) {
      await page.locator(".lab-stages").evaluate((e) => {
        window.scrollBy({ top: e.getBoundingClientRect().top - 4, behavior: "instant" });
      });
      const visible = await page
        .locator(".lab-engine, .lab-seek input, .lab-transport:first-child button")
        .evaluateAll((items) =>
          items.every((item) => {
            const r = item.getBoundingClientRect();
            return r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth;
          }),
        );
      assert.ok(
        visible,
        `the comparison frames and transport must fit together at ${width}×${height}`,
      );
      const sliderReceivesPointer = await page.getByRole("slider").evaluate((slider) => {
        const r = slider.getBoundingClientRect();
        return [0.1, 0.5, 0.9].every(
          (position) =>
            document.elementFromPoint(r.left + r.width * position, r.top + r.height / 2) === slider,
        );
      });
      assert.ok(sliderReceivesPointer, `the seek track must remain operable at ${width}×${height}`);
      const zoomFits = await page
        .getByRole("button", { name: "リアクター", exact: true })
        .evaluate((button) => {
          const label = document.createRange();
          label.selectNodeContents(button);
          const lines = label.getClientRects();
          return lines.length === 1 && lines[0].width <= button.clientWidth;
        });
      assert.ok(zoomFits, `the zoom label must fit on one line at ${width}×${height}`);
    }
  }
  await page.close();
  console.log(
    "Passed aligned comparison, mounted canvas continuity, phone transport and landscape seek.",
  );

  const pending = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true });
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  try {
    const secondaryImages = /\/[^?]*meta-unitas[^?]*\.(?:webp|avif|png)(?:\?|$)/;
    await pending.route(secondaryImages, async (route) => {
      await gate;
      await route.continue();
    });
    await pending.goto(url + "?rider=illusionculum&compare=meta-unitas&at=" + progress);
    await drawn(pending, 1);
    const play = pending.locator(".lab-transport button").first();
    await play.click();
    const loading = pending.waitForRequest(secondaryImages);
    await pending.setViewportSize({ width: 1024, height: 768 });
    await loading;
    await pending.locator(".lab-side-b .lab-stage-status").waitFor();
    // Headless WebKit keeps its pages visible. Exercise the same document
    // lifecycle signal while the new panel is held at an actual image request.
    await pending.evaluate(() => {
      Object.defineProperty(document, "hidden", { value: true, configurable: true });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await pending.waitForFunction(
      () => document.querySelector(".lab-transport button").textContent === "再生",
    );
    const pausedAt = await pending.getByRole("slider").inputValue();
    await pending.evaluate(() => {
      delete document.hidden;
      document.dispatchEvent(new Event("visibilitychange"));
    });
    release();
    await pending.waitForFunction(() => !document.querySelector(".lab-transport button").disabled);
    assert.equal(await pending.getByRole("slider").inputValue(), pausedAt);
    assert.equal(await play.textContent(), "再生");
    console.log("Passed pause and exact playhead retention while a second engine loads.");
  } finally {
    release();
  }
} finally {
  await browser.close();
}
