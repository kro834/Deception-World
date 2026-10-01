import assert from "node:assert/strict";
import { chromium } from "playwright";

const base = process.env.BASE_URL || "http://127.0.0.1:8083";
const browser = await chromium.launch({ channel: "chrome" });
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await context.newPage();
await page.addInitScript(() => {
  performance.setResourceTimingBufferSize(4000);
  const audit = {
    commits: 0,
    rexonanceCommits: 0,
    navReads: 0,
    navFrames: {},
    navStacks: {},
    frame: 0,
    observerCreates: 0,
    observerDisposes: 0,
  };
  window.__rexonancePerfAudit = audit;
  const frame = () => {
    audit.frame += 1;
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
  const rect = Element.prototype.getBoundingClientRect;
  Element.prototype.getBoundingClientRect = function (...args) {
    if (this.matches(".rxs-local-nav")) {
      audit.navReads += 1;
      audit.navFrames[audit.frame] = (audit.navFrames[audit.frame] || 0) + 1;
      const caller = new Error().stack.split("\n").slice(2, 4).join("\n");
      audit.navStacks[caller] = (audit.navStacks[caller] || 0) + 1;
    }
    return rect.apply(this, args);
  };
  for (const name of ["ResizeObserver", "IntersectionObserver", "MutationObserver"]) {
    const Observer = window[name];
    window[name] = class extends Observer {
      constructor(...args) {
        super(...args);
        audit.observerCreates += 1;
      }
      disconnect() {
        audit.observerDisposes += 1;
        return super.disconnect();
      }
    };
  }
  // Count commits without changing the app's React tree. Named component
  // counts are available on the development build; total commits work on both.
  window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
    supportsFiber: true,
    renderers: new Map(),
    inject: (renderer) => {
      window.__REACT_DEVTOOLS_GLOBAL_HOOK__.renderers.set(1, renderer);
      return 1;
    },
    checkDCE: () => {},
    onCommitFiberRoot: (_renderer, root) => {
      audit.commits += 1;
      const visit = (fiber) => {
        if (!fiber) return;
        if (fiber.type?.name === "RexonanceSaga" && fiber.flags & 1) {
          audit.rexonanceCommits += 1;
        }
        visit(fiber.child);
        visit(fiber.sibling);
      };
      visit(root.current);
    },
    onCommitFiberUnmount: () => {},
  };
});

const cdp = await context.newCDPSession(page);
await cdp.send("Performance.enable");

async function metrics() {
  const result = await cdp.send("Performance.getMetrics");
  const selected = new Set([
    "LayoutCount",
    "RecalcStyleCount",
    "LayoutDuration",
    "RecalcStyleDuration",
    "ScriptDuration",
  ]);
  return Object.fromEntries(
    result.metrics
      .filter((metric) => selected.has(metric.name))
      .map((metric) => [metric.name, metric.value]),
  );
}

async function measure(name, operation) {
  await page.waitForTimeout(850);
  const before = await metrics();
  const beforeAudit = await page.evaluate(() => structuredClone(window.__rexonancePerfAudit));
  await operation();
  await page.waitForTimeout(850);
  const after = await metrics();
  const afterAudit = await page.evaluate(() => structuredClone(window.__rexonancePerfAudit));
  const result = {
    name,
    metrics: Object.fromEntries(
      Object.keys(before).map((key) => [key, Number((after[key] - before[key]).toFixed(6))]),
    ),
    commits: afterAudit.commits - beforeAudit.commits,
    rexonanceCommits: afterAudit.rexonanceCommits - beforeAudit.rexonanceCommits,
    navReads: afterAudit.navReads - beforeAudit.navReads,
    maxNavReadsPerFrame: Math.max(
      0,
      ...Object.entries(afterAudit.navFrames)
        .filter(([frame]) => Number(frame) > beforeAudit.frame)
        .map(([, count]) => count),
    ),
    observerCreates: afterAudit.observerCreates - beforeAudit.observerCreates,
    observerDisposes: afterAudit.observerDisposes - beforeAudit.observerDisposes,
    navCallers: Object.fromEntries(
      Object.entries(afterAudit.navStacks)
        .map(([caller, count]) => [caller, count - (beforeAudit.navStacks[caller] || 0)])
        .filter(([, count]) => count),
    ),
  };
  console.log(JSON.stringify(result));
  return result;
}

