// BASE_URL=http://127.0.0.1:8273 PW_ENGINE=chrome|webkit|all
// PW_MODES=normal,reduced PW_FLOWS=menu,ciel,dream,gallery AUDIT_OUT=output/playwright/tablet-fold-navigation
// PW_IPAD=1 opts into the existing Macintosh+touch/installed-app branches.
// That user-agent/standalone fixture verifies code paths, not physical iPad Safari.
// This exercises viewport changes in one touch-capable context. It does not
// identify physical hardware. Native rail gestures belong to
// verify-rider-hold-navigation.mjs / verify-rail-work.mjs (220ms contract).
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium, webkit } from "playwright";
import { checkedUrl } from "./browser-guard.mjs";

const base = checkedUrl(process.env.BASE_URL || "http://127.0.0.1:8273");
const output = resolve(process.env.AUDIT_OUT || "output/playwright/tablet-fold-navigation");
const requestedEngine = process.env.PW_ENGINE || "chrome";
const ipadFixture = process.env.PW_IPAD === "1";
// Same desktop-style Safari identity used by verify-opening-installed.mjs.
const ipadUserAgent =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15 Version/27.2 Mobile/15E148 Safari/604.1";
assert.ok(["chrome", "chromium", "webkit", "all"].includes(requestedEngine));
const engines = requestedEngine === "all" ? ["chrome", "webkit"] : [requestedEngine];
const modes = (process.env.PW_MODES || process.env.PW_MODE || "normal,reduced").split(",");
const requestedFlows = (process.env.PW_FLOWS || "menu,ciel,dream,gallery").split(",");
assert.ok(modes.every((mode) => ["normal", "reduced"].includes(mode)));
assert.ok(requestedFlows.every((flow) => ["menu", "ciel", "dream", "gallery"].includes(flow)));
const viewports = [
  { width: 390, height: 844 },
  { width: 900, height: 600 },
  { width: 639, height: 834 },
  { width: 1024, height: 768 },
  { width: 1024, height: 1366 },
];
// 2px allows fractional layout rounding; return checks use the originating
// control's visibility and focus after reflow, never equality of scrollY.
const tolerance = { overflowPx: 2, viewportEdgePx: 2, minimumScrollPx: 8 };
const report = {
  base,
  viewports,
  tolerance,
  ipadFixture,
  emulation: ipadFixture
    ? "viewport resize; Macintosh UA; maxTouchPoints=5; standalone=true; branch fixture only"
    : "viewport resize; hasTouch=true; default browser UA",
  checks: [],
};
await mkdir(output, { recursive: true });

async function settle(page) {
  await page.waitForFunction(
    () => {
      const html = document.documentElement;
      if (html.hasAttribute("data-loading") || html.hasAttribute("data-route-scroll-settling"))
        return false;
      if (document.fonts.status !== "loaded") return false;
      const key = [
        innerWidth,
        innerHeight,
        scrollY,
        html.scrollHeight,
        ...[".side-panel", ".dream-reading-scroll", "#gallery-viewer"].map((selector) => {
          const node = document.querySelector(selector);
          const box = node?.getBoundingClientRect();
          return box ? [box.x, box.y, box.width, box.height, node.scrollTop].join(":") : "";
        }),
      ].join("|");
      const previous = window.__tabletNavigationSettle;
      window.__tabletNavigationSettle = {
        key,
        count: previous?.key === key ? previous.count + 1 : 0,
      };
      return window.__tabletNavigationSettle.count >= 3;
    },
    undefined,
    { polling: 100, timeout: 15000 },
  );
}

async function ready(page, path, selector) {
  await page.setViewportSize(viewports[0]);
  await page.goto(new URL(path, base).href, { waitUntil: "load" });
  await page.waitForFunction((selector) => {
    const node = document.querySelector(selector);
    return node && Object.keys(node).some((key) => key.startsWith("__reactProps"));
  }, selector);
  await settle(page);
  if (ipadFixture) {
    assert.equal(await page.locator("html").getAttribute("data-ipad-viewport"), "contained");
    assert.equal(
      await page.locator("html").getAttribute("data-ipad-standalone-viewport"),
      "contained",
    );
    const viewports = await page
      .locator('meta[name="viewport"]')
      .evaluateAll((nodes) => nodes.map((node) => node.getAttribute("content")));
    assert.ok(
      viewports.length > 0 && viewports.every((content) => /viewport-fit=contain/.test(content)),
      `all hydrated viewport descriptors must reserve the native area: ${JSON.stringify(viewports)}`,
    );
    assert.equal(await page.evaluate(() => navigator.maxTouchPoints), 5);
    assert.equal(await page.locator("html").getAttribute("data-ipad-menu"), "compact");
  }
}

