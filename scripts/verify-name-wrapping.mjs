import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium, webkit } from "playwright";
import { checkedOutputPath, checkedUrl } from "./browser-guard.mjs";

const base = checkedUrl(process.env.BASE_URL || "http://127.0.0.1:8087");
const engine = process.env.PW_ENGINE || "chromium";
const iframeMode = process.env.IFRAME !== "false";
const output = checkedOutputPath(process.env.AUDIT_OUT || `/tmp/name-wrapping-${engine}`, [
  "/tmp",
  "/private/tmp",
]);
const paths = process.env.PW_PATHS?.split(",") || [
  "/riders/saga",
  "/riders/realm",
  "/world",
  "/extreme-saga",
  "/rexonance-saga",
  "/final-stage",
  "/saga-form-archive-embedded.html",
  "/realm-form-archive-embedded.html",
];
const widths = process.env.PW_WIDTHS?.split(",").map(Number) || [320, 390, 667, 1440];
const browser = await (engine === "webkit" ? webkit : chromium).launch(
  engine === "webkit" ? {} : { channel: "chrome" },
);
await mkdir(output, { recursive: true });

async function checkNames(page) {
  const metrics = await page.evaluate(() => {
    const visible = [...document.querySelectorAll(".name-word")].filter(
      (node) => node.getClientRects().length && getComputedStyle(node).visibility !== "hidden",
    );
    const bad = [];
    let saga = 0;
    for (const node of visible) {
      const bounds = node.getBoundingClientRect();
      const style = getComputedStyle(node);
      const parentStyle = getComputedStyle(node.parentElement);
      for (const property of [
        "fontSize",
        "fontFamily",
        "fontWeight",
        "letterSpacing",
        "lineHeight",
      ]) {
        if (style[property] !== parentStyle[property])
          bad.push(`type changed ${property}: ${node.textContent}`);
      }
      if (bounds.right > innerWidth + 1 || bounds.left < -1)
        bad.push(`outside: ${node.textContent}`);
      const index = node.textContent.indexOf("サーガ");
      if (index < 0) continue;
      saga++;
      const range = document.createRange();
      range.setStart(node.firstChild, index);
      range.setEnd(node.firstChild, index + 3);
      const lines = [...range.getClientRects()].filter((rect) => rect.width > 0);
      if (new Set(lines.map((rect) => Math.round(rect.top))).size !== 1)
        bad.push(`split Saga: ${node.textContent}`);
    }
    return {
      total: document.querySelectorAll(".name-word").length,
      count: visible.length,
      saga,
      bad,
      overflow: document.documentElement.scrollWidth - innerWidth,
    };
  });
  assert.ok(metrics.total, "shared name markup must be present");
  assert.deepEqual(metrics.bad, []);
  assert.equal(metrics.overflow, 0);
  return metrics;
}

async function checkFineBreaks(page, scope = "body") {
  const bad = await page.locator(scope).evaluate((root) => {
    const bad = [];
    for (const element of root.querySelectorAll("p, dd, .spec-value")) {
      if (!element.getClientRects().length || getComputedStyle(element).visibility === "hidden")
        continue;
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
      const lines = new Map();
      // Strict kinsoku can hang a closing bracket into the value's padding.
      // Check the real containing field, not a narrower text-content box.
      const bounds = element.parentElement.getBoundingClientRect();
      let outside = false;
      while (walker.nextNode()) {
        const node = walker.currentNode;
        for (let index = 0; index < node.length; index++) {
          const character = node.textContent[index];
          if (/\s/.test(character)) continue;
          const range = document.createRange();
          range.setStart(node, index);
          range.setEnd(node, index + 1);
          const rect = range.getBoundingClientRect();
          if (!rect.width || !rect.height) continue;
          if (
            element.matches("dd, .spec-value") &&
            /\d/.test(element.textContent) &&
            (rect.right > bounds.right + 1 || rect.left < bounds.left - 1)
          )
            outside = true;
          const key = Math.round(rect.top);
          lines.set(key, `${lines.get(key) || ""}${character}`);
        }
      }
      if (outside) bad.push(`value outside its column: ${element.textContent}`);
      for (const text of lines.values()) {
        if (/^[、。，）』」】]/u.test(text))
          bad.push(`line starts with closing punctuation: ${text}`);
        if (element.matches("dd, .spec-value") && /^,\d/.test(text))
          bad.push(`numeric comma stranded: ${text}`);
      }
    }
    return bad;
  });
  assert.deepEqual(bad, []);
}

