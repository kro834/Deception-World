import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium, webkit } from "playwright";
import { checkedUrl } from "./browser-guard.mjs";
import { DREAM_CHRONICLE } from "../src/components/dream-chapter/dream-chapter-extra-data.ts";
import { buildDreamRecordFacets } from "../src/lib/dream-record-index.ts";

const base = checkedUrl(process.env.BASE_URL || "http://127.0.0.1:8277");
const engineName = process.env.PW_ENGINE === "webkit" ? "webkit" : "chromium";
const engine = engineName === "webkit" ? webkit : chromium;
const output = process.env.AUDIT_OUT || `output/playwright/dream-record-reading-${engineName}`;
const browser = await engine.launch(engine === chromium ? { channel: "chrome" } : undefined);
const viewports = [
  { width: 320, height: 640 },
  { width: 390, height: 844 },
  { width: 1024, height: 768 },
  { width: 1440, height: 900 },
];
await mkdir(output, { recursive: true });

try {
  for (const viewport of viewports) {
    const page = await browser.newPage({ viewport, reducedMotion: "reduce" });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(new URL("/dream-chapter#dream-record-explorer", base).href, {
      waitUntil: "domcontentloaded",
    });
    const explorer = page.locator("#dream-record-explorer");
    const query = explorer.locator('input[type="search"]');
    await query.waitFor({ state: "visible" });
    await page.waitForFunction(() => {
      const input = document.getElementById("dream-record-query");
      return input && Object.keys(input).some((key) => key.startsWith("__reactProps"));
    });
    const selects = explorer.locator(".dream-record-filters select");
    const person = selects.nth(1);
    const baseline = buildDreamRecordFacets(DREAM_CHRONICLE);
    const cielLabel = `シエル（${baseline.people["シエル"]}件）`;
    assert.equal(await person.getByRole("option", { name: cielLabel, exact: true }).count(), 1);
    assert.ok((await person.ariaSnapshot()).includes(cielLabel));
    await person.selectOption("シエル");
    await selects.nth(0).selectOption("0");
    await selects.nth(2).selectOption("碧栄");
    const filters = { query: "", case: "0", person: "シエル", place: "碧栄" };
    const scoped = buildDreamRecordFacets(DREAM_CHRONICLE, filters);
    for (const [index, field] of [
      [0, "cases"],
      [1, "people"],
      [2, "places"],
    ]) {
      const options = await selects
        .nth(index)
        .locator("option[value]:not([value=''])")
        .evaluateAll((nodes) =>
          nodes.map((option) => ({
            value: option.value,
            label: option.label,
            disabled: option.disabled,
          })),
        );
      for (const option of options) {
        assert.ok(option.label.endsWith(`（${scoped[field][option.value] ?? 0}件）`));
        assert.equal(option.disabled, false, "zero-count choices remain selectable");
      }
    }
    await selects.nth(2).evaluate((element) => element.scrollIntoView({ block: "center" }));
    await page.screenshot({ path: `${output}/${viewport.width}-native-selected.png` });
    assert.match(await person.ariaSnapshot(), /シエル（\d+件）.*selected/);

    const measurements = await explorer.evaluate((element) => ({
      overflow: document.documentElement.scrollWidth - innerWidth,
      selects: [...element.querySelectorAll("select")].map(
        (select) => getComputedStyle(select).fontSize,
      ),
      shortControls: [...element.querySelectorAll("button, a, input, select, summary")]
        .filter((control) => control.getClientRects().length)
        .filter((control) => control.getBoundingClientRect().height < 44)
        .map((control) => ({
          text: control.textContent,
          height: control.getBoundingClientRect().height,
        })),
      clippedExcerpts: [...element.querySelectorAll(".dream-record-excerpt")].filter(
        (excerpt) => excerpt.scrollHeight > excerpt.clientHeight + 1,
      ).length,
    }));
    assert.equal(measurements.overflow, 0);
    assert.deepEqual(measurements.selects, ["16px", "16px", "16px"]);
    assert.deepEqual(measurements.shortControls, []);
    assert.equal(measurements.clippedExcerpts, 0);
    const selectedBefore = await selects.evaluateAll((elements) =>
      elements.map((element) => element.value),
    );
    const first = explorer.locator(".dream-record-card").first();
    const summary = first.locator(".dream-record-reading > summary");
    const initialHash = new URL(page.url()).hash;
    await summary.focus();
    await summary.press("Enter");
    assert.equal(await first.locator(".dream-record-reading").getAttribute("open"), "");
    assert.equal(await summary.evaluate((element) => element === document.activeElement), true);
    assert.deepEqual(
      await selects.evaluateAll((elements) => elements.map((element) => element.value)),
      selectedBefore,
    );
    assert.equal(new URL(page.url()).hash, initialHash);
    await summary.press("Space");
    assert.equal(await first.locator(".dream-record-reading").getAttribute("open"), null);
    await summary.press("Enter");
    const nextLink = first.locator('[rel="next"]');
    const nextHash = await nextLink.getAttribute("href");
    await nextLink.evaluate((element) => element.scrollIntoView({ block: "center" }));
    await nextLink.click();
    await page.waitForFunction(
      (hash) => location.hash === hash && document.activeElement?.id === hash.slice(1),
      nextHash,
    );
    assert.equal(
      await page.locator(nextHash).evaluate((element) => element.closest("details").open),
      true,
    );
    await page.goBack();
    await page.waitForFunction((hash) => location.hash === hash, initialHash);
    assert.deepEqual(
      await selects.evaluateAll((elements) => elements.map((element) => element.value)),
      selectedBefore,
    );

    await explorer.getByRole("button", { name: "条件をクリア", exact: true }).click();
    for (const no of [1, 2, 26]) {
      const record = DREAM_CHRONICLE.find((item) => item.no === no);
      await query.fill(record.title.text);
      const card = explorer
        .locator(".dream-record-card")
        .filter({ has: page.getByRole("heading", { name: record.title.text, exact: true }) });
      await card.locator(".dream-record-reading > summary").focus();
      if ((await card.locator(".dream-record-reading").getAttribute("open")) === null) {
        await card.locator(".dream-record-reading > summary").press("Enter");
      }
      const expected = record.segments
        ? record.segments.map((segment) => ({
            text: `${segment.by ?? ""}${segment.text}`,
            speaker: segment.by ?? null,
          }))
        : [
            ...record.text.split("\n").map((line) => ({ text: line, speaker: null })),
            ...(record.by ? [{ text: record.by, speaker: null }] : []),
          ];
      const actual = await card
        .locator(".dream-record-reading-body > p")
        .evaluateAll((paragraphs) =>
          paragraphs.map((paragraph) => ({
            text: paragraph.textContent,
            speaker: paragraph.querySelector("b")?.textContent ?? null,
          })),
        );
      assert.deepEqual(
        actual,
        expected,
        "source words, speakers and paragraph boundaries are unchanged",
      );
      await card
        .locator(".dream-record-reading > summary")
        .evaluate((element) => element.scrollIntoView({ block: "center" }));
      await page.screenshot({ path: `${output}/${viewport.width}-record-${no}.png` });
    }
    assert.deepEqual(errors, []);
    console.log(
      `PASS ${engineName} ${viewport.width}: facets, native labels, keyboard reading, source fidelity, context links, retained filters, sizes and overflow`,
    );
    await page.close();
  }
} finally {
  await browser.close();
}
