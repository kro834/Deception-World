import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
const base = process.env.BASE_URL || "http://127.0.0.1:8269";
const out = process.env.AUDIT_OUT || "output/playwright/rexonance-audit94/detail-baseline";
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ channel: "chrome" });
try {
  for (const width of [1440, 1024, 390]) {
    const page = await browser.newPage({
      viewport: { width, height: width === 1024 ? 768 : 900 },
      hasTouch: width !== 1440,
      isMobile: width !== 1440,
    });
    await page.route(
      /https:\/\/(fonts\.googleapis\.com|fonts\.gstatic\.com|grok\.com)\//,
      (route) => route.abort("internetdisconnected"),
    );
    await page.goto(`${base}/rexonance-saga`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(
      () => document.querySelector(".rxs-stage-tabs")?.dataset.liquidInitialized === "true",
    );
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(1500);
    const report = { width, networkMode: "external-font-outage-controlled" };
    const styles = async (selector) =>
      page.locator(selector).evaluateAll((els) =>
        els.map((el) => {
          const s = getComputedStyle(el);
          return {
            text: el.textContent,
            rect: el.getBoundingClientRect().toJSON(),
            background: s.background,
            color: s.color,
            fill: s.webkitTextFillColor,
            clip: s.clipPath,
            transition: s.transition,
            outline: s.outline,
            offset: s.outlineOffset,
            overflow: s.overflow,
            role: el.getAttribute("role"),
            lang: el.closest("[lang]")?.lang,
          };
        }),
      );
    await page.locator("#p14").evaluate((el) => el.scrollIntoView({ behavior: "instant" }));
    report.p14 = await styles(".rxs-p14-values i,.rxs-p14-values b,.rxs-p14-values strong");
    await page.locator(".rxs-p14-range-labels button.is-active").hover();
    report.pillBeforePress = await styles(".rxs-p14-range-labels button.is-active");
    await page.mouse.down();
    report.pillDuringPress = await styles(".rxs-p14-range-labels button.is-active");
    await page.mouse.up();
    report.controls = await styles(
      ".rxe-hero-rail a,.rxs-assembly-controls a,.rxe-form-comparison summary,.rxs-footer > a",
    );
    await page.locator(".rxs-menu-trigger").click();
    await page.waitForTimeout(300);
    report.menuImagesOpen = await page.locator(".side-panel img").count();
    await page.keyboard.press("Escape");
    report.menuImagesClosing = await page.locator(".side-panel img").count();
    await page.waitForTimeout(450);
    await page.locator(".rxe-form-comparison summary").click();
    await page.waitForTimeout(300);
    report.drawer = await styles(".rxe-comparison-grid,.rxe-comparison-card");
    await page.emulateMedia({ forcedColors: "active" });
    report.forcedTabs = await styles(
      ".rxs-stage-tabs button,.rxs-stage-tabs button b,.rxs-stage-tabs button small",
    );
    report.forcedP14 = await styles(".rxs-p14-values i,.rxs-p14-values b,.rxs-p14-values strong");
    report.ornaments = await page.evaluate(() =>
      [...document.querySelectorAll(".rxs-page *")]
        .flatMap((el) =>
          ["::before", "::after"].map((p) => {
            const s = getComputedStyle(el, p);
            return {
              tag: el.tagName,
              class: el.className,
              p,
              content: s.content,
              display: s.display,
              background: s.backgroundImage,
              color: s.color,
              adjust: s.forcedColorAdjust,
            };
          }),
        )
        .filter(
          (s) =>
            s.content !== "none" &&
            s.display !== "none" &&
            (s.background !== "none" || s.adjust === "none"),
        ),
    );
    await writeFile(`${out}/${width}.json`, JSON.stringify(report, null, 2));
    console.log(
      JSON.stringify({
        width,
        images: [report.menuImagesOpen, report.menuImagesClosing],
        ornaments: report.ornaments,
      }),
    );
    await page.close();
  }
} finally {
  await browser.close();
}
