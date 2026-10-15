// Builds the MAX and ULTRA figures for the Rexonance form changes (owner,
// 2026-10-11): the owner's full-body MAX and ULTRA art, in the same pose as
// the suit-up's artwork, cut to the suit figure's frame (571 x 1040, the
// same crop as scripts/build-rexonance-suit.mjs) with an alpha from the
// black ground, so they overlay the finished Rexonance pixel for pixel.
// Run: node scripts/build-rexonance-forms.mjs
import sharp from "sharp";
import { fileURLToPath } from "node:url";
import { buildExcelsior } from "./build-rexonance-excelsior.mjs";

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

const N = FIG.width * FIG.height;
// The black ground: near-black pixels connected to the image edges. It never
// enters the body (the black plates are walled in by their lit bevels), so
// the armour stays opaque.
const GROUND = 14;
// The ground's dark anti-aliased rim, one pixel deep, goes with it.
const RIM = 44;
const flood = (lum) => {
  const ground = new Uint8Array(N);
  const stack = [];
  const push = (i) => {
    if (!ground[i] && lum[i] < GROUND) {
      ground[i] = 1;
      stack.push(i);
    }
  };
  for (let x = 0; x < FIG.width; x += 1) {
    push(x);
    push((FIG.height - 1) * FIG.width + x);
  }
  for (let y = 0; y < FIG.height; y += 1) {
    push(y * FIG.width);
    push(y * FIG.width + FIG.width - 1);
  }
  while (stack.length) {
    const i = stack.pop();
    const x = i % FIG.width;
    const y = (i - x) / FIG.width;
    if (x > 0) push(i - 1);
    if (x < FIG.width - 1) push(i + 1);
    if (y > 0) push(i - FIG.width);
    if (y < FIG.height - 1) push(i + FIG.width);
  }
  const grown = Uint8Array.from(ground);
  for (let i = 0; i < N; i += 1) {
    if (ground[i] || lum[i] >= RIM) continue;
    const x = i % FIG.width;
    const y = (i - x) / FIG.width;
    if (
      (x > 0 && ground[i - 1]) ||
      (x < FIG.width - 1 && ground[i + 1]) ||
      (y > 0 && ground[i - FIG.width]) ||
      (y < FIG.height - 1 && ground[i + FIG.width])
    )
      grown[i] = 1;
  }
  return grown;
};
const feather = async (field) => {
  const bytes = Buffer.alloc(N);
  for (let i = 0; i < N; i += 1) bytes[i] = field[i] * 255;
  const soft = await sharp(bytes, { raw: { width: FIG.width, height: FIG.height, channels: 1 } })
    .blur(0.6)
    .toColourspace("b-w")
    .raw()
    .toBuffer();
  if (soft.length !== N) throw new Error(`feather: ${soft.length} bytes for ${N} pixels`);
  return soft;
};

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
  const lum = new Uint8Array(N);
  for (let i = 0; i < N; i += 1) lum[i] = Math.max(data[i * 3], data[i * 3 + 1], data[i * 3 + 2]);
  const ground = await feather(flood(lum));
  const out = Buffer.alloc(N * 4);
  for (let i = 0; i < N; i += 1) {
    const r = data[i * 3];
    const g = data[i * 3 + 1];
    const b = data[i * 3 + 2];
    // The silhouette is the owner's cut-out of the figure (HIGH's alpha):
    // the forms share its pose to the pixel. Only real light beyond it (a
    // coloured glow, not the ground's grey haze) adds to it (owner,
    // 2026-10-11). Where this form's own shape falls short of HIGH's, or the
    // ground shows through the feathered edge, the ground is cut away rather
    // than carried along as a dark rim (owner, 2026-10-15: the cut-outs were
    // rough), and the edge is unpremultiplied against the black ground so no
    // dark fringe remains.
    const chroma = Math.min(1, (lum[i] - Math.min(r, g, b)) / 40);
    const lit = Math.min(1, Math.max(0, (lum[i] - 90) / 70)) * chroma;
    const alpha = Math.max(lit, base[i * 4 + 3] / 255) * (1 - ground[i] / 255);
    const lift = alpha > 0 && alpha < 0.98 ? Math.min(1.8, 1 / Math.max(alpha, 0.4)) : 1;
    out[i * 4] = Math.min(255, Math.round(r * lift));
    out[i * 4 + 1] = Math.min(255, Math.round(g * lift));
    out[i * 4 + 2] = Math.min(255, Math.round(b * lift));
    out[i * 4 + 3] = Math.round(alpha * 255);
  }
  const file = `${OUT}/${form}.webp`;
  await sharp(out, { raw: { width: FIG.width, height: FIG.height, channels: 4 } })
    .webp({ quality: 70, alphaQuality: 80, effort: 6 })
    .toFile(root(file));
  console.log(file);
}

// Unlike MAX/ULTRA, the new EXCELSIOR has an authored alpha channel.
// Its own pipeline retains dark armour and fine ribbons without a luminance key.
await buildExcelsior();