try {
  for (const width of widths) {
    for (const path of paths) {
      const page = await browser.newPage({
        viewport: { width, height: width === 667 ? 375 : 844 },
        reducedMotion: "reduce",
      });
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      let doc = page;
      if (path.includes("archive-embedded") && iframeMode) {
        const kind = path.startsWith("/realm") ? "realm" : "saga";
        await page.goto(`${base}/form-archive`, { waitUntil: "domcontentloaded" });
        await page.locator('#archive-switcher[aria-busy="false"]').waitFor();
        if (kind === "realm") {
          await page.locator('button[data-archive="realm"]').click();
          await page.locator('#archive-switcher[aria-busy="false"]').waitFor();
        }
        const frame = await page.locator(`iframe[data-archive-kind="${kind}"]`).elementHandle();
        doc = await frame.contentFrame();
        assert.ok(doc);
        assert.equal(await frame.getAttribute("sandbox"), "allow-scripts allow-downloads");
      } else {
        await page.goto(`${base}${path}`, { waitUntil: "domcontentloaded" });
      }
      await doc.locator(".name-word").first().waitFor({ state: "attached" });
      await doc.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(200);
      const before = await checkNames(doc);
      if (width <= 390) await checkFineBreaks(doc);
      if (path === "/riders/saga") {
        const pickup = page
          .locator('.form-pickup[aria-label*="エクスプリーム"] .form-pickup-plus')
          .first();
        await pickup.click();
        await page.locator(".form-pickup-dialog[open]").waitFor();
        await checkNames(page);
        if (width <= 390) await checkFineBreaks(page, ".form-pickup-dialog[open]");
        const ultra = page
          .locator(".form-pickup-dialog[open] .form-pickup-gallery b")
          .filter({ hasText: "エクスプリームサーガ・ウルトラ" });
        assert.equal(await ultra.textContent(), "エクスプリームサーガ・ウルトラ");
        await ultra.scrollIntoViewIfNeeded();
        await page.screenshot({ path: `${output}/${width}-extreme-ultra-detail.png` });
        await page.keyboard.press("Escape");
        await page.locator(".form-pickup-dialog[open]").waitFor({ state: "detached" });
        await page.locator(".form-pickup.is-rexonance-pickup .form-pickup-plus").click();
        await page.locator(".form-pickup-dialog[open]").waitFor();
        await checkNames(page);
        if (width <= 390) await checkFineBreaks(page, ".form-pickup-dialog[open]");
        await page.screenshot({ path: `${output}/${width}-rexonance-detail.png` });
        await page.keyboard.press("Escape");
        await page.locator(".form-pickup-dialog[open]").waitFor({ state: "detached" });
      }
      if (path === "/final-stage") {
        await page.locator(".fst-pickup-plus").first().click();
        await page.locator(".fst-pickup-dialog[open]").waitFor();
        await checkNames(page);
        if (width <= 390) await checkFineBreaks(page, ".fst-pickup-dialog[open]");
        await page.screenshot({ path: `${output}/${width}-final-stage-detail.png` });
        await page.keyboard.press("Escape");
        await page.locator(".fst-pickup-dialog[open]").waitFor({ state: "detached" });
      }
      if (path.includes("archive-embedded")) {
        const compare = doc.locator('[id$="saga-form-compare-ios"].saga-compare-section').last();
        const selects = compare.locator(".compare-native-select");
        const values = await selects
          .first()
          .locator("option")
          .evaluateAll((nodes) => nodes.map((node) => node.value));
        await selects.nth(0).selectOption(values.at(-1));
        await selects.nth(1).selectOption(values[0]);
        await doc.waitForFunction(
          () =>
            [...document.querySelectorAll('[id$="saga-form-compare-ios"].saga-compare-section')].at(
              -1,
            )?.dataset.catalogRowsAligned,
        );
        await doc.evaluate(
          () =>
            new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
        );
        // The comparison is taller than the frame viewport. Centering its
        // bounding box can land in a sparse middle row; capture its opener.
        await compare.evaluate((node) =>
          node.scrollIntoView({ block: "start", behavior: "instant" }),
        );
        const alignment = await compare.evaluate((root) => {
          const cards = [...root.querySelectorAll(".compare-side")].map((side) =>
            [...side.querySelectorAll(".compare-form-card")].find(
              (card) => getComputedStyle(card).display !== "none",
            ),
          );
          const rows = cards.map((card) =>
            [...card.querySelectorAll("[data-compare-row]")].sort(
              (a, b) => Number(a.dataset.compareRow) - Number(b.dataset.compareRow),
            ),
          );
          return {
            counts: rows.map((entries) => entries.length),
            delta: Math.max(
              0,
              ...rows[0].map((row, index) =>
                Math.abs(
                  row.getBoundingClientRect().top - rows[1][index].getBoundingClientRect().top,
                ),
              ),
            ),
          };
        });
        assert.ok(alignment.counts[0] > 0);
        assert.equal(alignment.counts[0], alignment.counts[1]);
        assert.ok(alignment.delta <= 1, `row delta ${alignment.delta}`);
        await checkNames(doc);
        if (width <= 390) await checkFineBreaks(doc);
      }
      assert.deepEqual(errors, []);
      await page.screenshot({
        path: `${output}/${width}-${path.slice(1).replaceAll("/", "-")}.png`,
      });
      console.log(
        `PASS ${engine} ${width} ${path}: ${before.count} name words, ${before.saga} intact Saga, overflow 0`,
      );
      await page.close();
    }
  }
} finally {
  await browser.close();
}
