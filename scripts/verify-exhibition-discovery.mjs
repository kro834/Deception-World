import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium, webkit } from "playwright";

const base = process.env.BASE_URL || "http://127.0.0.1:8144";
assert.ok(
  ["127.0.0.1", "localhost", "[::1]"].includes(new URL(base).hostname),
  "Use a local preview",
);
const engine = process.env.PW_BROWSER || "chromium";
assert.ok(["chromium", "webkit"].includes(engine), "PW_BROWSER must be chromium or webkit");
const output = `output/playwright/sol25-discovery/${engine}`;
await mkdir(output, { recursive: true });
const results = { engine, base, checks: [], errors: [], blockedWrites: [] };
const record = (name, detail = true) => {
  results.checks.push({ name, detail });
  console.log(JSON.stringify({ passed: name }));
};
const browser = await (engine === "webkit" ? webkit : chromium).launch(
  engine === "chromium" ? { channel: process.env.PW_BROWSER_CHANNEL || "chrome" } : {},
);
const contexts = [];
let activePage;
async function newPage() {
  const context = await browser.newContext({
    viewport: { width: 390, height: 900 },
    reducedMotion: "reduce",
  });
  contexts.push(context);
  await context.route("**/*", (route) => {
    if (["GET", "HEAD"].includes(route.request().method())) return route.continue();
    results.blockedWrites.push({ method: route.request().method(), url: route.request().url() });
    return route.abort();
  });
  const page = await context.newPage();
  page.setDefaultTimeout(30000);
  page.on("pageerror", (error) => results.errors.push(error.message));
  activePage = page;
  return page;
}
const settle = (page) =>
  page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
const ready = (page) => page.locator('.gallery-tour-full-image[data-ready="true"]').waitFor();
async function expectTour(page, tour, work, position = 4) {
  await page.waitForURL(
    (url) => url.searchParams.get("tour") === tour && url.searchParams.get("work") === work,
  );
  await ready(page);
  assert.match(
    await page.locator(".gallery-tour-position").innerText(),
    new RegExp(`0${position}\\s*/\\s*07`),
  );
  assert.equal(
    await page
      .locator('.gallery-tour-filmstrip button[aria-current="step"]')
      .getAttribute("aria-label"),
    `${position}点目、${await page.locator(".gallery-tour-full-image").getAttribute("alt")}`,
  );
}
async function expectCourseReturn(page, id) {
  await page.getByRole("button", { name: "← 巡回一覧に戻る", exact: true }).click();
  await page.waitForURL((url) => !url.searchParams.has("tour") && !url.searchParams.has("work"));
  await page.waitForFunction((tourId) => {
    const heading = document.getElementById(`gallery-tour-title-${tourId}`);
    const card = heading?.closest("article");
    const bounds = card?.getBoundingClientRect();
    return (
      heading === document.activeElement && bounds && bounds.top >= -1 && bounds.top < innerHeight
    );
  }, id);
}

