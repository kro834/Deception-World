import { Readable, Writable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createDeflate, createInflate } from "node:zlib";

/** Repack image containers without decoding/re-encoding their pixels. */
const crcTable = Uint32Array.from({ length: 256 }, (_, value) => {
  for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});
function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
function pngChunk(name: string, data: Uint8Array): Buffer {
  const chunk = Buffer.alloc(data.length + 12);
  chunk.writeUInt32BE(data.length);
  chunk.write(name, 4, "ascii");
  chunk.set(data, 8);
  chunk.writeUInt32BE(crc32(chunk.subarray(4, -4)), chunk.length - 4);
  return chunk;
}

/** Only orientation remains in EXIF; camera serials, GPS and thumbnails never survive. */
function orientationExif(orientation: number): Buffer {
  const exif = Buffer.alloc(26);
  exif.write("II", "ascii");
  exif.writeUInt16LE(42, 2);
  exif.writeUInt32LE(8, 4);
  exif.writeUInt16LE(1, 8);
  exif.writeUInt16LE(0x0112, 10);
  exif.writeUInt16LE(3, 12);
  exif.writeUInt32LE(1, 14);
  exif.writeUInt16LE(orientation, 18);
  return exif;
}
const hasOrientation = (orientation: number) => orientation >= 2 && orientation <= 8;
const invalid = () => new Error("Invalid image container");

function validateIcc(profile: Buffer) {
  // Retain the actual colour profile, not container padding outside its declared size.
  if (
    profile.length < 128 ||
    profile.readUInt32BE(0) !== profile.length ||
    profile.toString("ascii", 36, 40) !== "acsp"
  )
    throw invalid();
}

async function decodePngIcc(compressed: Buffer) {
  const inflate = createInflate();
  const chunks: Buffer[] = [];
  let length = 0;
  await pipeline(
    Readable.from([compressed]),
    inflate,
    new Writable({
      write(chunk: Buffer, _encoding, callback) {
        length += chunk.length;
        if (length > 4 * 1024 * 1024) return callback(invalid());
        chunks.push(chunk);
        callback();
      },
    }),
  );
  if (inflate.bytesWritten !== compressed.length) throw invalid();
  const profile = Buffer.concat(chunks, length);
  validateIcc(profile);
}

function pngScanlineBytes(
  width: number,
  height: number,
  depth: number,
  colour: number,
  interlace: number,
) {
  const channels = new Map([
    [0, 1],
    [2, 3],
    [3, 1],
    [4, 2],
    [6, 4],
  ]).get(colour);
  if (!channels) throw invalid();
  const passes = interlace
    ? [
        [0, 0, 8, 8],
        [4, 0, 8, 8],
        [0, 4, 4, 8],
        [2, 0, 4, 4],
        [0, 2, 2, 4],
        [1, 0, 2, 2],
        [0, 1, 1, 2],
      ]
    : [[0, 0, 1, 1]];
  return passes.reduce((total, [x, y, dx, dy]) => {
    const columns = Math.max(0, Math.ceil((width - x) / dx));
    const rows = Math.max(0, Math.ceil((height - y) / dy));
    return total + (columns && rows ? rows * (1 + Math.ceil((columns * channels * depth) / 8)) : 0);
  }, 0);
}

async function recompressPngData(data: Buffer, limit: number, maxInflated: number) {
  const chunks: Buffer[] = [];
  let size = 0;
  let inflated = 0;
  let larger = false;
  const inflate = createInflate();
  // Limit inflated scanlines independently of the image decoder's pixel bound.
  inflate.on("data", (chunk: Buffer) => {
    inflated += chunk.length;
    if (inflated > maxInflated) inflate.destroy(invalid());
  });
  await pipeline(
    Readable.from([data]),
    inflate,
    createDeflate({ level: 9 }),
    new Writable({
      write(chunk: Buffer, _encoding, callback) {
        size += chunk.length;
        if (size > limit) {
          larger = true;
          chunks.length = 0;
        }
        if (!larger) chunks.push(chunk);
        callback();
      },
    }),
  );
  if (inflated !== maxInflated || inflate.bytesWritten !== data.length) throw invalid();
  return larger ? data : Buffer.concat(chunks, size);
}

