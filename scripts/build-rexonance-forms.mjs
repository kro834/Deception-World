// Builds the MAX and ULTRA figures for the Rexonance form changes (owner,
// 2026-10-11): the owner's full-body MAX and ULTRA art, in the same pose as
// the suit-up's artwork, cut to the suit figure's frame (571 x 1040, the
// same crop as scripts/build-rexonance-suit.mjs) with an alpha from the
// black ground, so they overlay the finished Rexonance pixel for pixel.
// Run: node scripts/build-rexonance-forms.mjs
import sharp from "sharp";
import { fileURLToPath } from "node:url";

const root = (path) => fileURLToPath(new URL(`../${path}`, import.meta.url));
const SOURCE = { width: 1055, height: 2000 };
const CROP = { left: 20, top: 41, width: 1019, height: 1855 };
const FIG = { width: 571, height: 1040 };
const SUIT = "public/rexonance-suit-20261010";
const OUT = "public/rexonance-forms-20261011";

const base = await sharp(root(`${SUIT}/figure.webp`))
  .ensureAlpha()
  .raw()
  .toBuffer();

for (const form of ["max", "ultra"]) {
  // sharp extracts before it resizes within one pipeline: two passes.
  const source = await sharp(root(`design/rexonance-suit/rexonance-${form}-20261011.webp`))
    .resize(SOURCE.width, SOURCE.height, { fit: "fill", kernel: "lanczos3" })
    .toBuffer();
  const { data } = await sharp(source)
    .extract(CROP)
    .resize(FIG.width, FIG.height, { fit: "fill", kernel: "lanczos3" })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const out = Buffer.alloc(FIG.width * FIG.height * 4);
  for (let i = 0; i < FIG.width * FIG.height; i += 1) {
    const r = data[i * 3];
    const g = data[i * 3 + 1];
    const b = data[i * 3 + 2];
    // The silhouette is the owner's cut-out of the figure (HIGH's alpha):
    // the forms share its pose to the pixel. Only real light beyond it (a
    // bright glow, not the black ground's noise) adds to it, so no dark rim
    // of the ground comes along (owner, 2026-10-11).
    const lit = Math.min(1, Math.max(0, (Math.max(r, g, b) - 70) / 60));
    const alpha = Math.max(lit, base[i * 4 + 3] / 255);
    out[i * 4] = r;
    out[i * 4 + 1] = g;
    out[i * 4 + 2] = b;
    out[i * 4 + 3] = Math.round(alpha * 255);
  }
  const file = `${OUT}/${form}.webp`;
  await sharp(out, { raw: { width: FIG.width, height: FIG.height, channels: 4 } })
    .webp({ quality: 70, alphaQuality: 80, effort: 6 })
    .toFile(root(file));
  console.log(file);
}

// EXCELSIOR (owner, 2026-10-11): its art is not drawn in the same pose, so it
// is fitted to the figure by its bounds — the same height head to toe, the
// same centre, standing on the same ground — on the same black-ground alpha.
{
  const src = root("design/rexonance-suit/rexonance-excelsior-20261012.webp");
  const { data, info } = await sharp(src).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const bounds = (pixels, width, height, channels, test) => {
    let x0 = width, y0 = height, x1 = 0, y1 = 0;
    for (let y = 0; y < height; y += 1)
      for (let x = 0; x < width; x += 1) {
        if (!test(pixels, (y * width + x) * channels)) continue;
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    return { x0, y0, x1, y1 };
  };
  const art = bounds(data, info.width, info.height, 3, (p, i) => Math.max(p[i], p[i + 1], p[i + 2]) > 40);
  const fig = bounds(base, FIG.width, FIG.height, 4, (p, i) => p[i + 3] > 40);
  // The same height as the figure — unless its ribbons would then run past
  // the frame's sides (owner, 2026-10-12): then it fits the width, centred.
  const scale = Math.min(
    (fig.y1 - fig.y0) / (art.y1 - art.y0),
    (FIG.width - 8) / (art.x1 - art.x0),
  );
  const width = Math.round(info.width * scale);
  const height = Math.round(info.height * scale);
  const left = Math.round(FIG.width / 2 - ((art.x0 + art.x1) / 2) * scale);
  const top = Math.round(fig.y1 - art.y1 * scale);
  const scaled = await sharp(src).removeAlpha().resize(width, height, { kernel: "lanczos3" }).raw().toBuffer();
  const out = Buffer.alloc(FIG.width * FIG.height * 4);
  for (let y = 0; y < FIG.height; y += 1)
    for (let x = 0; x < FIG.width; x += 1) {
      const sx = x - left;
      const sy = y - top;
      if (sx < 0 || sy < 0 || sx >= width || sy >= height) continue;
      const j = (sy * width + sx) * 3;
      const o = (y * FIG.width + x) * 4;
      const r = scaled[j];
      const g = scaled[j + 1];
      const b = scaled[j + 2];
      out[o] = r;
      out[o + 1] = g;
      out[o + 2] = b;
      out[o + 3] = Math.round(Math.min(1, Math.max(0, (Math.max(r, g, b) - 14) / 30)) * 255);
    }
  const file = `${OUT}/excelsior.webp`;
  await sharp(out, { raw: { width: FIG.width, height: FIG.height, channels: 4 } })
    .webp({ quality: 70, alphaQuality: 80, effort: 6 })
    .toFile(root(file));
  console.log(file, { scale: scale.toFixed(3), left, top });
}
