import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
const base = process.env.BASE_URL || "http://127.0.0.1:8269";
const out = process.env.AUDIT_OUT || "output/playwright/rexonance-audit94/probes";
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ channel: "chrome" });
try {
  for (const width of [1440, 1024, 390]) {
    const page = await browser.newPage({
      viewport: { width, height: width === 1024 ? 768 : width === 390 ? 844 : 900 },
      hasTouch: width !== 1440,
      isMobile: width !== 1440,
    });
    if (process.env.AUDIT_OFFLINE_FONTS === "1") {
      await page.route(
        /https:\/\/(fonts\.googleapis\.com|fonts\.gstatic\.com|grok\.com)\//,
        (route) => route.abort("internetdisconnected"),
      );
    }
    await page.goto(`${base}/rexonance-saga`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(
      () =>
        document.querySelector("#system") && !document.documentElement.hasAttribute("data-loading"),
    );
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(1800);
    const r = {
      width,
      networkMode:
        process.env.AUDIT_OFFLINE_FONTS === "1" ? "external-font-outage-controlled" : "unmodified",
    };
    r.palt = await page.evaluate(() => {
      const s = getComputedStyle(document.querySelector("h1"));
      const el = document.createElement("span");
      el.textContent = "あいうえお、。かきくけこ";
      Object.assign(el.style, {
        position: "absolute",
        visibility: "hidden",
        fontFamily: s.fontFamily,
        fontSize: "64px",
        fontWeight: s.fontWeight,
        whiteSpace: "nowrap",
      });
      document.body.append(el);
      el.style.fontFeatureSettings = '"palt" 0';
      const off = el.getBoundingClientRect().width;
      el.style.fontFeatureSettings = '"palt" 1';
      const on = el.getBoundingClientRect().width;
      el.remove();
      return { off, on, difference: off - on };
    });
    // Keep node identities across a real baseline change, not a source-code guess.
    await page.locator("#p14").evaluate((el) => el.scrollIntoView({ behavior: "instant" }));
    await page.evaluate(() => {
      window.__p14Live = document.querySelector(".rxs-p14-metrics");
    });
    await page.getByRole("button", { name: "P2比", exact: true }).click();
    r.p14 = await page.evaluate(() => ({
      sameLiveRegion: window.__p14Live === document.querySelector(".rxs-p14-metrics"),
      text: document.querySelector(".rxs-p14-metrics").textContent,
      header: document.querySelector(".rxs-p14-comparator header").textContent,
    }));
    await page.locator(".rxs-comparison-selector select").selectOption("vinculum");
    r.comparison = await page.locator(".rxs-comparison").innerText();
    await page.evaluate(() => {
      window.__performanceLive = document.querySelector(".rxs-comparison-metrics");
    });
    await page.locator(".rxs-comparison-selector select").selectOption("extreme");
    r.samePerformanceLiveRegion = await page.evaluate(
      () => window.__performanceLive === document.querySelector(".rxs-comparison-metrics"),
    );
    await page.locator(".rxs-menu-trigger").click();
    await page.waitForTimeout(300);
    r.menu = await page
      .locator(".side-panel")
      .evaluate((panel) => ({
        top: panel.scrollTop,
        height: panel.clientHeight,
        headings: [...panel.querySelectorAll(".side-panel-group > p")].map((el) => ({
          text: el.textContent,
          y: el.getBoundingClientRect().y,
        })),
        links: [...panel.querySelectorAll('a[href*="#"]')].map((el) => ({
          text: el.textContent,
          href: el.getAttribute("href"),
        })),
      }));
    await page.keyboard.press("Escape");
    await page.waitForTimeout(450);
    await page.keyboard.press("Tab");
    r.focus = [];
    for (const forcedColors of ["none", "active"]) {
      await page.emulateMedia({ forcedColors });
      const links = page.locator(".rxs-footer > a");
      for (let i = 0; i < (await links.count()); i++) {
        await links.nth(i).focus();
        r.focus.push(
          await links
            .nth(i)
            .evaluate(
              (el, forcedColors) => ({
                forcedColors,
                text: el.textContent,
                visible: el.matches(":focus-visible"),
                outline: getComputedStyle(el).outline,
                offset: getComputedStyle(el).outlineOffset,
                clip: getComputedStyle(el).clipPath,
                shadow: getComputedStyle(el).boxShadow,
              }),
              forcedColors,
            ),
        );
      }
      await page.screenshot({ path: `${out}/${width}-footer-${forcedColors}.png` });
      await page
        .locator(".rxs-p14-comparator")
        .evaluate((el) => el.scrollIntoView({ behavior: "instant" }));
      await page.screenshot({ path: `${out}/${width}-p14-${forcedColors}.png` });
    }
    await page.emulateMedia({ forcedColors: "none", reducedMotion: "reduce" });
    await page.waitForFunction(
      () =>
        document.querySelector('#assembly-replay a[href="#assembly"]')?.textContent ===
        "変身の資料を見る",
    );
    r.replay = await page.locator("#assembly-replay").innerText();
    r.replayVisible = await page.locator('#assembly-replay a[href="#assembly"]').isVisible();
    r.heights = await page
      .locator(".rxs-p14-range-labels button,.rxs-assembly-controls a,.rxs-scroll-cue")
      .evaluateAll((els) =>
        els.map((el) => ({ text: el.textContent, height: el.getBoundingClientRect().height })),
      );
    if (width === 390) {
      await page.emulateMedia({ reducedMotion: "no-preference" });
      await page.locator("#assembly-runway").evaluate((el) => {
        const b = el.getBoundingClientRect();
        scrollTo({
          top: b.top + scrollY + (el.offsetHeight - innerHeight) * 0.45,
          behavior: "instant",
        });
      });
      await page.waitForTimeout(1000);
      r.orientationBefore = await page.evaluate(() => ({
        y: scrollY,
        rect: document.querySelector("#assembly-runway").getBoundingClientRect().toJSON(),
        q: document.querySelector("#assembly-runway").dataset.rznProgress,
        phase: document.querySelector("#assembly-runway").dataset.rznPhase,
      }));
      await page.setViewportSize({ width: 844, height: 390 });
      await page.waitForTimeout(1100);
      r.orientationAfter = await page.evaluate(() => ({
        y: scrollY,
        rect: document.querySelector("#assembly-runway").getBoundingClientRect().toJSON(),
        q: document.querySelector("#assembly-runway").dataset.rznProgress,
        phase: document.querySelector("#assembly-runway").dataset.rznPhase,
      }));
    }
    await writeFile(`${out}/${width}.json`, JSON.stringify(r, null, 2));
    console.log(
      JSON.stringify({
        width,
        palt: r.palt,
        sameLive: r.p14.sameLiveRegion,
        samePerformance: r.samePerformanceLiveRegion,
        heights: r.heights,
      }),
    );
    await page.close();
  }
} finally {
  await browser.close();
}
