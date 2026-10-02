import assert from "node:assert/strict";
import { chromium } from "playwright";

// Dream Chapter: the skipped sections' contain-intrinsic-size estimates against their drawn
// heights, so a jump from the act index, the 目次 or a /dream-chapter#id link lands on the
// heading on a first visit (content-visibility: auto skips every act and annex below the
// fold). Measures the content box of the 12 act/annex ids at 10 viewports with every section
// forced visible, and compares it with the estimate the sheets give that layout.
//
//   BASE_URL=http://localhost:8080 PW_BROWSER_CHANNEL=chrome node scripts/verify-dream-estimates.mjs
//   WRITE=1 … prints the measured values as the CSS blocks of styles-dream-extra.css
//   REPORT=1 … prints without asserting
//
// 2026-10-02 Track D (the archive corners): chronicle, atlas, relations, arsenal are new;
// #quotes now carries the VOICES leaf; the supplements grow cast-roster, factions, glossary.

const base = process.env.BASE_URL || "http://127.0.0.1:8082";
const browser = await chromium.launch({ channel: process.env.PW_BROWSER_CHANNEL || "chrome" });

const IDS = [
  "posters",
  "characters",
  "dolminence",
  "cast-roster",
  "factions",
  "case-notes",
  "chronicle",
  "atlas",
  "relations",
  "arsenal",
  "glossary",
  "quotes",
];
// The ids whose estimates the extra sheet carries: the four corners, #quotes (the VOICES
// leaf) and the three annexes the supplements grew. The other act/annex ids keep the
// elevation and annex sheets' numbers and are only checked here.
const EXTRA_IDS = [
  "cast-roster",
  "factions",
  "chronicle",
  "atlas",
  "relations",
  "arsenal",
  "glossary",
  "quotes",
];

// name, viewport, the extra sheet's layout block the measurement feeds. Finer than the annex
// sheet's blocks (≤1100 and ≤400 are new): the atlas and the ledger change column counts and
// wrap enough between 1024 and 1194, and between 390 and 412, to leave the 120px tolerance.
const VIEWPORTS = [
  { name: "1920", viewport: { width: 1920, height: 1080 }, block: "@media (min-width: 1600px)" },
  { name: "1440", viewport: { width: 1440, height: 900 }, block: "" },
  { name: "1194", viewport: { width: 1194, height: 834 }, block: "@media (max-width: 1299px)" },
  { name: "1024", viewport: { width: 1024, height: 768 }, block: "@media (max-width: 1100px)" },
  { name: "768", viewport: { width: 768, height: 1024 }, block: "@media (max-width: 980px)" },
  {
    name: "412",
    viewport: { width: 412, height: 915 },
    mobile: true,
    block: "@media (max-width: 760px)",
  },
  {
    name: "390",
    viewport: { width: 390, height: 844 },
    mobile: true,
    block: "@media (max-width: 400px)",
  },
  {
    name: "320",
    viewport: { width: 320, height: 568 },
    mobile: true,
    block: "@media (max-width: 359px)",
  },
  {
    name: "844x390",
    viewport: { width: 844, height: 390 },
    mobile: true,
    block: "@media (max-height: 520px) and (orientation: landscape)",
  },
  {
    name: "667x375",
    viewport: { width: 667, height: 375 },
    mobile: true,
    block: "@media (max-height: 520px) and (orientation: landscape) and (max-width: 760px)",
  },
];
const TOLERANCE = 120;