async function finiteMotion(locator) {
  await locator.evaluate((node) =>
    Promise.all(
      node
        .getAnimations({ subtree: true })
        .filter(
          (animation) =>
            animation.timeline === document.timeline &&
            animation.effect?.getTiming().iterations !== Infinity,
        )
        .map((animation) => animation.finished.catch(() => {})),
    ),
  );
}

async function fullyVisible(locator, label) {
  const box = await locator.evaluate((node) => {
    const rect = node.getBoundingClientRect();
    return {
      x: rect.x,
      y: rect.y,
      right: rect.right,
      bottom: rect.bottom,
      width: rect.width,
      height: rect.height,
      viewport: [innerWidth, innerHeight],
    };
  });
  assert.ok(
    box.width > 0 &&
      box.height > 0 &&
      box.x >= -tolerance.viewportEdgePx &&
      box.y >= -tolerance.viewportEdgePx &&
      box.right <= box.viewport[0] + tolerance.viewportEdgePx &&
      box.bottom <= box.viewport[1] + tolerance.viewportEdgePx,
    `${label}: ${JSON.stringify(box)}`,
  );
  return box;
}

async function noOverflow(page, label, selectors = []) {
  const metrics = await page.evaluate(
    (selectors) => ({
      document: document.documentElement.scrollWidth - innerWidth,
      elements: selectors.flatMap((selector) =>
        [...document.querySelectorAll(selector)]
          .filter((node) => node.getClientRects().length)
          .map((node) => ({
            selector,
            excess: node.scrollWidth - node.clientWidth,
            width: node.clientWidth,
          })),
      ),
    }),
    selectors,
  );
  assert.ok(metrics.document <= tolerance.overflowPx, `${label}: ${JSON.stringify(metrics)}`);
  for (const element of metrics.elements) {
    assert.ok(
      element.width > 0 && element.excess <= tolerance.overflowPx,
      `${label}: ${JSON.stringify(element)}`,
    );
  }
  return metrics;
}

async function unlocked(page) {
  await page.waitForFunction(() => {
    const html = document.documentElement;
    return (
      !["data-loading", "data-side-menu-open", "data-dialog-open", "data-rail-lock"].some((flag) =>
        html.hasAttribute(flag),
      ) &&
      !document.body.hasAttribute("data-gallery-viewer-lock") &&
      getComputedStyle(document.body).position !== "fixed" &&
      getComputedStyle(html).overflowY !== "hidden"
    );
  });
}

async function scrollDocument(page) {
  const previous = await page.evaluate(() => scrollY);
  await page.mouse.move(24, Math.round(page.viewportSize().height * 0.65));
  await page.mouse.wheel(0, 160);
  await page.waitForFunction(({ previous, minimum }) => Math.abs(scrollY - previous) > minimum, {
    previous,
    minimum: tolerance.minimumScrollPx,
  });
  await settle(page);
}

async function snapshot(page) {
  return page.evaluate(() => {
    const selectors = [
      ".side-panel-trigger",
      ".side-panel",
      ".side-panel-close",
      '.dossier-reader a[href="#dossier-index"]',
      ".dossier-contents",
      ".dossier-reader",
      ".manager-copy-section:target",
      ".dream-reading-entry button",
      ".dream-reading-room",
      ".dream-reading-scroll",
      '[data-room-paragraph="7"]',
      "#gallery-viewer",
      ".gallery-close-primary",
      '[data-tablet-navigation-origin="true"]',
    ];
    return {
      url: location.href,
      viewport: [innerWidth, innerHeight],
      scroll: [scrollX, scrollY],
      environment: {
        userAgent: navigator.userAgent,
        maxTouchPoints: navigator.maxTouchPoints,
        standalone: navigator.standalone,
      },
      html: Object.fromEntries(
        [...document.documentElement.attributes].map((a) => [a.name, a.value]),
      ),
      body: {
        style: document.body.getAttribute("style"),
        overflow: getComputedStyle(document.body).overflow,
      },
      active: {
        tag: document.activeElement?.tagName,
        id: document.activeElement?.id,
        class: document.activeElement?.className,
        label: document.activeElement?.getAttribute("aria-label"),
      },
      room: {
        chapter: document.querySelector(".dream-reading-chapter-select select")?.value,
        paragraph: document.querySelector(".dream-reading-bottom progress")?.value,
      },
      elements: selectors.map((selector) => {
        const node = document.querySelector(selector);
        const rect = node?.getBoundingClientRect();
        return {
          selector,
          rect: rect?.toJSON(),
          scrollTop: node?.scrollTop,
          clientHeight: node?.clientHeight,
          scrollHeight: node?.scrollHeight,
          clientWidth: node?.clientWidth,
          scrollWidth: node?.scrollWidth,
        };
      }),
    };
  });
}

