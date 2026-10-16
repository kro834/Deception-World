import assert from "node:assert/strict";
import { chromium, webkit } from "playwright";

const engine = process.env.PW_ENGINE === "webkit" ? webkit : chromium;
const browser = await engine.launch(engine === chromium ? { channel: "chrome" } : {});
try {
  for (const width of [390, 1024, 1366]) {
    const page = await browser.newPage({ viewport: { width, height: 900 }, hasTouch: true });
    try {
      await page.goto(`${process.env.BASE_URL || "http://127.0.0.1:8189"}/library`);
      await page.waitForFunction(() => document.documentElement.hasAttribute("data-press-ready"));
      const trigger = page.getByRole("button", { name: "メニューを開く", exact: true });
      for (const interruption of ["scroll", "visibilitychange", "blur"]) {
        // One task keeps this strictly inside the minimum tap hold, without
        // depending on automation transport latency or opening a menu by click.
        const states = await trigger.evaluate((button, type) => {
          for (const event of ["pointerdown", "pointerup"]) {
            button.dispatchEvent(new PointerEvent(event, {
              bubbles: true, isPrimary: true, pointerId: 7, pointerType: "touch", button: 0,
            }));
          }
          const before = button.getAttribute("data-press");
          (type === "blur" ? window : document).dispatchEvent(new Event(type));
          return { before, after: button.getAttribute("data-press") };
        }, interruption);
        assert.deepEqual(states, { before: "touch", after: "out" }, `${width}: ${interruption}`);
        await page.waitForFunction(() => !document.querySelector("[data-press]"));
      }
      // Pointer input still opens/closes the menu; keyboard input restores
      // opener focus (the deliberate pointer path does not force a focus ring).
      await trigger.click();
      const close = page.getByRole("button", { name: "メニューを閉じる", exact: true });
      await close.waitFor({ state: "visible" });
      await close.click();
      await close.waitFor({ state: "hidden" });
      await trigger.focus();
      await page.keyboard.press("Enter");
      await close.waitFor({ state: "visible" });
      await page.keyboard.press("Escape");
      await close.waitFor({ state: "hidden" });
      await page.waitForFunction(() => document.activeElement?.getAttribute("aria-label") === "メニューを開く");
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      console.log(`PASS ${engine.name()} ${width}: interrupted taps, menu, focus, overflow`);
    } finally {
      await page.close();
    }
  }
} finally {
  await browser.close();
}
