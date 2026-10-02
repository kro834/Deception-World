import assert from "node:assert/strict";
import { chromium } from "playwright";

const base = process.env.BASE_URL || "http://127.0.0.1:8082";
const browser = await chromium.launch({ channel: "chrome" });
try {
  for (const route of ["rexonance-saga", "extreme-saga"]) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, reducedMotion: "reduce" });
    await page.addInitScript(() => {
      window.comparisonAudit = { pageRenders: 0, comparisonRenders: 0 };
      window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
        supportsFiber: true,
        renderers: new Map(),
        inject: (renderer) => {
          window.__REACT_DEVTOOLS_GLOBAL_HOOK__.renderers.set(1, renderer);
          return 1;
        },
        checkDCE: () => {},
        onCommitFiberRoot: (_renderer, root) => {
          const visit = (fiber) => {
            if (!fiber) return;
            if (typeof fiber.type === "function" && (fiber.flags & 1)) {
              if (fiber.child?.type === "main" && /rxs-(?:rexonance-)?page/.test(fiber.child.memoizedProps?.className)) {
                window.comparisonAudit.pageRenders++;
              }
              if (fiber.child?.type === "section" && fiber.child.memoizedProps?.id === "performance") {
                window.comparisonAudit.comparisonRenders++;
              }
            }
            visit(fiber.child);
            visit(fiber.sibling);
          };
          visit(root.current);
        },
        onCommitFiberUnmount: () => {},
      };
    });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`${base}/${route}`, { waitUntil: "networkidle" });
    const select = page.locator("#performance select");
    await select.scrollIntoViewIfNeeded();
    const values = await select.locator("option").evaluateAll((options) => options.map((option) => option.value));
    await page.waitForTimeout(500);
    await page.evaluate(() => { window.comparisonAudit.pageRenders = 0; window.comparisonAudit.comparisonRenders = 0; });
    for (let index = 0; index < 12; index++) {
      await select.selectOption(values[(index + 1) % values.length]);
    }
    const result = await page.evaluate(() => window.comparisonAudit);
    console.log(JSON.stringify({ route, changes: 12, ...result }));
    if (process.env.PERF_BASELINE !== "1") {
      assert.equal(result.pageRenders, 0, "comparison must not re-render the whole page");
      assert.ok(result.comparisonRenders >= 11, "the comparator itself must still update");
    }
    assert.deepEqual(errors, []);
    await page.close();
  }
} finally {
  await browser.close();
}