async function optimizePng(bytes: Buffer, orientation: number, width: number, height: number) {
  const kept: Buffer[] = [];
  const data: Buffer[] = [];
  let dataIndex = -1;
  let offset = 8;
  let ended = false;
  let colour = -1;
  let depth = 0;
  let interlace = 0;
  let paletteEntries = 0;
  let dataClosed = false;
  const seen = new Set<string>();
  const rendering = new Set([
    "IHDR",
    "PLTE",
    "tRNS",
    "cHRM",
    "gAMA",
    "iCCP",
    "sBIT",
    "sRGB",
    "cICP",
    "mDCV",
    "cLLI",
    "bKGD",
    "pHYs",
  ]);
  while (offset + 12 <= bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const end = offset + length + 12;
    if (end > bytes.length) throw invalid();
    const name = bytes.toString("ascii", offset + 4, offset + 8);
    const chunk = bytes.subarray(offset, end);
    const payload = chunk.subarray(8, -4);
    if (crc32(chunk.subarray(4, -4)) !== chunk.readUInt32BE(chunk.length - 4)) throw invalid();
    if (!/^[A-Za-z]{4}$/.test(name) || (colour < 0 && name !== "IHDR")) throw invalid();
    if (name === "IDAT") {
      if (dataClosed || (colour === 3 && !paletteEntries)) throw invalid();
      if (dataIndex < 0) {
        if (hasOrientation(orientation)) kept.push(pngChunk("eXIf", orientationExif(orientation)));
        dataIndex = kept.length;
        kept.push(Buffer.alloc(0));
      }
      data.push(chunk.subarray(8, -4));
    } else if (name === "IEND") {
      if (length !== 0) throw invalid();
      kept.push(chunk);
      ended = true;
      break;
    } else if (rendering.has(name)) {
      if (seen.has(name) || dataIndex >= 0) throw invalid();
      seen.add(name);
      if (name === "IHDR") {
        if (
          offset !== 8 ||
          length !== 13 ||
          payload.readUInt32BE(0) !== width ||
          payload.readUInt32BE(4) !== height
        )
          throw invalid();
        depth = payload[8];
        colour = payload[9];
        interlace = payload[12];
        const depths = new Map([
          [0, [1, 2, 4, 8, 16]],
          [2, [8, 16]],
          [3, [1, 2, 4, 8]],
          [4, [8, 16]],
          [6, [8, 16]],
        ]);
        if (!depths.get(colour)?.includes(depth) || payload[10] || payload[11] || interlace > 1)
          throw invalid();
      } else if (name === "PLTE") {
        if (
          colour === 0 ||
          colour === 4 ||
          !length ||
          length % 3 ||
          length > 768 ||
          (colour === 3 && length / 3 > 2 ** depth) ||
          seen.has("tRNS") ||
          seen.has("bKGD")
        )
          throw invalid();
        paletteEntries = length / 3;
      } else if (name === "tRNS") {
        if (!(
          (colour === 0 && length === 2) ||
          (colour === 2 && length === 6) ||
          (colour === 3 && length > 0 && length <= paletteEntries)
        ))
          throw invalid();
      } else if (name === "bKGD") {
        const expected = colour === 3 ? 1 : colour === 0 || colour === 4 ? 2 : 6;
        if (
          length !== expected ||
          (colour === 3 && (!paletteEntries || payload[0] >= paletteEntries))
        )
          throw invalid();
      } else if (name === "sBIT") {
        const expected = new Map([
          [0, 1],
          [2, 3],
          [3, 3],
          [4, 2],
          [6, 4],
        ]).get(colour);
        if (
          length !== expected ||
          seen.has("PLTE") ||
          payload.some((value) => value < 1 || value > (colour === 3 ? 8 : depth))
        )
          throw invalid();
      } else if (name === "iCCP") {
        const separator = payload.indexOf(0);
        if (separator < 1 || separator > 79 || payload[separator + 1] !== 0 || seen.has("PLTE"))
          throw invalid();
        const compressed = payload.subarray(separator + 2);
        await decodePngIcc(compressed);
        kept.push(pngChunk("iCCP", Buffer.concat([Buffer.from("icc\0\0", "ascii"), compressed])));
        offset = end;
        continue;
      } else {
        const fixedLengths = new Map([
          ["cHRM", 32],
          ["gAMA", 4],
          ["sRGB", 1],
          ["cICP", 4],
          ["mDCV", 24],
          ["cLLI", 8],
          ["pHYs", 9],
        ]);
        if (
          length !== fixedLengths.get(name) ||
          (name !== "pHYs" && seen.has("PLTE")) ||
          (name === "sRGB" && payload[0] > 3) ||
          (name === "pHYs" && payload[8] > 1)
        )
          throw invalid();
      }
      kept.push(chunk);
    } else if (name[0] >= "A" && name[0] <= "Z") {
      throw invalid();
    }
    if (dataIndex >= 0 && name !== "IDAT") dataClosed = true;
    offset = end;
  }
  if (!ended || dataIndex < 0) throw invalid();
  const originalData = Buffer.concat(data);
  // Exact scanline accounting includes all Adam7 passes and 16-bit samples.
  const optimized = await recompressPngData(
    originalData,
    originalData.length,
    pngScanlineBytes(width, height, depth, colour, interlace),
  );
  kept[dataIndex] = pngChunk("IDAT", optimized);
  return Buffer.concat([bytes.subarray(0, 8), ...kept]);
}

