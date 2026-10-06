import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { chromium, webkit } from "playwright";
import { checkedOutputPath, checkedUrl } from "./browser-guard.mjs";

// Run against a production preview. PW_ENGINE=webkit selects WebKit; Chromium
// uses the installed Chrome channel by default. AUDIT_OUT, when set, is kept
// under /private/tmp so this read-only browser check cannot write into a repo.
const base = checkedUrl(process.env.BASE_URL || "http://127.0.0.1:8082");
const engine = process.env.PW_ENGINE === "webkit" ? "webkit" : "chromium";
const browserType = engine === "webkit" ? webkit : chromium;
const browser = await browserType.launch(
  engine === "webkit" ? {} : { channel: process.env.PW_BROWSER_CHANNEL || "chrome" },
);
const profiles = [
  { name: "phone", width: 390, height: 844 },
  { name: "desktop", width: 1440, height: 900 },
  { name: "landscape", width: 844, height: 390 },
];
const phases = [
  ["top", "projection"],
  ["story", "story"],
  ["manager-archive", "managers"],
  ["riders", "riders"],
  ["records", "records"],
  ["cast-roster", "annex"],
  ["glossary", "annex"],
  [".finale-section", "finale"],
];
const palette = {
  projection: { accent: "#7ae8ff", base: "#03060c" },
  story: { accent: "#a9c4ff", base: "#080d1b" },
  managers: { accent: "#c8a3ff", base: "#12091a" },
  riders: { accent: "#cfd8e3", base: "#10151c" },
  records: { accent: "#efb96f", base: "#160e07" },
  annex: { accent: "#6ddfba", base: "#07140f" },
  finale: { accent: "#ffab66", base: "#120804" },
};
const results = [];
const clearRoute = () =>
  document.querySelector(".world-atmosphere") &&
  !document.documentElement.hasAttribute("data-loading") &&
  !document.documentElement.hasAttribute("data-route-scroll-settling");
const moveTo = (selector, overshoot = 14) => {
  const target = selector === "top" ? null : document.querySelector(selector.startsWith(".") ? selector : `#${selector}`);
  const line = Math.max(92, Math.min(200, innerHeight * 0.22));
  scrollTo({ top: target ? target.getBoundingClientRect().top + scrollY - line + overshoot : 0, behavior: "instant" });
};
const readChrome = () => {
  const shell = document.querySelector(".site-shell.film-edition.mirage-edition");
  const bar = getComputedStyle(document.querySelector(".topbar"));
  const stage = document.querySelector(".world-atmosphere");
  const layer = [...stage.querySelectorAll(".world-atmosphere-light")].find(
    (candidate) => Number(getComputedStyle(candidate).opacity) > 0.5,
  );
  return {
    phase: shell?.dataset.worldPhase,
    accent: shell?.style.getPropertyValue("--world-atmosphere-accent").trim(),
    base: shell?.style.getPropertyValue("--world-atmosphere-base").trim(),
    border: bar.borderBottomColor,
    background: bar.backgroundColor,
    transitionProperty: bar.transitionProperty,
    transitionDuration: bar.transitionDuration,
    light: layer?.style.getPropertyValue("--atmosphere-light").trim() ?? null,
    overflow: document.documentElement.scrollWidth - innerWidth,
  };
};

