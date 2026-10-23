// BASE_URL=http://127.0.0.1:8598 BROWSER=chrome|webkit node scripts/verify-dream-glossary-search.mjs
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium, webkit } from "playwright";
import { checkedOutputPath, checkedUrl } from "./browser-guard.mjs";
import { DREAM_GLOSSARY } from "../src/components/dream-chapter/dream-chapter-data.ts";

const base = checkedUrl(process.env.BASE_URL || "http://127.0.0.1:8598");
const kind = process.env.BROWSER || "chrome";
assert.ok(["chrome", "webkit"].includes(kind));
const outputRoot = resolve("output/playwright");
const output = checkedOutputPath(`${outputRoot}/dream-glossary-search/${kind}`, [outputRoot]);
await mkdir(output, { recursive: true });
const browser = await (kind === "webkit" ? webkit : chromium).launch(
  kind === "webkit" ? {} : { channel: "chrome" },
);
const report = { base, engine: kind, version: browser.version(), checks: [] };
let activePage;

async function assertCanonical(page) {
  assert.equal(
    await page.locator('.dream-glossary > div[id^="dream-term-"]').count(),
    DREAM_GLOSSARY.length,
  );
  assert.equal(
    await page.evaluate(() =>
      window.__glossaryOriginal.every(
        (node) => node.isConnected && document.getElementById(node.id) === node,
      ),
    ),
    true,
    "filtering must preserve every canonical body node and fragment",
  );
}

async function landed(page, id) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    for (let frame = 0; frame < 6; frame++) await new Promise(requestAnimationFrame);
  });
  await page
    .waitForFunction((targetId) => {
      const target = document.getElementById(targetId);
      const nav = document.querySelector(".dream-chapter-nav");
      if (!target || !nav) return false;
      const rect = target.getBoundingClientRect();
      const heading = target.querySelector("dt")?.getBoundingClientRect();
      const navBottom = nav.getBoundingClientRect().bottom;
      // The text owns readability; the card's padded border may round a few
      // pixels above its nominal scroll margin after native font/layout work.
      return (
        heading &&
        heading.top >= navBottom + 8 &&
        heading.bottom < innerHeight - 20 &&
        rect.top >= navBottom - 4
      );
    }, id)
    .catch(async (error) => {
      console.error(
        await page.evaluate((targetId) => {
          const target = document.getElementById(targetId);
          return {
            id: targetId,
            top: target?.getBoundingClientRect().top,
            headingTop: target?.querySelector("dt")?.getBoundingClientRect().top,
            navBottom: document.querySelector(".dream-chapter-nav")?.getBoundingClientRect().bottom,
            scrollY,
            active: document.activeElement?.id,
          };
        }, id),
      );
      throw error;
    });
}

