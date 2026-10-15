// Lists every <img> drawn over more device pixels than its file holds:
// fileWidth < drawnWidth x DPR x 0.9, where drawnWidth follows object-fit
// (cover takes the larger axis, contain the smaller) and any transform. The
// file's own pixels come from re-decoding currentSrc, because naturalWidth of
// a srcset image is its density-corrected CSS width, not its pixels.
//
// Each page is scrolled top to bottom so lazy art loads; an image keeps the
// largest enlargement seen. A row is "sizes" when its own srcset holds a
// wider candidate the browser did not pick (the slot is wider than `sizes`
// says: fixable in code), else "source" (the widest file there is: needs a
// larger master or a smaller slot). Image bytes by MIME type are listed too.
//
//   BASE_URL=http://127.0.0.1:8702 node scripts/measure-image-upscale.mjs [--enforce] [path ...]
//
// Paths default to the special sites, the World and the Dream chapter plus
// every dossier the side menu (#site-side-panel) links. IMAGE_UPSCALE_VIEWPORTS
// ("1440x900@2,1024x1366@2") picks the screens; add 1920x1080@1 to catch a
// `sizes` that under-asks only on 1x desktops. The report is written to
// IMAGE_UPSCALE_OUTPUT (artifacts/image-upscale/report.json). --enforce exits
// 1 when a "sizes" row is found.
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { chromium } from "playwright";

const base = process.env.BASE_URL ?? process.env.BASE ?? "http://127.0.0.1:8171";
const output = process.env.IMAGE_UPSCALE_OUTPUT ?? "artifacts/image-upscale/report.json";
const enforce = process.argv.includes("--enforce");
const pathArgs = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
const THRESHOLD = 0.9;
const viewports = (process.env.IMAGE_UPSCALE_VIEWPORTS ?? "1440x900@2,1024x1366@2")
  .split(",")
  .map((spec) => {
    const [, width, height, dpr] = spec.match(/^(\d+)x(\d+)@([\d.]+)$/) ?? [];
    if (!width) throw new Error(`bad viewport ${spec}`);
    return { width: +width, height: +height, dpr: +dpr };
  });
const SITE_PATHS = [
  "/",
  "/world",
  "/rexonance-saga",
  "/extreme-saga",
  "/final-stage",
  "/dream-chapter",
];

async function settle(page) {
  await page
    .waitForFunction(
      () =>
        !document.documentElement.hasAttribute("data-loading") &&
        !document.documentElement.hasAttribute("data-route-scroll-settling") &&
        !document.querySelector(".load-gate"),
      undefined,
      { timeout: 45000 },
    )
    .catch(() => {});
  await page.waitForTimeout(800);
}

