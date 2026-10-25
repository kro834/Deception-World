import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium, webkit } from "playwright";

// Only ephemeral browser-local preferences are changed. Shared GET responses are fixtures;
// any attempted public mutation or auth request is blocked and fails the regression.
const base = process.env.BASE_URL || "http://127.0.0.1:4265";
const output = resolve(
  process.env.PW_OUTPUT || "output/playwright/gallery-sol-batch/personal-browser",
);
const favoriteKey = "deception-world.gallery-favorites.v1";
const featureKey = "deception-world.gallery-feature.v1";
const favoriteUnsaved =
  "お気に入りはこの画面に反映しましたが、保存できませんでした。再読み込みすると変更が失われる場合があります。";
const featureUnsaved =
  "トップ作品はこの画面に反映しましたが、保存できませんでした。再読み込みすると変更が失われる場合があります。";
const results = [];
await mkdir(output, { recursive: true });

async function check(condition, message) {
  await condition();
  results.push(message);
}

async function pressed(page, id, expected) {
  await page.waitForFunction(
    ({ id, expected }) =>
      document
        .querySelector(`[data-gallery-artwork="${id}"] .gallery-favorite-toggle`)
        ?.getAttribute("aria-pressed") === String(expected),
    { id, expected },
  );
}

const card = (page, id) => page.locator(`[data-gallery-artwork="${id}"]`);
const favorite = (page, id) => card(page, id).locator(".gallery-favorite-toggle");
const hero = (page) => page.locator(".gallery-feature a[aria-haspopup=dialog]");

async function open(page, id) {
  await card(page, id).locator(".gallery-work-open").focus();
  await page.keyboard.press("Enter");
  await page.locator("dialog[open]").waitFor();
  assert.equal(
    await page.evaluate(() =>
      document.querySelector("dialog[open]")?.contains(document.activeElement),
    ),
    true,
    "viewer receives focus",
  );
}

async function close(page) {
  await page.locator("dialog[open] .gallery-close-primary").click();
  await page.locator("dialog[open]").waitFor({ state: "hidden" });
  await page.waitForFunction(() => document.activeElement?.matches(".gallery-work-open"));
}

async function feature(page) {
  await expandTools(page);
  const button = page.getByRole("button", { name: /^トップに(?:飾る|設定済み)$/ });
  await button.focus();
  await button.press("Enter");
  return button;
}

async function expandTools(page) {
  const details = page.locator("dialog[open] .gallery-viewer-tools");
  if (!(await details.evaluate((element) => element.open)))
    await details.locator("summary").click();
}

async function revealedFeedback(page, text, button) {
  await page.waitForFunction((text) => {
    const header = document.querySelector("dialog[open] .gallery-viewer-header");
    const feedback = [...(header?.querySelectorAll("[role=alert], [role=status]") ?? [])].find(
      (element) => element.textContent === text,
    );
    if (!header || !feedback) return false;
    const bounds = header.getBoundingClientRect();
    const rect = feedback.getBoundingClientRect();
    return (
      rect.top >= bounds.top - 1 &&
      rect.bottom <= bounds.bottom + 1 &&
      rect.left >= bounds.left - 1 &&
      rect.right <= bounds.right + 1 &&
      rect.bottom <= innerHeight
    );
  }, text);
  assert.equal(
    await button.evaluate((element) => element === document.activeElement),
    true,
    "automatic feedback reveal preserves action focus",
  );
}

async function visibleText(page, selector, text) {
  const element = page.locator(selector).filter({ hasText: text }).first();
  await element.waitFor({ state: "visible" });
  assert.equal(await element.textContent(), text);
  assert.equal(
    await element.evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
    true,
    "feedback wraps inside its box",
  );
  return element;
}

