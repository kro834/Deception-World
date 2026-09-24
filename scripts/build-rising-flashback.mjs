// RISING THE WORLD's flashback scenes (src/components/world/rising-art.ts
// RISING_FLASHBACK): the supplied images, in the order supplied, cut to 800 px
// on the long side and graded as a memory (warm, partly drained, dimmed; the
// ninth, a white hall, dimmer still, so no cross-fade reads as a flash).
// Chrome draws them (no image library is installed).
//
//   node scripts/build-rising-flashback.mjs <dir with the 11 supplied files, in order>
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright";

const source = process.argv[2];
if (!source) throw new Error("usage: build-rising-flashback.mjs <source dir>");
const files = readdirSync(source)
  .filter((name) => /\.(webp|png|jpe?g)$/i.test(name))
  .sort((a, b) => a.localeCompare(b, "en", { numeric: true }));
if (files.length !== 11) throw new Error(`expected 11 images, found ${files.length}`);

const GRADE = "grayscale(0.2) sepia(0.18) brightness(0.74) contrast(0.9)";
const GRADE_BRIGHT = "grayscale(0.2) sepia(0.18) brightness(0.5) contrast(0.9)";

const browser = await chromium.launch({ channel: process.env.PW_BROWSER_CHANNEL || "chrome" });
const page = await browser.newPage();
for (const [index, file] of files.entries()) {
  const encoded = await page.evaluate(
    async ({ bytes, grade }) => {
      const blob = new Blob([Uint8Array.from(atob(bytes), (c) => c.charCodeAt(0))]);
      const probe = await createImageBitmap(blob);
      const scale = Math.min(1, 800 / Math.max(probe.width, probe.height));
      const width = Math.round(probe.width * scale);
      const height = Math.round(probe.height * scale);
      probe.close();
      const bitmap = await createImageBitmap(blob, {
        resizeWidth: width,
        resizeHeight: height,
        resizeQuality: "high",
      });
      const canvas = new OffscreenCanvas(width, height);
      const context = canvas.getContext("2d");
      context.filter = grade;
      context.drawImage(bitmap, 0, 0);
      const out = new Uint8Array(
        await (await canvas.convertToBlob({ type: "image/webp", quality: 0.66 })).arrayBuffer(),
      );
      let binary = "";
      for (let i = 0; i < out.length; i += 0x8000)
        binary += String.fromCharCode(...out.subarray(i, i + 0x8000));
      return { data: btoa(binary), width, height };
    },
    {
      bytes: readFileSync(join(source, file)).toString("base64"),
      grade: index === 8 ? GRADE_BRIGHT : GRADE,
    },
  );
  const name = `rising-flashback-${String(index + 1).padStart(2, "0")}-20260924.webp`;
  const output = Buffer.from(encoded.data, "base64");
  writeFileSync(new URL(`../public/${name}`, import.meta.url), output);
  console.log(`${file} -> ${name} ${encoded.width}x${encoded.height} ${output.length} B`);
}
await browser.close();
