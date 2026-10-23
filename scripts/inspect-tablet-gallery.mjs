import { chromium, webkit } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const base = (process.env.BASE_URL ?? "http://127.0.0.1:8272").replace(/\/$/, "");
const output = resolve(process.env.AUDIT_OUT ?? "output/playwright/tablet-baseline-luna");
const engineName = process.env.PW_ENGINE === "webkit" ? "webkit" : "chromium";
const sizes = [
  { name: "720x540", width: 720, height: 540 },
  { name: "900x600", width: 900, height: 600 },
  { name: "1024x768", width: 1024, height: 768 },
  { name: "1024x1366", width: 1024, height: 1366 },
  { name: "639x834", width: 639, height: 834 },
  { name: "390x844", width: 390, height: 844 },
];

await mkdir(output, { recursive: true });
const browser =
  engineName === "webkit"
    ? await webkit.launch({ headless: true })
    : await chromium.launch({ channel: "chrome", headless: true });
const results = [];

async function box(locator) {
  return locator
    .evaluate((el) => {
      const r = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      return {
        x: Math.round(r.x),
        y: Math.round(r.y),
        width: Math.round(r.width),
        height: Math.round(r.height),
        minWidth: style.minWidth,
        minHeight: style.minHeight,
        scrollWidth: el.scrollWidth,
        scrollHeight: el.scrollHeight,
        clientWidth: el.clientWidth,
        clientHeight: el.clientHeight,
      };
    })
    .catch(() => null);
}

