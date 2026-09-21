import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium, webkit } from "playwright";

// Run this against a freshly built preview, for example:
//   npm run build:dev && npm run preview
//   BASE_URL=http://localhost:8082 node scripts/verify-dream-story.mjs
const base = process.env.BASE_URL || "http://localhost:8082";
const engine = process.env.PW_ENGINE === "webkit" ? "webkit" : "chromium";
const output = process.env.AUDIT_OUT || `/tmp/dream-story-${engine}`;
const browserType = engine === "webkit" ? webkit : chromium;
const browser = await browserType.launch(
  engine === "webkit" ? {} : { channel: process.env.PW_BROWSER_CHANNEL || "chrome" },
);

const viewports = [
  { width: 390, height: 844, name: "iphone-390" },
  { width: 375, height: 812, name: "iphone-375" },
  { width: 1024, height: 768, name: "ipad-1024" },
  { width: 1194, height: 834, name: "ipad-1194" },
];
const expectedChapters = ["交わる", "開く", "開ける", "明ける", "来たる", "叛く"];

await mkdir(output, { recursive: true });

async function assertNoHorizontalOverflow(page, label) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  assert.ok(overflow <= 1, `${label}: horizontal overflow is ${overflow}px`);
}

async function scrollIntoCenter(locator) {
  await locator.evaluate((node) => node.scrollIntoView({ block: "center", behavior: "instant" }));
  await locator.page().waitForTimeout(200);
}

async function dispatchVerticalTouch(page, cdp, locator, label) {
  await scrollIntoCenter(locator);
  const target = await locator.evaluate((node) => {
    const rect = node.getBoundingClientRect();
    const x = Math.min(innerWidth - 20, Math.max(20, rect.left + rect.width / 2));
    const y = Math.min(innerHeight - 80, Math.max(80, rect.top + rect.height / 2));
    return { x, y, before: scrollY };
  });

  if (cdp) {
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x: target.x, y: target.y }],
    });
    for (let step = 1; step <= 8; step += 1) {
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [{ x: target.x, y: target.y - (150 * step) / 8 }],
      });
      await page.waitForTimeout(16);
    }
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  } else {
    // WebKit has no Chromium CDP session; wheel input exercises the same native scroll surface.
    await page.mouse.move(target.x, target.y);
    await page.mouse.wheel(0, 180);
  }

  await page.waitForTimeout(220);
  const after = await page.evaluate(() => scrollY);
  assert.ok(
    after - target.before > 12,
    `${label}: vertical gesture did not scroll the document (${target.before} -> ${after})`,
  );
}

async function assertStoryContract(page) {
  const section = page.locator("#cases");
  await section.waitFor();
  // Off-screen sections use content-visibility; materialize the reader first.
  await scrollIntoCenter(section.locator("#case-title"));
  await page.waitForFunction(
    () => document.querySelector("#case-title")?.innerText === "物語の記録",
  );
  assert.equal(await section.locator("h2").first().innerText(), "物語の記録");

  const intro = section.locator(".dream-story-intro");
  assert.equal(await intro.count(), 1, "one Japanese story introduction is required");
  assert.ok((await intro.innerText()).trim().length > 0, "story introduction must not be empty");

  const crossings = section.locator(".dream-story-crossings");
  assert.equal(await crossings.count(), 1, "one crossings block is required");
  assert.equal(
    await crossings.locator("dl > div").count(),
    3,
    "crossings block must introduce exactly three locations",
  );

  const details = section.locator("ol.dream-story-cases > li > details.dream-story-case");
  assert.equal(await details.count(), 6, "six native details case records are required");
  assert.deepEqual(
    await details.evaluateAll((nodes) =>
      nodes.map((node) =>
        node.querySelector(".dream-story-case-heading > span")?.textContent?.trim(),
      ),
    ),
    expectedChapters,
    "chapter headings must retain the requested order",
  );

  for (let index = 0; index < 6; index += 1) {
    const record = details.nth(index);
    assert.equal(await record.getAttribute("open"), null, `Case ${index} starts closed`);
    assert.equal(
      await record.locator("summary .dream-story-case-heading").count(),
      1,
      `Case ${index} has a native summary heading`,
    );
    assert.equal(
      await record.locator(".dream-story-case-body > p").count(),
      2,
      `Case ${index} has two story paragraphs`,
    );
  }
  assert.match(
    await details.nth(5).innerText(),
    /記録途中/,
    "Case 5 remains explicitly in progress",
  );
  return details;
}

