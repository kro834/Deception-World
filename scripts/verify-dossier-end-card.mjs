// The end of a character file (DossierNav): the previous file, the index
// (一覧へ戻る) with the roster rail, then the next person's card, one row
// each, in the source's order, so what Tab reaches next is what sits next on
// the screen. Checks, at phone, tablet and desktop sizes, on a middle file, a
// first, a last and a list of one: no block overlaps another, every link is
// the element under its own centre (nothing covers it), the links' DOM order
// reads down the screen, and the next file's numeral stays above NEXT FILE.
// Then, at 390px on a middle file, the return link and a roster tile are
// pressed and land where they say. Last, while a form card's words hold
// beside the art on a short split stage, TRANSFORMATION RECORD stays clear of
// the sticky chapter ruler.
//
//   BASE_URL=http://127.0.0.1:8713 PW_BROWSER_CHANNEL=chrome node scripts/verify-dossier-end-card.mjs
import assert from "node:assert/strict";
import { chromium, webkit } from "playwright";

const engine = process.env.PW_ENGINE === "webkit" ? webkit : chromium;
const browser = await engine.launch(
  engine === chromium ? { channel: process.env.PW_BROWSER_CHANNEL || "chrome" } : {},
);
const base = process.env.BASE_URL || process.env.BASE || "http://localhost:8082";

async function settle(page) {
  await page.waitForFunction(
    () =>
      document.documentElement.dataset.scrollMotionReady === "true" &&
      !document.documentElement.hasAttribute("data-route-scroll-settling"),
  );
  await page.waitForTimeout(600);
}

/** Scrolls to the document offset `target(document)` returns, until it holds
 * (a load-time restore can still reset the scroll once). */
async function scrollToStable(page, target) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const top = await page.evaluate(`(() => {
      const top = Math.round((${target})(document));
      scrollTo({ top, behavior: "instant" });
      return Math.min(top, document.documentElement.scrollHeight - innerHeight);
    })()`);
    await page.waitForTimeout(250);
    if (Math.abs((await page.evaluate(() => scrollY)) - top) < 3) return;
  }
  throw new Error("the scroll did not hold");
}

async function checkEnd(page, label) {
  await scrollToStable(
    page,
    "(d) => d.querySelector('.manager-pagination').getBoundingClientRect().top + scrollY - 140",
  );
  const result = await page.evaluate(async () => {
    const problems = [];
    const nav = document.querySelector(".manager-pagination");
    const blocks = [
      nav.querySelector(":scope > a:first-child"),
      nav.querySelector(":scope > .manager-pagination-index"),
      nav.querySelector(":scope > a:last-child:not(:first-child)"),
    ].filter(Boolean);
    const rects = blocks.map((block) => block.getBoundingClientRect());
    for (let i = 1; i < rects.length; i += 1) {
      if (rects[i].top < rects[i - 1].bottom - 1) {
        problems.push(
          `block ${i} starts at ${rects[i].top} above block ${i - 1}'s end ${rects[i - 1].bottom}`,
        );
      }
    }
    const links = [...nav.querySelectorAll("a[href]")];
    const tops = links.map((link) => link.getBoundingClientRect().top + scrollY);
    for (let i = 1; i < links.length; i += 1) {
      if (tops[i] < tops[i - 1] - 4) {
        problems.push(
          `${links[i].getAttribute("aria-label")} (${Math.round(tops[i])}) sits above ${links[i - 1].getAttribute("aria-label")} (${Math.round(tops[i - 1])})`,
        );
      }
    }
    for (const link of links) {
      link.scrollIntoView({ block: "center", behavior: "instant" });
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const box = link.getBoundingClientRect();
      const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
      if (!hit || !(hit === link || link.contains(hit))) {
        problems.push(
          `${link.getAttribute("aria-label")} is covered by ${hit?.closest("a")?.getAttribute("aria-label") ?? hit?.className ?? "nothing"}`,
        );
      }
    }
    const next = blocks.find((block) => block.matches("a:last-child:not(:first-child)"));
    const numeral = next?.querySelector(".dossier-nav-numeral");
    if (numeral && getComputedStyle(numeral).display !== "none") {
      const numeralBox = numeral.getBoundingClientRect();
      const name = next.querySelector(":scope > b").getBoundingClientRect();
      const before = getComputedStyle(next, "::before");
      const labelTop =
        name.top -
        parseFloat(getComputedStyle(next).rowGap) -
        parseFloat(before.lineHeight) -
        parseFloat(before.marginBottom);
      if (numeralBox.bottom > labelTop + 1) {
        problems.push(`numeral ends at ${numeralBox.bottom}, under NEXT FILE at ${labelTop}`);
      }
    }
    if (document.documentElement.scrollWidth > innerWidth + 1) problems.push("horizontal scroll");
    return problems;
  });
  assert.deepEqual(result, [], label);
}

