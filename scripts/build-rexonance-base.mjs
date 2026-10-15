// Builds the Rexonance base figure for the scroll suit-up (owner,
// 2026-10-16): the owner's art of Rexonance without its ornaments (no tail,
// no ribbons), in the suit figure's frame (571 x 1040, pixel for pixel over
// public/rexonance-suit-20261010/figure.webp), with an alpha from the black
// ground. The scene assembles the armour whole from it, and the ornaments
// then form over the armour from the full art.
//
// The art shares the owner's cut-out's frame (1022 x 1880), which the suit
// build places on the full artwork at 999 x 1835, (30, 51) in its 1055 x 2000
// source; the figure is that source's crop (20, 41, 1019 x 1855) at 571 x
// 1040 (scripts/build-rexonance-suit.mjs, scripts/build-rexonance-forms.mjs).
// Run: node scripts/build-rexonance-base.mjs
import sharp from "sharp";
import { fileURLToPath } from "node:url";

const root = (path) => fileURLToPath(new URL(`../${path}`, import.meta.url));
const SOURCE = { width: 1055, height: 2000 };
const CUT = { width: 999, height: 1835, left: 30, top: 51 };
const CROP = { left: 20, top: 41, width: 1019, height: 1855 };
const FIG = { width: 571, height: 1040 };
const N = FIG.width * FIG.height;
const OUT = "public/rexonance-suit-20261016/base.webp";

// The black ground: near-black pixels connected to the image edges, with
// their dark anti-aliased rim, feathered (as the MAX/ULTRA figures are cut).
const GROUND = 14;
const RIM = 44;

const cut = await sharp(root("design/rexonance-suit/rexonance-base-20261016.jpg"))
  .resize(CUT.width, CUT.height, { fit: "fill", kernel: "lanczos3" })
  .removeAlpha()
  .png()
  .toBuffer();
const placed = await sharp({
  create: { width: SOURCE.width, height: SOURCE.height, channels: 3, background: "#000" },
})
  .composite([{ input: cut, left: CUT.left, top: CUT.top }])
  .png()
  .toBuffer();
const { data } = await sharp(placed)
  .extract(CROP)
  .resize(FIG.width, FIG.height, { fit: "fill", kernel: "lanczos3" })
  .removeAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });
const figure = await sharp(root("public/rexonance-suit-20261010/figure.webp"))
  .ensureAlpha()
  .raw()
  .toBuffer();

const lum = new Uint8Array(N);
for (let i = 0; i < N; i += 1) lum[i] = Math.max(data[i * 3], data[i * 3 + 1], data[i * 3 + 2]);
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
const bytes = Buffer.alloc(N);
for (let i = 0; i < N; i += 1) bytes[i] = grown[i] * 255;
const soft = await sharp(bytes, { raw: { width: FIG.width, height: FIG.height, channels: 1 } })
  .blur(0.6)
  .toColourspace("b-w")
  .raw()
  .toBuffer();
if (soft.length !== N) throw new Error(`feather: ${soft.length} bytes for ${N} pixels`);

const out = Buffer.alloc(N * 4);
let opaque = 0;
for (let i = 0; i < N; i += 1) {
  // Never beyond the figure's own silhouette (the owner's cut-out), and
  // never the black ground; the edge unpremultiplied against the ground.
  const alpha = Math.min(figure[i * 4 + 3] / 255, 1 - soft[i] / 255);
  const lift = alpha > 0 && alpha < 0.98 ? Math.min(1.8, 1 / Math.max(alpha, 0.4)) : 1;
  out[i * 4] = Math.min(255, Math.round(data[i * 3] * lift));
  out[i * 4 + 1] = Math.min(255, Math.round(data[i * 3 + 1] * lift));
  out[i * 4 + 2] = Math.min(255, Math.round(data[i * 3 + 2] * lift));
  out[i * 4 + 3] = Math.round(alpha * 255);
  if (alpha > 0.5) opaque += 1;
}
await sharp(out, { raw: { width: FIG.width, height: FIG.height, channels: 4 } })
  .webp({ quality: 76, alphaQuality: 70, effort: 6, smartSubsample: true })
  .toFile(root(OUT));
console.log(OUT, `${opaque} opaque px`);