async function menu(page, add) {
  await ready(page, "/world#story", ".side-panel-trigger");
  const trigger = page.locator(".side-panel-trigger").first();
  // The existing menu intentionally blurs pointer activation; its keyboard
  // path owns focus restoration. Test that path in the touch-capable context.
  await trigger.focus();
  await trigger.press("Enter");
  await page.waitForFunction(() => document.querySelector(".side-panel")?.dataset.open === "true");
  const panel = page.locator('.side-panel[data-open="true"]');
  await finiteMotion(panel);
  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    await settle(page);
    await fullyVisible(panel.locator(".side-panel-close"), "resized menu close");
    assert.equal(
      await panel.evaluate((node) => node.contains(document.activeElement)),
      true,
      "menu retains focus containment on resize",
    );
    await noOverflow(page, "resized menu", [".side-panel"]);
    add({ viewport, open: true });
  }
  await panel.locator(".side-panel-close").press("Enter");
  await page.waitForFunction(() => document.querySelector(".side-panel")?.dataset.open === "false");
  await unlocked(page);
  assert.equal(await trigger.evaluate((node) => node === document.activeElement), true);
  await fullyVisible(trigger, "menu origin after close");
  await scrollDocument(page);
  await noOverflow(page, "World after menu unlock");
}

async function ciel(page, add) {
  // The 2026-10-23 label cleanup removed the hero's reading CTA. The
  // persistent dossier navigation and native chapter anchors remain the
  // supported reading path; hydrate via the actual menu event control.
  await ready(page, "/characters/ciel", ".manager-topbar .side-panel-trigger");
  const indexLink = page.locator('.dossier-reader a[href="#dossier-index"]');
  await indexLink.scrollIntoViewIfNeeded();
  await indexLink.click();
  await page.waitForFunction(() => location.hash === "#dossier-index");
  await settle(page);
  const chapters = page.locator(".dossier-contents a");
  assert.ok((await chapters.count()) >= 2, "Ciel has chapter destinations");
  for (const [index, viewport] of viewports.entries()) {
    await page.setViewportSize(viewport);
    await settle(page);
    const chapter = chapters.nth(index % (await chapters.count()));
    const href = await chapter.getAttribute("href");
    await chapter.scrollIntoViewIfNeeded();
    await chapter.click();
    await page.waitForFunction((hash) => location.hash === hash, href);
    await settle(page);
    const heading = page.locator(`${href} .manager-copy-heading`);
    await fullyVisible(heading, `Ciel chapter ${href}`);
    await noOverflow(page, "Ciel reading measure", [
      `${href} .manager-copy-body`,
      `${href} .manager-copy-heading`,
      ".manager-facts",
    ]);
    const header = await page.locator(".manager-topbar").boundingBox();
    const headingBox = await heading.boundingBox();
    assert.ok(
      headingBox.y >= header.y + header.height - tolerance.viewportEdgePx,
      "chapter heading clears the fixed header",
    );
    add({ viewport, chapter: href, heading: headingBox });
  }
  await unlocked(page);
  await scrollDocument(page);
}

