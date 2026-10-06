import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  GalleryError,
  GALLERY_MAX_EDGE,
  GALLERY_MAX_IMAGE_BYTES,
  GALLERY_MAX_INPUT_BYTES,
  GALLERY_MAX_PIXELS,
  GALLERY_MAX_REQUEST_BYTES,
  galleryImageFormat,
  galleryImageIsAnimated,
  readGalleryBody,
  requireGalleryOrigin,
  validGalleryPostId,
  validateGalleryTitle,
} from "./gallery-safety.server.ts";

const BUCKET = "gallery-images";
const unavailableMessage =
  "共有ギャラリーの接続準備が完了していません。時間をおいてお試しください。";
const env = (key: string) => process.env[key]?.trim() || undefined;

function jwtRole(key: string): string | undefined {
  try {
    return JSON.parse(Buffer.from(key.split(".")[1], "base64url").toString()).role;
  } catch {
    return undefined;
  }
}

/** Never expose a secret or a legacy service-role JWT through public config. */
export function galleryEnvironment() {
  const url = env("SUPABASE_URL") ?? env("NEXT_PUBLIC_SUPABASE_URL");
  const publishableKey =
    env("SUPABASE_PUBLISHABLE_KEY") ??
    env("SUPABASE_ANON_KEY") ??
    env("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  const serviceKey = env("SUPABASE_SERVICE_ROLE_KEY") ?? env("SUPABASE_SECRET_KEY");
  let validUrl = false;
  try {
    const parsed = new URL(url ?? "");
    validUrl =
      parsed.protocol === "https:" &&
      !parsed.username &&
      !parsed.password &&
      parsed.pathname === "/" &&
      !parsed.search &&
      !parsed.hash;
  } catch {
    /* Unconfigured services fail closed. */
  }
  const publicKeyValid = Boolean(
    publishableKey &&
    (publishableKey.startsWith("sb_publishable_") || jwtRole(publishableKey) === "anon"),
  );
  const serviceKeyValid = Boolean(
    serviceKey && (serviceKey.startsWith("sb_secret_") || jwtRole(serviceKey) === "service_role"),
  );
  if (
    !url ||
    !publishableKey ||
    !serviceKey ||
    !validUrl ||
    !publicKeyValid ||
    !serviceKeyValid ||
    serviceKey === publishableKey
  )
    return null;
  return { url: url.replace(/\/$/, ""), publishableKey, serviceKey };
}

let clientCache: { url: string; key: string; client: SupabaseClient } | undefined;
async function galleryClient(): Promise<SupabaseClient> {
  if (typeof window !== "undefined")
    throw new Error("Gallery server module cannot run in a browser.");
  const config = galleryEnvironment();
  if (!config) throw new GalleryError(503, unavailableMessage);
  if (clientCache?.url === config.url && clientCache.key === config.serviceKey)
    return clientCache.client;
  const { createClient } = await import("@supabase/supabase-js");
  const client = createClient(config.url, config.serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: {
      fetch: (input, init) =>
        fetch(input, { ...init, signal: init?.signal ?? AbortSignal.timeout(15_000) }),
    },
  });
  clientCache = { url: config.url, key: config.serviceKey, client };
  return client;
}

async function galleryUser(
  request: Request,
  client: SupabaseClient,
  required = true,
): Promise<string | null> {
  const authorization = request.headers.get("authorization");
  if (!authorization && !required) return null;
  if (!authorization || !/^Bearer [A-Za-z0-9._-]{20,8192}$/.test(authorization))
    throw new GalleryError(401, "操作の準備ができませんでした。ページを読み直してお試しください。");
  // getUser asks Supabase Auth to verify the bearer. No decoded-JWT trust, Grok
  // fallback or dev-user substitute may authorize a write. Verified anonymous
  // sessions let a visitor write without a visible login flow.
  const { data, error } = await client.auth.getUser(authorization.slice(7));
  if (error || !data.user)
    throw new GalleryError(401, "操作の有効期限が切れました。ページを読み直してお試しください。");
  return data.user.id;
}

export function galleryResponse(body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" },
  });
}

export async function galleryRoute(handler: () => Promise<Response>): Promise<Response> {
  try {
    return await handler();
  } catch (error) {
    if (error instanceof GalleryError)
      return galleryResponse(
        { error: error.message, ...(error.current ? { current: error.current } : {}) },
        error.status,
      );
    // Upstream failures can contain connection details; return a fixed message.
    return galleryResponse(
      { error: "ギャラリーの処理に失敗しました。時間をおいてお試しください。" },
      503,
    );
  }
}

