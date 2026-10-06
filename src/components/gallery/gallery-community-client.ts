import type { GalleryArtwork } from "./gallery-data";
import type { Session, SupabaseClient } from "@supabase/supabase-js";

export const COMMUNITY_GALLERY_MAX_FILE_BYTES = 10 * 1024 * 1024;
export const COMMUNITY_GALLERY_MAX_PIXELS = 40_000_000;
export const COMMUNITY_GALLERY_MAX_UPLOAD_BYTES = 3 * 1024 * 1024;
export const COMMUNITY_GALLERY_MAX_EDGE = 2400;
const imageTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
let authClientPromise: Promise<SupabaseClient> | undefined;
let authConfigKey = "";
const writeSessions = new WeakMap<SupabaseClient, Promise<Session>>();

export type GalleryCollectionArtwork = Omit<GalleryArtwork, "category"> & {
  category: GalleryArtwork["category"] | "community";
  communitySequence?: number;
};
export type CommunityGalleryTitle = { title: string; version: number };
export type CommunityGalleryTitles = Record<string, CommunityGalleryTitle>;
export type CommunityGalleryPost = {
  id: string;
  sequence: number;
  width: number;
  height: number;
  url: string;
  createdAt: string;
  deletedAt?: string | null;
  canDelete?: boolean;
};
export type CommunityGalleryCollection = {
  posts: CommunityGalleryPost[];
  titles: CommunityGalleryTitles;
  deletedPosts?: CommunityGalleryPost[];
};
export type CommunityGalleryConfig = {
  ready: boolean;
  url?: string;
  publishableKey?: string;
};

export function isCommunityGalleryId(id: string): boolean {
  return /^u-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
}

export function galleryNumberFor(
  artwork: Pick<GalleryCollectionArtwork, "id" | "communitySequence">,
): string {
  return isCommunityGalleryId(artwork.id)
    ? `U${String(artwork.communitySequence).padStart(3, "0")}`
    : artwork.id.slice(1).padStart(3, "0");
}

export function validateCommunityImageFile(file: Pick<Blob, "size" | "type">): void {
  if (!imageTypes.has(file.type)) throw new Error("JPEG・PNG・WebPの画像を選んでください。");
  if (file.size <= 0) throw new Error("空のファイルは投稿できません。");
  if (file.size > COMMUNITY_GALLERY_MAX_FILE_BYTES) throw new Error("元の画像は1枚10MBまでです。");
}

export function validateCommunityImageDimensions(width: number, height: number): void {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0)
    throw new Error("画像の大きさを確認できませんでした。");
  if (width * height > COMMUNITY_GALLERY_MAX_PIXELS)
    throw new Error("画像は4,000万画素までです。小さくしてから投稿してください。");
}

export function validateCommunityStillImage(bytes: Uint8Array, type: string): void {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const chunkAt = (offset: number, type: string) =>
    [...type].every((character, index) => bytes[offset + index] === character.charCodeAt(0));
  const animated = () => {
    throw new Error("アニメーション画像は投稿できません。静止画像を選んでください。");
  };
  if (type === "image/png") {
    let offset = 8;
    while (offset + 8 <= bytes.length) {
      const size = view.getUint32(offset);
      if (chunkAt(offset + 4, "acTL")) animated();
      if (offset + size + 12 > bytes.length || chunkAt(offset + 4, "IEND")) break;
      offset += size + 12;
    }
  } else if (type === "image/webp") {
    let offset = 12;
    while (offset + 8 <= bytes.length) {
      const size = view.getUint32(offset + 4, true);
      if (chunkAt(offset, "ANIM") || chunkAt(offset, "ANMF")) animated();
      if (chunkAt(offset, "VP8X") && size >= 1 && bytes[offset + 8] & 0x02) animated();
      if (offset + size + 8 > bytes.length) break;
      offset += size + 8 + (size % 2);
    }
  }
}

