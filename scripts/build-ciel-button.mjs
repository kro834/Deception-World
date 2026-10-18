import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import sharp from "sharp";

/** Remove EXIF/XMP/IPTC/comments without re-encoding a JPEG's picture or ICC. */
export function stripJpegPrivateMetadata(bytes) {
  if (bytes.readUInt16BE(0) !== 0xffd8) throw new Error("Expected a JPEG image");
  const parts = [bytes.subarray(0, 2)];
  let offset = 2;
  while (offset < bytes.length) {
    const start = offset;
    if (bytes[offset] !== 0xff) throw new Error("Invalid JPEG marker");
    while (bytes[offset] === 0xff) offset++;
    const marker = bytes[offset++];
    if (marker === 0xda || marker === 0xd9) {
      parts.push(bytes.subarray(start));
      return Buffer.concat(parts);
    }
    const length = bytes.readUInt16BE(offset);
    if (length < 2 || offset + length > bytes.length) throw new Error("Invalid JPEG segment");
    const end = offset + length;
    if (![0xe1, 0xed, 0xfe].includes(marker)) parts.push(bytes.subarray(start, end));
    offset = end;
  }
  throw new Error("Missing JPEG scan");
}

async function main() {
  const output = new URL("../public/ciel-button-20261018.jpeg", import.meta.url);
  const input = readFileSync(process.argv[2] || output);
  const metadata = await sharp(input).metadata();
  if (metadata.orientation && metadata.orientation !== 1)
    throw new Error("Normalize orientation before using this lossless metadata-only copier");
  const cleaned = stripJpegPrivateMetadata(input);
  const before = await sharp(input).raw().toBuffer();
  const after = await sharp(cleaned).raw().toBuffer();
  if (!before.equals(after)) throw new Error("Metadata removal changed decoded image pixels");
  writeFileSync(output, cleaned);
  for (const width of [144, 216, 360]) {
    const target = new URL(`../public/ciel-button-20261018-${width}.webp`, import.meta.url);
    const result = await sharp(cleaned)
      .resize(width, width, { fit: "contain", background: "#fff" })
      .webp({ quality: 90, effort: 6 })
      .toFile(target.pathname);
    console.log(`${width}px: ${result.size} bytes`);
  }
  console.log("Private metadata removed; decoded picture unchanged");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