export async function getGalleryConfig(): Promise<Response> {
  const config = galleryEnvironment();
  if (!config) return galleryResponse({ ready: false });
  try {
    const client = await galleryClient();
    const { error } = await client.from("gallery_posts").select("id").limit(1);
    if (error) return galleryResponse({ ready: false });
    return galleryResponse({ ready: true, url: config.url, publishableKey: config.publishableKey });
  } catch {
    return galleryResponse({ ready: false });
  }
}

type PostRow = {
  id: string;
  sequence: number;
  owner_id: string;
  object_path: string;
  width: number;
  height: number;
  created_at: string;
  deleted_at: string | null;
};
type RpcResult = {
  error?: string;
  current?: { title: string; version: number };
  post?: PostRow;
  title?: string;
  version?: number;
  ok?: boolean;
};

async function rpc(
  client: SupabaseClient,
  name: string,
  parameters: Record<string, unknown>,
): Promise<RpcResult> {
  const { data, error } = await client.rpc(name, parameters);
  if (error || !data) throw new GalleryError(503, unavailableMessage);
  const result = data as RpcResult;
  if (result.error) {
    const errors: Record<string, { status: number; message: string }> = {
      auth: {
        status: 401,
        message: "操作の準備ができませんでした。ページを読み直してお試しください。",
      },
      input: { status: 400, message: "入力を確認してください。" },
      forbidden: {
        status: 403,
        message: "投稿の削除・復元は投稿したブラウザーから行ってください。",
      },
      not_found: {
        status: 404,
        message: "作品が見つかりませんでした。ギャラリーを読み直してください。",
      },
      conflict: {
        status: 409,
        message: "ほかの人が作品名を更新しました。最新の作品名を確認してから保存してください。",
      },
      rate: { status: 429, message: "操作回数の上限に達しました。時間をおいてお試しください。" },
      user_quota: {
        status: 413,
        message:
          "このブラウザーの投稿は50枚・合計100MBまでです。削除した画像も復元用に保持されます。",
      },
      global_quota: { status: 507, message: "共有ギャラリーの保存容量が上限に達しました。" },
      history_quota: {
        status: 503,
        message: "作品名の保存を準備しています。時間をおいてお試しください。",
      },
    };
    const mapped = errors[result.error] ?? { status: 503, message: unavailableMessage };
    throw new GalleryError(mapped.status, mapped.message, result.current);
  }
  return result;
}

const signedUrlCache = new Map<string, { url: string; expiresAt: number }>();
const SIGNED_URL_CACHE_MS = 15 * 60 * 1000;
const SIGNED_URL_CACHE_MAX = 1000;
async function galleryPosts(client: SupabaseClient, rows: PostRow[], userId: string | null) {
  if (!rows.length) return [];
  const now = Date.now();
  const namespace = galleryEnvironment()?.url ?? "";
  const key = (path: string) => `${namespace}/${path}`;
  for (const [path, cached] of signedUrlCache)
    if (cached.expiresAt <= now) signedUrlCache.delete(path);
  const urls = new Map<string, string>();
  const missing: string[] = [];
  for (const row of rows) {
    const cached = signedUrlCache.get(key(row.object_path));
    if (cached) urls.set(row.object_path, cached.url);
    else missing.push(row.object_path);
  }
  if (missing.length) {
    const { data, error } = await client.storage.from(BUCKET).createSignedUrls(missing, 3600);
    if (error || !data || data.some((item) => !item.signedUrl || item.error))
      throw new GalleryError(503, "投稿画像を読み込めませんでした。時間をおいてお試しください。");
    for (const item of data) {
      if (!item.path || !item.signedUrl) throw new GalleryError(503, unavailableMessage);
      urls.set(item.path, item.signedUrl);
      const cacheKey = key(item.path);
      signedUrlCache.delete(cacheKey);
      while (signedUrlCache.size >= SIGNED_URL_CACHE_MAX) {
        const oldest = signedUrlCache.keys().next().value;
        if (oldest === undefined) break;
        signedUrlCache.delete(oldest);
      }
      signedUrlCache.set(cacheKey, { url: item.signedUrl, expiresAt: now + SIGNED_URL_CACHE_MS });
    }
  }
  if (rows.some((row) => !urls.get(row.object_path)))
    throw new GalleryError(503, "投稿画像を読み込めませんでした。時間をおいてお試しください。");
  return rows.map((row) => ({
    id: row.id,
    sequence: Number(row.sequence),
    width: row.width,
    height: row.height,
    url: urls.get(row.object_path),
    createdAt: row.created_at,
    deletedAt: row.deleted_at,
    canDelete: userId === row.owner_id,
  }));
}