async function verifyNativeDisclosure(page, details) {
  for (let index = 0; index < 6; index += 1) {
    const record = details.nth(index);
    const summary = record.locator("summary");
    await scrollIntoCenter(summary);
    await summary.focus();
    await page.keyboard.press("Enter");
    assert.equal(await record.getAttribute("open"), "", `Enter opens Case ${index}`);
    assert.equal(
      await record.locator(".dream-story-case-body > p").count(),
      2,
      `Case ${index} body is available after opening`,
    );

    await page.keyboard.press("Space");
    assert.equal(await record.getAttribute("open"), null, `Space closes Case ${index}`);
  }
}

async function applyTextZoom(page) {
  await page.locator("#cases").evaluate((section) => {
    const sizes = [...section.querySelectorAll("*")].map((element) => [
      element,
      Number.parseFloat(getComputedStyle(element).fontSize),
    ]);
    for (const [element, size] of sizes) {
      if (size > 0) element.style.setProperty("font-size", `${size * 2}px`, "important");
    }
  });
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

    await page.goto(new URL("/dream-chapter", base).href, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(
      () =>
        document.documentElement.dataset.dreamChapter === "true" &&
        !document.documentElement.hasAttribute("data-route-scroll-settling") &&
        document.querySelectorAll("#cases ol.dream-story-cases > li > details.dream-story-case")
          .length === 6,
    );

    const details = await assertStoryContract(page);
    await assertNoHorizontalOverflow(page, `${viewport.name} initial`);
    await page.locator('.dream-chapter-nav a[href="#cases"]').click();
    await page.waitForFunction(() => {
      const title = document.querySelector("#case-title").getBoundingClientRect();
      const nav = document.querySelector(".dream-chapter-nav").getBoundingClientRect();
      return title.top >= nav.bottom && title.bottom < innerHeight;
    });
    await page.screenshot({ path: `${output}/${viewport.name}-anchor.png` });
    await page.locator("#cases").screenshot({ path: `${output}/${viewport.name}-closed.png` });

    await verifyNativeDisclosure(page, details);

    // Keep two records open for a visual and layout check, proving their states are independent.
    await details.nth(0).locator("summary").click();
    await details.nth(1).locator("summary").click();
    assert.equal(await details.nth(0).getAttribute("open"), "");
    assert.equal(await details.nth(1).getAttribute("open"), "");
    await assertNoHorizontalOverflow(page, `${viewport.name} expanded`);
    await page.locator("#cases").screenshot({ path: `${output}/${viewport.name}-expanded.png` });

    const cdp = engine === "chromium" ? await context.newCDPSession(page) : null;
    await dispatchVerticalTouch(
      page,
      cdp,
      details.nth(0).locator("summary"),
      `${viewport.name} summary`,
    );
    await dispatchVerticalTouch(
      page,
      cdp,
      details.nth(0).locator(".dream-story-case-body > p").first(),
      `${viewport.name} body`,
    );

    await applyTextZoom(page);
    await assertNoHorizontalOverflow(page, `${viewport.name} text 200%`);
    await page.locator("#cases").screenshot({ path: `${output}/${viewport.name}-text200.png` });
    assert.deepEqual(errors, [], `${viewport.name}: page errors`);
    await context.close();
  }
  console.log(`${engine}: Dream story reader contract, input, scroll, and text-zoom checks passed`);
} finally {
  await browser.close();
}
