// Production-browser regressions for rx14 #6 (pixel-bounded artwork) and
// #14 (the centred end-card dash). No image substitution or style injection.
// BASE_URL=http://127.0.0.1:18642 OUTPUT_DIR=/private/tmp/rx14-special-evidence node scripts/verify-rx14-special-layout.mjs
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { chromium } from "playwright";

const base = process.env.BASE_URL ?? "http://127.0.0.1:18642";
const output = process.env.OUTPUT_DIR ?? "/private/tmp/rx14-special-evidence";
const profiles = [
  { width: 1440, height: 900, dpr: 1 },
  { width: 1024, height: 1366, dpr: 2 },
  { width: 390, height: 844, dpr: 3 },
];
const rows = [];
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: process.env.PW_BROWSER_CHANNEL ?? "chrome" });

async function open(page, path) {
  await page.goto(new URL(path, base).href, { waitUntil: "networkidle" });
  await page.waitForFunction(
    () =>
      !document.documentElement.hasAttribute("data-loading") &&
      !document.documentElement.hasAttribute("data-route-scroll-settling"),
    undefined,
    { timeout: 60000 },
  );
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
}

async function imageReady(image) {
  await image.waitFor({ state: "visible" });
  await image.evaluate(async (node) => {
    await node.decode();
    if (!node.complete || node.naturalWidth === 0) throw new Error("target image did not load");
  });
}

// All dimensions are from the rendered DOM, including any ancestor transform.
// For contain, the scale uses the smaller axis of the actual image rectangle.
async function artworkState(image) {
  return image.evaluate((node) => {
    const rect = node.getBoundingClientRect();
    const style = getComputedStyle(node);
    const transform = new DOMMatrixReadOnly(
      style.transform === "none" ? undefined : style.transform,
    );
    const fit = Math.min(rect.width / node.naturalWidth, rect.height / node.naturalHeight);
    return {
      src: node.currentSrc,
      naturalWidth: node.naturalWidth,
      naturalHeight: node.naturalHeight,
      left: rect.left,
      top: rect.top,
      right: rect.right,
      bottom: rect.bottom,
      width: rect.width,
      height: rect.height,
      drawWidth: node.naturalWidth * fit,
      drawHeight: node.naturalHeight * fit,
      physicalScale: fit * devicePixelRatio,
      objectFit: style.objectFit,
      objectPosition: style.objectPosition,
      transform: style.transform,
      transformScaleX: Math.hypot(transform.a, transform.b),
      transformScaleY: Math.hypot(transform.c, transform.d),
      scale: style.scale,
      animation: style.animationName,
      dpr: devicePixelRatio,
      overflow: document.documentElement.scrollWidth - innerWidth,
    };
  });
}

function assertBounded(row) {
  assert.equal(row.image.objectFit, "contain", JSON.stringify(row));
  assert.ok(row.image.physicalScale <= 1.001, JSON.stringify(row));
  // Chrome may retain an identity matrix from the completed impact. The
  // property spelling is not the bug; geometric enlargement is.
  assert.ok(
    row.image.transformScaleX <= 1.001 && row.image.transformScaleY <= 1.001,
    JSON.stringify(row),
  );
  assert.ok(["none", "1"].includes(row.image.scale), JSON.stringify(row));
  assert.ok(row.image.drawWidth > 0 && row.image.drawHeight > 0, JSON.stringify(row));
  assert.ok(row.image.overflow <= 1, JSON.stringify(row));
}

