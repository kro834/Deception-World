import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium, webkit } from "playwright";

const base = process.env.BASE_URL ?? "http://127.0.0.1:4413";
const output = process.env.OUTPUT_DIR ?? "output/playwright/gallery-controls-focus";
const results = [];
await mkdir(output, { recursive: true });

for (const engine of ["chromium", "webkit"]) {
  const browser = await (engine === "webkit"
    ? webkit.launch()
    : chromium.launch({ channel: "chrome" }));
  try {
    for (const width of [320, 390]) {
      const context = await browser.newContext({ viewport: { width, height: 640 } });
      try {
        const page = await context.newPage();
        const errors = [];
        page.on("pageerror", (error) => errors.push(error.message));
        await page.goto(`${base}/gallery`, { waitUntil: "networkidle" });
        const opener = page.locator(".gallery-work-open").first();
        await opener.scrollIntoViewIfNeeded();
        await opener.focus();
        await page.keyboard.press("Enter");
        const dialog = page.locator(".gallery-viewer[open]");
        await dialog.locator(".gallery-close-primary").click({ trial: true });
        const tools = dialog.locator(".gallery-viewer-tools > summary");
        await tools.focus();
        await page.keyboard.press("Enter");
        const ink = dialog.locator('.gallery-background-control input[value="ink"]');
        for (let step = 0; step < 20; step += 1) {
          await page.keyboard.press("Tab");
          if (await ink.evaluate((node) => document.activeElement === node)) break;
        }
        assert.ok(await ink.evaluate((node) => document.activeElement === node), "Tab missed ink");

        const position = () =>
          page.evaluate(() => ({
            x: scrollX,
            y: scrollY,
            documentTop: document.documentElement.scrollTop,
            bodyTop: document.body.style.top,
          }));
        const documentBefore = await position();
        const measure = () =>
          dialog.locator(".gallery-background-control input:focus").evaluate((input) => {
            const header = input.closest(".gallery-viewer-header");
            const label = input.closest("label");
            const headerRect = header.getBoundingClientRect();
            const labelRect = label.getBoundingClientRect();
            return {
              value: input.value,
              checked: input.checked,
              headerTop: headerRect.top,
              headerBottom: headerRect.bottom,
              labelTop: labelRect.top,
              labelBottom: labelRect.bottom,
              headerScroll: header.scrollTop,
            };
          });
        const before = await measure();
        const steps = [];
        for (const [key, value] of [
          ["End", "light"],
          ["Home", "ink"],
        ]) {
          await page.keyboard.press(key);
          const focused = await measure();
          assert.equal(focused.value, value);
          assert.equal(focused.checked, true);
          assert.ok(
            focused.labelTop >= focused.headerTop - 1 &&
              focused.labelBottom <= focused.headerBottom + 1,
            `${engine} ${width} ${key} leaves the focused label hidden: ${JSON.stringify(focused)}`,
          );
          assert.deepEqual(await position(), documentBefore, `${key} moved the document`);
          steps.push({ key, ...focused });
        }
        assert.ok(steps[0].headerScroll > before.headerScroll, "End never revealed lower choices");
        assert.deepEqual(errors, []);
        await page.screenshot({ path: `${output}/${engine}-${width}-home.png` });
        results.push({ engine, width, height: 640, before, steps, documentBefore, pass: true });
      } finally {
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }
}

await writeFile(`${output}/results.json`, `${JSON.stringify(results, null, 2)}\n`);
console.log(JSON.stringify({ passed: results.length, results }, null, 2));
