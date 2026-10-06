import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium, webkit } from "playwright";
import {
  WORLD_BRIEF,
  WORLD_CAST_ROSTER,
  WORLD_EPISODE_NOTES,
  WORLD_GLOSSARY,
} from "../src/components/world/world-annex-data.ts";
import { DREAM_CASES } from "../src/components/dream-chapter/dream-chapter-data.ts";
import { DREAM_CHRONICLE } from "../src/components/dream-chapter/dream-chapter-extra-data.ts";

const base = process.env.BASE_URL || "http://127.0.0.1:8082";
const engine = process.env.PW_ENGINE === "webkit" ? "webkit" : "chromium";
const output = process.env.AUDIT_OUT || `/tmp/editorial-copy-audit-${engine}`;
await mkdir(output, { recursive: true });
const browser = await (engine === "webkit" ? webkit : chromium).launch(
  engine === "webkit" ? {} : { channel: process.env.PW_BROWSER_CHANNEL || "chrome" },
);

async function assertReadable(page, selector) {
  const failures = await page.locator(selector).evaluateAll((nodes) =>
    nodes.flatMap((node) => {
      const rect = node.getBoundingClientRect();
      return rect.width > 0 &&
        (node.scrollWidth > node.clientWidth + 1 || node.scrollHeight > node.clientHeight + 1)
        ? [node.textContent?.trim()]
        : [];
    }),
  );
  assert.deepEqual(failures, [], `${selector}: rewritten text must not be clipped`);
  assert.ok(
    (await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)) <= 1,
    "rewritten copy must not create document overflow",
  );
}

async function shot(page, selector, path) {
  const locator = typeof selector === "string" ? page.locator(selector).first() : selector;
  await locator.scrollIntoViewIfNeeded();
  await page.evaluate(() => document.fonts.ready);
  await locator.screenshot({ path });
}

try {
  for (const width of [320, 390, 768, 1194, 1440]) {
    const context = await browser.newContext({
      viewport: { width, height: 844 },
      hasTouch: true,
      isMobile: width < 600,
      reducedMotion: "reduce",
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(new URL("/world", base).href, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(
      () => !document.documentElement.hasAttribute("data-route-scroll-settling"),
    );
    for (const entry of WORLD_CAST_ROSTER) {
      const profile = page.locator(`#wa-person-${entry.id}`).locator("..").locator("details");
      await profile.locator("summary").scrollIntoViewIfNeeded();
      await profile.locator("summary").focus();
      await page.keyboard.press("Enter");
      assert.equal(await profile.getAttribute("open"), "");
      assert.deepEqual(
        await profile.locator(".wa-prose").allTextContents(),
        entry.profile.map(({ text }) => text),
      );
      await assertReadable(page, ".wa-profile[open] .wa-prose");
      if (entry.id === "yuma") await shot(page, profile, `${output}/world-${width}-profile.png`);
      await page.keyboard.press("Space");
      assert.equal(await profile.getAttribute("open"), null);
    }
    for (const [index, entry] of WORLD_BRIEF.entries()) {
      const article = page.locator(".wa-brief-grid > article").nth(index);
      assert.deepEqual(await article.locator(":scope > .wa-prose").allTextContents(), entry.body);
    }
    for (const [index, episode] of WORLD_EPISODE_NOTES.entries()) {
      const record = page.locator(".wa-episodes > li").nth(index);
      assert.deepEqual(
        await record.locator(".wa-episode-synopsis > p").allTextContents(),
        episode.synopsis,
      );
      const text = await record.textContent();
      for (const { text: line, by } of episode.lines) {
        assert.ok(text.includes(line) && text.includes(by));
      }
    }
    for (const [index, entry] of WORLD_GLOSSARY.entries()) {
      assert.deepEqual(
        await page
          .locator(".wa-glossary > div")
          .nth(index)
          .locator("dd > .wa-prose")
          .allTextContents(),
        entry.body,
      );
    }
    await shot(page, "#world-brief", `${output}/world-${width}-brief.png`);
    await assertReadable(page, "#world-brief .wa-prose");
    await shot(page, "#episode-notes", `${output}/world-${width}-episodes.png`);
    await assertReadable(page, "#episode-notes .wa-prose");
    await assertReadable(page, "#episode-notes blockquote p");
    await shot(page, "#glossary", `${output}/world-${width}-glossary.png`);
    await assertReadable(page, "#glossary .wa-prose");

    await page.goto(new URL("/dream-chapter", base).href, { waitUntil: "domcontentloaded" });
    const cases = page.locator(".dream-story-case");
    await page.waitForFunction(
      () =>
        document.documentElement.dataset.dreamChapter === "true" &&
        !document.documentElement.hasAttribute("data-route-scroll-settling"),
    );
    for (const [index, episode] of DREAM_CASES.entries()) {
      const record = cases.nth(index);
      await record.locator("summary").scrollIntoViewIfNeeded();
      await record.locator("summary").focus();
      await page.keyboard.press("Enter");
      assert.deepEqual(
        await record.locator(".dream-story-case-body > p").allTextContents(),
        episode.paragraphs,
      );
      await assertReadable(page, ".dream-story-case[open] .dream-story-case-body > p");
      if (episode.no === "5") await shot(page, record, `${output}/dream-${width}-case5.png`);
      await page.keyboard.press("Space");
    }
    const chronicle = page.locator("#dream-chronicle-case-5");
    await chronicle.locator("summary").scrollIntoViewIfNeeded();
    await chronicle.locator("summary").press("Enter");
    assert.equal(await chronicle.getAttribute("open"), "");
    const events = DREAM_CHRONICLE.filter(({ case: no }) => no === "5");
    assert.equal(await chronicle.locator(".dream-chronicle-item").count(), events.length);
    for (const [index, event] of events.entries()) {
      if (event.no <= 40) continue;
      const entry = chronicle.locator(".dream-chronicle-item").nth(index);
      assert.equal(await entry.locator("h3").textContent(), event.title.text);
      const text = await entry.locator(".dream-chronicle-body").textContent();
      for (const passage of event.segments ?? [{ text: event.text }]) {
        assert.ok(text.includes(passage.text), `event ${event.no}: source passage is displayed`);
      }
      await entry.scrollIntoViewIfNeeded();
      await assertReadable(
        page,
        `#dream-chronicle-case-5 .dream-chronicle-item:nth-child(${index + 1}) p`,
      );
    }
    await shot(page, chronicle, `${output}/dream-${width}-latest-events.png`);
    await chronicle.locator("summary").press("Space");
    assert.equal(await chronicle.getAttribute("open"), null);
    assert.deepEqual(errors, []);
    await context.close();
    console.log(
      `${width}px: rewritten profiles, definitions, selected lines and all six cases passed`,
    );
  }
} finally {
  await browser.close();
}
