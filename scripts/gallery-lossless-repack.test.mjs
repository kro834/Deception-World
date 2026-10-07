import assert from "node:assert/strict";
import test from "node:test";
import { inflateSync } from "node:zlib";
import sharp from "sharp";
import { sanitizeGalleryImage } from "../src/lib/gallery.server.ts";

const privateMarker = Buffer.from("GPS_PRIVATE_TEST", "ascii");

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(name, data) {
  const chunk = Buffer.alloc(data.length + 12);
  chunk.writeUInt32BE(data.length, 0);
  chunk.write(name, 4, "ascii");
  data.copy(chunk, 8);
  chunk.writeUInt32BE(crc32(chunk.subarray(4, -4)), chunk.length - 4);
  return chunk;
}

function findPngChunk(bytes, target) {
  for (let offset = 8; offset + 12 <= bytes.length;) {
    const length = bytes.readUInt32BE(offset);
    const name = bytes.toString("ascii", offset + 4, offset + 8);
    if (name === target)
      return { offset, length, data: bytes.subarray(offset + 8, offset + 8 + length) };
    offset += length + 12;
  }
  return null;
}

function jpegApplication(marker, payload) {
  const segment = Buffer.alloc(payload.length + 4);
  segment[0] = 255;
  segment[1] = marker;
  segment.writeUInt16BE(payload.length + 2, 2);
  payload.copy(segment, 4);
  return segment;
}

function webpChunks(bytes) {
  const chunks = [];
  for (let offset = 12; offset + 8 <= bytes.length;) {
    const name = bytes.toString("ascii", offset, offset + 4);
    const length = bytes.readUInt32LE(offset + 4);
    chunks.push({ name, length, offset });
    offset += 8 + length + (length % 2);
  }
  return chunks;
}

async function baseImage(format) {
  const raw = Buffer.from([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 0, 255]);
  let image = sharp(raw, { raw: { width: 2, height: 2, channels: 4 } });
  if (format === "png") image = image.png();
  if (format === "jpeg") image = image.flatten({ background: "white" }).jpeg();
  if (format === "webp") image = image.webp({ lossless: true });
  return image.toBuffer();
}

async function rejectedImage(bytes, format) {
  await assert.rejects(sanitizeGalleryImage(bytes, `image/${format}`), { status: 400 });
}

function inflatedPngScanlines(bytes) {
  const parts = [];
  for (let offset = 8; offset + 12 <= bytes.length;) {
    const length = bytes.readUInt32BE(offset);
    const name = bytes.toString("ascii", offset + 4, offset + 8);
    if (name === "IDAT") parts.push(bytes.subarray(offset + 8, offset + 8 + length));
    offset += length + 12;
  }
  return inflateSync(Buffer.concat(parts));
}

test("lossless repacking keeps raster, ICC and orientation across PNG, JPEG and WebP variants", async () => {
  for (const [width, height, seed] of [
    [1, 1, 1],
    [7, 13, 2],
    [33, 17, 3],
    [127, 83, 4],
  ]) {
    const pixels = Buffer.alloc(width * height * 4);
    for (let index = 0; index < pixels.length; index++)
      pixels[index] = (index * 73 + seed * 41 + (index >> 3)) & 255;

    for (const format of ["png", "jpeg", "webp"]) {
      let encoder = sharp(pixels, { raw: { width, height, channels: 4 } })
        .withMetadata({ orientation: 6 })
        .withIccProfile("p3");
      if (format === "png")
        encoder = encoder.png({ progressive: seed % 2 === 0, compressionLevel: seed });
      else if (format === "jpeg")
        encoder = encoder.flatten({ background: "#fff" }).jpeg({
          quality: 87,
          progressive: seed % 2 === 0,
        });
      else encoder = encoder.webp({ lossless: seed % 2 === 0, quality: 87 });

      const source = await encoder.toBuffer();
      const result = await sanitizeGalleryImage(source, `image/${format}`);
      const before = await sharp(source).metadata();
      const after = await sharp(result.bytes).metadata();
      const label = `${format} ${width}x${height}`;
      assert.equal(result.width, height, label);
      assert.equal(result.height, width, label);
      assert.equal(after.orientation, before.orientation, label);
      assert.deepEqual(after.icc, before.icc, label);
      assert.deepEqual(
        await sharp(result.bytes).raw().toBuffer(),
        await sharp(source).raw().toBuffer(),
        label,
      );
      if (format === "png") {
        assert.equal(after.isProgressive, before.isProgressive, label);
        assert.deepEqual(inflatedPngScanlines(result.bytes), inflatedPngScanlines(source), label);
      }
    }
  }
});

