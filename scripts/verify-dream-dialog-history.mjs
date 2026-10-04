import assert from "node:assert/strict";
import { chromium, webkit } from "playwright";
import { checkedUrl } from "./browser-guard.mjs";

const base = checkedUrl(process.env.BASE_URL || "http://127.0.0.1:8082");
const engine = process.env.PW_ENGINE === "webkit" ? webkit : chromium;
const browser = await engine.launch(
  engine === chromium ? { channel: process.env.PW_BROWSER_CHANNEL || "chrome" } : undefined,
);
const results = [];

try {
  for (const viewport of [
    { width: 390, height: 844 },
    { width: 1280, height: 800 },
  ]) {
    const page = await browser.newPage({ viewport, hasTouch: viewport.width < 700 });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    for (const section of ["characters", "dolminence"]) {
      for (const direction of ["back", "forward"]) {
        await page.goto(new URL("/dream-chapter#posters", base).href, {
          waitUntil: "domcontentloaded",
        });
        await page.waitForFunction(() => {
          const trigger = document.querySelector(".side-panel-trigger");
          return trigger && Object.keys(trigger).some((key) => key.startsWith("__reactProps"));
        });
        await page.locator(`.dream-chapter-nav a[href="#${section}"]`).click();
        await page.waitForURL(`**/dream-chapter#${section}`, { waitUntil: "domcontentloaded" });
        if (direction === "forward") {
          await page.goBack({ waitUntil: "domcontentloaded" });
          await page.waitForURL("**/dream-chapter#posters", { waitUntil: "domcontentloaded" });
        }
        const trigger = page.locator(`#${section} article button`).first();
        await trigger.focus();
        await page.keyboard.press("Enter");
        await page.locator(".dream-dossier-dialog[open]").waitFor({ state: "visible" });
        if (direction === "back") await page.goBack({ waitUntil: "domcontentloaded" });
        else await page.goForward({ waitUntil: "domcontentloaded" });
        await page.waitForURL(
          direction === "back" ? "**/dream-chapter#posters" : `**/dream-chapter#${section}`,
          { waitUntil: "domcontentloaded" },
        );
        await page.waitForFunction(() => !document.querySelector(".dream-dossier-dialog"));
        const restored = await page.evaluate(() => ({
          flag: document.documentElement.hasAttribute("data-dialog-open"),
          overflow: getComputedStyle(document.documentElement).overflowY,
          position: document.body.style.position,
          triggerFocused:
            document.activeElement?.matches(
              ".dream-character-grid button, .dream-dolminence-grid button",
            ) ?? false,
        }));
        assert.equal(restored.flag, false);
        assert.notEqual(restored.overflow, "hidden", "history unlocks the restored section");
        assert.notEqual(restored.position, "fixed", "history releases the frozen departure offset");
        assert.equal(
          restored.triggerFocused,
          false,
          "history does not return to the departed card",
        );

        await trigger.focus();
        await page.keyboard.press("Enter");
        await page.locator(".dream-dossier-dialog[open]").waitFor({ state: "visible" });
        await page.keyboard.press("Escape");
        await page.waitForFunction(() => !document.querySelector(".dream-dossier-dialog"));
        await page.waitForFunction((selector) => {
          return document.activeElement === document.querySelector(selector);
        }, `#${section} article button`);
        results.push({
          width: viewport.width,
          dossier: section,
          history: direction,
          reopen: "passed",
        });
      }
    }
    assert.deepEqual(errors, [], "Dream history and reopen produce no page errors");
    await page.close();
  }
  console.log(JSON.stringify(results, null, 2));
} finally {
  await browser.close();
}
