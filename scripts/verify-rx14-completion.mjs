import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright";

const base = process.env.BASE_URL || "http://127.0.0.1:8134";
const out = process.env.AUDIT_OUT || "/private/tmp/rx14-completion";
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ channel: "chrome" });
const report = [];
const profiles = [
  { width: 320, height: 640 },
  { width: 390, height: 844 },
  { width: 1024, height: 1366 },
  { width: 1280, height: 800 },
  { width: 1440, height: 900 },
];
const routes = [
  "/world",
  "/dream-chapter",
  "/riders/leddic",
  "/library",
  "/search",
  "/download",
  "/no-such-record",
];
const ready = (page) =>
  page.waitForFunction(
    () =>
      document.documentElement.dataset.family &&
      !document.documentElement.hasAttribute("data-loading") &&
      !document.documentElement.hasAttribute("data-route-cover") &&
      !document.documentElement.hasAttribute("data-route-scroll-settling"),
  );
const shot = async (page, label) => {
  // naturalWidth only proves delivery, not that an async bitmap has reached
  // the compositor. Decode the visible art before recording visual evidence.
  await page.evaluate(async () => {
    const visible = [...document.images].filter((image) => {
      const rect = image.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 && rect.top < innerHeight && rect.bottom > 0;
    });
    await Promise.all(visible.map((image) => image.decode().catch(() => {})));
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
  await page.screenshot({ path: `${out}/${label}.png` });
};
const settleMotion = (locator, subtree = false) =>
  locator.evaluate(
    (node, subtree) =>
      Promise.all(
        node
          .getAnimations({ subtree })
          .filter((animation) => animation.effect?.getComputedTiming().endTime !== Infinity)
          .map((animation) => animation.finished.catch(() => {})),
      ),
    subtree,
  );
try {
  for (const viewport of profiles) {
    const context = await browser.newContext({ viewport, hasTouch: true });
    const page = await context.newPage();
    const errors = [];
    const missing = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("response", (response) => {
      if (
        response.status() >= 400 &&
        response.request().resourceType() !== "document" &&
        new URL(response.url()).origin === new URL(base).origin
      )
        missing.push(response.url());
    });
    for (const route of routes) {
      await page.goto(new URL(route, base).href, { waitUntil: "domcontentloaded" });
      await ready(page);
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(280);
      const geometry = await page.evaluate(() => {
        const header = document.querySelector(
          ".topbar,.manager-topbar,.dream-site-header,.library-topbar,.search-topbar",
        );
        const rect = header?.getBoundingClientRect();
        return {
          overflow: document.documentElement.scrollWidth - innerWidth,
          bar: rect ? { top: rect.top, height: rect.height, right: rect.right } : null,
          gutter: header ? getComputedStyle(header).paddingLeft : null,
        };
      });
      assert.ok(
        geometry.overflow <= 1,
        `${viewport.width} ${route}: overflow ${geometry.overflow}`,
      );
      if (geometry.bar) {
        assert.ok(
          geometry.bar.height >= (viewport.width <= 760 ? 64 : 76),
          `${route}: command-bar lane`,
        );
        assert.ok(geometry.bar.right <= viewport.width + 1, `${route}: command bar overflow`);
      }
      if (route === "/world") {
        const poster = await page
          .locator(".hero-backdrop-current img")
          .evaluate((image) => ({ src: image.currentSrc, set: image.srcset }));
        assert.ok(
          poster.src.includes("deception-world-poster-delivery-640.webp"),
          `fresh responsive poster: ${poster.src}`,
        );
        assert.ok(poster.set.includes("720w") && poster.set.includes("1024w"));
        if (viewport.width === 1024) {
          const heroMin = await page
            .locator(".hero")
            .evaluate((node) => getComputedStyle(node).minHeight);
          assert.equal(heroMin, "0px", "portrait tablet removes the artificial hero floor");
        }
        await page.getByRole("button", { name: "メニューを開く", exact: true }).click();
        const menu = page.locator(".side-panel[data-open='true']");
        await menu.waitFor();
        await settleMotion(menu);
        assert.equal(await menu.locator(".side-panel-rikuei a").count(), 6);
        assert.equal(
          await menu.locator(".side-panel-related a").count(),
          3,
          "Ciel unlock remains intact",
        );
        assert.equal(await menu.locator(".side-panel-files img").count(), 9);
        await shot(page, `${viewport.width}-world-menu`);
        await page.keyboard.press("Escape");
        await page.waitForFunction(
          () => !document.documentElement.hasAttribute("data-side-menu-open"),
        );
        await settleMotion(page.locator(".side-panel"));
      }
      if (route === "/no-such-record") {
        assert.equal(await page.locator(".recovery-tiles a").count(), 3);
        assert.match(await page.title(), /404|見つかりません|見つかりませんでした/);
        await settleMotion(page.locator(".app-not-found"), true);
      }
      await shot(page, `${viewport.width}-${route.slice(1).replaceAll("/", "-")}`);
      report.push({ viewport, route, ...geometry });
    }
    // A file menu repeats the dossier's real chapter list and opens at the
    // active file's group, while Ciel remains available on his own route.
    await page.goto(`${base}/managers/zeus`, { waitUntil: "domcontentloaded" });
    await ready(page);
    const chapterRows = page.locator(".dossier-reader-links > a[href^='#']");
    assert.ok((await chapterRows.count()) >= 2);
    await page.getByRole("button", { name: "メニューを開く", exact: true }).click();
    await page.locator(".side-panel[data-open='true']").waitFor();
    await settleMotion(page.locator(".side-panel"));
    const menuChapters = page.locator(".side-panel-links > a[href^='/managers/zeus#']");
    assert.equal(await menuChapters.count(), await chapterRows.count());
    const group = await page.locator(".side-panel-rikuei").evaluate((node) => {
      const current = node.querySelector('[aria-current="page"]');
      const row = current.getBoundingClientRect();
      const panel = node.closest(".side-panel").getBoundingClientRect();
      return {
        row: { top: row.top, bottom: row.bottom },
        panel: { top: panel.top, bottom: panel.bottom },
      };
    });
    assert.ok(
      group.row.bottom > group.panel.top && group.row.top < group.panel.bottom,
      "menu's current file is in view",
    );
    await shot(page, `${viewport.width}-zeus-menu`);
    await page.keyboard.press("Escape");
    // Pointer search arrivals show the actual matching profile and move
    // focus there, rather than to BODY or to a hidden member of the roster.
    await page.goto(`${base}/search?q=${encodeURIComponent("博麗霊夢")}`, {
      waitUntil: "domcontentloaded",
    });
    await ready(page);
    const hit = page.locator('a[role="option"][href="/dream-chapter#dream-roster-reimu"]');
    await hit.waitFor();
    await hit.click();
    await page.waitForFunction(() => document.activeElement?.id === "dream-roster-reimu");
    assert.equal(
      await page
        .locator('.dream-roster-switch[aria-controls="dream-roster-reimu-profile"]')
        .getAttribute("aria-expanded"),
      "true",
    );
    assert.equal(await page.locator("#dream-roster-reimu").getAttribute("data-skip-mark"), "true");
    await shot(page, `${viewport.width}-search-arrival`);
    await page.waitForTimeout(2500);
    assert.equal(await page.locator("#dream-roster-reimu").getAttribute("data-skip-mark"), null);
    assert.deepEqual(errors, [], `${viewport.width}: browser errors`);
    assert.deepEqual(missing, [], `${viewport.width}: missing delivery files`);
    console.log(
      `${viewport.width}: menu files, chapter rows, command bars, responsive images, 404 and search arrival passed`,
    );
    await context.close();
  }
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await page.goto(`${base}/world`, { waitUntil: "domcontentloaded" });
  await ready(page);
  await page
    .locator("#world-brief")
    .evaluate((node) => node.scrollIntoView({ block: "start", behavior: "instant" }));
  await page.waitForFunction(
    () => document.querySelector(".wa-brief-art .is-current")?.naturalWidth > 0,
  );
  assert.equal(await page.locator(".wa-brief-art").getAttribute("aria-hidden"), "true");
  assert.equal(
    await page.locator(".wa-brief-art").evaluate((node) => getComputedStyle(node).position),
    "sticky",
  );
  await settleMotion(page.locator(".wa-brief-art"), true);
  await shot(page, "1440-world-reading-stage");
  await page
    .locator(".wa-person.is-none")
    .first()
    .evaluate((node) => node.scrollIntoView({ block: "center", behavior: "instant" }));
  assert.equal(await page.locator(".wa-person.is-none img").count(), 0);
  // Owner (2026-10-23): 不要なセカンダリラベルを削除（レイアウトで説明） — the sealed plate
  // carries the vacancy itself; its NO FILE chip is gone.
  assert.doesNotMatch(await page.locator(".wa-person.is-none .is-vacant").first().innerText(), /NO FILE/);
  await shot(page, "1440-world-azato");
  await page.goto(`${base}/riders/saga`, { waitUntil: "domcontentloaded" });
  await ready(page);
  const pickups = await page
    .locator(".form-pickup-visual img")
    .evaluateAll((images) =>
      images.map((image) => ({ loading: image.loading, priority: image.fetchPriority })),
    );
  assert.equal(pickups.length, 2);
  for (const image of pickups) assert.deepEqual(image, { loading: "lazy", priority: "auto" });
  await page.goto(`${base}/characters/ciel`, { waitUntil: "domcontentloaded" });
  await ready(page);
  const cielPickups = await page
    .locator(".form-pickup-visual img")
    .evaluateAll((images) =>
      images.map((image) => ({ loading: image.loading, priority: image.fetchPriority })),
    );
  assert.ok(cielPickups.length > 0);
  for (const image of cielPickups) assert.deepEqual(image, { loading: "lazy", priority: "auto" });
  await page.getByRole("button", { name: "メニューを開く", exact: true }).click();
  await page.locator(".side-panel[data-open='true']").waitFor();
  await settleMotion(page.locator(".side-panel"));
  assert.equal(await page.locator(".side-panel-related a").count(), 4);
  assert.equal(
    await page
      .locator(".side-panel-related a[href='/characters/ciel']")
      .getAttribute("aria-current"),
    "page",
  );
  await context.close();
  // A tall block can enter a short landscape viewport without ever reaching
  // a ten-percent intersection ratio. Grow only these test DOM elements to
  // check the pixel-entry contract without changing source content.
  for (const route of ["/rexonance-saga", "/extreme-saga", "/final-stage"]) {
    const landscape = await browser.newContext({ viewport: { width: 568, height: 320 } });
    await landscape.addInitScript(() => {
      const selector = ".rxs-comparison.rxs-reveal,.fst-story-layout.rxs-reveal";
      const NativeObserver = window.IntersectionObserver;
      window.__rx14RevealEntries = [];
      window.IntersectionObserver = class extends NativeObserver {
        constructor(callback, options) {
          super((entries, observer) => {
            for (const entry of entries) {
              if (entry.target.matches(selector) && entry.isIntersecting) {
                window.__rx14RevealEntries.push({
                  ratio: entry.intersectionRatio,
                  threshold: options?.threshold,
                });
              }
            }
            callback(entries, observer);
          }, options);
        }
        observe(target) {
          if (target.matches(selector)) target.style.minHeight = "20000px";
          super.observe(target);
        }
      };
    });
    const screen = await landscape.newPage();
    await screen.goto(`${base}${route}`, { waitUntil: "domcontentloaded" });
    await ready(screen);
    const block = screen.locator(".rxs-comparison.rxs-reveal,.fst-story-layout.rxs-reveal").first();
    await block.evaluate((node) =>
      window.scrollTo({
        top: scrollY + node.getBoundingClientRect().top - 250,
        behavior: "instant",
      }),
    );
    await screen.waitForFunction(() => window.__rx14RevealEntries.length > 0);
    await screen.waitForFunction(() =>
      document
        .querySelector(".rxs-comparison.rxs-reveal,.fst-story-layout.rxs-reveal")
        ?.classList.contains("is-visible"),
    );
    const entry = await screen.evaluate(() => window.__rx14RevealEntries[0]);
    assert.equal(entry.threshold, 0, `${route}: pixel-entry observer`);
    assert.ok(
      entry.ratio > 0 && entry.ratio < 0.08,
      `${route}: below the former ratio gate ${entry.ratio}`,
    );
    report.push({ route, viewport: { width: 568, height: 320 }, tallReveal: entry });
    console.log(`${route}: short landscape reveals a tall block at ratio ${entry.ratio}`);
    await landscape.close();
  }
} finally {
  await writeFile(`${out}/report.json`, JSON.stringify(report, null, 2));
  await browser.close();
}
