// Disposable browser QA: BASE_URL=http://127.0.0.1:8574 BROWSER=chrome|webkit
// PLAYWRIGHT_BROWSERS_PATH=... selects an existing WebKit installation.
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium, webkit } from "playwright";

const base = (process.env.BASE_URL || "http://127.0.0.1:8574").replace(/\/$/, "");
const kind = process.env.BROWSER || process.env.PW_ENGINE || "chrome";
assert.ok(["chrome", "chromium", "webkit"].includes(kind), `Unsupported browser ${kind}`);
const engine = kind === "webkit" ? "webkit" : "chromium";
const output = process.env.OUT_DIR || `/private/tmp/dream-reading-support-${engine}`;
const key = "deception-world:dream-reader:v1";
const route = `${base}/dream-chapter`;
await mkdir(output, { recursive: true });
const browser = await (engine === "webkit" ? webkit : chromium).launch(
  engine === "webkit" ? {} : { channel: "chrome" },
);
const report = { base, engine, browserVersion: browser.version(), checks: [] };
let activePage;

async function ready(page, url = route) {
  await page.goto(url, { waitUntil: "load" });
  await page.waitForSelector(".dream-reader-support");
  await page.waitForFunction(() => !document.documentElement.hasAttribute("data-loading"));
  await page.addStyleTag({ content: "html,body,* { scroll-behavior:auto !important }" });
}

async function value(page) {
  return page.evaluate((storageKey) => JSON.parse(localStorage.getItem(storageKey)), key);
}

async function expectBookmark(page, bookmark) {
  await page.waitForFunction(
    ({ storageKey, expected }) => {
      const state = JSON.parse(localStorage.getItem(storageKey));
      return expected === null
        ? state?.bookmark === null
        : state?.bookmark?.caseNo === expected.caseNo &&
            state?.bookmark?.paragraph === expected.paragraph;
    },
    { storageKey: key, expected: bookmark },
  );
}

async function geometry(page, name) {
  const result = await page.evaluate(() => ({
    overflow: document.documentElement.scrollWidth - innerWidth,
    controls: [
      ...document.querySelectorAll(".dream-reader-support button,.dream-reader-support a"),
    ].map((element) => {
      const rect = element.getBoundingClientRect();
      return { text: element.textContent.trim(), width: rect.width, height: rect.height };
    }),
  }));
  assert.ok(result.overflow <= 1, `${name}: horizontal overflow ${result.overflow}px`);
  for (const control of result.controls)
    assert.ok(
      control.width >= 44 && control.height >= 44,
      `${name}: ${control.text} touch target ${control.width}×${control.height}`,
    );
  return result;
}

async function landParagraph(page, id) {
  await page.waitForFunction((targetId) => {
    const target = document.getElementById(targetId);
    const nav = document.querySelector(".dream-chapter-nav");
    if (!target || !nav || !target.closest("details")?.open) return false;
    const rect = target.getBoundingClientRect();
    return rect.top >= nav.getBoundingClientRect().bottom && rect.top < innerHeight - 20;
  }, id);
}

// Place the authored paragraph across the runtime's reading line. The later
// mouse wheel is a real browser input; a synthetic scroll event cannot pass.
async function positionParagraph(page, id) {
  await page.evaluate((targetId) => {
    const paragraph = document.getElementById(targetId);
    const nav = document.querySelector(".dream-chapter-nav");
    const top = Math.max(0, nav.getBoundingClientRect().bottom) + 20;
    const line = top + (innerHeight - top) * 0.35;
    const rect = paragraph.getBoundingClientRect();
    const at = line - Math.min(rect.height / 2, 120);
    scrollTo({ top: scrollY + rect.top - at, behavior: "instant" });
  }, id);
}