const results = {};
const failures = [];
try {
  for (const { name, viewport, mobile } of VIEWPORTS) {
    const context = await browser.newContext({
      viewport,
      isMobile: !!mobile,
      hasTouch: !!mobile,
      deviceScaleFactor: mobile ? 2 : 1,
      reducedMotion: "reduce",
    });
    const page = await context.newPage();
    await page.goto(`${base}/dream-chapter`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(
      () =>
        document.documentElement.dataset.dreamChapter === "true" &&
        !document.documentElement.hasAttribute("data-loading"),
      undefined,
      { timeout: 60000 },
    );
    await page.waitForTimeout(2500);
    await page.evaluate(() => document.fonts.ready);
    const measured = await page.evaluate((ids) => {
      const nodes = ids.map((id) => document.getElementById(id));
      const estimates = nodes.map((node) => {
        const value = getComputedStyle(node).containIntrinsicSize;
        return Number(value.match(/(\d+(?:\.\d+)?)px/)?.[1] ?? NaN);
      });
      const all = [...document.querySelectorAll(".dream-section, .dream-annex")];
      const previous = all.map((section) => section.style.contentVisibility);
      all.forEach((section) => (section.style.contentVisibility = "visible"));
      document.body.getBoundingClientRect();
      const drawn = nodes.map((node) => {
        const style = getComputedStyle(node);
        const rect = node.getBoundingClientRect();
        return Math.round(
          rect.height -
            parseFloat(style.paddingTop) -
            parseFloat(style.paddingBottom) -
            parseFloat(style.borderTopWidth) -
            parseFloat(style.borderBottomWidth),
        );
      });
      all.forEach((section, index) => {
        if (previous[index]) section.style.contentVisibility = previous[index];
        else section.style.removeProperty("content-visibility");
      });
      return {
        docHeight: document.documentElement.scrollHeight,
        overflowX: document.documentElement.scrollWidth - innerWidth,
        sections: Object.fromEntries(
          ids.map((id, index) => [id, { drawn: drawn[index], estimate: estimates[index] }]),
        ),
      };
    }, IDS);
    results[name] = measured;
    const off = Object.entries(measured.sections)
      .filter(([, { drawn, estimate }]) => Math.abs(drawn - estimate) > TOLERANCE)
      .map(([id, { drawn, estimate }]) => `${id} drawn ${drawn} estimate ${estimate}`);
    console.log(
      JSON.stringify({
        check: "dream-estimates",
        viewport: name,
        docHeight: measured.docHeight,
        overflowX: measured.overflowX,
        sections: Object.fromEntries(
          Object.entries(measured.sections).map(([id, { drawn, estimate }]) => [
            id,
            `${drawn}/${estimate}`,
          ]),
        ),
        off,
      }),
    );
    if (measured.overflowX > 0)
      failures.push(`${name}: horizontal overflow ${measured.overflowX}px`);
    for (const line of off) failures.push(`${name}: ${line}`);
    await context.close();
  }
} finally {
  await browser.close();
}

if (process.env.WRITE === "1") {
  // The estimate is the drawn content box rounded up to 5px, one block per layout, in
  // cascade order: the base rules first, the max-width blocks, the min-width block last.
  const round5 = (value) => Math.ceil(value / 5) * 5;
  const blocks = VIEWPORTS.filter(({ block }) => block != null).sort(
    (a, b) =>
      (a.block === "" ? 0 : a.block.startsWith("@media (min-width") ? 2 : 1) -
      (b.block === "" ? 0 : b.block.startsWith("@media (min-width") ? 2 : 1),
  );
  const lines = [];
  for (const { name, block } of blocks) {
    const rules = EXTRA_IDS.map(
      (id) =>
        `  .dream-page.dream-page #${id} {\n    contain-intrinsic-size: auto ${round5(results[name].sections[id].drawn)}px;\n  }`,
    );
    lines.push(
      block
        ? `${block} {\n${rules.join("\n\n")}\n}`
        : rules.map((rule) => rule.replace(/^ {2}/gm, "")).join("\n\n"),
    );
    lines.push("");
  }
  console.log(`\n/* measured at ${new Date().toISOString()} */\n${lines.join("\n")}`);
}

if (process.env.REPORT !== "1") {
  assert.deepEqual(failures, [], failures.join("\n"));
  console.log("dream estimates: ok");
}
