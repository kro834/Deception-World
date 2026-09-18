import assert from "node:assert/strict";
import { chromium, webkit } from "playwright";

const engine = process.env.PW_ENGINE === "webkit" ? webkit : chromium;
const browser = await engine.launch(engine === chromium ? { channel: "chrome" } : {});
const base = process.env.BASE_URL || "http://localhost:8082";

async function ready(page) {
  await page.waitForFunction(
    () =>
      document.documentElement.dataset.scrollMotionReady === "true" &&
      !document.documentElement.hasAttribute("data-route-scroll-settling"),
  );
}

async function waitForScrollRest(page) {
  await page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const start = performance.now();
        let previous = scrollY;
        let steadyFrames = 0;
        const check = () => {
          steadyFrames = Math.abs(scrollY - previous) < 0.5 ? steadyFrames + 1 : 0;
          previous = scrollY;
          if (steadyFrames >= 10) resolve();
          else if (performance.now() - start > 5000) reject(new Error("scroll did not settle"));
          else requestAnimationFrame(check);
        };
        requestAnimationFrame(check);
      }),
  );
}

async function verifyReader(page, route) {
  await page.goto(base + route);
  await ready(page);
  if (route === "/managers/lejas" && page.viewportSize().width < 760) {
    const name = await page.locator(".dossier-identity h1").boundingBox();
    const portrait = await page.locator(".manager-portrait-column").boundingBox();
    assert.ok(name.y + name.height < portrait.y, "mobile identity precedes portrait");
  }
  await page.locator(".dossier-read-link").click();
  const destinations = await page
    .locator(".dossier-reader a")
    .evaluateAll((links) => links.map((link) => link.hash));
  const ordered = [...destinations.slice(1), ...destinations.slice().reverse()];
  for (const hash of ordered) {
    const link = page.locator(`.dossier-reader a[href="${hash}"]`);
    await link.click();
    await page.waitForFunction(
      (hash) =>
        document.querySelector(".dossier-reader a[aria-current]")?.getAttribute("href") === hash,
      hash,
    );
    await waitForScrollRest(page);
    assert.equal(
      await page.locator(".dossier-reader a[aria-current]").getAttribute("href"),
      hash,
      "selection remains correct after anchor scroll settles",
    );
  }
  if (destinations.includes("#form-records")) {
    await page.locator('.dossier-reader a[href="#form-records"]').click();
    await page.waitForFunction(() =>
      document
        .querySelector('.dossier-reader a[href="#form-records"]')
        ?.hasAttribute("aria-current"),
    );
    await waitForScrollRest(page);
    const before = await page.evaluate(() => window.scrollY);
    await page.mouse.move(30, page.viewportSize().height - 100);
    await page.mouse.wheel(0, -800);
    await page.waitForFunction(() =>
      document
        .querySelector('.dossier-reader a[href="#dossier-index"]')
        ?.hasAttribute("aria-current"),
    );
    await page.waitForFunction((y) => scrollY < y - 100, before);
  }
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
}

try {
  for (const viewport of [
    { width: 390, height: 844 },
    { width: 1024, height: 768 },
  ]) {
    const page = await browser.newPage({ viewport, hasTouch: true });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    for (const route of ["/managers/lejas", "/riders/saga", "/managers/zeus"]) {
      await verifyReader(page, route);
      console.log(
        `PASS ${viewport.width}px ${route}: forward/reverse anchors, active state, free scroll`,
      );
    }
    await page.setViewportSize(
      viewport.width === 390 ? { width: 1024, height: 768 } : { width: 390, height: 844 },
    );
    await page.locator('.dossier-reader a[href="#dossier-index"]').click();
    await page.waitForTimeout(900);
    assert.equal(
      await page.locator(".dossier-reader a[aria-current]").getAttribute("href"),
      "#dossier-index",
      "active state survives rotation",
    );
    assert.deepEqual(errors, []);
    await page.close();
  }

  for (const width of [320, 390, 1024]) {
    const page = await browser.newPage({
      viewport: { width, height: width > 760 ? 768 : 844 },
      hasTouch: true,
      userAgent:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1",
    });
    await page.goto(base + "/rexonance-saga");
    const select = page.locator(".rxs-p14-native-select select");
    await select.waitFor();
    await ready(page);
    await select.evaluate((node) => node.scrollIntoView({ block: "center", behavior: "instant" }));
    const type = await select.evaluate((node) => ({
      size: getComputedStyle(node).fontSize,
      weight: getComputedStyle(node).fontWeight,
    }));
    assert.deepEqual(type, { size: "20px", weight: "700" });
    assert.ok(
      await select.evaluate((node) => {
        const style = getComputedStyle(node);
        const context = document.createElement("canvas").getContext("2d");
        context.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
        const available =
          node.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight) - 32;
        return [...node.options].every(
          (option) => context.measureText(option.text).width <= available,
        );
      }),
      "both native option labels fit without truncation",
    );
    for (const baseline of ["p1", "p2"]) {
      await select.selectOption(baseline);
      await page.locator(`.rxs-p14-metrics[data-baseline="${baseline}"]`).waitFor();
      const labels = await page
        .locator(".rxs-p14-values i, .rxs-p14-metrics article > p span")
        .evaluateAll((nodes) =>
          nodes.map((node) => {
            const box = node.getBoundingClientRect();
            const card = node.closest("article").getBoundingClientRect();
            return {
              font: parseFloat(getComputedStyle(node).fontSize),
              inside: box.left >= card.left && box.right <= card.right + 1,
              clipped: node.scrollWidth > node.clientWidth + 1,
            };
          }),
        );
      assert.ok(
        labels.length >= 18 &&
          labels.every((label) => label.font >= 11 && label.inside && !label.clipped),
      );
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    }
    console.log(
      `PASS ${width}px P14: native selector typography, both baselines, full metadata labels`,
    );
    await page.close();
  }
} finally {
  await browser.close();
}
