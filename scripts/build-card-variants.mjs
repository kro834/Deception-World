// Right-sized WebP variants for two kinds of card: the World cast wall's
// portraits (04 CAST FILES, its quote chips and the 05 ID photo) and the
// hero's poster deck (with the Dream Chapter's console, whose poster 05 is
// also that page's hero), plus the Dream Chapter's title logo and the
// character files' 720 px hero candidates. The sources stay as supplied; the
// variants are drawn by Chrome like build-thumbnail-variants.mjs does
// (createImageBitmap with high-quality resampling, then canvas WebP at the
// dossier quality, 84). A variant as wide as its source is a WebP re-encode
// of a file that had no delivery copy.
// Regenerate with `node scripts/build-card-variants.mjs [source]` (needs the
// Chrome channel for Playwright; a source path limits it to that set). The
// variants and their slots are listed in src/lib/thumbnail-images.ts
// (PORTRAIT_THUMBNAILS, POSTER_IMAGES, TITLE_LOGO_IMAGES) and
// src/lib/dossier-images.ts (DOSSIER_HERO_IMAGES).
import { readFileSync, writeFileSync } from "node:fs";
import { chromium } from "playwright";
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
  if (only && set.source !== only) continue;
  for (const variant of set.variants) {
    if (variant.build) jobs.push({ source: set.source, output: variant.path, width: variant.width });
  }
}

const browser = await chromium.launch({ channel: process.env.PW_BROWSER_CHANNEL || "chrome" });
const page = await browser.newPage();
for (const job of jobs) {
  const input = readFileSync(publicPath(job.source));
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
    { bytes: input.toString("base64"), width: job.width, quality: QUALITY },
  );
  const output = Buffer.from(encoded.data, "base64");
  writeFileSync(publicPath(job.output), output);
  console.log(`${job.source} -> ${job.output} ${encoded.width}x${encoded.height} ${output.length} B`);
}
await browser.close();
