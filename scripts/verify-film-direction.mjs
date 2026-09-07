import assert from "node:assert/strict";
import { chromium } from "playwright";

// Geometry and screenshots on actual rendered pages; device emulation is not
// a claim of testing physical Safari or Android hardware.
const base = process.env.BASE_URL || "http://localhost:8080";
const browser = await chromium.launch({ channel: process.env.PW_BROWSER_CHANNEL || "chrome" });
const screens = [
  [320, 740],
  [375, 812],
  [393, 851],
  [430, 932],
  [1024, 768],
  [1376, 1008],
  [844, 390],
];
const iphone =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1";
const android =
  "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 Chrome/131.0.0.0 Mobile Safari/537.36";
const failures = [];

async function checkBounds(page, label) {
  const bounds = await page.evaluate(() => {
    const contains = (outer, inner) =>
      inner.left >= outer.left - 1 &&
      inner.right <= outer.right + 1 &&
      inner.top >= outer.top - 1 &&
      inner.bottom <= outer.bottom + 1;
    return {
      horizontalOverflow: document.documentElement.scrollWidth > innerWidth + 1,
      sliders: [...document.querySelectorAll(".ios-slide-open")].map((node) => {
        const rect = node.getBoundingClientRect();
        const thumb = node.querySelector(".ios-slide-open-thumb").getBoundingClientRect();
        return {
          className: node.className,
          contained: contains(rect, thumb),
          width: rect.width,
          height: rect.height,
          thumb: thumb.toJSON(),
        };
      }),
      episodes: [...document.querySelectorAll(".episode-pickup-plus")].map((node) => {
        const surface = node
          .closest(".episode-card")
          .querySelector(".episode-card-surface")
          .getBoundingClientRect();
        return {
          contained: contains(surface, node.getBoundingClientRect()),
          surface: surface.toJSON(),
          plus: node.getBoundingClientRect().toJSON(),
        };
      }),
    };
  });
  if (bounds.horizontalOverflow) failures.push(`${label}: horizontal overflow`);
  for (const slider of bounds.sliders) {
    if (!slider.contained || slider.height < 44)
      failures.push(`${label}: ${JSON.stringify(slider)}`);
  }
  for (const episode of bounds.episodes) {
    if (!episode.contained) failures.push(`${label}: EP plus ${JSON.stringify(episode)}`);
  }
  return {
    sliders: bounds.sliders.length,
    episodes: bounds.episodes.length,
    horizontalOverflow: bounds.horizontalOverflow,
  };
}

try {
  for (const [width, height] of screens) {
    const page = await browser.newPage({
      viewport: { width, height },
      hasTouch: true,
      isMobile: true,
      userAgent: width === 393 ? android : iphone,
    });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    try {
      await page.goto(`${base}/world`);
      await page.waitForTimeout(2400);
      const hero = await page.evaluate(() => {
        const identity = document.querySelector(".film-hero-identity").getBoundingClientRect();
        const topbar = document.querySelector(".topbar").getBoundingClientRect();
        const labels = [...document.querySelectorAll(".poster-control-cluster button b")];
        return {
          clearOfHeader: identity.top >= topbar.bottom,
          labelsFit: labels.every(
            (n) => n.scrollWidth <= n.clientWidth + 1 && n.scrollHeight <= n.clientHeight + 1,
          ),
        };
      });
      if (!hero.clearOfHeader || !hero.labelsFit)
        failures.push(`world ${width}: ${JSON.stringify(hero)}`);
      await page.screenshot({ path: `/tmp/film-world-${width}.png` });
      const worldBounds = await checkBounds(page, `world ${width}`);
      // Inspect the plus during a real touch drag, not just its resting box.
      const opener = page.locator(".world-column-slide-open");
      await opener.click({ trial: true });
      await page.waitForTimeout(400);
      const track = await opener.boundingBox();
      const thumb = await opener.locator(".ios-slide-open-thumb").boundingBox();
      const start = { x: thumb.x + thumb.width / 2, y: thumb.y + thumb.height / 2 };
      const cdp = await page.context().newCDPSession(page);
      try {
        await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [start] });
        await page.waitForTimeout(120);
        for (let step = 1; step <= 4; step++) {
          await cdp.send("Input.dispatchTouchEvent", {
            type: "touchMove",
            touchPoints: [
              { x: start.x + ((track.width - thumb.width - 8) * 0.3 * step) / 4, y: start.y },
            ],
          });
          await page.waitForTimeout(30);
          await checkBounds(page, `world ${width} during drag ${step}`);
        }
        assert.equal(await opener.getAttribute("data-dragging"), "true");
        await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
        await page.waitForTimeout(550);
        assert.equal(
          await page.locator(".world-column-dialog").evaluate((node) => node.open),
          false,
        );
        await checkBounds(page, `world ${width} drag reset`);
      } finally {
        await cdp.detach();
      }
      if (width === 375 || width === 1376) {
        await page.locator(".story-layout").scrollIntoViewIfNeeded();
        await page.waitForTimeout(650);
        await page.screenshot({ path: `/tmp/film-story-${width}.png` });
        await page.locator(".side-panel-trigger").tap();
        await page.waitForTimeout(500);
        await page.screenshot({ path: `/tmp/film-menu-${width}.png` });
        await page.keyboard.press("Escape");
      }
      await page.goto(`${base}/riders/saga`);
      await page.waitForTimeout(1800);
      const riderBounds = await checkBounds(page, `rider ${width}`);
      if ([375, 1376, 844].includes(width)) {
        await page.goto(`${base}/dream-chapter`);
        await page.waitForTimeout(1800);
        const dreamBounds = await checkBounds(page, `dream ${width}`);
        const navLabelsFit = await page
          .locator(".dream-chapter-nav a > span")
          .evaluateAll((labels) =>
            labels.every((node) => node.scrollWidth <= node.clientWidth + 1),
          );
        if (!navLabelsFit) failures.push(`dream ${width}: chapter labels overflow`);
        await page.screenshot({ path: `/tmp/film-dream-${width}.png` });
        console.log(JSON.stringify({ width, height, hero, worldBounds, riderBounds, dreamBounds }));
      } else {
        console.log(JSON.stringify({ width, height, hero, worldBounds, riderBounds }));
      }
      if (errors.length) failures.push(`${width}: ${errors.join("; ")}`);
    } finally {
      await page.close();
    }
  }
} finally {
  await browser.close();
}
assert.deepEqual(failures, [], failures.join("\n"));
