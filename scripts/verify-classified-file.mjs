import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium, webkit } from "playwright";
import { RE_DIVE_CLASSIFIED_REPORT as report } from "../src/components/world/re-dive-classified-report.ts";
import { DOG_DOSSIER } from "../src/components/world/world-dog-dossier-data.ts";

const base = process.env.BASE_URL ?? "http://127.0.0.1:8199";
const engine = process.env.PW_ENGINE ?? "chromium";
const output = process.env.CLASSIFIED_OUTPUT ?? "output/playwright/classified-file";
const profiles = [
  { name: "narrow", viewport: { width: 320, height: 640 }, hasTouch: true },
  { name: "phone", viewport: { width: 390, height: 844 }, hasTouch: true, deviceScaleFactor: 3 },
  { name: "tablet", viewport: { width: 1024, height: 768 }, hasTouch: true },
  { name: "desktop", viewport: { width: 1440, height: 900 } },
].filter(
  (profile) =>
    !process.env.CLASSIFIED_PROFILES ||
    process.env.CLASSIFIED_PROFILES.split(",").includes(profile.name),
);
await mkdir(output, { recursive: true });
const browser = await (engine === "webkit" ? webkit : chromium).launch(
  engine === "webkit" ? {} : { channel: process.env.PW_BROWSER_CHANNEL ?? "chrome" },
);
const results = [];
const ready = (page) =>
  page.waitForFunction(
    () =>
      document.documentElement.dataset.family &&
      // The prepaint family exists before hydration; wait for the mounted World route too.
      document.documentElement.dataset.worldPageVisible === "true" &&
      !document.documentElement.hasAttribute("data-loading") &&
      !document.documentElement.hasAttribute("data-route-scroll-settling"),
  );
