// Alpha-keys the two supplied opening logos (glow on pure black) into the
// responsive delivery files, in headless Chrome: no image library is needed.
//
//   node scripts/build-opening-logos.mjs   (PW_BROWSER_CHANNEL, default chrome)
//
// 1. The supplied frame is feathered at its sides, so light trails that run
//    off the artwork taper out instead of ending on a cut.
// 2. Each delivery width is resampled from the opaque artwork (that is, the
//    logo premultiplied over black), so there is no dark fringe.
// 3. alpha = max(r, g, b) of a lightly smoothed envelope, rounded up to a few
//    levels (lossless WebP alpha is expensive for fine glow), and zero at the
//    black floor. Straight colour = original / alpha, so colour x alpha is the
//    artwork itself: over black it is unchanged, over the opening's dark blue
//    it sits like light, without a matte, a halo or a box.
// 4. Faint glow takes a smoothed hue, so the supplied file's compression
//    noise is not amplified into coloured speckle.
import { readFileSync, writeFileSync } from "node:fs";
import { chromium } from "playwright";

const root = new URL("../public/", import.meta.url);
const SOURCES = ["logo-title-ice-20260924.webp", "logo-title-prism-20260924.webp"];
const WIDTHS = [640, 960, 1280, 1536];
const LEVELS = [0, 12, 64, 128, 192, 255];
const QUALITY = 0.75;

