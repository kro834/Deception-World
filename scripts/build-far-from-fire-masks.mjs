// Bake the field and armour fractures from each delivered cutout. A direct
// seek or reversal can then use the same pixels without waiting for a fetch.
import { readFile, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { deflateRawSync, inflateRawSync } from "node:zlib";
import sharp from "sharp";
import { buildFireField, FIELD_D, FIELD_IN, FIRE_RECT } from "../src/lib/rexonance-fire/fire-field.js";
import { sampleNoise } from "../src/lib/far-from-fire-noise.ts";

const root = new URL("../public/", import.meta.url);
const destination = new URL("../src/lib/far-from-fire-masks.ts", import.meta.url);
const width = 96, height = 144;
const fw = 160, fh = 204, left = 32, top = 48;
const count = fw * fh;
const scale = (fw / FIRE_RECT.width) / height / 255;
const sources = {
  middle: "far-from-suit-20261023/figure.webp",
  high: "far-from-suit-20261023/high.webp",
  xhigh: "far-from-suit-20261023/xhigh.webp",
  max: "far-from-suit-20261023/max.webp",
  ultra: "far-from-ultra-20261022/ultra-interface-768.webp",
};

const fractures = [
  [.501, .045, .493, .189], [.48, .184, .558, .26], [.558, .26, .47, .40],
  [.472, .40, .536, .53], [.46, .48, .348, .70], [.348, .70, .30, .955],
  [.536, .51, .65, .69], [.65, .69, .703, .956], [.32, .146, .215, .356],
  [.215, .356, .193, .528], [.66, .15, .765, .338], [.765, .338, .828, .525],
  [.05, .362, .162, .29], [.844, .299, .967, .383],
].map(([x, y, ex, ey]) => {
  const dx = (ex - x) * 2 / 3, dy = ey - y;
  return { x, y, dx, dy, length: Math.hypot(dx, dy) };
});
function fractureGap(i) {
  const x = (i % fw + .5 - left) / width;
  const y = ((i / fw | 0) + .5 - top) / height;
  const jag = (sampleNoise(x * 14, y * 17) - .5) * .034 + (sampleNoise(x * 39, y * 53) - .5) * .012;
  let gap = .1;
  for (const branch of fractures) {
    const px = (x - branch.x) * 2 / 3, py = y - branch.y;
    const along = (px * branch.dx + py * branch.dy) / (branch.length * branch.length);
    if (along < -.03 || along > 1.03) continue;
    const taper = Math.max(.05, Math.min(1, (along + .03) * 12, (1.03 - along) * 12));
    gap = Math.min(gap, Math.abs((px * branch.dy - py * branch.dx) / branch.length + jag) / taper);
  }
  return gap;
}

const sharedGap = Buffer.alloc(count * 4);
const gaps = new Float64Array(count).fill(NaN);
const payloads = new Map();
const check = process.argv.includes("--check");
const expectedOrigins = new Map();
for (const [key, file] of Object.entries(sources)) {
  const cutout = await sharp(await readFile(new URL(file, root)))
    .resize(width, height, { fit: "fill" }).extractChannel("alpha").raw().toBuffer();
  const alpha = new Uint8Array(count);
  for (let y = 0; y < height; y++)
    alpha.set(cutout.subarray(y * width, (y + 1) * width), (y + top) * fw + left);
  const rgba = new Uint8Array(count * 4);
  if (!buildFireField(alpha, fw, fh, rgba)) throw new Error(`Empty fire silhouette: ${file}`);

  // Store each smooth byte plane as the residual from left + up - upper left.
  // Appending the sparse rim corrections and emitter indices keeps decoding
  // synchronous and bounds-checked by the generated buffer sizes.
  const planes = Buffer.alloc(count * 4);
  const rim = [], emitters = [];
  for (let i = 0; i < count; i++) {
    for (let c = 0; c < 4; c++) {
      const at = i * 4 + c;
      const l = i % fw ? rgba[at - 4] : 0;
      const u = i >= fw ? rgba[at - fw * 4] : 0;
      const ul = i % fw && i >= fw ? rgba[at - fw * 4 - 4] : 0;
      planes[count * c + i] = rgba[at] - l - u + ul;
    }
    const d = (rgba[i * 4] * FIELD_D - rgba[i * 4 + 3] * FIELD_IN) * scale;
    if (d > .007) continue;
    if (Number.isNaN(gaps[i])) {
      gaps[i] = fractureGap(i);
      sharedGap.writeFloatLE(gaps[i], i * 4);
    }
    if (d > 0) {
      const exact = Math.fround(gaps[i] + d * 3);
      const reconstructed = Math.fround(Math.fround(gaps[i]) + d * 3);
      if (reconstructed !== exact) rim.push([i, exact]);
    }
    if (d < 0 && gaps[i] < .006) emitters.push(i);
  }
  if (check) expectedOrigins.set(key, Float32Array.from(emitters.flatMap(i => [
    (i % fw + .5 - left) / width,
    ((i / fw | 0) + .5 - top) / height,
    rgba[i * 4 + 1] / 255,
  ])));
  const extra = Buffer.alloc(2 + rim.length * 6 + emitters.length * 2);
  extra.writeUInt16LE(rim.length);
  let offset = 2;
  for (const [i, gap] of rim) {
    extra.writeUInt16LE(i, offset);
    extra.writeFloatLE(gap, offset + 2);
    offset += 6;
  }
  let previous = 0;
  for (const i of emitters) {
    extra.writeUInt16LE(i - previous, offset);
    previous = i;
    offset += 2;
  }
  payloads.set(key, Buffer.concat([planes, extra]));
}
if (check) {
  // Equivalent DEFLATE streams can differ between zlib versions. Compare the
  // uncompressed fields for reproducible checks on Node 22 and 24.
  const saved = await import(destination.href);
  const decode = text => inflateRawSync(Buffer.from(text, "base64"));
  assert.deepEqual(
    [saved.MASK_WIDTH, saved.MASK_HEIGHT, saved.FIELD_WIDTH, saved.FIELD_HEIGHT, saved.FIELD_LEFT, saved.FIELD_TOP],
    [width, height, fw, fh, left, top],
  );
  assert.ok(decode(saved.FISSURES).equals(sharedGap), "Far From fracture distances are stale");
  assert.deepEqual(Object.keys(saved.FIRE_MASKS), [...payloads.keys()]);
  const { farFromFractureOrigins } = await import("../src/lib/far-from-flame-field.ts");
  for (const [key, payload] of payloads) {
    assert.ok(decode(saved.FIRE_MASKS[key]).equals(payload), `Baked fire field changed: ${key}`);
    assert.deepEqual(farFromFractureOrigins(key), expectedOrigins.get(key), `Baked fracture origins changed: ${key}`);
  }
} else {
  const encode = bytes => deflateRawSync(bytes, { level: 9 }).toString("base64");
  const entries = Array.from(payloads, ([key, data]) => '  ' + key + ': "' + encode(data) + '",');
  const source = [
    "// Generated by scripts/build-far-from-fire-masks.mjs from the delivered cutouts.",
    `export const MASK_WIDTH = ${width}, MASK_HEIGHT = ${height};`,
    `export const FIELD_WIDTH = ${fw}, FIELD_HEIGHT = ${fh}, FIELD_LEFT = ${left}, FIELD_TOP = ${top};`,
    'export const FISSURES = "' + encode(sharedGap) + '";',
    "export const FIRE_MASKS = {", ...entries, "} as const;", "",
  ].join("\n");
  await writeFile(destination, source);
}