for (const size of sizes) {
  const context = await browser.newContext({
    viewport: { width: size.width, height: size.height },
    screen: { width: size.width, height: size.height },
    deviceScaleFactor: 1,
    isMobile: true,
    hasTouch: true,
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  const http = [];
  const jsErrors = [];
  const failedRequests = [];
  page.on("response", (response) => {
    if (response.status() >= 400) http.push({ status: response.status(), url: response.url() });
  });
  page.on("pageerror", (error) => jsErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") jsErrors.push(message.text());
  });
  page.on("requestfailed", (request) =>
    failedRequests.push({ url: request.url(), error: request.failure()?.errorText }),
  );

  const response = await page.goto(`${base}/gallery`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1600);
  const start = await page.evaluate(() => ({
    title: document.title,
    viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio },
    touchPoints: navigator.maxTouchPoints,
    gallery: Boolean(document.querySelector("[data-gallery-page='true']")),
    curtain:
      document.querySelector(".gallery-arrival [role='status']")?.getAttribute("aria-label") ??
      null,
    visibleButtons: [...document.querySelectorAll("button")]
      .filter((b) => b.getClientRects().length)
      .slice(0, 30)
      .map((b) => (b.innerText || b.getAttribute("aria-label") || "").trim()),
    scroll: {
      width: document.documentElement.scrollWidth,
      height: document.documentElement.scrollHeight,
    },
  }));

  // Let the existing arrival curtain finish through the page's normal lifecycle.
  await page
    .waitForFunction(() => !document.querySelector(".gallery-arrival"), null, { timeout: 12000 })
    .catch(() => {});
  await page.screenshot({ path: resolve(output, `${size.name}-gallery.png`), fullPage: true });
  const galleryMeasure = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
    bodyScrollWidth: document.body.scrollWidth,
    cards: document.querySelectorAll(".gallery-work").length,
    grid: (() => {
      const e = document.querySelector(".gallery-grid");
      if (!e) return null;
      const r = e.getBoundingClientRect();
      return { x: Math.round(r.x), width: Math.round(r.width), height: Math.round(r.height) };
    })(),
  }));

  // Open an artwork by tapping the first item, then measure lightbox geometry.
  const firstWork = page.locator(".gallery-work-open").first();
  await firstWork.scrollIntoViewIfNeeded().catch(() => {});
  await firstWork.tap({ timeout: 5000 }).catch(async () => firstWork.click({ timeout: 5000 }));
  await page
    .locator(".gallery-viewer[open]")
    .waitFor({ timeout: 5000 })
    .catch(() => {});
  await page.waitForTimeout(250);
  const viewer = {
    dialog: await box(page.locator(".gallery-viewer")),
    header: await box(page.locator(".gallery-viewer-header")),
    footer: await box(page.locator(".gallery-viewer-footer")),
    stage: await box(page.locator(".gallery-viewer-stage")),
    viewport: await box(page.locator(".gallery-image-viewport")),
    close: await box(page.locator(".gallery-close-primary")),
    navButtons: await page
      .locator(".gallery-viewer-footer button")
      .evaluateAll((els) =>
        els.map((el) => {
          const r = el.getBoundingClientRect();
          return {
            text: (el.innerText || "").trim(),
            width: Math.round(r.width),
            height: Math.round(r.height),
          };
        }),
      )
      .catch(() => []),
    zoom: await box(page.locator(".gallery-image-toolbar button")),
    image: await page
      .locator(".gallery-image-viewport img")
      .first()
      .evaluate((img) => ({
        width: Math.round(img.getBoundingClientRect().width),
        height: Math.round(img.getBoundingClientRect().height),
        naturalWidth: img.naturalWidth,
        naturalHeight: img.naturalHeight,
        complete: img.complete,
      }))
      .catch(() => null),
  };
  await page.screenshot({ path: resolve(output, `${size.name}-viewer.png`) });

  // Open settings by native details/summary interaction; no editing or save.
  const settings = page.locator(".gallery-viewer-tools summary");
  await settings.tap().catch(async () => settings.click());
  await page.waitForTimeout(120);
  const settingsOpen = await page.locator(".gallery-viewer-tools").getAttribute("open");
  const titleEditorState = await page.locator(".gallery-title-editor").count();
  await page.screenshot({ path: resolve(output, `${size.name}-viewer-settings.png`) });
  await page
    .locator(".gallery-viewer")
    .press("Escape")
    .catch(() => {});
  await page.waitForTimeout(150);

  // Open and close the site's side menu using its actual trigger.
  const menuTrigger = page.locator(".side-panel-trigger").first();
  const menuPresent = await menuTrigger.count();
  if (menuPresent) await menuTrigger.tap().catch(async () => menuTrigger.click());
  await page.waitForTimeout(180);
  const menu = await page.evaluate(() => {
    const candidates = [
      ...document.querySelectorAll("[role='dialog'], .side-panel, .side-menu, [data-side-menu]"),
    ].filter((el) => el.getClientRects().length);
    return candidates.map((el) => {
      const r = el.getBoundingClientRect();
      const scrollables = [el, ...el.querySelectorAll("*")].filter((node) => {
        const cs = getComputedStyle(node);
        return node.scrollHeight > node.clientHeight + 2 && /(auto|scroll)/.test(cs.overflowY);
      });
      return {
        className: el.className?.toString?.() ?? "",
        role: el.getAttribute("role"),
        rect: {
          x: Math.round(r.x),
          y: Math.round(r.y),
          width: Math.round(r.width),
          height: Math.round(r.height),
        },
        scrollables: scrollables.map((node) => ({
          className: node.className?.toString?.() ?? "",
          clientHeight: node.clientHeight,
          scrollHeight: node.scrollHeight,
          scrollTop: node.scrollTop,
          lastText: (node.innerText || "").trim().slice(-180),
        })),
      };
    });
  });
  await page.screenshot({ path: resolve(output, `${size.name}-menu.png`), fullPage: false });
  const menuScrollTest = await page.evaluate(() => {
    const nodes = [
      ...document.querySelectorAll(
        "[role='dialog'], .side-panel, .side-menu, [data-side-menu], body *",
      ),
    ].filter(
      (node) =>
        node.getClientRects().length &&
        node.scrollHeight > node.clientHeight + 2 &&
        /(auto|scroll)/.test(getComputedStyle(node).overflowY),
    );
    const node = nodes.sort((a, b) => b.scrollHeight - a.scrollHeight)[0];
    if (!node) return { found: false };
    node.scrollTop = node.scrollHeight;
    return {
      found: true,
      className: node.className?.toString?.() ?? "",
      clientHeight: node.clientHeight,
      scrollHeight: node.scrollHeight,
      scrollTopAfter: node.scrollTop,
      atBottom: node.scrollTop + node.clientHeight >= node.scrollHeight - 2,
      lastText: (node.innerText || "").trim().slice(-220),
    };
  });
  if (menuPresent) {
    await page.keyboard.press("Escape").catch(() => {});
    if ((await menuTrigger.getAttribute("aria-expanded")) === "true")
      await menuTrigger.tap().catch(async () => menuTrigger.click());
  }
  const menuStateAfterClose = menuPresent ? await menuTrigger.getAttribute("aria-expanded") : null;

  results.push({
    viewport: size,
    httpStatus: response?.status() ?? null,
    start,
    gallery: galleryMeasure,
    viewer,
    settingsOpened: settingsOpen !== null,
    editorPresentWithoutEdit: titleEditorState,
    menuTriggerFound: Boolean(menuPresent),
    menuOpened: menuPresent ? menu?.length > 0 : false,
    menuStateAfterClose,
    menu,
    menuScrollTest,
    errors: { http, jsErrors, failedRequests },
  });
  await context.close();
}

await writeFile(resolve(output, "results.json"), `${JSON.stringify(results, null, 2)}\n`);
await browser.close();
console.log(JSON.stringify({ output, results }, null, 2));
