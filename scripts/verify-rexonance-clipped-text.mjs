// FORGE (rx18): no visible text on /rexonance-saga is cut by a clipping box.
// owner request 2026-10-16: the forged faces are wider than the text they
// replace; a unit that cannot wrap widened the processing list past its
// card at 1100-1180px and every line in it was cut at the card's edge, with
// no page overflow (so the wrapping and readability verifies passed). This
// walks every visible text run, at rest, at every width, for every baseline
// and form, and fails when a run's box passes its nearest clipping ancestor
// (overflow other than visible, or a clip-path).
import assert from "node:assert/strict";
import { chromium } from "playwright";

const base = process.env.BASE_URL || process.env.BASE || "http://127.0.0.1:8199";
const widths = (process.env.CLIP_WIDTHS || "320,360,390,430,768,820,1024,1100,1140,1180,1240,1280,1366,1440,1920,2560")
  .split(",")
  .map(Number);
const baselines = ["vertex", "vinculum", "extreme"];
const stages = ["standard", "max", "ultra"];
const SLACK = 1.5;

const browser = await chromium.launch({ channel: process.env.PW_BROWSER_CHANNEL || "chrome" });
const failures = [];

function scan(slack) {
  const page = document.querySelector(".rxs-rexonance-page");
  const found = [];
  const clipper = (element) => {
    for (let node = element; node && node !== document.body; node = node.parentElement) {
      const style = getComputedStyle(node);
      if (style.overflowX !== "visible" || style.clipPath !== "none") return node;
    }
    return null;
  };
  const walker = document.createTreeWalker(page, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  for (let text = walker.nextNode(); text; text = walker.nextNode()) {
    if (!text.data.trim()) continue;
    const element = text.parentElement;
    // Ornaments, the counters' mirrors, the suit-up scene, the calls, native
    // controls and the local nav (a scroller by design) are out of scope.
    // Owner (2026-10-23): 不要なセカンダリラベルを削除（レイアウトで説明）: so is the text read to
    // assistive tech only (.visually-hidden, the runway's .rxk-sr script),
    // which is clipped to one pixel by design and never seen.
    if (element.closest("[aria-hidden='true'], .rsn-count, .rzn-suitup, .rx-call, select, option, .rxs-local-nav, .visually-hidden, .rxk-sr")) continue;
    const style = getComputedStyle(element);
    if (style.visibility === "hidden" || style.display === "none") continue;
    const box = clipper(element);
    if (!box) continue;
    const edge = box.getBoundingClientRect();
    range.selectNodeContents(text);
    for (const rect of range.getClientRects()) {
      if (rect.width < 1) continue;
      const over = Math.max(rect.right - edge.right, edge.left - rect.left);
      if (over > slack) {
        const name = box.id ? `#${box.id}` : `${box.tagName.toLowerCase()}.${[...box.classList].join(".")}`;
        found.push(`「${text.data.trim().slice(0, 32)}」 cut by ${Math.round(over)}px at ${name}`);
      }
    }
  }
  return {
    found: [...new Set(found)],
    overflow: document.documentElement.scrollWidth - innerWidth,
  };
}

try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`${base}/rexonance-saga`, { waitUntil: "networkidle" });
  await page.waitForFunction(
    () => !document.querySelector(".load-gate") && !document.documentElement.hasAttribute("data-loading"),
    null,
    { timeout: 40000 },
  );
  await page.evaluate(() => document.fonts.ready);
  for (const width of widths) {
    await page.setViewportSize({ width, height: 900 });
    await page.waitForTimeout(250);
    const runs = new Map();
    let overflow = 0;
    for (const baseline of baselines) {
      await page.locator(".rxs-comparison-selector select").selectOption(baseline);
      await page.waitForTimeout(150);
      for (const stage of stages) {
        await page.evaluate((id) => document.getElementById(`rxs-stage-tab-${id}`)?.click(), stage);
        await page.waitForTimeout(150);
        const result = await page.evaluate(scan, SLACK);
        overflow = Math.max(overflow, result.overflow);
        for (const run of result.found) runs.set(run, [...(runs.get(run) || []), `${baseline}/${stage}`]);
      }
    }
    const line = `${width}px: ${runs.size} cut text run(s), page overflow ${overflow}px`;
    console.log(line);
    for (const [run, where] of runs) console.log(`  ${run} (${where.slice(0, 3).join(", ")})`);
    if (runs.size || overflow > 1) failures.push(line);
  }
  assert.deepEqual(errors, []);
  await context.close();
} finally {
  await browser.close();
}

assert.deepEqual(failures, [], "no text is cut by its clipping box at any width");
console.log("rexonance clipped text ok");