for (const [engine, type] of [
  ["chrome", chromium],
  ["webkit", webkit],
]) {
  const browser = await type.launch(
    engine === "chrome"
      ? { channel: "chrome" }
      : process.env.PW_WEBKIT_EXECUTABLE
        ? { executablePath: process.env.PW_WEBKIT_EXECUTABLE }
        : {},
  );
  try {
    for (const viewport of [
      { width: 320, height: 740 },
      { width: 834, height: 1112 },
    ]) {
      for (const mode of ["normal", "getter", "read", "write", "quota"]) {
        const label = `${engine}-${viewport.width}-${mode}`;
        const context = await browser.newContext({ viewport, reducedMotion: "reduce" });
        const mutations = [];
        const errors = [];
        try {
          await context.route("**/*", async (route) => {
            const request = route.request();
            const url = new URL(request.url());
            if (!["GET", "HEAD"].includes(request.method()) || /\/auth\//.test(url.pathname)) {
              mutations.push(`${request.method()} ${url.pathname}`);
              return route.abort();
            }
            if (url.pathname === "/api/gallery/config")
              return route.fulfill({ json: { ready: false } });
            if (url.pathname === "/api/gallery")
              return route.fulfill({ json: { posts: [], titles: {} } });
            return route.continue();
          });
          await context.addInitScript(
            ({ mode, favoriteKey, featureKey }) => {
              const native = window.localStorage;
              if (!native.getItem("gallery-regression-seeded")) {
                native.setItem(favoriteKey, JSON.stringify(["g09"]));
                native.setItem(featureKey, "g08");
                native.setItem("gallery-regression-seeded", "yes");
              }
              const methods = {
                getItem: Storage.prototype.getItem,
                setItem: Storage.prototype.setItem,
                removeItem: Storage.prototype.removeItem,
              };
              const original = {
                getItem: native.getItem.bind(native),
                setItem: native.setItem.bind(native),
                removeItem: native.removeItem.bind(native),
                clear: native.clear.bind(native),
              };
              window.__personalNative = original;
              window.__personalStorageMode = mode;
              window.__personalStorageEvents = [];
              window.addEventListener("storage", (event) =>
                window.__personalStorageEvents.push(event.key),
              );
              Object.defineProperty(window, "localStorage", {
                configurable: true,
                get() {
                  const active = window.__personalStorageMode;
                  if (active === "getter")
                    throw new DOMException("Blocked getter", "SecurityError");
                  return native;
                },
              });
              Storage.prototype.getItem = function (key) {
                if (
                  this === native &&
                  window.__personalStorageMode === "read" &&
                  [favoriteKey, featureKey].includes(key)
                )
                  throw new DOMException("Blocked read", "SecurityError");
                return methods.getItem.call(this, key);
              };
              Storage.prototype.setItem = function (key, value) {
                const active = window.__personalStorageMode;
                if (
                  this === native &&
                  ["write", "quota"].includes(active) &&
                  [favoriteKey, featureKey].includes(key)
                )
                  throw new DOMException(
                    "Blocked write",
                    active === "quota" ? "QuotaExceededError" : "SecurityError",
                  );
                methods.setItem.call(this, key, value);
              };
              Storage.prototype.removeItem = function (key) {
                const active = window.__personalStorageMode;
                if (
                  this === native &&
                  ["write", "quota"].includes(active) &&
                  [favoriteKey, featureKey].includes(key)
                )
                  throw new DOMException(
                    "Blocked remove",
                    active === "quota" ? "QuotaExceededError" : "SecurityError",
                  );
                methods.removeItem.call(this, key);
              };
            },
            { mode: mode === "normal" ? "none" : mode, favoriteKey, featureKey },
          );
          const page = await context.newPage();
          context.setDefaultTimeout(15_000);
          page.on("pageerror", (error) => errors.push(error.message));
          await page.goto(`${base}/gallery`, { waitUntil: "domcontentloaded" });
          await page.locator(".gallery-arrival").waitFor({ state: "hidden" });
          await card(page, "g01").waitFor();
          if (["getter", "read"].includes(mode)) {
            await visibleText(
              page,
              "[data-gallery-favorite-feedback]",
              "保存済みのお気に入りを読み込めません。変更はこの画面に反映できます。",
            );
            await visibleText(
              page,
              ".gallery-feature-feedback[role=alert]",
              "保存済みのトップ作品を読み込めません。変更はこの画面に反映できます。",
            );
          } else await pressed(page, "g09", true);
          await favorite(page, "g01").click();
          await pressed(page, "g01", true);
          if (mode !== "normal") {
            const feedback = await visibleText(
              page,
              "[data-gallery-favorite-feedback]",
              favoriteUnsaved,
            );
            await feedback.scrollIntoViewIfNeeded();
            await page.screenshot({ path: `${output}/${label}-favorite-unsaved.png` });
            assert.equal(
              await page.locator("[data-gallery-favorite-feedback][role=status]").count(),
              0,
              "failure never announces saved favorites",
            );
            assert.deepEqual(
              await page.evaluate(
                (key) => JSON.parse(window.__personalNative.getItem(key)),
                favoriteKey,
              ),
              ["g09"],
              "failed favorite does not overwrite saved unrelated choice",
            );
          }
          await open(page, "g01");
          if (mode !== "normal")
            await visibleText(page, "dialog [data-gallery-favorite-feedback]", favoriteUnsaved);
          await expandTools(page);
          const viewerFavorite = page
            .locator("dialog[open] .gallery-viewer-actions button")
            .filter({ hasText: "お気に入り" });
          for (const wanted of [false, true]) {
            await viewerFavorite.focus();
            await viewerFavorite.press("Enter");
            await revealedFeedback(
              page,
              mode === "normal" ? "お気に入りをこのブラウザーに保存しました。" : favoriteUnsaved,
              viewerFavorite,
            );
            assert.equal(await viewerFavorite.getAttribute("aria-pressed"), String(wanted));
          }
          const featureButton = await feature(page);
          const featureFails = ["getter", "write", "quota"].includes(mode);
          await revealedFeedback(
            page,
            featureFails
              ? featureUnsaved
              : "トップ作品を保存しました。自分の表示だけに反映されます。",
            featureButton,
          );
          if (featureFails) {
            await visibleText(page, "dialog [role=alert]", featureUnsaved);
            await page.screenshot({ path: `${output}/${label}-feature-unsaved.png` });
            assert.equal(
              await page.evaluate((key) => window.__personalNative.getItem(key), featureKey),
              "g08",
            );
          }
          await close(page);
          if (mode !== "normal")
            await visibleText(page, "[data-gallery-favorite-feedback]", favoriteUnsaved);
          if (featureFails)
            await visibleText(page, ".gallery-feature-feedback[role=alert]", featureUnsaved);
          await open(page, "g02");
          if (mode !== "normal")
            await visibleText(page, "dialog [data-gallery-favorite-feedback]", favoriteUnsaved);
          if (featureFails) await visibleText(page, "dialog [role=alert]", featureUnsaved);
          await close(page);
          if (mode === "normal") {
            await page.reload({ waitUntil: "domcontentloaded" });
            await page.locator(".gallery-arrival").waitFor({ state: "hidden" });
            await pressed(page, "g01", true);
            await pressed(page, "g09", true);
            assert.match(await hero(page).getAttribute("href"), /g01-/);
          }
          const second = await context.newPage();
          await second.goto(`${base}/gallery`, { waitUntil: "domcontentloaded" });
          await second.evaluate(
            ({ favoriteKey, featureKey }) => {
              window.__personalNative.setItem(favoriteKey, JSON.stringify(["g09", "g10"]));
              window.__personalNative.setItem(featureKey, "g10");
            },
            { favoriteKey, featureKey },
          );
          await page.waitForFunction(
            (key) => window.__personalStorageEvents.includes(key),
            favoriteKey,
          );
          if (mode === "normal") {
            await pressed(page, "g01", false);
            await pressed(page, "g10", true);
            await page.waitForFunction(() =>
              document
                .querySelector(".gallery-feature a[aria-haspopup=dialog]")
                ?.getAttribute("href")
                ?.includes("g10-"),
            );
            await second.evaluate(() => window.__personalNative.clear());
            await page.waitForFunction(() => window.__personalStorageEvents.includes(null));
            await pressed(page, "g09", false);
            await pressed(page, "g10", false);
            await page.waitForFunction(() =>
              document
                .querySelector(".gallery-feature a[aria-haspopup=dialog]")
                ?.getAttribute("href")
                ?.includes("g03-"),
            );
          } else {
            await pressed(page, "g01", true);
            await visibleText(page, "[data-gallery-favorite-feedback]", favoriteUnsaved);
            if (featureFails)
              await visibleText(page, ".gallery-feature-feedback[role=alert]", featureUnsaved);
            await page.evaluate(() => {
              window.__personalStorageMode = "none";
            });
            await favorite(page, "g02").click();
            await pressed(page, "g01", true);
            await pressed(page, "g02", true);
            await pressed(page, "g09", true);
            await pressed(page, "g10", true);
            assert.deepEqual(
              (
                await page.evaluate(
                  (key) => JSON.parse(window.__personalNative.getItem(key)),
                  favoriteKey,
                )
              ).sort(),
              ["g01", "g02", "g09", "g10"],
            );
            assert.equal(
              await page.locator("[data-gallery-favorite-feedback][role=alert]").count(),
              0,
              "explicit successful action clears favorite warning",
            );
            await open(page, "g01");
            await feature(page);
            await close(page);
            assert.equal(
              await page.locator(".gallery-feature-feedback[role=alert]").count(),
              0,
              "explicit successful feature action clears warning",
            );
            assert.equal(
              await page.evaluate((key) => window.__personalNative.getItem(key), featureKey),
              "g01",
            );
          }
          assert.deepEqual(mutations, [], "no public writes/auth/uploads");
          assert.deepEqual(errors, [], "no page exceptions");
          await check(
            async () =>
              assert.equal(
                await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
                true,
              ),
            `${label}: save/reload or fallback/recovery, real storage events, viewer warnings/focus, wrapping, no writes/errors`,
          );
          console.log(`PASS ${label}`);
        } catch (error) {
          console.error(label, { mutations, errors });
          for (const [index, page] of context.pages().entries()) {
            await page
              .screenshot({ path: `${output}/${label}-failure-${index}.png` })
              .catch(() => {});
            await writeFile(
              `${output}/${label}-failure-${index}.json`,
              JSON.stringify(
                await page
                  .evaluate(() => ({
                    url: location.href,
                    body: document.body.innerText,
                    storage: window.__personalNative?.getItem(
                      "deception-world.gallery-favorites.v1",
                    ),
                    mode: window.__personalStorageMode,
                  }))
                  .catch(() => ({})),
                null,
                2,
              ),
            );
          }
          throw error;
        } finally {
          await context.close();
        }
      }
    }
  } finally {
    await browser.close();
  }
}
await writeFile(
  `${output}/results.json`,
  `${JSON.stringify({ base, scenarios: results.length, results }, null, 2)}\n`,
);
console.log(`PASS ${results.length} browser scenarios`);
