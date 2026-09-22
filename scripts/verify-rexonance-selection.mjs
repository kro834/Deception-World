import assert from "node:assert/strict";
import { chromium } from "playwright";

const base = process.env.BASE_URL || "http://127.0.0.1:8082";
const browser = await chromium.launch({ channel: "chrome" });

const profiles = [
  {
    name: "iphone-320",
    viewport: { width: 320, height: 844 },
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 Version/26.0 Mobile/15E148 Safari/604.1",
  },
  {
    name: "iphone-390",
    viewport: { width: 390, height: 844 },
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 Version/26.0 Mobile/15E148 Safari/604.1",
  },
  {
    name: "ipad-landscape-1024",
    viewport: { width: 1024, height: 768 },
    userAgent:
      "Mozilla/5.0 (iPad; CPU OS 18_7 like Mac OS X) AppleWebKit/605.1.15 Version/26.0 Mobile/15E148 Safari/604.1",
  },
];

const hasVisibleOutline = (value) =>
  value.style !== "none" && value.style !== "hidden" && Number.parseFloat(value.width) > 0;

async function outline(select) {
  return select.evaluate((control) => {
    const style = getComputedStyle(control);
    return { style: style.outlineStyle, width: style.outlineWidth, color: style.outlineColor };
  });
}

async function verifySelect(page, ariaLabel) {
  const select = page.getByLabel(ariaLabel, { exact: true });
  await select.waitFor();
  const values = await select
    .locator("option")
    .evaluateAll((options) => options.map((option) => option.value));
  assert.ok(values.length >= 2, `${ariaLabel}: expected multiple options`);

  // Playwright drives the DOM select rather than the native iOS picker. The
  // assertions below cover React input/change handling and modality styling.
  for (const value of values) {
    await select.focus();
    await select.dispatchEvent("pointerdown", { pointerType: "touch", isPrimary: true });
    assert.equal(await select.getAttribute("data-pointer-focus"), "true");
    await select.selectOption(value);
    assert.equal(await select.inputValue(), value);
    assert.equal(
      await select.evaluate((control) => document.activeElement === control),
      true,
      `${ariaLabel}: input/change must not force blur`,
    );
    assert.equal(
      hasVisibleOutline(await outline(select)),
      false,
      `${ariaLabel}: pointer focus should not retain a highlight`,
    );
  }

  // Model dismissing the native picker without a value change: the page gets
  // no input, change, or keyboard event, so pointer modality must remain.
  const unchanged = await select.inputValue();
  await select.focus();
  await select.dispatchEvent("pointerdown", { pointerType: "touch", isPrimary: true });
  assert.equal(await select.inputValue(), unchanged);
  assert.equal(await select.getAttribute("data-pointer-focus"), "true");
  assert.equal(hasVisibleOutline(await outline(select)), false);

  // Escape is a real keyboard event and must restore keyboard modality. Moving
  // away and back makes Chromium apply :focus-visible deterministically.
  await page.keyboard.press("Escape");
  assert.equal(await select.getAttribute("data-pointer-focus"), null);
  await page.keyboard.press("Tab");
  await page.keyboard.press("Shift+Tab");
  assert.equal(await select.evaluate((control) => document.activeElement === control), true);
  assert.equal(
    hasVisibleOutline(await outline(select)),
    true,
    `${ariaLabel}: keyboard focus outline should recover`,
  );

  return values;
}

