import assert from "node:assert/strict";
import { chromium } from "playwright";

const base = process.env.BASE_URL || "http://127.0.0.1:8082";
const browser = await chromium.launch({ channel: "chrome" });
const routes = [
  {
    path: "/managers/shuza",
    slug: "manager-shuza",
    expected: ["シュザ", "176.8cm", "61.3kg", "我慢なんかせんでもええんよ"],
    formExpected: ["209.6cm", "フォボスクラック"],
  },
  {
    path: "/managers/reemu",
    slug: "manager-reemu",
    expected: ["リームー", "169.0cm", "63.2kg", "貴方が死ぬのは、僕のせいじゃない"],
    formExpected: ["192.3cm", "キジンソードビクトリー"],
  },
  {
    path: "/managers/rex-loi",
    slug: "manager-rex-loi",
    expected: [
      "レックス・ロワ",
      "185.0cm",
      "80.1kg",
      "両性具有（性自認は女性。本人に強い自覚はない）",
      "我々と皆様の、秩序の為に",
    ],
    formExpected: ["203.6cm", "デッドエンド"],
  },
  {
    path: "/riders/vandal",
    slug: "rider-vandal",
    expected: [
      "レックス・ロワ",
      "185.0cm",
      "両性具有（性自認は女性。本人に強い自覚はない）",
      "我々と皆様の、秩序の為に",
    ],
    formExpected: ["203.6cm", "デッドエンド"],
  },
  {
    path: "/riders/lore",
    slug: "rider-lore",
    expected: ["ローア", "小林千晃"],
    formExpected: ["ローア"],
  },
];

async function touchScrollDialog(page, panel) {
  const bounds = await panel.boundingBox();
  assert.ok(bounds, "form panel should have bounds");
  const x = bounds.x + Math.min(bounds.width / 2, 150);
  const y = Math.min(
    bounds.y + Math.min(bounds.height * 0.65, 360),
    page.viewportSize().height - 80,
  );
  const cdp = await page.context().newCDPSession(page);
  const point = (nextY) => ({ x, y: nextY, id: 1 });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [point(y)] });
  for (let step = 1; step <= 12; step += 1) {
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [point(y - step * 14)],
    });
    await page.waitForTimeout(18);
  }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await cdp.detach();
}

try {
  for (const viewport of [
    { width: 390, height: 844 },
    { width: 1024, height: 768 },
  ]) {
    const context = await browser.newContext({ viewport, hasTouch: true });
    const page = await context.newPage();
    for (const route of routes) {
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.goto(base + route.path, { waitUntil: "networkidle" });
      await page.waitForFunction(
        () => !document.documentElement.hasAttribute("data-route-scroll-settling"),
      );

      const bodyText = await page.locator("main").innerText();
      for (const value of route.expected)
        assert.ok(bodyText.includes(value), `${route.path}: missing ${value}`);
      assert.ok(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
        `${route.path}: horizontal overflow`,
      );

      const gender = page.getByText("両性具有（性自認は女性。本人に強い自覚はない）", {
        exact: true,
      });
      if ((await gender.count()) > 0) {
        const fit = await gender.first().evaluate((node) => {
          const nodeRect = node.getBoundingClientRect();
          const cell = node.closest(".manager-facts > div, .rider-facts > div, dl > div");
          const cellRect = cell?.getBoundingClientRect();
          return {
            textFits:
              node.scrollWidth <= node.clientWidth + 1 &&
              node.scrollHeight <= node.clientHeight + 1,
            insideCell:
              !cellRect ||
              (nodeRect.left >= cellRect.left - 1 &&
                nodeRect.right <= cellRect.right + 1 &&
                nodeRect.top >= cellRect.top - 1 &&
                nodeRect.bottom <= cellRect.bottom + 1),
          };
        });
        assert.ok(
          fit.textFits && fit.insideCell,
          `${route.path}: gender clipped ${JSON.stringify(fit)}`,
        );
      }

      const readerLink = page.locator('.dossier-reader-links a[href="#dossier-index"]');
      await readerLink.click();
      await page.waitForFunction(() => location.hash === "#dossier-index" && scrollY > 0);
      const dossierPosition = await page.locator("#dossier-index").evaluate((node) => ({
        top: node.getBoundingClientRect().top,
        bottom: node.getBoundingClientRect().bottom,
      }));
      assert.ok(
        dossierPosition.top < viewport.height && dossierPosition.bottom > 0,
        `${route.path}: dossier anchor did not enter viewport`,
      );

      const thumb = page.locator(".form-pickup-plus .ios-slide-open-thumb").first();
      await thumb.scrollIntoViewIfNeeded();
      await thumb.tap();
      const dialog = page.locator(".form-pickup-dialog[open]");
      await dialog.waitFor();
      const dialogText = await dialog.innerText();
      for (const value of route.formExpected)
        assert.ok(dialogText.includes(value), `${route.path}: form detail missing ${value}`);
      const panel = dialog.locator(".form-pickup-panel");
      const panelMetrics = await panel.evaluate((node) => ({
        clientHeight: node.clientHeight,
        scrollHeight: node.scrollHeight,
        widthFits: node.scrollWidth <= node.clientWidth + 1,
      }));
      assert.ok(panelMetrics.widthFits, `${route.path}: dialog horizontal overflow`);
      assert.ok(
        panelMetrics.scrollHeight > panelMetrics.clientHeight,
        `${route.path}: expected scrollable form detail`,
      );
      await touchScrollDialog(page, panel);
      await page.waitForFunction(
        () =>
          document.querySelector(".form-pickup-dialog[open] .form-pickup-panel")?.scrollTop > 20,
      );
      await dialog.getByRole("button", { name: "閉じる", exact: true }).tap();
      await dialog.waitFor({ state: "hidden" });

      await page.screenshot({
        path: `/tmp/updated-profile-${route.slug}-${viewport.width}.png`,
        fullPage: true,
      });
      assert.deepEqual(errors, [], `${route.path}: page errors`);
      console.log(
        `PASS ${viewport.width}x${viewport.height} ${route.path}: content, dossier anchor, no overflow, form open/scroll/close`,
      );
    }
    await context.close();
  }
} finally {
  await browser.close();
}
