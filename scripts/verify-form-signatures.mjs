import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium, webkit } from "playwright";
import { checkedUrl } from "./browser-guard.mjs";

const base = checkedUrl(process.env.BASE_URL || "http://127.0.0.1:8591");
const engine = process.env.PW_ENGINE || "chromium";
const output = process.env.AUDIT_OUT || "output/playwright/form-signatures";
await mkdir(output, { recursive: true });
const browser = await (engine === "webkit" ? webkit : chromium).launch(
  engine === "webkit" ? {} : { channel: "chrome" },
);
const records = [];
const themes = [
  {
    id: "explom",
    route: "over-zeztz",
    face: "Explom Display",
    title: "エクスプロム",
    stat: "205.9cm（est.）",
  },
  { id: "kemonohen", route: "leddic", face: "Kemonohen Brush", title: "犭フォーム", stat: "227cm" },
];

async function fits(locator, label) {
  const box = await locator.evaluate((el) => {
    const r = el.getBoundingClientRect();
    return {
      scroll: el.scrollWidth,
      client: el.clientWidth,
      left: r.left,
      right: r.right,
      viewport: innerWidth,
    };
  });
  assert.ok(box.scroll <= box.client + 1, `${label} internal overflow: ${JSON.stringify(box)}`);
  assert.ok(box.client > 0, `${label} must be laid out`);
  assert.ok(box.left >= -1 && box.right <= box.viewport + 1, `${label} viewport overflow`);
}

