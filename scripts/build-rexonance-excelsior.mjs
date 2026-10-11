// Preserve the owner's transparent PNG. This is only image fitting/encoding:
// never infer transparency from brightness (black armour must stay opaque).
import sharp from "sharp";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resolve } from "node:path";

const root = (path) => fileURLToPath(new URL(`../${path}`, import.meta.url));
export const EXCELSIOR_CUTOUT = "design/rexonance-suit/rexonance-excelsior-cutout-20261012.png";
export const EXCELSIOR_STAGE = "rider-rexonance-excelsior-cutout-20261012";

export function alphaBounds(data, width, height) {
  let x0 = width,
    y0 = height,
    x1 = -1,
    y1 = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] <= 8) continue;
      x0 = Math.min(x0, x);
      y0 = Math.min(y0, y);
      x1 = Math.max(x1, x);
      y1 = Math.max(y1, y);
    }
  }
  if (x1 < x0 || y1 < y0) throw new Error("An empty cutout cannot be fitted");
  return { x0, y0, x1, y1 };
}

export async function fitExcelsiorCutout(source, figure) {
  const input = await sharp(source).metadata();
  if (!input.hasAlpha)
    throw new Error("Use the supplied transparent EXCELSIOR, not a keyed background");
  const art = await sharp(source).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const base = await sharp(figure).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const a = alphaBounds(art.data, art.info.width, art.info.height);
  const b = alphaBounds(base.data, base.info.width, base.info.height);
  const pad = 120;
  const scale = (b.y1 - b.y0 + 1) / (a.y1 - a.y0 + 1);
  const width = Math.round(art.info.width * scale);
  const height = Math.round(art.info.height * scale);
  const left = Math.round((b.x0 + b.x1) / 2 - ((a.x0 + a.x1) / 2) * scale) + pad;
  const top = Math.round(b.y1 + 1 - (a.y1 + 1) * scale);
  const frame = { width: base.info.width + pad * 2, height: base.info.height };
  if (left < 0 || top < 0 || left + width > frame.width || top + height > frame.height) {
    throw new Error("EXCELSIOR must fit without clipping or shrinking its head-to-toe height");
  }
  const resized = await sharp(source)
    .resize(width, height, { kernel: "lanczos3" })
    .png()
    .toBuffer();
  const pixels = await sharp({ create: { ...frame, channels: 4, background: "#00000000" } })
    .composite([{ input: resized, left, top }])
    .png()
    .toBuffer();
  return { pixels, frame, placement: { left, top, width, height, scale } };
}

export async function buildExcelsior() {
  const source = root(EXCELSIOR_CUTOUT);
  const fitted = await fitExcelsiorCutout(
    source,
    root("public/rexonance-suit-20261010/figure.webp"),
  );
  await sharp(fitted.pixels)
    .webp({ quality: 90, alphaQuality: 100, effort: 6 })
    .toFile(root("public/rexonance-forms-20261011/excelsior-cutout-20261012.webp"));
  const { width } = await sharp(source).metadata();
  for (const size of [null, 640, 960, width]) {
    const output = `public/${EXCELSIOR_STAGE}${size ? `-delivery-${size}` : ""}.webp`;
    await sharp(source)
      .resize({ width: size ?? width, withoutEnlargement: true })
      .webp({ quality: size ? 84 : 90, alphaQuality: 100, effort: 6 })
      .toFile(root(output));
  }
  console.log("EXCELSIOR: owner alpha preserved", fitted.frame, fitted.placement);
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  await buildExcelsior();
}