function optimizeJpeg(bytes: Buffer, orientation: number) {
  const chunks: Buffer[] = [bytes.subarray(0, 2)];
  const profiles = new Map<number, Buffer>();
  let profileCount = 0;
  if (hasOrientation(orientation)) {
    const exif = Buffer.concat([Buffer.from("Exif\0\0", "ascii"), orientationExif(orientation)]);
    const header = Buffer.from([255, 0xe1, 0, 0]);
    header.writeUInt16BE(exif.length + 2, 2);
    chunks.push(header, exif);
  }
  let offset = 2;
  while (offset < bytes.length) {
    const start = offset;
    if (bytes[offset++] !== 255) throw invalid();
    while (bytes[offset] === 255) offset++;
    const marker = bytes[offset++];
    if (marker === 0xd9) {
      if (profileCount) {
        if (profiles.size !== profileCount) throw invalid();
        const ordered = Array.from({ length: profileCount }, (_, i) => profiles.get(i + 1));
        if (ordered.some((profile) => !profile)) throw invalid();
        validateIcc(Buffer.concat(ordered as Buffer[]));
      }
      chunks.push(bytes.subarray(start, offset));
      return Buffer.concat(chunks);
    }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      chunks.push(bytes.subarray(start, offset));
      continue;
    }
    if (offset + 2 > bytes.length) throw invalid();
    const length = bytes.readUInt16BE(offset);
    const end = offset + length;
    if (length < 2 || end > bytes.length) throw invalid();
    const payload = bytes.subarray(offset + 2, end);
    const application = marker >= 0xe0 && marker <= 0xef;
    if (
      (marker === 0xe2 && payload.subarray(0, 4).equals(Buffer.from("MPF\0"))) ||
      (marker === 0xe1 &&
        /hdr-gain-map|hdrgm:|HDRGainMap|HDRGainMapVersion|urn:com:apple:photo:2020:aux:hdrgainmap/i.test(
          payload.toString("utf8"),
        ))
    )
      throw invalid();
    if (marker === 0xe0 && payload.subarray(0, 5).equals(Buffer.from("JFIF\0"))) {
      if (payload.length < 14 || payload.length !== 14 + 3 * payload[12] * payload[13])
        throw invalid();
      const jfif = Buffer.from(payload.subarray(0, 14));
      jfif[12] = 0;
      jfif[13] = 0;
      chunks.push(Buffer.from([255, 0xe0, 0, 16]), jfif);
    } else if (marker === 0xee && payload.subarray(0, 5).equals(Buffer.from("Adobe"))) {
      if (payload.length !== 12) throw invalid();
      chunks.push(bytes.subarray(start, end));
    } else if (marker === 0xe2 && payload.subarray(0, 12).equals(Buffer.from("ICC_PROFILE\0"))) {
      const sequence = payload[12];
      const count = payload[13];
      if (
        payload.length <= 14 ||
        !sequence ||
        !count ||
        sequence > count ||
        profiles.has(sequence) ||
        (profileCount && profileCount !== count)
      )
        throw invalid();
      profileCount = count;
      profiles.set(sequence, payload.subarray(14));
      chunks.push(bytes.subarray(start, end));
    } else if (!application && marker !== 0xfe) chunks.push(bytes.subarray(start, end));
    offset = end;
    if (marker !== 0xda) continue;
    // Keep every scan byte, including restart markers and stuffed 0xFF bytes.
    const scanStart = offset;
    while (offset < bytes.length) {
      if (bytes[offset] !== 255) {
        offset++;
        continue;
      }
      const next = bytes[offset + 1];
      if (next === 0 || (next >= 0xd0 && next <= 0xd7)) {
        offset += 2;
        continue;
      }
      if (next === 255) {
        offset++;
        continue;
      }
      break;
    }
    chunks.push(bytes.subarray(scanStart, offset));
  }
  throw invalid();
}

