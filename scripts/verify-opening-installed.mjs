// Installed-iPad settings on Chromium/WebKit, not a claim of physical-device coverage.
// BASE_URL=https://deception-world.vercel.app node scripts/verify-opening-installed.mjs
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium, webkit } from "playwright";

const base = process.env.BASE_URL || "http://127.0.0.1:4197";
const engines = (process.env.OPENING_ENGINES || "chromium,webkit").split(",");
const scenarios = (process.env.OPENING_CASES || "normal,economy,no-webgl,early-loss,reduced").split(
  ",",
);
const output = process.env.OPENING_SHOTS_DIR || "output/playwright/installed-opening";
await mkdir(output, { recursive: true });

for (const engine of engines) {
  const browser = await (engine === "webkit" ? webkit : chromium).launch(
    engine === "chromium" ? { channel: "chrome" } : {},
  );
  try {
    for (const scenario of scenarios) {
      const context = await browser.newContext({
        viewport: { width: 1366, height: 1024 },
        deviceScaleFactor: 2,
        hasTouch: true,
        isMobile: true,
        reducedMotion: scenario === "reduced" ? "reduce" : "no-preference",
        // Version-omitted/frozen-OS is a conservative economy fixture, not
        // an assertion about the reporting user's actual navigator string.
        userAgent:
          scenario === "economy"
            ? "Mozilla/5.0 (iPad; CPU OS 18_6 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148"
            : "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15 Version/27.2 Mobile/15E148 Safari/604.1",
      });
      try {
        await context.addInitScript((scenario) => {
          Object.defineProperty(navigator, "standalone", { get: () => true });
          const original = window.matchMedia.bind(window);
          window.matchMedia = (query) => {
            const media = original(query);
            if (query === "(display-mode: standalone)")
              Object.defineProperty(media, "matches", { value: true });
            return media;
          };
          const getContext = HTMLCanvasElement.prototype.getContext;
          window.__openingContexts = [];
          HTMLCanvasElement.prototype.getContext = function (type, ...args) {
            if (scenario === "no-webgl" && /webgl/i.test(type)) return null;
            const gl = getContext.call(this, type, ...args);
            if (/webgl/i.test(type) && gl && this.className === "opening-dive-canvas") {
              window.__openingContexts.push(gl);
            }
            return gl;
          };
        }, scenario);
        const page = await context.newPage();
        const errors = [];
        page.on("pageerror", (error) => errors.push(error.message));
        await page.goto(new URL("/?opening=1", base).href);
        const enter = page.getByRole("button", { name: "ディセプションワールドへ入る" });
        await enter.waitFor({ timeout: 45000 });
        await page.waitForTimeout(1800);
        const started = Date.now();
        await enter.tap();
        if (scenario === "early-loss") {
          await page.locator('[data-opening-handoff-tier="webgl"] .opening-dive-canvas').waitFor();
          assert.ok(
            await page.evaluate(() => {
              const gl = window.__openingContexts.find((gl) => !gl.isContextLost());
              const extension = gl?.getExtension("WEBGL_lose_context");
              extension?.loseContext();
              return Boolean(extension);
            }),
          );
          // WEBGL_lose_context dispatches its event asynchronously; sample
          // the fallback clock only after the application has switched tiers.
          await page.locator('[data-opening-handoff-tier="css"]').waitFor();
        }
        if (scenario !== "reduced") {
          await page.waitForTimeout(350);
          const state = await page.evaluate(() => {
            const root = document.querySelector("[data-opening-handoff-root]");
            const logo = document.querySelector("[data-opening-handoff-logo]");
            const canvas = document.querySelector(".opening-dive-canvas");
            return {
              path: location.pathname,
              tier: root?.dataset.openingHandoffTier,
              rootOpacity: root && Number(getComputedStyle(root).opacity),
              logoOpacity: logo && Number(getComputedStyle(logo).opacity),
              cityCount: document.querySelectorAll("[data-opening-city-fallback], .opening-rain-city").length,
              canvasOpacity: canvas && Number(getComputedStyle(canvas).opacity),
              fallback: window.__openingDiveStats?.fallback,
            };
          });
          assert.equal(state.cityCount, 0);
          assert.equal(state.path, "/", "flight must not skip straight to World");
          if (["economy", "no-webgl", "early-loss"].includes(scenario))
            assert.equal(state.tier, "css");
          if (state.tier === "css") {
            assert.ok(state.rootOpacity > 0.9, "CSS dive remains visible");
          } else {
            assert.equal(state.tier, "webgl");
            assert.ok(state.canvasOpacity > 0.9, "logo shader must be visible mid-flight");
          }
          await page.screenshot({ path: `${output}/${engine}-${scenario}.png` });
          console.log(JSON.stringify({ engine, scenario, state }));
        }
        await page.waitForURL(/\/world$/, { timeout: 12000 });
        await page.locator("[data-opening-handoff-root]").waitFor({ state: "detached" });
        assert.deepEqual(errors, []);
        console.log(
          JSON.stringify({ engine, scenario, landedMs: Date.now() - started, pass: true }),
        );
      } finally {
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }
}