async function dream(page, add) {
  await ready(page, "/dream-chapter", ".dream-reading-entry button");
  const trigger = page.locator(".dream-reading-entry button");
  await trigger.scrollIntoViewIfNeeded();
  await settle(page);
  const departure = await trigger.boundingBox();
  await trigger.click();
  const room = page.locator(".dream-reading-room[open]");
  await room.waitFor({ state: "visible" });
  await page.waitForFunction(
    () => document.activeElement?.getAttribute("aria-label") === "読書室を閉じる",
  );
  // Both controls address the same chapter; choose the one the actual layout exposes.
  const chapterSelect = room.locator(".dream-reading-chapter-select select");
  if (await chapterSelect.isVisible()) await chapterSelect.selectOption("5");
  else await room.locator(".dream-reading-chapters button").nth(5).click();
  const jump = async () => {
    const select = room.locator(".dream-reading-position-select select");
    if (await select.isVisible()) await select.selectOption("7");
    else await room.getByRole("button", { name: "7段落目へ移動", exact: true }).click();
    await page.waitForFunction(
      () => document.querySelector(".dream-reading-bottom progress")?.value === 7,
    );
    await settle(page);
  };
  await page.waitForFunction(
    () => document.querySelector(".dream-reading-chapter-select select")?.value === "5",
  );
  await jump();
  const scroller = room.locator(".dream-reading-scroll");
  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    await settle(page);
    assert.equal(await chapterSelect.inputValue(), "5", "CASE remains selected after resize");
    assert.equal(
      await room.locator("progress").getAttribute("value"),
      "7",
      "paragraph state survives resize",
    );
    await fullyVisible(
      room.getByRole("button", { name: "読書室を閉じる", exact: true }),
      "reading room close",
    );
    const reading = await scroller.evaluate((node) => {
      const box = node.getBoundingClientRect();
      const paragraph = node.querySelector('[data-room-paragraph="7"]').getBoundingClientRect();
      return {
        top: box.top,
        bottom: box.bottom,
        height: node.clientHeight,
        paragraphTop: paragraph.top,
        paragraphBottom: paragraph.bottom,
        scrollTop: node.scrollTop,
        documentY: scrollY,
      };
    });
    assert.ok(
      reading.height >= 120 &&
        reading.paragraphTop < reading.bottom - 2 &&
        reading.paragraphBottom > reading.top + 2,
      `current paragraph remains readable: ${JSON.stringify(reading)}`,
    );
    await noOverflow(page, "reading room after resize", [
      ".dream-reading-room",
      ".dream-reading-scroll",
    ]);
    await scroller.hover();
    await page.mouse.wheel(0, 100);
    await page.waitForFunction(
      ({ top, minimum }) =>
        Math.abs(document.querySelector(".dream-reading-scroll").scrollTop - top) > minimum,
      { top: reading.scrollTop, minimum: tolerance.minimumScrollPx },
    );
    assert.equal(
      await page.evaluate(() => scrollY),
      reading.documentY,
      "reading room scroll is independent of the locked document",
    );
    add({ viewport, reading });
    await jump();
  }
  await room.getByRole("button", { name: "読書室を閉じる", exact: true }).click();
  await room.waitFor({ state: "hidden" });
  await unlocked(page);
  assert.equal(await trigger.evaluate((node) => node === document.activeElement), true);
  const returned = await fullyVisible(trigger, "reading room origin after resize and close");
  add({ returned, departure, triggerDriftPx: returned.y - departure.y });
  await scrollDocument(page);
}

