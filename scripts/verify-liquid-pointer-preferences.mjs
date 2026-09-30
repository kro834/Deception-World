import assert from "node:assert/strict";
import { chromium } from "playwright";
import { checkedUrl } from "./browser-guard.mjs";

const base = checkedUrl(process.env.BASE_URL || "http://127.0.0.1:8082");
const browser = await chromium.launch({ channel: "chrome" });

async function preferences(session, page, motion, transparency) {
  await session.send("Emulation.setEmulatedMedia", {
    features: [
      { name: "prefers-reduced-motion", value: motion ? "reduce" : "no-preference" },
      { name: "prefers-reduced-transparency", value: transparency ? "reduce" : "no-preference" },
    ],
  });
  await page.waitForFunction(
    ({ motion, transparency }) =>
      matchMedia("(prefers-reduced-motion: reduce)").matches === motion &&
      matchMedia("(prefers-reduced-transparency: reduce)").matches === transparency,
    { motion, transparency },
  );
  // CDP updates matches before the browser delivers MediaQueryList change.
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
}

try {
  for (const width of [390, 1280]) {
    const page = await browser.newPage({ viewport: { width, height: 960 } });
    page.setDefaultTimeout(10_000);
    const session = await page.context().newCDPSession(page);
    await preferences(session, page, false, false);
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(new URL("/dream-chapter", base).href);
    const target = page.locator(".dream-character-grid button[data-liquid-pointer]").first();
    await target.waitFor();
    await target.scrollIntoViewIfNeeded();
    await page.waitForFunction(() => document.documentElement.dataset.scrollMotionReady === "true");
    await target.hover();
    await page.evaluate(() => {
      const original = CSSStyleDeclaration.prototype.setProperty;
      window.pointerLightWrites = 0;
      CSSStyleDeclaration.prototype.setProperty = function (property, value, priority) {
        if (property.startsWith("--liquid-pointer-")) window.pointerLightWrites++;
        return original.call(this, property, value, priority);
      };
    });
    const box = await target.boundingBox();
    const x = box.x + box.width / 2;
    const y = box.y + Math.min(box.height / 2, 100);
    await page.mouse.move(x, y);
    await page.waitForFunction(
      () =>
        document.querySelector(".dream-character-grid button")?.dataset.liquidPointerActive ===
        "true",
    );
    await page.waitForTimeout(250);
    assert.ok(
      Number(await target.evaluate((node) => getComputedStyle(node, "::after").opacity)) > 0.5,
    );
    for (const mode of ["motion", "transparency"]) {
      await target.dispatchEvent("pointerdown", {
        isPrimary: true,
        button: 0,
        pointerId: 17,
        pointerType: "mouse",
        clientX: x,
        clientY: y,
      });
      assert.equal(await target.getAttribute("data-liquid-pointer-pressed"), "true");
      await preferences(session, page, mode === "motion", mode === "transparency");
      await page.waitForFunction(
        () =>
          !document
            .querySelector(".dream-character-grid button")
            ?.hasAttribute("data-liquid-pointer-active"),
      );
      assert.equal(await target.getAttribute("data-liquid-pointer-pressed"), null);
      const stopped = await page.evaluate(() => window.pointerLightWrites);
      await page.mouse.move(x + 16, y + 16);
      await target.focus();
      await target.dispatchEvent("pointerdown", {
        isPrimary: true,
        button: 0,
        pointerId: 17,
        pointerType: "mouse",
        clientX: x,
        clientY: y,
      });
      await page.waitForTimeout(250);
      assert.equal(await page.evaluate(() => window.pointerLightWrites), stopped);
      assert.equal(await target.getAttribute("data-liquid-pointer-active"), null);
      const pseudo = await target.evaluate((node) => ({
        display: getComputedStyle(node, "::after").display,
        opacity: getComputedStyle(node, "::after").opacity,
      }));
      assert.ok(pseudo.display === "none" || Number(pseudo.opacity) === 0, JSON.stringify(pseudo));
      await preferences(session, page, false, false);
      // The cursor is still on the same card: there is no fresh pointerover.
      await page.mouse.move(x + 20, y + 20);
      await page.waitForFunction(
        () =>
          document.querySelector(".dream-character-grid button")?.dataset.liquidPointerActive ===
          "true",
      );
      await page.waitForFunction((before) => window.pointerLightWrites > before, stopped);
    }
    await page.mouse.down({ button: "right" });
    await page.waitForTimeout(150);
    assert.equal(await target.getAttribute("data-liquid-pointer-pressed"), null);
    await page.mouse.up({ button: "right" });
    await preferences(session, page, true, true);
    await preferences(session, page, false, true);
    await page.mouse.move(x + 21, y + 21);
    assert.equal(await target.getAttribute("data-liquid-pointer-active"), null);
    await preferences(session, page, false, false);
    await page.mouse.move(x + 22, y + 22);
    await page.waitForFunction(
      () =>
        document.querySelector(".dream-character-grid button")?.dataset.liquidPointerActive ===
        "true",
    );
    assert.deepEqual(errors, []);
    console.log(
      `PASS ${width}px: dynamic motion/transparency stop, hidden glow, no position writes, cursor resume and primary buttons`,
    );
    await page.close();
  }
} finally {
  await browser.close();
}
