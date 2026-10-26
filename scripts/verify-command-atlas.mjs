import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { chromium, webkit } from "playwright";

const base = process.env.BASE_URL || "http://127.0.0.1:8301";
const output = "output/playwright/command-atlas";
await mkdir(output, { recursive: true });
const results = [];
const engines = (process.env.ATLAS_ENGINES || "chromium,webkit").split(",");
const scenarios = [
  ["world-320", "/world", 320, 740],
  ["world-phone", "/world", 390, 844],
  ["world-ipad-portrait", "/world", 820, 1180],
  ["world-ipad-landscape", "/world", 1180, 820],
  ["world-short-landscape", "/world", 844, 390],
  ["world-desktop", "/world", 1440, 1000],
  ["dream-ipad", "/dream-chapter", 820, 1180],
  ["gallery-ipad", "/gallery", 1180, 820],
  ["dossier-phone", "/riders/realm", 390, 844],
];
for (const engine of engines) {
  const browser = await (engine === "webkit" ? webkit : chromium).launch(
    engine === "webkit" ? {} : { channel: "chrome" },
  );
  try {
    for (const [name, route, width, height] of scenarios) {
      const page = await browser.newPage({
        viewport: { width, height },
        reducedMotion: "reduce",
        hasTouch: width < 1400,
      });
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      try {
        await page.goto(`${base}${route}`, { waitUntil: "domcontentloaded" });
        const trigger = page.locator(".side-panel-trigger").first();
        await trigger.click();
        const panel = page.locator('#site-side-panel[data-open="true"]');
        await panel.waitFor();
        if (process.env.ATLAS_SOURCE_CSS === "1") {
          await page.addStyleTag({
            content: await readFile("src/styles-command-chrome.css", "utf8"),
          });
        }
        await panel.locator(".command-atlas-index").waitFor();
        const initial = await panel.evaluate((node) => {
          const head = node.querySelector(".side-panel-head").getBoundingClientRect();
          const current = node.querySelector('.side-panel-links > a[aria-current="page"]');
          return {
            width: node.clientWidth,
            scrollWidth: node.scrollWidth,
            height: node.clientHeight,
            headBottom: head.bottom,
            scrollTop: node.scrollTop,
            documentY: window.scrollY,
            indexTargets: [...node.querySelectorAll(".command-atlas-index button")].map(
              (button) => ({
                height: button.getBoundingClientRect().height,
                exists: Boolean(document.getElementById(button.getAttribute("aria-controls"))),
              }),
            ),
            current: current
              ? {
                  top: current.getBoundingClientRect().top,
                  bottom: current.getBoundingClientRect().bottom,
                }
              : null,
          };
        });
        assert.ok(initial.scrollWidth <= initial.width + 1, "dialog has no sideways overflow");
        assert.ok(
          initial.indexTargets.every((item) => item.height >= 48 && item.exists),
          "every index target exists and is touch sized",
        );
        if (name.startsWith("dossier")) {
          assert.ok(initial.current, "the current dossier stays marked");
          assert.ok(
            initial.current.top >= initial.headBottom && initial.current.bottom <= height,
            "the current dossier is visible when opened",
          );
        }
        await page.screenshot({ path: `${output}/${engine}-${name}-open.png` });
        await panel.locator('[aria-controls="command-atlas-special"]').click();
        const special = await panel.locator('[data-atlas-group="special"]').boundingBox();
        const head = await panel.locator(".side-panel-head").boundingBox();
        assert.ok(
          special.y >= head.y + head.height + 30 && special.y <= height - 50,
          "pointer jump clears the sticky head",
        );
        assert.equal(
          await page.evaluate(() => window.scrollY),
          initial.documentY,
          "jump never moves the document",
        );
        await page.screenshot({ path: `${output}/${engine}-${name}-special.png` });
        for (const group of ["sections", "system"]) {
          await panel.locator(`[aria-controls="command-atlas-${group}"]`).focus();
          await page.keyboard.press("Enter");
          const focused = await panel.evaluate((node) => {
            const active = document.activeElement;
            const rect = active.getBoundingClientRect();
            return {
              group: active.closest("[data-atlas-group]")?.getAttribute("data-atlas-group"),
              top: rect.top,
              bottom: rect.bottom,
              headBottom: node.querySelector(".side-panel-head").getBoundingClientRect().bottom,
              panelBottom: node.getBoundingClientRect().bottom,
            };
          });
          assert.equal(focused.group, group, "keyboard jump enters its destination");
          assert.ok(
            focused.top >= focused.headBottom - 1 && focused.bottom <= focused.panelBottom + 1,
            `keyboard target visible: ${JSON.stringify(focused)}`,
          );
        }
        await page.keyboard.press("Escape");
        await page.locator('#site-side-panel[data-open="false"]').waitFor({ state: "attached" });
        await page.waitForFunction(
          (node) => document.activeElement === node,
          await trigger.elementHandle(),
        );
        assert.ok(
          await trigger.evaluate((node) => document.activeElement === node),
          "Escape restores focus to opener",
        );
        assert.equal(
          await page.evaluate(() => document.documentElement.hasAttribute("data-side-menu-open")),
          false,
          "Escape releases scroll lock",
        );
        assert.deepEqual(errors, [], "no runtime errors");
        results.push({ engine, name, ok: true, initial });
        console.log(`PASS ${engine} ${name}`);
      } catch (error) {
        results.push({ engine, name, ok: false, message: error.message });
        await page.screenshot({ path: `${output}/${engine}-${name}-failure.png` }).catch(() => {});
        console.error(`FAIL ${engine} ${name}: ${error.message}`);
      } finally {
        await page.close();
      }
    }
  } finally {
    await browser.close();
  }
}
await writeFile(`${output}/results.json`, JSON.stringify(results, null, 2));
assert.ok(
  results.every((row) => row.ok),
  `${results.filter((row) => !row.ok).length} atlas scenarios failed`,
);
console.log(`${results.length}/${results.length} atlas scenarios passed`);
