import assert from "node:assert/strict";
import { chromium, webkit } from "playwright";

const engine = process.env.PW_ENGINE === "webkit" ? webkit : chromium;
const browser = await engine.launch(engine === chromium ? { channel: "chrome" } : {});
const base = process.env.BASE_URL || "http://localhost:8082";

async function ready(page) {
  await page.waitForFunction(
    () =>
      document.documentElement.dataset.scrollMotionReady === "true" &&
      !document.documentElement.hasAttribute("data-route-scroll-settling"),
  );
}

async function checkNotices(page, width) {
  await page.goto(base + "/world");
  await ready(page);
  await page.locator(".side-panel-trigger").click();
  await page.locator(".side-panel-announcement-trigger").click();
  const dialog = page.locator("#site-announcement-dialog[open]");
  await dialog.waitFor();
  const cards = await dialog.locator(".site-announcement-list-copy").evaluateAll((nodes) =>
    nodes.map((node) => {
      const title = node.querySelector("b");
      const date = node.querySelector("time");
      const visual = node.parentElement
        .querySelector(".site-announcement-list-visual")
        .getBoundingClientRect();
      const copy = node.getBoundingClientRect();
      return {
        clearOfImage: visual.right <= copy.left - 1,
        titleClipped:
          title.scrollWidth > title.clientWidth + 1 || title.scrollHeight > title.clientHeight + 1,
        wraps: getComputedStyle(title).whiteSpace === "normal",
        titleFont: parseFloat(getComputedStyle(title).fontSize),
        dateFont: parseFloat(getComputedStyle(date).fontSize),
        dateVisible: date.getBoundingClientRect().height > 0,
      };
    }),
  );
  assert.ok(cards.length >= 3);
  for (const card of cards) {
    assert.ok(
      card.clearOfImage && card.wraps && !card.titleClipped && card.titleFont >= 16,
      JSON.stringify(card),
    );
    assert.ok(card.dateVisible && card.dateFont >= 11, JSON.stringify(card));
  }
  assert.ok(await dialog.evaluate((node) => node.scrollWidth <= node.clientWidth + 1));
  if (width >= 1180) {
    const pair = await dialog.locator(".site-announcement-list-item").evaluateAll((nodes) =>
      nodes.slice(0, 2).map((node) => ({
        top: node.getBoundingClientRect().top,
        height: node.getBoundingClientRect().height,
        textWidth: node.querySelector(".site-announcement-list-copy").clientWidth,
      })),
    );
    assert.ok(Math.abs(pair[0].top - pair[1].top) < 1);
    assert.ok(Math.abs(pair[0].height - pair[1].height) < 1, "two-column cards stay equal height");
    assert.ok(
      pair.every((card) => card.textWidth >= 220),
      "two-column titles retain reading room",
    );
  }
  await page.waitForTimeout(350);
  if (process.env.CAPTURE_DIR) {
    await page.screenshot({ path: `${process.env.CAPTURE_DIR}/notices-${width}.png` });
  }
  await dialog.locator(".site-announcement-close").click();
  await page.locator(".side-panel-close").click();
  assert.notEqual(
    await page.evaluate(() => getComputedStyle(document.documentElement).overflow),
    "hidden",
  );
  console.log(`PASS ${width}px notices: full titles, readable dates, close unlocks page`);
}

async function checkSpecialComparison(page, route, width) {
  await page.goto(base + route);
  await ready(page);
  const select = page.locator(".rxs-comparison-selector select");
  await select.evaluate((node) => node.scrollIntoView({ block: "center", behavior: "instant" }));
  const options = await select
    .locator("option")
    .evaluateAll((nodes) => nodes.map((node) => node.value));
  assert.ok(
    await select.evaluate((node) => {
      const style = getComputedStyle(node);
      const context = document.createElement("canvas").getContext("2d");
      context.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
      const available =
        node.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight) - 24;
      return [...node.options].every(
        (option) => context.measureText(option.text).width <= available,
      );
    }),
    "native comparison options fit",
  );
  for (const baseline of options) {
    await select.selectOption(baseline);
    await page.waitForTimeout(550);
    const rows = await page.locator(".rxs-comparison-metrics article header").evaluateAll((nodes) =>
      nodes.map((node) => {
        const actual = node.firstElementChild.getBoundingClientRect();
        const ratio = node.lastElementChild.getBoundingClientRect();
        const bounds = node.getBoundingClientRect();
        return {
          overlap:
            actual.left < ratio.right - 1 &&
            actual.right > ratio.left + 1 &&
            actual.top < ratio.bottom - 1 &&
            actual.bottom > ratio.top + 1,
          inside: ratio.left >= bounds.left - 1 && ratio.right <= bounds.right + 1,
          aligned: Math.abs(ratio.right - bounds.right) <= 1,
          stacked: ratio.top >= actual.bottom,
        };
      }),
    );
    assert.equal(rows.length, 4);
    for (const row of rows) {
      assert.ok(!row.overlap && row.inside && row.aligned, JSON.stringify(row));
      if (width <= 360) assert.ok(row.stacked);
    }
  }
  console.log(`PASS ${width}px ${route}: all comparison options and result alignment`);
}

