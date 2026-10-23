// Disposable browser QA for the auto transformation movie's control layout
// (owner, 2026-10-23: 「速度調整インターフェースが全身にかぶらない様にスマホでは
// 展開式にして、iPadなどでは工夫して」): on /rexonance-saga and /far-from-saga,
// at phone, tablet and desktop sizes, the movie plays and the control, collapsed
// and expanded, is measured against the figure's box (from the frame's
// --rzn-fig-* values: height = min(frame h * fig-h, frame w * fig-w * 1040/693),
// width = height * 693/1040, centred on fig-x, its foot fig-b above the frame's).
//
//   BASE_URL=http://127.0.0.1:8566 OUT_DIR=<dir> node scripts/capture-movie-control.mjs
//   PAGES=far-from-saga SIZES=390x844,1440x900
//
// Chromium: CHROMIUM=/opt/pw-browsers/chromium, software WebGL (swiftshader).
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { chromium } from "playwright";
import { checkedUrl } from "./browser-guard.mjs";

const base = checkedUrl(process.env.BASE_URL || "http://127.0.0.1:8566");
const out = process.env.OUT_DIR || "/tmp/movie-control";
const pages = (process.env.PAGES || "rexonance-saga,far-from-saga").split(",");
const sizes = (
  process.env.SIZES || "390x844,360x640,768x1024,1024x768,820x1180,1180x820,1366x1024,1440x900"
)
  .split(",")
  .map((s) => s.split("x").map(Number));
// The figure's bounding box has transparent margins at the head and the feet.
const HEAD = Number(process.env.HEAD_MARGIN || 0.04);
const FOOT = Number(process.env.FOOT_MARGIN || 0.03);
await mkdir(out, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM || undefined,
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--no-sandbox"],
});

/** Runs in the page: the figure's box and the control's visible rects. */
const measure = ([head, foot]) => {
  const frame = document.querySelector(".rzn-suitup .rzn-frame");
  const f = frame.getBoundingClientRect();
  const cs = getComputedStyle(frame);
  const v = (n) => parseFloat(cs.getPropertyValue(n));
  const figH = Math.min(f.height * v("--rzn-fig-h"), f.width * v("--rzn-fig-w") * (1040 / 693));
  const figW = (figH * 693) / 1040;
  const left = f.left + f.width * v("--rzn-fig-x") - figW / 2;
  const bottom = f.bottom - f.height * v("--rzn-fig-b");
  const fig = { left, right: left + figW, top: bottom - figH, bottom };
  const body = { ...fig, top: fig.top + figH * head, bottom: fig.bottom - figH * foot };
  const rect = (el) => {
    const r = el.getBoundingClientRect();
    return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, w: r.width, h: r.height };
  };
  const control = document.querySelector(".rzn-movie");
  const parts = [];
  // Every visible control surface: the pill, and the sheet.
  for (const el of control.querySelectorAll(".rzn-movie-pill, .rzn-movie-sheet")) {
    const s = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    if (s.display === "none" || s.visibility === "hidden" || r.width < 1 || r.height < 1) continue;
    parts.push(rect(el));
  }
  // The HUD's call (the form's lines) and the Zeus button, for the report.
  const callEl = document.querySelector(".rzn-suitup .rzn-call");
  const call = callEl ? callEl.getBoundingClientRect() : null;
  const zeusEl = document.querySelector(".zeus-button");
  const zeus = zeusEl ? zeusEl.getBoundingClientRect() : null;
  const cs2 = getComputedStyle(control);
  const visible = cs2.visibility !== "hidden" && cs2.display !== "none";
  const union = parts.length
    ? {
        left: Math.min(...parts.map((p) => p.left)),
        right: Math.max(...parts.map((p) => p.right)),
        top: Math.min(...parts.map((p) => p.top)),
        bottom: Math.max(...parts.map((p) => p.bottom)),
      }
    : null;
  const hit = (a, b) =>
    a && Math.min(a.right, b.right) > Math.max(a.left, b.left) && Math.min(a.bottom, b.bottom) > Math.max(a.top, b.top);
  const overlap = (a, b) =>
    a
      ? Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) *
        Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top))
      : 0;
  const sum = (list, b) => list.reduce((n, p) => n + overlap(p, b), 0);
  const rr = (o) => (o ? Object.fromEntries(Object.entries(o).map(([k, x]) => [k, Math.round(x)])) : o);
  return {
    viewport: [innerWidth, innerHeight],
    frame: rr(rect(frame)),
    fig: rr(fig),
    body: rr(body),
    control: rr(rect(control)),
    union: rr(union),
    surfaces: parts.map(rr),
    visible,
    state: control.dataset.state,
    expanded: control.querySelector(".rzn-movie-toggle")?.getAttribute("aria-expanded") ?? null,
    hitsFigBox: parts.some((p) => hit(p, fig)),
    hitsBody: parts.some((p) => hit(p, body)),
    overlapBodyPx: Math.round(sum(parts, body)),
    callOverlapPx: Math.round(call ? sum(parts, call) : 0),
    zeusOverlapPx: Math.round(zeus ? sum(parts, zeus) : 0),
    offscreen: union
      ? union.left < -0.5 || union.top < -0.5 || union.right > innerWidth + 0.5 || union.bottom > innerHeight + 0.5
      : null,
  };
};

