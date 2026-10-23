// BASE_URL=http://127.0.0.1:4264 BROWSER=chrome|webkit BASELINE=1 node scripts/verify-dream-reading-refinement.mjs
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium, webkit } from "playwright";
import { checkedUrl } from "./browser-guard.mjs";

const base = checkedUrl(process.env.BASE_URL || "http://127.0.0.1:4264");
const baseline = process.env.BASELINE === "1";
const kind = process.env.BROWSER || "chrome";
const output = `output/playwright/dream-reading-refinement/${baseline ? "before" : "after"}/${kind}`;
await mkdir(output, { recursive: true });
const browser = await (kind === "webkit" ? webkit : chromium).launch(
  kind === "webkit" ? {} : { channel: "chrome" },
);
const report = [];
const scenarios = [
  [320, 640, "reduce"],
  [390, 844, "reduce"],
  [667, 375, "reduce"],
  [768, 1024, "reduce"],
  [1024, 768, "reduce"],
  [1440, 900, "reduce"],
  [390, 844, "normal"],
  [390, 844, "economy"],
];
try {
  for (const [width, height, mode] of scenarios) {
    const context = await browser.newContext({
      viewport: { width, height },
      reducedMotion: mode === "reduce" ? "reduce" : "no-preference",
    });
    await context.addInitScript(
      ({ mode }) => {
        localStorage.setItem(
          "deception-world:dream-reader:v1",
          JSON.stringify({
            version: 1,
            size: "standard",
            spacing: "standard",
            bookmark: { caseNo: "5", paragraph: 7 },
          }),
        );
        if (mode === "economy")
          Object.defineProperty(navigator, "connection", {
            configurable: true,
            value: {
              saveData: true,
              effectiveType: "4g",
              addEventListener() {},
              removeEventListener() {},
            },
          });
      },
      { mode },
    );
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(new URL("/dream-chapter", base).href);
    await page.waitForFunction(() => {
      const button = document.querySelector(".dream-reading-entry button");
      return button && Object.keys(button).some((key) => key.startsWith("__reactProps"));
    });
    await page.evaluate(() => document.fonts.ready);
    if (mode === "economy") {
      await page.waitForFunction(() => document.documentElement.dataset.worldEffects === "economy");
      assert.equal(await page.locator("html").getAttribute("data-world-effects"), "economy");
    }
    const launcher = page.locator(".dream-reading-entry button");
    await launcher.scrollIntoViewIfNeeded();
    await page.waitForTimeout(500);
    await launcher.click();
    const room = page.locator(".dream-reading-room[open]");
    await room.waitFor();
    await page.waitForTimeout(100);
    const departure = await page.evaluate(() => ({ top: document.body.style.top, y: scrollY }));
    await room.locator(".dream-reading-options summary").click();
    await page.waitForTimeout(100);
    const metrics = await room.evaluate((node) => {
      const scroll = node.querySelector(".dream-reading-scroll");
      const p = node.querySelector('[data-room-paragraph="7"]');
      return {
        textWidth: p.getBoundingClientRect().width,
        readingHeight: scroll.clientHeight,
        overflow: node.scrollWidth > innerWidth,
        bookmark: node.querySelector("progress").value,
        paragraphControl: [
          ...node.querySelectorAll(
            ".dream-reading-paragraph-pills button, .dream-reading-position-select select",
          ),
        ].some((n) => n.getClientRects().length > 0),
      };
    });
    assert.equal(metrics.bookmark, 7, "saved paragraph landing stays pinned");
    // Place a known character inside a long paragraph at the reading line.
    await room.evaluate((node) => {
      const scroll = node.querySelector(".dream-reading-scroll");
      const p = node.querySelector('[data-room-paragraph="7"]');
      const text = [...p.childNodes].find((n) => n.nodeType === 3 && n.textContent.trim());
      const range = document.createRange();
      range.setStart(text, 80);
      range.setEnd(text, 81);
      scroll.scrollTop +=
        range.getBoundingClientRect().top -
        scroll.getBoundingClientRect().top -
        Math.min(80, scroll.clientHeight * 0.2);
      window.__readingProbe = range;
    });
    await page.waitForTimeout(100);
    const lineTop = () =>
      page.evaluate(
        () =>
          window.__readingProbe.getBoundingClientRect().top -
          document.querySelector(".dream-reading-scroll").getBoundingClientRect().top,
      );
    const start = await lineTop();
    await room.getByRole("button", { name: "文字を大きく", exact: true }).click();
    await page.waitForTimeout(100);
    const sizeDrift = (await lineTop()) - start;
    const sizeLineHeight = await room
      .locator('[data-room-paragraph="7"]')
      .evaluate((node) => parseFloat(getComputedStyle(node).lineHeight));
    const beforeSpacing = await lineTop();
    await room.getByRole("button", { name: "行間を広く", exact: true }).click();
    await page.waitForTimeout(100);
    const spacingDrift = (await lineTop()) - beforeSpacing;
    const spacingLineHeight = await room
      .locator('[data-room-paragraph="7"]')
      .evaluate((node) => parseFloat(getComputedStyle(node).lineHeight));
    await page.screenshot({ path: `${output}/${width}x${height}-${mode}.png` });
    if (!baseline) {
      // The probe can wrap onto the line immediately after the anchored line
      // when letters grow. Wider leading then moves that second line by the
      // exact added leading, while the beginning of the anchored line stays put.
      assert.ok(
        Math.abs(sizeDrift) <= sizeLineHeight + 2,
        `type change retains current line: ${sizeDrift}`,
      );
      assert.ok(
        Math.abs(spacingDrift) <= spacingLineHeight - sizeLineHeight + 2,
        `leading change retains current line: ${spacingDrift}`,
      );
      assert.equal(metrics.overflow, false);
      assert.equal(metrics.paragraphControl, true);
      if (width === 768)
        assert.ok(metrics.textWidth > 550, "portrait tablet retains a generous line measure");
      if (height === 375)
        assert.ok(metrics.readingHeight > 230, "landscape settings preserve reading height");
      if (await room.locator(".dream-reading-position-select select").isVisible()) {
        await room.locator(".dream-reading-position-select select").selectOption("13");
        assert.equal(await room.locator("progress").getAttribute("value"), "13");
      } else await room.getByRole("button", { name: "13段落目へ移動", exact: true }).click();
      await room.getByRole("button", { name: "しおりを保存", exact: true }).click();
      assert.equal(
        await page.evaluate(
          () =>
            JSON.parse(localStorage.getItem("deception-world:dream-reader:v1")).bookmark.paragraph,
        ),
        13,
      );
      await room.locator(".dream-reading-scroll").evaluate((node) => {
        node.scrollTop = node.scrollHeight;
      });
      await page.waitForTimeout(80);
      await room.getByRole("button", { name: "文字を大きく", exact: true }).click();
      await page.waitForTimeout(80);
      assert.ok(
        await room
          .locator(".dream-reading-scroll")
          .evaluate((node) => node.scrollHeight - node.clientHeight - node.scrollTop < 2),
        "chapter end survives type changes",
      );
    }
    await room.getByRole("button", { name: "読書室を閉じる", exact: true }).click();
    await room.waitFor({ state: "hidden" });
    const restored = await page.evaluate(() => ({
      y: scrollY,
      focus: document.activeElement?.closest(".dream-reading-entry") !== null,
      fixed: document.body.style.position === "fixed",
    }));
    assert.equal(restored.focus, true);
    assert.equal(restored.fixed, false);
    assert.ok(
      Math.abs(restored.y - (departure.top ? -parseFloat(departure.top) : departure.y)) < 3,
      "close restores departure scroll",
    );
    assert.deepEqual(errors, []);
    report.push({
      width,
      height,
      mode,
      ...metrics,
      sizeDrift,
      spacingDrift,
      sizeLineHeight,
      spacingLineHeight,
      passed: true,
    });
    console.log(JSON.stringify(report.at(-1)));
    await context.close();
  }
} finally {
  await writeFile(`${output}/report.json`, JSON.stringify(report, null, 2));
  await browser.close();
}
