// Right-sized WebP variants for small image slots: the World episode cards,
// the six-manager cards and the Zeus button. No image library is installed,
// so Chrome draws them: createImageBitmap with high-quality resampling, then
// canvas WebP at the quality build-dossier-images.mjs uses (84).
// Regenerate with `node scripts/build-thumbnail-variants.mjs` (needs the
// Chrome channel for Playwright). The variants and their slots are listed in
// src/lib/thumbnail-images.ts.
import { readFileSync, writeFileSync } from "node:fs";
import { chromium } from "playwright";
import {
  EPISODE_THUMBNAILS,
  MANAGER_THUMBNAILS,
  ZEUS_BUTTON_IMAGES,
} from "../src/lib/thumbnail-images.ts";

const publicPath = (path) => new URL(`../public${path}`, import.meta.url);
const jobs = [];
const sets = [
  ...Object.values(EPISODE_THUMBNAILS).map((set) => [set, 0.84]),
  ...Object.values(MANAGER_THUMBNAILS).map((set) => [set, 0.84]),
  ...Object.values(ZEUS_BUTTON_IMAGES).map((set) => [set, 0.86]),
];
for (const [set, quality] of sets) {
  for (const variant of set.variants) {
    if (variant.build) jobs.push({ source: set.source, output: variant.path, width: variant.width, quality });
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
      probe.close();
      const bitmap = await createImageBitmap(blob, {
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
  const output = Buffer.from(encoded.data, "base64");
  writeFileSync(publicPath(job.output), output);
  console.log(`${job.source} -> ${job.output} ${encoded.width}x${encoded.height} ${output.length} B`);
}
await browser.close();