try {
  for (const viewport of [
    { width: 320, height: 640 },
    { width: 390, height: 844 },
    { width: 667, height: 375 },
  ]) {
    const name = `${viewport.width}x${viewport.height}`;
    const context = await browser.newContext({ viewport, hasTouch: true, reducedMotion: "reduce" });
    const page = await context.newPage();
    activePage = page;
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await context.addInitScript(() => {
      window.__dreamReaderTrustedWheels = 0;
      addEventListener(
        "wheel",
        (event) => {
          if (event.isTrusted) window.__dreamReaderTrustedWheels += 1;
        },
        { passive: true },
      );
    });
    try {
      await ready(page);
      assert.equal(await value(page), null, `${name}: initial visit writes no reading position`);
      await page.locator('.dream-reader-index a[href="#dream-case-5"]').press("Enter");
      await page.waitForURL("**#dream-case-5");
      await page.waitForFunction(() => document.getElementById("dream-case-5").open);
      const id = "dream-case-5-paragraph-4";
      assert.equal(await page.locator("#dream-case-0 [data-dream-reading-paragraph]").count(), 3);
      await positionParagraph(page, id);
      // Merely arriving by a link or programmatic layout adjustment must not
      // save an earlier paragraph during the fragment jump.
      await page.waitForTimeout(1000);
      assert.equal(await value(page), null, `${name}: fragment arrival does not invent a bookmark`);
      const readingUrl = page.url();
      await page.mouse.move(viewport.width / 2, viewport.height / 2);
      await page.mouse.wheel(0, 24);
      await expectBookmark(page, { caseNo: "5", paragraph: 4 });
      assert.ok(await page.evaluate(() => window.__dreamReaderTrustedWheels > 0));
      assert.equal(page.url(), readingUrl, `${name}: reading never changes URL/history`);

      // Reload the plain route. Reloading a URL with a fragment is expected to
      // follow that explicit fragment, so it cannot test absence of auto-resume.
      await ready(page);
      await page.reload({ waitUntil: "load" });
      await page.waitForSelector(".dream-reader-support");
      await page.waitForTimeout(1000);
      assert.equal(await page.evaluate(() => location.hash), "");
      assert.ok(
        await page.evaluate(() => scrollY < 32),
        `${name}: saved position cannot auto-scroll`,
      );
      assert.equal(await page.locator("#dream-case-5").getAttribute("open"), null);
      await expectBookmark(page, { caseNo: "5", paragraph: 4 });
      await page.screenshot({ path: `${output}/${name}-plain-revisit.png` });

      await page
        .locator('.dream-reader-bookmark a[href="#dream-case-5-paragraph-4"]')
        .press("Enter");
      await page.waitForURL(`**#${id}`);
      await landParagraph(page, id);
      await page.waitForFunction((targetId) => document.activeElement?.id === targetId, id);
      assert.equal(
        await page.locator('.dream-reader-index a[aria-current="location"]').getAttribute("href"),
        "#dream-case-5",
      );
      await page.waitForTimeout(1000);
      await expectBookmark(page, { caseNo: "5", paragraph: 4 });
      assert.deepEqual((await value(page)).bookmark, { caseNo: "5", paragraph: 4 });

      await page.getByRole("button", { name: "大きく", exact: true }).click();
      await page.getByRole("button", { name: "ゆったり", exact: true }).click();
      let settings = await value(page);
      assert.equal(settings.size, "large");
      assert.equal(settings.spacing, "comfortable");
      assert.deepEqual(settings.bookmark, { caseNo: "5", paragraph: 4 });
      const comfortGeometry = await geometry(page, name);
      await page.reload({ waitUntil: "load" });
      await page.waitForSelector(".dream-reader-support");
      await landParagraph(page, id);
      assert.equal(
        await page
          .getByRole("button", { name: "大きく", exact: true })
          .getAttribute("aria-pressed"),
        "true",
      );
      assert.equal(
        await page
          .getByRole("button", { name: "ゆったり", exact: true })
          .getAttribute("aria-pressed"),
        "true",
      );
      const typography = await page.locator(`#${id}`).evaluate((paragraph) => {
        const style = getComputedStyle(paragraph);
        return { font: parseFloat(style.fontSize), line: parseFloat(style.lineHeight) };
      });
      assert.equal(typography.font, 19);
      assert.ok(Math.abs(typography.line / typography.font - 2.3) < 0.02);
      await expectBookmark(page, { caseNo: "5", paragraph: 4 });
      await page.screenshot({ path: `${output}/${name}-resumed-comfort.png` });

      await page.getByRole("button", { name: "しおりを外す", exact: true }).click();
      await expectBookmark(page, null);
      await page
        .getByRole("group", { name: "文字サイズ", exact: true })
        .getByRole("button", { name: "標準", exact: true })
        .click();
      await page.waitForTimeout(1000);
      settings = await value(page);
      assert.equal(settings.bookmark, null, `${name}: settings cannot resurrect cleared bookmark`);
      assert.equal(settings.size, "standard");
      assert.equal(
        settings.spacing,
        "comfortable",
        `${name}: clearing leaves comfort preference intact`,
      );
      assert.equal(await page.locator(".dream-reader-bookmark-actions a").count(), 0);
      await page.reload({ waitUntil: "load" });
      await page.waitForSelector(".dream-reader-support");
      await page.waitForTimeout(1000);
      await expectBookmark(page, null);
      assert.equal(await page.locator(".dream-reader-bookmark-actions a").count(), 0);
      await geometry(page, name);
      assert.deepEqual(errors, []);
      report.checks.push({
        name,
        viewport,
        trustedWheel: true,
        paragraph: id,
        autoResume: false,
        comfortGeometry,
        typography,
        clearedSettings: settings,
      });
      console.log(
        `${name}: trusted reading, explicit resume, preferences, clear and layout passed`,
      );
      await writeFile(`${output}/report.json`, JSON.stringify(report, null, 2));
    } catch (error) {
      await page.screenshot({ path: `${output}/${name}-failure.png` }).catch(() => {});
      throw error;
    } finally {
      await context.close();
      activePage = null;
    }
  }

  const context = await browser.newContext({
    viewport: { width: 320, height: 640 },
    reducedMotion: "reduce",
  });
  await context.addInitScript(() => {
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      get() {
        throw new DOMException("Storage blocked for QA", "SecurityError");
      },
    });
  });
  const page = await context.newPage();
  activePage = page;
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  try {
    await ready(page);
    await page.locator(".dream-reader-storage-note").waitFor({ state: "attached" });
    await page.getByRole("button", { name: "大きく", exact: true }).click();
    await page.getByRole("button", { name: "ゆったり", exact: true }).click();
    await page.locator('.dream-reader-index a[href="#dream-case-0"]').press("Enter");
    await page.waitForFunction(() => document.getElementById("dream-case-0").open);
    const typography = await page.locator("#dream-case-0-paragraph-1").evaluate((paragraph) => {
      const style = getComputedStyle(paragraph);
      return { font: parseFloat(style.fontSize), line: parseFloat(style.lineHeight) };
    });
    assert.equal(typography.font, 19);
    assert.ok(Math.abs(typography.line / typography.font - 2.3) < 0.02);
    const layout = await geometry(page, "storage-blocked320");
    assert.deepEqual(errors, []);
    await page.screenshot({ path: `${output}/storage-blocked320.png` });
    report.checks.push({ name: "storage-blocked320", typography, layout, controlsUsable: true });
    console.log("storage-blocked320: controls remain usable and paragraph text stays readable");
  } catch (error) {
    await page.screenshot({ path: `${output}/storage-blocked320-failure.png` }).catch(() => {});
    throw error;
  } finally {
    await context.close();
    activePage = null;
  }
  await writeFile(`${output}/report.json`, JSON.stringify(report, null, 2));
  console.log(`Dream reading support passed: ${output}/report.json`);
} catch (error) {
  if (activePage) await activePage.screenshot({ path: `${output}/failure.png` }).catch(() => {});
  report.failure = error.stack || error.message;
  await writeFile(`${output}/report.json`, JSON.stringify(report, null, 2));
  throw error;
} finally {
  await browser.close();
}
