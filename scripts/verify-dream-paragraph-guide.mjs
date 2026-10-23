// BASE_URL=http://127.0.0.1:8277 BROWSER=chrome|webkit node scripts/verify-dream-paragraph-guide.mjs
import assert from "node:assert/strict";
import { chromium, webkit } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import { DREAM_CASES } from "../src/components/dream-chapter/dream-chapter-data.ts";
import { checkedUrl } from "./browser-guard.mjs";

const base = checkedUrl(process.env.BASE_URL || "http://127.0.0.1:8277");
const kind = process.env.BROWSER || "chrome";
assert.ok(["chrome", "webkit"].includes(kind));
const browser = await (kind === "webkit" ? webkit : chromium).launch(
  kind === "webkit" ? {} : { channel: "chrome" },
);
const output = `output/playwright/dream-paragraph-guide/${kind}`;
await mkdir(output, { recursive: true });
const report = [];
try {
  for (const width of [320, 390, 1024]) {
    const context = await browser.newContext({
      viewport: { width, height: 768 },
      reducedMotion: "reduce",
    });
    await context.addInitScript(() =>
      localStorage.setItem(
        "deception-world:dream-reader:v1",
        JSON.stringify({
          version: 1,
          size: "standard",
          spacing: "standard",
          bookmark: { caseNo: "5", paragraph: 8 },
        }),
      ),
    );
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(new URL("/dream-chapter#dream-chapter-index", base).href, {
      waitUntil: "domcontentloaded",
    });
    await page.locator(".dream-reader-index-bookmark").waitFor();
    await page.evaluate(() => document.fonts.ready);
    const guide = page.locator(".dream-reader-paragraph-guide");
    assert.equal(await guide.getAttribute("open"), null);
    assert.match(
      await page.locator(".dream-reader-bookmark-excerpt").innerText(),
      new RegExp(DREAM_CASES[5].paragraphs[7].slice(0, 12)),
    );
    await guide.locator("summary").click();
    const select = guide.locator("select");
    for (const episode of DREAM_CASES) {
      await select.selectOption(episode.no);
      const links = guide.locator("ol a");
      assert.equal(await links.count(), episode.paragraphs.length);
      for (const [index, text] of episode.paragraphs.entries()) {
        assert.equal(
          await links.nth(index).getAttribute("href"),
          `#dream-case-${episode.no}-paragraph-${index + 1}`,
        );
        assert.ok(
          (await links.nth(index).innerText()).includes(Array.from(text).slice(0, 72).join("")),
        );
      }
    }
    const geometry = await guide.evaluate((node) => {
      const lines = (element) => {
        const range = document.createRange();
        range.selectNodeContents(element);
        return new Set(
          [...range.getClientRects()]
            .filter((rect) => rect.width > 0 && rect.height > 0)
            .map((rect) => Math.round(rect.top)),
        ).size;
      };
      const buttons = [...document.querySelectorAll(".dream-reader-index-actions button")];
      return {
        width: innerWidth,
        overflow: document.documentElement.scrollWidth - innerWidth,
        selectSize: getComputedStyle(node.querySelector("select")).fontSize,
        selectHeight: node.querySelector("select").getBoundingClientRect().height,
        buttons: buttons.map((button) => button.getBoundingClientRect().height),
        buttonTextLines: buttons.map(lines),
        buttonTextFits: buttons.every((button) => button.scrollWidth <= button.clientWidth + 1),
        summaryTitleLines: lines(node.querySelector("summary > span")),
      };
    });
    assert.ok(geometry.overflow <= 1, JSON.stringify(geometry));
    assert.equal(geometry.selectSize, "16px");
    assert.ok(geometry.selectHeight >= 44 && geometry.buttons.every((height) => height >= 44));
    if (width === 320) {
      assert.equal(geometry.summaryTitleLines, 1, "320px guide title stays on one line");
      assert.ok(
        geometry.buttonTextLines.every((count) => count === 1) && geometry.buttonTextFits,
        "320px bulk control labels each fit on one line",
      );
      assert.ok(
        Math.abs(geometry.buttons[0] - geometry.buttons[1]) <= 1,
        "320px bulk controls keep equal heights",
      );
    }
    assert.equal(await guide.locator("em").count(), 1);
    await page.screenshot({ path: `${output}/${width}-guide.png` });
    const targetLink = guide.locator('a[href="#dream-case-5-paragraph-8"]');
    await targetLink.focus();
    await targetLink.press("Enter");
    await page.waitForFunction(
      () =>
        location.hash === "#dream-case-5-paragraph-8" &&
        document.activeElement?.id === "dream-case-5-paragraph-8",
    );
    assert.equal(await page.locator("#dream-case-5").getAttribute("open"), "");
    await page.goBack();
    await page.waitForFunction(() => location.hash === "#dream-chapter-index");
    await page.getByRole("button", { name: "しおりを外す", exact: true }).click();
    assert.equal(await page.locator(".dream-reader-index-bookmark").count(), 0);
    assert.equal(await guide.locator("em").count(), 0);
    await page.emulateMedia({ forcedColors: "active" });
    assert.equal(await select.evaluate((node) => getComputedStyle(node).fontSize), "16px");
    assert.deepEqual(errors, []);
    report.push({ width, passed: true, geometry });
    await context.close();
  }
  console.log(`${kind}: paragraph guide passed at 320, 390 and 1024px`);
} finally {
  await writeFile(`${output}/report.json`, JSON.stringify(report, null, 2));
  await browser.close();
}
