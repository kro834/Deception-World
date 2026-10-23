// Built-page regression: read the final cascade, not individual CSS files.
// BASE_URL=http://127.0.0.1:4262 BROWSER=chrome|webkit node scripts/verify-dream-legibility.mjs
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium, webkit } from "playwright";
import { checkedUrl } from "./browser-guard.mjs";

const base = checkedUrl(process.env.BASE_URL || "http://127.0.0.1:4262");
const engine = process.env.BROWSER || "chrome";
const forcedColors = process.env.FORCED_COLORS === "1";
assert.ok(["chrome", "webkit"].includes(engine));
const output = resolve(process.env.AUDIT_OUT || `output/playwright/dream-legibility/${engine}`);
await mkdir(output, { recursive: true });
const browser = await (engine === "webkit" ? webkit : chromium).launch(
  engine === "webkit" ? {} : { channel: "chrome" },
);
const report = {
  base,
  engine,
  forcedColors,
  browserVersion: browser.version(),
  samples: [],
  errors: [],
};
let currentPage;

async function contrast(page, foreground, surface, minimum = 4.5, minimumSize = 12) {
  const result = await page
    .locator(foreground)
    .first()
    .evaluate(
      (node, { surface, minimumSize }) => {
        const target = document.querySelector(surface);
        if (!target) throw new Error(`Missing surface: ${surface}`);
        const style = getComputedStyle(node);
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = 1;
        const context = canvas.getContext("2d", { willReadFrequently: true });
        const rgba = (color) => {
          context.clearRect(0, 0, 1, 1);
          context.fillStyle = color;
          context.fillRect(0, 0, 1, 1);
          const bytes = [...context.getImageData(0, 0, 1, 1).data];
          return [...bytes.slice(0, 3), bytes[3] / 255];
        };
        const split = (text) => {
          let depth = 0;
          let start = 0;
          const parts = [];
          for (let i = 0; i < text.length; i += 1) {
            if (text[i] === "(") depth += 1;
            if (text[i] === ")") depth -= 1;
            if (text[i] === "," && depth === 0) {
              parts.push(text.slice(start, i).trim());
              start = i + 1;
            }
          }
          return [...parts, text.slice(start).trim()];
        };
        const over = (front, back) => [
          ...front.slice(0, 3).map((v, i) => v * front[3] + back[i] * (1 - front[3])),
          1,
        ];
        // All combinations of gradient stops give a conservative contrast
        // floor for these neutral reading surfaces. Tiny border/ornament
        // backgrounds are not underneath the text and are excluded by size.
        const chain = [];
        for (let element = target; element; element = element.parentElement) chain.unshift(element);
        let backgrounds = [[0, 0, 0, 1]];
        for (const element of chain) {
          const s = getComputedStyle(element);
          const baseColor = rgba(s.backgroundColor);
          backgrounds = backgrounds.map((bg) => over(baseColor, bg));
          const layers = split(s.backgroundImage);
          const sizes = split(s.backgroundSize);
          for (let i = layers.length - 1; i >= 0; i -= 1) {
            const size = sizes[i % sizes.length];
            if (size !== "auto" && size !== "100% 100%") continue;
            if (!layers[i].includes("gradient(")) continue;
            const colors = layers[i].match(/rgba?\([^)]*\)|color\(srgb[^)]*\)/g) || [];
            if (!colors.length) continue;
            backgrounds = colors.flatMap((color) => backgrounds.map((bg) => over(rgba(color), bg)));
            backgrounds = [...new Map(backgrounds.map((bg) => [bg.join(","), bg])).values()];
          }
        }
        const luminance = (color) =>
          color.slice(0, 3).reduce((sum, value, i) => {
            const v = value / 255;
            const linear = v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
            return sum + linear * [0.2126, 0.7152, 0.0722][i];
          }, 0);
        // Chromium can expose the pre-forcing color-mix via text-fill even
        // while painting a link with the system LinkText color. Respect the
        // UA's used palette unless the element explicitly opts out of it.
        const systemInk =
          matchMedia("(forced-colors: active)").matches && style.forcedColorAdjust !== "none";
        const solidInk = rgba(systemInk ? style.color : style.webkitTextFillColor || style.color);
        // The glossary keeps main's metallic heading. Its transparent text
        // fill reveals a clipped gradient, not invisible lettering. Check
        // every stop against the same conservative surface samples.
        const clippedInk = style.backgroundClip.split(",").some((clip) => clip.trim() === "text");
        const gradientInk =
          solidInk[3] === 0 && clippedInk
            ? (style.backgroundImage.match(/rgba?\([^)]*\)|color\(srgb[^)]*\)/g) || []).map(rgba)
            : [];
        const inks = gradientInk.length ? gradientInk : [solidInk];
        let opacity = 1;
        for (let p = node; p; p = p.parentElement) opacity *= Number(getComputedStyle(p).opacity);
        const ratios = inks.flatMap((ink) => {
          ink[3] *= opacity;
          return backgrounds.map((bg) => {
            const a = luminance(over(ink, bg));
            const b = luminance(bg);
            return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
          });
        });
        return {
          text: node.textContent.trim().slice(0, 90),
          color: style.color,
          fill: style.webkitTextFillColor,
          systemInk,
          font: style.fontFamily,
          size: parseFloat(style.fontSize),
          minimumSize,
          opacity,
          contrast: Math.min(...ratios),
          backgroundSamples: backgrounds.length,
          inkSamples: inks.length,
        };
      },
      { surface, minimumSize },
    );
  assert.ok(result.opacity >= 0.99, `${foreground}: readable opacity ${result.opacity}`);
  assert.ok(result.size >= minimumSize, `${foreground}: ${result.size}px < ${minimumSize}px`);
  assert.ok(result.contrast >= minimum, `${foreground}: contrast ${result.contrast} < ${minimum}`);
  return { foreground, surface, minimum, ...result };
}