try {
  for (const scenario of [
    { width: 320, height: 740 },
    { width: 390, height: 844 },
    { width: 1024, height: 768 },
    { width: 1440, height: 900 },
    { width: 320, height: 740, motion: "reduce" },
    { width: 390, height: 844, economy: true },
    { width: 320, height: 740, blockedFonts: true },
    { width: 390, height: 844, noObserver: true },
  ]) {
    if (process.env.PW_WIDTH && scenario.width !== Number(process.env.PW_WIDTH)) continue;
    const label = `${engine}-${scenario.width}-${scenario.motion || (scenario.economy ? "economy" : scenario.blockedFonts ? "fallback" : scenario.noObserver ? "no-observer" : "normal")}`;
    const context = await browser.newContext({
      viewport: { width: scenario.width, height: scenario.height },
      hasTouch: scenario.width <= 1024,
      reducedMotion: scenario.motion || "no-preference",
    });
    if (scenario.noObserver)
      await context.addInitScript(() => {
        delete window.IntersectionObserver;
      });
    if (scenario.blockedFonts)
      await context.route(/\/fonts\/(explom|kemonohen).*\.woff2$/, (route) => route.abort());
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    for (const theme of themes) {
      await page.goto(`${base}/riders/${theme.route}`, { waitUntil: "networkidle" });
      await page.waitForSelector('html[data-family="dossier"]');
      if (scenario.economy)
        await page.evaluate(() => {
          document.documentElement.dataset.worldEffects = "economy";
        });
      const card = page.locator(`section.form-pickup[data-form-theme="${theme.id}"]`);
      assert.equal(await card.count(), 1);
      // Instant scroll, no scroll-behavior or animated arrival ambiguity.
      await card.evaluate((el) => el.scrollIntoView({ behavior: "instant", block: "center" }));
      await page.waitForFunction(
        (id) =>
          document.querySelector(`section[data-form-theme="${id}"]`)?.dataset.signatureArrived ===
          "true",
        theme.id,
      );
      const title = card.locator(".form-pickup-copy > em");
      assert.ok((await title.textContent()).includes(theme.title));
      assert.ok(
        (await title.evaluate((el) => getComputedStyle(el).fontFamily)).includes(theme.face),
      );
      await fits(title, `${label}/${theme.id} card title`);
      if (!scenario.blockedFonts) {
        assert.equal(
          await page.evaluate(
            ({ face, title }) => document.fonts.check(`28px "${face}"`, title),
            theme,
          ),
          true,
        );
      }
      const image = card.locator(".form-pickup-visual > img");
      await image.evaluate((el) => el.decode());
      // Below-fold stacks materialize on approach, changing their measured
      // height. Settle that real layout before taking viewport (not offscreen
      // element) screenshots; an element capture can skip auto-CV descendants.
      await page.waitForTimeout(950);
      await title.evaluate((el) => el.scrollIntoView({ behavior: "instant", block: "center" }));
      await page.waitForTimeout(200);
      await page.screenshot({ path: `${output}/${label}-${theme.id}-card.png` });
      const opener = card.locator(".form-pickup-plus");
      if (scenario.width <= 1024) await opener.locator(".ios-slide-open-label").tap();
      else {
        await opener.focus();
        await opener.press("Enter");
      }
      const dialog = card.locator("dialog[open]");
      await dialog.waitFor({ state: "visible", timeout: 5000 });
      const heading = dialog.locator(".form-pickup-heading > em");
      await fits(heading, `${label}/${theme.id} dialog title`);
      assert.ok((await dialog.locator(".form-pickup-stats").textContent()).includes(theme.stat));
      assert.equal(await dialog.locator(".form-signature[aria-hidden=true]").count(), 1);
      if (scenario.motion === "reduce" || scenario.economy) {
        assert.equal(await heading.evaluate((el) => getComputedStyle(el).animationName), "none");
        const active = await dialog
          .locator(".form-signature-flare")
          .evaluate((el) => getComputedStyle(el).animationName);
        assert.equal(active, "none");
      }
      await page.waitForTimeout(1000);
      const running = await dialog
        .locator(".form-signature")
        .evaluate(
          (el) =>
            el.getAnimations({ subtree: true }).filter((a) => a.playState === "running").length,
        );
      assert.equal(running, 0, "signature motion settles completely");
      await dialog.screenshot({ path: `${output}/${label}-${theme.id}-dialog.png` });
      const panel = dialog.locator(".form-pickup-panel");
      await fits(panel, `${label}/${theme.id} panel`);
      await panel.evaluate((el) => {
        el.scrollTop = el.scrollHeight;
      });
      await dialog.locator(".form-pickup-end-close").click();
      await page.waitForFunction(() => !document.querySelector("dialog[open]"));
      // Pointer close intentionally clears native restored focus in the next
      // frame. Let that settlement finish before starting a new keyboard flow.
      await page.evaluate(
        () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
      );
      // Reopen from keyboard, verify reset and Escape focus return.
      await opener.focus();
      await opener.press("Enter");
      await dialog.waitFor({ state: "visible" });
      await page.waitForTimeout(180);
      assert.ok(await panel.evaluate((el) => el.scrollTop < 2));
      await page.keyboard.press("Escape");
      await page.waitForFunction(() => !document.querySelector("dialog[open]"));
      await page.waitForFunction(
        (id) =>
          document.activeElement ===
          document.querySelector(`section.form-pickup[data-form-theme="${id}"] .form-pickup-plus`),
        theme.id,
        { timeout: 2000 },
      );
      records.push({ scenario: label, theme: theme.id, passed: true });
      console.log(`PASS ${label} ${theme.id}`);
    }
    assert.deepEqual(errors, [], `${label} runtime errors`);
    await context.close();
  }
  // An unrelated rider must not pay for the signature CSS or fonts.
  const page = await browser.newPage();
  const requests = [];
  page.on("request", (request) => {
    if (["stylesheet", "font"].includes(request.resourceType())) requests.push(request.url());
  });
  await page.goto(`${base}/riders/cipher`, { waitUntil: "networkidle" });
  assert.equal(await page.locator(".form-signature").count(), 0);
  assert.ok(!requests.some((url) => /styles-form-signature|\/fonts\/(explom|kemonohen)/.test(url)));
  await page.close();
  await writeFile(
    `${output}/${engine}-report.json`,
    JSON.stringify({ base, engine, records }, null, 2),
  );
} finally {
  await browser.close();
}