async function numericClipReport(page) {
  return page.evaluate(() => {
    const selectors = [
      ".rxs-headline-metrics strong",
      ".rxs-comparison article strong",
      ".rxs-comparison-result b",
      ".rxs-p14-copy dd",
      ".rxs-p14-values b",
      ".rxs-p14-values strong",
      ".rxs-p14-metrics article > p b",
      ".rxs-specs strong",
    ].join(",");
    const failures = [];
    let ranges = 0;
    let commaRanges = 0;
    const tolerance = 1.25;

    for (const element of document.querySelectorAll(selectors)) {
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
      for (let text = walker.nextNode(); text; text = walker.nextNode()) {
        if (!/[\d,]/.test(text.data)) continue;
        const range = document.createRange();
        range.selectNodeContents(text);
        const rect = range.getBoundingClientRect();
        range.detach();
        if (rect.width === 0 || rect.height === 0) continue;
        ranges += 1;
        if (text.data.includes(",")) commaRanges += 1;

        for (
          let ancestor = element.parentElement;
          ancestor && ancestor !== document.body;
          ancestor = ancestor.parentElement
        ) {
          const style = getComputedStyle(ancestor);
          const clipsX = /(hidden|clip|auto|scroll)/.test(style.overflowX);
          const clipsY = /(hidden|clip|auto|scroll)/.test(style.overflowY);
          if (!clipsX && !clipsY) continue;
          const bounds = ancestor.getBoundingClientRect();
          const outsideX =
            clipsX &&
            (rect.left < bounds.left - tolerance || rect.right > bounds.right + tolerance);
          const outsideY =
            clipsY &&
            (rect.top < bounds.top - tolerance || rect.bottom > bounds.bottom + tolerance);
          if (outsideX || outsideY) {
            failures.push({
              text: text.data.trim(),
              element: element.className,
              ancestor: ancestor.className || ancestor.tagName,
              rect: { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom },
              bounds: {
                left: bounds.left,
                top: bounds.top,
                right: bounds.right,
                bottom: bounds.bottom,
              },
              overflow: `${style.overflowX}/${style.overflowY}`,
            });
            break;
          }
        }
      }
    }
    return { ranges, commaRanges, failures };
  });
}

try {
  for (const profile of profiles) {
    const context = await browser.newContext({
      viewport: profile.viewport,
      userAgent: profile.userAgent,
      isMobile: profile.viewport.width < 768,
      hasTouch: true,
      deviceScaleFactor: profile.viewport.width < 768 ? 3 : 2,
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`${base}/rexonance-saga`, { waitUntil: "networkidle" });
    await page.locator(".rxs-p14-native-select select").waitFor();
    assert.equal(await page.locator("main select").count(), 2, "expected both native selectors");

    const comparisonValues = await verifySelect(page, "レクソナンスの比較対象");
    assert.deepEqual(comparisonValues, ["vertex", "vinculum", "extreme"]);
    const p14Values = await verifySelect(page, "P14の比較基準");
    assert.deepEqual(p14Values, ["p1", "p2"]);

    let measuredRanges = 0;
    let measuredCommaRanges = 0;
    for (const comparison of comparisonValues) {
      await page.getByLabel("レクソナンスの比較対象", { exact: true }).selectOption(comparison);
      await page.locator(`.rxs-comparison-metrics[data-baseline="${comparison}"]`).waitFor();
      for (const p14 of p14Values) {
        await page.getByLabel("P14の比較基準", { exact: true }).selectOption(p14);
        await page.locator(`.rxs-p14-metrics[data-baseline="${p14}"]`).waitFor();
        const clipping = await numericClipReport(page);
        measuredRanges += clipping.ranges;
        measuredCommaRanges += clipping.commaRanges;
        assert.ok(clipping.ranges > 0, `${comparison}/${p14}: expected numeric DOM ranges`);
        assert.deepEqual(
          clipping.failures,
          [],
          `${comparison}/${p14}: ${JSON.stringify(clipping.failures, null, 2)}`,
        );
      }
    }
    assert.ok(measuredCommaRanges > 0, "expected comma-bearing DOM ranges across comparisons");
    assert.deepEqual(errors, []);
    await page.screenshot({
      path: `/tmp/rexonance-selection-${profile.name}.png`,
      fullPage: true,
    });
    console.log(
      `PASS ${profile.name}: both native selects, pointer/dismiss/keyboard focus, all options, ${measuredRanges} numeric ranges (${measuredCommaRanges} with comma) across 3x2 states, no clipping`,
    );
    await context.close();
  }
  console.log(
    "NOTE: Chromium emulates touch and an iOS user agent; this does not operate or certify a physical iOS native picker wheel.",
  );
} finally {
  await browser.close();
}