/** Check dimensions before decoding to bound memory allocation. The server checks again. */
export function readCommunityImageDimensions(
  bytes: Uint8Array,
  type: string,
): { width: number; height: number } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const at = (offset: number, expected: readonly number[]) =>
    expected.every((value, index) => bytes[offset + index] === value);
  let width = 0;
  let height = 0;
  if (
    type === "image/png" &&
    bytes.length >= 24 &&
    at(0, [137, 80, 78, 71, 13, 10, 26, 10]) &&
    at(12, [73, 72, 68, 82])
  ) {
    width = view.getUint32(16);
    height = view.getUint32(20);
  } else if (type === "image/jpeg" && at(0, [255, 216])) {
    let offset = 2;
    while (offset + 4 <= bytes.length) {
      if (bytes[offset++] !== 255) break;
      while (bytes[offset] === 255) offset++;
      const marker = bytes[offset++];
      if (marker === 0xd9 || marker === 0xda) break;
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
      if (offset + 2 > bytes.length) break;
      const size = view.getUint16(offset);
      if (size < 2 || offset + size > bytes.length) break;
      if (
        [0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(
          marker,
        ) &&
        size >= 8
      ) {
        height = view.getUint16(offset + 3);
        width = view.getUint16(offset + 5);
        break;
      }
      offset += size;
    }
  } else if (type === "image/webp" && at(0, [82, 73, 70, 70]) && at(8, [87, 69, 66, 80])) {
    let offset = 12;
    while (offset + 8 <= bytes.length) {
      const size = view.getUint32(offset + 4, true);
      const payload = offset + 8;
      if (payload + size > bytes.length) break;
      if (at(offset, [86, 80, 56, 88]) && size >= 10) {
        width = 1 + bytes[payload + 4] + (bytes[payload + 5] << 8) + (bytes[payload + 6] << 16);
        height = 1 + bytes[payload + 7] + (bytes[payload + 8] << 8) + (bytes[payload + 9] << 16);
        break;
      }
      if (at(offset, [86, 80, 56, 76]) && size >= 5 && bytes[payload] === 0x2f) {
        const bits = view.getUint32(payload + 1, true);
        width = (bits & 0x3fff) + 1;
        height = ((bits >>> 14) & 0x3fff) + 1;
        break;
      }
      if (at(offset, [86, 80, 56, 32]) && size >= 10 && at(payload + 3, [157, 1, 42])) {
        width = view.getUint16(payload + 6, true) & 0x3fff;
        height = view.getUint16(payload + 8, true) & 0x3fff;
        break;
      }
      offset = payload + size + (size % 2);
    }
  }
  validateCommunityImageDimensions(width, height);
  validateCommunityStillImage(bytes, type);
  return { width, height };
}

function canvasBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("画像を投稿用に変換できませんでした。"))),
      "image/webp",
      quality,
    );
  });
}

export async function prepareCommunityUpload(file: File): Promise<File> {
  validateCommunityImageFile(file);
  readCommunityImageDimensions(new Uint8Array(await file.arrayBuffer()), file.type);
  const url = URL.createObjectURL(file);
  const image = new Image();
  try {
    await new Promise<void>((resolve, reject) => {
      const finish = () => {
        window.clearTimeout(timer);
        image.onload = null;
        image.onerror = null;
      };
      const timer = window.setTimeout(() => {
        finish();
        image.src = "";
        reject(new Error("画像の読み込みに時間がかかっています。別の画像でお試しください。"));
      }, 15_000);
      image.onload = () => {
        finish();
        resolve();
      };
      image.onerror = () => {
        finish();
        reject(new Error("画像を読み込めませんでした。ファイルを確認してください。"));
      };
      image.src = url;
    });
    validateCommunityImageDimensions(image.naturalWidth, image.naturalHeight);
    const scale = Math.min(
      1,
      COMMUNITY_GALLERY_MAX_EDGE / Math.max(image.naturalWidth, image.naturalHeight),
    );
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("このブラウザーでは画像を変換できません。");
    try {
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      let blob = await canvasBlob(canvas, 0.9);
      if (blob.size > COMMUNITY_GALLERY_MAX_UPLOAD_BYTES) blob = await canvasBlob(canvas, 0.76);
      if (blob.size > COMMUNITY_GALLERY_MAX_UPLOAD_BYTES) blob = await canvasBlob(canvas, 0.6);
      if (blob.size > COMMUNITY_GALLERY_MAX_UPLOAD_BYTES)
        throw new Error("投稿用の画像が3MBを超えました。小さな画像でお試しください。");
      if (!imageTypes.has(blob.type))
        throw new Error("このブラウザーでは投稿用の画像に変換できません。");
      return new File([blob], "gallery-upload.webp", { type: blob.type });
    } finally {
      canvas.width = canvas.height = 0;
    }
  } finally {
    image.src = "";
    URL.revokeObjectURL(url);
  }
}

