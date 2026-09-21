import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium, webkit } from "playwright";

// Run only against a fresh production preview.
const base = process.env.BASE_URL || "http://127.0.0.1:8082";
const engine = process.env.PW_ENGINE === "webkit" ? "webkit" : "chromium";
const output = process.env.AUDIT_OUT || `/tmp/world-programme-audit/${engine}`;
const browserType = engine === "webkit" ? webkit : chromium;
const browser = await browserType.launch(
  engine === "webkit" ? {} : { channel: process.env.PW_BROWSER_CHANNEL || "chrome" },
);

const viewports = [
  { name: "iphone-390", width: 390, height: 844 },
  { name: "iphone-375", width: 375, height: 667 },
  { name: "ipad-1024", width: 1024, height: 768 },
  { name: "ipad-1194", width: 1194, height: 834 },
];
const dreamChapters = ["交わる", "開く", "開ける", "明ける", "来たる", "叛く"];

await mkdir(output, { recursive: true });

function overlaps(first, second) {
  return (
    first.left < second.right &&
    first.right > second.left &&
    first.top < second.bottom &&
    first.bottom > second.top
  );
}

function luminance(color) {
  const channels = color
    .match(/[\d.]+/g)
    ?.slice(0, 3)
    .map(Number);
  assert.ok(channels?.length === 3, `cannot read RGB color: ${color}`);
  const linear = channels.map((channel) => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
}

async function assertNoHorizontalOverflow(page, label) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  assert.ok(overflow <= 1, `${label}: horizontal overflow is ${overflow}px`);
}

async function box(locator, label) {
  const result = await locator.boundingBox();
  assert.ok(result, `${label}: element is visible`);
  return {
    left: result.x,
    top: result.y,
    right: result.x + result.width,
    bottom: result.y + result.height,
    width: result.width,
    height: result.height,
  };
}

async function scrollAndShot(page, selector, path) {
  const target = page.locator(selector).first();
  await target.evaluate((node) => node.scrollIntoView({ block: "start", behavior: "instant" }));
  // Materialize content-visibility sections and let route/reveal styles settle before capture.
  await page.waitForTimeout(150);
  await page.evaluate(() => document.fonts.ready);
  // A materialized section can replace its estimated content-visibility height. Reposition once
  // more using its real box so the screenshot cannot capture an empty pre-reflow location.
  await target.evaluate((node) => {
    const header = document.querySelector(".topbar")?.getBoundingClientRect();
    const rect = node.getBoundingClientRect();
    window.scrollBy({ top: rect.top - (header?.bottom ?? 0) - 16, behavior: "instant" });
  });
  await page.waitForTimeout(150);
  const position = await target.evaluate((node) => {
    const header = document.querySelector(".topbar")?.getBoundingClientRect();
    const rect = node.getBoundingClientRect();
    return { top: rect.top, bottom: rect.bottom, headerBottom: header?.bottom ?? 0 };
  });
  assert.ok(
    position.top >= position.headerBottom - 2 && position.bottom > position.headerBottom,
    `${selector}: materialized section is not visible below the header`,
  );
  await page.screenshot({ path });
}

async function assertManagerRailReadable(page, viewport) {
  const text = await page
    .locator(".manager-archive-tabs button :is(small, b)")
    .evaluateAll((nodes) =>
      nodes.map((node) => {
        const rect = node.getBoundingClientRect();
        const style = getComputedStyle(node);
        return {
          opacity: Number(style.opacity),
          visibility: style.visibility,
          width: rect.width,
          height: rect.height,
          text: node.textContent?.trim(),
        };
      }),
    );
  assert.equal(text.length, 6, `${viewport.name}: manager rail labels render`);
  for (const label of text) {
    assert.ok(label.text, `${viewport.name}: manager rail label has text`);
    assert.ok(
      label.opacity >= 0.99,
      `${viewport.name}: manager rail label opacity is ${label.opacity}`,
    );
    assert.equal(label.visibility, "visible", `${viewport.name}: manager rail label is hidden`);
    assert.ok(
      label.width > 0 && label.height > 0,
      `${viewport.name}: manager rail label is not laid out`,
    );
  }
}