try {
  const shelf = await newPage();
  await shelf.goto(`${base}/exhibition?work=g113`);
  await shelf.waitForLoadState("networkidle");
  const search = shelf.getByRole("searchbox", { name: "作品を探す" });
  const format = shelf.getByRole("combobox", { name: "構図", exact: true });
  const works = shelf.locator(".exhibition-shelf-work");
  const status = shelf.locator(".exhibition-shelf-count");
  const pagination = shelf.getByRole("navigation", { name: "作品一覧のページ" });
  await shelf.getByRole("link", { name: "画像から選ぶ ↓", exact: true }).click();
  await search.waitFor();
  await settle(shelf);
  assert.equal(await works.count(), 5);
  assert.match(await status.innerText(), /^113作品中 109–113$/);
  assert.equal(await works.last().getAttribute("aria-pressed"), "true");
  assert.equal(
    await pagination.getByRole("button", { name: "次の12作品 →", exact: true }).isDisabled(),
    true,
  );
  record("deep link g113 opens last shelf page with five works and selected last work");

  for (const query of ["5", "００５", "Ｇ００５"]) {
    await search.fill(query);
    await shelf.waitForFunction(
      () => document.querySelectorAll(".exhibition-shelf-work").length === 1,
    );
    assert.equal(await works.first().getAttribute("aria-label"), "005 蒼い仮面を展示");
    assert.equal(new URL(shelf.url()).searchParams.get("work"), "g113");
    record(`exact catalogue number query ${query}`);
  }
  await search.fill("青緑 仮面");
  assert.equal(await works.filter({ hasText: "蒼い仮面" }).count(), 1);
  record("description words find artwork without changing current selection");

  await search.fill("");
  for (const [value, relation] of [
    ["portrait", "portrait"],
    ["landscape", "landscape"],
    ["square", "square"],
  ]) {
    await format.selectOption(value);
    const dimensions = await works.locator("img").evaluateAll((images) =>
      images.map((image) => ({
        width: Number(image.getAttribute("width")),
        height: Number(image.getAttribute("height")),
      })),
    );
    if (dimensions.length) {
      assert.ok(
        dimensions.every(({ width, height }) =>
          relation === "portrait"
            ? width < height
            : relation === "landscape"
              ? width > height
              : width === height,
        ),
      );
    } else {
      assert.equal(
        await shelf.getByRole("button", { name: "すべての作品に戻す", exact: true }).isVisible(),
        true,
      );
    }
    record(`format ${value}`, { visibleWorks: dimensions.length });
  }
  await search.fill("存在しない作品qa-782611");
  await shelf.getByRole("button", { name: "すべての作品に戻す", exact: true }).focus();
  await shelf.keyboard.press("Enter");
  assert.equal(await search.evaluate((input) => document.activeElement === input), true);
  assert.equal(await search.inputValue(), "");
  assert.equal(await format.inputValue(), "all");
  assert.match(await status.innerText(), /^113作品中 1–12$/);
  assert.equal(await works.count(), 12);
  record("empty results reset query, format and pagination together");

  const seen = [];
  for (let page = 1; page <= 10; page++) {
    seen.push(
      ...(await works.evaluateAll((buttons) =>
        buttons.map((button) => button.getAttribute("aria-label").slice(0, 3)),
      )),
    );
    assert.equal(
      await pagination.locator("span").getAttribute("aria-label"),
      `10ページ中${page}ページ`,
    );
    if (page < 10) {
      await pagination.getByRole("button", { name: "次の12作品 →", exact: true }).click();
      await shelf.waitForFunction(() => document.activeElement?.id === "exhibition-shelf-heading");
    }
  }
  assert.deepEqual(
    seen,
    Array.from({ length: 113 }, (_, index) => String(index + 1).padStart(3, "0")),
  );
  record("all 113 artworks occur once across ten pages; page changes focus shelf heading");

  await pagination.getByRole("button", { name: "← 前の12作品", exact: true }).click();
  const selection = works.first();
  const selectedNumber = (await selection.getAttribute("aria-label")).slice(0, 3);
  const selectedTitle = await selection
    .locator(".exhibition-shelf-work-caption > span")
    .nth(1)
    .innerText();
  await selection.scrollIntoViewIfNeeded();
  await selection.focus();
  await settle(shelf);
  const before = await shelf.evaluate(() => scrollY);
  await shelf.keyboard.press("Enter");
  const selectedId = `g${Number(selectedNumber)}`;
  await shelf.waitForURL((url) => url.searchParams.get("work") === selectedId);
  await settle(shelf);
  assert.equal(await selection.getAttribute("aria-pressed"), "true");
  assert.equal(await selection.evaluate((button) => button === document.activeElement), true);
  const after = await shelf.evaluate(() => scrollY);
  assert.ok(Math.abs(before - after) < 2, `Shelf selection moved scroll ${before} → ${after}`);
  assert.equal(
    await shelf.getByRole("combobox", { name: "展示する原画" }).inputValue(),
    selectedId,
  );
  assert.equal(await shelf.locator("#exhibition-current-title").innerText(), selectedTitle);
  record(
    "keyboard selection retains shelf focus and scroll while URL and displayed artwork change",
    { work: selectedId, before, after },
  );
  await search.fill("005");
  await shelf.getByRole("button", { name: "展示中を表示", exact: true }).click();
  assert.equal(await search.inputValue(), "");
  assert.equal(await shelf.locator('.exhibition-shelf-work[aria-pressed="true"]').count(), 1);
  assert.match(await status.innerText(), /^113作品中 97–108$/);
  await shelf.getByRole("link", { name: /展示室へ戻る ↑/ }).click();
  await shelf.waitForFunction(() => {
    const bounds = document.getElementById("exhibition-current-work")?.getBoundingClientRect();
    return bounds && bounds.top >= -1 && bounds.top < 100;
  });
  assert.equal(new URL(shelf.url()).searchParams.get("work"), selectedId);
  record(
    "show current clears search to reveal current shelf page; return link reaches selected stage",
  );
  await shelf.screenshot({ path: `${output}/exhibition-stage-return.png` });

  const tours = await newPage();
  await tours.goto(`${base}/gallery-tours`);
  await tours.waitForLoadState("networkidle");
  // The expected middle works are independent fixtures, not values read from application source.
  const courses = [
    { id: "starlight", title: "星光をたどる", work: "g94" },
    { id: "rain-motion", title: "雨と動きの輪郭", work: "g54" },
    { id: "quiet-portraits", title: "静かな横顔", work: "g58" },
    { id: "boundaries", title: "景色の境界", work: "g46" },
    { id: "design-lines", title: "仮面から車体へ", work: "g84" },
  ];
  assert.equal(await tours.getByRole("button", { name: /^鑑賞を再開：/ }).count(), 0);
  for (const course of courses) {
    await tours
      .locator(`#gallery-tour-course-${course.id}`)
      .getByRole("button", { name: new RegExp(`^${course.title}の4点目`) })
      .click();
    await expectTour(tours, course.id, course.work);
    assert.equal(await tours.locator("main h1").innerText(), course.title);
    await expectCourseReturn(tours, course.id);
    record(
      `catalogue preview starts exact fourth work and returns focus/scroll to ${course.id}`,
      course.work,
    );
  }
  await tours.getByRole("button", { name: "鑑賞を再開：仮面から車体へ", exact: true }).click();
  await expectTour(tours, "design-lines", "g84");
  record(
    "latest resume chooses last actually viewed course and exact work across five course visits",
  );

  const filmstrip = tours.getByRole("group", { name: "巡回する作品", exact: true });
  const selectionToggle = tours.getByRole("button", { name: "作品を選ぶ", exact: true });
  await selectionToggle.click();
  assert.equal(await filmstrip.isVisible(), false);
  assert.equal(await selectionToggle.getAttribute("aria-expanded"), "false");
  await selectionToggle.click();
  assert.equal(await filmstrip.isVisible(), true);
  const play = tours.locator(".gallery-tour-play-button");
  await tours.getByRole("combobox", { name: "一枚を眺める時間" }).selectOption("20");
  await play.click();
  assert.equal(await play.getAttribute("aria-pressed"), "true");
  await tours.getByRole("button", { name: "作品に集中", exact: true }).click();
  assert.equal(await tours.locator("#gallery-tour-reading").isVisible(), false);
  assert.equal(await filmstrip.isVisible(), false);
  assert.equal(await tours.locator(".gallery-tour-focused-caption").isVisible(), true);
  const focusedPlay = tours.getByRole("button", { name: "Ⅱ 自動送りを停止", exact: true });
  assert.equal(await focusedPlay.count(), 1);
  assert.equal(await focusedPlay.getAttribute("aria-pressed"), "true");
  await focusedPlay.click();
  assert.equal(
    await tours.locator(".gallery-tour-focused-play").getAttribute("aria-pressed"),
    "false",
  );
  await tours.locator(".gallery-tour-focused-play").focus();
  await tours.keyboard.press("Escape");
  assert.equal(await tours.locator("#gallery-tour-reading").isVisible(), true);
  assert.equal(await filmstrip.isVisible(), true);
  assert.equal(await play.getAttribute("aria-pressed"), "false");
  const escapeFocus = await tours.evaluate(() => ({
    active: document.activeElement?.outerHTML.slice(0, 600),
    expected: document.querySelector(".gallery-tour-focus-toggle") === document.activeElement,
  }));
  assert.equal(escapeFocus.expected, true, JSON.stringify(escapeFocus));
  assert.equal(new URL(tours.url()).searchParams.get("work"), "g84");
  record(
    "selection visibility toggles; focused view keeps a working pause control; Escape restores reading and selection",
  );
  await tours.getByRole("button", { name: "作品に集中", exact: true }).click();
  await selectionToggle.click();
  assert.equal(await tours.locator("#gallery-tour-reading").isVisible(), true);
  assert.equal(await filmstrip.isVisible(), true);
  record("selecting works from focused view restores visible catalogue controls");

  await tours.locator("#gallery-tour-stage").focus();
  await tours.keyboard.press("End");
  await expectTour(tours, "design-lines", "g89", 7);
  await tours.getByRole("button", { name: /次の巡回 星光をたどる/ }).click();
  await expectTour(tours, "starlight", "g05", 1);
  assert.equal(
    await tours.locator("main h1").evaluate((heading) => heading === document.activeElement),
    true,
  );
  assert.equal(
    await tours.locator(".gallery-tour-play-button").getAttribute("aria-pressed"),
    "false",
  );
  record(
    "last course ending routes to first work of next course, resets playback and focuses new title",
  );
  await tours.screenshot({ path: `${output}/next-course.png` });
  assert.deepEqual(results.errors, [], "Unexpected page errors");
} catch (error) {
  results.failure = error.stack;
  if (activePage) await activePage.screenshot({ path: `${output}/failure.png` }).catch(() => {});
  throw error;
} finally {
  await writeFile(`${output}/results.json`, JSON.stringify(results, null, 2));
  await Promise.all(contexts.map((context) => context.close()));
  await browser.close();
  console.log(
    JSON.stringify({
      engine,
      checks: results.checks.length,
      output,
      failure: results.failure || null,
    }),
  );
}
