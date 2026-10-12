import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium, webkit } from "playwright";
import { checkedUrl } from "./browser-guard.mjs";

const base = checkedUrl(process.env.BASE_URL || "http://127.0.0.1:8574");
const engine = process.env.PW_ENGINE === "webkit" ? webkit : chromium;
const engineName = process.env.PW_ENGINE === "webkit" ? "webkit" : "chromium";
const browser = await engine.launch(
  engine === chromium ? { channel: process.env.PW_BROWSER_CHANNEL || "chrome" } : undefined,
);
const output = process.env.AUDIT_OUT || `/tmp/dream-screening-explorer-${engineName}`;
const viewports = [
  { name: "320x640", width: 320, height: 640, hasTouch: true },
  { name: "390x844", width: 390, height: 844, hasTouch: true },
  { name: "1024x768-landscape", width: 1024, height: 768, hasTouch: false },
  { name: "1440x900", width: 1440, height: 900, hasTouch: false },
];

await mkdir(output, { recursive: true });

async function countResults(page) {
  await page.waitForFunction(() =>
    Boolean(document.querySelector(".dream-record-count")?.textContent?.match(/^\d+件の記録/)),
  );
  const text = (await page.locator(".dream-record-count").textContent())?.trim() ?? "";
  const match = text.match(/^(\d+)件の記録/);
  assert.ok(match, `Unexpected record count text: ${text}`);
  return Number(match[1]);
}

async function setFilter(page, index, value) {
  await page.locator(".dream-record-filters select").nth(index).selectOption(value);
  await page.waitForFunction(() => {
    const count = document.querySelector(".dream-record-count")?.textContent;
    return Boolean(count?.match(/^\d+件の記録/));
  });
}

async function noHorizontalOverflow(page, label) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  assert.ok(overflow <= 1, `${label}: horizontal overflow ${overflow}px`);
}