export class GalleryRequestError extends Error {
  status: number;
  current?: CommunityGalleryTitle;
  constructor(message: string, status: number, current?: CommunityGalleryTitle) {
    super(message);
    this.status = status;
    this.current = current;
  }
}

function isCommunityGalleryTitle(value: unknown): value is CommunityGalleryTitle {
  if (!value || typeof value !== "object") return false;
  const entry = value as Partial<CommunityGalleryTitle>;
  return (
    typeof entry.title === "string" &&
    entry.title.length <= 100 &&
    Number.isSafeInteger(entry.version) &&
    (entry.version ?? -1) >= 0
  );
}

export function isCommunityGalleryPost(value: unknown): value is CommunityGalleryPost {
  if (!value || typeof value !== "object") return false;
  const post = value as Partial<CommunityGalleryPost>;
  return (
    typeof post.id === "string" &&
    isCommunityGalleryId(post.id) &&
    Number.isSafeInteger(post.sequence) &&
    (post.sequence ?? 0) > 0 &&
    Number.isSafeInteger(post.width) &&
    (post.width ?? 0) > 0 &&
    Number.isSafeInteger(post.height) &&
    (post.height ?? 0) > 0 &&
    (post.width ?? 0) * (post.height ?? 0) <= COMMUNITY_GALLERY_MAX_PIXELS &&
    typeof post.url === "string" &&
    /^(?:https?:\/\/|\/(?!\/))/.test(post.url) &&
    typeof post.createdAt === "string" &&
    (post.canDelete === undefined || typeof post.canDelete === "boolean") &&
    (post.deletedAt === undefined || post.deletedAt === null || typeof post.deletedAt === "string")
  );
}

export function normalizeCommunityGalleryCollection(value: unknown): CommunityGalleryCollection {
  if (!value || typeof value !== "object")
    throw new Error("共有ギャラリーの応答を確認できませんでした。");
  const collection = value as Partial<CommunityGalleryCollection>;
  if (
    !Array.isArray(collection.posts) ||
    !collection.posts.every(isCommunityGalleryPost) ||
    !collection.titles ||
    typeof collection.titles !== "object" ||
    Array.isArray(collection.titles) ||
    (collection.deletedPosts !== undefined &&
      (!Array.isArray(collection.deletedPosts) ||
        !collection.deletedPosts.every(isCommunityGalleryPost)))
  )
    throw new Error("共有ギャラリーの応答を確認できませんでした。");
  const titles = Object.fromEntries(
    Object.entries(collection.titles).filter(
      ([id, title]) =>
        (/^g\d{2}$/.test(id) || isCommunityGalleryId(id)) && isCommunityGalleryTitle(title),
    ),
  );
  return {
    posts: collection.posts.filter((post) => !post.deletedAt),
    titles,
    deletedPosts: collection.deletedPosts?.filter((post) => Boolean(post.deletedAt)),
  };
}

