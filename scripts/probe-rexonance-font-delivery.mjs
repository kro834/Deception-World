// Report real font delivery separately from deliberate outage and late success.
// BASE_URL=... FONT_MODE=healthy|delayed|outage WIDTHS=320,1440 node ...
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright";

const base = process.env.BASE_URL || "http://127.0.0.1:8269";
const mode = process.env.FONT_MODE || "healthy";
if (!["healthy", "delayed", "outage"].includes(mode)) throw new Error("Unknown FONT_MODE");
const out = process.env.FONT_OUT || "output/playwright/site-fixes-20261023/fonts";
await mkdir(out, { recursive: true });
const selectors = [
  ".rxs-brand b",
  ".rxs-brand span",
  ".rxs-hero h1",
  ".rxs-hero-lede",
  ".rxs-hero-lede-text > span",
  ".rxs-hero-copy > p:first-child",
  ".rxs-stage-tabs button span",
  ".rxs-system-grid p",
];
const geometry = () =>
  [
    ...document.querySelectorAll(
      ".rxs-brand,.rxs-brand > span,.rxs-brand > b,.rxs-local-nav nav,.rxs-hero h1,.rxs-hero-lede,.rxs-hero-copy > p:first-child",
    ),
  ].map((el) => {
    const r = el.getBoundingClientRect();
    const style = getComputedStyle(el);
    return {
      selector: el.className || el.tagName,
      text: el.textContent,
      x: r.x,
      y: r.y,
      width: r.width,
      height: r.height,
      fontSize: style.fontSize,
      letterSpacing: style.letterSpacing,
    };
  });
