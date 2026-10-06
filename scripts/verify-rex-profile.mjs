import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium, webkit } from "playwright";

const base = process.env.BASE_URL || "http://127.0.0.1:8082";
const engine = process.env.PW_ENGINE || "chromium";
assert.ok(["chromium", "webkit"].includes(engine), "PW_ENGINE must be chromium or webkit");
const output = process.env.OUTPUT_DIR || `/private/tmp/rex-profile-${engine}`;
await mkdir(output, { recursive: true });
const browser = await (engine === "webkit"
  ? webkit.launch()
  : chromium.launch({ channel: "chrome" }));
const calls = ["RIDE IN！", "SPECIAL！", "ROLLOUT！", "Astra Barn！", "VANDAL！"];
const viewports = [
  { width: 320, height: 640 },
  { width: 390, height: 844 },
  { width: 1024, height: 768 },
  { width: 1440, height: 1000 },
];

async function scrollPanel(page, panel) {
  const bounds = await panel.boundingBox();
  assert.ok(bounds, "form panel must be visible");
  const x = bounds.x + Math.min(bounds.width / 2, 150);
  const y = Math.min(bounds.y + bounds.height * 0.65, page.viewportSize().height - 80);
  if (engine === "webkit") {
    await page.mouse.move(x, y);
    await page.mouse.wheel(0, 420);
  } else {
    const cdp = await page.context().newCDPSession(page);
    const point = (nextY) => ({ x, y: nextY, id: 1 });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [point(y)] });
    for (let step = 1; step <= 12; step += 1) {
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [point(y - step * 14)],
      });
      await page.waitForTimeout(18);
    }
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await cdp.detach();
  }
  await page.waitForFunction(
    () => document.querySelector(".form-pickup-dialog[open] .form-pickup-panel")?.scrollTop > 20,
  );
}

try {
  for (const viewport of viewports) {
    const context = await browser.newContext({ viewport, hasTouch: true });
    for (const path of ["/managers/rex-loi", "/riders/vandal"]) {
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.goto(base + path, { waitUntil: "networkidle" });
      await page.waitForFunction(
        () => !document.documentElement.hasAttribute("data-route-scroll-settling"),
      );
      // Offscreen dossier sections deliberately skip paint; check delivery
      // here, then rendered text after navigating to the new section.
      const mainText = await page.locator("main").textContent();
      for (const text of ["レックス・ロワ", "185.0cm", "80.1kg", "分配"]) {
        assert.ok(mainText.includes(text), `${path}: missing ${text}`);
      }
      assert.equal(await page.locator(".dossier-contents a").count(), 6);
      await page.locator('.dossier-contents a[href="#character-section-06"]').click();
      await page.waitForFunction(() => location.hash === "#character-section-06");
      const distribution = page.locator("#character-section-06");
      await page.waitForFunction(() => {
        const rect = document.getElementById("character-section-06")?.getBoundingClientRect();
        return rect && rect.top < innerHeight && rect.bottom > 0;
      });
      assert.ok((await distribution.innerText()).includes("分配"));
      assert.ok(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
        `${path}: page horizontal overflow`,
      );
      const slug = path.split("/").at(-1);
      await distribution.screenshot({ path: `${output}/${slug}-${viewport.width}-distribution.png` });

      const thumb = page.locator(".form-pickup-plus .ios-slide-open-thumb").first();
      await thumb.scrollIntoViewIfNeeded();
      await thumb.tap();
      const dialog = page.locator(".form-pickup-dialog[open]");
      await dialog.waitFor();
      // Wait for the real arrival to paint before reading and capturing it;
      // leave infinite ambience and scroll-driven animations running.
      await page.waitForFunction(() => {
        const sheet = document.querySelector(".form-pickup-dialog[open]");
        const callout = sheet?.querySelector(".rider-call");
        if (!sheet || !callout) return false;
        const arrived = sheet.getAnimations({ subtree: true }).every((animation) =>
          animation.timeline !== document.timeline ||
          !Number.isFinite(animation.effect?.getComputedTiming().endTime) ||
          animation.playState === "finished",
        );
        return arrived && Number(getComputedStyle(sheet).opacity) > 0.99 &&
          Number(getComputedStyle(callout).opacity) > 0.99;
      });
      assert.deepEqual(await dialog.locator(".rider-call b").allTextContents(), calls);
      const astra = dialog.locator(".rider-call b").filter({ hasText: "Astra Barn！" });
      assert.equal(await astra.evaluate((node) => getComputedStyle(node).textTransform), "none");
      const formText = await dialog.innerText();
      for (const text of ["203.6cm", "262.9t", "372.2t", "4人", "仮想リベレーター"]) {
        assert.ok(formText.includes(text), `${path}: missing form detail ${text}`);
      }
      assert.ok(!formText.includes("NONE SHALL TRANSCEND IT"), `${path}: stale transformation call`);
      assert.ok(!formText.includes("右側面を殴り"), `${path}: stale finisher trigger`);
      const panel = dialog.locator(".form-pickup-panel");
      assert.ok(
        await panel.evaluate((node) => node.scrollWidth <= node.clientWidth + 1),
        `${path}: form horizontal overflow`,
      );
      await page.screenshot({ path: `${output}/${slug}-${viewport.width}-form.png` });
      await scrollPanel(page, panel);
      await dialog.getByRole("button", { name: "閉じる", exact: true }).tap();
      await dialog.waitFor({ state: "hidden" });
      assert.deepEqual(errors, [], `${path}: browser errors`);
      console.log(`${engine} ${viewport.width}×${viewport.height} ${path}: new section, exact calls, form scroll/close passed`);
      await page.close();
    }
    await context.close();
  }
} finally {
  await browser.close();
}