async function gallery(page, add) {
  await ready(page, "/gallery", ".gallery-work-open");
  const openers = page.locator("[data-gallery-artwork] .gallery-work-open");
  assert.ok((await openers.count()) >= 3, "built-in gallery contains adjacent works");
  const trigger = openers.nth(1);
  await trigger.evaluate((node) => {
    node.dataset.tabletNavigationOrigin = "true";
    node.scrollIntoView({ block: "center", behavior: "instant" });
  });
  await settle(page);
  const departure = await trigger.boundingBox();
  // The viewer likewise records whether the originating open was keyboard input.
  await trigger.focus();
  await trigger.press("Enter");
  const viewer = page.locator("#gallery-viewer[open]");
  await viewer.waitFor({ state: "visible" });
  const originalTitle = await viewer.locator("#gallery-viewer-title").innerText();
  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    await settle(page);
    await fullyVisible(viewer.locator(".gallery-close-primary"), "gallery close after resize");
    await noOverflow(page, "gallery viewer after resize", [
      "#gallery-viewer",
      ".gallery-viewer-header",
    ]);
    const next = viewer
      .locator(".gallery-viewer-footer")
      .getByRole("button", { name: "次の作品 →", exact: true });
    const previous = viewer
      .locator(".gallery-viewer-footer")
      .getByRole("button", { name: "← 前の作品", exact: true });
    assert.equal(await next.isDisabled(), false);
    await next.click();
    await page.waitForFunction(
      (title) => document.querySelector("#gallery-viewer-title")?.innerText !== title,
      originalTitle,
    );
    assert.equal(await previous.isDisabled(), false);
    await previous.click();
    await page.waitForFunction(
      (title) => document.querySelector("#gallery-viewer-title")?.innerText === title,
      originalTitle,
    );
    add({ viewport, restoredWork: originalTitle });
  }
  await viewer.locator(".gallery-close-primary").click();
  await viewer.waitFor({ state: "hidden" });
  await unlocked(page);
  await page.waitForFunction(() =>
    document.activeElement?.matches('[data-tablet-navigation-origin="true"]'),
  );
  await settle(page);
  const returned = await fullyVisible(trigger, "original artwork after viewer close");
  // Reflow can change the card height, but its opening edge should return
  // near the same screen position; a quarter-screen margin allows centring.
  const allowedDriftPx = Math.max(96, page.viewportSize().height * 0.25);
  assert.ok(
    Math.abs(returned.y - departure.y) <= allowedDriftPx,
    `gallery origin drift: ${JSON.stringify({ departure, returned, allowedDriftPx })}`,
  );
  add({ returned, departure, allowedDriftPx });
  await scrollDocument(page);
}

const flows = { menu, ciel, dream, gallery };
try {
  for (const engine of engines) {
    const browser = await (engine === "webkit" ? webkit : chromium).launch(
      engine === "webkit"
        ? process.env.PW_WEBKIT_EXECUTABLE
          ? { executablePath: process.env.PW_WEBKIT_EXECUTABLE }
          : {}
        : engine === "chromium"
          ? {}
          : { channel: "chrome" },
    );
    try {
      for (const mode of modes) {
        const context = await browser.newContext({
          viewport: viewports[0],
          hasTouch: true,
          reducedMotion: mode === "reduced" ? "reduce" : "no-preference",
          ...(ipadFixture ? { userAgent: ipadUserAgent } : {}),
        });
        if (ipadFixture) {
          await context.addInitScript(() => {
            Object.defineProperty(navigator, "maxTouchPoints", {
              configurable: true,
              get: () => 5,
            });
            Object.defineProperty(navigator, "standalone", { configurable: true, get: () => true });
          });
        }
        const page = await context.newPage();
        page.setDefaultTimeout(15000);
        const pageErrors = [];
        const mutations = [];
        const unavailableApi = [];
        page.on("pageerror", (error) => pageErrors.push(error.message));
        page.on("response", (response) => {
          if (response.status() === 503 && new URL(response.url()).pathname.startsWith("/api/"))
            unavailableApi.push(response.url());
        });
        await context.route("**/*", async (route) => {
          if (!["GET", "HEAD", "OPTIONS"].includes(route.request().method())) {
            mutations.push(`${route.request().method()} ${route.request().url()}`);
            await route.abort();
          } else await route.continue();
        });
        try {
          for (const flow of requestedFlows) {
            const label = `${engine}${ipadFixture ? "-ipad-fixture" : ""}-${mode}-${flow}`;
            const samples = [];
            try {
              await flows[flow](page, (sample) => samples.push(sample));
              assert.deepEqual(pageErrors, [], "uncaught page errors");
              assert.deepEqual(mutations, [], "flow performs no remote writes");
              report.checks.push({
                label,
                ok: true,
                samples,
                unavailableApi: [...new Set(unavailableApi)],
              });
              console.log(`PASS ${label}`);
            } catch (error) {
              const debug = {
                label,
                error: error.stack || String(error),
                pageErrors,
                mutations,
                unavailableApi: [...new Set(unavailableApi)],
                samples,
                state: await snapshot(page).catch((failure) => ({ error: String(failure) })),
              };
              await writeFile(
                resolve(output, `${label}-failure.json`),
                JSON.stringify(debug, null, 2),
              );
              await page
                .screenshot({ path: resolve(output, `${label}-failure.png`) })
                .catch(() => {});
              report.checks.push({ label, ok: false, error: String(error), samples });
              throw error;
            }
          }
        } finally {
          await context.close();
        }
      }
    } finally {
      await browser.close();
    }
  }
} finally {
  await writeFile(resolve(output, "report.json"), JSON.stringify(report, null, 2));
}
