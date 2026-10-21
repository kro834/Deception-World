import assert from "node:assert/strict";
import { chromium, devices, webkit } from "playwright";

// EXPAND VISUAL opened, closed and opened again in one document, with full
// motion: the closing fade must not leave its end state on the plate (a
// second opening once showed an empty dark plate, scrollable by 6px).
const base = process.env.BASE_URL || "http://127.0.0.1:8082";
const iframeMode = process.env.IFRAME === "true";
const runs = [
  { engine: "chromium", label: "Chrome 1440x900", context: { viewport: { width: 1440, height: 900 } } },
  { engine: "chromium", label: "Chrome 1024x768", context: { viewport: { width: 1024, height: 768 } } },
  { engine: "webkit", label: "WebKit iPad Pro 11", context: { ...devices["iPad Pro 11"] } },
];
const closers = ["close-button", "escape", "backdrop"];

const browsers = {};
try {
  for (const run of runs) {
    browsers[run.engine] ||=
      run.engine === "chromium" ? await chromium.launch({ channel: "chrome" }) : await webkit.launch();
    for (const archive of ["saga", "realm"]) {
      const context = await browsers[run.engine].newContext({
        ...run.context,
        reducedMotion: "no-preference",
      });
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      let archiveDocument = page;
      if (iframeMode) {
        await page.goto(`${base}/form-archive${archive === "realm" ? "?archive=realm" : ""}`);
        await page.locator('#archive-switcher[aria-busy="false"]').waitFor();
        const handle = await page.locator(`iframe[data-archive-kind="${archive}"]`).elementHandle();
        archiveDocument = await handle.contentFrame();
        assert.ok(archiveDocument);
      } else {
        await page.goto(`${base}/${archive}-form-archive-embedded.html`);
      }
      await archiveDocument.locator(".image-lightbox").waitFor({ state: "attached" });
      const trigger = archiveDocument.locator(".art-trigger:visible").first();
      const dialog = archiveDocument.locator(".image-lightbox[open]");

      const settle = () =>
        archiveDocument.waitForFunction(
          () => {
            const inner = document.querySelector(".image-lightbox .lightbox-inner");
            return inner && inner.getAnimations().every((animation) => animation.playState !== "running");
          },
          null,
          { timeout: 5000 },
        );
      const plate = () =>
        archiveDocument.evaluate(() => {
          const box = document.querySelector(".image-lightbox");
          const inner = box.querySelector(".lightbox-inner");
          const image = box.querySelector(".lightbox-image");
          const style = getComputedStyle(inner);
          const matrix = new DOMMatrixReadOnly(style.transform === "none" ? undefined : style.transform);
          return {
            opacity: Number(style.opacity),
            identity: matrix.isIdentity,
            heldAnimations: inner.getAnimations().length,
            overflow: box.scrollHeight - box.clientHeight,
            imageShown: Boolean(image.getAttribute("src")) && image.getBoundingClientRect().height > 40,
          };
        });

      for (let round = 0; round <= closers.length; round += 1) {
        await trigger.scrollIntoViewIfNeeded();
        await trigger.click();
        await dialog.waitFor();
        await settle();
        const state = await plate();
        const where = `${archive} ${run.label}${iframeMode ? " iframe" : ""} opening ${round + 1}`;
        assert.equal(state.opacity, 1, `${where}: the plate is fully shown (${JSON.stringify(state)})`);
        assert.equal(state.identity, true, `${where}: the plate rests at its own place (${JSON.stringify(state)})`);
        assert.equal(state.heldAnimations, 0, `${where}: no animation is held on the plate`);
        assert.ok(state.overflow <= 1, `${where}: the dialog does not scroll (${state.overflow}px)`);
        assert.equal(state.imageShown, true, `${where}: the art is shown`);
        if (round === closers.length) break;
        const closer = closers[round];
        if (closer === "close-button") await dialog.locator(".lightbox-close").click();
        else if (closer === "escape") await page.keyboard.press("Escape");
        else {
          const frame = iframeMode
            ? await page.locator(`iframe[data-archive-kind="${archive}"]`).boundingBox()
            : { x: 0, y: 0 };
          await page.mouse.click(frame.x + 4, frame.y + 100);
        }
        await dialog.waitFor({ state: "hidden" });
        await settle();
        assert.equal(
          await archiveDocument.evaluate(
            () => document.querySelector(".image-lightbox .lightbox-inner").getAnimations().length,
          ),
          0,
          `${archive} ${run.label}: closing by ${closer} releases its fade`,
        );
      }
      assert.deepEqual(errors, []);
      console.log(
        `PASS ${archive} ${run.label}${iframeMode ? " iframe" : ""}: four openings (closed by ×, Escape, backdrop) each show the art at full opacity`,
      );
      await context.close();
    }
  }
} finally {
  await Promise.all(Object.values(browsers).map((browser) => browser.close()));
}
