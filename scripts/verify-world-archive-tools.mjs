import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium, webkit } from "playwright";

// Functional production-build checks, not performance measurements or a claim
// of physical iOS coverage. Keep the existing rail/return verifiers alongside it.
const engine = process.env.PW_ENGINE === "webkit" ? webkit : chromium;
const name = engine === webkit ? "webkit" : "chromium";
const base = process.env.BASE_URL || "http://127.0.0.1:8271";
const output = process.env.AUDIT_OUT || `/private/tmp/world-archive-tools-${name}`;
await mkdir(output, { recursive: true });
const browser = await engine.launch(engine === chromium ? { channel: "chrome" } : {});
const scenarios = [
  { width: 320, height: 780 },
  { width: 390, height: 844 },
  { width: 834, height: 1112 },
  { width: 900, height: 900 },
  { width: 1024, height: 768 },
  { width: 1440, height: 900 },
  { width: 390, height: 844, mode: "reduced" },
  { width: 390, height: 844, mode: "economy" },
].filter(
  ({ width }) => !process.env.PW_WIDTHS || process.env.PW_WIDTHS.split(",").includes(String(width)),
);
const people = ["ciel", "dante", "luna", "terra", "yoake-mamori"];

async function ready(page) {
  await page.waitForFunction(
    () =>
      document.documentElement.dataset.scrollMotionReady === "true" &&
      !document.documentElement.hasAttribute("data-loading") &&
      !document.documentElement.hasAttribute("data-route-scroll-settling"),
  );
  await page.waitForTimeout(200);
}

async function show(locator) {
  await locator.evaluate((node) => node.scrollIntoView({ block: "center", behavior: "instant" }));
}

async function withinViewport(page, locator, label) {
  try {
    await page.waitForFunction(
      (id) => {
        const node = document.getElementById(id);
        if (!node || !node.getClientRects().length) return false;
        const rect = node.getBoundingClientRect();
        return rect.top >= 0 && rect.top < innerHeight;
      },
      await locator.getAttribute("id"),
    );
  } catch (error) {
    console.error(
      JSON.stringify({
        label,
        url: page.url(),
        target: await locator.evaluate((node) => ({
          rect: node.getBoundingClientRect().toJSON(),
          scrollY,
          root: { ...document.documentElement.dataset },
        })),
      }),
    );
    await page.screenshot({ path: `${output}/failure-${label.replace(/[^a-z0-9]+/gi, "-")}.png` });
    throw error;
  }
  assert.equal(await locator.isVisible(), true, label);
}

async function geometry(page, selector) {
  const result = await page.locator(selector).evaluateAll((nodes) =>
    nodes.map((node) => {
      const r = node.getBoundingClientRect();
      const style = getComputedStyle(node);
      return {
        width: r.width,
        height: r.height,
        layoutHeight: node.offsetHeight,
        x: r.x,
        right: r.right,
        color: style.color,
      };
    }),
  );
  for (const rect of result) {
    // The site's existing press/scroll choreography can momentarily scale a
    // 48 CSS-pixel control by fractions. Check its real layout minimum and
    // retain the 44px visible-hit floor rather than rounding that scale up.
    assert.ok(
      rect.layoutHeight >= 48 && rect.height >= 44,
      `${selector}: short target ${JSON.stringify(rect)}`,
    );
    assert.ok(rect.x >= -1 && rect.right <= page.viewportSize().width + 1, `${selector}: overflow`);
  }
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
    true,
  );
}

