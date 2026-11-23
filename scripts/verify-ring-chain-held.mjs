// The pulley-and-thread chain's held-check (DESIGN.md section 10, 2026-11-23,
// owner: 「変身シーン以外すべて」). Every route is scrolled slowly to the bottom
// with real wheel / touch gestures on a desktop and a phone; then nothing that
// the chain or an absorbed reveal holds may remain above the fold edge. Also:
// a jump back to the top and a jump into the middle, and on the dossiers every
// d1 orbit part in turn. Prints how many parts chained per route (coverage).
// MOTION=reduce: nothing may ever be held or moved. MOTION=economy: the
// chain's order and fade only, never a thread.
//   BASE_URL=http://127.0.0.1:<port> [PROFILES=desktop,phone] [MOTION=reduce|economy]
//     node scripts/verify-ring-chain-held.mjs [route ...]
import { chromium } from "playwright";

const base = process.env.BASE_URL || "http://127.0.0.1:8082";
const ROUTES = [
  "/",
  "/world",
  "/riders/saga",
  "/managers/lejas",
  "/characters/ciel",
  "/library",
  "/gallery",
  "/final-stage",
  "/saga-cinema",
  "/dream-chapter",
  "/rexonance-saga",
  "/far-from-saga",
  "/extreme-saga",
  "/meta-unitas-saga",
  "/illusionculum-saga",
];
const only = process.argv.slice(2);
const routes = only.length ? only : ROUTES;
const profiles = (process.env.PROFILES || "desktop,phone").split(",");
const motion = process.env.MOTION || "full";
const browser = await chromium.launch({ channel: process.env.PW_BROWSER_CHANNEL || "chrome" });
let failures = 0;

// Seen-tracking: every element the chain ever touched (data-ring-link) or absorbed.
const INIT = () => {
  const w = /** @type {any} */ (window);
  w.__ringSeen = new Set();
  const mo = new MutationObserver((records) => {
    for (const r of records) {
      const el = /** @type {Element} */ (r.target);
      if (el.hasAttribute("data-ring-link") || el.hasAttribute("data-ring-absorb")) w.__ringSeen.add(el);
    }
  });
  const start = () =>
    mo.observe(document.documentElement, {
      subtree: true,
      attributes: true,
      attributeFilter: ["data-ring-link", "data-ring-absorb"],
    });
  if (document.documentElement) start();
  else document.addEventListener("DOMContentLoaded", start);
};

// What is still held: chain holds, and absorbed reveals that never arrived.
const HELD = () => {
  const w = /** @type {any} */ (window);
  const fold = innerHeight;
  const bad = [];
  const name = (el) =>
    `${el.localName}${el.id ? "#" + el.id : ""}.${String(el.className).split(" ").slice(0, 2).join(".")}`;
  for (const el of document.querySelectorAll('[data-ring-link="hold"]')) {
    const r = el.getBoundingClientRect();
    if (r.height > 0 && r.top < fold) bad.push(`hold ${name(el)} top=${Math.round(r.top)}`);
  }
  const unrevealed =
    '.dg-reveal:not([data-dg-seen]), .rxs-page[data-motion-ready="true"] .rxs-reveal:not(.is-visible), html[data-dream-reveal-ready="true"] [data-dream-reveal]:not([data-dream-visible="true"])';
  for (const el of document.querySelectorAll(unrevealed)) {
    const r = el.getBoundingClientRect();
    if (r.height > 0 && r.top < fold * 0.85 && r.bottom > 0) bad.push(`unrevealed ${name(el)} top=${Math.round(r.top)}`);
  }
  for (const el of w.__ringSeen ?? []) {
    if (!el.isConnected) continue;
    const r = el.getBoundingClientRect();
    if (r.height === 0 || r.top >= fold || r.bottom <= 0) continue;
    const op = parseFloat(getComputedStyle(el).opacity);
    if (op < 0.99) bad.push(`dim ${name(el)} opacity=${op.toFixed(2)} top=${Math.round(r.top)}`);
    const t = getComputedStyle(el).translate;
    if (t !== "none" && t !== "0px" && el.getAnimations().length === 0) bad.push(`moved ${name(el)} translate=${t}`);
  }
  return bad;
};

const stats = () =>
  /** @type {any} */ (window).__ringSeen
    ? {
        chained: [.../** @type {any} */ (window).__ringSeen].filter((el) => el.hasAttribute("data-ring-link") || !el.hasAttribute("data-ring-absorb")).length,
        seen: /** @type {any} */ (window).__ringSeen.size,
        absorbed: document.querySelectorAll("[data-ring-absorb]").length,
        threads: document.querySelectorAll(".ring-link").length,
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      }
    : null;

