import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";

const base = process.env.BASE_URL || "http://127.0.0.1:8260";
const out = process.env.AUDIT_OUT || "output/playwright/rexonance-audit94/baseline";
const browser = await chromium.launch({ channel: "chrome" });
await mkdir(out, { recursive: true });
const profiles = [
  { name: "desktop1440", width: 1440, height: 900 },
  { name: "tablet1024", width: 1024, height: 768, touch: true },
  { name: "phone390", width: 390, height: 844, touch: true },
  { name: "tablet-portrait", width: 768, height: 1024, touch: true },
  { name: "phone320", width: 320, height: 740, touch: true },
  { name: "wide1920", width: 1920, height: 1080 },
];
const only = process.env.AUDIT_PROFILES?.split(",");
const results = [];
const settle = async (page) => {
  await page.waitForFunction(
    () =>
      !document.documentElement.hasAttribute("data-loading") &&
      !document.documentElement.hasAttribute("data-route-scroll-settling"),
  );
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(1700);
};
async function measure(page) {
  return page.evaluate(() => {
    const rect = (el) => {
      const b = el.getBoundingClientRect();
      return {
        x: b.x,
        y: b.y,
        top: b.top + scrollY,
        width: b.width,
        height: b.height,
        right: b.right,
        bottom: b.bottom + scrollY,
      };
    };
    const styleKeys = [
      "fontFamily",
      "fontSize",
      "fontWeight",
      "letterSpacing",
      "fontFeatureSettings",
      "lineHeight",
      "wordBreak",
      "textWrap",
      "color",
      "backgroundColor",
      "paddingInlineStart",
      "paddingInlineEnd",
      "outline",
      "outlineOffset",
      "boxShadow",
      "clipPath",
      "overflow",
      "gridTemplateColumns",
      "transitionProperty",
      "transitionDuration",
      "animationDuration",
      "touchAction",
      "objectFit",
    ];
    const visible = (el) => {
      const s = getComputedStyle(el);
      return (
        s.display !== "none" && s.visibility !== "hidden" && el.getBoundingClientRect().width > 0
      );
    };
    const nodes = [
      ...document.querySelectorAll(
        "main :is(h1,h2,h3,h4,p,small,button,a,select,output,dt,dd), .rxs-page :is(header,footer,nav), .rxs-page :is(.rxs-system-grid,.rxs-stage-visual,.rxs-hero-visual,.rxe-comparison-grid,.rxs-p14-range-control,.rxs-generation-row)",
      ),
    ]
      .filter(visible)
      .map((el) => {
        const s = getComputedStyle(el);
        return {
          tag: el.tagName,
          id: el.id,
          class: el.className,
          text: el.textContent.trim().slice(0, 350),
          rect: rect(el),
          css: Object.fromEntries(styleKeys.map((key) => [key, s[key]])),
          ariaLabel: el.getAttribute("aria-label"),
          role: el.getAttribute("role"),
          live: el.getAttribute("aria-live"),
          selected: el.getAttribute("aria-selected"),
          pressed: el.getAttribute("aria-pressed"),
          lang: el.closest("[lang]")?.getAttribute("lang"),
          scrollWidth: el.scrollWidth,
          clientWidth: el.clientWidth,
        };
      });
    const images = [...document.querySelectorAll(".rxs-page img")].map((el) => ({
      src: el.getAttribute("src"),
      currentSrc: el.currentSrc,
      srcSet: el.srcset,
      sizes: el.sizes,
      naturalWidth: el.naturalWidth,
      naturalHeight: el.naturalHeight,
      rect: rect(el),
      fit: getComputedStyle(el).objectFit,
    }));
    const resources = performance
      .getEntriesByType("resource")
      .map((r) => ({
        name: r.name.replace(location.origin, ""),
        type: r.initiatorType,
        bytes: r.encodedBodySize,
        ms: r.duration,
      }));
    return {
      width: innerWidth,
      height: innerHeight,
      scrollY,
      documentWidth: document.documentElement.scrollWidth,
      documentHeight: document.documentElement.scrollHeight,
      root: { ...document.documentElement.dataset },
      nodes,
      images,
      resources,
      paint: window.__auditPaint,
      longTasks: window.__auditTasks,
      landmarks: {
        banners: document.querySelectorAll('header:not(main header),[role="banner"]').length,
        contentinfo: document.querySelectorAll('body > footer,[role="contentinfo"]').length,
      },
    };
  });
}
try {
  for (const profile of profiles.filter((p) => !only || only.includes(p.name))) {
    const context = await browser.newContext({
      viewport: { width: profile.width, height: profile.height },
      hasTouch: !!profile.touch,
      isMobile: !!profile.touch,
      deviceScaleFactor: 1,
    });
    const page = await context.newPage();
    if (process.env.AUDIT_OFFLINE_FONTS === "1") {
      await page.route(
        /https:\/\/(fonts\.googleapis\.com|fonts\.gstatic\.com|grok\.com)\//,
        (route) => route.abort("internetdisconnected"),
      );
    }
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.addInitScript(() => {
      performance.setResourceTimingBufferSize(6000);
      window.__auditTasks = [];
      window.__auditPaint = [];
      new PerformanceObserver((list) =>
        window.__auditTasks.push(
          ...list.getEntries().map((e) => ({ start: e.startTime, ms: e.duration })),
        ),
      ).observe({ type: "longtask", buffered: true });
      new PerformanceObserver((list) =>
        window.__auditPaint.push(
          ...list
            .getEntries()
            .map((e) => ({
              start: e.startTime,
              size: e.size,
              tag: e.element?.tagName,
              class: e.element?.className,
            })),
        ),
      ).observe({ type: "largest-contentful-paint", buffered: true });
    });
    const response = await page.goto(`${base}/rexonance-saga`, { waitUntil: "domcontentloaded" });
    const initial = await page.locator(".rxs-hero").boundingBox();
    await settle(page);
    const report = {
      profile,
      networkMode:
        process.env.AUDIT_OFFLINE_FONTS === "1" ? "external-font-outage-controlled" : "unmodified",
      status: response.status(),
      initialHero: initial,
      errors,
      normal: await measure(page),
    };
    await page.screenshot({ path: `${out}/${profile.name}-hero.png` });
    for (const id of ["performance", "p14", "assembly", "stages", "system"]) {
      const target = page.locator(`#${id}`);
      if (!(await target.count())) continue;
      await target.evaluate((el) => el.scrollIntoView({ behavior: "instant", block: "start" }));
      await page.waitForTimeout(800);
      if (id === "p14")
        await page.locator(".rxs-p14-overview img").evaluate((img) =>
          img.complete && img.naturalWidth > 0
            ? undefined
            : new Promise((resolve) => {
                img.addEventListener("load", resolve, { once: true });
                img.addEventListener("error", resolve, { once: true });
              }),
        );
      await page.screenshot({ path: `${out}/${profile.name}-${id}.png` });
    }
    // Open the opt-in comparison and measure the actual painted cards.
    const summary = page.locator(".rxe-form-comparison summary");
    await summary.click();
    await page.locator(".rxe-comparison-grid").waitFor();
    await page.waitForTimeout(300);
    report.comparison = await measure(page);
    await summary.evaluate((el) => el.scrollIntoView({ block: "start", behavior: "instant" }));
    await page.screenshot({ path: `${out}/${profile.name}-comparison.png` });
    // Test a drawer selection, accessible name retention and the glass lens.
    const choose = page.locator(".rxe-comparison-card button").nth(1);
    const beforeName = await choose.innerText();
    await choose.click();
    await page.waitForTimeout(1200);
    report.selection = await page.evaluate((beforeName) => {
      const rail = document.querySelector(".rxs-stage-tabs");
      const active = document.querySelector('.rxs-stage-tabs [aria-selected="true"]');
      const lens = rail?.querySelector(".liquid-selection-lens");
      const b = (el) => {
        const r = el?.getBoundingClientRect();
        return r ? { x: r.x, y: r.y, width: r.width, height: r.height } : null;
      };
      return {
        beforeName,
        afterName: document.querySelectorAll(".rxe-comparison-card button")[1]?.textContent,
        active: active?.textContent,
        activeRect: b(active),
        lensRect: b(lens),
        scrollY,
        panel: b(document.querySelector("#rxs-stage-panel")),
      };
    }, beforeName);
    await page.emulateMedia({ forcedColors: "active" });
    report.forced = await measure(page);
    await page.locator("#p14").evaluate((el) => el.scrollIntoView({ behavior: "instant" }));
    await page.waitForTimeout(350);
    await page.screenshot({ path: `${out}/${profile.name}-forced-p14.png` });
    const footerLink = page.locator(".rxs-footer a").first();
    if (await footerLink.count()) {
      await footerLink.focus();
      report.footerFocus = await footerLink.evaluate((el) => ({
        focused: el.matches(":focus-visible"),
        outline: getComputedStyle(el).outline,
        shadow: getComputedStyle(el).boxShadow,
        clip: getComputedStyle(el).clipPath,
      }));
      await page.screenshot({ path: `${out}/${profile.name}-forced-footer-focus.png` });
    }
    await page.emulateMedia({ forcedColors: "none", reducedMotion: "reduce" });
    await page.locator("#assembly").evaluate((el) => el.scrollIntoView({ behavior: "instant" }));
    await page.waitForTimeout(300);
    report.reduced = await measure(page);
    await page.screenshot({ path: `${out}/${profile.name}-reduced-assembly.png` });
    await writeFile(`${out}/${profile.name}.json`, JSON.stringify(report, null, 2));
    results.push({
      name: profile.name,
      status: response.status(),
      errors,
      overflow: report.normal.documentWidth - profile.width,
    });
    console.log(JSON.stringify(results.at(-1)));
    await context.close();
  }
} finally {
  await browser.close();
  await writeFile(
    `${out}/index.json`,
    JSON.stringify(
      { sha: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(), results },
      null,
      2,
    ),
  );
}
