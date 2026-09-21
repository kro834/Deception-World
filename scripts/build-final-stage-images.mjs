// Generates the Final Stage (ファイナルステージ) public image set from the raw source
// exports. sharp/cwebp are not available on the build Mac, so Chrome (via
// Playwright, channel "chrome") encodes WebP/JPEG through an offscreen canvas.
//
//   node scripts/build-final-stage-images.mjs
//   FINAL_STAGE_SOURCE_DIR=/path/to/images node scripts/build-final-stage-images.mjs
import { createRequire } from "node:module";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const DEFAULT_SOURCE_DIR =
  "/private/tmp/claude-501/-Users-hosicommon-Downloads----------/a197c01a-c567-49c1-b4b5-8af9d049f9af/images";
const SOURCE_DIR = process.env.FINAL_STAGE_SOURCE_DIR || DEFAULT_SOURCE_DIR;
const PUBLIC_DIR = fileURLToPath(new URL("../public/", import.meta.url));

// Source file → public stem. Order matches the page (logo, FFS stages, Realm Royal).
const SOURCES = [
  { file: "4.jpg", name: "final-stage-logo", logo: true },
  { file: "5.webp", name: "rider-far-from-saga-middle" },
  { file: "6.webp", name: "rider-far-from-saga-high" },
  { file: "7.webp", name: "rider-far-from-saga-xhigh" },
  { file: "8.webp", name: "rider-far-from-saga-max" },
  { file: "9.webp", name: "rider-far-from-saga-ultra" },
  { file: "10.jpg", name: "rider-realm-royal" },
  { file: "1.webp", name: "rider-realm-royal-02" },
  { file: "2.webp", name: "rider-realm-royal-03" },
  { file: "3.webp", name: "rider-realm-royal-04" },
  { file: "11.webp", name: "character-archive" },
  { file: "13.webp", name: "character-nagi-20260922" },
];

const DELIVERY_WIDTHS = [640, 960];
const WEBP_QUALITIES = [0.84, 0.8, 0.76];
const JPEG_QUALITY = 0.86;
const CAPS = {
  riderCanonical: 600000,
  delivery640: 200000,
  delivery960: 350000,
  logoWebp: 400000,
  logoJpeg: 600000,
};

const MIME = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".png": "image/png",
};

function assertWebp(bytes, label) {
  const riff = bytes.subarray(0, 4).toString("ascii");
  const webp = bytes.subarray(8, 12).toString("ascii");
  if (riff !== "RIFF" || webp !== "WEBP") throw new Error(`${label}: not a WebP container`);
}

function assertJpeg(bytes, label) {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) throw new Error(`${label}: not a JPEG`);
}

