// Owner (2026-10-16): the call's nanite extras add no per-frame allocation —
// typed buffers made once per call; poses written to a Float64Array, never to
// a `let` a closure holds (V8 boxes each double written to a context slot
// into a fresh heap number). A static scan cannot see that, so this plays the
// entry call twice on a production preview — with the nanite kit (the rich
// call) and with the kit blocked (the classic call) — under Chrome's sampling
// heap profiler (objects collected by minor and major GCs included), and
// fails if the extras chunk allocates more over the rich call than the
// classic engine does over the whole classic call.
// BASE_URL=http://127.0.0.1:8705 PW_BROWSER_CHANNEL=chrome node scripts/verify-rexonance-call-alloc.mjs
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { REXONANCE_NANITE_DIR } from "../src/lib/rexonance-nanites.ts";

const base = process.env.BASE_URL ?? "http://127.0.0.1:8705";
const browser = await chromium.launch({ channel: process.env.PW_BROWSER_CHANNEL ?? "chrome" });

async function play(rich) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  if (!rich) await page.route(`**${REXONANCE_NANITE_DIR}/**`, (route) => route.abort());
  const cdp = await context.newCDPSession(page);
  await page.goto(`${base}/world`, { waitUntil: "networkidle" });
  await page.waitForFunction(
    () =>
      !document.documentElement.hasAttribute("data-loading") && !document.querySelector(".load-gate"),
    null,
    { timeout: 30000 },
  );
  // The suit's plan and (rich) the nanite extras prepare in idle time.
  await page.waitForTimeout(9000);
  await page.locator(".side-panel-trigger").first().click();
  const link = page.locator('#site-side-panel a[href="/rexonance-saga#top"]').first();
  await link.waitFor({ state: "visible" });
  await link.evaluate((element) => element.scrollIntoView({ block: "center" }));
  await page.waitForTimeout(400);
  await cdp.send("HeapProfiler.enable");
  await cdp.send("HeapProfiler.collectGarbage");
  await cdp.send("HeapProfiler.startSampling", {
    samplingInterval: 4096,
    includeObjectsCollectedByMinorGC: true,
    includeObjectsCollectedByMajorGC: true,
  });
  await link.click();
  await page.locator('.rx-call-sequence[data-mode="entry"]').waitFor({ timeout: 10000 });
  await page.waitForTimeout(600);
  const swarm = await page.evaluate(() => document.querySelector(".rx-suit")?.dataset.swarm ?? null);
  await page.waitForTimeout(2600);
  const { profile } = await cdp.send("HeapProfiler.stopSampling");
  const bytes = { extras: 0, engine: 0 };
  const sites = new Map();
  const walk = (node) => {
    const { url, functionName, lineNumber, columnNumber } = node.callFrame;
    if (node.selfSize) {
      const chunk = /rexonance-suit-extras/.test(url)
        ? "extras"
        : /rexonance-call-sequence/.test(url)
          ? "engine"
          : null;
      if (chunk) {
        bytes[chunk] += node.selfSize;
        const key = `${chunk} ${functionName || "(anonymous)"} ${lineNumber}:${columnNumber}`;
        sites.set(key, (sites.get(key) ?? 0) + node.selfSize);
      }
    }
    for (const child of node.children) walk(child);
  };
  walk(profile.head);
  await context.close();
  const top = [...sites].sort((a, b) => b[1] - a[1]).slice(0, Number(process.env.TOP ?? 8));
  return { swarm, bytes, top, errors };
}

const rich = await play(true);
const classic = await play(false);
const mb = (value) => (value / 1048576).toFixed(2);
console.log(
  JSON.stringify({
    rich: { swarm: rich.swarm, extrasMB: mb(rich.bytes.extras), engineMB: mb(rich.bytes.engine) },
    classic: { swarm: classic.swarm, engineMB: mb(classic.bytes.engine) },
  }),
);
for (const [site, value] of rich.top) console.log(`  rich ${mb(value)} MB  ${site}`);
for (const [site, value] of classic.top) console.log(`  classic ${mb(value)} MB  ${site}`);
await browser.close();

assert.deepEqual([...rich.errors, ...classic.errors], [], "no page errors");
assert.equal(rich.swarm, "canvas", "the rich call draws the nanite extras");
assert.notEqual(classic.swarm, "canvas", "the classic call plays without the kit");
assert.ok(classic.bytes.engine > 0, "the classic engine was sampled");
assert.ok(
  rich.bytes.extras <= classic.bytes.engine,
  `the extras allocate ${mb(rich.bytes.extras)} MB over the call; the classic engine ${mb(
    classic.bytes.engine,
  )} MB`,
);
console.log("PASS call allocation: the extras allocate no more than the classic engine");
