// The form archive keeps the reader's form and compared pair in the page URL:
// a shared link, a reload and Back reopen them, choices replace the entry
// (history length stays), the other archive starts over, and unknown ids are
// dropped. Also checks the spec difference renders without overflow.
//   BASE_URL=http://localhost:8080 PW_BROWSER_CHANNEL=chrome node scripts/verify-archive-shareable-state.mjs
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { checkedUrl } from "./browser-guard.mjs";

const base = checkedUrl(process.env.BASE_URL || "http://127.0.0.1:8082");
const browser = await chromium.launch({ channel: process.env.PW_BROWSER_CHANNEL || "chrome" });
const results = [];

async function ready(page, kind) {
  await page.waitForFunction(
    (expected) =>
      document.querySelector("#archive-switcher")?.getAttribute("aria-busy") === "false" &&
      document.querySelector("iframe")?.dataset.archiveKind === expected,
    kind,
  );
  const handle = await page.locator(`iframe[data-archive-kind="${kind}"]`).elementHandle();
  const frame = await handle.contentFrame();
  await frame.waitForFunction(() =>
    document.querySelector('[data-controller-ready="true"], .v6s-ready'),
  );
  return frame;
}

const search = (page) => Object.fromEntries(new URL(page.url()).searchParams);

async function archiveState(frame) {
  return frame.evaluate(() => ({
    form: document.querySelector('.form-chip[aria-checked="true"]')?.dataset.formId,
    a: document.querySelector('[id$="saga-compare-select-a"]')?.value,
    b: document.querySelector('[id$="saga-compare-select-b"]')?.value,
  }));
}

async function waitForSearch(page, expected) {
  await page.waitForFunction((want) => {
    const params = new URL(location.href).searchParams;
    return Object.entries(want).every(([key, value]) =>
      value === null ? !params.has(key) : params.get(key) === value,
    );
  }, expected);
}

try {
  for (const width of [390, 1280]) {
    const page = await browser.newPage({ viewport: { width, height: 844 } });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));

    // A shared link opens its form and pair.
    await page.goto(`${base}/form-archive?form=vertex&compare=rock.vertex`);
    let frame = await ready(page, "saga");
    assert.deepEqual(await archiveState(frame), { form: "vertex", a: "rock", b: "vertex" });
    const historyLength = await page.evaluate(() => history.length);

    // Choices replace this entry's URL.
    await frame.locator('.form-chip[data-form-id="integral"]').evaluate((chip) => chip.click());
    await waitForSearch(page, { form: "integral", compare: "rock.vertex" });
    await frame.locator('[id$="saga-compare-select-b"]').selectOption("extreme");
    await waitForSearch(page, { form: "integral", compare: "rock.extreme" });
    assert.equal(await page.evaluate(() => history.length), historyLength);

    // The spec difference shows the pair without widening the frame.
    const diff = await frame.evaluate(() => {
      const panel = document.querySelector(".compare-diff");
      panel?.scrollIntoView({ block: "start" });
      return {
        rows: panel?.querySelectorAll(".compare-diff-row").length ?? 0,
        names: [...(panel?.querySelectorAll(".compare-diff-name > span") ?? [])].map(
          (node) => node.textContent,
        ),
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      };
    });
    assert.ok(diff.rows >= 6, `difference rows: ${diff.rows}`);
    assert.deepEqual(diff.names, ["ロック", "エクスプリーム"]);
    assert.ok(diff.overflow <= 0, `frame overflow ${diff.overflow}px`);

    // Reload and Back reopen the same record.
    await page.reload();
    frame = await ready(page, "saga");
    assert.deepEqual(await archiveState(frame), { form: "integral", a: "rock", b: "extreme" });
    await page.locator(".side-panel-trigger").click();
    await page.locator('.side-panel-links a[href="/world#top"]').click();
    await page.waitForURL("**/world#top");
    await page.goBack();
    frame = await ready(page, "saga");
    assert.deepEqual(await archiveState(frame), { form: "integral", a: "rock", b: "extreme" });
    assert.deepEqual(search(page), { form: "integral", compare: "rock.extreme" });

    // The other archive starts over, and keeps its own choice.
    await page.locator('button[data-archive="realm"]').click();
    frame = await ready(page, "realm");
    await waitForSearch(page, { archive: "realm", form: null, compare: null });
    await frame.locator('.form-chip[data-form-id="royal"]').evaluate((chip) => chip.click());
    await waitForSearch(page, { archive: "realm", form: "royal" });
    await page.reload();
    frame = await ready(page, "realm");
    assert.equal((await archiveState(frame)).form, "royal");

    // Returning to the default form drops it from the URL.
    await frame.locator('.form-chip[data-form-id="stella"]').evaluate((chip) => chip.click());
    await waitForSearch(page, { archive: "realm", form: null });

    // Unknown ids open the defaults and leave the URL.
    await page.goto(`${base}/form-archive?form=bogus&compare=multi.nothing`);
    frame = await ready(page, "saga");
    assert.deepEqual(await archiveState(frame), { form: "multi", a: "multi", b: "last-multi" });
    await waitForSearch(page, { form: null, compare: null });

    assert.deepEqual(errors, [], "no page errors");
    results.push({ width, link: "passed", replace: "passed", reload: "passed", back: "passed" });
    await page.close();
  }
  console.log(JSON.stringify(results, null, 2));
} finally {
  await browser.close();
}
