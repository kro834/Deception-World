// Production-build regression (audit #31): leaving /rexonance-saga for /world
// releases the whole page — its canvases, scroll engine and listeners — however
// the reader leaves. Five genuine SPA round trips from /world, each leaving a
// different way, then forced GC and a Chrome heap snapshot after every return:
//   1. local-nav presses, then the browser's Back button;
//   2. the brand link while a form change and its stage card are running;
//   3. router navigation while the form art is still downloading (stalled);
//   4. the side menu after a press in the P14 comparator;
//   5. Back while the entry cover still plays (the lower sections pending).
// A detached <main class="rxs-page"> still reachable, or any node of a former
// page (tracked with WeakRefs, which never keep a node alive), is a leak.
// Off-document decoded-image caches are app-wide, bounded and intentional
// (scripts/verify-rexonance-heap.mjs pins those); they are reported, not failed.
// No element handle, NodeList or console result may outlive a step: those are
// strong DevTools roots and would make every page look retained.
// BASE_URL=http://127.0.0.1:8082 PW_BROWSER_CHANNEL=chrome node scripts/verify-rexonance-release.mjs
// RELEASE_REPORT=/tmp/rxs-release.json writes every row; --record-baseline
// records an unfixed build without asserting that it releases its pages.
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { chromium } from "playwright";
import { checkedUrl } from "./browser-guard.mjs";
import { detachedDOMReport } from "./heap-retainers.mjs";

const base = checkedUrl(process.env.BASE_URL || "http://127.0.0.1:8082");
const baseline = process.argv.includes("--record-baseline");
// The form change's art (the panel originals) and the suit-up's form figures.
const STALLED = [
  "/rider-rexonance-max-20260923.webp",
  "/rider-rexonance-ultra-20260923.webp",
  "/rexonance-forms-20261011/",
];
const browser = await chromium.launch({ channel: process.env.PW_BROWSER_CHANNEL || "chrome" });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
const cdp = await context.newCDPSession(page);
const errors = [];
const rows = [];
let timeOrigin = 0;
page.on("pageerror", (error) => errors.push(error.message));
// Requests that never answer: a connection that stalls mid-visit. Routing is
// on for that cycle only (Playwright bypasses the HTTP cache while it is).
const stalled = (url) => STALLED.some((path) => url.pathname.startsWith(path));
let stalledRequests = 0;
const stall = () => {
  stalledRequests += 1;
};

const pathname = () => new URL(page.url()).pathname;

async function settle() {
  await page.waitForFunction(
    () =>
      !document.documentElement.hasAttribute("data-loading") &&
      !document.documentElement.hasAttribute("data-route-cover") &&
      !document.querySelector(".load-gate"),
    undefined,
    { timeout: 60000 },
  );
  await page.waitForFunction(
    () => !document.documentElement.hasAttribute("data-route-scroll-settling"),
    undefined,
    { timeout: 60000 },
  );
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  // Passive unmount effects, transition timers and prefetch aborts finish.
  await page.waitForTimeout(1500);
}

async function assertClientNavigation(label) {
  assert.equal(
    await page.evaluate(() => performance.timeOrigin),
    timeOrigin,
    `${label}: must be client navigation, not a fresh document`,
  );
}

async function sidePanel(hrefs) {
  await page.locator(".side-panel-trigger").first().click();
  const links = page.locator(hrefs.map((href) => `.side-panel a[href="${href}"]`).join(", "));
  await links.first().waitFor({ state: "visible", timeout: 15000 });
  await links.first().click();
}

async function enterRexonance(cycle, covered) {
  await sidePanel(["/rexonance-saga#top", "/rexonance-saga"]);
  await page.waitForURL((url) => url.pathname === "/rexonance-saga", { timeout: 60000 });
  if (covered) {
    // Mounted under the call's cover: the hero only, P14 on still pending.
    await page.waitForFunction(
      () =>
        document.documentElement.hasAttribute("data-loading") &&
        Boolean(document.querySelector("main.rxs-page .rxs-lower-pending")),
      undefined,
      { timeout: 30000 },
    );
  } else {
    await settle();
    // The lower sections (P14 on) render in an idle slot after the reveal.
    await page.waitForFunction(() => Boolean(document.getElementById("p14")), undefined, {
      timeout: 30000,
    });
  }
  await assertClientNavigation(`cycle ${cycle} arrival`);
}

async function reveal(selector) {
  await page.evaluate((target) => {
    document.querySelector(target).scrollIntoView({ block: "center", behavior: "instant" });
  }, selector);
  await page.waitForTimeout(600);
}

async function backToWorld() {
  for (let step = 0; step < 10 && pathname() !== "/world"; step += 1) {
    await page.evaluate(() => history.back());
    await page.waitForTimeout(350);
  }
}

// Only WeakRefs survive this completed evaluation: never a node or NodeList.
async function trackPage(cycle) {
  return page.evaluate((label) => {
    const main = document.querySelector("main.rxs-page");
    const refs = [new WeakRef(main)];
    const walker = document.createTreeWalker(main, NodeFilter.SHOW_ALL);
    let node;
    while ((node = walker.nextNode())) refs.push(new WeakRef(node));
    (window.__rxsReleaseProbes ??= []).push({ label, refs });
    return refs.length;
  }, cycle);
}