async function testScreeningRoom(context, viewport) {
  const page = await context.newPage();
  const failures = [];
  const cssDelayMs = Number(process.env.SCREENING_CSS_DELAY_MS || 1200);
  let markCssRequest;
  const cssRequestSeen = new Promise((resolve) => {
    markCssRequest = resolve;
  });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(new URL("/dream-chapter#chronicle", base).href, {
    waitUntil: "domcontentloaded",
  });
  await page.locator(".dream-chapter-nav a[href='#posters']").click();
  await page.waitForURL("**/dream-chapter#posters", { waitUntil: "domcontentloaded" });

  await page.route("**/*dream-screening-room*.css*", async (route) => {
    markCssRequest(route.request().url());
    await new Promise((resolve) => setTimeout(resolve, cssDelayMs));
    await route.continue();
  });

  const trigger = page.locator(".dream-screening-trigger");
  await trigger.scrollIntoViewIfNeeded();
  const departure = await page.evaluate(() => window.scrollY);
  await trigger.click();
  const cssUrl = await Promise.race([
    cssRequestSeen,
    new Promise((resolve) => setTimeout(() => resolve(null), 10000)),
  ]);
  assert.ok(cssUrl, "Opening the room requests its lazy stylesheet after the trigger click");
  await page.waitForFunction(
    () => document.querySelector(".dream-screening-trigger")?.getAttribute("aria-busy") === "true",
  );
  const duringCssDelay = await page.evaluate(() => ({
    y: window.scrollY,
    bodyTop: document.body.style.top,
    triggerText: document.querySelector(".dream-screening-trigger")?.textContent?.trim(),
  }));
  assert.equal(
    duringCssDelay.y,
    departure,
    `${viewport.name}: delayed screening CSS must not move the page`,
  );
  assert.match(duringCssDelay.triggerText ?? "", /映写室を準備中/);
  console.log(
    `${viewport.name} screening cold CSS: ${JSON.stringify({ cssUrl, departure, ...duringCssDelay })}`,
  );
  const dialog = page.locator(".dream-screening-dialog[open]");
  await dialog.waitFor({ state: "visible" });
  const scrollWhenOpen = await page.evaluate(() => ({
    y: window.scrollY,
    bodyTop: document.body.style.top,
    bodyPosition: document.body.style.position,
  }));
  console.log(
    `${viewport.name} screening open scroll: ${JSON.stringify({ departure, ...scrollWhenOpen })}`,
  );
  assert.equal(
    scrollWhenOpen.bodyTop,
    `-${departure}px`,
    `${viewport.name}: initial modal lock preserves the pre-open scroll offset`,
  );
  await page.waitForFunction(() => {
    const image = document.querySelector(".dream-screening-picture > img");
    return Boolean(image?.complete && image.naturalWidth > 0);
  });
  await page.screenshot({ path: `${output}/${viewport.name}-screening-fit.png` });
  await page.waitForFunction(() =>
    document.activeElement?.classList.contains("dream-screening-close"),
  );
  assert.equal(await page.locator(".dream-screening-filmstrip > button").count(), 15);
  assert.equal(
    await page.locator(".dream-screening-filmstrip > button[aria-current='true']").count(),
    1,
  );
  assert.equal(await page.locator(".dream-screening-zoom").isEnabled(), true);
  await noHorizontalOverflow(page, `${viewport.name} screening room`);

  // Exercise thumbnail selection, forward wrap at the final poster, and reverse wrap at the first.
  await page.locator('.dream-screening-filmstrip > button[data-poster-index="0"]').click();
  await page.waitForFunction(() =>
    document.querySelector(".dream-screening-count")?.textContent?.includes("01"),
  );
  await page.locator(".dream-screening-arrow[aria-label='次のポスター']").click();
  await page.waitForFunction(() =>
    document.querySelector(".dream-screening-count")?.textContent?.includes("02"),
  );
  await page.locator('.dream-screening-filmstrip > button[data-poster-index="14"]').click();
  await page.waitForFunction(() =>
    document.querySelector(".dream-screening-count")?.textContent?.includes("15"),
  );
  await page.locator(".dream-screening-arrow[aria-label='次のポスター']").click();
  await page.waitForFunction(() =>
    document.querySelector(".dream-screening-count")?.textContent?.includes("01"),
  );
  await page.locator(".dream-screening-arrow[aria-label='前のポスター']").click();
  await page.waitForFunction(() =>
    document.querySelector(".dream-screening-count")?.textContent?.includes("15"),
  );
  await page.locator('.dream-screening-filmstrip > button[data-poster-index="0"]').click();
  await page.waitForFunction(() =>
    document.querySelector(".dream-screening-count")?.textContent?.includes("01"),
  );

  const image = page.locator(".dream-screening-picture > img");
  const zoom = page.locator(".dream-screening-zoom");
  await zoom.click();
  assert.equal(await zoom.getAttribute("aria-pressed"), "true");
  assert.equal(
    await page.locator(".dream-screening-picture").getAttribute("class"),
    "dream-screening-picture is-zoomed",
  );
  const zoomMetrics = await image.evaluate((element) => ({
    width: element.clientWidth,
    naturalWidth: element.naturalWidth,
    height: element.clientHeight,
    naturalHeight: element.naturalHeight,
  }));
  assert.ok(
    Math.abs(zoomMetrics.width - zoomMetrics.naturalWidth) <= 1,
    "100% zoom uses the decoded image width",
  );
  assert.ok(
    Math.abs(zoomMetrics.height - zoomMetrics.naturalHeight) <= 1,
    "100% zoom uses the decoded image height",
  );
  await page.screenshot({ path: `${output}/${viewport.name}-screening-zoom.png` });
  await zoom.click();
  assert.equal(await zoom.getAttribute("aria-pressed"), "false");

  await page.keyboard.press("Escape");
  await page.waitForFunction(() => !document.querySelector(".dream-screening-dialog"));
  await page.waitForFunction(() => document.activeElement?.matches(".dream-screening-trigger"));
  const scrollAfterEscape = await page.evaluate(() => ({
    y: window.scrollY,
    bodyPosition: document.body.style.position,
    bodyTop: document.body.style.top,
    documentTop: document.documentElement.scrollTop,
    triggerTop: document.querySelector(".dream-screening-trigger")?.getBoundingClientRect().top,
  }));
  console.log(
    `${viewport.name} screening scroll: ${JSON.stringify({ departure, ...scrollAfterEscape })}`,
  );
  if (scrollAfterEscape.y !== departure) {
    failures.push(
      `Escape scroll restoration: expected ${departure}px, found ${scrollAfterEscape.y}px (trigger top ${scrollAfterEscape.triggerTop}px)`,
    );
  }
  assert.equal(
    await page.evaluate(() => document.documentElement.dataset.dreamDialogOpen),
    undefined,
  );

  // Browser Back dismisses the top-layer room and releases the viewport lock before restoration.
  await trigger.click();
  await page.locator(".dream-screening-dialog[open]").waitFor({ state: "visible" });
  await page.goBack({ waitUntil: "domcontentloaded" });
  await page.waitForURL("**/dream-chapter#chronicle");
  await page.waitForFunction(() => !document.querySelector(".dream-screening-dialog"));
  const unlocked = await page.evaluate(() => ({
    flag: document.documentElement.dataset.dreamDialogOpen,
    rootOverflow: getComputedStyle(document.documentElement).overflowY,
    bodyOverflow: getComputedStyle(document.body).overflowY,
    bodyPosition: document.body.style.position,
  }));
  assert.equal(unlocked.flag, undefined, "Back clears the screening lock flag");
  assert.notEqual(unlocked.rootOverflow, "hidden", "Back releases the root scroll lock");
  assert.notEqual(unlocked.bodyOverflow, "hidden", "Back releases the body scroll lock");
  assert.notEqual(unlocked.bodyPosition, "fixed", "Back releases the frozen body position");
  await noHorizontalOverflow(page, `${viewport.name} after Back`);
  assert.deepEqual(errors, [], `${viewport.name} screening room has no page errors`);
  await page.screenshot({ path: `${output}/${viewport.name}-screening-room.png` });
  await page.close();
  return failures;
}

