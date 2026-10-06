/** Gallery input rules are enforced again on the server, independently of the browser. */
export const GALLERY_MAX_INPUT_BYTES = 10 * 1024 * 1024;
export const GALLERY_MAX_IMAGE_BYTES = 3 * 1024 * 1024;
export const GALLERY_MAX_PIXELS = 40_000_000;
export const GALLERY_MAX_EDGE = 2400;
export const GALLERY_MAX_REQUEST_BYTES = GALLERY_MAX_INPUT_BYTES + 64 * 1024;

export class GalleryError extends Error {
  status: number;
  current?: { title: string; version: number };
  constructor(status: number, message: string, current?: { title: string; version: number }) {
    super(message);
    this.status = status;
    this.current = current;
  }
}

export function validGalleryPostId(id: string): boolean {
  return /^u-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
}

export function validGalleryArtworkId(id: string): boolean {
  return /^g(?:0[1-9]|[1-6][0-9]|7[0-9])$/.test(id) || validGalleryPostId(id);
}

export function validateGalleryTitle(value: unknown): {
  artworkId: string;
  title: string;
  expectedVersion: number;
} {
  if (!value || typeof value !== "object")
    throw new GalleryError(400, "作品名の入力を確認してください。");
  const { artworkId, title, expectedVersion } = value as Record<string, unknown>;
  if (typeof artworkId !== "string" || !validGalleryArtworkId(artworkId))
    throw new GalleryError(400, "作品を確認できませんでした。");
  if (
    typeof title !== "string" ||
    title.trim().length > 120 ||
    Array.from(title).some(
      (character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
    )
  )
    throw new GalleryError(400, "作品名は120文字以内の1行で入力してください。");
  if (!Number.isSafeInteger(expectedVersion) || Number(expectedVersion) < 0)
    throw new GalleryError(400, "作品名の更新情報を読み直してください。");
  return { artworkId, title: title.trim(), expectedVersion: Number(expectedVersion) };
}

/** Signature checks prevent SVG/HTML being sent under a raster MIME type. */
export function galleryImageFormat(bytes: Uint8Array, type: string): "jpeg" | "png" | "webp" {
  const at = (offset: number, values: number[]) =>
    values.every((value, index) => bytes[offset + index] === value);
  if (type === "image/jpeg" && at(0, [255, 216, 255])) return "jpeg";
  if (type === "image/png" && at(0, [137, 80, 78, 71, 13, 10, 26, 10])) return "png";
  if (type === "image/webp" && at(0, [82, 73, 70, 70]) && at(8, [87, 69, 66, 80])) return "webp";
  throw new GalleryError(400, "JPEG・PNG・WebPの画像を選んでください。");
}

/** Some PNG decoders report only APNG's first frame, so inspect its chunks too. */
export function galleryImageIsAnimated(
  bytes: Uint8Array,
  format: "jpeg" | "png" | "webp",
): boolean {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const name = (offset: number) => String.fromCharCode(...bytes.subarray(offset, offset + 4));
  if (format === "png") {
    let offset = 8;
    while (offset + 12 <= bytes.length) {
      const length = view.getUint32(offset);
      if (offset + length + 12 > bytes.length) break;
      if (name(offset + 4) === "acTL") return true;
      if (name(offset + 4) === "IEND") break;
      offset += length + 12;
    }
  }
  if (format === "webp") {
    let offset = 12;
    while (offset + 8 <= bytes.length) {
      const length = view.getUint32(offset + 4, true);
      if (offset + length + 8 > bytes.length) break;
      const kind = name(offset);
      if (
        kind === "ANIM" ||
        kind === "ANMF" ||
        (kind === "VP8X" && length >= 10 && bytes[offset + 8] & 2)
      )
        return true;
      offset += length + 8 + (length % 2);
    }
  }
  return false;
}

export function requireGalleryOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  const fetchSite = request.headers.get("sec-fetch-site");
  if (
    !origin ||
    origin !== new URL(request.url).origin ||
    (fetchSite && fetchSite !== "same-origin" && fetchSite !== "none")
  )
    throw new GalleryError(403, "このサイトから操作してください。");
}

/** Read a bounded stream, even when Content-Length is absent or dishonest. */
export async function readGalleryBody(request: Request, maxBytes: number): Promise<Uint8Array> {
  const contentLength = request.headers.get("content-length");
  if (contentLength && (!/^\d+$/.test(contentLength) || Number(contentLength) > maxBytes))
    throw new GalleryError(413, "投稿するデータが大きすぎます。");
  if (!request.body) return new Uint8Array();
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      length += chunk.value.byteLength;
      if (length > maxBytes) {
        await reader.cancel();
        throw new GalleryError(413, "投稿するデータが大きすぎます。");
      }
      chunks.push(chunk.value);
    }
  } finally {
    reader.releaseLock();
  }
  const body = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.length;
  }
  return body;
}
