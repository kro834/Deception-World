import assert from "node:assert/strict";
import { chromium } from "playwright";

const base = process.env.BASE_URL || "http://127.0.0.1:8082";
const iframeMode = process.env.IFRAME === "true";
const browser = await chromium.launch({ channel: "chrome" });
try {
  for (const width of [390, 1280]) {
    for (const archive of ["saga", "realm"]) {
      const page = await browser.newPage({
        viewport: { width, height: 844 },
        reducedMotion: "reduce",
      });
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      let archiveDocument = page;
      if (iframeMode) {
        await page.goto(`${base}/form-archive`);
        await page.locator('#archive-switcher[aria-busy="false"]').waitFor();
        if (archive === "realm") {
          await page.locator('button[data-archive="realm"]').click();
          await page.locator('#archive-switcher[aria-busy="false"]').waitFor();
        }
        const handle = await page.locator(`iframe[data-archive-kind="${archive}"]`).elementHandle();
        archiveDocument = await handle.contentFrame();
        assert.ok(archiveDocument, "the current archive iframe exists");
      } else {
        await page.goto(`${base}/${archive}-form-archive-embedded.html`);
      }
      const root = archiveDocument.locator('[id$="saga-forms-performance-v5"]').last();
      const search = root.locator('input[type="search"]');
      const initial = archive === "saga" ? "multi" : "stella";
      const chosen = archive === "saga" ? "flam" : "burst";
      const query = archive === "saga" ? "フラム" : "バースト";
      await root.locator(".hero-action").first().focus();
      if (width === 390) {
        const opener = root.locator(".hero-action").first();
        await opener.focus();
        await page.keyboard.press("/");
        await search.focus();
        await search.press("Escape");
        assert.equal(
          await opener.evaluate((node) => node === document.activeElement),
          true,
          "closing keyboard search restores its original trigger",
        );
      }
      await page.keyboard.press("/");
      await search.focus();
      await search.fill(archive === "saga" ? "Ｓ－０３" : "ﾊﾞｰｽﾄ");
      assert.equal(
        await root.locator(".form-chip:not([hidden])").count(),
        1,
        "full-width codes and half-width kana find their equivalent form names",
      );
      await search.fill(query);
      assert.equal(await root.locator(".form-chip:not([hidden])").count(), 1);
      assert.equal(
        await search.evaluate((node) => getComputedStyle(node).userSelect),
        "text",
        "archive search allows native text selection for editing",
      );
      assert.equal(
        await root
          .locator(".detail-head h3")
          .first()
          .evaluate((node) => getComputedStyle(node).userSelect),
        "none",
        "displayed archive content keeps selection protection",
      );
      assert.deepEqual(
        await search.evaluate((node) => {
          const paste = new ClipboardEvent("paste", { bubbles: true, cancelable: true });
          const shortcut = new KeyboardEvent("keydown", {
            key: "v",
            ctrlKey: true,
            bubbles: true,
            cancelable: true,
          });
          node.dispatchEvent(paste);
          node.dispatchEvent(shortcut);
          const copy = new ClipboardEvent("copy", { bubbles: true, cancelable: true });
          document.body.dispatchEvent(copy);
          return {
            paste: paste.defaultPrevented,
            shortcut: shortcut.defaultPrevented,
            copy: copy.defaultPrevented,
          };
        }),
        { paste: false, shortcut: false, copy: true },
        "search allows clipboard editing while archive content stays protected",
      );

      if (width === 390) {
        await root.locator(".selector-sheet-close").click();
        await root.locator(".detail-toolbar").scrollIntoViewIfNeeded();
        await root.locator(".dock-current").click();
        await page.waitForTimeout(100);
        assert.equal(
          await root
            .locator(".form-chip:not([hidden])")
            .evaluate((node) => node === document.activeElement),
          true,
          "reopening a filtered selector focuses an available result",
        );
        await search.focus();
      }

      // Candidate confirmation must not also activate a form or close its
      // selector. keyCode 229 covers Safari's composition-confirmation key.
      for (const event of [
        { key: "Enter", isComposing: true },
        { key: "Enter", keyCode: 229 },
        { key: "Escape", isComposing: true },
      ]) {
        await search.dispatchEvent("keydown", event);
        assert.equal(await root.getAttribute("data-active-form"), initial);
        assert.equal(await search.inputValue(), query);
        assert.equal(
          await root.evaluate((node) => node.classList.contains("is-selector-sheet-open")),
          width === 390,
          "composition does not dismiss the selector",
        );
      }
      await search.press("Enter");
      await archiveDocument.waitForFunction(
        ({ selector, form }) => document.querySelector(selector)?.dataset.activeForm === form,
        {
          selector:
            archive === "saga" ? "#saga-forms-performance-v5" : "#realm--saga-forms-performance-v5",
          form: chosen,
        },
      );
      assert.equal(await root.getAttribute("data-active-form"), chosen);
      assert.ok(
        (await archiveDocument.title()).includes(
          archive === "saga" ? "仮面ライダーサーガ" : "仮面ライダーレルム",
        ),
        "the selected form title keeps the archive's rider identity",
      );
      assert.equal(
        await root.evaluate((node) => node.classList.contains("is-selector-sheet-open")),
        false,
      );
      if (width === 390) {
        await root.locator(".dock-current").click();
        await search.fill("does-not-exist-archival-form");
        await root.locator(".selector-sheet-close").click();
        await root.locator(".dock-current").click();
        await page.waitForTimeout(100);
        assert.equal(
          await search.evaluate((node) => node === document.activeElement),
          true,
          "a selector with no matching forms reopens at the search input",
        );
        await search.press("Escape");
        assert.equal(await search.inputValue(), "");
      }
      assert.deepEqual(errors, []);
      console.log(
        `PASS ${archive} ${width}px${iframeMode ? " iframe" : ""}: IME candidate confirmation, Escape, regular Enter, filtered selector focus`,
      );
      await page.close();
    }
  }
} finally {
  await browser.close();
}