const browser = await chromium.launch({ channel: process.env.PW_BROWSER_CHANNEL || "chrome" });
const page = await browser.newPage();
try {
  for (const file of SOURCES) {
    const source = readFileSync(new URL(file, root)).toString("base64");
    const outputs = await page.evaluate(
      async ({ source, widths, levels, quality }) => {
        const smooth = (a, b, v) => {
          const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
          return t * t * (3 - 2 * t);
        };
        const blob = await (await fetch(`data:image/webp;base64,${source}`)).blob();
        const bitmap = await createImageBitmap(blob, { colorSpaceConversion: "none" });
        const W0 = bitmap.width;
        const H0 = bitmap.height;
        const base = new OffscreenCanvas(W0, H0);
        const baseContext = base.getContext("2d", { willReadFrequently: true });
        baseContext.drawImage(bitmap, 0, 0);
        const feathered = baseContext.getImageData(0, 0, W0, H0);
        for (let y = 0; y < H0; y += 1) {
          const fy = smooth(0, 0.05, y / (H0 - 1)) * smooth(0, 0.05, 1 - y / (H0 - 1));
          for (let x = 0; x < W0; x += 1) {
            const f = fy * smooth(0, 0.075, x / (W0 - 1)) * smooth(0, 0.075, 1 - x / (W0 - 1));
            const i = (y * W0 + x) * 4;
            for (let c = 0; c < 3; c += 1)
              feathered.data[i + c] = Math.round(feathered.data[i + c] * f);
          }
        }
        baseContext.putImageData(feathered, 0, 0);
        const alphaLevels = levels.map((value) => value / 255);
        const quantise = (value) => alphaLevels.find((level) => level >= value - 1e-6) ?? 1;
        const results = [];
        for (const W of widths) {
          const H = Math.round((H0 * W) / W0);
          let current = base;
          let cw = W0;
          let ch = H0;
          while (cw / 2 >= W) {
            const next = new OffscreenCanvas(Math.round(cw / 2), Math.round(ch / 2));
            const context = next.getContext("2d");
            context.imageSmoothingQuality = "high";
            context.drawImage(current, 0, 0, next.width, next.height);
            current = next;
            cw = next.width;
            ch = next.height;
          }
          const sized = new OffscreenCanvas(W, H);
          const sizedContext = sized.getContext("2d", { willReadFrequently: true });
          sizedContext.imageSmoothingQuality = "high";
          sizedContext.drawImage(current, 0, 0, W, H);
          const image = sizedContext.getImageData(0, 0, W, H);
          const d = image.data;
          const N = W * H;
          const R = new Float32Array(N);
          const G = new Float32Array(N);
          const B = new Float32Array(N);
          const M = new Float32Array(N);
          for (let p = 0; p < N; p += 1) {
            R[p] = d[p * 4] / 255;
            G[p] = d[p * 4 + 1] / 255;
            B[p] = d[p * 4 + 2] / 255;
            M[p] = Math.max(R[p], G[p], B[p]);
          }
          // Separable box blur, applied twice (close to a small Gaussian).
          const box = (plane, r) => {
            const tmp = new Float32Array(N);
            const out = new Float32Array(N);
            const n = 2 * r + 1;
            for (let y = 0; y < H; y += 1) {
              let acc = 0;
              for (let k = -r; k <= r; k += 1)
                acc += plane[y * W + Math.min(W - 1, Math.max(0, k))];
              for (let x = 0; x < W; x += 1) {
                tmp[y * W + x] = acc / n;
                acc +=
                  plane[y * W + Math.min(W - 1, x + r + 1)] - plane[y * W + Math.max(0, x - r)];
              }
            }
            for (let x = 0; x < W; x += 1) {
              let acc = 0;
              for (let k = -r; k <= r; k += 1) acc += tmp[Math.min(H - 1, Math.max(0, k)) * W + x];
              for (let y = 0; y < H; y += 1) {
                out[y * W + x] = acc / n;
                acc += tmp[Math.min(H - 1, y + r + 1) * W + x] - tmp[Math.max(0, y - r) * W + x];
              }
            }
            return out;
          };
          const blur = (plane, r) => box(box(plane, r), r);
          const envelope = blur(M, Math.max(1, Math.round(W / 768)));
          const hueRadius = Math.max(1, Math.round(W / 512));
          const Rb = blur(R, hueRadius);
          const Gb = blur(G, hueRadius);
          const Bb = blur(B, hueRadius);
          for (let p = 0; p < N; p += 1) {
            const i = p * 4;
            const m = M[p];
            const env = Math.max(m, envelope[p]) * smooth(1.5 / 255, 6 / 255, m);
            if (env * 255 < 0.5) {
              d[i] = d[i + 1] = d[i + 2] = d[i + 3] = 0;
              continue;
            }
            const a = quantise(env);
            const mb = Math.max(Rb[p], Gb[p], Bb[p], 1e-4);
            const exact = smooth(0.05, 0.28, m);
            const s = m / a;
            const straight = [
              [R[p], Rb[p]],
              [G[p], Gb[p]],
              [B[p], Bb[p]],
            ].map(
              ([value, blurred]) => (blurred / mb) * s + (value / a - (blurred / mb) * s) * exact,
            );
            for (let c = 0; c < 3; c += 1) d[i + c] = Math.min(255, Math.round(straight[c] * 255));
            d[i + 3] = Math.round(a * 255);
          }
          const keyed = new OffscreenCanvas(W, H);
          keyed.getContext("2d").putImageData(image, 0, 0);
          const encoded = new Uint8Array(
            await (await keyed.convertToBlob({ type: "image/webp", quality })).arrayBuffer(),
          );
          let binary = "";
          for (let i = 0; i < encoded.length; i += 0x8000) {
            binary += String.fromCharCode(...encoded.subarray(i, i + 0x8000));
          }
          results.push({ width: W, height: H, data: btoa(binary) });
        }
        return results;
      },
      { source, widths: WIDTHS, levels: LEVELS, quality: QUALITY },
    );
    for (const { width, height, data } of outputs) {
      const name = file.replace(/\.webp$/, `-delivery-${width}.webp`);
      const bytes = Buffer.from(data, "base64");
      writeFileSync(new URL(name, root), bytes);
      console.log(`${name} ${width}x${height}: ${bytes.length} bytes`);
    }
  }
} finally {
  await browser.close();
}