async function checkArchive(page, kind, width) {
  await page.goto(`${base}/${kind}-form-archive-embedded.html`);
  const root = page.locator('[id$="saga-form-compare-ios"].saga-compare-section');
  await page.waitForFunction(
    () =>
      document.querySelector('[id$="saga-form-compare-ios"].saga-compare-section')?.dataset
        .catalogComparison === "ready",
  );
  await root.evaluate((node) => node.scrollIntoView({ block: "start", behavior: "instant" }));
  const a = root.locator(".compare-side-a .compare-native-select");
  const b = root.locator(".compare-side-b .compare-native-select");
  const values = await a.locator("option").evaluateAll((nodes) => nodes.map((node) => node.value));
  for (const pair of [
    [values[0], values[1]],
    [values[1], values[1]],
    [values.at(-1), values[0]],
  ]) {
    await a.selectOption(pair[0]);
    await b.selectOption(pair[1]);
    await page.waitForTimeout(350);
    const notes = root.locator(".compare-result-a11y");
    const noteCount = await notes.count();
    if (pair[0] === pair[1]) assert.ok(noteCount > 0, "same rated form exposes equal results");
    const rows = root.locator(".spec-item[data-compare-result]");
    assert.equal(noteCount, await rows.count(), "one accessible result per decorated row");
    if (noteCount > 0) {
      assert.ok((await rows.first().ariaSnapshot()).match(/(比較優位|比較相手が優位|同値)/));
      assert.ok(
        await notes.first().evaluate((node) => {
          const style = getComputedStyle(node);
          return (
            style.position === "absolute" &&
            parseFloat(style.width) <= 1 &&
            style.display !== "none" &&
            node.getAttribute("aria-hidden") !== "true"
          );
        }),
      );
    }
    const data = await root.locator(".compare-side").evaluateAll((sides) =>
      sides.map((side) => {
        const selected = side.querySelector(".compare-native-select").value;
        const card = [...side.querySelectorAll(".compare-form-card")].find(
          (node) => node.dataset.formId === selected,
        );
        return {
          rows: [...card.querySelectorAll(".spec-item")]
            .map((row) => ({
              order: row.style.order,
              top: row.getBoundingClientRect().top,
              height: row.getBoundingClientRect().height,
            }))
            .sort((a, b) => Number(a.order) - Number(b.order)),
          smallFonts: [
            ...side.querySelectorAll(
              "legend, legend b, .compare-advantage-summary span, .compare-advantage-summary small",
            ),
            ...card.querySelectorAll(".viz-badge, .text-muted, .spec-compare-badge"),
          ]
            .filter((node) => node.getBoundingClientRect().height > 0)
            .map((node) => parseFloat(getComputedStyle(node).fontSize)),
        };
      }),
    );
    assert.equal(data[0].rows.length, data[1].rows.length);
    data[0].rows.forEach((row, i) => {
      assert.ok(Math.abs(row.top - data[1].rows[i].top) < 2, "comparison row top stays aligned");
      assert.ok(
        Math.abs(row.height - data[1].rows[i].height) < 2,
        "comparison row height stays aligned",
      );
    });
    if (width <= 700)
      assert.ok(data.every((side) => side.smallFonts.every((font) => font >= 10.99)));
  }
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  console.log(`PASS ${width}px ${kind}: labels, accessible results refresh, matched row heights`);
}

try {
  for (const width of [320, 390, 1024, 1280]) {
    const page = await browser.newPage({
      viewport: { width, height: width > 700 ? 768 : 844 },
      hasTouch: true,
    });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await checkNotices(page, width);
    for (const route of ["/rexonance-saga", "/extreme-saga"])
      await checkSpecialComparison(page, route, width);
    for (const kind of ["saga", "realm"]) await checkArchive(page, kind, width);
    assert.deepEqual(errors, []);
    await page.close();
  }
} finally {
  await browser.close();
}
