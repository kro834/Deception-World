import assert from "node:assert/strict";
import { chromium, webkit } from "playwright";

const base = process.env.BASE_URL || "http://127.0.0.1:8082";
const calls = [
  "FAR UP！",
  "RIDER！",
  "SA-GA！DEUS！SA-GA！DEUS！SA-GA！DEUS！SA-GA！DEUS！",
  "REXONANCE！REXONANCE！REXONANCE！REXONANCE！",
  "REXONANCE DEUS！",
];
const engine = process.env.PW_ENGINE || "chromium";
const browser = await (engine === "webkit" ? webkit : chromium).launch(
  engine === "webkit" ? {} : { channel: process.env.PW_BROWSER_CHANNEL || "chrome" },
);
try {
  for (const viewport of [
    { width: 280, height: 568 },
    { width: 720, height: 450 },
    { width: 1920, height: 360 },
  ]) {
    const context = await browser.newContext({ viewport });
    await context.route(/fonts\.(googleapis|gstatic)\.com|\.woff2?(?:\?|$)/, (route) =>
      route.abort("failed"),
    );
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`${base}/world`, { waitUntil: "networkidle" });
    await page.waitForFunction(() => !document.querySelector(".load-gate"));
    await page.evaluate(() => {
      window.__rxFallback = { calls: [], clipping: [], started: false, finished: false };
      const sample = () => {
        const report = window.__rxFallback;
        const root = document.querySelector('.rx-call-sequence[data-mode="entry"]');
        if (root) report.started = true;
        else if (report.started) report.finished = true;
        if (root?.dataset.phase === "covering") {
          for (const beat of root.querySelectorAll("[data-call]")) {
            if (Number(getComputedStyle(beat).opacity) < 0.3) continue;
            if (report.calls.at(-1) !== beat.dataset.call) report.calls.push(beat.dataset.call);
            for (const span of beat.querySelectorAll("span")) {
              const range = document.createRange();
              range.selectNodeContents(span);
              const glyph = range.getBoundingClientRect();
              const row = span.getBoundingClientRect();
              if (
                glyph.left < -1 ||
                glyph.right > innerWidth + 1 ||
                row.top < -1 ||
                row.bottom > innerHeight + 1
              ) {
                report.clipping.push({
                  call: beat.dataset.call,
                  left: glyph.left,
                  right: glyph.right,
                  top: row.top,
                  bottom: row.bottom,
                });
              }
            }
          }
        }
        if (!report.finished) requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    });
    await page.locator(".side-panel-trigger").first().click();
    const link = page.locator('#site-side-panel a[href="/rexonance-saga#top"]').first();
    await link.waitFor({ state: "visible" });
    await link.evaluate((element) => element.scrollIntoView({ block: "center" }));
    await link.click();
    await page.waitForFunction(() => window.__rxFallback.finished, null, { timeout: 20000 });
    await page.waitForURL("**/rexonance-saga**");
    const report = await page.evaluate(() => window.__rxFallback);
    assert.deepEqual(
      report.calls,
      calls,
      "All five calls remain readable without downloaded fonts",
    );
    assert.deepEqual(report.clipping, [], "Fallback text must fit even at the impact scale");
    assert.deepEqual(errors, [], "Font failure must not raise a page error");
    console.log(`PASS font fallback ${viewport.width}x${viewport.height}: five calls, no clipping`);
    await context.close();
  }
} finally {
  await browser.close();
}
