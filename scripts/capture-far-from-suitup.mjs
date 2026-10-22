// Disposable browser QA for the FAR FROM scroll suit-up: captures the
// runway at many scroll positions, at 390 and 1440, on /far-from-saga and
// (for the side-by-side) the same positions on /rexonance-saga.
//
//   BASE_URL=http://127.0.0.1:8566 OUT_DIR=<dir> node scripts/capture-far-from-suitup.mjs
//   PAGES=far-from-saga,rexonance-saga PROFILES=desktop1440,phone390 STEPS=0,0.1,...
//
// Chromium runs from CHROMIUM (a headless build) with software WebGL, as the
// review asks: --use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader.
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { chromium } from "playwright";

const base = process.env.BASE_URL || "http://127.0.0.1:8566";
const out = process.env.OUT_DIR || "/tmp/ffs-scroll";
const pages = (process.env.PAGES || "far-from-saga,rexonance-saga").split(",");
const steps = (
  process.env.STEPS ||
  "0,0.04,0.08,0.11,0.13,0.16,0.22,0.3,0.38,0.46,0.54,0.62,0.7,0.78,0.84,0.87,0.9,0.92,0.94,0.96,0.985,1"
)
  .split(",")
  .map(Number);
const profiles = {
  desktop1440: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
  phone390: {
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  },
};
const chosen = (process.env.PROFILES || "desktop1440,phone390").split(",");
await mkdir(out, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM || undefined,
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--no-sandbox"],
});
const report = [];
for (const name of chosen) {
  const profile = profiles[name];
  for (const path of pages) {
    const context = await browser.newContext(profile);
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(`console: ${message.text()}`);
    });
    await page.goto(`${base}/${path}`, { waitUntil: "load" });
    await page.waitForFunction(
      () =>
        !document.documentElement.hasAttribute("data-loading") &&
        document.querySelector(".rzn-suitup"),
      null,
      { timeout: 90000 },
    );
    await page.addStyleTag({ content: "html,body,* { scroll-behavior:auto !important }" });
    await page.waitForTimeout(1500);
    // Pass the hero (the engine's early warm-up), then wait at the runway's
    // top until the scene is live.
    const top = await page.evaluate(() => {
      const runway = document.querySelector(".rzn-suitup");
      const pin = parseFloat(getComputedStyle(runway.querySelector(".rzn-frame")).top) || 0;
      return runway.getBoundingClientRect().top + scrollY - pin;
    });
    await page.evaluate((y) => scrollTo(0, y), top);
    const live = await page
      .waitForFunction(
        () => document.querySelector(".rzn-suitup")?.dataset.rznState === "live",
        null,
        { timeout: 120000 },
      )
      .then(() => true)
      .catch(() => false);
    const state = await page.evaluate(() => {
      const runway = document.querySelector(".rzn-suitup");
      const frame = runway.querySelector(".rzn-frame");
      return {
        load: runway.dataset.rznLoad,
        state: runway.dataset.rznState,
        height: runway.offsetHeight,
        frame: frame.offsetHeight,
        pin: parseFloat(getComputedStyle(frame).top) || 0,
      };
    });
    report.push({ page: path, profile: name, live, ...state });
    const travel = state.height - state.frame;
    for (const step of steps) {
      await page.evaluate((y) => scrollTo(0, y), top + travel * step);
      await page.waitForTimeout(600);
      // The frame's box in the viewport, clipped from the page (an element
      // screenshot would scroll it into view and wait for the live canvas
      // to hold still, which the burning fire never does).
      const clip = await page.evaluate(() => {
        const box = document.querySelector(".rzn-suitup .rzn-frame").getBoundingClientRect();
        return {
          x: Math.max(0, box.left),
          y: Math.max(0, box.top),
          width: Math.min(innerWidth, box.width),
          height: Math.min(innerHeight - Math.max(0, box.top), box.height),
        };
      });
      const label = step.toFixed(3).replace(".", "_");
      await page.screenshot({ path: join(out, `${path}-${name}-${label}.png`), clip });
      const hud = await page.evaluate(() => {
        const runway = document.querySelector(".rzn-suitup");
        return {
          phase: runway.dataset.rznPhase,
          percent: runway.querySelector(".rzn-percent")?.textContent,
          count: runway.querySelector(".rzn-count")?.textContent,
          line: runway.dataset.rznLine,
          complete: runway.hasAttribute("data-rzn-complete"),
          formComplete: runway.dataset.rznFormComplete,
        };
      });
      report.push({ page: path, profile: name, step, ...hud });
    }
    report.push({ page: path, profile: name, errors });
    await context.close();
  }
}
await browser.close();
await writeFile(join(out, "report.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
