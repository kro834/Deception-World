// Production-build regression: genuine SPA navigation, five returns, forced GC,
// then detached native DOM and strong retaining paths from Chrome heap snapshots.
// WeakRefs distinguish nodes removed from this page from intentional off-document
// decoded-image caches, which Chromium also labels native detachedness=2.
// BASE_URL=http://127.0.0.1:18642 HEAP_REPORT=/tmp/rxs-heap.json node scripts/verify-rexonance-heap.mjs
// --record-baseline records the unfixed build without asserting it is leak-free.
// --unvisited-p14 leaves the lazy image below the fold, covering early departure.
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { chromium } from "playwright";
import { detachedDOMReport } from "./heap-retainers.mjs";

const base = process.env.BASE_URL ?? "http://127.0.0.1:18642";
const baseline = process.argv.includes("--record-baseline");
const unvisitedP14 = process.argv.includes("--unvisited-p14");
const browser = await chromium.launch({ channel: process.env.PW_BROWSER_CHANNEL ?? "chrome" });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
const cdp = await context.newCDPSession(page);
const rows = [];
let initialTimeOrigin;

async function settle() {
  await page.waitForFunction(
    () => !document.documentElement.hasAttribute("data-loading"),
    undefined,
    { timeout: 60000 },
  );
  await page.waitForFunction(
    () => !document.documentElement.hasAttribute("data-route-scroll-settling"),
  );
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  // Let passive unmount effects, transition timers and prefetch aborts finish.
  await page.waitForTimeout(1500);
}

async function go(path) {
  await page.locator(".side-panel-trigger").first().click();
  await page
    .locator(`.side-panel a[href="${path}"], .side-panel a[href="${path}#top"]`)
    .first()
    .click();
  await page.waitForURL((url) => url.pathname === path, { timeout: 60000 });
  await settle();
  assert.equal(
    await page.evaluate(() => performance.timeOrigin),
    initialTimeOrigin,
    "must be client navigation, not a fresh document",
  );
}

async function measure(cycle) {
  assert.equal(
    await page.locator("main.rxs-page").count(),
    0,
    "Rexonance must be unmounted before collecting",
  );
  await cdp.send("Runtime.releaseObjectGroup", { objectGroup: "console" });
  for (let i = 0; i < 3; i++) await cdp.send("HeapProfiler.collectGarbage");
  let chunks = [];
  const onChunk = ({ chunk }) => chunks.push(chunk);
  cdp.on("HeapProfiler.addHeapSnapshotChunk", onChunk);
  try {
    await cdp.send("HeapProfiler.takeHeapSnapshot", {
      reportProgress: false,
      captureNumericValue: false,
    });
  } finally {
    cdp.off("HeapProfiler.addHeapSnapshotChunk", onChunk);
  }
  const snapshot = JSON.parse(chunks.join(""));
  chunks = null;
  const row = {
    cycle,
    ...(await cdp.send("Memory.getDOMCounters")),
    ...detachedDOMReport(snapshot, { allRetainers: true }),
    ...(await page.evaluate(() => {
      const refs = window.__rxsHeapProbes ?? [];
      return {
        trackedPageNodes: refs.length,
        retainedPageNodes: refs.reduce((count, ref) => count + (ref.deref() ? 1 : 0), 0),
      };
    })),
  };
  rows.push(row);
  console.log(JSON.stringify(row));
}

try {
  await page.goto(`${base}/library`, { waitUntil: "load" });
  await settle();
  initialTimeOrigin = await page.evaluate(() => performance.timeOrigin);
  await measure(0);
  for (let cycle = 1; cycle <= 5; cycle++) {
    await go("/rexonance-saga");
    const image = page.locator(".rxs-p14-overview img");
    assert.match(
      await image.getAttribute("sizes"),
      /^auto, /,
      "keep automatic lazy-image sizing while mounted",
    );
    if (unvisitedP14) {
      assert.equal(
        await image.evaluate((node) => node.getBoundingClientRect().top > innerHeight),
        true,
      );
    } else {
      await image.scrollIntoViewIfNeeded();
      await page.waitForFunction(() => {
        const image = document.querySelector(".rxs-p14-overview img");
        return image?.complete && image.naturalWidth > 0;
      });
    }
    // Only WeakRefs survive this completed evaluation job, never a live node,
    // NodeList, ElementHandle or DevTools console result. Include text/comments.
    await page.evaluate(() => {
      const refs = (window.__rxsHeapProbes ??= []);
      const main = document.querySelector("main.rxs-page");
      const walker = document.createTreeWalker(main, NodeFilter.SHOW_ALL);
      refs.push(new WeakRef(main));
      let node;
      while ((node = walker.nextNode())) refs.push(new WeakRef(node));
    });
    await go("/library");
    await measure(cycle);
  }
  if (process.env.HEAP_REPORT)
    await writeFile(
      process.env.HEAP_REPORT,
      JSON.stringify({ base, browser: browser.version(), baseline, unvisitedP14, rows }, null, 2),
    );
  if (!baseline) {
    for (const row of rows) {
      assert.equal(row.detachedMains, 0, `cycle ${row.cycle}: detached Rexonance page retained`);
      assert.equal(row.retainedPageNodes, 0, `cycle ${row.cycle}: former page DOM retained`);
      assert.equal(
        row.retainers.length,
        row.detachedNodes,
        `cycle ${row.cycle}: inspect every remaining off-document resource`,
      );
      assert.ok(
        row.retainers.every(({ path }) =>
          path.every(({ owner }) => !owner.includes("HTMLImageElement::ViewportChangeListener")),
        ),
        `cycle ${row.cycle}: an abandoned responsive-image listener retained a native node`,
      );
      if (row.cycle > 1)
        assert.deepEqual(
          row.histogram,
          rows[1].histogram,
          `cycle ${row.cycle}: off-document resource cohort changed after warm-up`,
        );
    }
    console.log(
      "PASS five SPA round trips + forced GC: no retained former page DOM or main.rxs-page; off-document resources do not grow",
    );
  }
} finally {
  await context.close();
  await browser.close();
}