async function slowScroll(page, cdp, phone, W, H) {
  for (let i = 0; i < 400; i += 1) {
    const before = await page.evaluate(() => scrollY);
    const max = await page.evaluate(() => document.documentElement.scrollHeight - innerHeight);
    if (before >= max - 2) break;
    await cdp.send("Input.synthesizeScrollGesture", {
      x: Math.round(W / 2),
      y: Math.round(H / 2),
      yDistance: -Math.round(H * 0.45),
      speed: 1400,
      gestureSourceType: phone ? "touch" : "mouse",
    });
    await page.waitForTimeout(160);
    const after = await page.evaluate(() => scrollY);
    // A scroll-jacked stage may swallow a gesture; nudge with the scroller.
    if (after <= before + 1) await page.evaluate((dy) => window.scrollBy(0, dy), Math.round(H * 0.45));
  }
  await page.waitForTimeout(2800);
}

async function check(page, label) {
  const bad = await page.evaluate(HELD);
  const s = await page.evaluate(stats);
  if (motion === "reduce" && s?.seen) bad.push(`reduced motion: ${s.seen} element(s) held or absorbed`);
  if (motion !== "full") {
    const threads = await page.evaluate(() => {
      const layer = document.querySelector(".ring-links");
      return layer ? getComputedStyle(layer).display : "none";
    });
    if (threads !== "none") bad.push(`${motion}: the thread layer shows`);
  }
  const ok = bad.length === 0 && (s?.overflow ?? 0) <= 0;
  if (!ok) failures += 1;
  console.log(`${ok ? "PASS" : "FAIL"} ${label} ${JSON.stringify(s)}${bad.length ? "\n    " + bad.slice(0, 8).join("\n    ") : ""}`);
}

async function runOnce(page, cdp, phone, W, H, label) {
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(600);
  await slowScroll(page, cdp, phone, W, H);
  await check(page, `${label} after slow scroll`);
  // Scroll back up a long way, then jump into the middle.
  await cdp.send("Input.synthesizeScrollGesture", {
    x: Math.round(W / 2), y: Math.round(H / 2), yDistance: Math.round(H * 3), speed: 4000, gestureSourceType: phone ? "touch" : "mouse",
  });
  await page.waitForTimeout(2800);
  await check(page, `${label} after scrolling back`);
  await page.evaluate(() => window.scrollTo(0, Math.round(document.documentElement.scrollHeight * 0.45)));
  await page.waitForTimeout(2800);
  await check(page, `${label} after a jump`);
}

try {
  for (const profile of profiles) {
    const phone = profile === "phone";
    const W = phone ? Number(process.env.PHONE_WIDTH || 390) : 1440;
    const H = phone ? 844 : 900;
    const ctx = await browser.newContext(
      {
        ...(phone
          ? { viewport: { width: W, height: H }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }
          : { viewport: { width: W, height: H } }),
        reducedMotion: motion === "reduce" ? "reduce" : "no-preference",
      },
    );
    await ctx.addInitScript(INIT);
    if (motion === "economy")
      await ctx.addInitScript(() => {
        try {
          localStorage.setItem(
            "deception-world:render-quality:v1",
            JSON.stringify({ quality: "lightweight", revision: Date.now() }),
          );
        } catch {
          /* storage blocked: the run reports the page as it is */
        }
      });
    for (const route of routes) {
      const page = await ctx.newPage();
      const cdp = await ctx.newCDPSession(page);
      try {
        if (route === "/") {
          // The opening cinematic: enter the home through the router.
          await page.goto(base + "/library", { waitUntil: "load" });
          await page.waitForTimeout(2500);
          await page.evaluate(() => /** @type {any} */ (window).__TSR_ROUTER__?.navigate({ to: "/" }));
          await page.waitForTimeout(3500);
        } else {
          await page.goto(base + route, { waitUntil: "load" });
          await page.waitForTimeout(3000);
        }
        const tabs = await page.evaluate(() =>
          [...document.querySelectorAll('.dossier-orbit [role="tab"]')].map((t) => t.id),
        );
        if (!tabs.length) await runOnce(page, cdp, phone, W, H, `${profile} ${route}`);
        for (const tab of tabs) {
          // The tab's own click handler (on a phone the dial may hold it off screen).
          await page.evaluate((id) => /** @type {HTMLElement} */ (document.getElementById(id))?.click(), tab);
          await page.waitForTimeout(1400);
          await runOnce(page, cdp, phone, W, H, `${profile} ${route} [${tab.replace("dossier-orbit-tab-", "")}]`);
        }
      } catch (error) {
        failures += 1;
        console.log(`FAIL ${profile} ${route}: ${error instanceof Error ? error.message : error}`);
      }
      await page.close();
    }
    await ctx.close();
  }
} finally {
  await browser.close();
}
console.log(failures ? `\n${failures} check(s) failed` : "\nall held-checks passed");
process.exit(failures ? 1 : 0);
