// The /rexonance-saga share card (2026-10-22 sweep F07): a 1200x630 JPEG
// set from the page's own first screen, so a shared link shows Rexonance
// instead of the site's generic card.
//
//   node scripts/build-og-rexonance-saga.mjs
//     (PW_CHROMIUM=<path to a Chromium>, else PW_BROWSER_CHANNEL, default chrome)
//
// - The art is the owner's approved key visual, the hero's own image
//   (REXONANCE_SITE_ARTWORK.standard), uncropped at its top and faded into
//   the page's black on a dark stage in the page's colours: ice
//   rgb(150 236 255), pink rgb(255 143 216), gold #f2d896.
// - Every word is the page's own first screen, in its own self-hosted faces
//   (embedded here, never fetched): the kicker and the name in
//   "Rexonance Forge" (Saira, OFL), the hero's line and lede in the
//   Mincho subsets the route preloads (Shippori Mincho B1, OFL). No claim
//   is added.
// - Drawn at 2x in headless Chromium, resampled to 1200x630 and written as a
//   progressive JPEG under 200 KB (public/og-rexonance-saga-20261022.jpg).
//   The route declares it with its size (src/routes/rexonance-saga.tsx), and
//   the head injector (scripts/grok-pwa-shared.mjs) publishes it as the
//   route's og:image and twitter:image.
import { readFileSync, writeFileSync } from "node:fs";
import { chromium } from "playwright";
import sharp from "sharp";
import { REXONANCE_SITE_ARTWORK } from "../src/lib/rexonance-site-artwork.ts";

const publicDir = new URL("../public/", import.meta.url);
const OUTPUT = "og-rexonance-saga-20261022.jpg";
// The hero's own key visual: the card follows the artwork's revision.
const ART = REXONANCE_SITE_ARTWORK.standard.slice(1);
const FONTS = {
  forge: "fonts/rexonance-forge-20261016.woff2",
  outline: "fonts/rexonance-forge-outline-20261016.woff2",
  display: "fonts/rexonance-mincho-display-first-20261021.woff2",
  text: "fonts/rexonance-mincho-text-first-20261021.woff2",
};
const W = 1200;
const H = 630;
const SCALE = 2;

const data = (path, type) =>
  `data:${type};base64,${readFileSync(new URL(path, publicDir)).toString("base64")}`;
const font = (key) => data(FONTS[key], "font/woff2");

