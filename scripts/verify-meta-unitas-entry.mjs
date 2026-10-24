// Real navigation and network barriers, not forged engine readiness.
// BASE_URL=http://127.0.0.1:8618 PW_ENGINE=webkit node scripts/verify-meta-unitas-entry.mjs
// ENTRY_CASE selects comma-separated scenarios; ENTRY_PROFILE=desktop uses a mouse.
// EXPECT_BROKEN=1 captures the old cold-entry bug.
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium, webkit } from "playwright";
import { checkedUrl } from "./browser-guard.mjs";

const base = checkedUrl(process.env.BASE_URL || "http://127.0.0.1:8618");
const engine = process.env.PW_ENGINE || "webkit";
const desktop = process.env.ENTRY_PROFILE === "desktop";
const baseline = process.env.EXPECT_BROKEN === "1";
const out = `output/playwright/meta-unitas-entry/${baseline ? "baseline" : "fixed"}-${engine}-${desktop ? "desktop" : "phone"}`;
await mkdir(out, { recursive: true });
const browser = await (engine === "webkit" ? webkit : chromium).launch(
  engine === "webkit" ? {} : { channel: "chrome" },
);
const results = [];
const cases = process.env.ENTRY_CASE?.split(",") || [
  "slow",
  "chunk",
  "card",
  "skip",
  "back",
  "failure",
  "reduced",
  "preference",
  "warm",
];
try {
  for (const name of cases) {
    const context = await browser.newContext({
      viewport: desktop ? { width: 1440, height: 900 } : { width: 390, height: 844 },
      isMobile: !desktop,
      hasTouch: !desktop,
      reducedMotion: name === "reduced" ? "reduce" : "no-preference",
    });
    const page = await context.newPage();
    page.setDefaultTimeout(30_000);
    const errors = [];
    page.on("pageerror", (error) => errors.push({ name: error.name, message: error.message }));
    let release = () => {};
    const barrier = new Promise((resolve) => {
      release = resolve;
    });
    let intercepted = 0;
    const held = name !== "warm" && name !== "reduced";
    if (held) {
      const pattern =
        name === "chunk"
          ? /\/assets\/meta-unitas-rx-engine-[^/]+\.js|\/src\/lib\/meta-unitas-rx-engine\.ts/
          : /\/meta-unitas-rx-suit-20261023\/figure\.webp/;
      await page.route(pattern, async (route) => {
        intercepted += 1;
        if (name === "failure") return route.abort("failed");
        await barrier;
        await route.continue().catch(() => {});
      });
    }
    const source = name === "warm" ? "/extreme-saga" : "/world";
    try {
      await page.goto(`${base}${source}`, { waitUntil: "domcontentloaded" });
      await page.waitForFunction(
        () =>
          !document.documentElement.hasAttribute("data-loading") &&
          document.documentElement.dataset.scrollMotionReady === "true",
      );
      if (name === "back") {
        await page.locator('.topbar nav a[href="#story"]').click();
        await page.waitForURL("**/world#story");
      }
      await page.evaluate(() => {
        window.__entryFrames = [];
        window.__entryTimer = setInterval(() => {
          const layer = document.querySelector(".mus-entry");
          const runway = layer?.querySelector(".rzn-suitup");
          window.__entryFrames.push({
            t: performance.now(),
            path: location.pathname,
            phase: layer?.dataset.playback ?? null,
            load: runway?.dataset.rznLoad ?? null,
            state: runway?.dataset.rznState ?? null,
            scroll: layer?.scrollTop ?? null,
            call: layer?.querySelector('[data-cue="on"]')?.textContent ?? null,
          });
        }, 40);
      });
      const press = (locator) => (desktop ? locator.click() : locator.tap());
      const enter = async () => {
        if (name === "card") {
          await press(page.locator('.ws-doors a[href="/meta-unitas-saga#top"]'));
          return;
        }
        await press(page.locator(".side-panel-trigger"));
        await press(page.locator('#site-side-panel a[href="/meta-unitas-saga#top"]'));
      };
      await enter();
      if (name !== "reduced") await page.locator(".mus-entry").waitFor();
      if (["slow", "chunk", "card"].includes(name)) {
        await page.waitForTimeout(4300);
        const before = await page.evaluate(() => ({
          path: location.pathname,
          scroll: document.querySelector(".mus-entry")?.scrollTop ?? null,
          phase: document.querySelector(".mus-entry")?.dataset.playback ?? null,
        }));
        assert.ok(intercepted > 0, "the cold dependency really was held");
        if (baseline) {
          assert.equal(
            before.path,
            "/meta-unitas-saga",
            "old entry should reproduce early arrival",
          );
          results.push({ name, reproduced: true, before, intercepted });
          continue;
        }
        // Owner (2026-10-24): the scene moves at once and holds its cover
        // (never cut short) until the slow engine joins.
        assert.equal(before.path, source, "must not navigate while the engine is still missing");
        assert.equal(before.phase, "playing");
        assert.ok(before.scroll > 0, "the transformation moves without waiting for readiness");
        await page.screenshot({ path: `${out}/${name}-held.png` });
        release();
        await page.locator('.mus-entry[data-playback="playing"]').waitFor();
        await page.waitForTimeout(1000);
        await page.screenshot({ path: `${out}/${name}-playing.png` });
      } else if (name === "skip") {
        await press(page.getByRole("button", { name: "変身演出をスキップ", exact: true }));
      } else if (name === "back") {
        await page.goBack();
        await page.waitForURL("**/world");
        release();
        await page.waitForTimeout(4500);
        assert.equal(new URL(page.url()).pathname, "/world");
        assert.equal(await page.locator(".mus-entry").count(), 0);
      } else if (name === "failure") {
        await page.locator(".route-load-delay").waitFor({ timeout: 25_000 });
        assert.equal(
          new URL(page.url()).pathname,
          source,
          "failure is retryable, not an automatic skip",
        );
        assert.equal(await page.locator(".mus-entry").count(), 0);
        assert.match(
          await page.locator(".route-load-delay a").getAttribute("href"),
          /meta-unitas-saga/,
        );
      } else if (name === "preference") {
        await page.emulateMedia({ reducedMotion: "reduce" });
      }
      if (name !== "back" && name !== "failure") {
        await page.waitForURL("**/meta-unitas-saga#top");
      }
      await page.waitForFunction(
        () =>
          !document.querySelector(".load-gate") &&
          !document.documentElement.hasAttribute("data-loading") &&
          !document.documentElement.hasAttribute("data-route-cover"),
      );
      let repeatAt = null;
      if (name === "warm") {
        await page.goBack();
        await page.waitForURL("**/extreme-saga");
        await page.waitForFunction(
          () =>
            !document.documentElement.hasAttribute("data-loading") &&
            !document.documentElement.hasAttribute("data-route-cover"),
        );
        repeatAt = await page.evaluate(() => performance.now());
        await enter();
        await page.locator('.mus-entry[data-playback="playing"]').waitFor();
        await page.waitForURL("**/meta-unitas-saga#top");
        await page.waitForFunction(
          () =>
            !document.querySelector(".load-gate") &&
            !document.documentElement.hasAttribute("data-route-cover"),
        );
      }
      const frames = await page.evaluate(() => {
        clearInterval(window.__entryTimer);
        return window.__entryFrames;
      });
      const playing = frames.find((frame) => frame.phase === "playing");
      const arrival = frames.find((frame) => frame.path === "/meta-unitas-saga");
      if (["slow", "chunk", "card", "warm"].includes(name)) {
        assert.ok(playing && arrival, "the real prepared engine must play before arrival");
        assert.ok(
          arrival.t - playing.t >= 3000,
          `full call was truncated: ${arrival.t - playing.t}`,
        );
        assert.ok(
          new Set(frames.filter((frame) => frame.phase === "playing").map((frame) => frame.call))
            .size >= 4,
          "intermediate calls must be visible",
        );
      }
      if (repeatAt !== null) {
        const second = frames.filter((frame) => frame.t > repeatAt);
        const secondPlaying = second.find((frame) => frame.phase === "playing");
        const secondArrival = second.find((frame) => frame.path === "/meta-unitas-saga");
        assert.ok(
          secondPlaying && secondArrival && secondArrival.t - secondPlaying.t >= 3000,
          "repeat entry gets its own complete clock",
        );
      }
      assert.deepEqual(errors, [], "navigation must not raise browser errors");
      await writeFile(`${out}/${name}-frames.json`, JSON.stringify({ frames, errors }, null, 2));
      results.push({
        name,
        status: "PASS",
        intercepted,
        playMs: playing && arrival ? arrival.t - playing.t : null,
        errors,
      });
      console.log(JSON.stringify(results.at(-1)));
    } catch (error) {
      await page.screenshot({ path: `${out}/${name}-failure.png` }).catch(() => {});
      const frames = await page.evaluate(() => window.__entryFrames).catch(() => []);
      await writeFile(
        `${out}/${name}-failure.json`,
        JSON.stringify({ error: error.message, frames, errors }, null, 2),
      );
      throw error;
    } finally {
      release();
      await context.close();
    }
  }
} finally {
  await browser.close();
  await writeFile(
    `${out}/report.json`,
    JSON.stringify({ base, engine, desktop, results }, null, 2),
  );
}