const browser = await chromium.launch({ channel: process.env.PW_BROWSER_CHANNEL || "chrome" });
try {
  for (const width of (process.env.WIDTHS || "320,390,1024,1440").split(",").map(Number)) {
    const context = await browser.newContext({
      viewport: { width, height: 900 },
      reducedMotion: "reduce",
    });
    const page = await context.newPage();
    const requests = [];
    const failed = [];
    const errors = [];
    let release;
    const hold = new Promise((resolve) => {
      release = resolve;
    });
    const responses = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("requestfailed", (r) => {
      if (/fonts\.(googleapis|gstatic)\.com|\.woff2?(?:\?|$)/.test(r.url()))
        failed.push({ url: r.url(), error: r.failure()?.errorText });
    });
    page.on("response", (r) => {
      if (r.request().resourceType() !== "font" && !r.url().includes("fonts.googleapis.com"))
        return;
      responses.push(
        (async () => {
          const body = await r.body().catch(() => null);
          requests.push({
            url: r.url(),
            status: r.status(),
            type: r.request().resourceType(),
            bytes: body?.length ?? null,
            body: r.url().includes("fonts.googleapis.com") ? body?.toString() : undefined,
          });
        })(),
      );
    });
    if (mode === "outage")
      await context.route(/https:\/\/fonts\.(googleapis|gstatic)\.com\//, (r) =>
        r.abort("internetdisconnected"),
      );
    if (mode === "delayed")
      await context.route("https://fonts.gstatic.com/**", async (r) => {
        await hold;
        await r.continue();
      });
    let before = null;
    let settled = false;
    let failure = null;
    try {
      await page.goto(`${base}/rexonance-saga`, { waitUntil: "domcontentloaded", timeout: 45000 });
      await page.waitForFunction(
        () =>
          document.querySelector(".rxs-stage-tabs")?.dataset.liquidInitialized === "true" &&
          !document.documentElement.hasAttribute("data-loading") &&
          !document.querySelector(".load-gate"),
        null,
        { timeout: 30000 },
      );
      await page.waitForTimeout(1800);
      before = await page.evaluate(geometry);
      release();
      settled = await page.evaluate(() =>
        Promise.race([
          document.fonts.ready.then(() => true),
          new Promise((resolve) => setTimeout(() => resolve(false), 25000)),
        ]),
      );
      await page.waitForTimeout(500);
      const cdp = await context.newCDPSession(page);
      await cdp.send("DOM.enable");
      await cdp.send("CSS.enable");
      const { root } = await cdp.send("DOM.getDocument");
      const platform = [];
      for (const selector of selectors) {
        const { nodeId } = await cdp.send("DOM.querySelector", { nodeId: root.nodeId, selector });
        if (!nodeId) continue;
        const fonts = await cdp.send("CSS.getPlatformFontsForNode", { nodeId });
        const style = await page
          .locator(selector)
          .first()
          .evaluate((el) => ({
            text: el.textContent,
            weight: getComputedStyle(el).fontWeight,
            family: getComputedStyle(el).fontFamily,
          }));
        platform.push({ selector, ...style, ...fonts });
      }
      const after = await page.evaluate(geometry);
      const japaneseBrandReservations = await page
        .locator(".rxs-brand b .name-word")
        .evaluateAll((elements) =>
          elements.map((el) => ({
            text: el.textContent,
            minInlineSize: getComputedStyle(el).minInlineSize,
          })),
        );
      if (japaneseBrandReservations.some((word) => !["auto", "0px"].includes(word.minInlineSize)))
        throw new Error("Latin font reservation leaked into Japanese brand words");
      // Real scrolling activates lower sections before measuring their text.
      for (const selector of ["#performance", "#p14", "#forms", "#system"]) {
        const section = page.locator(selector);
        if (await section.count())
          await section.evaluate((el) => el.scrollIntoView({ behavior: "instant" }));
        await page.waitForTimeout(180);
      }
      await page.evaluate(() => document.fonts.ready);
      const phrases = await page.evaluate(() => {
        const found = [];
        for (const el of document.querySelectorAll(
          ".rxs-stage-panel > div > p,.rxs-system-grid p",
        )) {
          const text = el.textContent;
          const points = [];
          const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
          while (walker.nextNode()) {
            const node = walker.currentNode;
            for (let i = 0; i < node.length; i++) {
              const range = document.createRange();
              range.setStart(node, i);
              range.setEnd(node, i + 1);
              const rect = range.getBoundingClientRect();
              points.push({ char: node.textContent[i], y: Math.round(rect.y), width: rect.width });
            }
          }
          for (const phrase of ["犬として", "『終焉』へ"]) {
            const at = text.indexOf(phrase);
            if (at !== -1)
              found.push({
                phrase,
                text,
                rows: points.slice(at, at + phrase.length).map((p) => p.y),
              });
          }
        }
        return found;
      });
      const fontFaces = await page.evaluate(() =>
        [...document.fonts]
          .map((f) => ({ family: f.family, weight: f.weight, status: f.status }))
          .filter((f) => f.status !== "unloaded"),
      );
      // Isolate a symbol under the real element's computed font settings.
      // This measures the glyph face, not just the font-family string. These
      // probes are diagnostic copies; they do not change the owner's text.
      const symbolSamples = await page.evaluate(() => {
        const samples = new Map();
        const walker = document.createTreeWalker(
          document.querySelector(".rxs-rexonance-page"),
          NodeFilter.SHOW_TEXT,
        );
        while (walker.nextNode()) {
          const node = walker.currentNode;
          const parent = node.parentElement;
          if (!parent?.checkVisibility()) continue;
          const style = getComputedStyle(parent);
          for (const char of node.textContent.match(/[←→↗↘⇄—！∞〜]/gu) || []) {
            const key = `${char}/${style.fontFamily}/${style.fontWeight}`;
            if (!samples.has(key))
              samples.set(key, {
                char,
                family: style.fontFamily,
                weight: style.fontWeight,
                fontSize: style.fontSize,
              });
          }
        }
        return [...samples.values()].slice(0, 24);
      });
      await page.evaluate((samples) => {
        const host = document.createElement("div");
        host.id = "font-symbol-probes";
        host.setAttribute("aria-hidden", "true");
        host.style.cssText =
          "position:fixed;inset:0 auto auto 0;pointer-events:none;opacity:.001;z-index:9999";
        for (const [index, sample] of samples.entries()) {
          const probe = document.createElement("span");
          probe.id = `font-symbol-probe-${index}`;
          probe.textContent = sample.char;
          Object.assign(probe.style, {
            fontFamily: sample.family,
            fontWeight: sample.weight,
            fontSize: sample.fontSize,
          });
          host.append(probe);
        }
        document.body.append(host);
      }, symbolSamples);
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(50);
      const symbols = [];
      for (const [index, sample] of symbolSamples.entries()) {
        const { nodeId } = await cdp.send("DOM.querySelector", {
          nodeId: root.nodeId,
          selector: `#font-symbol-probe-${index}`,
        });
        symbols.push({ ...sample, ...(await cdp.send("CSS.getPlatformFontsForNode", { nodeId })) });
      }
      await page.evaluate(() => document.getElementById("font-symbol-probes")?.remove());
      await Promise.allSettled(responses);
      const externallyDeliveredFontFiles = requests.filter(
        (r) =>
          r.type === "font" &&
          r.url.includes("fonts.gstatic.com") &&
          r.status === 200 &&
          r.bytes > 0,
      ).length;
      const healthyDelivery = settled && failed.length === 0 && externallyDeliveredFontFiles > 0;
      if (mode !== "outage" && !healthyDelivery) process.exitCode = 1;
      const report = {
        width,
        mode,
        settled,
        before,
        after,
        japaneseBrandReservations,
        platform,
        phrases,
        fontFaces,
        symbols,
        externallyDeliveredFontFiles,
        healthyDelivery,
        requests,
        failed,
        errors,
        fontBytes: requests
          .filter((r) => r.type === "font")
          .reduce((sum, r) => sum + (r.bytes || 0), 0),
        fontFiles: requests.filter((r) => r.type === "font").length,
      };
      await writeFile(`${out}/${mode}-${width}.json`, JSON.stringify(report, null, 2));
      console.log(
        JSON.stringify({
          width,
          mode,
          settled,
          fontFiles: report.fontFiles,
          fontBytes: report.fontBytes,
          failures: failed.length,
          errors,
          phrases,
        }),
      );
    } catch (error) {
      failure = error.message;
      release();
      await writeFile(
        `${out}/${mode}-${width}-failure.json`,
        JSON.stringify({ width, mode, failure, requests, failed, errors }, null, 2),
      );
      console.log(
        JSON.stringify({
          width,
          mode,
          failure,
          successfulFontFiles: requests.filter((r) => r.type === "font").length,
          failures: failed.length,
        }),
      );
      process.exitCode = 1;
    } finally {
      release();
      await context.close();
    }
  }
} finally {
  await browser.close();
}
