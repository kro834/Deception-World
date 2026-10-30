// Browser captures of /rexonance-3d: the page at 1440 x 900 and 390 x 844, the five view
// presets, and the poster (public/rexonance-3d-20261030/rexonance-3d-480.webp) rendered by
// the viewer itself. Run it against a dev or preview server after every GLB swap:
//
//   BASE_URL=http://127.0.0.1:8613 node scripts/capture-rexonance-3d.mjs [page] [views] [poster]
//
// OUT_DIR (default output/rexonance-3d/viewer) receives the PNGs and report.json.
// Headless Chromium draws WebGL with SwiftShader (slow but complete); CHROMIUM may name
// another executable.
import { existsSync, readdirSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import sharp from "sharp";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const base = process.env.BASE_URL || "http://127.0.0.1:8613";
const out = resolve(root, process.env.OUT_DIR || "output/rexonance-3d/viewer");
const tasks = process.argv.slice(2);
const run = (name) => tasks.length === 0 || tasks.includes(name);
const READY = '.rx3d-viewer[data-viewer-status="ready"]';
const VIEWS = ["front", "right", "back", "left", "oblique"];

/** Playwright's own build, or the newest headless shell already installed beside it (the
 * package and the preinstalled browsers can be a build apart). */
function chromiumExecutable() {
  if (process.env.CHROMIUM) return process.env.CHROMIUM;
  if (existsSync(chromium.executablePath())) return undefined;
  const folder = process.env.PLAYWRIGHT_BROWSERS_PATH;
  if (!folder || !existsSync(folder)) return undefined;
  const shell = readdirSync(folder)
    .filter((name) => /^chromium_headless_shell-\d+$/u.test(name))
    .sort((a, b) => Number(b.split("-")[1]) - Number(a.split("-")[1]))
    .map((name) => join(folder, name, "chrome-headless-shell-linux64", "chrome-headless-shell"))
    .find((file) => existsSync(file));
  return shell;
}

await mkdir(out, { recursive: true });
const browser = await chromium.launch({
  executablePath: chromiumExecutable(),
  args: [
    "--use-gl=angle",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
    "--no-sandbox",
  ],
});
const report = { base, captures: [], errors: [] };

async function open(profile, reducedMotion = "no-preference") {
  const context = await browser.newContext({ ...profile, reducedMotion });
  const page = await context.newPage();
  page.on("pageerror", (error) => report.errors.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") report.errors.push(`console: ${message.text()}`);
  });
  await page.goto(`${base}/rexonance-3d`, { waitUntil: "load" });
  await page.waitForSelector(READY, { timeout: 240_000 });
  // A few frames after ready (the fallback fades, the composer settles).
  await page.waitForTimeout(2500);
  return { context, page };
}

// Clip screenshots: an element screenshot waits for the element to be "stable" over frames,
// which a still WebGL page (reduced motion) never needs to draw.
async function area(page) {
  return page.locator(".rx3d-viewer__area").boundingBox();
}

async function diagnostics(page) {
  return page.evaluate(() => ({ ...document.querySelector(".rx3d-viewer__canvas")?.dataset }));
}

if (run("page")) {
  for (const [name, profile] of [
    ["page-1440", { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 }],
    [
      "page-390",
      {
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 2,
        isMobile: true,
        hasTouch: true,
      },
    ],
  ]) {
    const { context, page } = await open(profile);
    await page.waitForTimeout(2000);
    const file = join(out, `${name}.png`);
    await page.screenshot({ path: file, timeout: 180_000 });
    report.captures.push({ name, file, canvas: await diagnostics(page) });
    await context.close();
  }
}

if (run("views")) {
  // Reduced motion: the presets jump and the scene holds still, so every capture is exact.
  const { context, page } = await open(
    { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
    "reduce",
  );
  for (const view of VIEWS) {
    await page.click(`.rx3d-viewer__views button[data-view="${view}"]`);
    await page.waitForFunction(
      (id) => document.querySelector(".rx3d-viewer__canvas")?.dataset.view === id,
      view,
    );
    await page.waitForTimeout(1800);
    const file = join(out, `view-${view}.png`);
    await page.screenshot({ path: file, clip: await area(page), timeout: 180_000 });
    report.captures.push({ name: `view-${view}`, file });
  }
  // The reference panel beside the model, on the front view.
  await page.click('.rx3d-viewer__views button[data-view="front"]');
  await page.click(".rx3d-viewer__sheet-toggle");
  await page.waitForTimeout(2500);
  const file = join(out, "reference-panel.png");
  await page.screenshot({ path: file, timeout: 180_000 });
  report.captures.push({ name: "reference-panel", file, canvas: await diagnostics(page) });
  await context.close();
}

if (run("poster")) {
  const { context, page } = await open(
    { viewport: { width: 640, height: 960 }, deviceScaleFactor: 1.5 },
    "reduce",
  );
  await page.click('.rx3d-viewer__views button[data-view="oblique"]');
  await page.addStyleTag({
    content: ".rx3d-viewer__toolbar,.rx3d-record{visibility:hidden!important}",
  });
  await page.waitForTimeout(2500);
  const shot = await page.screenshot({ clip: await area(page), timeout: 180_000 });
  const file = resolve(root, "public/rexonance-3d-20261030/rexonance-3d-480.webp");
  // The figure sits in the band above the toolbar: keep a 2:3 window centred on it.
  const meta = await sharp(shot).metadata();
  const width = meta.width;
  const height = Math.min(meta.height, Math.round((width * 3) / 2));
  const top = Math.max(0, Math.round((meta.height - height) * 0.35));
  await sharp(shot)
    .extract({ left: 0, top, width, height })
    .resize(480, 720)
    .webp({ quality: 82, effort: 6 })
    .toFile(file);
  report.captures.push({ name: "poster", file });
  await context.close();
}

await browser.close();
await writeFile(join(out, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
