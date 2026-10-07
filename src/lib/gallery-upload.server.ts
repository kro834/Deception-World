import { createHash, randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  galleryClient,
  galleryPosts,
  galleryResponse,
  galleryUser,
  rpc,
  sanitizeGalleryImage,
  type RpcResult,
} from "./gallery.server.ts";
import {
  GalleryError,
  GALLERY_MAX_INPUT_BYTES,
  readGalleryBody,
  requireGalleryOrigin,
  validGalleryPostId,
} from "./gallery-safety.server.ts";

const STAGING = "gallery-upload-staging";
const FINAL = "gallery-images";
type UploadRow = { id: string; stage_path: string; content_type: string };
type UploadResult = RpcResult & { upload?: UploadRow; ready?: boolean; uploads?: UploadRow[] };
const digest = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const unavailable = () =>
  new GalleryError(503, "画像の保存に失敗しました。時間をおいてお試しください。");

async function jsonBody(request: Request): Promise<Record<string, unknown>> {
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    throw new GalleryError(400, "画像の投稿情報を確認してください。");
  const bytes = await readGalleryBody(request, 1024);
  try {
    const body: unknown = JSON.parse(new TextDecoder().decode(bytes));
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("input");
    return body as Record<string, unknown>;
  } catch {
    throw new GalleryError(400, "画像の投稿情報を確認してください。");
  }
}

/** Only expired, DB-selected paths are removed; a lost Storage reply keeps quota. */
export async function cleanupGalleryUploads(client: SupabaseClient): Promise<void> {
  const lease = randomUUID();
  try {
    const result = (await rpc(client, "gallery_upload_cleanup_claim", {
      p_lease: lease,
    })) as UploadResult;
    await Promise.all(
      (result.uploads ?? []).map(async (upload) => {
        if (!validGalleryPostId(upload.id) || upload.stage_path !== `${upload.id}/source`) return;
        const { error } = await client.storage.from(STAGING).remove([upload.stage_path]);
        if (!error)
          await rpc(client, "gallery_upload_cleanup_finish", { p_id: upload.id, p_lease: lease });
      }),
    );
  } catch {
    // Cleanup is conservative and retryable. Never free quota on uncertainty.
  }
}

export async function initGalleryUpload(request: Request): Promise<Response> {
  requireGalleryOrigin(request);
  const client = await galleryClient();
  const user = await galleryUser(request, client);
  const body = await jsonBody(request);
  if (
    Object.keys(body).some((key) => !["size", "type"].includes(key)) ||
    !Number.isSafeInteger(body.size) ||
    Number(body.size) <= 0 ||
    Number(body.size) > GALLERY_MAX_INPUT_BYTES ||
    typeof body.type !== "string" ||
    !["image/jpeg", "image/png", "image/webp"].includes(body.type)
  )
    throw new GalleryError(400, "JPEG・PNG・WebPの静止画像を19MB以内で選んでください。");
  await cleanupGalleryUploads(client);
  const uploadId = `u-${randomUUID()}`;
  const result = (await rpc(client, "gallery_upload_init", {
    p_user: user,
    p_id: uploadId,
    p_type: body.type,
  })) as UploadResult;
  if (
    !result.upload ||
    result.upload.id !== uploadId ||
    result.upload.stage_path !== `${uploadId}/source`
  )
    throw unavailable();
  const path = result.upload.stage_path;
  const { data, error } = await client.storage
    .from(STAGING)
    .createSignedUploadUrl(path, { upsert: false });
  // Signing may have succeeded even when its reply was lost: retain the full
  // reservation and tombstone until the token's maximum lifetime has passed.
  if (error || !data?.token) throw unavailable();
  return galleryResponse({ uploadId, path, token: data.token }, 201);
}

export async function completeGalleryUpload(request: Request): Promise<Response> {
  requireGalleryOrigin(request);
  const client = await galleryClient();
  const user = await galleryUser(request, client);
  const body = await jsonBody(request);
  if (
    Object.keys(body).length !== 1 ||
    typeof body.uploadId !== "string" ||
    !validGalleryPostId(body.uploadId)
  )
    throw new GalleryError(400, "画像の投稿情報を確認してください。");
  const id = body.uploadId;
  const lease = randomUUID();
  const claim = (await rpc(client, "gallery_upload_claim", {
    p_user: user,
    p_id: id,
    p_lease: lease,
  })) as UploadResult;
  if (claim.ready && claim.post) {
    const [post] = await galleryPosts(client, [claim.post], user);
    return galleryResponse({ post });
  }
  if (!claim.upload || claim.upload.stage_path !== `${id}/source`) throw unavailable();
  try {
    const { data: source, error } = await client.storage
      .from(STAGING)
      .download(claim.upload.stage_path);
    if (error || !source) throw unavailable();
    if (source.size > GALLERY_MAX_INPUT_BYTES)
      throw new GalleryError(413, "元の画像は1枚19MBまでです。");
    const image = await sanitizeGalleryImage(
      new Uint8Array(await source.arrayBuffer()),
      claim.upload.content_type,
    );
    const hash = digest(image.bytes);
    const prepared = await rpc(client, "gallery_upload_prepare", {
      p_user: user,
      p_id: id,
      p_lease: lease,
      p_width: image.width,
      p_height: image.height,
      p_bytes: image.bytes.byteLength,
      p_format: image.format,
      p_digest: hash,
    });
    if (!prepared.post || prepared.post.object_path !== `${id}.${image.format}`)
      throw unavailable();
    const path = prepared.post.object_path;
    const { error: uploadError } = await client.storage.from(FINAL).upload(path, image.bytes, {
      contentType: image.contentType,
      cacheControl: "3600",
      upsert: false,
    });
    if (uploadError) {
      // Another lease may have already saved these immutable, digest-bound
      // bytes. Verify rather than overwrite/delete or release their reservation.
      const existing = await client.storage.from(FINAL).download(path);
      if (
        existing.error ||
        !existing.data ||
        existing.data.size !== image.bytes.byteLength ||
        digest(new Uint8Array(await existing.data.arrayBuffer())) !== hash
      )
        throw unavailable();
    }
    const completed = (await rpc(client, "gallery_upload_finish", {
      p_user: user,
      p_id: id,
      p_lease: lease,
    })) as UploadResult;
    if (!completed.post) throw unavailable();
    const [post] = await galleryPosts(client, [completed.post], user);
    return galleryResponse({ post }, completed.ready ? 200 : 201);
  } catch (error) {
    // CAS makes an expired worker unable to release a newer worker's lease.
    await rpc(client, "gallery_upload_release", {
      p_user: user,
      p_id: id,
      p_lease: lease,
      p_failed: error instanceof GalleryError && [400, 413].includes(error.status),
    }).catch(() => undefined);
    throw error;
  }
}
