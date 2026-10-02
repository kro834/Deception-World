import assert from "node:assert/strict";
import { chromium, webkit } from "playwright";

const base = process.env.BASE_URL || "http://127.0.0.1:8082";
const engine = process.env.PW_ENGINE === "webkit" ? webkit : chromium;
const browser = await engine.launch(engine === chromium ? { channel: "chrome" } : {});
const ids = ["posters", "characters", "dolminence", "cases"];
try {
  for (const viewport of [
    { width: 390, height: 844 },
    { width: 844, height: 390 },
    { width: 1440, height: 900 },
  ]) {
    const page = await browser.newPage({ viewport });
    await page.addInitScript(() => {
      window.__dreamNavigationEvents = [];
      const record = (detail) => {
        window.__dreamNavigationEvents.push(detail);
        if (window.__dreamNavigationEvents.length > 20) window.__dreamNavigationEvents.shift();
      };
      for (const capture of [true, false]) {
        document.addEventListener(
          "click",
          (event) =>
            record({
              type: "click",
              capture,
              target: event.target.tagName,
              href: event.target.closest?.("a")?.getAttribute("href"),
              prevented: event.defaultPrevented,
              button: event.button,
              width: innerWidth,
              height: innerHeight,
            }),
          capture,
        );
      }
      const intoView = Element.prototype.scrollIntoView;
      Element.prototype.scrollIntoView = function (...args) {
        record({ type: "scrollIntoView", target: this.id, args });
        return intoView.apply(this, args);
      };
      const audit = { styleReads: 0, programmeRenders: 0 };
      window.__dreamScrollAudit = audit;
      const getStyle = window.getComputedStyle;
      window.getComputedStyle = function (element, ...args) {
        if (["posters", "characters", "dolminence", "cases"].includes(element.id)) {
          audit.styleReads++;
        }
        return getStyle.call(this, element, ...args);
      };
      window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
        supportsFiber: true,
        renderers: new Map(),
        inject(renderer) {
          this.renderers.set(1, renderer);
          return 1;
        },
        checkDCE() {},
        onCommitFiberRoot(_renderer, root) {
          const visit = (fiber) => {
            if (!fiber) return;
            // Identify the programme by its host child even in minified builds.
            if (
              typeof fiber.type === "function" &&
              fiber.child?.type === "main" &&
              fiber.child.memoizedProps?.className === "dream-page" &&
              fiber.flags & 1
            )
              audit.programmeRenders++;
            visit(fiber.child);
            visit(fiber.sibling);
          };
          visit(root.current);
        },
        onCommitFiberUnmount() {},
      };
    });
    await page.goto(`${base}/dream-chapter`, { waitUntil: "networkidle" });
    await page.evaluate(() => document.fonts.ready);
    // Native jumps must respect the sticky header at every orientation.
    for (const id of ids) {
      await page.locator(`.dream-chapter-nav a[href="#${id}"]`).click();
      await page.waitForFunction(
        (id) =>
          document
            .querySelector(`.dream-chapter-nav a[href="#${id}"]`)
            ?.getAttribute("aria-current") === "location",
        id,
      );
      await page.waitForTimeout(700);
    }
    await page
      .locator("#characters")
      .evaluate((node) => node.scrollIntoView({ behavior: "instant", block: "start" }));
    await page.waitForTimeout(1200);
    const work = await page.evaluate(async () => {
      const before = { ...window.__dreamScrollAudit };
      const start = scrollY;
      for (let index = 0; index < 90; index++) {
        scrollTo({ top: start + index * 3, behavior: "instant" });
        await new Promise(requestAnimationFrame);
      }
      await new Promise(requestAnimationFrame);
      return Object.fromEntries(
        Object.entries(before).map(([key, value]) => [key, window.__dreamScrollAudit[key] - value]),
      );
    });
    console.log(JSON.stringify({ viewport, ...work }));
    if (process.env.ENFORCE === "1") {
      assert.equal(work.programmeRenders, 0, "scrolling must not rerender the whole programme");
      assert.ok(work.styleReads <= 8, `scroll margin cache was missed: ${work.styleReads}`);
    }
    // Resizing must invalidate the cached landing margin, including short landscape.
    await page.setViewportSize({ width: viewport.height, height: viewport.width });
    await page.locator('.dream-chapter-nav a[href="#cases"]').click();
    try {
      await page.waitForFunction(
        () =>
          document
            .querySelector('.dream-chapter-nav a[href="#cases"]')
            ?.getAttribute("aria-current") === "location",
        undefined,
        { timeout: 6000 },
      );
    } catch (error) {
      console.log(
        JSON.stringify(
          await page.evaluate(() => ({
            hash: location.hash,
            scrollY,
            height: innerHeight,
            width: innerWidth,
            padding: getComputedStyle(document.documentElement).scrollPaddingTop,
            nav: document.querySelector(".dream-chapter-nav")?.outerHTML,
            events: window.__dreamNavigationEvents,
            sections: [...document.querySelectorAll(".dream-section, .dream-annex")].map(
              (node) => ({
                id: node.id,
                top: node.getBoundingClientRect().top,
                margin: getComputedStyle(node).scrollMarginTop,
                inline: node.style.contentVisibility,
              }),
            ),
          })),
        ),
      );
      throw error;
    }
    await page.waitForTimeout(1200);
    const landed = await page.evaluate(() => {
      const target = document.getElementById("cases");
      return {
        current: document
          .querySelector('.dream-chapter-nav [aria-current="location"]')
          ?.getAttribute("href"),
        top: target.getBoundingClientRect().top,
        margin: parseFloat(getComputedStyle(target).scrollMarginTop),
        retained: [...document.querySelectorAll(".dream-section, .dream-annex")].filter(
          (section) => section.style.contentVisibility,
        ).length,
      };
    });
    assert.equal(landed.current, "#cases", "rotation jump stays selected after the scroll settles");
    assert.equal(landed.retained, 0, "temporary materialization is released after navigation");
    assert.ok(Math.abs(landed.top - landed.margin) < 24, JSON.stringify(landed));
    await page.close();
  }
} finally {
  await browser.close();
}
