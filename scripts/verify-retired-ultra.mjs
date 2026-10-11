// Local-only regression for retiring the site-wide Ultra setting. Browser
// emulation is not physical Safari/iPad validation. No shared gallery writes.
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { chromium } from "playwright";

const base = new URL(process.env.BASE_URL || "http://127.0.0.1:8082");
assert.ok(["127.0.0.1", "localhost", "[::1]"].includes(base.hostname), "local preview only");
const output = resolve(
  process.env.RETIRED_ULTRA_OUTPUT || "/private/tmp/scroll-review/retired-ultra",
);
const visualOnly = process.env.RETIRED_ULTRA_VISUAL_ONLY === "1";
const profiles = [
  { name: "narrow320", viewport: { width: 320, height: 568 }, hasTouch: true },
  { name: "phone390", viewport: { width: 390, height: 844 }, hasTouch: true },
  {
    name: "ipad1024",
    viewport: { width: 1024, height: 1366 },
    hasTouch: true,
    userAgent:
      "Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
  },
  { name: "desktop1440", viewport: { width: 1440, height: 900 } },
];
const paths = ["/world", "/dream-chapter", "/gallery", "/extreme-saga", "/rexonance-saga"];
const forbiddenAsset = (url) =>
  /\/(?:ultra-materials|ultra-shaders)\//i.test(url) ||
  /\/assets\/(?:styles-ultra-(?:mode|effects|materials|transitions)|ultra-(?:effects|renderer|mode-runtime|mode-toggle))[-.]/i.test(
    url,
  );
const report = {
  base: base.origin,
  generatedAt: new Date().toISOString(),
  evidence: "Local Chromium, isolated contexts; no public uploads or database mutations",
  scope: visualOnly ? "two corrected visually settled artifacts" : "full interaction regression",
  results: [],
};
await mkdir(output, { recursive: true });
const reportFile = join(output, visualOnly ? "retired-ultra-visual.json" : "retired-ultra.json");
const save = () => writeFile(reportFile, JSON.stringify(report, null, 2));

