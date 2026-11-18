import assert from "node:assert/strict";
import { chromium, webkit } from "playwright";
import { assertSpecialControlLayout } from "./special-control-layout.mjs";

const engine = process.env.PW_ENGINE === "webkit" ? webkit : chromium;
const browser = await engine.launch(engine === chromium ? { channel: "chrome" } : {});
const base = process.env.BASE_URL || "http://localhost:8082";

async function checkSelect(select, page) {
  const before = await select.evaluate((control) => ({
    index: control.selectedIndex,
    values: [...control.options].map((option) => option.value),
  }));
  const nextIndex = before.index > 0 ? before.index - 1 : 1;
  await select.focus();
  await select.press(before.index > 0 ? "ArrowUp" : "ArrowDown");
  // Native OS picker windows are not driven by headless keyboard events.
  // Supply their change result, then test the application's keyboard modality.
  await select.press("Escape");
  await select.selectOption(before.values[nextIndex]);
  await page.waitForTimeout(80); // Include the deferred pointer-only blur frame.
  assert.equal(await select.inputValue(), before.values[nextIndex]);
  assert.equal(await select.evaluate((control) => document.activeElement === control), true);
  await page.keyboard.press("Tab");
  assert.equal(await page.evaluate(() => document.activeElement === document.body), false);
  // Exercise the pointer branch of change handling separately from native OS UI.
  await select.focus();
  await select.dispatchEvent("pointerdown", { pointerType: "touch" });
  await select.selectOption(before.values[before.index]);
  await page.waitForTimeout(80);
  // Pointer emphasis must be cleared: either the select blurs, or it keeps
  // focus (so a native iOS picker stays usable) marked as pointer focus with
  // no visible outline.
  const pointerState = await select.evaluate((control) => ({
    focused: document.activeElement === control,
    marked: control.dataset.pointerFocus === "true",
    outline: getComputedStyle(control).outlineStyle,
    label: control.getAttribute("aria-label") ?? control.id,
    width: innerWidth,
  }));
  assert.ok(
    !pointerState.focused || (pointerState.marked && pointerState.outline === "none"),
    JSON.stringify(pointerState),
  );
}

