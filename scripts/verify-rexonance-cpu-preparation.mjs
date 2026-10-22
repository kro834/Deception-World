// Production-build A/B. Pixel instrumentation is deliberately separate from timing.
// BASE_URL=... [BASELINE_URL=... HEADED=1] OUT_FILE=... MODE=pixels|timing RUNS=3 BROWSER=webkit node scripts/verify-rexonance-cpu-preparation.mjs
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { chromium, webkit } from "playwright";

const pixels = process.env.MODE === "pixels";
const browser = await (process.env.BROWSER === "webkit"
  ? webkit.launch()
  : chromium.launch({ channel: "chrome", headless: process.env.HEADED !== "1" }));
const results = [];
const runs = Number(process.env.RUNS || (pixels ? 1 : 3));
const candidate = { variant: "candidate", url: process.env.BASE_URL || "http://127.0.0.1:8082" };
const cases = Array.from({ length: runs }, (_, run) => {
  const pair = process.env.BASELINE_URL
    ? [{ variant: "main", url: process.env.BASELINE_URL }, candidate]
    : [candidate];
  if (run % 2) pair.reverse();
  return pair.map((target) => ({ ...target, run }));
}).flat();
try {
  for (const { run, variant, url } of cases) {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 3,
      isMobile: true,
      hasTouch: true,
    });
    const page = await context.newPage();
    // Isolate preparation from the external font CDN (which can hold the
    // HTML parser on an offline host). Identical policy for both builds.
    await page.route("https://fonts.googleapis.com/**", (route) =>
      route.fulfill({ contentType: "text/css", body: "" }),
    );
    await page.route("https://grok.com/grok-app-builder/extensions.js", (route) =>
      route.fulfill({ contentType: "text/javascript", body: "" }),
    );
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.addInitScript(
      ({ pixels }) => {
        const probe = (window.__cpuPrep = {
          phase: "",
          reads: [],
          puts: [],
          copies: [],
          phases: [],
          slices: [],
          start: null,
          ready: null,
        });
        window.__rexonancePreparationPhase = (phase) => {
          probe.phase = phase;
          probe.phases.push({ phase, time: performance.now() });
        };
        window.__rexonancePreparationSlice = (phase, ms) => probe.slices.push({ phase, ms });
        window.__cpuDigests = [];
        // WebCrypto snapshots the bytes at this call, before a later phase mutates them.
        const digest = (row, bytes) =>
          window.__cpuDigests.push(
            crypto.subtle.digest("SHA-256", bytes).then((hash) => {
              row.digest = [
                bytes.length,
                Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, "0")).join(""),
              ];
            }),
          );
        const proto = CanvasRenderingContext2D.prototype;
        const draw = proto.drawImage;
        proto.drawImage = function (source, ...args) {
          const t = performance.now();
          const result = draw.call(this, source, ...args);
          if (
            probe.start !== null &&
            probe.ready === null &&
            source instanceof HTMLCanvasElement &&
            ["driver-lights-pixels", "nanite-metal-rows", "nanite-molten-rows"].includes(
              probe.phase,
            )
          )
            probe.copies.push({
              phase: probe.phase,
              ms: performance.now() - t,
              cpu: source.getContext("2d").getContextAttributes?.().willReadFrequently ?? null,
            });
          return result;
        };
        const read = proto.getImageData;
        proto.getImageData = function (...args) {
          const t = performance.now();
          const image = read.apply(this, args);
          if (
            probe.start !== null &&
            probe.ready === null &&
            probe.phase &&
            probe.phase !== "cpu-preparation-probe"
          ) {
            const row = { phase: probe.phase, args, ms: performance.now() - t };
            if (pixels) digest(row, image.data);
            probe.reads.push(row);
          }
          return image;
        };
        if (pixels) {
          const put = proto.putImageData;
          proto.putImageData = function (image, ...args) {
            if (
              probe.start !== null &&
              probe.ready === null &&
              probe.phase &&
              probe.phase !== "cpu-preparation-probe"
            ) {
              const row = { phase: probe.phase, args };
              digest(row, image.data);
              probe.puts.push(row);
            }
            return put.call(this, image, ...args);
          };
        }
        new MutationObserver(() => {
          if (
            probe.start !== null &&
            probe.ready === null &&
            document.querySelector('.rzn-suitup[data-rzn-load="ready"]')
          )
            probe.ready = performance.now();
        }).observe(document, {
          subtree: true,
          attributes: true,
          attributeFilter: ["data-rzn-load"],
        });
      },
      { pixels },
    );
    if (process.env.BROWSER !== "webkit") {
      const cdp = await context.newCDPSession(page);
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
      await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
    }
    await page.goto(`${url}/rexonance-saga`, {
      waitUntil: "domcontentloaded",
    });
    await page.waitForFunction(
      () =>
        document.querySelector("main[data-motion-ready]") &&
        document.querySelector(".rzn-suitup") &&
        !document.documentElement.hasAttribute("data-loading"),
      null,
      { timeout: 60000 },
    );
    await page.addStyleTag({ content: "html,body {scroll-behavior:auto!important}" });
    // Hydration alone is not scroll-restoration completion. Starting earlier
    // can have the router restore y=0 just after crossing the hero threshold.
    await page.waitForLoadState("load");
    await page.waitForTimeout(2000);
    await page.evaluate(() => {
      if (document.querySelector(".rzn-suitup").dataset.rznLoad === "ready")
        throw new Error("Preparation already ready before hero crossing");
      window.__cpuPrep.start = performance.now();
      scrollTo({ top: Math.ceil(innerHeight * 0.5) + 1, behavior: "instant" });
    });
    await page
      .waitForFunction(() => window.__cpuPrep.ready !== null, null, { timeout: 60000 })
      .catch(async (error) => {
        console.error(
          await page.evaluate(() => ({
            phase: window.__cpuPrep.phase,
            reads: window.__cpuPrep.reads.length,
            state: { ...document.querySelector(".rzn-suitup")?.dataset },
            scrollY,
            hidden: document.hidden,
            readyState: document.readyState,
          })),
          errors,
        );
        throw error;
      });
    const data = await page.evaluate(async () => {
      await Promise.all(window.__cpuDigests);
      const p = window.__cpuPrep;
      return {
        elapsed: p.ready - p.start,
        reads: p.reads,
        puts: p.puts,
        copies: p.copies,
        phases: p.phases.map((r) => ({ ...r, time: r.time - p.start })),
        slices: p.slices,
        state: document.querySelector(".rzn-suitup").dataset.rznState,
      };
    });
    assert.deepEqual(errors, [], "no page errors");
    assert.ok(
      data.reads.some((r) => r.phase === "driver-lights-pixels"),
      "driver read observed",
    );
    assert.ok(
      data.reads.some((r) => r.phase === "nanite-metal-rows"),
      "metal read observed",
    );
    if (process.env.EXPECT_CPU === "1" && variant === "candidate") {
      assert.equal(data.copies.length, 5, "driver, two metals, molten art and mask");
      assert.ok(
        data.copies.every((r) => r.cpu === true),
        "all readback sources were CPU-backed from creation",
      );
    }
    if (process.env.EXPECT_CPU === "0" && variant === "candidate")
      assert.deepEqual(
        data.copies.map((r) => r.cpu),
        [false, false, false, false, true],
        "rounding-incompatible backend retains legacy stores (molten mask was already CPU)",
      );
    if (pixels)
      data.signatures = Object.fromEntries(
        ["reads", "puts"].map((key) => [
          key,
          {
            count: data[key].length,
            sha256: createHash("sha256")
              .update(
                JSON.stringify(
                  data[key].map(({ phase, args, digest }) => ({ phase, args, digest })),
                ),
              )
              .digest("hex"),
          },
        ]),
      );
    if (pixels) {
      const golden = JSON.parse(
        await readFile(
          new URL("./fixtures/rexonance-cpu-preparation.json", import.meta.url),
          "utf8",
        ),
      );
      assert.deepEqual(
        data.signatures,
        golden[process.env.BROWSER === "webkit" ? "webkit" : "chrome"],
        "frozen main preparation bytes",
      );
    }
    results.push({ run, variant, ...data });
    console.log(
      JSON.stringify({
        run,
        variant,
        elapsed: data.elapsed,
        reads: data.reads.length,
        worst: data.reads.toSorted((a, b) => b.ms - a.ms).slice(0, 5),
      }),
    );
    await context.close();
  }
  const output = process.env.OUT_FILE || "output/playwright/cpu-preparation/report.json";
  const summaries = Object.fromEntries(
    ["main", "candidate"].flatMap((variant) => {
      const samples = results
        .filter((row) => row.variant === variant)
        .map((row) => row.elapsed)
        .sort((a, b) => a - b);
      if (!samples.length) return [];
      const mid = Math.floor(samples.length / 2);
      return [
        [
          variant,
          {
            samples,
            median: samples.length % 2 ? samples[mid] : (samples[mid - 1] + samples[mid]) / 2,
          },
        ],
      ];
    }),
  );
  await mkdir(dirname(output), { recursive: true });
  await writeFile(
    output,
    JSON.stringify(
      {
        mode: pixels ? "pixels" : "timing",
        browser: process.env.BROWSER || "chrome",
        browserVersion: browser.version(),
        headed: process.env.HEADED === "1",
        cpuThrottle: process.env.BROWSER === "webkit" ? null : 4,
        summaries,
        results,
      },
      null,
      2,
    ),
  );
  if (process.env.COMPARE_FILE) {
    assert.ok(pixels, "only pixel runs can compare bytes");
    const baseline = JSON.parse(await readFile(process.env.COMPARE_FILE, "utf8"));
    for (const key of ["reads", "puts"]) {
      const stable = (rows) => rows.map(({ phase, args, digest }) => ({ phase, args, digest }));
      assert.deepEqual(
        stable(results[0][key]),
        stable(baseline.results[0][key]),
        `${key}: every preparation byte matches main`,
      );
    }
    console.log("PASS: all preparation read and output byte digests equal main");
  }
} finally {
  await browser.close();
}