async function openWorld(page) {
  await page.goto(new URL("/world", base).href, { waitUntil: "domcontentloaded" });
  await page.locator(".site-shell.film-edition").waitFor();
  await page.waitForFunction(
    () => !document.documentElement.hasAttribute("data-route-scroll-settling"),
  );
  await page.evaluate(() => document.fonts.ready);
  await page
    .locator(".poster-image-current")
    .evaluate((node) => node.decode?.().catch(() => undefined));
}

async function verifyWorld(page, viewport) {
  await assertNoHorizontalOverflow(page, `${viewport.name} World`);
  const header = await box(page.locator(".topbar"), `${viewport.name} header`);
  const title = await box(page.locator(".hero h1"), `${viewport.name} hero title`);
  const cta = await box(page.locator(".hero .primary-action").first(), `${viewport.name} hero CTA`);
  assert.equal(overlaps(header, title), false, `${viewport.name}: header overlaps hero title`);
  assert.equal(overlaps(header, cta), false, `${viewport.name}: header overlaps CTA`);
  assert.equal(overlaps(title, cta), false, `${viewport.name}: title overlaps CTA`);
  assert.ok(cta.width >= 44 && cta.height >= 44, `${viewport.name}: CTA target is below 44px`);

  const metadata = await page.locator(".hero-metadata > span").evaluateAll((nodes) =>
    nodes.map((node) => {
      const rect = node.getBoundingClientRect();
      return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom };
    }),
  );
  assert.equal(metadata.length, 3, `${viewport.name}: three metadata items render`);
  for (let index = 0; index < metadata.length; index += 1) {
    for (let next = index + 1; next < metadata.length; next += 1) {
      assert.equal(
        overlaps(metadata[index], metadata[next]),
        false,
        `${viewport.name}: metadata ${index + 1} overlaps ${next + 1}`,
      );
    }
  }

  const storyColors = await page.locator(".story-layout").evaluate((node) => ({
    background: getComputedStyle(node).backgroundColor,
    ink: getComputedStyle(node.querySelector(".story-heading h2")).color,
  }));
  const contrast =
    (Math.max(luminance(storyColors.background), luminance(storyColors.ink)) + 0.05) /
    (Math.min(luminance(storyColors.background), luminance(storyColors.ink)) + 0.05);
  assert.ok(contrast >= 7, `${viewport.name}: story heading contrast is ${contrast.toFixed(2)}:1`);

  const nav = page.locator(".topbar nav a");
  assert.equal(await nav.count(), 3, `${viewport.name}: three header navigation controls render`);
  for (let index = 0; index < 3; index += 1) {
    const link = nav.nth(index);
    const linkBox = await box(link, `${viewport.name} nav ${index + 1}`);
    assert.ok(
      linkBox.width >= 44 && linkBox.height >= 44,
      `${viewport.name}: nav ${index + 1} is below 44px`,
    );
    assert.equal(
      await link.evaluate((node) => {
        const rect = node.getBoundingClientRect();
        const hit = document.elementFromPoint(
          rect.left + rect.width / 2,
          rect.top + rect.height / 2,
        );
        return Boolean(hit && node.contains(hit));
      }),
      true,
      `${viewport.name}: nav ${index + 1} is obstructed`,
    );
  }
  const menu = page.locator(".topbar-actions .side-panel-trigger");
  const menuBox = await box(menu, `${viewport.name} menu`);
  assert.ok(
    menuBox.width >= 44 && menuBox.height >= 44,
    `${viewport.name}: menu control is below 44px`,
  );

  const posterControls = page.locator(".poster-controls button");
  assert.equal(await posterControls.count(), 3, `${viewport.name}: poster controls render`);
  for (const control of await posterControls.all()) {
    const controlBox = await box(control, `${viewport.name} poster control`);
    assert.ok(
      controlBox.width >= 44 && controlBox.height >= 44,
      `${viewport.name}: poster control is below 44px`,
    );
  }

  await page.screenshot({ path: `${output}/world-${viewport.name}-viewport.png` });
  await scrollAndShot(page, "#story", `${output}/world-${viewport.name}-story.png`);
  await scrollAndShot(page, "#manager-archive", `${output}/world-${viewport.name}-managers.png`);
  await assertManagerRailReadable(page, viewport);
  await scrollAndShot(page, "#riders", `${output}/world-${viewport.name}-riders.png`);
  await scrollAndShot(page, "#records", `${output}/world-${viewport.name}-records.png`);
  await page.screenshot({ path: `${output}/world-${viewport.name}-full.png`, fullPage: true });
}