try {
  for (const width of [320, 390, 1024]) {
    const context = await browser.newContext({
      viewport: { width, height: width === 390 ? 844 : 768 },
      reducedMotion: "reduce",
    });
    const page = await context.newPage();
    activePage = page;
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(new URL("/dream-chapter#glossary", base).href, {
      waitUntil: "domcontentloaded",
    });
    const search = page.locator(".dream-glossary-search");
    const input = search.locator("input");
    const links = search.locator(".dream-glossary-search-results a");
    await input.waitFor();
    await page.waitForFunction(() => {
      const element = document.querySelector(".dream-glossary-search input");
      return Object.keys(element).some((key) => key.startsWith("__reactProps"));
    });
    await page.waitForFunction(() => !document.documentElement.hasAttribute("data-loading"));
    await page.evaluate(() => document.fonts.ready);
    await page.evaluate(() => {
      window.__glossaryOriginal = [
        ...document.querySelectorAll('.dream-glossary > div[id^="dream-term-"]'),
      ];
    });
    assert.equal(await links.count(), 13);
    // Owner (2026-10-23): 不要なセカンダリラベルを削除（レイアウトで説明）
    // Idle, the status is silent; the thirteen term plates are the index.
    assert.equal((await search.getByRole("status").textContent()).trim(), "");
    await assertCanonical(page);
    const geometry = await search.evaluate((node) => ({
      overflow: document.documentElement.scrollWidth - innerWidth,
      font: getComputedStyle(node.querySelector("input")).fontSize,
      controls: [...node.querySelectorAll("input,button,a")].map((element) => {
        const rect = element.getBoundingClientRect();
        return { name: element.textContent.trim(), width: rect.width, height: rect.height };
      }),
    }));
    assert.ok(geometry.overflow <= 1, JSON.stringify(geometry));
    assert.equal(geometry.font, "16px");
    assert.ok(geometry.controls.every((rect) => rect.width >= 44 && rect.height >= 44));
    await search.screenshot({ path: `${output}/${width}-index.png` });

    for (const query of ["げんそうきょう", "ゲンソウキョウ", "ｹﾞﾝｿｳｷｮｳ"]) {
      await input.fill(query);
      assert.equal(await links.locator("strong", { hasText: "幻想郷" }).count(), 1);
    }
    assert.equal((await links.locator("mark").count()) > 0, true);
    await input.fill("ナイトメア 記憶");
    assert.equal(await links.count(), 1);
    assert.equal(await links.first().locator("strong").innerText(), "ナイトメア");
    await assertCanonical(page);
    const beforeSubmit = page.url();
    await input.press("Enter");
    assert.equal(page.url(), beforeSubmit, "search submission does not navigate");
    await search.screenshot({ path: `${output}/${width}-matching.png` });

    await input.dispatchEvent("keydown", { key: "Escape", code: "Escape", isComposing: true });
    assert.equal(await input.inputValue(), "ナイトメア 記憶", "IME Escape keeps composing text");
    await input.press("Escape");
    assert.equal(await input.inputValue(), "");
    assert.equal(await input.evaluate((element) => document.activeElement === element), true);
    assert.equal(await links.count(), 13);
    await input.fill("存在しない用語XYZ");
    assert.equal(await links.count(), 0);
    assert.match(await search.getByRole("status").textContent(), /検索結果 0 \/ 13 語/);
    await search.screenshot({ path: `${output}/${width}-empty.png` });
    await search.getByRole("button", { name: "検索をクリアして全語を表示", exact: true }).click();
    assert.equal(await input.inputValue(), "");
    assert.equal(await input.evaluate((element) => document.activeElement === element), true);
    assert.equal(await links.count(), 13);
    await input.fill("幻想郷");
    await search.getByRole("button", { name: "検索をクリア", exact: true }).click();
    assert.equal(await input.inputValue(), "");
    await assertCanonical(page);

    const target = page.locator("#dream-term-12");
    const link = search.locator('a[href="#dream-term-12"]');
    await link.focus();
    await link.press("Enter");
    await page.waitForFunction(() => document.activeElement?.id === "dream-term-12");
    await landed(page, "dream-term-12");
    assert.equal(await target.getAttribute("tabindex"), "-1");
    assert.equal(await target.getAttribute("data-dream-glossary-focused"), "true");
    await page.screenshot({ path: `${output}/${width}-keyboard-target.png` });
    await input.focus();
    assert.equal(await target.getAttribute("tabindex"), null, "blur cleans temporary tab index");
    assert.equal(await target.getAttribute("data-dream-glossary-focused"), null);
    await link.focus();
    await link.press("Enter");
    await page.waitForFunction(() => document.activeElement?.id === "dream-term-12");
    await landed(page, "dream-term-12");
    await input.focus();

    const pointer = search.locator('a[href="#dream-term-13"]');
    await pointer.click();
    await page.waitForURL("**#dream-term-13");
    await landed(page, "dream-term-13");
    assert.equal(
      await page.locator("#dream-term-13").getAttribute("data-dream-glossary-focused"),
      null,
    );
    assert.equal(await page.locator("#dream-term-13").getAttribute("tabindex"), null);
    await pointer.click();
    await landed(page, "dream-term-13");
    assert.equal(
      await page.locator("#dream-term-13").getAttribute("data-dream-glossary-focused"),
      null,
    );
    assert.equal(await page.locator("#dream-term-13").getAttribute("tabindex"), null);
    await page.evaluate(() => {
      const link = document.querySelector('.dream-glossary-search a[href="#dream-term-12"]');
      link.addEventListener("click", (event) => event.preventDefault(), {
        capture: true,
        once: true,
      });
    });
    await link.focus();
    await link.press("Enter");
    assert.equal(
      new URL(page.url()).hash,
      "#dream-term-13",
      "canceled other-fragment activation keeps URL",
    );
    assert.equal(await target.getAttribute("data-dream-glossary-focused"), null);
    assert.equal(await link.evaluate((element) => document.activeElement === element), true);
    await assertCanonical(page);
    await page.screenshot({ path: `${output}/${width}-pointer-target.png` });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0);
    assert.deepEqual(errors, []);
    report.checks.push({
      width,
      geometry,
      canonicalCount: 13,
      keyboardRevisit: true,
      simulatedImeEscape: true,
      canceledOtherFragment: true,
      pageErrors: errors,
    });
    await context.close();
    console.log(
      `${kind} ${width}px: glossary search, IME, clear, empty, native pointer and keyboard navigation passed`,
    );
  }
} catch (error) {
  report.failure = String(error);
  if (activePage && !activePage.isClosed())
    await activePage.screenshot({ path: `${output}/failure.png` });
  throw error;
} finally {
  await writeFile(`${output}/report.json`, JSON.stringify(report, null, 2));
  await browser.close();
}
