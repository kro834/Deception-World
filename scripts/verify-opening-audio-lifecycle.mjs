import assert from "node:assert/strict";
import { chromium } from "playwright";

const base = process.env.BASE_URL || "http://127.0.0.1:8082";
const browser = await chromium.launch({ channel: process.env.PW_BROWSER_CHANNEL || "chrome" });
const results = [];
try {
  for (const [refused, interrupted] of [
    [false, false],
    [true, false],
    [false, true],
  ]) {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.addInitScript(
      ({ refused, interrupted }) => {
        const NativeContext = window.AudioContext;
        window.__scoreContexts = [];
        window.AudioContext = class extends NativeContext {
          forcedInterruption = interrupted;
          resumes = 0;
          constructor(...args) {
            super(...args);
            window.__scoreContexts.push(this);
          }
          get state() {
            if (super.state === "closed") return "closed";
            if (refused) return "suspended";
            return this.forcedInterruption ? "interrupted" : super.state;
          }
          resume() {
            this.resumes++;
            this.forcedInterruption = false;
            return refused ? Promise.reject(new Error("test: audio refused")) : super.resume();
          }
        };
      },
      { refused, interrupted },
    );
    await page.goto(new URL("/", base).href);
    await page.locator(".cine-stage.is-playing").waitFor();
    for (let run = 0; run < 3; run++) {
      if (run > 0) {
        await page.getByRole("button", { name: "もう一度" }).click();
        await page.locator(".cine-stage.is-playing").waitFor();
      }
      const enableSound = page.getByRole("button", { name: "音声をオン" });
      if (await enableSound.count()) await enableSound.click();
      if (!refused) {
        await page.getByRole("button", { name: "音声をオフ" }).waitFor();
        await page.waitForFunction(() =>
          window.__scoreContexts.some((ctx) => ctx.state === "running"),
        );
      } else {
        await page.waitForTimeout(100);
        assert.equal(await page.getByRole("button", { name: "音声をオン" }).count(), 1);
      }
      await page.locator(".cine-skip").click();
      await page.locator(".cine-stage.is-complete").waitFor();
      await page.waitForTimeout(600);
      const states = await page.evaluate(() => window.__scoreContexts.map((ctx) => ctx.state));
      assert.ok(states.length > 0);
      assert.ok(
        states.every((state) => state === "closed"),
        JSON.stringify(states),
      );
      if (interrupted) {
        assert.ok(
          await page.evaluate(() => window.__scoreContexts.every((ctx) => ctx.resumes > 0)),
        );
      }
      assert.deepEqual(errors, []);
      results.push({ refused, interrupted, run, states, pass: true });
    }
    await page.close();
  }
  console.log(JSON.stringify({ results }, null, 2));
} finally {
  await browser.close();
}