try {
  for (const scenario of scenarios) {
    const label = `${scenario.width}-${scenario.mode || "normal"}`;
    const context = await browser.newContext({
      viewport: { width: scenario.width, height: scenario.height },
      hasTouch: scenario.width <= 1024,
      reducedMotion: scenario.mode === "reduced" ? "reduce" : "no-preference",
    });
    await context.addInitScript(
      ({ economy }) => {
        Object.defineProperty(Navigator.prototype, "hardwareConcurrency", {
          get: () => (economy ? 2 : 8),
          configurable: true,
        });
        Object.defineProperty(Navigator.prototype, "deviceMemory", {
          get: () => (economy ? 2 : 8),
          configurable: true,
        });
      },
      { economy: scenario.mode === "economy" },
    );
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`${base}/world#cast-roster`);
    await ready(page);
    if (scenario.mode === "economy")
      assert.equal(await page.locator("html").getAttribute("data-world-effects"), "economy");
    const filters = page.getByRole("group", { name: "人物資料の絞り込み" });
    const filter = (name) => filters.getByRole("button", { name, exact: true });
    const rows = page.locator("#cast-roster .wa-roster > li");
    assert.equal(await rows.count(), 14);
    const profile = page.locator("#wa-person-yuma").locator("..").locator("details");
    await show(profile.locator("summary"));
    await profile.locator("summary").click();
    for (const [category, count] of [
      ["ライダーの資料", 7],
      ["六詠の資料", 3],
      ["関連人物の資料", 3],
      ["プロフィールのみ", 1],
      ["すべて", 14],
    ]) {
      await show(filter(category));
      await filter(category).click();
      assert.equal(await rows.filter({ visible: true }).count(), count, `${label} ${category}`);
      assert.equal(await filter(category).getAttribute("aria-pressed"), "true");
    }
    assert.equal(await profile.getAttribute("open"), "", "PROFILE stays expanded across filters");
    await geometry(page, ".wa-directory-controls button");
    await show(filters);
    await page.screenshot({ path: `${output}/${label}-directory.png` });

    // Native fragments and the real same-document router/search path both
    // need to reveal an excluded person, without unmounting the cast wall.
    await filter("プロフィールのみ").click();
    await page.evaluate(() => {
      location.hash = "wa-person-yuma";
    });
    await withinViewport(page, page.locator("#wa-person-yuma"), "native hidden-person landing");
    console.log(`PASS ${name} ${label}: directory and native hidden-person landing`);
    for (let attempt = 0; attempt < 2; attempt += 1) {
      await show(filter("ライダーの資料"));
      await filter("ライダーの資料").click();
      await page.keyboard.press("Control+k");
      await page.getByRole("combobox", { name: "資料を検索" }).fill("アザト");
      await page.locator('dialog.quick-search [role="option"][href$="#wa-person-azato"]').click();
      await page.waitForURL("**#wa-person-azato");
      await ready(page);
      await withinViewport(
        page,
        page.locator("#wa-person-azato"),
        "router hidden-person landing, including a repeated identical destination",
      );
      console.log(`PASS ${name} ${label}: router search ${attempt + 1}`);
    }

    // Records keep native fragments, usable link geometry and actual targets.
    const episodeIndex = page.getByRole("navigation", { name: "エピソードの索引" });
    await show(filter("プロフィールのみ"));
    await filter("プロフィールのみ").click();
    await show(episodeIndex);
    await geometry(page, ".wr-record-index a");
    await episodeIndex.locator('a[href="#wa-episode-03"]').click();
    await withinViewport(page, page.locator("#wa-episode-03"), "episode landing");
    assert.equal(
      await filter("プロフィールのみ").getAttribute("aria-pressed"),
      "true",
      "unrelated fragments retain the filter without moving the upstream layout",
    );
    const links = page.locator(".wr-record-context a");
    for (const href of await links.evaluateAll((nodes) =>
      nodes.map((node) => node.getAttribute("href")),
    )) {
      assert.equal(
        await page.locator(`[id=${JSON.stringify(decodeURIComponent(href.slice(1)))}]`).count(),
        1,
        href,
      );
    }
    await show(page.locator("#wa-episode-03 .wr-record-context"));
    await geometry(page, ".wr-record-context a");
    await page.screenshot({ path: `${output}/${label}-episode-context.png` });
    const term = page.locator('#wa-episode-03 .wr-record-context a[href="#wa-term-夢への扉"]');
    await show(term);
    await term.focus();
    await page.keyboard.press("Enter");
    await withinViewport(page, page.locator('[id="wa-term-夢への扉"]'), "related term landing");

    for (const person of people) {
      await page.goto(`${base}/characters/${person}?from=cast-roster#dossier-index`);
      await ready(page);
      await geometry(page, ".character-chapter-tools a, .character-related-records a");
      const next = page.locator(".character-chapter-next").first();
      const destination = await next.getAttribute("href");
      await show(next);
      await next.focus();
      const focus = await next.evaluate((node) => ({
        color: getComputedStyle(node).color,
        outline: getComputedStyle(node).outlineColor,
      }));
      assert.notEqual(
        focus.outline,
        "rgb(23, 37, 47)",
        "chapter focus must contrast with the dark reading stage",
      );
      await page.keyboard.press("Enter");
      await withinViewport(
        page,
        page.locator(`[id=${JSON.stringify(destination.slice(1))}]`),
        "chapter continuation",
      );
      await show(page.locator(".character-chapter-tools").first());
      await page.screenshot({ path: `${output}/${label}-${person}-reading.png` });
      for (const href of await page
        .locator(".character-chapter-tools a, .character-related-records a")
        .evaluateAll((nodes) =>
          nodes.map((node) => node.getAttribute("href")).filter((href) => href.startsWith("#")),
        )) {
        assert.equal(await page.locator(`[id=${JSON.stringify(href.slice(1))}]`).count(), 1, href);
      }
      const back = page.locator(".manager-back");
      assert.ok(
        (await back.getAttribute("href")).endsWith("/world#cast-roster"),
        "cast origin return is retained",
      );
      if (person === "luna") {
        await show(back);
        await back.click();
        await page.waitForURL("**/world#cast-roster");
        await ready(page);
        // The chapter deliberately subtracts its 129.6px top padding from
        // scroll-margin on desktop. Its outer box can start above the screen
        // while the actual opener/title is correctly below the fixed header.
        await withinViewport(page, page.locator("#cast-roster-title"), "dossier cast return");
        await page.goBack();
        await page.waitForURL("**/characters/luna?from=cast-roster#character-section-02");
        await ready(page);
      }
    }
    assert.deepEqual(errors, [], `${label}: page errors`);
    console.log(
      `PASS ${name} ${label}: filters, open profile, native + router hidden target, records, five dossiers, keyboard, cast return and history`,
    );
    await context.close();
  }
} finally {
  await browser.close();
}
