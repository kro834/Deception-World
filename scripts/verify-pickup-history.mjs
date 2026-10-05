import assert from "node:assert/strict";
import { chromium, webkit } from "playwright";
import { checkedUrl } from "./browser-guard.mjs";

const base = checkedUrl(process.env.BASE_URL || "http://127.0.0.1:8082");
const engine = process.env.PW_ENGINE === "webkit" ? webkit : chromium;
const browser = await engine.launch(engine === chromium ? { channel: "chrome" } : undefined);
const cases = [
  {
    name: "rider form",
    path: "/riders/realm",
    from: "dossier-profile",
    to: "form-records",
    link: '.dossier-reader a[href="#form-records"]',
    trigger: "button.form-pickup-plus",
  },
  {
    name: "nightmare",
    path: "/riders/saga",
    from: "dossier-profile",
    to: "dossier-index",
    link: ".dossier-read-link",
    trigger: ".rider-nightmare-pickup-button",
  },
  ...["far-from-saga", "realm-royal"].map((id) => ({
    name: id,
    path: "/final-stage",
    from: "story",
    to: id,
    trigger: `#${id} button.form-pickup-plus`,
  })),
  ...[
    ["column", "button.world-column-slide-open"],
    ["episode", "button.episode-pickup-plus"],
    ["rising", "button.rw-gate-button"],
  ].map(([name, trigger]) => ({ name, path: "/world", from: "story", to: "records", trigger })),
];

async function prepare(page, record, direction) {
  await page.goto(`${base}${record.path}#${record.from}`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => {
    const trigger = document.querySelector(".side-panel-trigger");
    return trigger && Object.keys(trigger).some((key) => key.startsWith("__reactProps"));
  });
  if (record.link) {
    await page.locator(record.link).first().click();
  } else {
    await page.locator(".side-panel-trigger").click();
    await page.locator(`.side-panel-links a[href="${record.path}#${record.to}"]`).click();
  }
  await page.waitForURL(`**${record.path}#${record.to}`);
  if (direction === "forward") {
    await page.goBack({ waitUntil: "domcontentloaded" });
    await page.waitForURL(`**${record.path}#${record.from}`);
  }
  await page.waitForFunction(
    () => !document.documentElement.hasAttribute("data-route-scroll-settling"),
  );
}

async function assertReleased(page, trigger, label) {
  await page.waitForFunction(() => !document.querySelector("dialog[open]"));
  // Catch delayed focus/scroll settling and cinematic end callbacks too.
  await page.waitForTimeout(700);
  const state = await page.evaluate(
    (selector) => ({
      dialog: !!document.querySelector("dialog[open]"),
      flag: document.documentElement.hasAttribute("data-dialog-open"),
      overflow: getComputedStyle(document.documentElement).overflowY,
      body: getComputedStyle(document.body).position,
      focused: document.activeElement?.matches(selector) ?? false,
    }),
    trigger,
  );
  assert.equal(state.dialog, false, label);
  assert.equal(state.flag, false, label);
  assert.notEqual(state.overflow, "hidden", `${label}: releases page scroll`);
  assert.notEqual(state.body, "fixed", `${label}: releases frozen body`);
  assert.equal(state.focused, false, `${label}: no focus return to the departed record`);
}

try {
  for (const width of [390, 1280]) {
    const page = await browser.newPage({
      viewport: { width, height: 844 },
      hasTouch: width < 700,
      reducedMotion: "reduce",
    });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    for (const record of cases) {
      for (const direction of ["back", "forward"]) {
        const label = `${width}px ${record.name} ${direction}`;
        await prepare(page, record, direction);
        const trigger = page.locator(record.trigger).first();
        await trigger.focus();
        await page.keyboard.press("Enter");
        await page.locator("dialog[open]").waitFor({ state: "visible" });
        if (direction === "back") await page.goBack({ waitUntil: "domcontentloaded" });
        else await page.goForward({ waitUntil: "domcontentloaded" });
        await page.waitForURL(`**${record.path}#${direction === "back" ? record.from : record.to}`);
        await assertReleased(page, record.trigger, label);

        // History cleanup must not alter later keyboard Escape/focus return.
        await trigger.focus();
        await page.keyboard.press("Enter");
        await page.locator("dialog[open]").waitFor({ state: "visible" });
        await page.keyboard.press("Escape");
        await page.waitForFunction(() => !document.querySelector("dialog[open]"));
        await page.waitForFunction(
          (selector) => document.activeElement === document.querySelector(selector),
          record.trigger,
        );
        assert.notEqual(
          await page.evaluate(() => getComputedStyle(document.documentElement).overflowY),
          "hidden",
        );
        console.log(`PASS ${label}: dismissed, unlocked, reopened, keyboard return preserved`);
      }
    }
    assert.deepEqual(errors, []);
    await page.close();
  }
} finally {
  await browser.close();
}