async function view(page, selector) {
  await page
    .locator(selector)
    .first()
    .evaluate((element) => {
      element.scrollIntoView({ block: "center", behavior: "instant" });
    });
  await page.waitForFunction((selector) => {
    const element = document.querySelector(selector);
    let opacity = 1;
    for (let p = element; p; p = p.parentElement) opacity *= Number(getComputedStyle(p).opacity);
    return opacity >= 0.99;
  }, selector);
  await page.evaluate(
    () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))),
  );
}

try {
  const widths = (process.env.PW_WIDTHS || "320,390,1024,1440").split(",").map(Number);
  for (const width of widths) {
    const context = await browser.newContext({
      viewport: { width, height: width === 320 ? 640 : width === 1024 ? 768 : 900 },
      hasTouch: width <= 1024,
      reducedMotion: "reduce",
      forcedColors: forcedColors ? "active" : "none",
    });
    if (process.env.OFFLINE_FONTS === "1") {
      await context.route(/^https:\/\/fonts\.(?:googleapis|gstatic)\.com\//, (route) =>
        route.abort(),
      );
    }
    const page = await context.newPage();
    currentPage = page;
    page.setDefaultTimeout(20000);
    page.on("pageerror", (error) => report.errors.push(error.message));
    await page.goto(new URL("/dream-chapter", base).href, { waitUntil: "load" });
    await page.waitForFunction(() => {
      const button = document.querySelector(".dream-stage-lantern");
      return button && Object.keys(button).some((key) => key.startsWith("__reactProps"));
    });
    await page.evaluate(() => document.fonts.ready);
    const checks = [];
    report.current = { width, checks };
    await view(page, ".dream-prologue-card");
    // Owner (2026-10-23): 不要なセカンダリラベルを削除（レイアウトで説明） — the sign is gone.
    for (const selector of ["h2", "> p"]) {
      checks.push(await contrast(page, `.dream-prologue-card ${selector}`, ".dream-prologue-card"));
    }
    await page.screenshot({ path: `${output}/${width}-prologue.png` });

    await view(page, ".dream-karakuri-chapter-heading");
    checks.push(await contrast(page, ".dream-karakuri-chapter-heading p", ".dream-karakuri-paper"));
    checks.push(await contrast(page, ".dream-karakuri-excerpt", ".dream-karakuri-paper", 4.5, 16));
    await page.screenshot({ path: `${output}/${width}-cabinet.png` });
    const chips = page.locator(".dream-programme-dossier-chip");
    for (let i = 0; i < (await chips.count()); i += 1) {
      const selector = `.dream-programme-dossier-strip > li:nth-child(${i + 1}) > .dream-programme-dossier-chip`;
      await view(page, selector);
      checks.push(await contrast(page, `${selector} small`, selector));
    }

    for (let i = 0; i < 6; i += 1) {
      const selector = `#dream-case-${i}`;
      await page.locator(`.dream-karakuri-footer a[href="${selector}"]`).click();
      await page.waitForFunction((selector) => document.querySelector(selector)?.open, selector);
      await view(page, `${selector} > summary`);
      for (const child of [
        ".dream-story-case-heading > span",
        ".dream-story-case-heading > small",
        ".dream-story-case-number",
        ".dream-story-case-toggle",
      ]) {
        checks.push(await contrast(page, `${selector} ${child}`, `${selector} > summary`));
      }
      checks.push(
        await contrast(
          page,
          `${selector} .dream-story-case-number b`,
          `${selector} .dream-story-case-number b`,
        ),
      );
      await page.screenshot({ path: `${output}/${width}-case-${i}.png` });
    }
    // Exercise the scroll timeline too. Expanding a long chapter must not
    // dim its identifying number until a distant scroll position is reached.
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await view(page, "#dream-case-5 > summary");
    const numeralMotion = await page
      .locator("#dream-case-5 .dream-story-case-number b")
      .evaluate((node) => {
        const style = getComputedStyle(node);
        return {
          opacity: Number(style.opacity),
          name: style.animationName,
          timeline: style.animationTimeline,
          supported:
            CSS.supports("animation-timeline", "--ts-rise") &&
            CSS.supports("animation-range", "entry 0% entry 100%"),
          gated: document.documentElement.matches(
            '[data-world-effects="economy"], [data-side-menu-open], [data-loading], [data-dialog-open]',
          ),
        };
      });
    assert.ok(numeralMotion.opacity >= 0.99, `chapter number opacity: ${numeralMotion.opacity}`);
    assert.equal(
      numeralMotion.gated,
      false,
      "normal-motion check must not silently use a static gate",
    );
    if (numeralMotion.supported && !forcedColors) {
      assert.equal(numeralMotion.name, "kn-case-press");
      assert.equal(numeralMotion.timeline, "--ts-rise");
    } else if (!numeralMotion.supported) {
      assert.equal(
        numeralMotion.name,
        "none",
        "unsupported timelines retain a readable static seal",
      );
    }
    await page.emulateMedia({ reducedMotion: "reduce" });

    await view(page, "#glossary .dream-annex-heading");
    // Main's large gilt title keeps its metallic stops: enforce the 3:1
    // large-text floor AND >=24px. Normal-sized labels still require 4.5:1.
    checks.push(await contrast(page, "#glossary .dream-annex-heading h2", "#glossary", 3, 24));
    await page.screenshot({ path: `${output}/${width}-glossary.png` });
    await view(page, "#glossary .dream-glossary-index");
    checks.push(
      await contrast(
        page,
        "#glossary .dream-archive-fold-mark",
        "#glossary .dream-archive-fold > summary",
      ),
    );
    checks.push(
      await contrast(
        page,
        "#glossary .dream-archive-fold-count",
        "#glossary .dream-archive-fold > summary",
      ),
    );
    await page.locator("#glossary .dream-archive-fold > summary").click();
    checks.push(
      await contrast(
        page,
        "#glossary .dream-archive-fold-count",
        "#glossary .dream-archive-fold > summary",
      ),
    );
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    assert.ok(overflow <= 1, `${width}: page overflow ${overflow}`);
    const fonts = await page.evaluate(() => [
      ...new Set(
        [...document.fonts].filter((face) => face.status === "loaded").map((face) => face.family),
      ),
    ]);
    report.samples.push({
      width,
      offlineFonts: process.env.OFFLINE_FONTS === "1",
      fonts,
      overflow,
      numeralMotion,
      checks,
    });
    await context.close();
    currentPage = null;
    delete report.current;
    console.log(`${engine} ${width}: ${checks.length} contrast / type checks passed`);
  }
  assert.deepEqual(report.errors, []);
} catch (error) {
  report.failure = error.stack || String(error);
  if (currentPage) await currentPage.screenshot({ path: `${output}/failure.png` }).catch(() => {});
  process.exitCode = 1;
} finally {
  await writeFile(`${output}/report.json`, JSON.stringify(report, null, 2) + "\n");
  await browser.close();
}
if (report.failure) console.error(report.failure);
