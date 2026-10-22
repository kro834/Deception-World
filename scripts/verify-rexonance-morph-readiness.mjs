// Local fault injection with real tab clicks and in-page RAF probes.
// A drawImage alpha probe is not a measurement of compositor frame continuity.
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium, webkit } from "playwright";

const base = new URL(process.env.BASE_URL || "http://127.0.0.1:8269");
assert.ok(["127.0.0.1", "localhost"].includes(base.hostname));
const out = process.env.OUT_DIR || "output/playwright/site-fixes-20261023/morph";
await mkdir(out, { recursive: true });
const engine = process.env.BROWSER === "webkit" ? webkit : chromium;
const browser = await engine.launch(engine === chromium ? { channel: "chrome" } : {});
const results = [];
try {
  for (const mode of (
    process.env.MORPH_MODES ||
    "delayed,rapid,decode-throw,slow-image,network-error,fonts-blocked,reentry,standard-return,forced-colors,forced-toggle,reduced-toggle"
  ).split(",")) {
    const page = await browser.newPage({
      viewport: { width: Number(process.env.MORPH_WIDTH || 1280), height: 900 },
      forcedColors: mode === "forced-colors" ? "active" : "none",
    });
    const errors = [],
      failed = [],
      requests = [],
      responses = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("requestfailed", (request) =>
      failed.push({ url: request.url(), error: request.failure()?.errorText }),
    );
    page.on("request", (request) => {
      if (/rexonance-(?:max|ultra).*20260923|fonts\./.test(request.url()))
        requests.push({ time: Date.now(), url: request.url() });
    });
    page.on("response", (response) => {
      if (/rexonance-(?:max|ultra).*20260923|fonts\./.test(response.url()))
        responses.push({ status: response.status(), url: response.url() });
    });
    if (mode === "slow-image" || mode === "network-error")
      await page.route("**/rider-rexonance-max-20260923*", async (route) => {
        if (mode === "network-error") return route.abort();
        await new Promise((resolve) => setTimeout(resolve, 1800));
        return route.continue().catch(() => {});
      });
    if (mode === "fonts-blocked")
      await page.route(/https:\/\/fonts\.(googleapis|gstatic)\.com\//, (route) => route.abort());
    await page.addInitScript((mode) => {
      const native = HTMLImageElement.prototype.decode;
      window.__morphFaults = 0;
      HTMLImageElement.prototype.decode = function (...args) {
        if (!this.isConnected && /rexonance-(max|ultra)-20260923/.test(this.src)) {
          window.__morphFaults++;
          if (mode === "decode-throw") throw new Error("injected morph decode failure");
          if (mode === "delayed" || mode === "rapid" || mode === "reentry")
            return native
              .apply(this, args)
              .then(() => new Promise((resolve) => setTimeout(resolve, 1800)));
        }
        return native.apply(this, args);
      };
    }, mode);
    const open = async (navigate = true) => {
      if (navigate)
        await page.goto(new URL("/rexonance-saga", base).href, { waitUntil: "domcontentloaded" });
      await page.waitForFunction(() => document.querySelector(".rxs-stage-tabs"));
      await page.waitForFunction(
        () =>
          !document.documentElement.hasAttribute("data-loading") &&
          !document.querySelector(".load-gate"),
      );
      await page.locator(".rxs-stage-tabs").scrollIntoViewIfNeeded();
      await page.waitForFunction(() => {
        const image = document.querySelector("#rxs-stage-panel figure > img");
        return image?.complete && image.naturalWidth > 0 && image.offsetWidth > 0;
      });
      await page.locator("#rxs-stage-panel figure > img").evaluate((image) => image.decode());
    };
    await open();
    const record = () =>
      page.evaluate(() => {
        const run = (window.__morphRun = (window.__morphRun || 0) + 1);
        window.__morphFrames = [];
        window.__morphUntil = performance.now() + 6500;
        const probe = document.createElement("canvas");
        probe.width = probe.height = 1;
        const probeContext = probe.getContext("2d");
        const sample = (now) => {
          if (run !== window.__morphRun) return;
          const image = document.querySelector("#rxs-stage-panel figure > img");
          const canvas = document.querySelector(".rxs-form-morph");
          let painted = false;
          let readable = false;
          if (image?.naturalWidth > 0) {
            try {
              probeContext.clearRect(0, 0, 1, 1);
              probeContext.drawImage(image, 0, 0, 1, 1);
              readable = probeContext.getImageData(0, 0, 1, 1).data[3] > 0;
            } catch {
              // Keep an unsuccessful image probe separate from compositor evidence.
            }
          }
          const canvasStyle = canvas && getComputedStyle(canvas);
          if (
            canvas?.width &&
            canvas.height &&
            canvasStyle.opacity !== "0" &&
            canvasStyle.display !== "none" &&
            canvasStyle.visibility !== "hidden"
          ) {
            const pixels = canvas
              .getContext("2d")
              .getImageData(0, 0, canvas.width, canvas.height).data;
            for (let i = 3; i < pixels.length; i += 40)
              if (pixels[i]) {
                painted = true;
                break;
              }
          }
          window.__morphFrames.push({
            now,
            source: image?.currentSrc,
            ready: readable,
            complete: image?.complete,
            naturalWidth: image?.naturalWidth,
            painted,
            visibility: image ? getComputedStyle(image).visibility : "absent",
            width: image?.offsetWidth,
            stage: document.querySelector(".rxs-stage-tabs")?.dataset.stage,
          });
          if (now < window.__morphUntil) requestAnimationFrame(sample);
        };
        requestAnimationFrame(sample);
      });
    await record();
    await page.locator("#rxs-stage-tab-max").click();
    if (mode === "forced-toggle" || mode === "reduced-toggle") {
      await page.waitForFunction(() => {
        const canvas = document.querySelector(".rxs-form-morph");
        return canvas && getComputedStyle(canvas).opacity === "1";
      });
      await page.emulateMedia(
        mode === "forced-toggle" ? { forcedColors: "active" } : { reducedMotion: "reduce" },
      );
    }
    if (mode === "rapid") {
      for (const stage of ["ultra", "max", "ultra"]) {
        await page.waitForTimeout(70);
        await page.locator(`#rxs-stage-tab-${stage}`).click();
      }
    }
    if (mode === "reentry") {
      await page.waitForTimeout(150);
      await page.locator(".rxs-brand").click();
      await page.waitForURL(/\/world/);
      await page.goBack();
      await page.waitForURL(/\/rexonance-saga/);
      await open(false);
      await record();
      await page.locator("#rxs-stage-tab-ultra").click();
    }
    if (mode === "standard-return") {
      await page.waitForTimeout(3500);
      await page.locator("#rxs-stage-tab-standard").click();
      await page.waitForFunction(
        () => document.querySelector("#rxs-stage-panel")?.dataset.morphStage === "standard",
      );
    }
    await page.waitForTimeout(6500);
    const state = await page.evaluate(() => ({
      frames: window.__morphFrames || [],
      faults: window.__morphFaults,
      stage: document.querySelector(".rxs-stage-tabs")?.dataset.stage,
      source: document.querySelector("#rxs-stage-panel figure > img")?.currentSrc,
      fonts: document.fonts.status,
      held: document.querySelector("#rxs-stage-panel")?.dataset.morphStage,
    }));
    await page.screenshot({ path: `${out}/${engine.name()}-${mode}.png` });
    const earlyTarget = state.frames.filter(
      (frame) =>
        frame.stage !== "standard" &&
        !frame.painted &&
        /rexonance-(max|ultra)-20260923/.test(frame.source || ""),
    );
    const firstPaint = state.frames.findIndex((frame) => frame.painted);
    const beforePaint = state.frames.slice(0, firstPaint < 0 ? state.frames.length : firstPaint);
    const wrongBeforePaint = beforePaint.filter(
      (frame) => frame.stage !== "standard" && !/saga-pickup-20260923/.test(frame.source || ""),
    );
    const unreadableImageProbes = state.frames.filter((frame) => !frame.painted && !frame.ready);
    results.push({
      mode,
      ...state,
      earlyTargetFrames: earlyTarget.length,
      wrongBeforePaint: wrongBeforePaint.length,
      unreadableImageProbes: unreadableImageProbes.length,
      compositorContinuity: "unverified",
      errors,
      failed,
      requests,
      responses,
    });
    await writeFile(`${out}/${engine.name()}-report.json`, JSON.stringify(results, null, 2));
    if (process.env.EXPECT_FIXED === "1") {
      assert.equal(errors.length, 0, JSON.stringify(errors));
      assert.equal(
        requests.filter(
          (request) =>
            /rider-rexonance-(max|ultra)-20260923/.test(request.url) &&
            !/-delivery-\d+\.webp$/.test(new URL(request.url).pathname),
        ).length,
        0,
        "morph and warmup never fetch a second original image",
      );
      if (mode === "forced-colors")
        assert.equal(
          state.frames.some((frame) => frame.painted),
          false,
          "CSS-hidden canvas is never used for forced colors",
        );
      if (["delayed", "rapid", "slow-image", "reentry"].includes(mode)) {
        assert.ok(firstPaint >= 0, "morph eventually paints");
        assert.equal(
          wrongBeforePaint.length,
          0,
          "old decoded art stays visible until canvas preparation",
        );
      }
      assert.equal(
        state.frames.filter((frame) => !frame.painted && frame.visibility === "hidden").length,
        0,
        "never hide the image without painted canvas pixels",
      );
      assert.match(
        state.source,
        mode === "network-error" || mode === "standard-return"
          ? /saga-pickup-/
          : mode === "rapid" || mode === "reentry"
            ? /rexonance-ultra-/
            : /rexonance-max-/,
      );
    }
    console.log(
      `${engine.name()}/${mode}: ${state.frames.length} RAF probes, before-canvas target ${wrongBeforePaint.length}, unreadable image probes ${unreadableImageProbes.length}, faults ${state.faults}, errors ${errors.length}; compositor continuity unverified`,
    );
    await page.close();
  }
} finally {
  await writeFile(`${out}/${engine.name()}-report.json`, JSON.stringify(results, null, 2));
  await browser.close();
}
