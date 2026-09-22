import assert from "node:assert/strict";
import { chromium, webkit } from "playwright";

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

try {
  for (const width of [320, 390, 834, 1024]) {
    const page = await browser.newPage({
      viewport: { width, height: 844 },
      hasTouch: true,
      userAgent:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 Version/26.0 Mobile/15E148 Safari/604.1",
    });
    for (const route of ["/rexonance-saga", "/extreme-saga", "/final-stage"]) {
      // Wait for hydration: the select handlers are attached by React.
      await page.goto(base + route, { waitUntil: "networkidle" });
      await page.waitForFunction(
        () => !document.documentElement.hasAttribute("data-route-scroll-settling"),
      );
      const layout = await page.locator(".rxs-local-nav-inner").evaluate((inner) => {
        const edge = inner.getBoundingClientRect();
        const menu = inner.querySelector(".side-panel-trigger").getBoundingClientRect();
        const brand = inner.querySelector(".rxs-brand").getBoundingClientRect();
        return {
          gap: edge.right - menu.right,
          clear: brand.right < menu.left,
          size: menu.width,
          overflow: document.documentElement.scrollWidth - innerWidth,
        };
      });
      assert.ok(
        Math.abs(layout.gap) <= 1 && layout.clear && layout.size >= 48 && layout.overflow <= 1,
        JSON.stringify(layout),
      );
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
    await page.goto(base + "/riders/saga");
    const links = await page.locator(".dossier-reader-links a").evaluateAll((items) =>
      items.map((item) => ({
        height: item.getBoundingClientRect().height,
        font: parseFloat(getComputedStyle(item).fontSize),
      })),
    );
    assert.ok(links.length > 0 && links.every((link) => link.height >= 48 && link.font >= 13));
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