function seedAndWatch() {
  if (!sessionStorage.getItem("test-retired-ultra-seeded")) {
    localStorage.setItem("dw-ultra-mode-v1", "true");
    localStorage.setItem("dw-ultra-quality-v1", "cinema");
    localStorage.setItem("deception-world.gallery-feature.v1", "g10");
    localStorage.setItem("deception-world.gallery-favorites.v1", '["g10","g19"]');
    sessionStorage.setItem("test-retired-ultra-seeded", "true");
  }
  const audit = (window.__retiredUltraAudit = { frames: 0, enabledFrames: [] });
  const tick = () => {
    const root = document.documentElement;
    audit.frames++;
    if (root?.hasAttribute("data-ultra-mode") || root?.hasAttribute("data-ultra-motion")) {
      if (audit.enabledFrames.length < 10) audit.enabledFrames.push(performance.now());
    }
    if (audit.frames < 1800) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

async function settleRoute(page, path) {
  await page.goto(new URL(path, base).href, { waitUntil: "load" });
  await page.waitForFunction(
    () =>
      document.querySelector("main") &&
      document.documentElement.hasAttribute("data-press-ready") &&
      !document.querySelector(".load-gate") &&
      !document.documentElement.hasAttribute("data-loading") &&
      !document.documentElement.hasAttribute("data-route-scroll-settling"),
    null,
    { timeout: 30000 },
  );
  await page.evaluate(() => document.fonts.ready);
  await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(300);
}

async function assertRetired(page, requests, contextLabel) {
  const state = await page.evaluate(() => ({
    attributes: [...document.documentElement.attributes]
      .filter(({ name }) => name.startsWith("data-ultra-"))
      .map(({ name, value }) => ({ name, value })),
    mode: localStorage.getItem("dw-ultra-mode-v1"),
    quality: localStorage.getItem("dw-ultra-quality-v1"),
    feature: localStorage.getItem("deception-world.gallery-feature.v1"),
    favorites: JSON.parse(localStorage.getItem("deception-world.gallery-favorites.v1")),
    activeLayers: document.querySelectorAll(".ultra-effects,.ultra-mode-setting,.ultra-mode-toggle")
      .length,
    styles: [...document.querySelectorAll('link[rel="stylesheet"]')].map((link) => link.href),
    frames: window.__retiredUltraAudit,
  }));
  assert.deepEqual(state.attributes, [], `${contextLabel}: no Ultra root flags`);
  assert.equal(state.mode, null, `${contextLabel}: retired mode removed`);
  assert.equal(state.quality, null, `${contextLabel}: retired quality removed`);
  assert.equal(state.feature, "g10", `${contextLabel}: personal featured artwork retained`);
  assert.deepEqual(state.favorites, ["g10", "g19"], `${contextLabel}: favorites retained`);
  assert.equal(state.activeLayers, 0, `${contextLabel}: no renderer/control DOM`);
  assert.ok(state.frames.frames > 0);
  assert.deepEqual(state.frames.enabledFrames, [], `${contextLabel}: no enabled painted frame`);
  const retiredRequests = requests.filter(forbiddenAsset);
  assert.deepEqual(retiredRequests, [], `${contextLabel}: no retired Ultra asset requests`);
  assert.deepEqual(state.styles.filter(forbiddenAsset), [], `${contextLabel}: no Ultra stylesheet`);
  return state;
}

async function settleMenuVisual(page, open) {
  // The root data flag tracks semantic state, not the end of the sheet's
  // 0.42s slide or its staggered tile fades. Observe their real completion;
  // do not freeze the page's ongoing decorative animation for screenshots.
  await page.waitForFunction((expectedOpen) => {
    const panel = document.querySelector("#site-side-panel");
    const scrim = document.querySelector(".side-panel-scrim");
    if (!panel || !scrim || panel.dataset.open !== String(expectedOpen)) return false;
    const finiteMotionActive = [panel, scrim].some((element) =>
      element
        .getAnimations({ subtree: true })
        .some(
          (animation) =>
            animation.playState === "running" &&
            Number.isFinite(animation.effect?.getComputedTiming().endTime),
        ),
    );
    if (finiteMotionActive) return false;
    const panelStyle = getComputedStyle(panel);
    const scrimStyle = getComputedStyle(scrim);
    if (!expectedOpen)
      return panelStyle.visibility === "hidden" && Number(scrimStyle.opacity) <= 0.01;
    return (
      panelStyle.visibility === "visible" &&
      Number(panelStyle.opacity) >= 0.99 &&
      Number(scrimStyle.opacity) >= 0.99 &&
      [...panel.querySelectorAll(".side-panel-group")].every(
        (group) => Number(getComputedStyle(group).opacity) >= 0.99,
      )
    );
  }, open);
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
}

async function checkMenu(page, profile, path, capture = true) {
  await page.locator(".side-panel-trigger").first().click();
  const panel = page.locator('#site-side-panel[data-open="true"]');
  await panel.waitFor({ state: "visible" });
  assert.equal(await panel.locator(".ultra-mode-setting,.ultra-mode-toggle").count(), 0);
  assert.equal(await panel.getByRole("switch", { name: "ウルトラモード", exact: true }).count(), 0);
  assert.equal(await panel.getByText("ウルトラモード", { exact: true }).count(), 0);
  // Keep other settings and native navigation usable after removal.
  assert.ok((await panel.locator('a[href="/gallery"]').count()) > 0);
  await settleMenuVisual(page, true);
  if (capture)
    await page.screenshot({ path: join(output, `${profile}-${path.slice(1)}-menu.png`) });
  await panel.locator(".side-panel-close").click();
  await page.waitForFunction(() => !document.documentElement.hasAttribute("data-side-menu-open"));
  await settleMenuVisual(page, false);
}

async function captureGalleryFeature(page, profile) {
  await page.waitForFunction(
    () =>
      document.querySelector(".gallery-feature figcaption > span")?.textContent?.trim() === "010",
  );
  assert.equal(await page.locator(".gallery-feature .exhibition-studio").count(), 0);
  const feature = page.locator(".gallery-feature-open");
  const featureImage = await feature.locator("img").evaluate(async (image) => {
    await image.decode();
    return {
      currentSrc: image.currentSrc,
      width: image.naturalWidth,
      height: image.naturalHeight,
      href: image.parentElement.href,
    };
  });
  assert.ok(featureImage.width > 0 && featureImage.height > 0);
  await page.screenshot({ path: join(output, `${profile}-gallery-feature.png`) });
  return featureImage;
}

async function checkGallery(page, profile) {
  const featureImage = await captureGalleryFeature(page, profile);
  assert.equal(
    await page
      .locator('[data-gallery-artwork="g19"] .gallery-favorite-toggle')
      .getAttribute("aria-pressed"),
    "true",
  );
  const work = page.locator('[data-gallery-artwork="g25"] .gallery-work-open');
  await work.evaluate((node) => node.scrollIntoView({ block: "center", behavior: "instant" }));
  await page.waitForTimeout(300);
  const before = await page.evaluate(() => scrollY);
  assert.ok(before > 500, "test opens from a genuinely scrolled grid");
  await work.click();
  const viewer = page.locator("#gallery-viewer[open]");
  await viewer.waitFor({ state: "visible" });
  await viewer.locator(".gallery-close-primary").click();
  await page.waitForFunction(() => !document.querySelector("#gallery-viewer[open]"));
  await page.waitForTimeout(300);
  const after = await page.evaluate(() => scrollY);
  assert.ok(
    Math.abs(after - before) <= 4,
    `gallery close restores position: ${before} -> ${after}`,
  );
  await page.reload({ waitUntil: "load" });
  await page.waitForFunction(
    () =>
      document.querySelector(".gallery-feature figcaption > span")?.textContent?.trim() === "010",
  );
  assert.equal(
    await page
      .locator('[data-gallery-artwork="g19"] .gallery-favorite-toggle')
      .getAttribute("aria-pressed"),
    "true",
  );
  return { featureImage, before, after, personalSettingsPersistedAcrossReload: true };
}

const browser = await chromium.launch({ channel: "chrome" });
try {
  const selectedProfiles = visualOnly
    ? profiles.filter(({ name }) => name === "narrow320" || name === "ipad1024")
    : profiles;
  for (const { name, ...options } of selectedProfiles) {
    const context = await browser.newContext({ ...options, reducedMotion: "no-preference" });
    await context.addInitScript(seedAndWatch);
    const page = await context.newPage();
    const requests = [],
      errors = [],
      writes = [];
    page.on("request", (request) => {
      requests.push(request.url());
      if (
        new URL(request.url()).pathname.startsWith("/api/gallery") &&
        !["GET", "HEAD", "OPTIONS"].includes(request.method())
      )
        writes.push(request.method());
    });
    page.on("pageerror", (error) => errors.push(String(error)));
    try {
      for (const path of paths) {
        if (
          visualOnly &&
          !(
            (name === "narrow320" && path === "/gallery") ||
            (name === "ipad1024" && path === "/world")
          )
        )
          continue;
        await settleRoute(page, path);
        const state = await assertRetired(page, requests, `${name}${path}`);
        await checkMenu(page, name, path, !visualOnly || path !== "/gallery");
        const gallery =
          path === "/gallery"
            ? visualOnly
              ? { featureImage: await captureGalleryFeature(page, name) }
              : await checkGallery(page, name)
            : undefined;
        await assertRetired(page, requests, `${name}${path}: after interaction`);
        assert.deepEqual(errors, [], `${name}${path}: no page errors`);
        assert.deepEqual(writes, [], `${name}${path}: read-only gallery verification`);
        const result = {
          profile: name,
          path,
          status: "PASS",
          retiredFramesChecked: state.frames.frames,
          gallery,
        };
        report.results.push(result);
        await save();
        console.log(JSON.stringify(result));
      }
    } finally {
      await context.close();
    }
  }

  // Independent room is not the retired site-wide mode. Test its explicit
  // route at normal fixed quality, then its accessible original-image fallback.
  for (const reducedMotion of visualOnly ? [] : ["no-preference", "reduce"]) {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      reducedMotion,
    });
    await context.addInitScript(seedAndWatch);
    const page = await context.newPage();
    const requests = [],
      errors = [];
    page.on("request", (request) => requests.push(request.url()));
    page.on("pageerror", (error) => errors.push(String(error)));
    try {
      await settleRoute(page, "/exhibition?work=g10");
      const original = page.locator(".exhibition-room-source");
      await original.evaluate(async (image) => image.decode());
      let room;
      if (reducedMotion === "reduce") {
        assert.equal(await page.locator(".exhibition-studio-canvas").count(), 0);
        assert.equal(await page.locator(".exhibition-studio-tools").count(), 0);
        assert.ok(await original.isVisible());
        room = "accessible-original-fallback";
      } else {
        await page.waitForFunction(
          () =>
            document.querySelector('.exhibition-studio-stage[data-studio-ready="true"]') ||
            document.querySelector(".exhibition-studio-notice"),
          null,
          { timeout: 30000 },
        );
        const stage = page.locator(".exhibition-studio-stage");
        if ((await stage.getAttribute("data-studio-ready")) === "true") {
          await page.getByRole("button", { name: "斜めから", exact: true }).click();
          await page.getByRole("button", { name: "正面", exact: true }).click();
          await page.getByRole("button", { name: "展示室全景", exact: true }).click();
          await page.getByRole("button", { name: "原画表示", exact: true }).click();
          assert.equal(await stage.getAttribute("data-studio-ready"), "false");
          await page.getByRole("button", { name: "展示空間に戻す", exact: true }).click();
          assert.equal(await stage.getAttribute("data-studio-ready"), "true");
          room = "live-independent-room";
        } else {
          assert.ok(await original.isVisible());
          room = "webgl-original-fallback";
        }
      }
      await assertRetired(page, requests, `exhibition:${reducedMotion}`);
      assert.deepEqual(errors, [], `exhibition:${reducedMotion}: no page errors`);
      await page.screenshot({ path: join(output, `exhibition-${reducedMotion}.png`) });
      const result = { path: "/exhibition", reducedMotion, status: "PASS", room };
      report.results.push(result);
      await save();
      console.log(JSON.stringify(result));
    } finally {
      await context.close();
    }
  }
} finally {
  await save();
  await browser.close();
}
console.log(
  JSON.stringify({
    status: "PASS",
    results: report.results.length,
    output: reportFile,
  }),
);
