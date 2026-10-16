import assert from "node:assert/strict";
import { chromium, webkit } from "playwright";
import { REXONANCE_CALLS } from "../src/lib/rexonance-calls.ts";
import { REXONANCE_PROFILE_SECTIONS, rexonanceEntries } from "../src/lib/rexonance-profile.ts";

const base = process.env.BASE_URL || "http://127.0.0.1:8189";
const engine = process.env.PW_ENGINE === "webkit" ? webkit : chromium;
const browser = await engine.launch(engine === chromium ? { channel: "chrome" } : {});
const normalized = (text) => text.replace(/\s+/gu, " ").trim();
try {
  for (const width of [320, 390, 1024]) {
    const page = await browser.newPage({ viewport: { width, height: 1366 }, hasTouch: true });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    try {
      await page.goto(`${base}/riders/saga`);
      await page.waitForFunction(() => document.documentElement.hasAttribute("data-press-ready"));
      const opener = page.getByRole("button", { name: "仮面ライダーレクソナンスサーガをピックアップ", exact: true });
      await opener.focus();
      await page.keyboard.press("Enter");
      const dialog = page.locator(".form-pickup-dialog.is-rexonance-dialog[open]");
      await dialog.waitFor({ state: "visible" });
      const stats = await dialog.locator(".form-pickup-stats").innerText();
      for (const value of ["244.9cm", "190.8kg", "372.2t", "483.5t", "6000m", "0.00021s／100m", "50000〜YOPS", "無限大"]) {
        assert.ok(stats.includes(value), `${width}: dossier ${value}`);
      }
      assert.deepEqual(await dialog.locator(".rider-call b").allTextContents(), [...REXONANCE_CALLS]);
      const dossierText = normalized(await dialog.textContent());
      for (const section of REXONANCE_PROFILE_SECTIONS.filter((section) => section.title !== "形態段階" && section.title !== "追加武装")) {
        for (const entry of rexonanceEntries(section.title)) {
          assert.ok(dossierText.includes(normalized(entry.body)), `${width}: verbatim dossier ${entry.name}`);
        }
      }
      // Zeus is deliberately docked partly outside this dialog. Measure the
      // reading panel, not that unrelated floating control's hit box.
      const reading = dialog.locator(".form-pickup-panel");
      assert.ok((await reading.evaluate((node) => node.scrollWidth - node.clientWidth)) <= 1, `${width}: dossier text overflow`);
      await page.keyboard.press("Escape");
      await dialog.waitFor({ state: "hidden" });

      await page.goto(`${base}/form-archive?form=rexonance`);
      const iframe = await page.locator('iframe[data-archive-kind="saga"]').elementHandle();
      const frame = await iframe.contentFrame();
      const archive = frame.locator("#saga-detail-rexonance .rexonance-setting-dossier");
      await archive.waitFor({ state: "visible" });
      assert.deepEqual(await archive.locator(".rexonance-call-grid span").allTextContents(), [...REXONANCE_CALLS]);
      const archiveText = normalized(await archive.textContent());
      for (const section of REXONANCE_PROFILE_SECTIONS) {
        for (const line of section.body.split("\n").filter(Boolean)) {
          assert.ok(archiveText.includes(normalized(line)), `${width}: verbatim archive ${section.title}`);
        }
      }
      assert.ok((await archive.evaluate((node) => node.scrollWidth - node.clientWidth)) <= 1, `${width}: archive overflow`);
      assert.deepEqual(errors, [], `${width}: page errors`);
      console.log(`PASS ${engine.name()} ${width}: exact calls, stats, original settings, archive, no overflow`);
    } finally {
      await page.close();
    }
  }
} finally {
  await browser.close();
}
