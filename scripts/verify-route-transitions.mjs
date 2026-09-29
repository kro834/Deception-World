// Frame-exact audit of the covered route changes (the file shutter,
// src/styles-transition-cinema.css): the page clock is frozen with the
// Playwright clock and every document animation is seeked to it, then the
// transition is stepped at 60 fps. Per cell, as in verify-rising-world: at
// most one general flash a second and no red flash. It also checks that the
// cover never shows a flat, empty frame (dark, with nothing in its brightest
// half percent above the ground), that the shutter is gone within its
// budget (and the gate released within its own), and that the hand-over removes data-loading only after the route
// has committed.
//
//   BASE_URL=http://localhost:8080 PW_BROWSER_CHANNEL=chrome node scripts/verify-route-transitions.mjs
//   ROUTE_PROFILES=desktop,phone ROUTE_SCENARIOS=world-saga,world-leddic (optional filters)
import assert from "node:assert/strict";
import { chromium } from "playwright";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:8082";
const FPS = 60;
const STEP = 1000 / FPS;
const PIXEL_UA =
  "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36";

const PROFILES = {
  desktop: { viewport: { width: 1440, height: 900 } },
  phone: {
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2,
  },
  android: {
    viewport: { width: 412, height: 915 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2,
    userAgent: PIXEL_UA,
  },
};

const riderOpen = (id) => ({
  start: "/world",
  dest: `/riders/${id}`,
  prep: async (page) => {
    await page.evaluate((rider) => document.getElementById(`rider-tab-${rider}`).click(), id);
    await page.waitForTimeout(900);
  },
  target: ".rider-dossier-open",
});
const menuDive = (start, href, dest) => ({ start, dest, menu: href });

// Every cover variant: the dives, the cut-ins, the sovereign gate, the
// file flip and the special-site dives.
const SCENARIOS = {
  "world-saga": riderOpen("saga"),
  "world-realm": riderOpen("realm"),
  "world-lore": riderOpen("lore"),
  "world-vandal": riderOpen("vandal"),
  "world-leddic": riderOpen("leddic"),
  "world-argenome": riderOpen("argenome"),
  "world-over-zeztz": riderOpen("over-zeztz"),
  "world-cipher": riderOpen("cipher"),
  "world-zeus": {
    start: "/world",
    dest: "/managers/zeus",
    target: 'a.signal[href="/managers/zeus"]',
  },
  "page-saga-realm": {
    start: "/riders/saga",
    dest: "/riders/realm",
    target: 'a[aria-label="レルムの資料へ"]',
  },
  "menu-dream": menuDive("/world", "/dream-chapter", "/dream-chapter"),
  "menu-rexonance": menuDive("/world", "/rexonance-saga#top", "/rexonance-saga"),
  "menu-extreme": menuDive("/world", "/extreme-saga#top", "/extreme-saga"),
  "menu-final": menuDive("/world", "/final-stage#top", "/final-stage"),
  // The dream dive back to the World (the Dream Chapter's return link): its
  // ground clears from the World side (styles-world-mirage.css).
  "dream-world": { start: "/dream-chapter", dest: "/world", target: ".dream-back-link" },
};

// Budgets from the press (fake clock): the slide control's 260 ms completion
// plus the shutter; the special sites start from the menu at once.
const GONE_BUDGET_MS = 1300;
// The gate itself unmounts once a docked portrait has handed over to the
// page's plate (its wipe runs about 800 ms from the hand-over).
const RELEASE_BUDGET_MS = 1800;

const pick = (list, all) =>
  list
    ? list
        .split(",")
        .map((name) => name.trim())
        .filter(Boolean)
    : Object.keys(all);

async function createAnalyser(browser) {
  const page = await browser.newPage();
  await page.setContent("<body></body>");
  await page.evaluate(() => {
    const lut = Array.from({ length: 256 }, (_, i) => {
      const v = i / 255;
      return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    });
    window.stats = async (b64, cssW, cssH, cellCss) => {
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const bitmap = await createImageBitmap(new Blob([bytes], { type: "image/jpeg" }));
      const W = Math.round(cssW / 2);
      const H = Math.round(cssH / 2);
      const canvas = new OffscreenCanvas(W, H);
      const context = canvas.getContext("2d", { willReadFrequently: true });
      context.drawImage(bitmap, 0, 0, W, H);
      const px = context.getImageData(0, 0, W, H).data;
      let sum = 0;
      let sum2 = 0;
      const L = new Float32Array(W * H);
      for (let i = 0, j = 0; i < px.length; i += 4, j += 1) {
        const value = 0.2126 * lut[px[i]] + 0.7152 * lut[px[i + 1]] + 0.0722 * lut[px[i + 2]];
        L[j] = value;
        sum += value;
        sum2 += value * value;
      }
      const n = W * H;
      const mean = sum / n;
      const cw = Math.round(cellCss / 2);
      const cells = [];
      for (let cy = 0; cy + cw <= H; cy += Math.floor(cw / 2)) {
        for (let cx = 0; cx + cw <= W; cx += Math.floor(cw / 2)) {
          let r = 0;
          let g = 0;
          let b = 0;
          let l = 0;
          let m = 0;
          for (let y = cy; y < cy + cw; y += 2) {
            for (let x = cx; x < cx + cw; x += 2) {
              const i = (y * W + x) * 4;
              r += lut[px[i]];
              g += lut[px[i + 1]];
              b += lut[px[i + 2]];
              l += L[y * W + x];
              m += 1;
            }
          }
          r /= m;
          g /= m;
          b /= m;
          l /= m;
          cells.push({
            L: l,
            red: Math.max(0, (r - g - b) * 320),
            sat: r / Math.max(1e-6, r + g + b),
          });
        }
      }
      // The brightest half percent of the frame: a dark, designed still (a
      // thin rule, a caption) lifts it off the ground; a flat frame does not.
      const sorted = Float32Array.from(L).sort();
      const p99 = sorted[Math.floor(sorted.length * 0.995)];
      return { mean, std: Math.sqrt(Math.max(0, sum2 / n - mean * mean)), p99, cells };
    };
    // WCAG 2.3.1 per cell: opposing changes of 10 % relative luminance (the
    // darker side under 0.8), or of saturated red; a flash is a pair.
    window.countFlashes = (series) => {
      const count = (get, threshold, qualifies) => {
        let worst = { perSecond: 0, at: null };
        for (let c = 0; c < series[0].cells.length; c += 1) {
          const turns = [];
          let reference = get(series[0].cells[c]);
          let referenceCell = series[0].cells[c];
          let direction = 0;
          for (const frame of series) {
            const cell = frame.cells[c];
            const value = get(cell);
            const delta = value - reference;
            if (Math.abs(delta) >= threshold && qualifies(referenceCell, cell)) {
              const next = Math.sign(delta);
              if (next !== direction) {
                turns.push(frame.t);
                direction = next;
              }
              reference = value;
              referenceCell = cell;
            } else if (
              Math.sign(delta) === direction &&
              ((direction > 0 && value > reference) || (direction < 0 && value < reference))
            ) {
              reference = value;
              referenceCell = cell;
            }
          }
          for (const start of turns) {
            const flashes = Math.floor(
              turns.filter((t) => t >= start && t < start + 1000).length / 2,
            );
            if (flashes > worst.perSecond) worst = { perSecond: flashes, at: Math.round(start) };
          }
        }
        return worst;
      };
      return {
        general: count(
          (cell) => cell.L,
          0.1,
          (a, b) => Math.min(a.L, b.L) < 0.8,
        ),
        red: count(
          (cell) => cell.red,
          20,
          (a, b) => a.sat >= 0.8 || b.sat >= 0.8,
        ),
      };
    };
  });
  return page;
}

async function audit(browser, analyser, profileName, name) {
  const scenario = SCENARIOS[name];
  const options = PROFILES[profileName];
  const touch = Boolean(options.hasTouch);
  const context = await browser.newContext(options);
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(BASE_URL + scenario.start, { waitUntil: "networkidle" });
  await page.waitForFunction(
    () =>
      !document.documentElement.hasAttribute("data-loading") &&
      !document.querySelector(".load-gate"),
    null,
    { timeout: 20000 },
  );
  await page.waitForTimeout(2500);
  if (scenario.prep) await scenario.prep(page);
  let target;
  if (scenario.menu) {
    const trigger = page.locator(".side-panel-trigger").first();
    if (touch) await trigger.tap();
    else await trigger.click();
    await page.waitForTimeout(1000);
    target = page.locator(`#site-side-panel a[href="${scenario.menu}"]`).first();
    await target.evaluate((element) => element.scrollIntoView({ block: "center" }));
  } else {
    target = page.locator(scenario.target).first();
    await target.scrollIntoViewIfNeeded();
    await page.waitForTimeout(1200);
  }
  const T0 = Date.now() + 5000;
  await page.clock.install({ time: T0 - 1000 });
  await page.clock.pauseAt(T0);
  await page.evaluate(() => {
    window.__seen = new Map();
    window.__freeze = () => {
      const now = performance.now();
      for (const animation of document.getAnimations()) {
        if (!window.__seen.has(animation)) window.__seen.set(animation, now);
        try {
          animation.pause();
          animation.currentTime = now - window.__seen.get(animation);
        } catch {
          /* A finished or cancelled animation keeps its state. */
        }
      }
    };
  });
  const { width, height } = options.viewport;
  const cell = width >= 1024 ? 341 : 160;
  const series = [];
  const shot = async (t) => {
    await page.evaluate(() => window.__freeze());
    const buffer = await page.screenshot({ type: "jpeg", quality: 80, scale: "css" });
    const stats = await analyser.evaluate(
      ([b, w, h, c]) => window.stats(b, w, h, c),
      [buffer.toString("base64"), width, height, cell],
    );
    series.push({ t, ...stats });
  };
  await shot(-STEP);
  if (touch) await target.tap();
  else await target.click();
  const states = [];
  let doneAt = null;
  let releasedAt = null;
  for (let frame = 0; frame < 240; frame += 1) {
    await page.clock.runFor(STEP);
    const t = (frame + 1) * STEP;
    await page.waitForTimeout(12);
    const state = await page.evaluate(() => {
      const gate = document.querySelector(".load-gate");
      // The cover is gone once its panels have left the screen and its stage
      // has faded; a docked portrait may still be handing over to the page's
      // own plate then (pointer events pass, the page is the reader's).
      const opacity = (element) => {
        let value = 1;
        for (let node = element; node && node !== document.body; node = node.parentElement) {
          value *= Number(getComputedStyle(node).opacity);
        }
        return value;
      };
      const shown = (element) => {
        const box = element.getBoundingClientRect();
        return (
          box.width > 1 &&
          box.height > 1 &&
          box.right > 1 &&
          box.bottom > 1 &&
          box.left < innerWidth - 1 &&
          box.top < innerHeight - 1 &&
          opacity(element) > 0.02
        );
      };
      const covers =
        Boolean(gate) &&
        (!gate.classList.contains("is-revealing") ||
          [...gate.querySelectorAll(".dwc-shutter > i, .rider-cutin-stage")].some(shown));
      return {
        path: location.pathname,
        loading: document.documentElement.hasAttribute("data-loading"),
        gate: gate?.className ?? null,
        covers,
      };
    });
    states.push({ t, ...state });
    series[series.length - 1].gate = state.gate;
    await shot(t);
    series[series.length - 1].gate = state.gate;
    if (state.path === scenario.dest && !state.covers && !state.loading) doneAt ??= t;
    if (state.path === scenario.dest && !state.gate && !state.loading) {
      releasedAt ??= t;
      if (t - releasedAt > 400) break;
    }
  }
  const flashes = await analyser.evaluate(
    (frames) => window.countFlashes(frames),
    series.map(({ t, cells }) => ({ t, cells })),
  );
  const firstGate = states.find((state) => state.gate);
  // Flat frames count while the cover holds; once data-loading goes, the
  // destination's own entrance owns the frame (reported, not asserted).
  const flat = (frame) => frame.gate && frame.mean < 0.05 && frame.std < 0.012 && frame.p99 < 0.05;
  const blank = series.filter((frame) => flat(frame) && /is-covering/.test(frame.gate));
  const flatAfter = series.filter((frame) => flat(frame) && !/is-covering/.test(frame.gate));
  // data-loading goes only after the destination is there (the hand-over).
  const handedOver = states.find((state) => firstGate && state.t > firstGate.t && !state.loading);
  const result = {
    check: "route-transition",
    profile: profileName,
    scenario: name,
    gate: firstGate?.gate.match(/has-cine|is-cine-\w+/g)?.join(" ") ?? null,
    coverAt: firstGate && Math.round(firstGate.t),
    handOverAt: handedOver && Math.round(handedOver.t),
    goneAt: doneAt && Math.round(doneAt),
    releasedAt: releasedAt && Math.round(releasedAt),
    flashGeneral: flashes.general.perSecond,
    flashRed: flashes.red.perSecond,
    blankFrames: blank.length,
    blankAt: blank.map((frame) => Math.round(frame.t)),
    flatAfterHandOver: flatAfter.map((frame) => Math.round(frame.t)),
    peakMean: Number(Math.max(...series.map((frame) => frame.mean)).toFixed(3)),
    errors,
  };
  console.log(JSON.stringify(result));
  await context.close();
  assert.ok(firstGate, `${profileName} ${name}: a cover was shown`);
  assert.match(firstGate.gate, /has-cine/, `${profileName} ${name}: the file shutter`);
  assert.equal(
    handedOver?.path,
    scenario.dest,
    `${profileName} ${name}: hand-over after the commit`,
  );
  assert.ok(
    flashes.general.perSecond <= 1,
    `${profileName} ${name}: general flashes ${JSON.stringify(flashes.general)}`,
  );
  assert.equal(
    flashes.red.perSecond,
    0,
    `${profileName} ${name}: red flashes ${JSON.stringify(flashes.red)}`,
  );
  assert.equal(blank.length, 0, `${profileName} ${name}: flat empty cover frames`);
  assert.ok(
    doneAt && doneAt <= GONE_BUDGET_MS,
    `${profileName} ${name}: the shutter is gone by ${doneAt} ms`,
  );
  assert.ok(
    releasedAt && releasedAt <= RELEASE_BUDGET_MS,
    `${profileName} ${name}: the gate is released by ${releasedAt} ms`,
  );
  assert.deepEqual(errors, [], `${profileName} ${name}: page errors`);
  return result;
}

const browser = await chromium.launch({ channel: process.env.PW_BROWSER_CHANNEL || undefined });
try {
  const analyser = await createAnalyser(browser);
  const failures = [];
  for (const profile of pick(process.env.ROUTE_PROFILES, PROFILES)) {
    for (const name of pick(process.env.ROUTE_SCENARIOS, SCENARIOS)) {
      try {
        await audit(browser, analyser, profile, name);
      } catch (error) {
        failures.push(`${profile} ${name}: ${error.message.split("\n")[0]}`);
        console.log(
          JSON.stringify({
            check: "route-transition",
            profile,
            scenario: name,
            failed: error.message.split("\n")[0],
          }),
        );
      }
    }
  }
  assert.deepEqual(failures, [], "route transitions");
  console.log("route transitions: ok");
} finally {
  await browser.close();
}
