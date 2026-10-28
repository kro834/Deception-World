/** Authoring aid only: compare the large outline, not artistic quality.
 * Requires a transparent, orthographic Blender render without text/floor.
 * node scripts/compare-dogs-silhouette.mjs --view=front --render=/path/clay-front.png
 */
import sharp from "sharp";
import { resolve } from "node:path";

const arg = (key) =>
  process.argv
    .find((value) => value.startsWith(`--${key}=`))
    ?.split("=")
    .slice(1)
    .join("=");
const view = arg("view") ?? "front",
  render = arg("render");
if (!["front", "back"].includes(view) || !render)
  throw Error("Use --view=front|back --render=/path/to/transparent.png");
const reference = resolve(
  import.meta.dirname,
  "../public/dogs-archive-20261028/reference/guardian-turnaround.png",
);
const refInfo = await sharp(reference).metadata();
const crop = {
  left: view === "back" ? Math.floor(refInfo.width / 2) : 0,
  top: 0,
  width: Math.floor(refInfo.width / 2),
  height: Math.floor(refInfo.height * 0.484),
};
const referenceRaw = await sharp(reference)
  .extract(crop)
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });
const renderRaw = await sharp(render).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
if (
  !Array.from({ length: renderRaw.data.length / 4 }, (_, i) => renderRaw.data[i * 4 + 3]).some(
    (alpha) => alpha < 16,
  )
)
  throw Error("The render must have a transparent background");

function outline({ data, info }, isReference) {
  const { width, height } = info;
  const mask = new Uint8Array(width * height);
  let x0 = width,
    y0 = height,
    x1 = -1,
    y1 = -1,
    area = 0;
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const foreground = isReference
        ? Math.min(data[i], data[i + 1], data[i + 2]) < 185
        : data[i + 3] > 128;
      if (!foreground) continue;
      mask[y * width + x] = 1;
      area++;
      x0 = Math.min(x0, x);
      x1 = Math.max(x1, x);
      y0 = Math.min(y0, y);
      y1 = Math.max(y1, y);
    }
  if (!area) throw Error("Empty silhouette");
  const w = x1 - x0 + 1,
    h = y1 - y0 + 1,
    grid = new Uint8Array(256 * 256);
  const scale = 240 / h,
    cx = (x0 + x1) / 2,
    cy = (y0 + y1) / 2;
  for (let y = 0; y < 256; y++)
    for (let x = 0; x < 256; x++) {
      const sx = Math.round((x - 128) / scale + cx),
        sy = Math.round((y - 128) / scale + cy);
      if (sx >= 0 && sx < width && sy >= 0 && sy < height)
        grid[y * 256 + x] = mask[sy * width + sx];
    }
  const bands = Array.from({ length: 9 }, (_, index) => {
    const y = Math.round(y0 + (h * (index + 1)) / 10);
    let left = width,
      right = -1;
    for (let x = 0; x < width; x++)
      if (mask[y * width + x]) {
        left = Math.min(left, x);
        right = Math.max(right, x);
      }
    return { heightFraction: (index + 1) / 10, widthOverHeight: Math.max(0, right - left + 1) / h };
  });
  return { grid, bounds: { x: x0, y: y0, width: w, height: h }, widthOverHeight: w / h, bands };
}
const expected = outline(referenceRaw, true),
  actual = outline(renderRaw, false);
let intersection = 0,
  union = 0;
for (let i = 0; i < expected.grid.length; i++) {
  intersection += expected.grid[i] && actual.grid[i];
  union += expected.grid[i] || actual.grid[i];
}
const summary = ({ bounds, widthOverHeight, bands }) => ({ bounds, widthOverHeight, bands });
console.log(
  JSON.stringify(
    {
      view,
      purpose: "outline alignment only; not a quality verdict",
      alignment: "same height, bounding-box centres aligned",
      intersectionOverUnion: intersection / union,
      reference: summary(expected),
      render: summary(actual),
    },
    null,
    2,
  ),
);
