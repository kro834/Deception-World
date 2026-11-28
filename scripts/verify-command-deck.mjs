// Production-build regression for the initial dashboard, replay and shared menu.
// Browser device profiles are not a substitute for physical iPad verification.
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium, webkit } from "playwright";
import { openCommandDeck } from "./verify-menu-region.mjs";

const base = process.env.BASE_URL || "http://127.0.0.1:8301";
const output = process.env.DECK_SHOTS_DIR || "output/playwright/command-deck";
const engines = (process.env.DECK_ENGINES || "chromium,webkit").split(",");
const results = [];
await mkdir(output, { recursive: true });

for (const engine of engines) {
  const browser = await (engine === "webkit" ? webkit : chromium).launch(
    engine === "webkit" ? {} : { channel: "chrome" },
  );
  try {
    for (const [width, height] of [
      [320, 740],
      [507, 900],
      [768, 1024],
      [1024, 768],
      [1366, 1024],
      [1440, 1000],
    ]) {
      const context = await browser.newContext({
        viewport: { width, height },
        hasTouch: width < 1400,
        reducedMotion: width === 507 ? "reduce" : "no-preference",
      });
      try {
        const page = await context.newPage();
        const errors = [];
        page.on("pageerror", (error) => errors.push(error.message));
        // 2026-11-28: "/" opened as a document plays the opening first (owner, 2026-10-27).
        await openCommandDeck(page, base);
        await page.locator('.command-deck[data-scene="world"]').waitFor();
        assert.equal(
          await page.getByRole("link", { name: "オープニング", exact: true }).count(),
          1,
        );
        // 2026-11-28: the deck's picture is the shared artwork stage's current image
        // (2026-10-31, e00e5356 "Recompose home ... around shared artwork stages").
        await page
          .locator(".command-deck-artwork-stage .artwork-stage__image--current img")
          .evaluate((image) => image.decode());
        const geometry = await page.evaluate(() => ({
          width: innerWidth,
          scrollWidth: document.documentElement.scrollWidth,
          bodyOverflow: getComputedStyle(document.body).overflowY,
          canvasIntercepts: [...document.querySelectorAll(".command-deck canvas")].some(
            (canvas) => getComputedStyle(canvas).pointerEvents !== "none",
          ),
        }));
        assert.ok(geometry.scrollWidth <= width + 1, `${engine} ${width}: overflow`);
        assert.equal(geometry.bodyOverflow, "auto");
        assert.equal(geometry.canvasIntercepts, false);
        await page.screenshot({ path: `${output}/${engine}-${width}.png`, fullPage: true });
        await page.locator('.command-deck-scene-buttons a[href="/dream-chapter"]').click();
        await page.locator('.command-deck[data-scene="dream"]').waitFor();
        assert.equal(new URL(page.url()).pathname, "/", "scene selection remains on the deck");
        await page.getByRole("button", { name: "次のビジュアル" }).click();
        assert.equal(await page.locator(".command-deck-art-controls b").textContent(), "02");
        await page.locator('.command-deck-scene-buttons a[href="/final-stage"]').click();
        await page.locator('.command-deck[data-scene="final"]').waitFor();
        assert.equal(await page.locator(".command-deck-art-controls b").textContent(), "01");
        assert.equal(
          await page.locator(".command-deck-enter").getAttribute("href"),
          "/final-stage",
        );
        if (width === 768) {
          await page.setViewportSize({ width: 1024, height: 768 });
          await page.locator(".command-deck-footer").scrollIntoViewIfNeeded();
          assert.ok(
            await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
          );
          await page.setViewportSize({ width, height });
        }
        assert.deepEqual(errors, [], `${engine} ${width}: script errors`);
        results.push({ engine, width, height, interactions: "passed", geometry });
      } finally {
        await context.close();
      }
    }

    const noScript = await browser.newContext({
      javaScriptEnabled: false,
      viewport: { width: 768, height: 1024 },
    });
    try {
      const page = await noScript.newPage();
      await page.goto(base);
      // 2026-11-28: the document that opens on "/" server-renders the opening
      // (owner, 2026-10-27, 38a788aa), not the dashboard, so the dashboard's
      // static links are only reachable with scripts on (see openCommandDeck).
      // The server-rendered opening stands in the document and is named.
      assert.equal(await page.locator(".command-deck").count(), 0);
      assert.equal(
        await page.locator('main.cine-stage[aria-label*="オープニング"]').count(),
        1,
        "SSR opening missing",
      );
      results.push({ engine, javascript: false, ssr: "opening", pass: true });
    } finally {
      await noScript.close();
    }

    const replayContext = await browser.newContext({ viewport: { width: 834, height: 1194 } });
    try {
      await replayContext.addInitScript(() => sessionStorage.setItem("dw-opening-seen", "1"));
      const page = await replayContext.newPage();
      await page.goto(new URL("/?opening=1", base).href);
      await page.locator(".cine-stage.is-playing").waitFor();
      await page.getByRole("button", { name: "オープニングをスキップ" }).click();
      await page.locator(".cine-stage.is-complete").waitFor();
      await page.getByRole("button", { name: "ディセプションワールドへ入る" }).click();
      await page.waitForURL("**/world");
      await page.goBack();
      await page.locator(".cine-stage.is-complete").waitFor({ timeout: 3000 });
      assert.equal(await page.locator(".cine-stage.is-playing").count(), 0);
      await openCommandDeck(page, base);
      await page.getByRole("link", { name: "オープニング", exact: true }).click();
      await page.locator(".cine-stage.is-playing").waitFor();
      await page.goBack();
      await page.locator(".command-deck").waitFor();
      results.push({ engine, flow: "explicit-replay-once-and-settled-history-return", pass: true });
    } finally {
      await replayContext.close();
    }

    const context = await browser.newContext({
      viewport: { width: 834, height: 1194 },
      hasTouch: true,
      reducedMotion: "reduce",
    });
    try {
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await openCommandDeck(page, base);
      await page.getByRole("link", { name: "オープニング", exact: true }).click();
      await page.locator(".cine-stage.is-complete").waitFor();
      assert.equal(await page.locator(".command-deck").count(), 0);
      await page.goBack();
      await page.locator(".command-deck").waitFor();
      assert.equal(await page.evaluate(() => getComputedStyle(document.body).overflowY), "auto");
      await page.locator(".command-deck-enter").click();
      await page.waitForURL("**/world");
      await page.locator(".side-panel-trigger").click();
      await page.locator('#site-side-panel[data-open="true"]').waitFor();
      await page.waitForFunction(() =>
        document.querySelector("#site-side-panel")?.contains(document.activeElement),
      );
      await page.keyboard.press("Escape");
      await page.locator('#site-side-panel[data-open="false"]').waitFor({ state: "attached" });
      assert.equal(
        await page.evaluate(() => document.activeElement?.classList.contains("side-panel-trigger")),
        true,
      );
      await page.goBack();
      await page.locator(".command-deck").waitFor();
      assert.equal(await page.locator(".cine-stage").count(), 0);
      assert.deepEqual(errors, []);
      results.push({ engine, flow: "deck-replay-back-world-menu-escape-back", pass: true });
    } finally {
      await context.close();
    }
  } finally {
    await browser.close();
  }
}
await writeFile(`${output}/report.json`, JSON.stringify(results, null, 2));
console.log(JSON.stringify({ passed: results.length, results }, null, 2));