try {
  for (const { name, ...options } of profiles) {
    const context = await browser.newContext({ ...options, reducedMotion: "reduce" });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(new URL("/world", base).href, { waitUntil: "domcontentloaded" });
    await ready(page);
    await page.evaluate(() => document.fonts.ready);
    // Reach the archive through the real RISING controls, so its session menu is genuinely unlocked.
    const rising = page.getByRole("button", { name: "RISING THE WORLD", exact: true });
    await rising.scrollIntoViewIfNeeded();
    await (options.hasTouch ? rising.tap() : rising.click());
    const redive = page.getByRole("button", { name: "RE DIVE…?", exact: true });
    await redive.waitFor({ state: "visible" });
    await page.waitForTimeout(1000);
    await (options.hasTouch ? redive.tap() : redive.click());
    await page.waitForFunction(() => !document.querySelector(".rw-dialog")?.open);
    const cover = page.getByRole("button", { name: report.title + "の機密ファイルを開く" });
    await cover.scrollIntoViewIfNeeded();
    const initialFont = await cover.evaluate((node) => getComputedStyle(node).fontFamily);
    await page.screenshot({ path: output + "/" + engine + "-" + name + "-archive.png" });
    const originY = await page.evaluate(() => scrollY);
    await (options.hasTouch ? cover.tap() : cover.click());
    const dialog = page.locator(".rd-file-dialog[open]");
    await dialog.waitFor();
    const reader = page.locator(".rd-file-reader");
    const actualText = await reader.evaluate((node) =>
      [...node.querySelectorAll("[data-report-paragraph]")]
        .map((paragraph) => paragraph.textContent)
        .join("\n\n"),
    );
    assert.equal(actualText, report.text, name + ": complete unchanged report");
    assert.equal(await page.locator("#world-column-06").count(), 0, "removed from ordinary columns");
    assert.equal(await dialog.locator(".world-dossier-reading").count(), 0, "spoiler initially hidden");
    assert.equal(await dialog.evaluate((node) => node.matches(":modal")), true);
    assert.equal(await page.evaluate(() => document.body.style.position), "fixed");
    const geometry = await dialog.evaluate((node) => {
      const reader = node.querySelector(".rd-file-reader");
      const rect = node.getBoundingClientRect();
      const shortcut = node.querySelector(".zeus-button");
      return {
        overflow: reader.scrollWidth - reader.clientWidth,
        width: rect.width,
        left: rect.left,
        right: rect.right,
        top: rect.top,
        bottom: rect.bottom,
        shortcutHidden: !shortcut || getComputedStyle(shortcut).display === "none",
        font: getComputedStyle(reader).fontFamily,
        controls: [...node.querySelectorAll(".rd-file-close")].map((button) => {
          const box = button.getBoundingClientRect();
          return { width: box.width, height: box.height };
        }),
      };
    });
    assert.ok(geometry.overflow <= 1, name + ": no horizontal report overflow");
    assert.ok(geometry.left >= -1 && geometry.right <= options.viewport.width + 1);
    assert.ok(geometry.top >= -1 && geometry.bottom <= options.viewport.height + 1);
    assert.ok(geometry.controls.every((control) => control.width >= 44 && control.height >= 44));
    assert.ok(geometry.shortcutHidden, name + ": shortcut cannot cover the report");
    assert.equal(geometry.font, initialFont, name + ": inherited Japanese font");
    await page.keyboard.press("Shift+Tab");
    assert.equal(
      await page.evaluate(() => document.activeElement?.textContent),
      "ファイル一覧へ戻る",
    );
    await page.keyboard.press("Tab");
    assert.equal(await page.evaluate(() => document.activeElement?.textContent), "閉じる");
    await page.keyboard.press("Tab");
    assert.equal(await page.evaluate(() => document.activeElement?.className), "rd-file-reader");
    await page.keyboard.press("PageDown");
    await page.waitForFunction(() => document.querySelector(".rd-file-reader")?.scrollTop > 0);
    await page.screenshot({ path: output + "/" + engine + "-" + name + "-reader.png" });
    const reveal = dialog.getByRole("button", { name: "ネタバレを開く", exact: true });
    assert.match(await dialog.locator(".rd-file-appendix > p").allTextContents().then((parts) => parts.join("")), /開くと、資料の本文が表示されます。/);
    await reveal.click();
    assert.equal(await dialog.locator('[aria-controls="rd-file-dog-dossier"]').getAttribute("aria-expanded"), "true");
    const dossier = dialog.locator(".world-dossier-reading");
    assert.deepEqual(
      await dossier.locator(".world-mystery-chapter > p").allTextContents(),
      DOG_DOSSIER.sections.flatMap((section) => section.paragraphs),
      "all 57 moved paragraphs remain verbatim",
    );
    assert.ok(await reader.evaluate((node) => node.scrollWidth <= node.clientWidth + 1));
    await dossier.scrollIntoViewIfNeeded();
    await page.screenshot({ path: output + "/" + engine + "-" + name + "-appendix.png" });
    await dialog.getByRole("button", { name: "資料を閉じる", exact: true }).click();
    assert.equal(await dialog.locator(".world-dossier-reading").count(), 0);
    await dialog.getByRole("button", { name: "ネタバレを開く", exact: true }).click();
    assert.equal(await dialog.locator(".world-mystery-chapter").count(), 10, "can reopen appendix");
    await page.keyboard.press("Escape");
    await page.locator(".rd-file-dialog").waitFor({ state: "detached" });
    assert.equal(await page.evaluate(() => document.body.style.position), "");
    assert.ok(
      Math.abs((await page.evaluate(() => scrollY)) - originY) <= 2,
      name + ": restores the original Y",
    );
    assert.equal(
      await page.evaluate(() => document.activeElement?.className),
      "re-dive-file-cover",
    );

    // Keyboard activation is exempt from the 450ms touch-through guard.
    for (let repetition = 0; repetition < 12; repetition += 1) {
      await page.keyboard.press("Enter");
      await page.locator(".rd-file-dialog[open]").waitFor();
      await page.keyboard.press("Escape");
      await page.locator(".rd-file-dialog").waitFor({ state: "detached" });
    }
    assert.equal(await page.evaluate(() => document.body.style.position), "");
    assert.ok(Math.abs((await page.evaluate(() => scrollY)) - originY) <= 2);
    await page.keyboard.press("Enter");
    await page.locator(".rd-file-dialog[open]").waitFor();
    const rotated = name === "desktop" ? { width: 1024, height: 768 } : { width: 844, height: 390 };
    await page.setViewportSize(rotated);
    await page.waitForFunction(
      ({ width, height }) => innerWidth === width && innerHeight === height,
      rotated,
    );
    await page.keyboard.press("Escape");
    await page.locator(".rd-file-dialog").waitFor({ state: "detached" });
    const returnTop = await page
      .locator("#re-dive")
      .evaluate((node) => node.getBoundingClientRect().top);
    const headerBottom = await page
      .locator(".site-shell .topbar")
      .evaluate((node) => node.getBoundingClientRect().bottom);
    if (Math.abs(returnTop - headerBottom) > 2) {
      const diagnostic = await page.evaluate(() => ({
        width: innerWidth,
        height: innerHeight,
        y: scrollY,
        bodyPosition: document.body.style.position,
        focus: document.activeElement?.className,
        behavior: getComputedStyle(document.documentElement).scrollBehavior,
        scrollPadding: getComputedStyle(document.documentElement).scrollPaddingTop,
        scrollMargin: getComputedStyle(document.querySelector("#re-dive")).scrollMarginTop,
        sectionHeight: document.querySelector("#re-dive").getBoundingClientRect().height,
        maxScroll: document.scrollingElement.scrollHeight - innerHeight,
        topbarVar: getComputedStyle(document.documentElement).getPropertyValue("--film-topbar-height"),
      }));
      await page.screenshot({ path: output + "/" + engine + "-" + name + "-rotation-failure.png" });
      console.log(JSON.stringify({ rotationFailure: { returnTop, headerBottom, ...diagnostic } }));
    }
    assert.ok(
      Math.abs(returnTop - headerBottom) <= 2,
      name +
        ": rotation returns to the file archive: " +
        JSON.stringify({ returnTop, headerBottom }),
    );
    assert.equal(await page.evaluate(() => document.body.style.position), "");

    // Real client-side hash links create the return history; do not fabricate a popstate.
    await page.getByRole("link", { name: "STORY：ストーリーへ移動" }).click();
    await page.waitForURL(/#story$/);
    await page.getByRole("button", { name: "メニューを開く" }).click();
    await page
      .locator("#site-side-panel")
      .getByRole("link", { name: /機密ファイル/ })
      .click();
    await page.waitForURL(/#re-dive$/);
    await ready(page);
    await cover.scrollIntoViewIfNeeded();
    await (options.hasTouch ? cover.tap() : cover.click());
    await page.locator(".rd-file-dialog[open]").waitFor();
    await page.goBack();
    await page.waitForURL(/#story$/);
    await page.locator(".rd-file-dialog").waitFor({ state: "detached" });
    assert.equal(await page.evaluate(() => document.body.style.position), "");
    assert.deepEqual(errors, []);
    results.push({
      engine,
      profile: name,
      paragraphs: 108,
      exactText: true,
      geometry,
      repetitions: 12,
      rotation: true,
      history: true,
    });
    console.log(JSON.stringify(results.at(-1)));
    await context.close();
  }
  await writeFile(output + "/report.json", JSON.stringify(results, null, 2));
} catch (error) {
  const page = browser.contexts().at(-1)?.pages().at(-1);
  if (page) {
    await page.screenshot({ path: output + "/" + engine + "-failure.png" }).catch(() => {});
    console.error(
      JSON.stringify(
        await page.evaluate(() => ({
          failure: {
            url: location.href,
            mounted: document.documentElement.dataset.worldPageVisible,
            loading: document.documentElement.dataset.loading,
            risingOpen: document.querySelector(".rw-dialog")?.open,
            tier: document.querySelector(".rw-viewport")?.dataset.tier,
            reDiveOffered: !!document.querySelector(".rw-redive-button"),
          },
        })),
      ),
    );
  }
  throw error;
} finally {
  await browser.close();
}