type TitleRow = { artwork_id: string; title: string; version: number };
async function galleryTitles(client: SupabaseClient): Promise<TitleRow[]> {
  const rows: TitleRow[] = [];
  const maximum = 1113; // Every static image plus the gallery's 1000 post quota.
  let after: string | undefined;
  while (rows.length < maximum) {
    // Supabase normally caps one response at 1000 rows. Keyset pages also avoid
    // shifting offsets when another viewer creates a title during this read.
    const size = Math.min(500, maximum - rows.length);
    let query = client
      .from("gallery_titles")
      .select("artwork_id,title,version")
      .order("artwork_id", { ascending: true })
      .limit(size);
    if (after) query = query.gt("artwork_id", after);
    const { data, error } = await query;
    if (error) throw new GalleryError(503, unavailableMessage);
    const page = (data ?? []) as TitleRow[];
    rows.push(...page);
    if (page.length < size) break;
    const next = page.at(-1)?.artwork_id;
    if (!next || next === after) throw new GalleryError(503, unavailableMessage);
    after = next;
  }
  return rows;
}

export async function getGallery(request: Request): Promise<Response> {
  const client = await galleryClient();
  const userId = await galleryUser(request, client, false);
  const includeDeleted = new URL(request.url).searchParams.get("includeDeleted") === "1";
  if (includeDeleted && !userId)
    throw new GalleryError(
      401,
      "削除した投稿を見る準備ができませんでした。ページを読み直してください。",
    );
  const columns = "id,sequence,owner_id,object_path,width,height,created_at,deleted_at";
  const results = await Promise.all([
    client
      .from("gallery_posts")
      .select(columns)
      .eq("state", "ready")
      .is("deleted_at", null)
      .order("sequence", { ascending: true })
      .limit(1000),
    galleryTitles(client),
    includeDeleted && userId
      ? client
          .from("gallery_posts")
          .select(columns)
          .eq("state", "ready")
          .eq("owner_id", userId)
          .not("deleted_at", "is", null)
          .order("sequence", { ascending: true })
          .limit(50)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (results[0].error || results[2].error) throw new GalleryError(503, unavailableMessage);
  const [posts, deletedPosts] = await Promise.all([
    galleryPosts(client, (results[0].data ?? []) as PostRow[], userId),
    galleryPosts(client, (results[2].data ?? []) as PostRow[], userId),
  ]);
  const visibleIds = new Set([...posts, ...deletedPosts].map((post) => post.id));
  const titles: Record<string, { title: string; version: number }> = {};
  for (const row of results[1]) {
    if (row.artwork_id.startsWith("g") || visibleIds.has(row.artwork_id))
      titles[row.artwork_id] = { title: row.title, version: row.version };
  }
  return galleryResponse({ posts, titles, ...(includeDeleted ? { deletedPosts } : {}) });
}

export async function sanitizeGalleryImage(bytes: Uint8Array, type: string) {
  if (!bytes.length || bytes.length > GALLERY_MAX_INPUT_BYTES)
    throw new GalleryError(413, "元の画像は1枚10MBまでです。");
  const format = galleryImageFormat(bytes, type);
  if (galleryImageIsAnimated(bytes, format))
    throw new GalleryError(400, "アニメーション画像は投稿できません。静止画像を選んでください。");
  const { default: sharp } = await import("sharp");
  try {
    const image = sharp(bytes, {
      limitInputPixels: GALLERY_MAX_PIXELS,
      failOn: "error",
      animated: true,
      sequentialRead: true,
    });
    const metadata = await image.metadata();
    if (
      metadata.format !== format ||
      !metadata.width ||
      !metadata.height ||
      metadata.width * metadata.height > GALLERY_MAX_PIXELS
    )
      throw new GalleryError(400, "画像は4,000万画素までです。ファイルを確認してください。");
    if ((metadata.pages ?? 1) > 1)
      throw new GalleryError(400, "アニメーション画像は投稿できません。静止画像を選んでください。");
    // The default sharp output omits EXIF/ICC/XMP and all original metadata.
    const base = image
      .rotate()
      .resize(GALLERY_MAX_EDGE, GALLERY_MAX_EDGE, { fit: "inside", withoutEnlargement: true })
      .timeout({ seconds: 10 });
    for (const quality of [84, 68, 50]) {
      const { data, info } = await base
        .clone()
        .webp({ quality, effort: 4 })
        .toBuffer({ resolveWithObject: true });
      if (data.byteLength <= GALLERY_MAX_IMAGE_BYTES)
        return { bytes: data, width: info.width, height: info.height };
    }
    throw new GalleryError(413, "投稿用の画像が3MBを超えました。小さな画像でお試しください。");
  } catch (error) {
    if (error instanceof GalleryError) throw error;
    throw new GalleryError(
      400,
      "画像を読み込めませんでした。JPEG・PNG・WebPの静止画像を確認してください。",
    );
  }
}

export async function postGallery(request: Request): Promise<Response> {
  requireGalleryOrigin(request);
  const client = await galleryClient();
  const userId = await galleryUser(request, client);
  const contentType = request.headers.get("content-type");
  if (!contentType?.startsWith("multipart/form-data;"))
    throw new GalleryError(400, "投稿する画像を選んでください。");
  await rpc(client, "gallery_begin_upload", { p_user: userId });
  const body = await readGalleryBody(request, GALLERY_MAX_REQUEST_BYTES);
  let form: FormData;
  try {
    form = await new Response(new Uint8Array(body).buffer, {
      headers: { "content-type": contentType },
    }).formData();
  } catch {
    throw new GalleryError(400, "投稿する画像を確認してください。");
  }
  const entries = [...form.entries()];
  const file = form.get("file");
  if (entries.length !== 1 || !(file instanceof Blob))
    throw new GalleryError(400, "画像は1枚ずつ投稿してください。");
  const image = await sanitizeGalleryImage(new Uint8Array(await file.arrayBuffer()), file.type);
  const id = `u-${randomUUID()}`;
  const reservation = await rpc(client, "gallery_reserve_upload", {
    p_user: userId,
    p_id: id,
    p_width: image.width,
    p_height: image.height,
    p_bytes: image.bytes.byteLength,
  });
  if (!reservation.post) throw new GalleryError(503, unavailableMessage);
  const path = reservation.post.object_path;
  const { error: uploadError } = await client.storage
    .from(BUCKET)
    .upload(path, image.bytes, { contentType: "image/webp", cacheControl: "3600", upsert: false });
  if (uploadError) {
    // A failed network response may still have saved an object. Keep its quota
    // reservation unless storage confirms removal, preventing orphan bypass.
    const { error: removeError } = await client.storage.from(BUCKET).remove([path]);
    if (!removeError)
      await rpc(client, "gallery_complete_upload", { p_user: userId, p_id: id, p_abort: true });
    throw new GalleryError(503, "画像の保存に失敗しました。時間をおいてお試しください。");
  }
  const completed = await rpc(client, "gallery_complete_upload", {
    p_user: userId,
    p_id: id,
    p_abort: false,
  });
  if (!completed.post) throw new GalleryError(503, unavailableMessage);
  const [post] = await galleryPosts(client, [completed.post], userId);
  return galleryResponse({ post }, 201);
}

export async function patchGalleryTitle(request: Request): Promise<Response> {
  requireGalleryOrigin(request);
  const client = await galleryClient();
  const userId = await galleryUser(request, client);
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    throw new GalleryError(400, "作品名の入力を確認してください。");
  const bytes = await readGalleryBody(request, 4096);
  let body: unknown;
  try {
    body = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new GalleryError(400, "作品名の入力を確認してください。");
  }
  const { artworkId, title, expectedVersion } = validateGalleryTitle(body);
  const result = await rpc(client, "gallery_set_title", {
    p_user: userId,
    p_artwork: artworkId,
    p_title: title,
    p_expected: expectedVersion,
  });
  return galleryResponse({ title: result.title, version: result.version });
}

export async function setGalleryDeleted(
  request: Request,
  id: string,
  deleted: boolean,
): Promise<Response> {
  requireGalleryOrigin(request);
  if (!validGalleryPostId(id)) throw new GalleryError(400, "投稿を確認できませんでした。");
  const client = await galleryClient();
  const userId = await galleryUser(request, client);
  await rpc(client, "gallery_set_deleted", { p_user: userId, p_id: id, p_deleted: deleted });
  return galleryResponse({ ok: true });
}
