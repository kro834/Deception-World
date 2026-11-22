// Browser check for the orbital side menu (軌道儀) and the exploded-view
// dossier (分解図), owner 2026-11-23: 「m1 d1で。」
//   BASE_URL=http://localhost:<port> PW_BROWSER_CHANNEL=chrome node scripts/verify-orbit-menu-dossier.mjs
import assert from "node:assert/strict";
import { chromium } from "playwright";

const base = process.env.BASE_URL || "http://127.0.0.1:8082";
const browser = await chromium.launch({ channel: process.env.PW_BROWSER_CHANNEL || "chrome" });
const results = [];
const check = (name, pass, detail = "") => {
  results.push({ name, pass });
  console.log(`${pass ? "PASS" : "FAIL"} ${name}${detail ? ` (${detail})` : ""}`);
};
const settle = (page, ms = 1100) => page.waitForTimeout(ms);
const region = (page) =>
  page.evaluate(() => document.querySelector("#site-side-panel")?.dataset.orbitRegion);
const part = (page) => page.evaluate(() => document.querySelector(".dossier-orbit")?.dataset.part);
const overflow = (page) =>
  page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
const running = (page, scope) =>
  page.evaluate(
    (selector) =>
      document
        .getAnimations()
        .filter(
          (animation) =>
            animation.playState === "running" && animation.effect?.target?.closest?.(selector),
        ).length,
    scope,
  );

async function openMenu(page) {
  await page.locator(".side-panel-trigger").first().click();
  await page.locator('#site-side-panel[data-open="true"]').waitFor();
  await settle(page, 1500);
}

