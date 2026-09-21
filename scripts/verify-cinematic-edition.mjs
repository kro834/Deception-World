import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium, webkit } from "playwright";

// Run against a fresh production preview; never mutate production or source.
const base = process.env.BASE_URL || "http://localhost:8082";
const engine = process.env.PW_ENGINE || "chromium";
const output = process.env.AUDIT_OUT || `/tmp/cinematic-${engine}`;
await mkdir(output, { recursive: true });
const browser = await (engine === "webkit" ? webkit : chromium).launch(
  engine === "webkit" ? {} : { channel: process.env.PW_BROWSER_CHANNEL || "chrome" },
);
const results = [];
const rect = async (page, selector) => {
  const box = await page.locator(selector).first().boundingBox();
  assert.ok(box, `${selector} is visible`);
  return box;
};
const noOverflow = async (page) => {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  assert.ok(overflow <= 1, `horizontal overflow: ${overflow}px`);
};
const luminance = (color) => {
  const rgb = color
    .match(/[\d.]+/g)
    .slice(0, 3)
    .map(Number)
    .map((value) => {
      const n = value / 255;
      return n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4;
    });
  return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
};

try {
  for (const viewport of [
    { width: 390, height: 844 },
    { width: 1194, height: 834 },
    { width: 1024, height: 768 },
  ]) {
    const page = await browser.newPage({ viewport, hasTouch: true, reducedMotion: "reduce" });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    for (const route of [
      "/world",
      "/dream-chapter",
      "/rexonance-saga",
      "/extreme-saga",
      "/final-stage",
    ]) {
      await page.goto(base + route, { waitUntil: "networkidle" });
      await noOverflow(page);
      if (route === "/world") {
        const links = page.locator(".topbar nav a");
        const menu = await rect(page, ".topbar-actions");
        for (let i = 0; i < (await links.count()); i++) {
          const link = links.nth(i);
          const box = await link.boundingBox();
          assert.ok(box.x + box.width <= menu.x, "nav must not overlap menu");
          assert.ok(
            await link.evaluate((el) =>
              el.contains(
                document.elementFromPoint(
                  el.getBoundingClientRect().x + el.clientWidth / 2,
                  el.getBoundingClientRect().y + el.clientHeight / 2,
                ),
              ),
            ),
            "nav center is unobstructed",
          );
        }
        const cta = await rect(page, ".hero .primary-action");
        if (viewport.width === 390)
          assert.ok(
            cta.y + cta.height <= viewport.height,
            "phone entrance visible without scrolling",
          );
        const story = await page.locator(".story-layout").evaluate((el) => ({
          bg: getComputedStyle(el).backgroundColor,
          ink: getComputedStyle(el.querySelector("h2")).color,
        }));
        const values = [luminance(story.bg), luminance(story.ink)].sort((a, b) => b - a);
        assert.ok((values[0] + 0.05) / (values[1] + 0.05) >= 7, "story heading contrast >= 7:1");
      } else if (route === "/dream-chapter") {
        assert.equal(
          await page
            .locator(".dream-hero-copy")
            .evaluate((el) => getComputedStyle(el).backdropFilter),
          "none",
          "logo screen blend must not be isolated by backdrop blur",
        );
        if (viewport.width > 760) {
          await page.locator(".dream-poster-stage").scrollIntoViewIfNeeded();
          const image = await rect(page, ".dream-poster-stage > figure");
          const thumbnails = await rect(page, ".dream-poster-thumbnails");
          assert.ok(thumbnails.x >= image.x + image.width, "tablet thumbnails beside poster");
          assert.ok(thumbnails.height <= image.height + 2, "thumbnail grid fits poster height");
          if (viewport.width >= 981 && viewport.width > viewport.height) {
            const thumbnailGeometry = await page
              .locator(".dream-poster-thumbnails")
              .evaluate((rail) => ({
                count: rail.querySelectorAll("button").length,
                columns: getComputedStyle(rail).gridTemplateColumns.split(" ").length,
                overflowY: getComputedStyle(rail).overflowY,
                buttonHeight: rail.querySelector("button").getBoundingClientRect().height,
                clientHeight: rail.clientHeight,
                scrollHeight: rail.scrollHeight,
              }));
            assert.equal(thumbnailGeometry.count, 15, "all Dream posters appear in the rail");
            assert.equal(thumbnailGeometry.columns, 2, "tablet thumbnails use two columns");
            assert.ok(
              thumbnailGeometry.buttonHeight >= 80,
              "thumbnail controls remain touch-sized",
            );
            assert.equal(thumbnailGeometry.overflowY, "auto", "thumbnail rail scrolls vertically");
            assert.ok(
              thumbnailGeometry.scrollHeight > thumbnailGeometry.clientHeight,
              "fifteen thumbnails scroll within poster height",
            );
            await page.locator(".dream-poster-thumbnails button").last().focus();
            const focusState = await page.locator(".dream-poster-thumbnails").evaluate((rail) => {
              const railRect = rail.getBoundingClientRect();
              const focusedRect = document.activeElement?.getBoundingClientRect();
              return {
                scrollTop: rail.scrollTop,
                visible:
                  Boolean(focusedRect) &&
                  focusedRect.top >= railRect.top - 1 &&
                  focusedRect.bottom <= railRect.bottom + 1,
              };
            });
            assert.ok(focusState.scrollTop > 0, "keyboard focus scrolls the thumbnail rail");
            assert.equal(focusState.visible, true, "focused thumbnail remains visible");
          }
        }
        await page.locator(".dream-character-grid button").first().click();
        await page.locator(".dream-dossier-dialog[open]").waitFor();
        const close = await rect(page, ".dream-dossier-close");
        assert.ok(
          close.x >= 0 &&
            close.x + close.width <= viewport.width &&
            close.y + close.height <= viewport.height,
          "dossier close stays in viewport",
        );
        if (viewport.width > 760) {
          const art = await rect(page, ".dream-dossier-visuals");
          const copy = await rect(page, ".dream-dossier-copy");
          assert.ok(copy.x >= art.x + art.width - 1, "tablet dossier has two columns");
        }
        await page.screenshot({ path: `${output}/dream-dossier-${viewport.width}.png` });
        await page.locator(".dream-dossier-close").click();
        await page.locator(".dream-dossier-dialog[open]").waitFor({ state: "detached" });
        await page.evaluate(() => scrollTo(0, 0));
      } else if (viewport.width > 760) {
        const copy = await rect(page, ".rxs-hero-copy");
        const art = await rect(page, ".rxs-hero-visual");
        assert.ok(art.x >= copy.x + copy.width - 1, "tablet feature art does not overlap copy");
        assert.ok(art.x + art.width <= viewport.width, "tablet feature art stays inside viewport");
      }
      await page.screenshot({ path: `${output}/${route.slice(1)}-${viewport.width}.png` });
      // Text-only 200% enlargement, not merely enlarging an unchanged root rem.
      await page.evaluate(() => {
        const values = [...document.querySelectorAll("body *")].map((el) => [
          el,
          getComputedStyle(el).fontSize,
        ]);
        values.forEach(([el, size]) =>
          el.style.setProperty("font-size", `${parseFloat(size) * 2}px`, "important"),
        );
      });
      await noOverflow(page);
      if (route === "/world" && viewport.width === 390) {
        await page.waitForTimeout(100);
        const header = await rect(page, ".topbar");
        const title = await rect(page, ".film-hero-identity");
        assert.ok(title.y >= header.y + header.height, "enlarged header cannot cover title");
      }
      await page.screenshot({ path: `${output}/${route.slice(1)}-${viewport.width}-text200.png` });
      results.push(`${viewport.width} ${route}: layout + text200 passed`);
    }
    assert.deepEqual(errors, []);
    await page.close();
  }
  console.log(JSON.stringify({ engine, results }, null, 2));
} finally {
  await browser.close();
}
