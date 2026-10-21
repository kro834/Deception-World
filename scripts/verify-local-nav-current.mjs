// Run against a built preview, outside the browser-free npm test suite:
// BASE_URL=http://127.0.0.1:8082 OUTPUT_DIR=/tmp/local-nav node scripts/verify-local-nav-current.mjs
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { chromium, webkit } from "playwright";
import { checkedOutputPath, checkedUrl } from "./browser-guard.mjs";

const base = checkedUrl(process.env.BASE_URL || "http://127.0.0.1:8082");
const output = checkedOutputPath(
  process.env.OUTPUT_DIR || `/tmp/local-nav-current-${process.pid}`,
  ["/tmp", "/private/tmp", tmpdir()],
);
const engine = process.env.PW_ENGINE || "chromium";
assert.ok(["chromium", "webkit"].includes(engine), `unsupported PW_ENGINE: ${engine}`);
const profiles = [
  { name: "desktop", viewport: { width: 1440, height: 900 } },
  { name: "tablet-portrait", viewport: { width: 1024, height: 1366 }, hasTouch: true },
  { name: "phone-390", viewport: { width: 390, height: 844 }, hasTouch: true },
  { name: "landscape-short", viewport: { width: 844, height: 390 }, hasTouch: true },
].filter((profile) => !process.env.PW_PROFILE || process.env.PW_PROFILE === profile.name);
assert.ok(profiles.length, "PW_PROFILE must name an existing viewport profile");
const routes = ["rexonance-saga", "extreme-saga"];
const chapterList = ["performance", "p14", "stages", "system"];
// Owner (2026-10-21): Rexonance's bar lists its five chapters (03 = the suit-up, #assembly).
const routeChapters = {
  "rexonance-saga": ["performance", "p14", "assembly", "stages", "system"],
  "extreme-saga": chapterList,
};
const report = { base, engine, startedAt: new Date().toISOString(), results: [], ok: false };
await mkdir(output, { recursive: true });

async function ready(page, route) {
  await page.goto(new URL(`/${route}`, base).href, { waitUntil: "networkidle" });
  await page.waitForFunction(
    () =>
      document.querySelector(".rxs-stage-tabs")?.dataset.liquidInitialized === "true" &&
      !document.documentElement.hasAttribute("data-route-cover") &&
      !document.documentElement.hasAttribute("data-loading") &&
      !document.querySelector(".load-gate"),
    null,
    { timeout: 30000 },
  );
  await page.evaluate(() => document.fonts.ready);
  assert.deepEqual(
    await page
      .locator(".rxs-local-nav nav a")
      .evaluateAll((links) => links.map((link) => link.hash.slice(1))),
    routeChapters[route],
  );
}

async function snapshot(page) {
  return page.evaluate(() => {
    const viewportHeight = document.documentElement.clientHeight || innerHeight;
    const band = {
      top: Math.floor(viewportHeight * 0.5),
      bottom: viewportHeight - Math.floor(viewportHeight * 0.49),
    };
    const links = [...document.querySelectorAll(".rxs-local-nav nav a")].map((link) => {
      const target = document.getElementById(decodeURIComponent(link.hash.slice(1)));
      const bounds = target.getBoundingClientRect();
      // A chapter also spans the elements its link names (rx19: the suit-up's runway).
      const parts = (link.dataset.localNavThrough || "")
        .split(/\s+/)
        .map((id) => (id ? document.getElementById(id) : null))
        .filter(Boolean)
        .map((part) => part.getBoundingClientRect());
      const style = getComputedStyle(link);
      // The bar's own line under a link (its hover/focus line), lit for the chapter.
      const line = getComputedStyle(link, "::after");
      const lineScale = line.scale === "none" ? 1 : Number.parseFloat(line.scale);
      return {
        id: target.id,
        current: link.getAttribute("aria-current"),
        section: { top: bounds.top, bottom: bounds.bottom, height: bounds.height },
        crossing: [bounds, ...parts].some(
          (part) => part.top <= band.bottom && part.bottom >= band.top,
        ),
        color: style.color,
        underline: style.textDecorationLine,
        lit:
          line.content !== "none" &&
          line.display !== "none" &&
          lineScale >= 0.99 &&
          Number.parseFloat(line.height) >= 2 &&
          Number(line.opacity) > 0.9,
        navVisible: Boolean(link.getClientRects().length),
      };
    });
    return {
      viewport: { width: innerWidth, height: innerHeight, rootHeight: viewportHeight },
      scrollY,
      hash: location.hash,
      band,
      links,
      expected: links.filter((link) => link.crossing).at(-1)?.id ?? null,
      current: links.filter((link) => link.current === "location").map((link) => link.id),
      railLocked: document.documentElement.hasAttribute("data-rail-lock"),
      overflowX: document.documentElement.scrollWidth > innerWidth + 1,
    };
  });
}

