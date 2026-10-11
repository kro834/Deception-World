import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import sharp from "sharp";
import {
  alphaBounds,
  EXCELSIOR_CUTOUT,
  EXCELSIOR_STAGE,
  fitExcelsiorCutout,
} from "./build-rexonance-excelsior.mjs";

const file = (path) => new URL(`../${path}`, import.meta.url);
test("EXCELSIOR is the supplied authored alpha, not a brightness-keyed black suit", async () => {
  const source = await readFile(file(EXCELSIOR_CUTOUT));
  const { data, info } = await sharp(source).raw().toBuffer({ resolveWithObject: true });
  assert.equal(info.channels, 4);
  assert.equal(info.width, 1022);
  assert.equal(info.height, 1880);
  let darkOpaque = 0,
    transparent = 0,
    softEdge = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (Math.max(data[i], data[i + 1], data[i + 2]) < 30 && data[i + 3] > 245) darkOpaque++;
    if (data[i + 3] === 0) transparent++;
    if (data[i + 3] > 0 && data[i + 3] < 255) softEdge++;
  }
  assert.ok(darkOpaque > 10000, "dark armour remains solid");
  assert.ok(transparent > 10000 && softEdge > 1000, "authored silhouette and antialiased edges");
});

test("EXCELSIOR keeps head-to-toe scale, ribbon room and the exact fitted alpha", async () => {
  const source = await readFile(file(EXCELSIOR_CUTOUT));
  const figure = await readFile(file("public/rexonance-suit-20261010/figure.webp"));
  const { pixels, frame } = await fitExcelsiorCutout(source, figure);
  assert.deepEqual(frame, { width: 811, height: 1040 });
  const expected = await sharp(pixels).ensureAlpha().raw().toBuffer();
  const delivered = await sharp(
    await readFile(file("public/rexonance-forms-20261011/excelsior-cutout-20261012.webp")),
  )
    .ensureAlpha()
    .raw()
    .toBuffer();
  assert.equal(delivered.length, expected.length);
  for (let i = 3; i < expected.length; i += 4) {
    assert.equal(delivered[i], expected[i], `alpha at pixel ${(i - 3) / 4}`);
  }
  const body = alphaBounds(delivered, frame.width, frame.height);
  const base = await sharp(figure).ensureAlpha().raw().toBuffer();
  const baseBody = alphaBounds(base, 571, 1040);
  assert.ok(Math.abs(body.y0 - baseBody.y0) <= 1);
  assert.ok(Math.abs(body.y1 - baseBody.y1) <= 1);
  assert.ok(body.x0 > 0 && body.x1 < 810, "ribbons are inside the padded sheet");
});

test("new stage delivery sizes are real, never upscaled, and retain transparency", async () => {
  for (const size of [null, 640, 960, 1022]) {
    const bytes = await readFile(
      file(`public/${EXCELSIOR_STAGE}${size ? `-delivery-${size}` : ""}.webp`),
    );
    const m = await sharp(bytes).metadata();
    assert.equal(m.width, size ?? 1022);
    assert.equal(m.hasAlpha, true);
    assert.ok(bytes.length < 600000);
  }
});

test("EXCELSIOR fitting rejects absent alpha and an empty silhouette", async () => {
  assert.throws(() => alphaBounds(Buffer.alloc(16), 2, 2), /empty cutout/);
  const opaque = await sharp({ create: { width: 2, height: 2, channels: 3, background: "#000" } })
    .png()
    .toBuffer();
  await assert.rejects(fitExcelsiorCutout(opaque, opaque), /transparent EXCELSIOR/);
});