const files = ["/riders/realm", "/riders/saga", "/riders/cipher", "/characters/dante"];
try {
  for (const viewport of [
    { width: 390, height: 844 },
    { width: 834, height: 1194 },
    { width: 1280, height: 609 },
    { width: 1440, height: 900 },
  ]) {
    const page = await browser.newPage({ viewport, hasTouch: viewport.width < 768 });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    for (const path of files) {
      await page.goto(`${base}${path}`);
      await settle(page);
      await checkEnd(page, `${viewport.width}x${viewport.height} ${path}`);
    }
    if (viewport.width === 390) {
      // A middle file (a previous and a next file): the index and the rail
      // are reachable and land where they say.
      await page.goto(`${base}/riders/realm`);
      await settle(page);
      const back = page.locator(".manager-pagination .dossier-index-return");
      await back.evaluate((node) => node.scrollIntoView({ block: "center", behavior: "instant" }));
      await back.click();
      await page.waitForURL("**/world#riders-return");
      await page.goto(`${base}/riders/realm`);
      await settle(page);
      const tile = page.locator('.dossier-roster a[aria-label="ヴァンダールの資料へ"]');
      await tile.evaluate((node) => node.scrollIntoView({ block: "center", behavior: "instant" }));
      await tile.click();
      await page.waitForURL("**/riders/vandal");
    }
    assert.deepEqual(errors, []);
    console.log(`PASS ${viewport.width}x${viewport.height}: end of file order, reach and numeral`);
    await page.close();
  }

  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 1366, height: 768 },
    { width: 1024, height: 768 },
  ]) {
    const page = await browser.newPage({ viewport });
    for (const path of ["/riders/saga", "/riders/cipher"]) {
      await page.goto(`${base}${path}`);
      await settle(page);
      const cards = await page.locator(".form-pickup-card").count();
      for (let i = 0; i < cards; i += 1) {
        await scrollToStable(
          page,
          `(d) => d.querySelectorAll('.form-pickup-card')[${i}].getBoundingClientRect().top + scrollY + 40`,
        );
        const { kicker, ruler, bottom } = await page.evaluate((index) => {
          const copy = document.querySelectorAll(".form-pickup-copy")[index];
          const shown = [...copy.children].filter(
            (child) => getComputedStyle(child).display !== "none",
          );
          return {
            kicker: copy.firstElementChild.getBoundingClientRect().top,
            ruler: document.querySelector(".dossier-reader").getBoundingClientRect().bottom,
            bottom: shown.at(-1).getBoundingClientRect().bottom,
          };
        }, i);
        const label = `${viewport.width}x${viewport.height} ${path} card ${i}`;
        assert.ok(kicker >= ruler + 8, `${label}: kicker ${kicker} under the ruler ${ruler}`);
        assert.ok(bottom <= viewport.height, `${label}: words end at ${bottom}, past the stage`);
      }
    }
    console.log(
      `PASS ${viewport.width}x${viewport.height}: held words clear the ruler and fit the stage`,
    );
    await page.close();
  }
} finally {
  await browser.close();
}
