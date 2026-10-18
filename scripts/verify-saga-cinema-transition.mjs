// Entry and return flow for the Saga cinema route. The route curtain must own
// entry; the chapter catalogue and poster dialogs remain usable afterward.
//
//   BASE_URL=http://localhost:8189 node scripts/verify-saga-cinema-transition.mjs
//   PW_ENGINE=webkit BASE_URL=http://localhost:8189 node scripts/verify-saga-cinema-transition.mjs
import assert from "node:assert/strict";
import { chromium, webkit } from "playwright";

const base = process.env.BASE_URL || "http://localhost:8189";
const engine = process.env.PW_ENGINE === "webkit" ? "webkit" : "chromium";
const browserType = engine === "webkit" ? webkit : chromium;
const browser = await browserType.launch(
  engine === "webkit" ? {} : { channel: process.env.PW_BROWSER_CHANNEL || "chrome" },
);
const profiles = [
  { name: "phone-390", width: 390, height: 844, isMobile: true, hasTouch: true },
  { name: "desktop-1440", width: 1440, height: 900 },
];

async function waitForRouteReady(page, pathname) {
  await page.waitForFunction(
    (target) =>
      location.pathname === target &&
      !document.documentElement.hasAttribute("data-loading") &&
      !document.querySelector(".load-gate"),
    pathname,
    { timeout: 20_000 },
  );
}

async function assertNoPostNavigationIntro(page, label) {
  // Catalogue and gallery dialogs are deliberate; the old route-entry modal/replay is not.
  const state = await page.evaluate(() => ({
    opening: Boolean(document.querySelector("#opening")),
    replay: Boolean(document.querySelector("#replay-intro")),
    openDialogs: [...document.querySelectorAll("dialog[open]")].map((dialog) => dialog.id),
  }));
  assert.equal(state.opening, false, `${label}: no opening dialog`);
  assert.equal(state.replay, false, `${label}: no replay control`);
  assert.deepEqual(state.openDialogs, [], `${label}: no modal after route arrival`);
  assert.ok(await page.locator(".saga-cinema #top").count(), `${label}: Saga hero is present`);
}

async function waitForWorld(page) {
  await waitForRouteReady(page, "/world");
  await page.locator(".site-shell").waitFor();
}

async function verifyDirectVisit(page, label) {
  await page.goto(new URL("/saga-cinema#top", base).toString(), { waitUntil: "domcontentloaded" });
  await page.locator(".saga-cinema").waitFor();
  await waitForRouteReady(page, "/saga-cinema");
  await page.waitForTimeout(350);
  await assertNoPostNavigationIntro(page, `${label} direct visit`);

  await page.locator("#films .film-card").first().scrollIntoViewIfNeeded();
  await page.locator("#films .film-card").first().click();
  const detail = page.locator("#film-dialog");
  await detail.waitFor({ state: "visible" });
  assert.equal(await detail.getAttribute("open"), "");
  assert.equal((await detail.locator("#dialog-title").innerText()).trim(), "邂逅");
  await detail.getByRole("button", { name: "ポスターを拡大" }).click();
  const gallery = page.locator("#gallery-dialog");
  await gallery.waitFor({ state: "visible" });
  await gallery.getByRole("button", { name: "次のビジュアル" }).click();
  assert.match(await gallery.locator("#gallery-caption").innerText(), /覚醒/u);
  await gallery.getByRole("button", { name: "ギャラリーを閉じる" }).click();
  await detail.getByRole("button", { name: "作品情報を閉じる" }).click();
  await detail.waitFor({ state: "hidden" });
  assert.equal(await page.locator("dialog[open]").count(), 0);

  await page.locator(".world-return-link").click();
  await waitForWorld(page);
  assert.equal(await page.locator(".load-gate.cinema-route-curtain").count(), 0);
}

async function verifyMenuEntry(page, label, { holdChunk = false } = {}) {
  await page.goto(new URL("/world", base).toString(), { waitUntil: "domcontentloaded" });
  await waitForWorld(page);
  const trigger = page.locator(".side-panel-trigger").first();
  if (await trigger.evaluate(() => matchMedia("(pointer: coarse)").matches)) await trigger.tap();
  else await trigger.click();
  const link = page.locator('#site-side-panel a[href="/saga-cinema#top"]').first();
  await link.waitFor({ state: "visible" });
  const activateLink = async () => {
    if (await link.evaluate(() => matchMedia("(pointer: coarse)").matches)) await link.tap();
    else await link.click();
  };
  let releaseChunk;
  let chunkRequested = false;
  if (holdChunk) {
    const chunkGate = new Promise((resolve) => {
      releaseChunk = resolve;
    });
    const routeChunk = /saga-cinema[^/]*\.(?:js|mjs|tsx)(?:[?#].*)?$/iu;
    await page.route(routeChunk, async (route) => {
      chunkRequested = true;
      await chunkGate;
      await route.continue();
    });
    const chunkSeen = page.waitForRequest((request) => routeChunk.test(request.url()), {
      timeout: 10_000,
    });
    await activateLink();
    await chunkSeen;
  } else {
    await activateLink();
  }

  const curtain = page.locator(".load-gate.cinema-route-curtain");
  try {
    if (holdChunk) {
      await page.waitForFunction(
        () =>
          location.pathname === "/world" &&
          document.documentElement.hasAttribute("data-loading") &&
          document.querySelector(".load-gate.cinema-route-curtain.is-covering"),
        null,
        { timeout: 10_000 },
      );
      assert.equal(chunkRequested, true, `${label}: Saga route chunk is held`);
      await page.waitForTimeout(500);
      const heldState = await page.evaluate(() => ({
        path: location.pathname,
        gate: document.querySelector(".load-gate.cinema-route-curtain")?.className ?? null,
        loading: document.documentElement.hasAttribute("data-loading"),
      }));
      assert.equal(heldState.path, "/world", `${label}: old route remains until chunk release`);
      assert.equal(heldState.loading, true, `${label}: destination stays covered while loading`);
      assert.match(heldState.gate ?? "", /is-covering/u, `${label}: curtain holds before commit`);
      if (engine === "chromium") {
        await page.screenshot({ path: `/private/tmp/cinema-transition-${page.viewportSize().width}.png` });
      }
      releaseChunk();
    } else {
      await curtain.waitFor({ state: "visible", timeout: 10_000 });
    }
  } finally {
    releaseChunk?.();
  }
  await waitForRouteReady(page, "/saga-cinema");
  await assertNoPostNavigationIntro(page, `${label} menu entry`);
  assert.equal(await page.locator("dialog[open]").count(), 0);
  console.log(
    JSON.stringify({ check: "saga-cinema-menu-entry", label, curtain: true, heldChunk: holdChunk }),
  );
}

try {
  for (const profile of profiles) {
    for (const reducedMotion of [false, true]) {
      const label = `${engine}/${profile.name}/${reducedMotion ? "reduced" : "full"}`;
      const context = await browser.newContext({
        viewport: { width: profile.width, height: profile.height },
        isMobile: profile.isMobile,
        hasTouch: profile.hasTouch,
      });
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.emulateMedia({ reducedMotion: reducedMotion ? "reduce" : "no-preference" });
      await verifyMenuEntry(page, label, { holdChunk: !reducedMotion });
      await verifyDirectVisit(page, label);
      assert.deepEqual(errors, [], `${label}: page errors`);
      await context.close();
      console.log(JSON.stringify({ check: "saga-cinema-flow", label, pageErrors: 0 }));
    }
  }
} finally {
  await browser.close();
}
