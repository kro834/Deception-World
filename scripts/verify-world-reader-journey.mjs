// World reading and dossier round trip. Run against a production preview.
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const { chromium, webkit } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const base = process.env.BASE_URL || "http://127.0.0.1:8082";
const engine = process.env.BROWSER || "chrome";
const browser = await (engine === "webkit"
  ? webkit.launch()
  : chromium.launch({ channel: "chrome" }));
const out = process.env.OUT_DIR || join(tmpdir(), "world-reader-journey");
await mkdir(out, { recursive: true });
const report = { engine, version: browser.version(), checks: [] };
try {
  for (const [name, width, height, touch] of [
    ["small", 320, 700, true],
    ["phone", 390, 844, true],
    ["landscape", 844, 390, true],
    ["tablet", 768, 1024, true],
    ["tablet-landscape", 1024, 768, true],
    ["desktop", 1440, 900, false],
  ]) {
    const context = await browser.newContext({
      viewport: { width, height },
      hasTouch: touch,
      isMobile: touch,
      deviceScaleFactor: 1,
    });
    const page = await context.newPage();
    await page.goto(`${base}/world`, { waitUntil: "domcontentloaded" });
    await page.locator("#story").waitFor();
    await page.waitForFunction(() => {
      const poster = document.querySelector("#top .world-stage-image-current");
      return (
        document.documentElement.dataset.worldPageVisible === "true" &&
        poster?.complete &&
        poster.naturalWidth > 0
      );
    });
    await page.evaluate(() => document.fonts.ready);
    const geometry = await page.evaluate(() => ({
      overflow: document.documentElement.scrollWidth - innerWidth,
      storyHeadingTop: document.querySelector("#story .story-heading h2").getBoundingClientRect()
        .top,
      controlsBottom: document.querySelector(".world-stage-controls").getBoundingClientRect()
        .bottom,
      anchors: [...document.querySelectorAll("nav.world-section-nav a")].map((a) =>
        a.getAttribute("href"),
      ),
      poster:
        !!document.querySelector("#top .world-poster-media img") &&
        [...document.querySelectorAll("#top .world-poster-media img")].some(
          (i) => i.complete && i.naturalWidth > 0,
        ),
      story: document.querySelector("#story")?.innerText.trim().length,
    }));
    assert.ok(geometry.overflow <= 1, `${name}: horizontal overflow ${geometry.overflow}`);
    assert.deepEqual(geometry.anchors.slice(0, 3), ["#story", "#riders", "#records"]);
    assert.ok(geometry.poster, `${name}: poster did not load`);
    assert.ok(geometry.story > 100, `${name}: story missing`);
    if (name === "phone") {
      assert.ok(geometry.controlsBottom <= height, "phone poster controls fit before the fold");
      assert.ok(
        geometry.storyHeadingTop <= height - 24,
        "the first story line is legible while the page is opening",
      );
    }
    await page.screenshot({ path: `${out}/${engine}-${name}.png` });
    report.checks.push({ name, ...geometry });
    await context.close();
  }
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
  });
  const page = await context.newPage();
  await page.goto(`${base}/world`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.documentElement.dataset.worldPageVisible === "true");
  const poster = page.locator("#top .world-stage-image-current");
  const lock = page.locator(".poster-lock");
  await lock.click();
  await page.locator('.poster-lock[aria-pressed="true"]').waitFor();
  const initialPoster = await poster.getAttribute("src");
  await page.locator(".poster-shuffle").click();
  await page.waitForFunction((initial) => {
    const image = document.querySelector("#top .world-stage-image-current");
    return (
      image?.getAttribute("src") !== initial &&
      image?.complete &&
      image.naturalWidth > 0 &&
      document.querySelector(".poster-shuffle")?.getAttribute("aria-busy") === "false"
    );
  }, initialPoster);
  const chosenPoster = await poster.getAttribute("src");
  await page.locator('.world-section-nav [href="#riders"]').click();
  await page.locator("#rider-tab-realm").click();
  await page.locator('#rider-tab-realm[aria-selected="true"]').waitFor();
  const button = page.locator(".rider-dossier-open");
  await button.waitFor({ state: "visible" });
  await page.addStyleTag({ content: "html,body,* { scroll-behavior: auto !important }" });
  await button.scrollIntoViewIfNeeded();
  await page.waitForFunction(() => {
    const r = document.querySelector(".rider-dossier-open").getBoundingClientRect();
    return r.top >= 0 && r.bottom <= innerHeight;
  });
  const before = await button.evaluate((e) => ({
    top: e.getBoundingClientRect().top,
    height: innerHeight,
    label: e.getAttribute("aria-label"),
  }));
  await button.focus();
  await page.keyboard.press("Enter");
  await page.waitForURL(/\/riders\//, { timeout: 30000 });
  await page.setViewportSize({ width: 844, height: 390 });
  await page.goBack({ waitUntil: "domcontentloaded" });
  await page.waitForURL(/\/world/);
  await button.waitFor({ state: "visible" });
  await page.waitForFunction((fraction) => {
    const control = document.querySelector(".rider-dossier-open");
    return (
      control &&
      document.activeElement === control &&
      Math.abs(control.getBoundingClientRect().top / innerHeight - fraction) < 0.16
    );
  }, before.top / before.height);
  const after = await button.evaluate((e) => ({
    top: e.getBoundingClientRect().top,
    height: innerHeight,
    label: e.getAttribute("aria-label"),
    focus: document.activeElement === e,
  }));
  assert.equal(after.label, before.label);
  assert.equal(await page.locator("#rider-tab-realm").getAttribute("aria-selected"), "true");
  assert.equal(after.focus, true, "keyboard return should restore focus");
  assert.ok(
    after.top >= -5 && after.top < after.height,
    `returned control outside viewport: ${JSON.stringify(after)}`,
  );
  assert.ok(
    Math.abs(after.top / after.height - before.top / before.height) < 0.16,
    `return position changed: ${JSON.stringify({ before, after })}`,
  );
  await page.waitForFunction((savedPoster) => {
    const restored = document.querySelector("#top .world-stage-image-current");
    return (
      restored?.getAttribute("src") === savedPoster &&
      restored.complete &&
      restored.naturalWidth > 0
    );
  }, chosenPoster);
  assert.equal(await poster.getAttribute("src"), chosenPoster, "the decoded saved poster returns");
  assert.equal(await lock.getAttribute("aria-pressed"), "true", "the poster stays pinned");
  report.checks.push({ name: "rotate-back", before, after, poster: chosenPoster });
  await page.goForward({ waitUntil: "domcontentloaded" });
  await page.waitForURL(/\/riders\/realm/);
  await page.goBack({ waitUntil: "domcontentloaded" });
  await page.waitForURL(/\/world/);
  await page.locator('#rider-tab-realm[aria-selected="true"]').waitFor();
  await page.waitForFunction(() =>
    document.activeElement?.classList.contains("rider-dossier-open"),
  );
  report.checks.push({ name: "forward-back", selected: "realm", focus: true });
  await button.press("Enter");
  await page.waitForURL(/\/riders\/realm/);
  await page.getByRole("link", { name: "人物一覧へ戻る" }).first().click();
  await page.waitForURL(/\/world/);
  await page.locator('#rider-tab-realm[aria-selected="true"]').waitFor();
  report.checks.push({ name: "explicit-return", selected: "realm" });
  await page.screenshot({ path: `${out}/${engine}-return.png` });
  await context.close();
  // A chapter tap in server-rendered HTML must survive late hydration,
  // including the first fresh-route scroll reset and the opening animation.
  const slow = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
  const cold = await slow.newPage();
  let resume;
  const scriptsPending = new Promise((resolve) => {
    resume = resolve;
  });
  await cold.route(
    (url) => url.pathname.endsWith(".js"),
    async (route) => {
      await scriptsPending;
      await route.continue().catch(() => {});
    },
  );
  try {
    await cold.goto(`${base}/world`, { waitUntil: "commit" });
    const storyLink = cold.locator('.world-section-nav a[href="#story"]');
    await storyLink.waitFor({ state: "attached" });
    // WebKit can defer animation frames until pending modules arrive. Send a
    // native tap at the painted link, without waiting for an animation frame.
    let point;
    for (let attempt = 0; attempt < 50 && !point; attempt++) {
      const bounds = await storyLink.boundingBox();
      if (bounds?.width && bounds.height) {
        const x = bounds.x + bounds.width / 2;
        const y = bounds.y + bounds.height / 2;
        if (
          await storyLink.evaluate(
            (link, [x, y]) => link.contains(document.elementFromPoint(x, y)),
            [x, y],
          )
        ) {
          point = { x, y };
        }
      }
      if (!point) await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert.ok(point, "before hydration the story link must be visible and accept taps");
    await cold.touchscreen.tap(point.x, point.y);
    await cold.waitForURL(/#story$/, { waitUntil: "commit" });
  } finally {
    resume();
  }
  await cold.waitForFunction(
    () =>
      document.documentElement.dataset.worldPageVisible === "true" &&
      document
        .querySelector('.world-section-nav a[href="#story"]')
        ?.getAttribute("aria-current") === "location" &&
      !document.documentElement.hasAttribute("data-route-scroll-settling"),
  );
  const heading = await cold.locator("#story .story-heading h2").boundingBox();
  assert.ok(
    heading && heading.y >= 0 && heading.y < 844,
    "hydration keeps the selected chapter in view",
  );
  report.checks.push({ name: "chapter-before-hydration", headingTop: heading.y });
  await slow.close();
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser.close();
}