const html = `<!doctype html>
<meta charset="utf-8">
<style>
  @font-face { font-family: "Forge"; src: url(${font("forge")}) format("woff2"); font-weight: 300 800; }
  @font-face { font-family: "Forge Outline"; src: url(${font("outline")}) format("woff2"); font-weight: 800; }
  @font-face { font-family: "Mincho"; src: url(${font("display")}) format("woff2"); font-weight: 800; }
  @font-face { font-family: "Mincho Text"; src: url(${font("text")}) format("woff2"); font-weight: 500; }
  :root {
    --ink: #02050a;
    --ice: rgb(150 236 255);
    --pink: rgb(255 143 216);
    --gold: #f2d896;
    --gold-deep: #c98a2e;
    --paper: #f7f9fc;
  }
  * { box-sizing: border-box; margin: 0; }
  html, body { width: ${W}px; height: ${H}px; background: var(--ink); overflow: hidden; }
  .card {
    position: relative; width: ${W}px; height: ${H}px; overflow: hidden;
    background:
      radial-gradient(ellipse 46% 70% at 22% 46%, rgb(80 96 160 / 0.30), transparent 70%),
      radial-gradient(ellipse 40% 52% at 92% 104%, rgb(255 143 216 / 0.10), transparent 70%),
      radial-gradient(ellipse 50% 60% at 70% 30%, rgb(150 236 255 / 0.06), transparent 72%),
      linear-gradient(180deg, #050912, var(--ink) 70%);
  }
  /* The page's drafting grid, on the type's side only. */
  .grid {
    position: absolute; inset: 0 0 0 470px;
    background:
      linear-gradient(90deg, rgb(150 236 255 / 0.045) 1px, transparent 1px) 0 0 / 42px 42px,
      linear-gradient(180deg, rgb(150 236 255 / 0.045) 1px, transparent 1px) 0 0 / 42px 42px;
    -webkit-mask-image: linear-gradient(90deg, transparent, #000 22%, #000 78%, transparent);
    mask-image: linear-gradient(90deg, transparent, #000 22%, #000 78%, transparent);
  }
  .art {
    position: absolute; left: 0; top: 0; width: 560px; height: ${H}px; overflow: hidden;
    -webkit-mask-image: linear-gradient(90deg, #000 64%, transparent 98%), linear-gradient(180deg, #000 80%, transparent);
    -webkit-mask-composite: source-in;
    mask-image: linear-gradient(90deg, #000 64%, transparent 98%), linear-gradient(180deg, #000 80%, transparent);
    mask-composite: intersect;
  }
  .art img { position: absolute; left: 14px; top: -6px; height: 724px; width: auto; }
  /* The hero's pink-to-violet light trail. */
  .trail {
    position: absolute; right: -40px; top: 74px; width: 500px; height: 2px;
    transform: rotate(-6deg); transform-origin: right center;
    background: linear-gradient(90deg, transparent, rgb(182 163 255 / 0.55) 45%, rgb(255 143 216 / 0.9));
    filter: blur(0.4px);
  }
  .trail.is-soft { top: 80px; height: 10px; opacity: 0.35; filter: blur(6px); }
  .ghost {
    position: absolute; left: 594px; bottom: 58px;
    font: 800 86px/1 "Forge Outline"; letter-spacing: -0.02em;
    color: transparent; -webkit-text-stroke: 1.2px rgb(150 236 255 / 0.16);
    white-space: nowrap;
  }
  .copy { position: absolute; left: 596px; top: 134px; width: 560px; }
  .kicker {
    display: flex; align-items: center; gap: 18px;
    font: 500 14px/1 "Forge"; letter-spacing: 0.32em; color: var(--ice);
  }
  .kicker i { display: block; width: 36px; height: 1.5px; background: var(--gold); }
  .name {
    margin-top: 22px;
    font: 800 50px/1 "Forge"; letter-spacing: 0.04em; white-space: nowrap;
    background: linear-gradient(180deg, #fff3d0 8%, var(--gold) 46%, var(--gold-deep) 92%);
    -webkit-background-clip: text; background-clip: text; color: transparent;
    filter: drop-shadow(0 2px 0 rgb(40 22 0 / 0.55)) drop-shadow(0 0 18px rgb(242 216 150 / 0.18));
  }
  .line {
    margin-top: 26px;
    font: 800 82px/1.08 "Mincho"; font-feature-settings: "palt"; letter-spacing: 0.02em;
    color: var(--paper); white-space: nowrap;
    text-shadow: 0 0 26px rgb(150 236 255 / 0.12);
  }
  .lede {
    margin-top: 30px; display: flex; align-items: center; gap: 18px;
    font: 500 25px/1.4 "Mincho Text"; font-feature-settings: "palt"; letter-spacing: 0.09em;
    color: rgb(247 249 252 / 0.92); white-space: nowrap;
  }
  .lede i { display: block; width: 30px; height: 1.5px; background: var(--gold); }
  .mark {
    position: absolute; right: 44px; top: 40px;
    font: 500 12px/1 "Forge"; letter-spacing: 0.34em; color: rgb(214 224 234 / 0.72);
  }
  /* A frame of hairlines, gold at two corners, as the page's plates. */
  .frame { position: absolute; inset: 22px; border: 1px solid rgb(150 236 255 / 0.10); }
  .frame::before, .frame::after {
    content: ""; position: absolute; width: 26px; height: 26px; border-color: var(--gold); border-style: solid;
  }
  .frame::before { left: -1px; top: -1px; border-width: 1.5px 0 0 1.5px; }
  .frame::after { right: -1px; bottom: -1px; border-width: 0 1.5px 1.5px 0; }
</style>
<div class="card">
  <div class="grid"></div>
  <div class="art"><img alt="" src="${data(ART, "image/webp")}"></div>
  <div class="trail is-soft"></div>
  <div class="trail"></div>
  <div class="ghost">REXONANCE</div>
  <div class="copy">
    <p class="kicker"><i></i>THE NEXT GENERATION OF SA-GA</p>
    <h1 class="name">REXONANCE SAGA</h1>
    <p class="line">究極が始まる。</p>
    <p class="lede"><i></i>覚醒する、全てが最高峰で。</p>
  </div>
  <p class="mark">DECEPTION WORLD</p>
  <div class="frame"></div>
</div>`;

const browser = await chromium.launch(
  process.env.PW_CHROMIUM
    ? { executablePath: process.env.PW_CHROMIUM }
    : { channel: process.env.PW_BROWSER_CHANNEL || "chrome" },
);
try {
  const page = await browser.newPage({
    viewport: { width: W, height: H },
    deviceScaleFactor: SCALE,
  });
  await page.setContent(html, { waitUntil: "load" });
  const faces = await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all([...document.images].map((img) => img.decode()));
    return [...document.fonts].map((face) => `${face.family}:${face.status}`);
  });
  if (faces.some((face) => !face.endsWith(":loaded")))
    throw new Error(`faces: ${faces.join(", ")}`);
  // Every line stays inside the card.
  const overflow = await page.evaluate(() =>
    [...document.querySelectorAll(".copy > *, .mark")]
      .map((node) => node.getBoundingClientRect())
      .some((box) => box.right > innerWidth - 40 || box.bottom > innerHeight - 40),
  );
  if (overflow) throw new Error("a line runs outside the card");
  const png = await page.screenshot({ type: "png" });
  const jpeg = await sharp(png)
    .resize(W, H, { kernel: "lanczos3" })
    .jpeg({ quality: 86, mozjpeg: true, progressive: true, chromaSubsampling: "4:4:4" })
    .toBuffer();
  writeFileSync(new URL(OUTPUT, publicDir), jpeg);
  console.log(
    JSON.stringify({ file: `public/${OUTPUT}`, width: W, height: H, bytes: jpeg.length, faces }),
  );
} finally {
  await browser.close();
}