try {
  await page.goto(`${base}/rexonance-saga`, { waitUntil: "networkidle" });
  await page.waitForFunction(
    () => document.querySelector(".rxs-stage-tabs")?.dataset.liquidInitialized === "true",
  );
  const startupAlternateRequests = await page.evaluate(() =>
    performance
      .getEntriesByType("resource")
      .filter((entry) => /site-(max|ultra)|rider-rexonance-(max|ultra)/.test(entry.name))
      .map((entry) => entry.name),
  );
  assert.deepEqual(
    startupAlternateRequests,
    [],
    "Alternate art must not compete with the hero at startup",
  );

  await page.locator(".rxs-stage-tabs").scrollIntoViewIfNeeded();
  await page.waitForTimeout(1500);
  const warmed = await page.evaluate(() =>
    performance
      .getEntriesByType("resource")
      .filter((entry) => /rexonance.*(?:max|ultra)/.test(entry.name))
      .map((entry) => ({ name: new URL(entry.name).pathname, bytes: entry.transferSize })),
  );
  console.log(
    JSON.stringify({
      name: "nearby-art-warmup",
      resources: warmed,
      pageState: await page.evaluate(() => ({
        hidden: document.hidden,
        connection: navigator.connection?.effectiveType,
        resourceCount: performance.getEntriesByType("resource").length,
      })),
    }),
  );

  const repeated = await measure("repeat-selected-stage-60", () =>
    page.evaluate(() => {
      const selected = document.querySelector('.rxs-stage-tabs [aria-selected="true"]');
      for (let i = 0; i < 60; i += 1) selected.click();
    }),
  );
  assert.equal(
    repeated.rexonanceCommits,
    0,
    "Repeated selected tab must not render Rexonance again",
  );
  const stages = await measure("stage-changes-30", () =>
    page.evaluate(async () => {
      const tabs = document.querySelectorAll(".rxs-stage-tabs button");
      for (let i = 0; i < 30; i += 1) {
        tabs[(i + 1) % tabs.length].click();
        await new Promise(requestAnimationFrame);
      }
    }),
  );
  assert.equal(
    stages.observerCreates,
    0,
    "Stage changes must not reinitialize observers or art warmup",
  );

  const p14 = await measure("p14-inputs-60", () =>
    page.evaluate(async () => {
      const slider = document.querySelector(".rxs-p14-ios-slider input");
      const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
      for (let i = 0; i < 60; i += 1) {
        setValue.call(slider, String((i % 2) + 1));
        slider.dispatchEvent(new Event("input", { bubbles: true }));
        slider.dispatchEvent(new Event("change", { bubbles: true }));
        await new Promise(requestAnimationFrame);
      }
    }),
  );
  assert.equal(p14.observerCreates, 0, "P14 inputs must not reinitialize observers or art warmup");

  const scroll = await measure("scroll-past-hero-60", () =>
    page.evaluate(async () => {
      const start = scrollY;
      for (let i = 0; i < 60; i += 1) {
        scrollTo({ top: start + i * 6, behavior: "instant" });
        await new Promise(requestAnimationFrame);
      }
    }),
  );
  assert.equal(scroll.rexonanceCommits, 0, "Scroll must not render Rexonance state");

  await measure("resize-20", async () => {
    for (let i = 0; i < 20; i += 1) {
      await page.setViewportSize({ width: i % 2 ? 1280 : 1024, height: i % 2 ? 900 : 768 });
      await page.waitForTimeout(25);
    }
  });
  const menu = await measure("menu-open-close-6", async () => {
    for (let i = 0; i < 6; i += 1) {
      await page.locator(".rxs-menu-trigger").click();
      await page.locator("#site-side-panel").waitFor({ state: "visible" });
      await page.keyboard.press("Escape");
      await page.locator("#site-side-panel").waitFor({ state: "hidden" });
    }
  });
  assert.equal(menu.observerCreates, 0, "Menu toggles must not restart stage warmup");
  const finalResources = await page.evaluate(() =>
    performance
      .getEntriesByType("resource")
      .filter((entry) => /rexonance.*(?:max|ultra)/.test(entry.name))
      .map((entry) => ({ name: new URL(entry.name).pathname, bytes: entry.transferSize })),
  );
  console.log(JSON.stringify({ name: "final-alternate-resources", resources: finalResources }));
} finally {
  await browser.close();
}