async function testRecordExplorer(context, viewport) {
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(new URL("/dream-chapter#chronicle", base).href, {
    waitUntil: "domcontentloaded",
  });
  const explorer = page.locator(".dream-record-explorer");
  await explorer.waitFor({ state: "visible" });
  await page.waitForFunction(() =>
    Boolean(document.querySelector(".dream-record-count")?.textContent?.match(/^\d+件の記録/)),
  );
  await noHorizontalOverflow(page, `${viewport.name} record explorer`);

  const allCount = await countResults(page);
  assert.ok(allCount > 8, "The full Chronicle result set exercises pagination");
  const more = page.locator(".dream-record-more");
  await more.click();
  await page.waitForFunction(() =>
    document.querySelector(".dream-record-count")?.textContent?.includes("16件を表示"),
  );

  const selects = page.locator(".dream-record-filters select");
  const caseSelect = selects.nth(0);
  const personSelect = selects.nth(1);
  const placeSelect = selects.nth(2);
  const keiyaOption = personSelect.locator("option").filter({ hasText: /^東風谷慶弥$/ });
  assert.equal(await keiyaOption.count(), 1, "Chronicle's canonical unspaced Keiya filter exists");
  await setFilter(page, 1, "東風谷慶弥");
  assert.ok((await countResults(page)) > 0);

  // Anchor a valid CASE/place pair from a displayed Chronicle record, then check all three predicates.
  const firstCard = page.locator(".dream-record-card").first();
  const firstMeta = await firstCard.locator(".dream-record-meta span").allInnerTexts();
  const matchingCase = firstMeta[0].replace(/^CASE\s+/, "").trim();
  const matchingPlace = firstMeta[1].trim();
  await setFilter(page, 0, matchingCase);
  await setFilter(page, 2, matchingPlace);
  const matchingCount = await countResults(page);
  assert.ok(
    matchingCount > 0,
    "The combined CASE, person, and place filters retain a matching record",
  );
  const visibleCards = page.locator(".dream-record-card");
  const visibleCount = await visibleCards.count();
  assert.ok(visibleCount > 0 && visibleCount <= 8);
  for (let index = 0; index < visibleCount; index += 1) {
    const card = visibleCards.nth(index);
    assert.equal(
      (await card.locator(".dream-record-meta span").nth(0).textContent())?.trim(),
      `CASE ${matchingCase}`,
    );
    assert.equal(
      (await card.locator(".dream-record-meta span").nth(1).textContent())?.trim(),
      matchingPlace,
    );
    assert.match((await card.locator(".dream-record-cast").textContent()) ?? "", /東風谷慶弥/);
  }
  const personLink = visibleCards.first().locator("nav a[href='#dream-character-keiya']");
  assert.equal(
    await personLink.count(),
    1,
    "The event card links to Keiya's canonical character record",
  );

  // Find a valid zero-result combination through the page's own controls; keep it bounded to one CASE.
  const candidatePlaces = await placeSelect
    .locator("option")
    .evaluateAll((options) => options.map((option) => option.value).filter(Boolean));
  let foundEmpty = false;
  for (const candidate of candidatePlaces) {
    if (candidate === matchingPlace) continue;
    await setFilter(page, 2, candidate);
    if ((await countResults(page)) === 0) {
      foundEmpty = true;
      break;
    }
  }
  if (!foundEmpty) {
    const candidateCases = await caseSelect
      .locator("option")
      .evaluateAll((options) => options.map((option) => option.value).filter(Boolean));
    for (const candidate of candidateCases) {
      if (candidate === matchingCase) continue;
      await setFilter(page, 0, candidate);
      if ((await countResults(page)) === 0) {
        foundEmpty = true;
        break;
      }
    }
  }
  assert.ok(foundEmpty, "A three-filter zero-result state is reachable");
  await page.locator(".dream-record-empty").waitFor({ state: "visible" });
  await page.locator(".dream-record-empty button").click();
  await page.waitForFunction(
    () =>
      document.querySelectorAll(".dream-record-filters select").length === 3 &&
      [...document.querySelectorAll(".dream-record-filters select")].every(
        (select) => select.value === "",
      ),
  );
  assert.equal(await countResults(page), allCount, "Reset restores the complete result count");

  // Return to the exact event and verify the parent CASE opens and the event itself receives the landing.
  await setFilter(page, 1, "東風谷慶弥");
  const eventLink = page
    .locator(".dream-record-card nav a")
    .filter({ hasText: "出来事を読む" })
    .first();
  const href = await eventLink.getAttribute("href");
  assert.match(href ?? "", /^#dream-chronicle-event-\d+$/);
  await eventLink.click();
  await page.waitForFunction((hash) => location.hash === hash, href);
  const targetId = href.slice(1);
  await page.waitForFunction((id) => {
    const target = document.getElementById(id);
    return target?.closest("details")?.open && document.activeElement === target;
  }, targetId);
  const landing = await page.evaluate((id) => {
    const target = document.getElementById(id);
    const parent = target?.closest("details");
    const rect = target?.getBoundingClientRect();
    return {
      present: Boolean(target),
      parentOpen: Boolean(parent?.open),
      focused: document.activeElement === target,
      top: rect?.top ?? -1,
      bottom: rect?.bottom ?? -1,
    };
  }, targetId);
  assert.equal(landing.present, true, "The selected event target exists");
  assert.equal(landing.parentOpen, true, "The target's parent CASE is open");
  assert.equal(landing.focused, true, "Navigation focuses the exact event");
  assert.ok(
    landing.top >= 0 && landing.top < viewport.height,
    "The exact event is in the viewport",
  );
  await noHorizontalOverflow(page, `${viewport.name} event landing`);
  assert.deepEqual(errors, [], `${viewport.name} record explorer has no page errors`);
  await page.screenshot({ path: `${output}/${viewport.name}-event-landing.png` });
  await page.close();
}

const failures = [];
try {
  for (const viewport of viewports) {
    const context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
      reducedMotion: "reduce",
      hasTouch: viewport.hasTouch,
    });
    try {
      try {
        failures.push(...(await testScreeningRoom(context, viewport)));
        console.log(`${viewport.name}: screening room flow completed (reduced motion)`);
      } catch (error) {
        failures.push(`${viewport.name} screening room: ${error.message}`);
        const page = context.pages().find((candidate) => !candidate.isClosed());
        if (page) {
          await page
            .screenshot({ path: `${output}/${viewport.name}-screening-failure.png` })
            .catch(() => {});
        }
      }
      try {
        await testRecordExplorer(context, viewport);
        console.log(`${viewport.name}: Chronicle explorer passed (reduced motion)`);
      } catch (error) {
        failures.push(`${viewport.name} Chronicle explorer: ${error.message}`);
        const page = context.pages().find((candidate) => !candidate.isClosed());
        if (page) {
          await page
            .screenshot({ path: `${output}/${viewport.name}-explorer-failure.png` })
            .catch(() => {});
        }
      }
    } finally {
      await context.close();
    }
  }
} finally {
  await browser.close();
}

if (failures.length) {
  console.error(`Browser regressions found:\n- ${failures.join("\n- ")}`);
  process.exitCode = 1;
} else {
  console.log("All Dream screening room and Chronicle explorer checks passed.");
}