const DEPARTURES = [
  {
    name: "local-nav presses, then Back",
    async run() {
      for (const id of ["performance", "p14", "stages", "system"]) {
        await page.locator(`.rxs-local-nav nav a[href="#${id}"]`).click();
        await page.waitForTimeout(450);
      }
      await backToWorld();
      return "history.back";
    },
  },
  {
    name: "brand link during a form change",
    async run() {
      await reveal("#stages");
      await page.locator("#rxs-stage-tab-max").click();
      await page.waitForFunction(
        () =>
          document.querySelector(".rxs-stage-tabs")?.dataset.stage === "max" &&
          Boolean(document.querySelector(".rxs-form-morph")),
      );
      await page.waitForTimeout(160);
      await page.locator(".rxs-local-nav .rxs-brand").click();
      return "brand link";
    },
  },
  {
    name: "router navigation while the form art downloads",
    stall: true,
    async run() {
      await reveal("#stages");
      await page.locator("#rxs-stage-tab-ultra").click();
      await page.waitForTimeout(300);
      // The suit-up ends on the chosen form: its figures load as it nears the end.
      await page.evaluate(() => {
        const runway = document.querySelector(".rzn-suitup");
        const top = scrollY + runway.getBoundingClientRect().top;
        scrollTo({ top: top + runway.offsetHeight * 0.85, behavior: "instant" });
      });
      await page.waitForTimeout(700);
      const routed = await page.evaluate(() => {
        const router = window.__TSR_ROUTER__;
        if (!router?.navigate) return false;
        void router.navigate({ to: "/world" });
        return true;
      });
      if (routed) return "router.navigate";
      await page.locator(".rxs-local-nav .rxs-brand").click();
      return "brand link (no router global)";
    },
  },
  {
    name: "side menu after a P14 press",
    async run() {
      await reveal(".rxs-p14-range-labels");
      await page.locator(".rxs-p14-range-labels button").nth(1).click();
      await page.waitForTimeout(250);
      await sidePanel(["/world", "/world#top"]);
      return "side menu";
    },
  },
  {
    name: "Back during the entry cover",
    covered: true,
    async run() {
      await backToWorld();
      return "history.back";
    },
  },
];

async function measure(cycle, name, details) {
  assert.equal(await page.locator("main.rxs-page").count(), 0, `${name}: Rexonance unmounted`);
  await cdp.send("Runtime.releaseObjectGroup", { objectGroup: "console" });
  for (let i = 0; i < 3; i += 1) await cdp.send("HeapProfiler.collectGarbage");
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
  const report = detachedDOMReport(snapshot);
  const probes = await page.evaluate(() =>
    (window.__rxsReleaseProbes ?? []).map(({ label, refs }) => ({
      label,
      retained: refs.reduce((count, ref) => count + (ref.deref() ? 1 : 0), 0),
    })),
  );
  const row = {
    cycle,
    departure: name,
    ...details,
    detachedMains: report.detachedMains,
    detachedNodes: report.detachedNodes,
    retainedPageNodes: probes.reduce((sum, probe) => sum + probe.retained, 0),
    retainedPages: probes.filter((probe) => probe.retained).map((probe) => probe.label),
    domCounters: await cdp.send("Memory.getDOMCounters"),
    retainers: report.retainers.map(({ target, path }) => ({
      target: target.slice(0, 120),
      path: path.slice(-10).map(({ owner, edge }) => `${owner.slice(0, 140)} --${edge ?? ""}`),
    })),
  };
  rows.push(row);
  const { retainers, ...summary } = row;
  console.log(JSON.stringify(summary));
  for (const { path } of retainers) console.log(`  retained via:\n    ${path.join("\n    ")}`);
}

try {
  await page.goto(new URL("/world", base).href, { waitUntil: "load" });
  await settle();
  timeOrigin = await page.evaluate(() => performance.timeOrigin);
  for (const [index, departure] of DEPARTURES.entries()) {
    const cycle = index + 1;
    stalledRequests = 0;
    if (departure.stall) await page.route(stalled, stall);
    await enterRexonance(cycle, departure.covered);
    const trackedNodes = await trackPage(cycle);
    const via = await departure.run();
    await page.waitForURL((url) => url.pathname === "/world", { timeout: 60000 });
    await settle();
    await assertClientNavigation(`cycle ${cycle} return`);
    if (departure.stall)
      assert.ok(stalledRequests > 0, `cycle ${cycle}: the form art must still be downloading`);
    await measure(cycle, departure.name, { via, trackedNodes, stalledRequests });
    // The stalled requests stay pending: the page must not wait for them.
    if (departure.stall) await page.unroute(stalled, stall);
  }
  if (process.env.RELEASE_REPORT)
    await writeFile(
      process.env.RELEASE_REPORT,
      `${JSON.stringify({ base, browser: browser.version(), baseline, rows, errors }, null, 2)}\n`,
    );
  if (!baseline) {
    for (const row of rows) {
      assert.equal(
        row.detachedMains,
        0,
        `cycle ${row.cycle} (${row.departure}): detached main.rxs-page retained`,
      );
      assert.equal(
        row.retainedPageNodes,
        0,
        `cycle ${row.cycle} (${row.departure}): former page DOM retained (${row.retainedPages})`,
      );
    }
    assert.deepEqual(errors, [], "no uncaught page errors");
    console.log(
      "PASS five /rexonance-saga → /world round trips (Back, brand link, router with stalled art, side menu, Back under the cover) + forced GC: no detached main.rxs-page, no former page node reachable",
    );
  }
} finally {
  await context.close();
  await browser.close();
}
