import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile } from "node:fs/promises";
import { chromium, webkit, request } from "playwright";
import { GALLERY_ARTWORKS } from "../src/components/gallery/gallery-data.ts";

const base = process.env.BASE_URL || "http://127.0.0.1:8082";
const engine = process.env.PW_ENGINE || "chromium";
assert.ok(["chromium", "webkit"].includes(engine));
const output = process.env.OUTPUT_DIR || `/private/tmp/gallery-${engine}`;
await mkdir(output, { recursive: true });
const browser = await (engine === "webkit"
  ? webkit.launch()
  : chromium.launch({ channel: "chrome" }));
const viewports = [
  { width: 320, height: 640 },
  { width: 390, height: 844 },
  { width: 1024, height: 768 },
  { width: 1440, height: 1000 },
];

try {
  for (const viewport of viewports) {
    const context = await browser.newContext({ viewport, hasTouch: true });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(base + "/gallery", { waitUntil: "networkidle" });
    assert.equal(await page.title(), "ギャラリー｜Deception World");
    assert.equal(await page.locator("[data-gallery-artwork]").count(), GALLERY_ARTWORKS.length);
    assert.ok(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
      "page overflow",
    );
    await page.waitForFunction(
      () => document.querySelector(".gallery-feature img")?.naturalWidth > 0,
    );
    await page.screenshot({ path: `${output}/gallery-${viewport.width}-entrance.png` });
    const collection = page.locator("#gallery-collection");
    await collection.scrollIntoViewIfNeeded();
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${output}/gallery-${viewport.width}-collection.png` });

    const filters = page.locator(".gallery-filters button");
    for (let index = 1; index < 4; index += 1) {
      await filters.nth(index).click();
      const category = ["scenes", "portraits", "places"][index - 1];
      assert.equal(
        await page.locator("[data-gallery-artwork]").count(),
        GALLERY_ARTWORKS.filter((work) => work.category === category).length,
      );
      assert.equal(await filters.nth(index).getAttribute("aria-pressed"), "true");
    }
    await filters.first().click();
    const opener = page.locator(".gallery-work-open").first();
    await opener.scrollIntoViewIfNeeded();
    await opener.focus();
    const beforeScroll = await page.evaluate(() => scrollY);
    await page.keyboard.press("Enter");
    const dialog = page.locator(".gallery-viewer[open]");
    await dialog.waitFor();
    await page.waitForFunction(
      () =>
        document.querySelector('.gallery-viewer[open] .gallery-image-full[data-ready="true"]')
          ?.naturalWidth > 0,
    );
    assert.equal(
      await dialog
        .locator(".gallery-image-full")
        .evaluate((node) => getComputedStyle(node).objectFit),
      "contain",
    );
    assert.ok(
      await dialog.evaluate((node) => node.scrollWidth <= node.clientWidth + 1),
      "viewer overflow",
    );
    const beforeTitle = await dialog.locator("h2").innerText();
    await page.keyboard.press("ArrowRight");
    assert.notEqual(await dialog.locator("h2").innerText(), beforeTitle);
    await page.keyboard.press("ArrowLeft");
    assert.equal(await dialog.locator("h2").innerText(), beforeTitle);
    for (let tab = 0; tab < 8; tab += 1) {
      await page.keyboard.press("Tab");
      assert.ok(
        await dialog.evaluate((node) => node.contains(document.activeElement)),
        `focus escaped native viewer: ${JSON.stringify(await page.evaluate(() => ({ tag: document.activeElement?.tagName, id: document.activeElement?.id, className: document.activeElement?.className })))}`,
      );
    }
    for (let tab = 0; tab < 8; tab += 1) {
      await page.keyboard.press("Shift+Tab");
      assert.ok(await dialog.evaluate((node) => node.contains(document.activeElement)));
    }
    assert.ok(
      await dialog.locator(".gallery-viewer-footer").evaluate((node) => {
        const rect = node.getBoundingClientRect();
        return rect.top >= 0 && rect.bottom <= innerHeight;
      }),
      "viewer footer outside viewport",
    );
    await page.screenshot({ path: `${output}/gallery-${viewport.width}-viewer.png` });
    await page.keyboard.press("Escape");
    await dialog.waitFor({ state: "hidden" });
    // Native close removes [open] before React's effect releases the shared
    // scroll lock. Wait for that cleanup rather than sampling between them.
    await page.waitForFunction(() => document.documentElement.style.overflow !== "hidden");
    assert.ok(
      await opener.evaluate((node) => document.activeElement === node),
      "opener focus not restored",
    );
    assert.equal(await page.evaluate(() => document.documentElement.style.overflow), "");
    assert.ok(
      Math.abs((await page.evaluate(() => scrollY)) - beforeScroll) <= 2,
      "scroll position changed on close",
    );

    // Current-page menu entry is visible even though INFORMATION is low in
    // the long shared menu. Escape releases its inert tree and viewport lock.
    await page.locator(".side-panel-trigger").click();
    const menuEntry = page.locator('.side-panel-links a[href="/gallery"]');
    await menuEntry.waitFor({ state: "visible" });
    assert.equal(await menuEntry.getAttribute("aria-current"), "page");
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => !document.documentElement.hasAttribute("data-side-menu-open"));
    assert.equal(
      await page.evaluate(() => document.querySelectorAll("[inert]:not(.side-panel)").length),
      0,
      "background remained inert after menu close",
    );

    // BACK with the same route mounted must dismiss an open image without
    // leaving the restored destination locked or stealing its focus.
    await page.goto(base + "/gallery", { waitUntil: "networkidle" });
    await page.locator(".gallery-enter").click();
    await page.waitForFunction(() => location.hash === "#gallery-collection");
    await page.locator(".gallery-work-open").first().click();
    await page.locator(".gallery-viewer[open]").waitFor();
    await page.goBack();
    await page.waitForFunction(
      () =>
        !document.querySelector(".gallery-viewer[open]") &&
        document.documentElement.style.overflow !== "hidden",
    );
    await page.goForward();
    await page.locator(".gallery-viewer[open]").waitFor();
    await page.getByRole("button", { name: "閉じる", exact: true }).click();
    await page.waitForFunction(() => !document.body.hasAttribute("data-gallery-viewer-lock"));
    assert.deepEqual(errors, [], "browser errors");
    console.log(
      `${engine} ${viewport.width}×${viewport.height}: collection, filters, viewer, focus, scroll, menu, BACK passed`,
    );
    await context.close();
  }

  const reduced = await browser.newContext({
    viewport: { width: 390, height: 844 },
    reducedMotion: "reduce",
  });
  const page = await reduced.newPage();
  await page.goto(base + "/gallery", { waitUntil: "networkidle" });
  assert.equal(await page.locator("[data-gallery-artwork]").count(), GALLERY_ARTWORKS.length);
  assert.equal(
    await page
      .locator(".gallery-page")
      .evaluate(
        (node) =>
          node
            .getAnimations({ subtree: true })
            .filter((animation) => animation.playState === "running").length,
      ),
    0,
  );
  await page.locator(".gallery-feature-open").click();
  await page.locator(".gallery-viewer[open]").waitFor();
  await page.getByRole("button", { name: "閉じる" }).click();
  await page.locator(".gallery-viewer[open]").waitFor({ state: "hidden" });
  await reduced.close();

  const recovery = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const recoveryPage = await recovery.newPage();
  await recoveryPage.route(`**${GALLERY_ARTWORKS[0].full}`, (route) => route.abort());
  await recoveryPage.goto(base + "/gallery", { waitUntil: "networkidle" });
  await recoveryPage.locator(".gallery-work-open").first().click();
  const failure = recoveryPage.locator(".gallery-viewer[open] .gallery-image-error");
  await failure.waitFor();
  assert.equal(await failure.locator("a").getAttribute("href"), GALLERY_ARTWORKS[0].medium);
  await recoveryPage.getByRole("button", { name: "次の作品 →" }).click();
  await recoveryPage.waitForFunction(
    () => document.querySelector('.gallery-image-full[data-ready="true"]')?.naturalWidth > 0,
  );
  await recoveryPage.getByRole("button", { name: "閉じる" }).click();
  await recoveryPage.locator(".gallery-viewer[open]").waitFor({ state: "hidden" });
  await recovery.close();

  // Check the newly appended exhibition at both viewing sizes, including
  // the final work's wrap back to the start of the collection.
  for (const width of [390, 1440]) {
    const added = await browser.newContext({ viewport: { width, height: 900 } });
    const addedPage = await added.newPage();
    await addedPage.goto(base + "/gallery", { waitUntil: "networkidle" });
    for (const work of GALLERY_ARTWORKS.slice(-4)) {
      await addedPage.locator(`[data-gallery-artwork="${work.id}"] .gallery-work-open`).click();
      const dialog = addedPage.locator(".gallery-viewer[open]");
      await dialog.waitFor();
      const art = dialog.locator(".gallery-image-full");
      await art.evaluate((node) => node.decode());
      assert.equal(await art.getAttribute("src"), work.full);
      assert.equal(await dialog.locator("h2").innerText(), work.title);
      assert.deepEqual(await art.evaluate((node) => [node.naturalWidth, node.naturalHeight]), [
        work.width,
        work.height,
      ]);
      assert.equal(await art.evaluate((node) => getComputedStyle(node).objectFit), "contain");
      await addedPage.screenshot({ path: `${output}/gallery-${width}-${work.id}.png` });
      if (work === GALLERY_ARTWORKS.at(-1)) {
        await addedPage.keyboard.press("ArrowRight");
        assert.equal(await dialog.locator("h2").innerText(), GALLERY_ARTWORKS[0].title);
      }
      await addedPage.getByRole("button", { name: "閉じる" }).click();
      await dialog.waitFor({ state: "hidden" });
      await addedPage.waitForFunction(() => document.documentElement.style.overflow !== "hidden");
    }
    await added.close();
  }

  if (engine === "chromium") {
    const touch = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    });
    const touchPage = await touch.newPage();
    await touchPage.goto(base + "/gallery", { waitUntil: "networkidle" });
    const input = await touch.newCDPSession(touchPage);
    await input.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x: 180, y: 700 }],
    });
    for (const y of [620, 540, 460, 380, 300]) {
      await input.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [{ x: 180, y }],
      });
      await touchPage.waitForTimeout(30);
    }
    await input.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await touchPage.waitForFunction(() => scrollY > 100);
    await touch.close();
    console.log("chromium: native touch scrolling passed");
  }

  // Every delivered derivative responds successfully; original private
  // source paths are never used by the browser.
  const delivery = await request.newContext();
  try {
    for (const work of GALLERY_ARTWORKS) {
      for (const path of new Set([work.thumb, work.medium, work.full])) {
        const response = await delivery.head(base + path);
        assert.equal(response.status(), 200, `asset delivery: ${path}`);
      }
    }
    const manifest = JSON.parse(
      await readFile(new URL("../public/gallery/asset-manifest.json", import.meta.url), "utf8"),
    );
    for (const work of manifest.items.slice(-4)) {
      for (const asset of work.variants) {
        const response = await delivery.get(base + asset.path);
        assert.equal(response.status(), 200);
        const bytes = await response.body();
        assert.equal(bytes.length, asset.bytes);
        assert.equal(createHash("sha256").update(bytes).digest("hex"), asset.sha256);
      }
    }
  } finally {
    await delivery.dispose();
  }
  console.log(
    `${engine}: image failure recovery, reduced motion and all ${GALLERY_ARTWORKS.length} artwork derivatives delivered`,
  );
} finally {
  await browser.close();
}