try {
  // ---- The dial: mouse drag, wheel, keyboard, and what is in the layout ----
  {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.goto(`${base}/riders/saga`, { waitUntil: "networkidle" });
    await settle(page, 1500);
    await openMenu(page);
    check("the menu opens on the reader's own region", (await region(page)) === "riders");
    const dial = await page.locator("#site-side-panel .command-atlas-index").boundingBox();
    const cx = dial.x + dial.width / 2;
    const cy = dial.y + dial.height / 2;
    const r = dial.width / 2;
    const before = await region(page);
    await page.mouse.move(cx + r * 0.7, cy + r * 0.7);
    await page.mouse.down();
    for (let angle = 45; angle >= -10; angle -= 5) {
      await page.mouse.move(
        cx + r * Math.cos((angle * Math.PI) / 180),
        cy + r * Math.sin((angle * Math.PI) / 180),
      );
    }
    await page.mouse.up();
    await settle(page);
    const dragged = await region(page);
    check(
      "a drag turns the dial to the next detent",
      dragged !== before,
      `${before} -> ${dragged}`,
    );
    check("the menu stays open after a drag on the dial", Boolean(await region(page)));
    await page.mouse.move(cx, cy - r * 0.55);
    await page.mouse.wheel(0, 120);
    await settle(page);
    const wheeled = await region(page);
    check("the wheel turns the dial", wheeled !== dragged, `-> ${wheeled}`);
    await page.locator('#site-side-panel [role="tab"][aria-selected="true"]').focus();
    await page.keyboard.press("Home");
    await settle(page);
    check("Home goes to the first region", (await region(page)) === "find");
    await page.keyboard.press("End");
    await settle(page);
    check("End goes to the last region", (await region(page)) === "system");
    await page.keyboard.press("ArrowRight");
    await settle(page);
    check("ArrowRight wraps round the ring", (await region(page)) === "find");
    check(
      "focus follows the selected planet",
      await page.evaluate(() => document.activeElement?.getAttribute("aria-selected") === "true"),
    );
    const tabs = await page.evaluate(() =>
      [...document.querySelectorAll('#site-side-panel [role="tab"]')].map((tab) => tab.tabIndex),
    );
    check(
      "the dial is one tab stop (roving tabindex)",
      tabs.filter((value) => value === 0).length === 1 && tabs.length === 7,
      tabs.join(),
    );
    // Every region shows only its own groups, and every row is readable.
    for (const [id, groups] of [
      ["find", ["find"]],
      ["sections", ["sections"]],
      ["special", ["special"]],
      ["stories", ["stories"]],
      ["riders", ["riders", "rikuei", "related", "unmanaged"]],
      ["information", ["information"]],
      ["system", ["system"]],
    ]) {
      await page.evaluate((key) => document.getElementById(`command-atlas-tab-${key}`).click(), id);
      await settle(page, 900);
      const shown = await page.evaluate(() =>
        [...document.querySelectorAll("#site-side-panel > .side-panel-group")]
          .filter((group) => group.getClientRects().length > 0)
          .map((group) => group.dataset.atlasGroup),
      );
      check(`region ${id} shows its groups only`, shown.join() === groups.join(), shown.join());
    }
    check("no sideways overflow with the menu open (desktop)", (await overflow(page)) <= 0);
    await page.keyboard.press("Escape");
    await page.locator('#site-side-panel[data-open="false"]').waitFor({ state: "attached" });
    check("Escape closes the menu", true);
    await page.close();
  }

  // ---- Phones: the dial under the thumb, touch sizes, no overflow ----
  for (const [width, height] of [
    [390, 844],
    [320, 640],
  ]) {
    const context = await browser.newContext({
      viewport: { width, height },
      hasTouch: true,
      isMobile: true,
    });
    const page = await context.newPage();
    await page.goto(`${base}/riders/saga`, { waitUntil: "networkidle" });
    await settle(page, 1500);
    await openMenu(page);
    const sizes = await page.evaluate(() =>
      [...document.querySelectorAll('#site-side-panel [role="tab"]')].map((tab) => {
        const box = tab.getBoundingClientRect();
        return Math.round(Math.min(box.width, box.height));
      }),
    );
    check(`${width}: every planet is a 44px target`, Math.min(...sizes) >= 44, sizes.join());
    const rows = await page.evaluate(() =>
      [
        ...document.querySelectorAll(
          "#site-side-panel .side-panel-links > a, #site-side-panel .side-panel-links > button",
        ),
      ]
        .filter((row) => row.getClientRects().length > 0)
        .map((row) => Math.round(row.getBoundingClientRect().height)),
    );
    check(`${width}: every row in view is a 44px target`, Math.min(...rows) >= 44, rows.join());
    const selected = await page
      .locator('#site-side-panel [role="tab"][aria-selected="true"]')
      .boundingBox();
    check(
      `${width}: the focused planet sits in the thumb's half of the screen`,
      selected.y > height * 0.45,
      String(Math.round(selected.y)),
    );
    for (const id of ["find", "riders", "system"]) {
      await page.evaluate((key) => document.getElementById(`command-atlas-tab-${key}`).click(), id);
      await settle(page, 900);
      const wide = await page.evaluate(
        () =>
          Math.max(
            document.documentElement.scrollWidth,
            document.querySelector("#site-side-panel").scrollWidth,
          ) - window.innerWidth,
      );
      check(`${width}: region ${id} has no sideways overflow`, wide <= 0, String(wide));
    }
    await context.close();
  }

  // ---- The dossier: parts, anchors, keyboard ----
  for (const [width, height] of [
    [1440, 900],
    [390, 844],
  ]) {
    const phone = width < 600;
    const context = await browser.newContext({
      viewport: { width, height },
      hasTouch: phone,
      isMobile: phone,
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`${base}/riders/saga#character-section-02`, { waitUntil: "networkidle" });
    await settle(page, 1500);
    check(`${width}: a deep link opens its part`, (await part(page)) === "dossier-index");
    const top = await page.evaluate(() =>
      Math.round(document.getElementById("character-section-02").getBoundingClientRect().top),
    );
    check(`${width}: the deep link's target is on screen`, top > 0 && top < height * 0.6, `${top}`);

    await page.goto(`${base}/riders/saga`, { waitUntil: "networkidle" });
    await settle(page, 1500);
    check(`${width}: a file opens on 人物紹介`, (await part(page)) === "dossier-profile");
    const hidden = await page.evaluate(() =>
      ["identity-records", "dossier-index", "form-records"].every(
        (id) => document.getElementById(id).getClientRects().length === 0,
      ),
    );
    check(`${width}: the other parts are out of the layout`, hidden);
    if (!phone) {
      await page.focus("#dossier-orbit-tab-dossier-profile");
      await page.keyboard.press("ArrowRight");
      await settle(page, 900);
      check("arrow keys move the orbit", (await part(page)) === "identity-records");
      await page.keyboard.press("End");
      await settle(page, 900);
      check("End goes to the last part", (await part(page)) === "form-records");
      await page.keyboard.press("Home");
      await settle(page, 900);
      check("Home goes to the first part", (await part(page)) === "dossier-profile");
      const facts = await page.evaluate(() => {
        const figure = document.querySelector(".manager-portrait-frame").getBoundingClientRect();
        return [...document.querySelectorAll(".manager-facts > div")].map((fact) => {
          const box = fact.getBoundingClientRect();
          return box.right <= figure.left + 1 || box.left >= figure.right - 1;
        });
      });
      check(
        "the facts stand beside the figure as callouts",
        facts.length > 0 && facts.every(Boolean),
      );
    } else {
      await page.evaluate(() => document.getElementById("dossier-orbit-tab-dossier-index").click());
      await settle(page);
      const reading = await page.evaluate(() =>
        Math.round(document.getElementById("dossier-index").getBoundingClientRect().top),
      );
      check(
        "phone: the reading starts in the first half screen",
        reading < height * 0.45,
        `${reading}`,
      );
      await page.locator('.dossier-reader-links a[href="#dossier-profile"]').click();
      await settle(page);
      check("phone: the reading bar returns to 人物紹介", (await part(page)) === "dossier-profile");
    }
    await page.evaluate(() => document.getElementById("dossier-orbit-tab-dossier-index").click());
    await settle(page, 900);
    await page.locator('.dossier-contents a[href="#character-section-03"]').click();
    await settle(page, 1200);
    const chapter = await page.evaluate(() =>
      Math.round(document.getElementById("character-section-03").getBoundingClientRect().top),
    );
    check(
      `${width}: a chapter anchor lands inside its part`,
      chapter >= 0 && chapter < height * 0.6,
    );
    await openMenu(page);
    await page.evaluate(() => document.getElementById("command-atlas-tab-sections").click());
    await settle(page, 700);
    await page.locator('#command-atlas-sections a[href$="#form-records"]').click();
    await settle(page, 1800);
    check(
      `${width}: the menu's page section opens its part`,
      (await part(page)) === "form-records",
    );
    check(`${width}: the dossier has no sideways overflow`, (await overflow(page)) <= 0);
    check(`${width}: no runtime errors`, errors.length === 0, errors.join(" | "));
    await context.close();
  }

  // ---- Every family of file keeps its parts ----
  {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    for (const [path, count] of [
      ["/riders/leddic", 4],
      ["/managers/zeus", 2],
      ["/managers/lejas", 3],
      ["/characters/ciel", 4],
      ["/characters/terra", 3],
      ["/characters/dante", 3],
      ["/characters/yoake-mamori", 2],
    ]) {
      await page.goto(`${base}${path}`, { waitUntil: "networkidle" });
      await settle(page, 1200);
      const tabs = await page.locator('.dossier-orbit [role="tab"]').count();
      check(`${path}: ${count} parts on the orbit`, tabs === count, String(tabs));
      check(`${path}: no sideways overflow`, (await overflow(page)) <= 0);
    }
    await page.close();
  }

  // ---- Reduced motion: no motion ----
  {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      reducedMotion: "reduce",
    });
    const page = await context.newPage();
    await page.goto(`${base}/riders/saga`, { waitUntil: "networkidle" });
    await settle(page);
    await page.evaluate(() => document.getElementById("dossier-orbit-tab-dossier-index").click());
    await page.evaluate(
      () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))),
    );
    check(
      "reduced motion: nothing runs in the dossier",
      (await running(page, ".dossier-orbit, #dossier-index, #dossier-profile")) === 0,
    );
    await page.locator(".side-panel-trigger").first().click();
    await settle(page, 600);
    await page.evaluate(() => document.getElementById("command-atlas-tab-system").click());
    await page.evaluate(
      () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))),
    );
    check(
      "reduced motion: nothing runs in the menu",
      (await running(page, "#site-side-panel")) === 0,
    );
    await context.close();
  }
} finally {
  await browser.close();
}

const failed = results.filter((row) => !row.pass);
assert.equal(
  failed.length,
  0,
  `${failed.length} checks failed: ${failed.map((row) => row.name).join("; ")}`,
);
console.log(`${results.length}/${results.length} orbit menu and dossier checks passed`);
