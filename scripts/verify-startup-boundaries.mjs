import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright";

const base = process.env.BASE_URL ?? "http://127.0.0.1:8189";
const output = process.env.STARTUP_OUTPUT ?? "output/playwright/startup-boundaries";
const sections = new Set((process.env.STARTUP_SECTIONS ?? "public,frames").split(","));
const browser = await chromium.launch({ channel: "chrome" });
const results = [];
await mkdir(output, { recursive: true });
try {
  // Real route components still arrive on demand, including direct links with
  // validated search values. No uploads or shared title edits are performed.
  for (const viewport of sections.has("public")
    ? [
        { width: 390, height: 844 },
        { width: 1440, height: 900 },
      ]
    : []) {
    const context = await browser.newContext({ viewport, reducedMotion: "reduce" });
    const page = await context.newPage();
    const errors = [];
    const scripts = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("request", (request) => {
      if (request.resourceType() === "script") scripts.push(request.url());
    });
    await page.goto(base);
    await page.locator(".cine-stage.is-complete").waitFor();
    assert.ok(!scripts.some((src) => /preview-host-bridge-|gallery-data-|tour-data-/.test(src)));

    await page.goto(`${base}/exhibition?work=g80`);
    const select = page.getByRole("combobox", { name: "展示する原画", exact: true });
    await select.waitFor();
    assert.equal(await select.inputValue(), "g80");
    assert.equal(await select.locator("option").count(), 113);
    await select.selectOption("g113");
    await page.waitForURL("**/exhibition?work=g113");
    assert.equal(await select.inputValue(), "g113");
    await page.goto(`${base}/exhibition?work=https%3A%2F%2Fexample.invalid%2Fart.png`);
    await select.waitFor();
    assert.equal(await select.inputValue(), "g01");

    await page.goto(`${base}/gallery-tours?tour=starlight&work=g94`);
    await page.locator('.gallery-tour-full-image[data-ready="true"]').waitFor();
    await page.getByRole("button", { name: "次の作品 →", exact: true }).click();
    await page.waitForURL("**/gallery-tours?tour=starlight&work=g21");
    await page.reload();
    await page.locator('.gallery-tour-full-image[data-ready="true"]').waitFor();
    assert.match(page.url(), /work=g21$/);
    await page.goto(`${base}/gallery-tours?tour=starlight&work=g01`);
    await page.locator('.gallery-tour-full-image[data-ready="true"]').waitFor();
    assert.equal(
      await page.locator(".gallery-tour-full-image").getAttribute("src"),
      (await import("../src/components/gallery-tours/tour-data.ts")).getTourArtwork("g05").full,
    );
    await page.goto(`${base}/gallery-tours?tour=constructor&work=g01`);
    await page.getByRole("heading", { name: "光景を、旅する。", exact: true }).waitFor();
    assert.deepEqual(errors, []);
    await page.screenshot({ path: `${output}/tours-${viewport.width}.png` });
    results.push({ viewport, publicBridgeNotLoaded: true, exhibitionAndTourLinks: true, errors });
    console.log(JSON.stringify(results.at(-1)));
    await context.close();
  }

  // Delay the real split chunk inside a native iframe. Commands arriving while
  // it downloads must be replayed once through the original security checks.
  for (const accepted of sections.has("frames") ? [true, false] : []) {
    // Only this disposable fixture context can embed another loopback host.
    // Otherwise Chromium blocks localhost before the origin guard is exercised.
    const context = await browser.newContext({
      reducedMotion: "reduce",
      permissions: ["local-network-access"],
    });
    let release;
    let requested;
    const hold = new Promise((resolve) => {
      release = resolve;
    });
    const started = new Promise((resolve) => {
      requested = resolve;
    });
    const bridgeRequests = [];
    // Keep both hosts loopback. An external fake host makes Chromium's local
    // network-access protection reject the iframe before our app can mount.
    const rejected = new URL("/__startup-preview-host", base);
    rejected.hostname = "127.0.0.2";
    const parent = accepted ? `${base}/__startup-preview-host` : rejected.href;
    await context.route(parent, (route) =>
      route.fulfill({
        contentType: "text/html",
        body: `<!doctype html><script>window.reports=[];addEventListener('message',e=>reports.push(e.data))</script><iframe src="${base}/"></iframe>`,
      }),
    );
    await context.route("**/assets/preview-host-bridge-*.js", async (route) => {
      bridgeRequests.push(route.request().url());
      requested();
      await hold;
      await route.continue();
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(parent, { waitUntil: "domcontentloaded" });
    const child = page.frames().find((frame) => frame.parentFrame());
    assert.ok(child);
    if (accepted) {
      await Promise.race([
        started,
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("preview bridge was not requested")), 15000),
        ),
      ]);
      const historyBefore = await child.evaluate(() => history.length);
      await page.evaluate(() => {
        const frame = document.querySelector("iframe").contentWindow;
        const origin = new URL(document.querySelector("iframe").src).origin;
        frame.postMessage({ channel: "grok-preview-bridge", version: 1, type: "hello" }, origin);
        frame.postMessage(
          { channel: "grok-preview-bridge", version: 2, type: "navigate", path: "/download" },
          origin,
        );
        frame.postMessage(
          {
            channel: "grok-preview-bridge",
            version: 1,
            type: "navigate",
            path: "//outside.invalid/",
          },
          origin,
        );
        frame.postMessage(
          { channel: "grok-preview-bridge", version: 1, type: "navigate", path: "/world" },
          origin,
        );
      });
      // Native postMessage is asynchronous; let all four arrive before the
      // chunk response, rather than silently testing the already-installed path.
      await page.waitForTimeout(80);
      release();
      await child.waitForURL(`${base}/world`);
      await child.waitForFunction(
        () => document.documentElement.dataset.worldPageVisible === "true",
      );
      await page.waitForFunction(
        () => window.reports.filter((report) => report.type === "ready").length === 2,
      );
      assert.equal(bridgeRequests.length, 1);
      const paths = await page.evaluate(() =>
        window.reports.filter((report) => report.type === "location").map((report) => report.path),
      );
      assert.ok(!paths.includes("/download"));
      assert.ok(paths.includes("/world"));
      assert.equal(await child.evaluate(() => history.length), historyBefore + 1);
    } else {
      await child.locator(".cine-stage.is-complete").waitFor();
      assert.deepEqual(bridgeRequests, []);
      assert.deepEqual(await page.evaluate(() => window.reports), []);
      release();
    }
    assert.deepEqual(errors, []);
    results.push({ acceptedFrame: accepted, bridgeRequests: bridgeRequests.length, errors });
    console.log(JSON.stringify(results.at(-1)));
    await context.close();
  }
  await writeFile(`${output}/report.json`, JSON.stringify(results, null, 2));
  console.log(JSON.stringify({ ok: true, results }, null, 2));
} finally {
  await browser.close();
}
