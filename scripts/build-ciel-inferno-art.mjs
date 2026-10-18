#!/usr/bin/env node
// Preserve the supplied illustration; resize only, strip private metadata.
// node scripts/build-ciel-inferno-art.mjs [--source=/absolute/attachment.png] [--check]
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import sharp from "sharp";
import prettier from "prettier";

const root = resolve(import.meta.dirname, "..");
const reference = "design/ciel-inferno-reference-20261019.png";
const destination = resolve(root, "public/ciel-inferno-20261019");
const manifestPath = join(destination, "artwork-manifest.json");
const widths = [216, 720, 1080];
const budgets = { 216: 40000, 720: 260000, 1080: 480000 };
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const recipe = {
  path: "scripts/build-ciel-inferno-art.mjs",
  sha256: digest(await readFile(import.meta.filename)),
};
const input = process.argv.find((arg) => arg.startsWith("--source="))?.slice(9);
const check = process.argv.includes("--check");
const source = resolve(root, reference);

if (check) {
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  assert.deepEqual(manifest.recipe, recipe);
  assert.equal(digest(await readFile(source)), manifest.source.sha256);
  for (const asset of manifest.assets) {
    const bytes = await readFile(join(root, "public", asset.path));
    const metadata = await sharp(bytes).metadata();
    assert.equal(digest(bytes), asset.sha256);
    assert.equal(bytes.length, asset.bytes);
    assert.equal(asset.budgetBytes, budgets[asset.width]);
    assert.ok(bytes.length <= asset.budgetBytes);
    assert.equal(metadata.width, asset.width);
    assert.equal(metadata.height, asset.width);
    assert.ok(!metadata.exif && !metadata.xmp && !metadata.iptc);
  }
  assert.deepEqual(
    manifest.assets.map(({ width }) => width),
    widths,
  );
  console.log(JSON.stringify({ valid: true, assets: manifest.assets }));
  process.exit(0);
}

await mkdir(resolve(root, "design"), { recursive: true });
if (input) {
  const clean = await sharp(await readFile(resolve(input)))
    .rotate()
    .png()
    .toBuffer();
  await writeFile(source, clean);
}
const referenceBytes = await readFile(source);
const metadata = await sharp(referenceBytes).metadata();
assert.equal(metadata.width, metadata.height, "keep the supplied square composition");
assert.ok(metadata.width >= Math.max(...widths));
await mkdir(destination, { recursive: true });
const assets = [];
for (const width of widths) {
  const path = `/ciel-inferno-20261019/ciel-${width}.webp`;
  const bytes = await sharp(referenceBytes)
    .resize(width, width, { fit: "inside", kernel: "lanczos3" })
    .webp({ quality: 90, alphaQuality: 100, effort: 6 })
    .toBuffer();
  assert.ok(
    bytes.length <= budgets[width],
    `artwork ${width} must stay within its delivery budget`,
  );
  await writeFile(resolve(root, "public", path.slice(1)), bytes);
  assets.push({
    path,
    width,
    bytes: bytes.length,
    budgetBytes: budgets[width],
    sha256: digest(bytes),
  });
}
const manifest = {
  version: 1,
  recipe,
  source: { path: reference, width: metadata.width, sha256: digest(referenceBytes) },
  processing:
    "owner-supplied illustration; original composition; resize only; private metadata removed",
  assets,
};
await writeFile(
  manifestPath,
  await prettier.format(JSON.stringify(manifest), {
    ...(await prettier.resolveConfig(root)),
    parser: "json",
  }),
);
console.log(JSON.stringify(manifest));