function webpChunk(name: string, data: Buffer): Buffer {
  const chunk = Buffer.alloc(8 + data.length + (data.length % 2));
  chunk.write(name, "ascii");
  chunk.writeUInt32LE(data.length, 4);
  chunk.set(data, 8);
  return chunk;
}
function optimizeWebp(bytes: Buffer, orientation: number) {
  const end = bytes.readUInt32LE(4) + 8;
  if (end > bytes.length) throw invalid();
  const chunks: Buffer[] = [];
  const rendering = new Set(["VP8 ", "VP8L", "ALPH", "ICCP"]);
  let offset = 12;
  let pixels = false;
  while (offset + 8 <= end) {
    const name = bytes.toString("ascii", offset, offset + 4);
    const length = bytes.readUInt32LE(offset + 4);
    const next = offset + 8 + length + (length % 2);
    if (next > end) throw invalid();
    if (name === "VP8X") {
      if (length !== 10) throw invalid();
      const extended = Buffer.from(bytes.subarray(offset + 8, offset + 18));
      extended[0] = (extended[0] & 0x32) | (hasOrientation(orientation) ? 0x08 : 0);
      extended.fill(0, 1, 4);
      chunks.push(webpChunk(name, extended));
    } else if (rendering.has(name)) {
      const payload = bytes.subarray(offset + 8, offset + 8 + length);
      if (name === "ICCP") validateIcc(payload);
      chunks.push(webpChunk(name, payload));
      if (name === "VP8 " || name === "VP8L") pixels = true;
    }
    offset = next;
  }
  if (!pixels || offset !== end) throw invalid();
  if (hasOrientation(orientation)) chunks.push(webpChunk("EXIF", orientationExif(orientation)));
  const body = Buffer.concat(chunks);
  const header = Buffer.from("RIFF\0\0\0\0WEBP", "ascii");
  header.writeUInt32LE(body.length + 4, 4);
  return Buffer.concat([header, body]);
}

export async function optimizeGalleryLosslessly(
  input: Uint8Array,
  format: "jpeg" | "png" | "webp",
  orientation: number,
  width: number,
  height: number,
): Promise<Buffer> {
  const bytes = Buffer.from(input.buffer, input.byteOffset, input.byteLength);
  if (format === "png") return optimizePng(bytes, orientation, width, height);
  if (format === "jpeg") return optimizeJpeg(bytes, orientation);
  return optimizeWebp(bytes, orientation);
}