async function checkTextEnlargement(route, width) {
  const page = await browser.newPage({
    viewport: { width, height: 844 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 Version/26.0 Mobile/15E148 Safari/604.1",
  });
  try {
    await page.goto(base + route, { waitUntil: "networkidle" });
    const baseMetrics = await page.evaluate(() => ({
      font: parseFloat(getComputedStyle(document.querySelector(".rxs-brand b")).fontSize),
      navHeight: document.querySelector(".rxs-local-nav").getBoundingClientRect().height,
      pagePadding: parseFloat(getComputedStyle(document.querySelector(".rxs-page")).paddingTop),
    }));
    await page.evaluate(() =>
      document.documentElement.style.setProperty("-webkit-text-size-adjust", "200%"),
    );
    await page.waitForFunction(
      (font) =>
        parseFloat(getComputedStyle(document.querySelector(".rxs-brand b")).fontSize) >= font * 1.9,
      baseMetrics.font,
    );
    // The page reserve follows the nav through ResizeObserver + one animation frame
    // (rexonance-saga.tsx queueNavReserve); wait for that frame before reading it.
    await page.waitForFunction(() => {
      const nav = document.querySelector(".rxs-local-nav").getBoundingClientRect().height;
      const pad = parseFloat(getComputedStyle(document.querySelector(".rxs-page")).paddingTop);
      return pad >= nav - 1;
    });
    const enlarged = await page.evaluate(() => {
      const page = document.querySelector(".rxs-page");
      const nav = document.querySelector(".rxs-local-nav");
      const brand = document.querySelector(".rxs-brand").getBoundingClientRect();
      const menu = document.querySelector(".side-panel-trigger").getBoundingClientRect();
      return {
        font: parseFloat(getComputedStyle(document.querySelector(".rxs-brand b")).fontSize),
        navHeight: nav.getBoundingClientRect().height,
        pagePadding: parseFloat(getComputedStyle(page).paddingTop),
        brandRight: brand.right,
        menuLeft: menu.left,
        overflow: document.documentElement.scrollWidth - innerWidth,
      };
    });
    assert.ok(enlarged.font >= baseMetrics.font * 1.9, JSON.stringify(enlarged));
    assert.ok(enlarged.brandRight <= enlarged.menuLeft + 1, JSON.stringify(enlarged));
    assert.ok(enlarged.pagePadding >= enlarged.navHeight - 1, JSON.stringify(enlarged));
    assert.ok(enlarged.overflow <= 1, JSON.stringify(enlarged));

    await page.evaluate(() =>
      document.documentElement.style.removeProperty("-webkit-text-size-adjust"),
    );
    await page.waitForFunction(
      (font) =>
        Math.abs(
          parseFloat(getComputedStyle(document.querySelector(".rxs-brand b")).fontSize) - font,
        ) < 1,
      baseMetrics.font,
    );
    const restored = await page.evaluate(() => ({
      navHeight: document.querySelector(".rxs-local-nav").getBoundingClientRect().height,
      pagePadding: parseFloat(getComputedStyle(document.querySelector(".rxs-page")).paddingTop),
    }));
    assert.ok(Math.abs(restored.navHeight - baseMetrics.navHeight) < 1, JSON.stringify(restored));
    assert.ok(restored.pagePadding >= restored.navHeight - 1, JSON.stringify(restored));
    console.log(
      `PASS ${width}px ${route}: 200% text-enlargement emulation preserves header separation and resets`,
    );
  } finally {
    await page.close();
  }
}

async function checkLandscapeHero(route, actionSelector) {
  const page = await browser.newPage({
    viewport: { width: 375, height: 667 },
    isMobile: true,
    hasTouch: true,
  });
  try {
    await page.goto(base + route);
    await page.locator(".rxs-hero h1").waitFor();
    await page.evaluate(() => document.fonts.ready);
    for (const viewport of [{ width: 568, height: 320 }, { width: 667, height: 375 }, { width: 844, height: 390 }]) {
      await page.setViewportSize(viewport);
      // Rotation updates the measured header reserve and may start the hero reveal.
      await page.waitForFunction((action) => {
        const rect = (selector) => document.querySelector(selector).getBoundingClientRect();
        const title = rect(".rxs-hero h1");
        const button = rect(action);
        return title.top >= rect(".rxs-local-nav").bottom - 1 &&
          title.bottom <= innerHeight && button.bottom <= innerHeight;
      }, actionSelector, { timeout: 5000 });
    }
  } finally {
    await page.close();
  }
}

async function checkFarFromChapterLinks() {
  const page = await browser.newPage({ viewport: { width: 320, height: 667 }, hasTouch: true });
  try {
    await page.goto(base + "/far-from-saga", { waitUntil: "domcontentloaded" });
    const index = page.locator(".ffs-p16-index");
    await index.getByRole("link").first().waitFor();
    assert.equal(await index.getByRole("link").count(), 3);
    for (const link of await index.getByRole("link").all()) {
      const hash = await link.getAttribute("href");
      await link.click();
      await page.waitForFunction((hash) => location.hash === hash &&
        document.activeElement === document.querySelector(hash), hash);
      if (hash === "#ffs-p16-benchmarks-title") {
        // A late Japanese font can grow the sections above a cold deep link.
        // Force the same geometry change even with the font already cached.
        await page.evaluate(() => {
          const spacer = document.createElement("div");
          spacer.id = "probe-late-font-growth";
          spacer.style.height = "145px";
          document.getElementById("p16").before(spacer);
        });
      }
      await page.waitForFunction((hash) => {
        const heading = document.querySelector(hash);
        const inset = parseFloat(getComputedStyle(heading).scrollMarginTop);
        return Math.abs(heading.getBoundingClientRect().top - inset) < 2;
      }, hash, { timeout: 5000 });
      const gap = await page.locator(hash).evaluate(async (heading) => {
        const section = heading.closest(".rxs-reveal");
        await Promise.all(section.getAnimations().map((animation) => animation.finished.catch(() => {})));
        await new Promise(requestAnimationFrame);
        const bar = document.querySelector(".rxs-local-nav");
        return heading.getBoundingClientRect().top - bar.getBoundingClientRect().bottom;
      });
      assert.ok(gap >= 0 && gap < 60, `${hash}: heading gap ${gap}`);
      await page.locator('.rxs-local-nav a[href="#p16"][aria-current="location"]').waitFor({ state: "visible" });
      if (hash === "#ffs-p16-benchmarks-title")
        await page.locator("#probe-late-font-growth").evaluate((element) => element.remove());
    }
    for (const [id, artwork] of [
      ["suitup", ".ffs-armour-section"],
      ["stages", ".ffs-exhibit-forms"],
      ["theories", ".ffs-exhibit-core"],
    ]) {
      const heading = page.locator(`#${id} > .rxs-section-heading`);
      await heading.scrollIntoViewIfNeeded();
      const clearance = await heading.evaluate((header, artwork) => {
        const picture = header.querySelector(artwork).getBoundingClientRect();
        const title = header.querySelector("h2").getBoundingClientRect();
        return picture.top - title.bottom;
      }, artwork);
      assert.ok(clearance >= 0, `${id}: 320px artwork overlaps its title by ${-clearance}px`);
    }
  } finally {
    await page.close();
  }
}

try {
  await checkLandscapeHero("/rexonance-saga", ".rxe-hero-primary");
  await checkLandscapeHero("/far-from-saga", ".ffs-hero-primary");
  await checkFarFromChapterLinks();
  for (const width of [320, 390, 834, 1024, 1440, 1920]) {
    const page = await browser.newPage({
      viewport: { width, height: 844 },
      hasTouch: true,
      userAgent:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 Version/26.0 Mobile/15E148 Safari/604.1",
    });
    for (const route of ["/rexonance-saga", "/extreme-saga", "/illusionculum-saga", "/final-stage"]) {
      // Wait for hydration: the select handlers are attached by React.
      await page.goto(base + route, { waitUntil: "networkidle" });
      await page.waitForFunction(
        () => !document.documentElement.hasAttribute("data-route-scroll-settling"),
      );
      const layout = await page.locator(".rxs-local-nav-inner").evaluate((inner) => {
        const edge = inner.getBoundingClientRect();
        const style = getComputedStyle(inner);
        const menu = inner.querySelector(".side-panel-trigger").getBoundingClientRect();
        const brand = inner.querySelector(".rxs-brand").getBoundingClientRect();
        return {
          gap: edge.right - menu.right,
          paddingRight: parseFloat(style.paddingRight),
          borderRight: parseFloat(style.borderRightWidth),
          clear: brand.right < menu.left,
          size: menu.width,
          overflow: document.documentElement.scrollWidth - innerWidth,
        };
      });
      assertSpecialControlLayout(layout, `${width}px ${route}`);
      const comparisonSelect = page.locator(".rxs-comparison-selector select");
      if ((await comparisonSelect.count()) > 0) await checkSelect(comparisonSelect, page);
      if (route === "/rexonance-saga")
        await checkSelect(page.locator(".rxs-p14-native-select select"), page);
      const tabs = page.locator('.rxs-stage-tabs [role="tab"]');
      await tabs.first().focus();
      await page.keyboard.press("ArrowRight");
      await page.waitForFunction(
        () =>
          document
            .querySelectorAll('.rxs-stage-tabs [role="tab"]')[1]
            ?.getAttribute("aria-selected") === "true",
      );
      await page.waitForFunction(() => {
        const panel = document.querySelector('.rxs-stage-panel[role="tabpanel"]');
        const label = document.getElementById(panel?.getAttribute("aria-labelledby"));
        return label?.getAttribute("aria-selected") === "true" && label?.tabIndex === 0;
      });
      const semantics = await page
        .locator('.rxs-stage-panel[role="tabpanel"]')
        .evaluate((panel) => {
          const label = document.getElementById(panel.getAttribute("aria-labelledby"));
          return (
            label?.getAttribute("aria-selected") === "true" &&
            label?.getAttribute("aria-controls") === panel.id &&
            label?.tabIndex === 0
          );
        });
      assert.equal(semantics, true);
      console.log(
        `PASS ${width}px ${route}: header alignment, keyboard/pointer selection, labelled tabs`,
      );
    }
    if (width === 320 || width === 390) {
      for (const route of ["/rexonance-saga", "/extreme-saga", "/illusionculum-saga", "/final-stage"]) {
        await checkTextEnlargement(route, width);
      }
    }
    await page.goto(base + "/riders/saga", { waitUntil: "networkidle" });
    await page.locator(".dossier-reader-links a").first().waitFor();
    const links = await page.locator(".dossier-reader-links a").evaluateAll((items) =>
      items.map((item) => ({
        height: item.getBoundingClientRect().height,
        font: parseFloat(getComputedStyle(item).fontSize),
      })),
    );
    assert.ok(
      links.length > 0 && links.every((link) => link.height >= 48 && link.font >= 13),
      `${width}px dossier navigation targets: ${JSON.stringify(links)}`,
    );
    await page.goto(base + "/form-archive");
    for (const kind of ["saga", "realm"]) {
      await page.waitForFunction(
        () => document.querySelector("#archive-switcher")?.getAttribute("aria-busy") === "false",
      );
      if (kind === "realm") await page.locator('[data-archive="realm"]').click();
      await page.locator(`#form-archive-frame[data-archive-kind="${kind}"]`).waitFor();
      const home = page.frameLocator("#form-archive-frame").locator(".archive-wordmark").first();
      await home.waitFor();
      const rect = await home.boundingBox();
      assert.ok(
        rect.width >= 47.9 && rect.height >= 47.9,
        `${kind} home target: ${JSON.stringify(rect)}`,
      );
    }
    console.log(`PASS ${width}px dossier navigation and both archive home targets`);
    await page.close();
  }
} finally {
  await browser.close();
}