const report = [];
for (const path of pages) {
  for (const [width, height] of sizes) {
    const touch = Math.min(width, height) < 700 || (width <= 1366 && width >= 768 && height >= 768);
    const context = await browser.newContext({
      viewport: { width, height },
      deviceScaleFactor: 1,
      isMobile: touch,
      hasTouch: touch,
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(`${base}/${path}`, { waitUntil: "load" });
    await page.waitForFunction(
      () => !document.documentElement.hasAttribute("data-loading") && document.querySelector(".rzn-suitup"),
      null,
      { timeout: 90000 },
    );
    await page.addStyleTag({ content: "html,body,* { scroll-behavior:auto !important }" });
    await sleep(1000);
    // Sections above the runway settle their heights as the page scrolls
    // (content-visibility), so the runway's top is measured again each time.
    const runwayTop = () =>
      page.evaluate(() => {
        const runway = document.querySelector(".rzn-suitup");
        const frame = runway.querySelector(".rzn-frame");
        const pin = parseFloat(getComputedStyle(frame).top) || 0;
        return runway.getBoundingClientRect().top + scrollY - pin;
      });
    for (let k = 0; k < 4; k += 1) {
      await page.evaluate((y) => scrollTo(0, y), await runwayTop());
      await sleep(900);
    }
    await page
      .waitForFunction(() => document.querySelector(".rzn-suitup")?.dataset.rznState === "live", null, { timeout: 120000 })
      .catch(() => {});
    await page.evaluate((y) => scrollTo(0, y), await runwayTop());
    await sleep(1500);
    const tag = `${path}-${width}x${height}`;
    const entry = { page: path, size: `${width}x${height}`, errors };
    report.push(entry);
    // Mid-suit-up, the movie playing.
    await page.evaluate(() => {
      const mini = document.querySelector(".rzn-movie-mini");
      (mini && mini.offsetParent ? mini : document.querySelector(".rzn-movie-play"))?.click();
    });
    await sleep(2500);
    entry.collapsed = await page.evaluate(measure, [HEAD, FOOT]);
    await page.screenshot({ path: join(out, `${tag}-collapsed.png`) });
    const toggle = await page.$(".rzn-movie-toggle");
    const toggleShown = toggle ? await toggle.isVisible() : false;
    entry.hasToggle = toggleShown;
    if (toggleShown) {
      await toggle.click();
      await sleep(500);
      entry.expanded = await page.evaluate(measure, [HEAD, FOOT]);
      await page.screenshot({ path: join(out, `${tag}-expanded.png`) });
      entry.stateAfterExpand = await page.evaluate(() => document.querySelector(".rzn-movie").dataset.state);
    }
    await context.close();
  }
}
await browser.close();
await writeFile(join(out, "report.json"), JSON.stringify(report, null, 2));
const line = (m) =>
  m
    ? `vis=${m.visible} union=${JSON.stringify(m.union)} hitFig=${m.hitsFigBox} hitBody=${m.hitsBody} overlap=${m.overlapBodyPx}px call=${m.callOverlapPx}px zeus=${m.zeusOverlapPx}px off=${m.offscreen}`
    : "-";
for (const e of report) {
  console.log(`${e.page} ${e.size} toggle=${e.hasToggle} err=${e.errors.length}`);
  console.log(`  fig=${JSON.stringify(e.collapsed.fig)} body=${JSON.stringify(e.collapsed.body)}`);
  console.log(`  collapsed: ${line(e.collapsed)}`);
  if (e.expanded) console.log(`  expanded:  ${line(e.expanded)} state=${e.stateAfterExpand}`);
}
