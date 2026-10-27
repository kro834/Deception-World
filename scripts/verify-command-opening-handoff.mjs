// Command-deck World entry: browser emulation only, not physical iPad Safari.
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium, webkit } from "playwright";

const base = process.env.BASE_URL || "http://127.0.0.1:8302";
const engines = (process.env.OPENING_ENGINES || "chromium,webkit").split(",");
const output = "output/playwright/command-opening-handoff";
const profiles = [
  { name: "phone", width: 320, height: 740 },
  { name: "ipad-portrait", width: 834, height: 1194 },
  { name: "ipad-landscape", width: 1194, height: 834 },
  { name: "desktop", width: 1440, height: 900 },
  { name: "reduced", width: 834, height: 1194, reduced: true },
  { name: "economy", width: 834, height: 1194, economy: true },
];
const results = [];
await mkdir(output, { recursive: true });
for (const engine of engines) {
  const browser = await (engine === "webkit" ? webkit : chromium).launch(
    engine === "webkit" ? {} : { channel: "chrome" },
  );
  try {
    for (const profile of profiles) {
      const context = await browser.newContext({
        viewport: { width: profile.width, height: profile.height },
        hasTouch: profile.width < 1400,
        reducedMotion: profile.reduced ? "reduce" : "no-preference",
        ...(profile.economy
          ? {
              userAgent:
                "Mozilla/5.0 (iPad; CPU OS 18_6 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148",
            }
          : {}),
      });
      await context.addInitScript(() => {
        window.__handoffPhases = [];
        const observe = () => {
          const root = document.querySelector("[data-opening-handoff-root]");
          if (root) {
            const entry = `${root.dataset.openingHandoffPhase}:${root.dataset.openingHandoffTier || "pending"}`;
            if (!window.__handoffPhases.includes(entry)) window.__handoffPhases.push(entry);
          }
        };
        new MutationObserver(observe).observe(document, {
          subtree: true,
          childList: true,
          attributes: true,
          attributeFilter: ["data-opening-handoff-phase", "data-opening-handoff-tier"],
        });
      });
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      const result = { engine, profile: profile.name };
      try {
        await page.goto(base, { waitUntil: "domcontentloaded" });
        await page.locator('.command-deck[data-scene="world"]').waitFor();
        assert.equal(await page.locator("[data-opening-handoff-root]").count(), 0);
        const enter = page.locator(".command-deck-enter");
        const rect = await enter.boundingBox();
        assert.ok(rect && rect.width >= 44 && rect.height >= 44, "entry touch target");
        assert.ok(
          await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
          "horizontal overflow",
        );
        await enter.click();
        await page.waitForURL((url) => url.pathname === "/world", { timeout: 20000 });
        await page
          .locator("[data-opening-handoff-root]")
          .waitFor({ state: "detached", timeout: 12000 });
        result.phases = await page.evaluate(() => window.__handoffPhases);
        assert.ok(
          result.phases.some((phase) => phase.startsWith("covering:")),
          `handoff must cover before World: ${result.phases}`,
        );
        assert.ok(
          result.phases.some((phase) => phase.startsWith("arriving:")),
          `handoff must arrive: ${result.phases}`,
        );
        if (profile.economy)
          assert.ok(
            result.phases.includes("covering:css"),
            `economy must use CSS: ${result.phases}`,
          );
        assert.deepEqual(errors, []);
        await page.goBack();
        await page.locator('.command-deck[data-scene="world"]').waitFor();
        assert.equal(
          await page.locator("[data-opening-handoff-root]").count(),
          0,
          "history restores settled deck",
        );
        await page.screenshot({ path: `${output}/${engine}-${profile.name}-returned.png` });
        await page.goForward();
        await page.waitForURL((url) => url.pathname === "/world");
        await page.locator("[data-opening-handoff-root]").waitFor({ state: "detached" });
        result.pass = true;
      } catch (error) {
        result.pass = false;
        result.error = error.message;
        result.errors = errors;
        result.phases = await page.evaluate(() => window.__handoffPhases).catch(() => []);
        await page
          .screenshot({ path: `${output}/${engine}-${profile.name}-failure.png` })
          .catch(() => {});
      } finally {
        await context.close();
      }
      results.push(result);
      console.log(JSON.stringify(result));
    }
  } finally {
    await browser.close();
  }
}
await writeFile(`${output}/results.json`, `${JSON.stringify(results, null, 2)}\n`);
if (results.some((result) => !result.pass)) process.exitCode = 1;