test("PNG rejects a CRC-valid IEND carrying private payload", async () => {
  const original = await baseImage("png");
  const endOffset = original.length - 12;
  const doctored = Buffer.concat([
    original.subarray(0, endOffset),
    pngChunk("IEND", privateMarker),
  ]);
  await sharp(doctored).stats();
  await rejectedImage(doctored, "png");
});

test("PNG rejects a pHYs chunk with noncanonical extra payload", async () => {
  const original = await baseImage("png");
  const ihdrEnd = 8 + 25;
  const physical = Buffer.alloc(9);
  physical.writeUInt32BE(3780, 0);
  physical.writeUInt32BE(3780, 4);
  physical[8] = 1;
  const doctored = Buffer.concat([
    original.subarray(0, ihdrEnd),
    pngChunk("pHYs", Buffer.concat([physical, privateMarker])),
    original.subarray(ihdrEnd),
  ]);
  await sharp(doctored).stats();
  await rejectedImage(doctored, "png");
});

test("PNG retains a canonical pHYs rendering chunk and identical raster", async () => {
  const original = await baseImage("png");
  const existing = findPngChunk(original, "pHYs");
  assert.ok(existing);
  const physical = Buffer.alloc(9);
  physical.writeUInt32BE(3780, 0);
  physical.writeUInt32BE(3780, 4);
  physical[8] = 1;
  const doctored = Buffer.concat([
    original.subarray(0, existing.offset),
    pngChunk("pHYs", physical),
    original.subarray(existing.offset + existing.length + 12),
  ]);
  const result = await sanitizeGalleryImage(doctored, "image/png");
  assert.ok(result.bytes.includes(pngChunk("pHYs", physical)));
  assert.deepEqual(
    await sharp(result.bytes).raw().toBuffer(),
    await sharp(doctored).raw().toBuffer(),
  );
});

test("PNG fixes the iCCP profile name to icc while preserving the ICC itself", async () => {
  const original = await sharp({
    create: { width: 2, height: 2, channels: 4, background: "#aabbcc" },
  })
    .withIccProfile("p3")
    .png()
    .toBuffer();
  const profile = findPngChunk(original, "iCCP");
  assert.ok(profile);
  assert.equal(profile.data.indexOf(0), 3);
  const doctoredData = Buffer.from(profile.data);
  doctoredData.write("GPS", 0, "ascii");
  const doctored = Buffer.concat([
    original.subarray(0, profile.offset),
    pngChunk("iCCP", doctoredData),
    original.subarray(profile.offset + profile.length + 12),
  ]);
  const originalIcc = (await sharp(doctored).metadata()).icc;
  const result = await sanitizeGalleryImage(doctored, "image/png");
  const cleanProfile = findPngChunk(result.bytes, "iCCP");
  assert.ok(cleanProfile);
  assert.equal(cleanProfile.data.subarray(0, cleanProfile.data.indexOf(0)).toString(), "icc");
  assert.deepEqual((await sharp(result.bytes).metadata()).icc, originalIcc);
  assert.deepEqual(
    await sharp(result.bytes).raw().toBuffer(),
    await sharp(doctored).raw().toBuffer(),
  );
});

test("JPEG removes JFIF embedded thumbnail bytes while keeping the raster", async () => {
  const original = await baseImage("jpeg");
  const jfif = Buffer.concat([
    Buffer.from([74, 70, 73, 70, 0, 1, 2, 0, 0, 1, 0, 1, 1, 1]),
    privateMarker.subarray(0, 3),
  ]);
  const doctored = Buffer.concat([
    original.subarray(0, 2),
    jpegApplication(0xe0, jfif),
    original.subarray(2),
  ]);
  await sharp(doctored).stats();
  const result = await sanitizeGalleryImage(doctored, "image/jpeg");
  assert.equal(result.bytes.includes(privateMarker.subarray(0, 3)), false);
  assert.deepEqual(
    await sharp(result.bytes).raw().toBuffer(),
    await sharp(doctored).raw().toBuffer(),
  );
});