async function verifyCurrent(page, expected, label) {
  await page.waitForFunction(
    (wanted) => {
      const links = [...document.querySelectorAll('.rxs-local-nav nav a[aria-current="location"]')];
      // The lit line has finished drawing out (or in) wherever it transitions.
      const settled = [...document.querySelectorAll(".rxs-local-nav nav a")].every((link) => {
        const scale = getComputedStyle(link, "::after").scale;
        const value = scale === "none" ? 1 : Number.parseFloat(scale);
        return link.hash === `#${wanted}` ? value >= 0.99 : value <= 0.01;
      });
      return wanted === null
        ? links.length === 0 && settled
        : links.length === 1 && links[0].hash === `#${wanted}` && settled;
    },
    expected,
    { timeout: 7000 },
  );
  // Let the page's existing scroll-linked rails and layout settle too; an
  // intermediate match during a smooth jump must not be accepted as success.
  await page.waitForTimeout(180);
  const state = await snapshot(page);
  assert.deepEqual(
    state.current,
    expected === null ? [] : [expected],
    `${label}: exactly the requested chapter is current`,
  );
  assert.equal(
    state.expected,
    expected,
    `${label}: the selected chapter must actually cross the observer's middle band`,
  );
  assert.equal(
    state.railLocked,
    false,
    `${label}: section travel must not leave a rail scroll lock`,
  );
  assert.equal(state.overflowX, false, `${label}: navigation must not add horizontal overflow`);
  for (const link of state.links) {
    assert.ok(
      link.current === null || link.current === "location",
      `${label}: correct aria-current value`,
    );
    // Audit #23: the mark is the bar's own line, drawn out at 2px, not a text underline.
    assert.equal(
      link.lit,
      link.id === expected,
      `${label}: only the current chapter's line is lit`,
    );
    if (link.id === expected) {
      assert.ok(link.lit, `${label}: current chapter has a non-color mark`);
      assert.ok(
        state.links
          .filter((other) => other.id !== expected)
          .every((other) => other.color !== link.color),
        `${label}: current chapter's light differs from the inactive links`,
      );
    }
  }
  return { label, ...state };
}

async function visitChapter(page, id, label) {
  await page.evaluate((target) => {
    const bounds = document.getElementById(target).getBoundingClientRect();
    const height = document.documentElement.clientHeight || innerHeight;
    // Read the section near its beginning, but put content (not the gap above
    // it) on the helper's middle band. Huge pinned sections need not be crossed
    // in full, and native anchor scroll margins do not alter this contract.
    const inside = Math.min(bounds.height / 2, height * 0.6);
    scrollTo({ top: scrollY + bounds.top + inside - height / 2, behavior: "instant" });
  }, id);
  return verifyCurrent(page, id, label);
}

const browser = await (engine === "webkit" ? webkit : chromium).launch(
  engine === "webkit" ? {} : { channel: process.env.PW_BROWSER_CHANNEL || "chrome" },
);
try {
  for (const route of routes) {
    for (const profile of profiles) {
      const context = await browser.newContext(profile);
      const page = await context.newPage();
      const result = {
        route,
        profile: profile.name,
        checks: [],
        errors: [],
        requestFailures: [],
        ok: false,
      };
      report.results.push(result);
      page.on("pageerror", (error) => result.errors.push(error.message));
      page.on("requestfailed", (request) =>
        result.requestFailures.push({ url: request.url(), error: request.failure()?.errorText }),
      );
      try {
        await ready(page, route);
        await page.evaluate(() => scrollTo({ top: 0, behavior: "instant" }));
        result.checks.push(await verifyCurrent(page, null, "hero has no stale current chapter"));
        const chapters = routeChapters[route];
        for (const id of chapters)
          result.checks.push(await visitChapter(page, id, `forward/${id}`));
        for (const id of [...chapters].reverse())
          result.checks.push(await visitChapter(page, id, `reverse/${id}`));
        await visitChapter(page, "p14", "before resize");
        result.screenshot = resolve(output, `local-nav-${engine}-${route}-${profile.name}.png`);
        await page.screenshot({ path: result.screenshot });

        const rotated = { width: profile.viewport.height, height: profile.viewport.width };
        await page.setViewportSize(rotated);
        await page.waitForTimeout(250);
        const resized = await snapshot(page);
        result.checks.push(
          await verifyCurrent(
            page,
            resized.expected,
            "resized geometry replaces previous current chapter",
          ),
        );
        await page.evaluate(() => scrollTo({ top: 0, behavior: "instant" }));
        result.checks.push(
          await verifyCurrent(page, null, "after resize/hero clears the old chapter"),
        );
        result.checks.push(await visitChapter(page, "stages", "after resize/new chapter"));
        assert.deepEqual(result.errors, [], `${route}/${profile.name}: no uncaught browser errors`);
        result.ok = true;
        console.log(
          `PASS ${engine}/${route}/${profile.name}: forward, reverse, unique location, current styling, resize and clear`,
        );
      } catch (error) {
        result.failure = error.stack || error.message;
        result.finalState = await snapshot(page).catch(() => null);
        await page
          .screenshot({
            path: resolve(output, `local-nav-${engine}-${route}-${profile.name}-failure.png`),
          })
          .catch(() => {});
        throw error;
      } finally {
        await context.close();
      }
    }
  }
  report.ok = true;
} finally {
  report.finishedAt = new Date().toISOString();
  await writeFile(
    resolve(output, `local-nav-${engine}.json`),
    `${JSON.stringify(report, null, 2)}\n`,
  );
  await browser.close();
}