async function galleryRequest<T>(
  path: string,
  options: RequestInit = {},
  token?: string,
): Promise<T> {
  const headers = new Headers(options.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const controller = new AbortController();
  const timer = globalThis.setTimeout(() => controller.abort(), 35_000);
  try {
    const response = await fetch(path, {
      ...options,
      headers,
      cache: "no-store",
      signal: controller.signal,
    });
    const parsed: unknown = await response.json().catch(() => ({}));
    const body = parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
    if (!response.ok)
      throw new GalleryRequestError(
        typeof body.error === "string"
          ? body.error
          : "ギャラリーの通信に失敗しました。時間をおいてお試しください。",
        response.status,
        isCommunityGalleryTitle(body.current) ? body.current : undefined,
      );
    return body as T;
  } catch (error) {
    if (controller.signal.aborted)
      throw new GalleryRequestError(
        "通信がタイムアウトしました。投稿・編集の結果をページの再読み込みで確認してください。",
        408,
      );
    throw error;
  } finally {
    globalThis.clearTimeout(timer);
  }
}

export function readCommunityGalleryConfig(): Promise<CommunityGalleryConfig> {
  return galleryRequest("/api/gallery/config");
}
export async function createGalleryAuthClient(
  config: CommunityGalleryConfig,
): Promise<SupabaseClient> {
  if (!config.ready || !config.url || !config.publishableKey)
    throw new Error("共有ギャラリーの接続準備が完了していません。");
  const key = `${config.url}\n${config.publishableKey}`;
  if (!authClientPromise || authConfigKey !== key) {
    authConfigKey = key;
    authClientPromise = import("@supabase/supabase-js")
      .then(({ createClient }) =>
        createClient(config.url!, config.publishableKey!, {
          auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
        }),
      )
      .catch((error) => {
        authClientPromise = undefined;
        throw error;
      });
  }
  return authClientPromise;
}

/** Auth events win over an earlier, slower getSession result. */
export function subscribeGallerySession(
  client: SupabaseClient,
  onSession: (session: Session | null) => void,
) {
  let disposed = false;
  let revision = 0;
  const { data: listener } = client.auth.onAuthStateChange((_event, session) => {
    revision++;
    if (!disposed) onSession(session);
  });
  const currentRevision = revision;
  const loaded = client.auth.getSession().then(({ data, error }) => {
    if (disposed) return;
    if (error) throw error;
    if (revision === currentRevision) onSession(data.session);
  });
  return {
    loaded,
    unsubscribe: () => {
      disposed = true;
      listener.subscription.unsubscribe();
    },
  };
}

/** Called only by an intentional edit/post action, never during gallery reads. */
export async function ensureGalleryWriteSession(client: SupabaseClient): Promise<Session> {
  const inFlight = writeSessions.get(client);
  if (inFlight) return inFlight;
  const pending = (async () => {
    const existing = await client.auth.getSession();
    if (existing.error)
      throw new Error(
        "このブラウザーの投稿管理情報を確認できませんでした。ページを再読み込みしてお試しください。",
      );
    if (existing.data.session) return existing.data.session;
    const created = await client.auth.signInAnonymously();
    if (created.error || !created.data.session)
      throw new Error(
        "投稿設定の準備中、または接続に失敗したため処理できませんでした。しばらくしてからお試しください。",
      );
    return created.data.session;
  })();
  writeSessions.set(client, pending);
  try {
    return await pending;
  } finally {
    if (writeSessions.get(client) === pending) writeSessions.delete(client);
  }
}
export async function readCommunityGallery(token?: string): Promise<CommunityGalleryCollection> {
  return normalizeCommunityGalleryCollection(
    await galleryRequest(`/api/gallery${token ? "?includeDeleted=1" : ""}`, {}, token),
  );
}
export function postCommunityGalleryImage(
  file: File,
  token: string,
): Promise<{ post: CommunityGalleryPost }> {
  const body = new FormData();
  body.set("file", file);
  return galleryRequest("/api/gallery", { method: "POST", body }, token);
}
export async function updateCommunityGalleryTitle(
  artworkId: string,
  title: string,
  expectedVersion: number,
  token: string,
): Promise<CommunityGalleryTitle> {
  if (
    (!/^g\d{2}$/.test(artworkId) && !isCommunityGalleryId(artworkId)) ||
    title.trim().length > 100 ||
    !Number.isSafeInteger(expectedVersion) ||
    expectedVersion < 0
  )
    throw new Error("タイトルまたは作品番号を確認してください。タイトルは100文字までです。");
  const entry = await galleryRequest(
    "/api/gallery/title",
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ artworkId, title: title.trim(), expectedVersion }),
    },
    token,
  );
  if (!isCommunityGalleryTitle(entry))
    throw new Error(
      "公開タイトルの応答を確認できませんでした。更新して現在のタイトルをご確認ください。",
    );
  return entry;
}
export function deleteCommunityGalleryImage(id: string, token: string): Promise<void> {
  if (!isCommunityGalleryId(id))
    return Promise.reject(new Error("投稿画像だけを非公開にできます。"));
  return galleryRequest(`/api/gallery/${encodeURIComponent(id)}`, { method: "DELETE" }, token);
}
export function restoreCommunityGalleryImage(id: string, token: string): Promise<void> {
  if (!isCommunityGalleryId(id)) return Promise.reject(new Error("投稿画像だけを復元できます。"));
  return galleryRequest(
    `/api/gallery/${encodeURIComponent(id)}/restore`,
    { method: "POST" },
    token,
  );
}
export function communityPostToArtwork(post: CommunityGalleryPost): GalleryCollectionArtwork {
  return {
    id: post.id,
    communitySequence: post.sequence,
    title: "",
    alt: `投稿画像 ${galleryNumberFor({ id: post.id, communitySequence: post.sequence })}`,
    category: "community",
    width: post.width,
    height: post.height,
    thumb: post.url,
    medium: post.url,
    full: post.url,
    srcSet: "",
  };
}