async function menuDossiers(page) {
  await page.goto(new URL("/world", base).href, { waitUntil: "domcontentloaded" });
  await settle(page);
  const links = () =>
    page.evaluate(() =>
      [...document.querySelectorAll("#site-side-panel a[href]")].map((a) => a.getAttribute("href")),
    );
  let hrefs = await links();
  if (!hrefs.length) {
    await page.locator(".side-panel-trigger").first().click();
    await page.waitForTimeout(1500);
    hrefs = await links();
  }
  return [
    ...new Set(hrefs.filter((href) => /^\/(characters|managers|riders)\/[^/?#]+$/.test(href))),
  ];
}

// Runs in the page: every rendered image near the viewport, with the scale
// of its file's pixels on the device.
async function measure(threshold) {
  const files = (window.__upscaleFiles ||= new Map());
  const pixels = async (url) => {
    if (!files.has(url)) {
      const probe = new Image();
      probe.src = url;
      await probe.decode().catch(() => undefined);
      files.set(url, { width: probe.naturalWidth, height: probe.naturalHeight });
    }
    return files.get(url);
  };
  const label = (node) => {
    const parts = [];
    for (let n = node, i = 0; n && n.nodeType === 1 && i < 4; n = n.parentElement, i += 1) {
      let part = n.tagName.toLowerCase();
      if (n.id) part += `#${n.id}`;
      const classes = [...n.classList].slice(0, 3).join(".");
      if (classes) part += `.${classes}`;
      parts.unshift(part);
      if (n.id) break;
    }
    return parts.join(" > ");
  };
  const opacity = (node) => {
    let value = 1;
    for (let n = node; n && n.nodeType === 1; n = n.parentElement) {
      const style = getComputedStyle(n);
      if (style.display === "none" || style.visibility === "hidden") return 0;
      value *= Number(style.opacity);
    }
    return value;
  };
  const rows = [];
  for (const image of document.images) {
    if (!image.complete || !image.naturalWidth || !image.currentSrc) continue;
    const box = image.getBoundingClientRect();
    if (box.width < 2 || box.height < 2) continue;
    if (box.bottom < -innerHeight * 0.1 || box.top > innerHeight * 1.1) continue;
    if (box.right < 0 || box.left > innerWidth) continue;
    const file = await pixels(image.currentSrc);
    if (!file.width) continue;
    const fit = getComputedStyle(image).objectFit;
    const sx = box.width / file.width;
    const sy = box.height / file.height;
    const css = (image.naturalWidth / file.width) * (box.width / (image.offsetWidth || box.width));
    const scale =
      fit === "contain"
        ? Math.min(sx, sy)
        : fit === "none"
          ? css
          : fit === "scale-down"
            ? Math.min(sx, sy, css)
            : Math.max(sx, sy);
    const widest = (image.getAttribute("srcset") ?? "")
      .split(",")
      .map((candidate) => candidate.trim().split(/\s+/))
      .filter(([, descriptor]) => descriptor?.endsWith("w"))
      .reduce((max, [, descriptor]) => Math.max(max, parseInt(descriptor, 10)), 0);
    const device = scale * devicePixelRatio;
    rows.push({
      image: label(image),
      file: image.currentSrc.replace(location.origin, ""),
      fileWidth: file.width,
      fileHeight: file.height,
      box: [Math.round(box.width), Math.round(box.height)],
      fit,
      drawnWidth: Math.round(file.width * scale),
      deviceScale: Math.round(device * 1000) / 1000,
      upscaled: file.width < file.width * device * threshold,
      kind: widest > file.width ? "sizes" : "source",
      widestCandidate: widest || null,
      opacity: Math.round(opacity(image) * 100) / 100,
    });
  }
  return rows;
}

const browser = await chromium.launch({ channel: process.env.PW_BROWSER_CHANNEL ?? "chrome" });
const report = { base, threshold: THRESHOLD, viewports: [] };
let sizesRows = 0;
try {
  for (const viewport of viewports) {
    const context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
      deviceScaleFactor: viewport.dpr,
      hasTouch: viewport.width < 1100,
    });
    const page = await context.newPage();
    const paths = pathArgs.length ? pathArgs : [...SITE_PATHS, ...(await menuDossiers(page))];
    const entry = { viewport, pages: [] };
    for (const path of paths) {
      const bytes = new Map();
      const onResponse = async (response) => {
        if (response.request().resourceType() !== "image") return;
        try {
          const body = await response.body();
          bytes.set(response.url(), {
            type: (response.headers()["content-type"] ?? "").split(";")[0],
            bytes: body.length,
          });
        } catch {
          // A redirect or an aborted request has no body.
        }
      };
      page.on("response", onResponse);
      await page.goto(new URL(path, base).href, { waitUntil: "domcontentloaded" });
      await settle(page);
      const worst = new Map();
      const keep = (rows) => {
        for (const row of rows) {
          const key = `${row.image}|${row.file}`;
          if (!worst.has(key) || row.deviceScale > worst.get(key).deviceScale) worst.set(key, row);
        }
      };
      keep(await page.evaluate(measure, THRESHOLD));
      const step = Math.round(viewport.height * 0.8);
      for (let top = step; ; top += step) {
        const height = await page.evaluate(() => document.documentElement.scrollHeight);
        if (top > height + step) break;
        await page.evaluate((y) => window.scrollTo({ top: y, behavior: "instant" }), top);
        await page.waitForTimeout(350);
        keep(await page.evaluate(measure, THRESHOLD));
      }
      await page.waitForTimeout(500);
      page.off("response", onResponse);
      const upscaled = [...worst.values()]
        .filter((row) => row.upscaled)
        .sort((a, b) => b.deviceScale - a.deviceScale);
      const byType = {};
      for (const { type, bytes: size } of bytes.values()) byType[type] = (byType[type] ?? 0) + size;
      entry.pages.push({ path, upscaled, images: worst.size, imageBytes: byType });
      sizesRows += upscaled.filter((row) => row.kind === "sizes").length;
      console.log(
        `${viewport.width}x${viewport.height}@${viewport.dpr} ${path}: ${worst.size} images, ${upscaled.length} enlarged; ${JSON.stringify(byType)}`,
      );
      for (const row of upscaled) {
        console.log(
          `  ${row.kind.padEnd(6)} x${row.deviceScale} ${row.file} ${row.fileWidth}px -> ${row.drawnWidth}px (${row.box.join("x")} ${row.fit}, opacity ${row.opacity}) ${row.image}`,
        );
      }
    }
    report.viewports.push(entry);
    await context.close();
  }
} finally {
  await browser.close();
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, JSON.stringify(report, null, 2));
  console.log(`report: ${output}`);
}
if (enforce && sizesRows) {
  console.error(`${sizesRows} enlarged image(s) had a wider candidate in their own srcset`);
  process.exitCode = 1;
}