async function verifyWorldTextZoom(page, viewport) {
  if (viewport.width > 390) return;
  await page.evaluate(() => {
    const sizes = [...document.querySelectorAll("body *")].map((node) => [
      node,
      Number.parseFloat(getComputedStyle(node).fontSize),
    ]);
    for (const [node, size] of sizes) {
      if (size > 0) node.style.setProperty("font-size", `${size * 2}px`, "important");
    }
  });
  await assertNoHorizontalOverflow(page, `${viewport.name} World text 200%`);
  await page.evaluate(() => scrollTo(0, 0));
  const header = await box(page.locator(".topbar"), `${viewport.name} enlarged header`);
  const masthead = await box(
    page.locator(".film-hero-identity"),
    `${viewport.name} enlarged masthead`,
  );
  assert.equal(
    overlaps(header, masthead),
    false,
    `${viewport.name}: enlarged header overlaps masthead`,
  );
  await page.screenshot({ path: `${output}/world-${viewport.name}-text200.png` });
}

async function verifyDreamStory(page, viewport) {
  await page.goto(new URL("/dream-chapter", base).href, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(
    () =>
      document.documentElement.dataset.dreamChapter === "true" &&
      !document.documentElement.hasAttribute("data-route-scroll-settling") &&
      document.querySelectorAll("#cases details.dream-story-case").length === 6,
  );
  await assertNoHorizontalOverflow(page, `${viewport.name} Dream`);
  const details = page.locator("#cases ol.dream-story-cases > li > details.dream-story-case");
  assert.equal(await details.count(), 6, `${viewport.name}: six Dream records render`);

  for (let index = 0; index < 6; index += 1) {
    const detail = details.nth(index);
    const summary = detail.locator("summary");
    assert.equal(
      await detail.getAttribute("open"),
      null,
      `${viewport.name}: Case ${index} starts closed`,
    );
    assert.equal(
      await summary.locator(".dream-story-case-heading > span").innerText(),
      dreamChapters[index],
      `${viewport.name}: Case ${index} label`,
    );
    await summary.evaluate((node) => node.scrollIntoView({ block: "center", behavior: "instant" }));
    await summary.focus();
    await page.keyboard.press("Enter");
    assert.equal(
      await detail.getAttribute("open"),
      "",
      `${viewport.name}: Enter opens Case ${index}`,
    );
    assert.equal(
      await detail.locator(".dream-story-case-body > p").count(),
      2,
      `${viewport.name}: Case ${index} has two paragraphs`,
    );
    if (index === 0) {
      const paragraph = detail.locator(".dream-story-case-body > p").first();
      await paragraph.evaluate((node) =>
        node.scrollIntoView({ block: "center", behavior: "instant" }),
      );
      const before = await page.evaluate(() => scrollY);
      const position = await paragraph.evaluate((node) => {
        const rect = node.getBoundingClientRect();
        return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
      });
      await page.mouse.move(position.x, position.y);
      await page.mouse.wheel(0, 220);
      await page.waitForTimeout(100);
      const after = await page.evaluate(() => scrollY);
      assert.ok(
        after - before > 12,
        `${viewport.name}: native wheel scroll from story body is blocked`,
      );
    }
    await page.keyboard.press("Space");
    assert.equal(
      await detail.getAttribute("open"),
      null,
      `${viewport.name}: Space closes Case ${index}`,
    );
  }
}

try {
  for (const viewport of viewports) {
    const context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
      hasTouch: true,
      isMobile: engine === "chromium" && viewport.width < 600,
      reducedMotion: "reduce",
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));

    await openWorld(page);
    await verifyWorld(page, viewport);
    await verifyWorldTextZoom(page, viewport);
    await verifyDreamStory(page, viewport);
    assert.deepEqual(errors, [], `${viewport.name}: console page errors`);
    await context.close();
    console.log(`${engine} ${viewport.name}: World programme + Dream story passed`);
  }
} finally {
  await browser.close();
}
