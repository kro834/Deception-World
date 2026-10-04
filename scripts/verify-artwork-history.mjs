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

    for (const name of ["ハイク", "フェイブル"]) {
      for (const direction of ["back", "forward"]) {
        await page.goto(new URL("/world#story", base).href, { waitUntil: "domcontentloaded" });
        await page.waitForFunction(() => {
          const trigger = document.querySelector(".side-panel-trigger");
          return trigger && Object.keys(trigger).some((key) => key.startsWith("__reactProps"));
        });
        await page.locator(".side-panel-trigger").click();
        await page.locator('.side-panel-links a[href="/world#manager-archive"]').click();
        await page.waitForURL("**/world#manager-archive", { waitUntil: "domcontentloaded" });
        await page.locator(".manager-archive-tabs [role=tab]").nth(2).click();
        const trigger = page.getByRole("button", { name: `${name}の画像を拡大`, exact: true });
        await trigger.waitFor({ state: "visible" });

        if (direction === "forward") {
          await page.goBack({ waitUntil: "domcontentloaded" });
          await page.waitForURL("**/world#story", { waitUntil: "domcontentloaded" });
        }
        await trigger.focus();
        await page.keyboard.press("Enter");
        await page.locator(".other-artwork-dialog[open]").waitFor({ state: "visible" });
        if (direction === "back") await page.goBack({ waitUntil: "domcontentloaded" });
        else await page.goForward({ waitUntil: "domcontentloaded" });
        await page.waitForURL(
          direction === "back" ? "**/world#story" : "**/world#manager-archive",
          { waitUntil: "domcontentloaded" },
        );
        await page.waitForFunction(() => !document.querySelector(".other-artwork-dialog"));
        const restored = await page.evaluate(() => ({
          flag: document.documentElement.hasAttribute("data-dialog-open"),
          overflow: getComputedStyle(document.documentElement).overflowY,
          artworkFocused: document.activeElement?.matches(".other-artwork-card") ?? false,
        }));
        assert.equal(restored.flag, false, "history clears the shared dialog flag");
        assert.notEqual(restored.overflow, "hidden", "history unlocks the restored page");
        assert.equal(restored.artworkFocused, false, "history does not refocus the departed card");

        // A later keyboard opening still returns normally to its own card.
        await trigger.focus();
        await page.keyboard.press("Enter");
        await page.locator(".other-artwork-dialog[open]").waitFor({ state: "visible" });
        await page.keyboard.press("Escape");
        await page.waitForFunction(() => !document.querySelector(".other-artwork-dialog"));
        assert.equal(await trigger.evaluate((node) => document.activeElement === node), true);
        results.push({
          width: viewport.width,
          artwork: name,
          history: direction,
          reopen: "passed",
        });
      }
    }
    assert.deepEqual(errors, [], "artwork history and reopen produce no page errors");
    await page.close();
  }
  console.log(JSON.stringify(results, null, 2));
} finally {
  await browser.close();
}
