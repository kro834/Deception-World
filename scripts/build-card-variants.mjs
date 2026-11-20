// Right-sized WebP variants for two kinds of card: the World cast wall's
// portraits (04 CAST FILES, its quote chips and the 05 ID photo) and the
// hero's poster deck (with the Dream Chapter's console, whose poster 05 is
// also that page's hero), plus the Dream Chapter's title logo and the
// character files' 720 px hero candidates. The sources stay as supplied; the
// variants are drawn by Chrome like build-thumbnail-variants.mjs does
// (createImageBitmap with high-quality resampling, then canvas WebP at the
// dossier quality, 84), except the World print: its variants use sharp from
// the supplied WebP master to avoid lossy re-encoding. Other outputs need the
// Chrome channel for Playwright. A source path limits the build to that set;
// a variant's own path limits it to one file. The
// variants and their slots are listed in src/lib/thumbnail-images.ts
// (PORTRAIT_THUMBNAILS, POSTER_IMAGES, TITLE_LOGO_IMAGES) and
// src/lib/dossier-images.ts (DOSSIER_HERO_IMAGES).
import { readFileSync, writeFileSync } from "node:fs";
import { chromium } from "playwright";
import sharp from "sharp";
import { DOSSIER_HERO_IMAGES } from "../src/lib/dossier-images.ts";
import {
  PORTRAIT_THUMBNAILS,
  POSTER_IMAGES,
  TITLE_LOGO_IMAGES,
} from "../src/lib/thumbnail-images.ts";

const publicPath = (path) => new URL(`../public${path}`, import.meta.url);
const QUALITY = 0.84;
const only = process.argv[2];
const jobs = [];
for (const set of [
  ...Object.values(PORTRAIT_THUMBNAILS),
  ...Object.values(POSTER_IMAGES),
  ...Object.values(TITLE_LOGO_IMAGES),
  ...Object.values(DOSSIER_HERO_IMAGES),
]) {
  for (const variant of set.variants) {
    if (only && set.source !== only && variant.path !== only) continue;
    if (variant.build)
      jobs.push({
        source: set.source,
        output: variant.path,
        width: variant.width,
        quality: variant.quality ?? QUALITY,
      });
  }
}

// The World print's JPEG-independent WebP master is already present locally;
// use sharp for exact, reproducible derivatives without starting Chrome.
const browserJobs = jobs.filter((job) => job.source !== "/deception-world-poster.webp");
const browser = browserJobs.length
  ? await chromium.launch({ channel: process.env.PW_BROWSER_CHANNEL || "chrome" })
  : null;
const page = browser ? await browser.newPage() : null;
for (const job of jobs) {
  const input = readFileSync(publicPath(job.source));
  let output;
  if (job.source === "/deception-world-poster.webp") {
    output = await sharp(input)
      .resize({ width: job.width, kernel: "lanczos3" })
      .webp({ quality: Math.round(job.quality * 100), effort: 6, smartSubsample: true })
      .toBuffer();
  } else {
    const encoded = await page.evaluate(
      async ({ bytes, width, quality }) => {
        const blob = new Blob([Uint8Array.from(atob(bytes), (c) => c.charCodeAt(0))]);
        const probe = await createImageBitmap(blob);
        const height = Math.round((probe.height * width) / probe.width);
        const same = probe.width === width;
        probe.close();
        const bitmap = same
          ? await createImageBitmap(blob)
          : await createImageBitmap(blob, {
              resizeWidth: width,
              resizeHeight: height,
              resizeQuality: "high",
            });
        const canvas = new OffscreenCanvas(width, height);
        canvas.getContext("2d").drawImage(bitmap, 0, 0);
        const out = await canvas.convertToBlob({ type: "image/webp", quality });
        const buffer = new Uint8Array(await out.arrayBuffer());
        let binary = "";
        for (let i = 0; i < buffer.length; i += 0x8000)
          binary += String.fromCharCode(...buffer.subarray(i, i + 0x8000));
        return { data: btoa(binary), width, height };
      },
      { bytes: input.toString("base64"), width: job.width, quality: job.quality },
    );
    output = Buffer.from(encoded.data, "base64");
  }
  writeFileSync(publicPath(job.output), output);
  const { width, height } = await sharp(output).metadata();
  console.log(`${job.source} -> ${job.output} ${width}x${height} ${output.length} B`);
}
await browser?.close();
