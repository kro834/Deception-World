// Builds the Rexonance base figure for the scroll suit-up (owner,
// 2026-10-16): the owner's art of Rexonance without its ornaments (no tail,
// no ribbons), in the suit figure's frame (571 x 1040, pixel for pixel over
// public/rexonance-suit-20261023/figure.webp). The scene assembles the armour
// whole from it, and the ornaments then form over the armour from the full art.
// Its alpha (2026-10-23, owner: 「SAMを用いて、切り抜きが甘い部分などを
// ブラッシュアップ」): the figure's, less what SAM's masks say the base does not
// show (design/rexonance-suit/sam-masks-20261023/base.png: where an ornament
// alone was) — no longer a flood of its black ground, which also took the black
// plates connected to it, so the armour showed holes while it formed
// (「生成途中で穴が空いてボロボロに見える」). Without the masks, the flood.
//
// The art shares the owner's cut-out's frame (1022 x 1880), which the suit
// build places on the full artwork at 999 x 1835, (30, 51) in its 1055 x 2000
// source; the figure is that source's crop (20, 41, 1019 x 1855) at 571 x
// 1040 (scripts/build-rexonance-suit.mjs, scripts/build-rexonance-forms.mjs).
// Run: node scripts/build-rexonance-base.mjs
import sharp from "sharp";
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = (path) => fileURLToPath(new URL(`../${path}`, import.meta.url));
const SOURCE = { width: 1055, height: 2000 };
const CUT = { width: 999, height: 1835, left: 30, top: 51 };
const CROP = { left: 20, top: 41, width: 1019, height: 1855 };
const FIG = { width: 571, height: 1040 };
const N = FIG.width * FIG.height;
const OUT = "public/rexonance-suit-base-20261023/base.webp";
const FIGURE = "public/rexonance-suit-20261023/figure.webp";
const SAM_BASE = "design/rexonance-suit/sam-masks-20261023/base.png";

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
const figure = await sharp(root(FIGURE))
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

// SAM's mask of what the base shows, in the figure's frame.
const shown = existsSync(root(SAM_BASE))
  ? await sharp(root(SAM_BASE))
      .extract(CROP)
      .resize(FIG.width, FIG.height, { fit: "fill", kernel: "lanczos3" })
      .extractChannel(0)
      .raw()
      .toBuffer()
  : null;
const alphaOf = (i) =>
  shown
    ? (figure[i * 4 + 3] / 255) * (shown[i] / 255)
    : Math.min(figure[i * 4 + 3] / 255, 1 - soft[i] / 255);
// The edge's colours: a soft pixel's own light unpremultiplied against the
// black and, the fainter it is, the nearer the solid colour beside it (a
// normalised blur of the solid pixels): no dark rim (as the suit's build).
const blur1 = async (bytes) => {
  const blurred = await sharp(bytes, { raw: { width: FIG.width, height: FIG.height, channels: 1 } })
    .blur(1.2)
    .raw()
    .toBuffer();
  // libvips may hand a one-band blur back as three bands.
  const step = blurred.length / N;
  return Float32Array.from({ length: N }, (_, i) => blurred[i * step] / 255);
};
const solidMask = Buffer.alloc(N);
for (let i = 0; i < N; i += 1) solidMask[i] = alphaOf(i) >= 0.96 ? 255 : 0;
const weight = await blur1(solidMask);
const nearChannels = [];
for (let c = 0; c < 3; c += 1)
  nearChannels.push(await blur1(Buffer.from(Array.from({ length: N }, (_, i) => (solidMask[i] ? data[i * 3 + c] : 0)))));
const out = Buffer.alloc(N * 4);
let opaque = 0;
for (let i = 0; i < N; i += 1) {
  // Never beyond the figure's own silhouette (the owner's cut-out).
  const alpha = alphaOf(i);
  const firmness = Math.min(1, Math.max(0, (alpha - 0.3) / 0.6));
  const firm = firmness * firmness * (3 - 2 * firmness);
  const lift = alpha > 0 && alpha < 0.96 ? Math.min(2.4, 1 / Math.max(alpha, 0.25)) : 1;
  const w = weight[i];
  for (let c = 0; c < 3; c += 1) {
    const own = Math.min(255, data[i * 3 + c] * lift);
    const beside = w > 0.04 ? Math.min(255, (nearChannels[c][i] / w) * 255) : own;
    out[i * 4 + c] = Math.round(alpha >= 0.96 || w <= 0.04 ? own : beside + (own - beside) * firm);
  }
  out[i * 4 + 3] = Math.round(alpha * 255);
  if (alpha > 0.5) opaque += 1;
}
await mkdir(dirname(root(OUT)), { recursive: true });
await sharp(out, { raw: { width: FIG.width, height: FIG.height, channels: 4 } })
  .webp({ quality: 76, alphaQuality: 70, effort: 6, smartSubsample: true })
  .toFile(root(OUT));
console.log(OUT, `${opaque} opaque px`);
