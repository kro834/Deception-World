// Real production-route recovery with network interception only: no DOM/style,
// history, visibility or application-state overrides. Run against preview:
// BASE_URL=http://127.0.0.1:8082 node scripts/verify-rexonance-transition-recovery.mjs
// PW_HEADLESS=false optionally permits real window-visibility testing. Browsers
// that keep automated pages visible report that case as unverified, not passed.
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { ROUTE_WARMUP_DEADLINE_MS } from "../src/lib/route-warmup-deadline.ts";

const base = process.env.BASE_URL || "http://127.0.0.1:8082";
const browser = await chromium.launch({
  channel: process.env.PW_BROWSER_CHANNEL || "chrome",
  headless: process.env.PW_HEADLESS !== "false",
});
const chunkPattern = /\/assets\/rexonance-saga-[^/]+\.js(?:\?|$)/;
const callCssPattern = /\/assets\/styles-rexonance-calls-[^/]+\.css(?:\?|$)/;
const results = [];

async function sourcePage(page, withHistory = false, initialHash = "") {
  await page.goto(`${base}/world${initialHash ? `#${initialHash}` : ""}`, {
    waitUntil: "networkidle",
  });
  await page.waitForFunction(() => document.documentElement.dataset.worldPageVisible !== undefined);
  await released(page);
  if (withHistory) {
    // A real in-page link supplies an earlier same-document history entry;
    // Back must test the provider's cancellation, not destroy the document.
    await page.locator('.topbar nav a[href="#story"]').click();
    await page.waitForURL("**/world#story");
  }
}

async function enterRexonance(page) {
  await page.locator(".side-panel-trigger").click();
  await page.locator('#site-side-panel a[href="/rexonance-saga#top"]').click();
  await page.locator(".load-gate.is-rexonance-calls").waitFor();
}

async function released(page, timeout = 6000) {
  await page.waitForFunction(
    () =>
      !document.querySelector(".load-gate") &&
      !document.documentElement.hasAttribute("data-loading") &&
      !document.documentElement.hasAttribute("data-route-cover") &&
      !document.documentElement.hasAttribute("data-route-scroll-settling"),
    null,
    { timeout, polling: 50 },
  );
}

async function snapshot(page) {
  return page.evaluate(() => ({
    path: location.pathname,
    hash: location.hash,
    loading: document.documentElement.dataset.loading ?? null,
    routeCover: document.documentElement.dataset.routeCover ?? null,
    scrollSettling: document.documentElement.dataset.routeScrollSettling ?? null,
    cover: document.querySelector(".load-gate")?.className ?? null,
    retry: document.querySelector(".route-load-delay a")?.getAttribute("href") ?? null,
  }));
}

async function holdChunk(page) {
  let release;
  const barrier = new Promise((resolve) => {
    release = resolve;
  });
  let requests = 0;
  await page.route(chunkPattern, async (route) => {
    requests += 1;
    await barrier;
    await route.continue().catch(() => undefined);
  });
  return { release, requests: () => requests };
}