async function main() {
  await mkdir(PUBLIC_DIR, { recursive: true });
  const browser = await chromium.launch({ channel: "chrome" });
  const page = await browser.newPage();
  await page.setContent("<!doctype html><title>final-stage-images</title>");

  // Decode once per source, then encode each requested width/quality in the page.
  const encode = (dataUrl, width, mime, quality) =>
    page.evaluate(
      async ({ dataUrl, width, mime, quality }) => {
        const img = new Image();
        img.src = dataUrl;
        await img.decode();
        const scale = Math.min(1, width / img.naturalWidth);
        const w = Math.round(img.naturalWidth * scale);
        const h = Math.round(img.naturalHeight * scale);
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(img, 0, 0, w, h);
        const out = canvas.toDataURL(mime, quality);
        return { width: w, height: h, base64: out.slice(out.indexOf(",") + 1) };
      },
      { dataUrl, width, mime, quality },
    );

  const rows = [];
  const record = (file, width, height, bytes, quality) =>
    rows.push({ file: `/${file}`, dimensions: `${width}x${height}`, bytes, quality });

  for (const source of SOURCES) {
    const inputPath = join(SOURCE_DIR, source.file);
    const input = await readFile(inputPath);
    const mime = MIME[extname(source.file).toLowerCase()];
    if (!mime) throw new Error(`Unsupported source type: ${source.file}`);
    const dataUrl = `data:${mime};base64,${input.toString("base64")}`;
    const canonicalCap = source.logo ? CAPS.logoWebp : CAPS.riderCanonical;

    // Canonical .webp at native width; step quality down only if the cap is missed.
    let canonical;
    let quality;
    for (quality of WEBP_QUALITIES) {
      const result = await encode(dataUrl, Number.MAX_SAFE_INTEGER, "image/webp", quality);
      const bytes = Buffer.from(result.base64, "base64");
      canonical = { ...result, bytes };
      if (bytes.length < canonicalCap) break;
    }
    if (canonical.bytes.length >= canonicalCap) {
      throw new Error(
        `${source.name}.webp is ${canonical.bytes.length} bytes (cap ${canonicalCap})`,
      );
    }
    assertWebp(canonical.bytes, `${source.name}.webp`);
    await writeFile(join(PUBLIC_DIR, `${source.name}.webp`), canonical.bytes);
    record(
      `${source.name}.webp`,
      canonical.width,
      canonical.height,
      canonical.bytes.length,
      quality,
    );

    const nativeWidth = canonical.width;
    for (const target of [...DELIVERY_WIDTHS, nativeWidth]) {
      const file = `${source.name}-delivery-${target}.webp`;
      let out;
      if (target >= nativeWidth) {
        // withoutEnlargement: the native delivery file is a byte copy of the canonical.
        out = { ...canonical, quality };
      } else {
        let q;
        for (q of WEBP_QUALITIES) {
          const result = await encode(dataUrl, target, "image/webp", q);
          const bytes = Buffer.from(result.base64, "base64");
          out = { ...result, bytes, quality: q };
          const cap =
            target === 640 ? CAPS.delivery640 : target === 960 ? CAPS.delivery960 : Infinity;
          if (bytes.length < cap && bytes.length <= canonical.bytes.length) break;
        }
      }
      const cap = target === 640 ? CAPS.delivery640 : target === 960 ? CAPS.delivery960 : Infinity;
      if (out.bytes.length >= cap)
        throw new Error(`${file} is ${out.bytes.length} bytes (cap ${cap})`);
      if (out.bytes.length > canonical.bytes.length) {
        throw new Error(`${file} (${out.bytes.length}) is larger than its canonical`);
      }
      assertWebp(out.bytes, file);
      await writeFile(join(PUBLIC_DIR, file), out.bytes);
      record(file, out.width, out.height, out.bytes.length, out.quality);
    }

    if (source.logo) {
      const file = `${source.name}.jpeg`;
      const result = await encode(dataUrl, Number.MAX_SAFE_INTEGER, "image/jpeg", JPEG_QUALITY);
      const bytes = Buffer.from(result.base64, "base64");
      if (bytes.length >= CAPS.logoJpeg) throw new Error(`${file} is ${bytes.length} bytes`);
      assertJpeg(bytes, file);
      await writeFile(join(PUBLIC_DIR, file), bytes);
      record(file, result.width, result.height, bytes.length, JPEG_QUALITY);
    }
  }

  await browser.close();

  const widthOf = (row) => Number(row.dimensions.split("x")[0]);
  console.log("| public path | dimensions | bytes | quality |");
  console.log("| --- | --- | ---: | --- |");
  for (const row of rows) {
    console.log(`| ${row.file} | ${row.dimensions} | ${row.bytes} | ${row.quality} |`);
  }
  console.log("");
  console.log("Register in src/lib/rexonance-images.ts:");
  for (const row of rows) {
    if (row.file.endsWith(".webp") && !row.file.includes("-delivery-")) {
      console.log(`  "${row.file}": ${widthOf(row)},`);
    }
  }
  console.log(`Source dir: ${resolve(SOURCE_DIR)} (${basename(SOURCE_DIR)})`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