try {
  for (const profile of profiles) {
    const page = await browser.newPage({ viewport: { width: profile.width, height: profile.height } });
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    // Keep the normal-motion run on the full rendering tier on low-core CI hosts.
    await page.addInitScript(() => {
      Object.defineProperty(Navigator.prototype, "hardwareConcurrency", {
        get: () => 8,
        configurable: true,
      });
      Object.defineProperty(Navigator.prototype, "deviceMemory", {
        get: () => 8,
        configurable: true,
      });
    });
    await page.goto(new URL("/world", base).href, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(clearRoute, undefined, { timeout: 30_000 });
    await page.waitForTimeout(1_800);
    const tier = await page.evaluate(() => document.documentElement.dataset.worldEffects || "full");
    assert.notEqual(tier, "economy", `${profile.name}: normal-motion run must use full tier`);

    const observations = [];
    for (const [selector, expected] of phases) {
      await page.evaluate(moveTo, selector);
      await page.waitForFunction(
        (phase) => document.querySelector(".site-shell.film-edition.mirage-edition")?.dataset.worldPhase === phase,
        expected,
        { timeout: 8_000 },
      );
      await page.waitForTimeout(100);
      const intermediate = await page.evaluate(readChrome);
      await page.waitForTimeout(760);
      const settled = await page.evaluate(readChrome);
      assert.equal(intermediate.phase, expected, `${profile.name} ${selector}: active phase`);
      assert.equal(settled.phase, expected, `${profile.name} ${selector}: settled phase`);
      assert.equal(settled.accent, palette[expected].accent, `${profile.name} ${selector}: accent token`);
      assert.equal(settled.base, palette[expected].base, `${profile.name} ${selector}: base token`);
      assert.equal(settled.light, palette[expected].accent, `${profile.name} ${selector}: light layer`);
      assert.equal(settled.overflow, 0, `${profile.name} ${selector}: horizontal overflow`);
      const previous = observations.at(-1)?.settled.phase ?? "projection";
      if (previous !== expected) {
        assert.notEqual(intermediate.border, settled.border, `${profile.name} ${selector}: border fades`);
        assert.notEqual(intermediate.background, settled.background, `${profile.name} ${selector}: background fades`);
      }
      observations.push({ selector, intermediate, settled });
    }

    // Leaving the nested managers archive restores its parent STORY palette.
    await page.evaluate(() => {
      const story = document.getElementById("story");
      scrollTo({ top: story.getBoundingClientRect().top + scrollY + 120, behavior: "instant" });
    });
    await page.waitForFunction(
      () => document.querySelector(".site-shell.film-edition.mirage-edition")?.dataset.worldPhase === "story",
      undefined,
      { timeout: 8_000 },
    );

    // During an active fade, repeated scroll changes retain only the final target.
    await page.evaluate(() => {
      const move = (id) => {
        const target = document.getElementById(id);
        scrollTo({ top: target.getBoundingClientRect().top + scrollY - 160 + 14, behavior: "instant" });
      };
      move("riders");
      setTimeout(() => move("records"), 70);
      setTimeout(() => move("cast-roster"), 140);
    });
    await page.waitForTimeout(980);
    const queued = await page.evaluate(readChrome);
    assert.equal(queued.phase, "annex", `${profile.name}: final queued phase`);
    assert.equal(queued.light, palette.annex.accent, `${profile.name}: final queued light layer`);

    await page.locator(".side-panel-trigger").click();
    await page.waitForFunction(() => document.documentElement.hasAttribute("data-side-menu-open"));
    const menuVisibility = await page.evaluate(
      () => getComputedStyle(document.querySelector(".world-atmosphere")).visibility,
    );
    assert.equal(menuVisibility, "hidden", `${profile.name}: atmosphere behind the menu`);
    assert.deepEqual(pageErrors, [], `${profile.name}: page errors`);
    results.push({ profile: profile.name, tier, observations, returnedPhase: "story", queued, menuVisibility, pageErrors });
    await page.close();
  }

  // Reduced motion keeps one static light layer and switches its color without a 640ms fade.
  {
    const page = await browser.newPage({
      viewport: { width: 390, height: 844 },
      reducedMotion: "reduce",
    });
    await page.goto(new URL("/world", base).href, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(clearRoute, undefined, { timeout: 30_000 });
    await page.waitForTimeout(1_800);
    await page.evaluate(moveTo, "riders");
    await page.waitForFunction(
      () => document.querySelector(".site-shell.film-edition.mirage-edition")?.dataset.worldPhase === "riders",
    );
    const first = await page.evaluate(readChrome);
    await page.waitForTimeout(120);
    const settled = await page.evaluate(readChrome);
    assert.deepEqual(
      [first.accent, first.base, first.border, first.background, first.light],
      [settled.accent, settled.base, settled.border, settled.background, settled.light],
      "reduced motion colors settle within the first frame",
    );
    const staticLayer = await page.evaluate(() =>
      [...document.querySelectorAll(".world-atmosphere-light")].map((layer) => ({
        opacity: Number(getComputedStyle(layer).opacity),
        duration: getComputedStyle(layer).transitionDuration,
      })),
    );
    assert.deepEqual(staticLayer.map(({ opacity }) => opacity), [1, 0]);
    assert.ok(staticLayer.every(({ duration }) => Number.parseFloat(duration) <= 0.001));
    results.push({ reducedMotion: { first, settled, staticLayer } });
    await page.close();
  }

  // Economy rendering hides the glow and disables all topbar transitions.
  {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await page.goto(new URL("/world", base).href, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(clearRoute, undefined, { timeout: 30_000 });
    await page.waitForTimeout(1_800);
    await page.evaluate(() => {
      document.documentElement.dataset.worldEffects = "economy";
      const target = document.getElementById("records");
      scrollTo({ top: target.getBoundingClientRect().top + scrollY - 160 + 14, behavior: "instant" });
    });
    await page.waitForFunction(
      () => document.querySelector(".site-shell.film-edition.mirage-edition")?.dataset.worldPhase === "records",
    );
    const first = await page.evaluate(readChrome);
    await page.waitForTimeout(120);
    const settled = await page.evaluate(readChrome);
    assert.equal(first.phase, "records");
    assert.equal(first.light, palette.records.accent);
    assert.equal(first.background, settled.background, "economy background switches immediately");
    assert.equal(first.border, settled.border, "economy border switches immediately");
    const atmosphere = await page.evaluate(() => ({
      visibility: getComputedStyle(document.querySelector(".world-atmosphere")).visibility,
      duration: getComputedStyle(document.querySelector(".topbar")).transitionDuration,
    }));
    assert.equal(atmosphere.visibility, "hidden");
    assert.ok(atmosphere.duration.split(",").every((value) => Number.parseFloat(value) === 0));
    results.push({ economy: { first, settled, atmosphere } });
    await page.close();
  }

  // Forced colors preserve a system border while dropping decorative light.
  {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await page.emulateMedia({ forcedColors: "active" });
    await page.goto(new URL("/world", base).href, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(clearRoute, undefined, { timeout: 30_000 });
    await page.waitForTimeout(1_800);
    await page.evaluate(moveTo, "riders");
    await page.waitForFunction(
      () => document.querySelector(".site-shell.film-edition.mirage-edition")?.dataset.worldPhase === "riders",
    );
    const forced = await page.evaluate(() => {
      const probe = document.createElement("div");
      probe.style.borderBottom = "1px solid CanvasText";
      document.body.append(probe);
      const systemText = getComputedStyle(probe).borderBottomColor;
      probe.remove();
      return {
        media: matchMedia("(forced-colors: active)").matches,
        border: getComputedStyle(document.querySelector(".topbar")).borderBottomColor,
        systemText,
        overlay: getComputedStyle(document.querySelector(".world-atmosphere")).display,
      };
    });
    assert.equal(forced.media, true);
    assert.equal(forced.border, forced.systemText, "forced-colors keeps the CanvasText system border");
    assert.equal(forced.overlay, "none");
    results.push({ forcedColors: forced });
    await page.close();
  }

  const report = { ok: true, engine, base, results };
  if (process.env.AUDIT_OUT) {
    const destination = checkedOutputPath(process.env.AUDIT_OUT, ["/private/tmp"]);
    await writeFile(destination, `${JSON.stringify(report, null, 2)}\n`);
  }
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  console.error(
    JSON.stringify({ ok: false, engine, message: error.message, stack: error.stack, results }, null, 2),
  );
  process.exitCode = 1;
} finally {
  await browser.close();
}
