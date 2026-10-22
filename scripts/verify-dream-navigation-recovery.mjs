// BASE_URL=http://127.0.0.1:4263 PW_ENGINE=chromium|webkit node scripts/verify-dream-navigation-recovery.mjs
import assert from "node:assert/strict";
import { chromium, webkit } from "playwright";
import { checkedUrl } from "./browser-guard.mjs";

const base = checkedUrl(process.env.BASE_URL || "http://127.0.0.1:4263");
const engine = process.env.PW_ENGINE === "webkit" ? webkit : chromium;
const browser = await engine.launch(
  engine === chromium ? { channel: process.env.PW_BROWSER_CHANNEL || "chrome" } : undefined,
);
const results = [];
const failures = [];

async function scenario(name, run) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  try {
    await run(page);
    assert.deepEqual(errors, [], "navigation produces no page errors");
    results.push({ scenario: name, passed: true });
  } catch (error) {
    failures.push(`${name}: ${error.message}`);
    results.push({ scenario: name, passed: false, error: error.message });
  } finally {
    await context.close();
  }
}

async function ready(page, hash) {
  await page.goto(new URL(`/dream-chapter${hash}`, base).href, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => {
    const button = document.querySelector(".dream-reading-entry button");
    return (
      button &&
      !button.disabled &&
      Object.keys(button).some((key) => key.startsWith("__reactProps"))
    );
  });
}

try {
  for (const id of ["dream-character-keiya", "dream-dolminence-lord-knight"]) {
    await scenario(`same-fragment-revisit-${id}`, async (page) => {
      await ready(page, `#${id}`);
      const dialog = page.locator(".dream-dossier-dialog[open]");
      await dialog.waitFor({ state: "visible" });
      await page.keyboard.press("Escape");
      await dialog.waitFor({ state: "detached" });
      const historyLength = await page.evaluate(() => history.length);
      await page.locator(`a[href="#${id}"]`).first().click();
      await dialog.waitFor({ state: "visible", timeout: 3000 });
      assert.equal(new URL(page.url()).hash, `#${id}`);
      assert.equal(
        await page.evaluate(() => history.length),
        historyLength,
        "revisiting the current fragment must not add history",
      );
      await page.keyboard.press("Escape");
      await dialog.waitFor({ state: "detached" });
      await page.waitForFunction((target) => document.activeElement?.id === target, id);
    });
  }

  for (const room of ["reading", "screening"]) {
    for (const direction of ["back", "forward"]) {
      await scenario(`${room}-pending-history-${direction}`, async (page) => {
        await ready(page, "#posters");
        await page.locator('.dream-chapter-nav a[href="#cases"]').click();
        await page.waitForURL("**/dream-chapter#cases");
        if (direction === "forward") {
          await page.goBack();
          await page.waitForURL("**/dream-chapter#posters");
        }
        const trigger = page.locator(
          room === "reading" ? ".dream-reading-entry button" : ".dream-screening-trigger",
        );
        const dialog = page.locator(
          room === "reading" ? ".dream-reading-room[open]" : ".dream-screening-dialog[open]",
        );
        let release;
        let caught;
        const intercepted = new Promise((resolve) => {
          caught = resolve;
        });
        const gate = new Promise((resolve) => {
          release = resolve;
        });
        const pattern = `**/*dream-${room}-room*.css`;
        await page.route(pattern, async (route) => {
          caught();
          await gate;
          await route.continue().catch(() => undefined);
        });
        try {
          await trigger.click();
          let interceptTimer;
          try {
            await Promise.race([
              intercepted,
              new Promise((_, reject) => {
                interceptTimer = setTimeout(
                  () =>
                    reject(
                      new Error(
                        `No ${room} stylesheet request matched ${pattern} within 10 seconds`,
                      ),
                    ),
                  10000,
                );
              }),
            ]);
          } finally {
            clearTimeout(interceptTimer);
          }
          assert.equal(await dialog.count(), 0, "room waits for its stylesheet");
          if (direction === "back") await page.goBack();
          else await page.goForward();
          const destination = direction === "back" ? "#posters" : "#cases";
          await page.waitForURL(`**/dream-chapter${destination}`);
          release();
          await page.waitForFunction((kind) => {
            const link = document.querySelector(`link[data-dream-${kind}-style]`);
            return Boolean(link?.sheet);
          }, room);
          await page.evaluate(
            () =>
              new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
          );
          assert.equal(
            await dialog.count(),
            0,
            "completing an abandoned load must not open a dialog at the history destination",
          );
          assert.equal(
            await trigger.isEnabled(),
            true,
            "history cancellation permits another visit",
          );
          const unlocked = await page.evaluate(() => ({
            flag: document.documentElement.dataset.dreamDialogOpen,
            position: document.body.style.position,
            overflow: document.documentElement.style.overflow,
          }));
          assert.notEqual(unlocked.flag, "true");
          assert.notEqual(unlocked.position, "fixed");
          assert.notEqual(unlocked.overflow, "hidden");
          // The already downloaded module and stylesheet must still be usable.
          await trigger.click();
          await dialog.waitFor({ state: "visible" });
          await page.keyboard.press("Escape");
          await dialog.waitFor({ state: "detached" });
          await page.waitForFunction(
            (selector) => document.activeElement === document.querySelector(selector),
            room === "reading" ? ".dream-reading-entry button" : ".dream-screening-trigger",
          );
        } finally {
          release();
          await page.unroute(pattern);
        }
      });
    }
  }
  console.log(
    JSON.stringify({ base, engine: engine === webkit ? "webkit" : "chromium", results }, null, 2),
  );
  assert.deepEqual(failures, [], "Dream navigation recovery failures");
} finally {
  await browser.close();
}