try {
  for (const profile of profiles) {
    const label = `${profile.width}x${profile.height}-dpr${profile.dpr}`;
    const context = await browser.newContext({
      viewport: { width: profile.width, height: profile.height },
      deviceScaleFactor: profile.dpr,
      hasTouch: profile.dpr > 1,
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    try {
      await open(page, "/extreme-saga");
      for (const stage of ["middle", "ultra", "middle"]) {
        await page.locator(`#exs-stage-tab-${stage}`).click();
        const figure = page.locator(`#exs-stage-panel figure[data-form="${stage}"]`);
        const image = figure.locator(":scope > img");
        await imageReady(image);
        await figure.scrollIntoViewIfNeeded();
        // The reader-triggered cut is rate-limited to 1100ms and the seam
        // takes 640ms; inspect the settled visual, not a mid-quake rectangle.
        await page.waitForTimeout(1300);
        const row = {
          page: "extreme",
          profile,
          stage,
          image: await artworkState(image),
          layers: await figure.evaluate((node) => {
            const canvas = node.getBoundingClientRect();
            const old = getComputedStyle(node);
            const rival = node.querySelector(".exf-rival > span");
            const edge = rival.getBoundingClientRect();
            const style = getComputedStyle(rival);
            return {
              width: canvas.width,
              height: canvas.height,
              oldImage: old.backgroundImage,
              oldSize: old.backgroundSize,
              oldPosition: old.backgroundPosition,
              rivalWidth: edge.width,
              rivalHeight: edge.height,
              rivalImage: style.backgroundImage,
              rivalSize: style.backgroundSize,
              rivalPosition: style.backgroundPosition,
              density: Number(old.getPropertyValue("--exf-art-density")),
            };
          }),
        };
        rows.push(row);
        assertBounded(row);
        assert.ok(row.layers.width * profile.dpr <= 1022.1, JSON.stringify(row));
        assert.ok(row.layers.height * profile.dpr <= 1538.1, JSON.stringify(row));
        assert.equal(row.layers.rivalSize, "contain", JSON.stringify(row));
        assert.equal(row.layers.rivalPosition, row.image.objectPosition, JSON.stringify(row));
        assert.ok(Math.abs(row.layers.rivalWidth - row.layers.width) <= 1, JSON.stringify(row));
        assert.ok(Math.abs(row.layers.rivalHeight - row.layers.height) <= 1, JSON.stringify(row));
        if (await page.locator('#exs-stage-panel[data-exo-cut="true"]').count()) {
          assert.equal(row.layers.oldSize, "contain", JSON.stringify(row));
          assert.equal(row.layers.oldPosition, row.image.objectPosition, JSON.stringify(row));
        }
        const other = stage === "middle" ? "ultra" : "middle";
        assert.ok(
          row.layers.rivalImage.includes(`saga-extreme-${other}-20261006`),
          JSON.stringify(row),
        );
        await page.screenshot({ path: join(output, `extreme-${label}-${stage}.png`) });
      }

      await open(page, "/world");
      const poster = page.locator(".finale-backdrop img");
      await page.locator(".finale-sticky").scrollIntoViewIfNeeded();
      await imageReady(poster);
      await page.waitForTimeout(700);
      const world = {
        page: "world",
        profile,
        image: await artworkState(poster),
        frame: await page.locator(".finale-backdrop").evaluate((node) => {
          const rect = node.getBoundingClientRect();
          return {
            width: rect.width,
            height: rect.height,
            left: rect.left,
            top: rect.top,
            right: rect.right,
            bottom: rect.bottom,
          };
        }),
      };
      rows.push(world);
      assertBounded(world);
      assert.ok(world.image.drawWidth <= world.frame.width + 1, JSON.stringify(world));
      assert.ok(world.image.drawHeight <= world.frame.height + 1, JSON.stringify(world));
      assert.ok(
        world.image.left >= world.frame.left - 1 && world.image.right <= world.frame.right + 1,
        JSON.stringify(world),
      );
      assert.ok(
        world.image.top >= world.frame.top - 1 && world.image.bottom <= world.frame.bottom + 1,
        JSON.stringify(world),
      );
      assert.equal(world.image.animation, "none", JSON.stringify(world));
      assert.deepEqual([world.image.naturalWidth, world.image.naturalHeight], [1024, 1536]);
      await page.screenshot({ path: join(output, `world-finale-${label}.png`) });

      await open(page, "/final-stage");
      await page.locator(".fst-footer").scrollIntoViewIfNeeded();
      await page.waitForTimeout(700);
      const footer = await page.locator(".fst-footer h2").evaluate((heading) => {
        const box = heading.getBoundingClientRect();
        const style = getComputedStyle(heading);
        const dash = getComputedStyle(heading, "::after");
        const marginLeft = parseFloat(dash.marginLeft);
        const marginRight = parseFloat(dash.marginRight);
        const dashWidth = parseFloat(dash.width);
        const dashCenter =
          box.left +
          parseFloat(style.borderLeftWidth) +
          parseFloat(style.paddingLeft) +
          marginLeft +
          dashWidth / 2;
        return {
          titleCenter: box.left + box.width / 2,
          viewportCenter: innerWidth / 2,
          dashCenter,
          dashWidth,
          marginLeft,
          marginRight,
          display: dash.display,
          height: parseFloat(dash.height),
          overflow: document.documentElement.scrollWidth - innerWidth,
        };
      });
      rows.push({ page: "final-stage", profile, footer });
      assert.equal(footer.display, "block", JSON.stringify(footer));
      assert.equal(footer.dashWidth, 140, JSON.stringify(footer));
      assert.equal(footer.height, 2, JSON.stringify(footer));
      assert.ok(Math.abs(footer.marginLeft - footer.marginRight) <= 1, JSON.stringify(footer));
      assert.ok(Math.abs(footer.dashCenter - footer.titleCenter) <= 1, JSON.stringify(footer));
      assert.ok(Math.abs(footer.dashCenter - footer.viewportCenter) <= 1, JSON.stringify(footer));
      assert.ok(footer.overflow <= 1, JSON.stringify(footer));
      await page.screenshot({ path: join(output, `final-stage-footer-${label}.png`) });
      assert.deepEqual(errors, [], `${label}: uncaught page errors`);
      console.log(
        `PASS ${label}: both forms and seam stay pixel-bounded; World print is contained; end-card dash is centred`,
      );
    } finally {
      await context.close();
    }
  }
} finally {
  await writeFile(
    join(output, "layout-report.json"),
    JSON.stringify({ base, browser: browser.version(), rows }, null, 2),
  );
  await browser.close();
}
