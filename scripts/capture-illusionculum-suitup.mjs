// Disposable browser QA for the ILLUSIONCULUM scroll suit-up: captures the
// runway at many scroll positions, per profile and per chosen form, and
// writes a frame strip (one row per run) beside the frames.
//
//   BASE_URL=http://127.0.0.1:8733 OUT_DIR=<dir> node scripts/capture-illusionculum-suitup.mjs
//   FORMS=standard,more,ultra,ultraMore PROFILES=desktop1440,phone390 STEPS=0,0.1,...
import { mkdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { join } from "node:path";
import { chromium } from "playwright";

const require = createRequire(import.meta.url);
const sharp = require(process.env.SHARP_MODULE || "sharp");
const base = process.env.BASE_URL || "http://127.0.0.1:8733";
const out = process.env.OUT_DIR || "/tmp/ics-scroll";
const forms = (process.env.FORMS || "standard").split(",");
const steps = (
  process.env.STEPS || "0,0.05,0.12,0.18,0.24,0.3,0.38,0.46,0.54,0.62,0.7,0.78,0.84,0.88,0.91,0.93,0.95,0.97,1"
)
  .split(",")
  .map(Number);
const profiles = {
  desktop1440: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
  phone390: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
};
const chosen = (process.env.PROFILES || "desktop1440,phone390").split(",");
await mkdir(out, { recursive: true });
const browser = await chromium.launch({
  channel: process.env.PW_BROWSER_CHANNEL || undefined,
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
const report = [];
const rows = [];
for (const name of chosen) {
  for (const form of forms) {
    const context = await browser.newContext(profiles[name]);
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => message.type() === "error" && errors.push(`console: ${message.text()}`));
    await page.goto(`${base}/illusionculum-saga`, { waitUntil: "load" });
    await page.waitForFunction(() => document.querySelector(".rzn-suitup"), null, { timeout: 90000 });
    await page.addStyleTag({ content: "html,body,* { scroll-behavior:auto !important }" });
    await page.waitForTimeout(1500);
    if (form !== "standard") {
      await page.evaluate(() => document.querySelector(".ics-ending")?.scrollIntoView({ block: "center" }));
      await page.waitForTimeout(400);
      await page.click(`#ics-ending-tab-${form}`);
      await page.waitForTimeout(400);
    }
    const top = await page.evaluate(() => {
      const runway = document.querySelector(".rzn-suitup");
      const pin = parseFloat(getComputedStyle(runway.querySelector(".rzn-frame")).top) || 0;
      return runway.getBoundingClientRect().top + scrollY - pin;
    });
    await page.evaluate((y) => scrollTo(0, y), top);
    const live = await page
      .waitForFunction(() => document.querySelector(".rzn-suitup")?.dataset.rznState === "live", null, { timeout: 120000 })
      .then(() => true)
      .catch(() => false);
    const state = await page.evaluate(() => {
      const runway = document.querySelector(".rzn-suitup");
      const frame = runway.querySelector(".rzn-frame");
      return { load: runway.dataset.rznLoad, form: runway.dataset.form, height: runway.offsetHeight, frame: frame.offsetHeight };
    });
    report.push({ profile: name, form, live, ...state });
    const travel = state.height - state.frame;
    const shots = [];
    for (const step of steps) {
      await page.evaluate((y) => scrollTo(0, y), top + travel * step);
      await page.waitForTimeout(700);
      const clip = await page.evaluate(() => {
        const box = document.querySelector(".rzn-suitup .rzn-frame").getBoundingClientRect();
        return {
          x: Math.max(0, box.left),
          y: Math.max(0, box.top),
          width: Math.min(innerWidth, box.width),
          height: Math.min(innerHeight - Math.max(0, box.top), box.height),
        };
      });
      const file = join(out, `${name}-${form}-${step.toFixed(3).replace(".", "_")}.png`);
      await page.screenshot({ path: file, clip });
      shots.push(file);
      const hud = await page.evaluate(() => {
        const runway = document.querySelector(".rzn-suitup");
        return { phase: runway.dataset.rznPhase, line: runway.dataset.rznLine, formComplete: runway.dataset.rznFormComplete };
      });
      report.push({ profile: name, form, step, ...hud });
    }
    rows.push({ name, form, shots });
    report.push({ profile: name, form, errors });
    await context.close();
  }
}
await browser.close();
// The frame strips: one per run, the frames side by side at 240 px tall.
for (const { name, form, shots } of rows) {
  const tiles = [];
  let x = 0;
  for (const file of shots) {
    const buffer = await sharp(file).resize({ height: 300 }).toBuffer({ resolveWithObject: true });
    tiles.push({ input: buffer.data, left: x, top: 0 });
    x += buffer.info.width + 4;
  }
  await sharp({ create: { width: x, height: 300, channels: 3, background: { r: 0, g: 0, b: 0 } } })
    .composite(tiles)
    .png()
    .toFile(join(out, `strip-${name}-${form}.png`));
}
await writeFile(join(out, "report.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report.filter((entry) => entry.errors || entry.live !== undefined), null, 2));