async function backFromPending(page, hash = "") {
  await page.goBack({ waitUntil: "domcontentloaded" });
  await page.waitForURL(`**/world${hash ? `#${hash}` : ""}`);
  await released(page);
}

async function scenario(name, run) {
  if (process.env.RECOVERY_CASE && !name.includes(process.env.RECOVERY_CASE)) return;
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  page.setDefaultTimeout(8000);
  const started = performance.now();
  try {
    const detail = await run(page, context);
    const result = {
      name,
      status: detail?.status || "passed",
      ms: Math.round(performance.now() - started),
      ...detail,
    };
    results.push(result);
    console.log(JSON.stringify(result));
  } catch (error) {
    const result = {
      name,
      status: "failed",
      error: error.message,
      state: await snapshot(page).catch(() => null),
    };
    results.push(result);
    console.error(JSON.stringify(result));
  } finally {
    await context.close();
  }
}

try {
  await scenario("call CSS unavailable still releases the route", async (page) => {
    let aborted = 0;
    await page.route(callCssPattern, (route) => {
      aborted += 1;
      return route.abort("failed");
    });
    await sourcePage(page);
    await enterRexonance(page);
    await page.waitForURL("**/rexonance-saga#top");
    await released(page);
    assert.ok(aborted > 0, "the production call stylesheet must actually have been intercepted");
    assert.equal(await page.locator(".rxs-rexonance-page").count(), 1);
    return { aborted, state: await snapshot(page) };
  });

  await scenario("stalled chunk expires, late response stays put, retry works", async (page) => {
    const hold = await holdChunk(page);
    try {
      await sourcePage(page);
      await enterRexonance(page);
      const waitingSince = performance.now();
      const retry = page.locator(".route-load-delay a");
      await retry.waitFor({ timeout: ROUTE_WARMUP_DEADLINE_MS + 4000 });
      const waitMs = Math.round(performance.now() - waitingSince);
      assert.ok(waitMs >= ROUTE_WARMUP_DEADLINE_MS - 500, `unexpected early timeout: ${waitMs} ms`);
      await released(page);
      assert.ok(hold.requests() > 0);
      assert.equal(await retry.getAttribute("href"), "/rexonance-saga#top");
      assert.equal(new URL(page.url()).pathname, "/world");
      hold.release();
      await page.waitForTimeout(3000);
      assert.equal(new URL(page.url()).pathname, "/world", "late chunk must not auto-navigate");
      await retry.click();
      await page.waitForURL("**/rexonance-saga#top");
      await released(page);
      return { heldRequests: hold.requests(), waitMs, state: await snapshot(page) };
    } finally {
      hold.release();
    }
  });

  await scenario("Back cancels a pending chunk without late navigation", async (page) => {
    const hold = await holdChunk(page);
    try {
      await sourcePage(page, true);
      await enterRexonance(page);
      await page.waitForTimeout(100);
      assert.ok(hold.requests() > 0);
      await backFromPending(page);
      hold.release();
      await page.waitForTimeout(3000);
      assert.equal(new URL(page.url()).pathname, "/world");
      assert.equal(new URL(page.url()).hash, "");
      await released(page);
      return { heldRequests: hold.requests(), state: await snapshot(page) };
    } finally {
      hold.release();
    }
  });

  await scenario("old Rexonance finally cannot erase a newer Ciel cover", async (page) => {
    const hold = await holdChunk(page);
    try {
      // #re-dive is the product's supported deep link to Ciel's source card;
      // it unlocks that section through the normal application path.
      await sourcePage(page, true, "re-dive");
      await enterRexonance(page);
      await page.waitForTimeout(100);
      assert.ok(hold.requests() > 0);
      await backFromPending(page, "re-dive");
      await page.locator('a.ciel-signal[href="/characters/ciel"]').click();
      await page.locator(".load-gate.is-ciel-cutin").waitFor();
      hold.release();
      // The old warmup resolves while the newer cover is still closing.
      await page.waitForTimeout(100);
      const during = await snapshot(page);
      assert.equal(during.loading, "true", JSON.stringify(during));
      assert.ok(during.cover?.includes("ciel"), JSON.stringify(during));
      await page.waitForURL("**/characters/ciel");
      await released(page);
      await page.waitForTimeout(3000);
      assert.equal(new URL(page.url()).pathname, "/characters/ciel");
      return { heldRequests: hold.requests(), during, state: await snapshot(page) };
    } finally {
      hold.release();
    }
  });

  await scenario(
    "real background and foreground cannot revive a cancelled call",
    async (page, context) => {
      const session = await context.newCDPSession(page);
      await session.send("Emulation.setFocusEmulationEnabled", { enabled: false });
      const { windowId } = await session.send("Browser.getWindowForTarget");
      const background = () =>
        session.send("Browser.setWindowBounds", { windowId, bounds: { windowState: "minimized" } });
      const foreground = async () => {
        await session.send("Browser.setWindowBounds", {
          windowId,
          bounds: { windowState: "normal" },
        });
        await page.bringToFront();
      };
      await background();
      await page.waitForTimeout(150);
      const hidden = await page.evaluate(() => document.hidden);
      await foreground();
      if (!hidden) {
        return {
          status: "unverified",
          reason:
            "Chrome automation kept document.hidden=false after real window minimization; no DOM visibility override was used. Unit lifecycle tests cover the event contract.",
        };
      }
      await page.waitForFunction(() => !document.hidden);
      const hold = await holdChunk(page);
      try {
        await sourcePage(page);
        await enterRexonance(page);
        await background();
        await page.waitForFunction(() => document.hidden, null, { polling: 50 });
        await released(page);
        await foreground();
        await page.waitForFunction(() => !document.hidden);
        hold.release();
        await page.waitForTimeout(3000);
        assert.equal(new URL(page.url()).pathname, "/world");
        await released(page);
        return { heldRequests: hold.requests(), state: await snapshot(page) };
      } finally {
        hold.release();
        await foreground();
      }
    },
  );
} finally {
  await browser.close();
}

console.log(
  JSON.stringify({
    passed: results.filter((r) => r.status === "passed").length,
    failed: results.filter((r) => r.status === "failed").length,
    unverified: results.filter((r) => r.status === "unverified").length,
  }),
);
if (!results.length || results.some((result) => result.status === "failed")) process.exitCode = 1;
