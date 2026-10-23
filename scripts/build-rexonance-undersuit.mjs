#!/usr/bin/env node
/** Pack Blender's undersuit render into the delivered bodysuit (2026-10-21).
 * The owner asked for the bare undersuit, its face above all, to stop looking
 * like a cheap AI cut-out: it is now a lit relief (scripts/blender/
 * rexonance_undersuit.py) rather than a painted mannequin. No runtime
 * Blender dependency; the render is an intermediate artefact.
 *
 * Render:
 *   python scripts/blender/rexonance_undersuit.py output/playwright/undersuit-production \
 *     --samples 160 --scale 2
 * Pack:  node scripts/build-rexonance-undersuit.mjs [--quality=84]
 * Check: node scripts/build-rexonance-undersuit.mjs --check
 *
 * The render (2x) is downsampled to the figure's 571 x 1040 with its colours
 * first spread past the silhouette (no dark fringe from transparent pixels),
 * and its alpha is replaced by the registration mask
 * design/rexonance-suit/rexonance-undersuit-mask-20261016.png: the footprint
 * of the 2026-10-16 bodysuit, so every plate, the driver, the flame mask and
 * the nanite targets still seat (scripts/build-rexonance-suit.mjs names the
 * same file; src/lib/rexonance-suit.ts carries the path).
 */
import assert from "node:assert/strict";
import { readFile, writeFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
import sharp from "sharp";

const root = resolve(import.meta.dirname, "..");
const render = resolve(
  root,
  process.env.REXONANCE_UNDERSUIT_RENDER || "output/playwright/undersuit-production/undersuit.png",
);
const maskFile = resolve(root, "design/rexonance-suit/rexonance-undersuit-mask-20261016.png");
// The suit's folder (2026-10-23: the suit re-cut by SAM's masks moved to a new
// folder; the undersuit carries over into it unchanged).
const file = resolve(root, "public/rexonance-suit-20261023/undersuit-20261021.webp");
const WIDTH = 571;
const HEIGHT = 1040;
// The rx12/rx13 set (figure, undersuit, body, face, plates) stays under
// 520 KB in scripts/rexonance-suitup.test.mjs; the other four weigh 460,954
// bytes, which leaves this file its budget.
const BUDGET = 59_000;
const check = process.argv.includes("--check");
const qualityArg = process.argv.find((arg) => arg.startsWith("--quality="));
const quality = qualityArg ? Number(qualityArg.slice("--quality=".length)) : 84;

const mask = await sharp(await readFile(maskFile)).toColourspace("b-w").raw().toBuffer({ resolveWithObject: true });
assert.equal(mask.info.width, WIDTH);
assert.equal(mask.info.height, HEIGHT);
assert.equal(mask.info.channels, 1);

if (check) {
  const published = await sharp(await readFile(file)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  assert.equal(published.info.width, WIDTH);
  assert.equal(published.info.height, HEIGHT);
  let worst = 0;
  for (let i = 0; i < WIDTH * HEIGHT; i += 1)
    worst = Math.max(worst, Math.abs(published.data[i * 4 + 3] - mask.data[i]));
  assert.ok(worst <= 2, `the published alpha strays from the registration mask by ${worst}`);
  const { size } = await stat(file);
  assert.ok(size <= BUDGET, `${size} bytes exceeds the budget of ${BUDGET}`);
  console.log(`ok: ${file} ${size} bytes, alpha within ${worst} of the mask`);
  process.exit(0);
}

const source = await sharp(await readFile(render)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const { width: w, height: h } = source.info;
assert.equal(w % WIDTH, 0, `the render's width ${w} is not a multiple of ${WIDTH}`);
assert.equal(h / HEIGHT, w / WIDTH, "the render keeps the figure's aspect");
// Spread the covered colours outward so the resample never averages in the
// transparent black beyond the silhouette.
const rgb = Buffer.alloc(w * h * 3);
const covered = new Uint8Array(w * h);
for (let i = 0; i < w * h; i += 1) {
  const a = source.data[i * 4 + 3];
  covered[i] = a > 8 ? 1 : 0;
  rgb[i * 3] = source.data[i * 4];
  rgb[i * 3 + 1] = source.data[i * 4 + 1];
  rgb[i * 3 + 2] = source.data[i * 4 + 2];
}
for (let pass = 0; pass < 4 * (w / WIDTH); pass += 1) {
  const next = Buffer.from(rgb);
  const nextCovered = new Uint8Array(covered);
  let spread = 0;
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const i = y * w + x;
      if (covered[i]) continue;
      let r = 0;
      let g = 0;
      let b = 0;
      let n = 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const j = ny * w + nx;
        if (!covered[j]) continue;
        r += rgb[j * 3];
        g += rgb[j * 3 + 1];
        b += rgb[j * 3 + 2];
        n += 1;
      }
      if (!n) continue;
      next[i * 3] = Math.round(r / n);
      next[i * 3 + 1] = Math.round(g / n);
      next[i * 3 + 2] = Math.round(b / n);
      nextCovered[i] = 1;
      spread += 1;
    }
  }
  rgb.set(next);
  covered.set(nextCovered);
  if (!spread) break;
}
const small = await sharp(rgb, { raw: { width: w, height: h, channels: 3 } })
  .resize(WIDTH, HEIGHT, { kernel: "lanczos3" })
  .raw()
  .toBuffer();
const rgba = Buffer.alloc(WIDTH * HEIGHT * 4);
for (let i = 0; i < WIDTH * HEIGHT; i += 1) {
  rgba[i * 4] = small[i * 3];
  rgba[i * 4 + 1] = small[i * 3 + 1];
  rgba[i * 4 + 2] = small[i * 3 + 2];
  rgba[i * 4 + 3] = mask.data[i];
}
const webp = await sharp(rgba, { raw: { width: WIDTH, height: HEIGHT, channels: 4 } })
  .webp({ quality, alphaQuality: 100, effort: 6, smartSubsample: true })
  .toBuffer();
await writeFile(file, webp);
console.log(`${file}: ${webp.length} bytes at quality ${quality} (budget ${BUDGET})`);
assert.ok(webp.length <= BUDGET, "over budget: lower --quality");