test("JPEG rejects Adobe APP14 payload with extra private bytes", async () => {
  const original = await baseImage("jpeg");
  const adobe = Buffer.concat([Buffer.from("Adobe\0\0\0\0\0\0\0", "ascii"), privateMarker]);
  const doctored = Buffer.concat([
    original.subarray(0, 2),
    jpegApplication(0xee, adobe),
    original.subarray(2),
  ]);
  await sharp(doctored).stats();
  await rejectedImage(doctored, "jpeg");
});

test("JPEG retains a canonical Adobe APP14 transform marker and identical raster", async () => {
  const original = await baseImage("jpeg");
  const adobe = Buffer.from("Adobe\0\0\0\0\0\0\0", "ascii");
  const doctored = Buffer.concat([
    original.subarray(0, 2),
    jpegApplication(0xee, adobe),
    original.subarray(2),
  ]);
  const result = await sanitizeGalleryImage(doctored, "image/jpeg");
  assert.ok(result.bytes.includes(jpegApplication(0xee, adobe)));
  assert.deepEqual(
    await sharp(result.bytes).raw().toBuffer(),
    await sharp(doctored).raw().toBuffer(),
  );
});

test("JPEG rejects MPF multi-picture metadata before stripping secondary images", async () => {
  const original = await baseImage("jpeg");
  const mpf = jpegApplication(0xe2, Buffer.concat([Buffer.from("MPF\0", "ascii"), privateMarker]));
  const doctored = Buffer.concat([original.subarray(0, 2), mpf, original.subarray(2), original]);
  await sharp(doctored).stats();
  await rejectedImage(doctored, "jpeg");
});

test("JPEG rejects HDR gain-map XMP instead of losing auxiliary rendering data", async () => {
  const original = await baseImage("jpeg");
  const xmp = Buffer.from(
    'http://ns.adobe.com/xap/1.0/\0<x:xmpmeta xmlns:hdrgm="http://ns.adobe.com/hdr-gain-map/1.0/" hdrgm:GainMap="1"/>',
    "utf8",
  );
  const doctored = Buffer.concat([
    original.subarray(0, 2),
    jpegApplication(0xe1, xmp),
    original.subarray(2),
  ]);
  await sharp(doctored).stats();
  await rejectedImage(doctored, "jpeg");
});

test("WebP zeroes VP8X reserved bytes without changing ICC or raster", async () => {
  const original = await sharp({
    create: { width: 3, height: 3, channels: 4, background: "#b4c8d6" },
  })
    .withIccProfile("p3")
    .webp({ lossless: true })
    .toBuffer();
  const vp8x = webpChunks(original).find((chunk) => chunk.name === "VP8X");
  assert.ok(vp8x);
  const doctored = Buffer.from(original);
  privateMarker.copy(doctored, vp8x.offset + 9, 0, 3);
  await sharp(doctored).stats();
  const result = await sanitizeGalleryImage(doctored, "image/webp");
  const cleanVp8x = webpChunks(result.bytes).find((chunk) => chunk.name === "VP8X");
  assert.ok(cleanVp8x);
  assert.deepEqual(
    result.bytes.subarray(cleanVp8x.offset + 9, cleanVp8x.offset + 12),
    Buffer.alloc(3),
  );
  assert.deepEqual(
    (await sharp(result.bytes).metadata()).icc,
    (await sharp(doctored).metadata()).icc,
  );
  assert.deepEqual(
    await sharp(result.bytes).raw().toBuffer(),
    await sharp(doctored).raw().toBuffer(),
  );
});

test("WebP zeroes noncanonical RIFF padding of a retained odd-size VP8L chunk", async () => {
  const original = await sharp(Buffer.from([45, 90, 170, 255]), {
    raw: { width: 1, height: 1, channels: 4 },
  })
    .webp({ lossless: true })
    .toBuffer();
  const vp8l = webpChunks(original).find((chunk) => chunk.name === "VP8L");
  assert.ok(vp8l);
  assert.equal(vp8l.length % 2, 1);
  const doctored = Buffer.from(original);
  doctored[vp8l.offset + 8 + vp8l.length] = 0x47;
  await sharp(doctored).stats();
  const result = await sanitizeGalleryImage(doctored, "image/webp");
  const cleanVp8l = webpChunks(result.bytes).find((chunk) => chunk.name === "VP8L");
  assert.ok(cleanVp8l);
  assert.equal(result.bytes[cleanVp8l.offset + 8 + cleanVp8l.length], 0);
  assert.deepEqual(
    await sharp(result.bytes).raw().toBuffer(),
    await sharp(doctored).raw().toBuffer(),
  );
});
