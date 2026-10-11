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

const base = await sharp(root(`${SUIT}/figure.webp`)).ensureAlpha().raw().toBuffer();

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
    // The ground is black: the light and the armour stand off it; the
    // finished figure's own silhouette keeps the dark plates opaque.
    const lit = Math.min(1, Math.max(0, (Math.max(r, g, b) - 10) / 34));
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
