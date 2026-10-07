import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import {
  GalleryError,
  galleryImageFormat,
  galleryImageIsAnimated,
  readGalleryBody,
  requireGalleryOrigin,
  validGalleryArtworkId,
  validateGalleryTitle,
} from "../src/lib/gallery-safety.server.ts";
import {
  galleryEnvironment,
  galleryRoute,
  getGalleryConfig,
  getGallery,
  patchGalleryTitle,
  postGallery,
  sanitizeGalleryImage,
  setGalleryDeleted,
} from "../src/lib/gallery.server.ts";
import { completeGalleryUpload, initGalleryUpload } from "../src/lib/gallery-upload.server.ts";

const userA = "12345678-1234-4123-8123-123456789abc";
const userB = "22345678-1234-4123-8123-123456789abc";
const anonymous = "32345678-1234-4123-8123-123456789abc";
const postA = `u-${userA}`;
const postB = `u-${userB}`;
const migration = await readFile(
  new URL("../supabase/migrations/202610060001_shared_gallery.sql", import.meta.url),
  "utf8",
);
const catalogueMigration = await readFile(
  new URL("../supabase/migrations/202610060002_gallery_catalogue_113.sql", import.meta.url),
  "utf8",
);
const losslessMigration = await readFile(
  new URL("../supabase/migrations/202610070001_gallery_lossless_uploads.sql", import.meta.url),
  "utf8",
);
const titleEditingMigration = await readFile(
  new URL("../supabase/migrations/202610070002_gallery_title_editing.sql", import.meta.url),
  "utf8",
);
const restoreProtocolMigration = await readFile(
  new URL("../supabase/migrations/202610070003_restore_gallery_protocol.sql", import.meta.url),
  "utf8",
);

test("gallery server validates static IDs, public UUIDs, titles and concurrency versions", () => {
  for (let number = 1; number <= 113; number++)
    assert.equal(validGalleryArtworkId(`g${String(number).padStart(2, "0")}`), true);
  assert.equal(validGalleryArtworkId(postA), true);
  for (const id of [
    "g00",
    "g114",
    "g001",
    "g0113",
    "g1",
    "g999",
    "p-12345678-1234-4123-8123-123456789abc",
    "__proto__",
  ])
    assert.equal(validGalleryArtworkId(id), false);
  assert.deepEqual(
    validateGalleryTitle({ artworkId: "g01", title: "  星の光  ", expectedVersion: 0 }),
    { artworkId: "g01", title: "星の光", expectedVersion: 0 },
  );
  assert.equal(validateGalleryTitle({ artworkId: postA, title: "", expectedVersion: 2 }).title, "");
  for (const change of [
    { title: "a".repeat(121) },
    { title: "bad\nname" },
    { title: "bad\u007fname" },
    { expectedVersion: -1 },
    { expectedVersion: 1.5 },
    { expectedVersion: "0" },
  ])
    assert.throws(
      () => validateGalleryTitle({ artworkId: "g01", title: "ok", expectedVersion: 0, ...change }),
      GalleryError,
    );
});

test("gallery image signatures reject SVG and raster MIME spoofing", () => {
  assert.equal(galleryImageFormat(new Uint8Array([255, 216, 255]), "image/jpeg"), "jpeg");
  assert.equal(
    galleryImageFormat(new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), "image/png"),
    "png",
  );
  const webp = new Uint8Array([82, 73, 70, 70, 0, 0, 0, 0, 87, 69, 66, 80]);
  assert.equal(galleryImageFormat(webp, "image/webp"), "webp");
  for (const type of ["image/jpeg", "image/png", "image/webp", "image/svg+xml"])
    assert.throws(() => galleryImageFormat(new TextEncoder().encode("<svg/>"), type));
  assert.throws(() => galleryImageFormat(webp, "image/png"));
});

test("APNG and animated WebP are detected before a decoder can silently keep one frame", () => {
  const png = new Uint8Array(8 + 20);
  png.set([137, 80, 78, 71, 13, 10, 26, 10]);
  new DataView(png.buffer).setUint32(8, 8);
  png.set(new TextEncoder().encode("acTL"), 12);
  assert.equal(galleryImageIsAnimated(png, "png"), true);
  const webp = new Uint8Array(30);
  webp.set(new TextEncoder().encode("RIFF"));
  webp.set(new TextEncoder().encode("WEBPVP8X"), 8);
  new DataView(webp.buffer).setUint32(16, 10, true);
  webp[20] = 2;
  assert.equal(galleryImageIsAnimated(webp, "webp"), true);
  webp[20] = 0;
  assert.equal(galleryImageIsAnimated(webp, "webp"), false);
  for (let length = 0; length < 20; length++)
    assert.equal(galleryImageIsAnimated(png.subarray(0, length), "png"), false);
});

test("gallery mutations require an exact same-origin browser request", () => {
  const request = (headers) =>
    new Request("https://gallery.example/api/gallery", { method: "POST", headers });
  requireGalleryOrigin(
    request({ origin: "https://gallery.example", "sec-fetch-site": "same-origin" }),
  );
  for (const headers of [
    {},
    { origin: "https://other.example" },
    { origin: "https://gallery.example", "sec-fetch-site": "cross-site" },
    { origin: "https://gallery.example.evil" },
  ])
    assert.throws(
      () => requireGalleryOrigin(request(headers)),
      (error) => error.status === 403,
    );
});

test("streamed bodies enforce a bound without trusting Content-Length", async () => {
  const request = (body, headers) =>
    new Request("https://gallery.example/api/gallery", {
      method: "POST",
      body,
      headers,
      duplex: "half",
    });
  assert.equal((await readGalleryBody(request("12345"), 5)).length, 5);
  await assert.rejects(
    () => readGalleryBody(request("123456"), 5),
    (error) => error.status === 413,
  );
  await assert.rejects(
    () => readGalleryBody(request("1", { "content-length": "999" }), 5),
    (error) => error.status === 413,
  );
  let canceled = false;
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array(6));
    },
    cancel() {
      canceled = true;
    },
  });
  await assert.rejects(() => readGalleryBody(request(stream), 5), GalleryError);
  assert.equal(canceled, true);
});

test("unconfigured gallery fails closed and public config never returns service credentials", async () => {
  const names = [
    "SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_URL",
    "SUPABASE_PUBLISHABLE_KEY",
    "SUPABASE_ANON_KEY",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
    "SUPABASE_SECRET_KEY",
  ];
  const saved = new Map(names.map((name) => [name, process.env[name]]));
  const jwt = (role) =>
    `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ role })).toString("base64url")}.signature`;
  try {
    for (const name of names) delete process.env[name];
    assert.deepEqual(await (await getGalleryConfig()).json(), { ready: false });
    const get = await galleryRoute(() =>
      getGallery(new Request("https://gallery.example/api/gallery")),
    );
    assert.equal(get.status, 503);
    const origin = { origin: "https://gallery.example" };
    for (const call of [
      () =>
        postGallery(
          new Request("https://gallery.example/api/gallery", { method: "POST", headers: origin }),
        ),
      () =>
        patchGalleryTitle(
          new Request("https://gallery.example/api/gallery/title", {
            method: "PATCH",
            headers: origin,
          }),
        ),
      () =>
        setGalleryDeleted(
          new Request(`https://gallery.example/api/gallery/${postA}`, {
            method: "DELETE",
            headers: origin,
          }),
          postA,
          true,
        ),
    ])
      assert.equal((await galleryRoute(call)).status, 503);
    process.env.SUPABASE_URL = "https://gallery.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = jwt("service_role");
    process.env.SUPABASE_ANON_KEY = jwt("service_role");
    assert.equal(galleryEnvironment(), null);
    assert.deepEqual(await (await getGalleryConfig()).json(), { ready: false });
    process.env.SUPABASE_ANON_KEY = jwt("anon");
    assert.ok(galleryEnvironment());
    process.env.SUPABASE_URL = "http://gallery.supabase.co";
    assert.equal(galleryEnvironment(), null);
  } finally {
    for (const [name, value] of saved)
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
  }
});

test("gallery errors preserve optimistic-conflict data but hide upstream details", async () => {
  const current = { title: "新しい作品名", version: 3 };
  const conflict = await galleryRoute(async () => {
    throw new GalleryError(409, "conflict", current);
  });
  assert.equal(conflict.status, 409);
  assert.deepEqual(await conflict.json(), { error: "conflict", current });
  const upstream = await galleryRoute(async () => {
    throw new Error("postgres://secret@private-host");
  });
  assert.equal(upstream.status, 503);
  assert.doesNotMatch(await upstream.text(), /secret|private-host/);
});

async function withMockSupabase(fetchHandler, callback) {
  const names = [
    "SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_URL",
    "SUPABASE_PUBLISHABLE_KEY",
    "SUPABASE_ANON_KEY",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
    "SUPABASE_SECRET_KEY",
  ];
  const saved = new Map(names.map((name) => [name, process.env[name]]));
  const originalFetch = globalThis.fetch;
  try {
    for (const name of names) delete process.env[name];
    process.env.SUPABASE_URL = "https://gallery-test.supabase.co";
    process.env.SUPABASE_PUBLISHABLE_KEY = "sb_publishable_gallery_test";
    process.env.SUPABASE_SECRET_KEY = "sb_secret_gallery_test";
    globalThis.fetch = fetchHandler;
    await callback();
  } finally {
    globalThis.fetch = originalFetch;
    for (const [name, value] of saved)
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
  }
}

test("public GET retains all 1113 titles beyond the default Supabase response cap without disclosing owner IDs", async () => {
  const posts = Array.from({ length: 1000 }, (_, index) => ({
    id: `u-00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    sequence: index + 1,
    owner_id: userA,
    object_path: `test/${index + 1}.webp`,
    width: 1,
    height: 1,
    created_at: "2026-10-06T00:00:00.000Z",
    deleted_at: null,
  }));
  const titles = [
    ...posts.map((post) => ({ artwork_id: post.id, title: `投稿${post.sequence}`, version: 1 })),
    ...Array.from({ length: 113 }, (_, index) => ({
      artwork_id: `g${String(index + 1).padStart(2, "0")}`,
      title: `既存${index + 1}`,
      version: 3,
    })),
  ];
  let titleRequests = 0;
  let signRequests = 0;
  await withMockSupabase(
    async (input, init) => {
      const url = new URL(String(input));
      if (url.pathname === "/rest/v1/gallery_posts") return Response.json(posts);
      if (url.pathname === "/rest/v1/gallery_titles") {
        titleRequests++;
        let selected = [...titles];
        if (url.searchParams.get("order") === "artwork_id.asc")
          selected.sort((left, right) =>
            left.artwork_id < right.artwork_id ? -1 : left.artwork_id > right.artwork_id ? 1 : 0,
          );
        const after = url.searchParams.get("artwork_id");
        if (after?.startsWith("gt."))
          selected = selected.filter((row) => row.artwork_id > after.slice(3));
        return Response.json(
          selected.slice(0, Math.min(Number(url.searchParams.get("limit") || 1000), 1000)),
        );
      }
      if (url.pathname === "/storage/v1/object/sign/gallery-images") {
        signRequests++;
        const body = JSON.parse(init.body);
        return Response.json(
          body.paths.map((path) => ({
            path,
            signedURL: `/object/sign/gallery-images/${path}?token=test`,
            error: null,
          })),
        );
      }
      throw new Error(`Unexpected mock request ${url.pathname}`);
    },
    async () => {
      const response = await galleryRoute(() =>
        getGallery(new Request("https://gallery.example/api/gallery")),
      );
      assert.equal(response.status, 200);
      const body = await response.json();
      assert.equal(Object.keys(body.titles).length, 1113);
      assert.deepEqual(body.titles.g79, { title: "既存79", version: 3 });
      assert.deepEqual(body.titles.g113, { title: "既存113", version: 3 });
      assert.deepEqual(body.titles[posts[999].id], { title: "投稿1000", version: 1 });
      assert.equal(titleRequests, 3);
      assert.equal(body.posts.length, 1000);
      assert.ok(
        body.posts.every((post) => !Object.hasOwn(post, "ownerId") && post.canDelete === false),
      );
      assert.doesNotMatch(JSON.stringify(body), new RegExp(userA));
      const reread = await galleryRoute(() =>
        getGallery(new Request("https://gallery.example/api/gallery")),
      );
      assert.equal(reread.status, 200);
      assert.equal(signRequests, 1);
      const actualNow = Date.now;
      try {
        Date.now = () => actualNow() + 15 * 60 * 1000 + 1;
        const refreshed = await galleryRoute(() =>
          getGallery(new Request("https://gallery.example/api/gallery")),
        );
        assert.equal(refreshed.status, 200);
        assert.equal(signRequests, 2);
      } finally {
        Date.now = actualNow;
      }
    },
  );
});

test("mutation routes reject remotely invalid and expired tokens and never trust the Grok dev-user switch", async () => {
  let verifications = 0;
  const jwt = (claims) =>
    `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.forged-signature`;
  const invalid = jwt({ sub: userA, exp: 9_999_999_999 });
  const expired = jwt({ sub: userA, exp: 1 });
  const anonymousToken = jwt({ sub: anonymous, exp: 9_999_999_999 });
  const oldFlag = process.env.VITE_AUTH_ENABLED;
  process.env.VITE_AUTH_ENABLED = "false";
  try {
    await withMockSupabase(
      async (input, init) => {
        assert.equal(new URL(String(input)).pathname, "/auth/v1/user");
        verifications++;
        const token = new Headers(init.headers).get("authorization").slice(7);
        if (token === anonymousToken)
          return Response.json({
            id: anonymous,
            is_anonymous: true,
            aud: "authenticated",
            role: "authenticated",
            app_metadata: {},
            user_metadata: {},
            created_at: "2026-10-06T00:00:00.000Z",
          });
        return Response.json(
          { message: token === expired ? "JWT expired" : "Invalid JWT signature", code: "bad_jwt" },
          { status: 401 },
        );
      },
      async () => {
        for (const token of [invalid, expired]) {
          const headers = {
            origin: "https://gallery.example",
            authorization: `Bearer ${token}`,
            "content-type": "application/json",
          };
          const request = (method, suffix = "") =>
            new Request(`https://gallery.example/api/gallery${suffix}`, {
              method,
              headers,
              ...(method === "PATCH"
                ? { body: JSON.stringify({ artworkId: "g01", title: "bad", expectedVersion: 0 }) }
                : {}),
            });
          for (const handler of [
            () => postGallery(request("POST")),
            () => initGalleryUpload(request("POST", "/upload")),
            () => completeGalleryUpload(request("POST", "/upload/complete")),
            () => patchGalleryTitle(request("PATCH", "/title")),
            () => setGalleryDeleted(request("DELETE", `/${postA}`), postA, true),
            () => setGalleryDeleted(request("POST", `/${postA}/restore`), postA, false),
          ])
            assert.equal((await galleryRoute(handler)).status, 401);
        }
        const cookieOnly = new Request("https://gallery.example/api/gallery/title", {
          method: "PATCH",
          headers: {
            origin: "https://gallery.example",
            cookie: "__Host-grok-auth.session_token=untrusted-dev-user",
          },
        });
        assert.equal((await galleryRoute(() => patchGalleryTitle(cookieOnly))).status, 401);
        assert.equal(verifications, 12);
      },
    );
  } finally {
    if (oldFlag === undefined) delete process.env.VITE_AUTH_ENABLED;
    else process.env.VITE_AUTH_ENABLED = oldFlag;
  }
});

test("a remotely verified anonymous visitor can upload, edit, remove and restore without a login", async () => {
  const { default: sharp } = await import("sharp");
  const image = await sharp({
    create: { width: 16, height: 24, channels: 3, background: "#9955cc" },
  })
    .webp()
    .toBuffer();
  let pending;
  let authChecks = 0;
  const actions = [];
  await withMockSupabase(
    async (input, init) => {
      const url = new URL(String(input));
      if (url.pathname === "/auth/v1/user") {
        authChecks++;
        return Response.json({
          id: anonymous,
          is_anonymous: true,
          aud: "authenticated",
          role: "authenticated",
          app_metadata: {},
          user_metadata: {},
          created_at: "2026-10-06T00:00:00.000Z",
        });
      }
      if (url.pathname.startsWith("/rest/v1/rpc/")) {
        const action = url.pathname.split("/").at(-1);
        const body = JSON.parse(init.body);
        assert.equal(body.p_user, anonymous);
        actions.push(action);
        if (action === "gallery_reserve_upload") {
          pending = {
            id: body.p_id,
            sequence: 1,
            owner_id: anonymous,
            object_path: `${body.p_id}.webp`,
            width: body.p_width,
            height: body.p_height,
            created_at: "2026-10-06T00:00:00.000Z",
            deleted_at: null,
          };
          return Response.json({ post: pending });
        }
        if (action === "gallery_complete_upload") return Response.json({ post: pending });
        if (action === "gallery_set_title")
          return Response.json({ title: body.p_title, version: 1 });
        return Response.json({ ok: true });
      }
      if (url.pathname.startsWith("/storage/v1/object/gallery-images/"))
        return Response.json({ Key: pending.object_path });
      if (url.pathname === "/storage/v1/object/sign/gallery-images")
        return Response.json([
          {
            path: pending.object_path,
            signedURL: `/object/sign/gallery-images/${pending.object_path}?token=anonymous-test`,
            error: null,
          },
        ]);
      throw new Error(`Unexpected anonymous mock request ${url.pathname}`);
    },
    async () => {
      const headers = {
        origin: "https://gallery.example",
        authorization: "Bearer anonymous-verified-token-123456789",
      };
      const body = new FormData();
      body.set("file", new File([image], "image.webp", { type: "image/webp" }));
      const upload = await galleryRoute(() =>
        postGallery(
          new Request("https://gallery.example/api/gallery", { method: "POST", headers, body }),
        ),
      );
      assert.equal(upload.status, 201);
      const uploaded = await upload.json();
      assert.equal(uploaded.post.canDelete, true);
      assert.equal(Object.hasOwn(uploaded.post, "ownerId"), false);
      assert.doesNotMatch(JSON.stringify(uploaded), new RegExp(anonymous));
      const edit = await galleryRoute(() =>
        patchGalleryTitle(
          new Request("https://gallery.example/api/gallery/title", {
            method: "PATCH",
            headers: { ...headers, "content-type": "application/json" },
            body: JSON.stringify({
              artworkId: "g113",
              title: "来訪者の作品名",
              expectedVersion: 0,
            }),
          }),
        ),
      );
      assert.equal(edit.status, 200);
      assert.deepEqual(await edit.json(), { title: "来訪者の作品名", version: 1 });
      for (const deleted of [true, false])
        assert.equal(
          (
            await galleryRoute(() =>
              setGalleryDeleted(
                new Request(`https://gallery.example/api/gallery/${pending.id}`, {
                  method: deleted ? "DELETE" : "POST",
                  headers,
                }),
                pending.id,
                deleted,
              ),
            )
          ).status,
          200,
        );
      assert.equal(authChecks, 4);
      assert.deepEqual(actions, [
        "gallery_begin_upload",
        "gallery_reserve_upload",
        "gallery_complete_upload",
        "gallery_set_title",
        "gallery_set_deleted",
        "gallery_set_deleted",
      ]);
    },
  );
});

test("signed staging upload initializes with metadata only and finalizes the exact lossless image", async () => {
  const { default: sharp } = await import("sharp");
  const image = await sharp({
    create: { width: 32, height: 24, channels: 4, background: { r: 71, g: 143, b: 202, alpha: 0.4 } },
  })
    .png()
    .toBuffer();
  let uploadId;
  let postRow;
  let signedPath;
  let finalBytes;
  let finishedUpload = false;
  let stageDownloads = 0;
  let prepareCalls = 0;
  const cleanupRemovals = [];
  const rpcCalls = [];
  await withMockSupabase(
    async (input, init) => {
      const url = new URL(String(input));
      if (url.pathname === "/auth/v1/user")
        return Response.json({
          id: anonymous,
          is_anonymous: true,
          aud: "authenticated",
          role: "authenticated",
          app_metadata: {},
          user_metadata: {},
          created_at: "2026-10-06T00:00:00.000Z",
        });
      if (url.pathname.startsWith("/rest/v1/rpc/")) {
        const name = url.pathname.split("/").at(-1);
        const body = JSON.parse(init.body);
        rpcCalls.push([name, body]);
        if (name === "gallery_upload_cleanup_claim")
          return Response.json({ uploads: [{ id: `u-${userB}`, stage_path: `u-${userB}/source` }] });
        if (name === "gallery_upload_init") {
          uploadId = body.p_id;
          return Response.json({ upload: { id: uploadId, stage_path: `${uploadId}/source`, content_type: body.p_type } });
        }
        if (name === "gallery_upload_claim" && finishedUpload)
          return Response.json({ post: { ...postRow, state: "ready" }, ready: true });
        if (name === "gallery_upload_claim")
          return Response.json({ upload: { id: uploadId, stage_path: `${uploadId}/source`, content_type: "image/png" } });
        if (name === "gallery_upload_prepare") {
          prepareCalls++;
          assert.equal(body.p_id, uploadId);
          assert.equal(body.p_format, "png");
          postRow = {
            id: uploadId,
            sequence: 1,
            owner_id: anonymous,
            object_path: `${uploadId}.png`,
            width: body.p_width,
            height: body.p_height,
            created_at: "2026-10-06T00:00:00.000Z",
            deleted_at: null,
          };
          return Response.json({ post: { ...postRow, bytes: body.p_bytes } });
        }
        if (name === "gallery_upload_finish") {
          finishedUpload = true;
          return Response.json({ post: { ...postRow, state: "ready" } });
        }
        throw new Error(`Unexpected RPC ${name}`);
      }
      if (url.pathname.startsWith("/storage/v1/object/upload/sign/")) {
        signedPath = decodeURIComponent(url.pathname.split("/storage/v1/object/upload/sign/")[1]);
        return Response.json({ url: `/object/upload/sign/${signedPath}?token=stage-token` });
      }
      if (url.pathname === "/storage/v1/object/gallery-upload-staging" && init.method === "DELETE") {
        cleanupRemovals.push(JSON.parse(init.body));
        return Response.json({ message: "temporary storage failure" }, { status: 503 });
      }
      if (url.pathname === `/storage/v1/object/gallery-upload-staging/${uploadId}/source`) {
        stageDownloads++;
        return new Response(image, { headers: { "content-type": "image/png" } });
      }
      if (url.pathname === `/storage/v1/object/gallery-images/${uploadId}.png`) {
        finalBytes = Buffer.from(await new Response(init.body).arrayBuffer());
        return Response.json({ Key: `${uploadId}.png` });
      }
      if (url.pathname === "/storage/v1/object/sign/gallery-images") {
        const body = JSON.parse(init.body);
        return Response.json(body.paths.map((path) => ({
          path,
          signedURL: `/object/sign/gallery-images/${path}?token=final-test`,
          error: null,
        })));
      }
      throw new Error(`Unexpected upload mock request ${url.pathname}`);
    },
    async () => {
      const headers = {
        origin: "https://gallery.example",
        authorization: "Bearer anonymous-verified-token-123456789",
        "content-type": "application/json",
      };
      const initialized = await galleryRoute(() => initGalleryUpload(new Request("https://gallery.example/api/gallery/upload", {
        method: "POST",
        headers,
        body: JSON.stringify({ size: image.byteLength, type: "image/png" }),
      })));
      assert.equal(initialized.status, 201, await initialized.clone().text());
      const body = await initialized.json();
      assert.equal(body.path, `${body.uploadId}/source`);
      assert.equal(body.token, "stage-token");
      assert.doesNotMatch(JSON.stringify(body), /sb_secret|service_role/);
      assert.equal(signedPath, `gallery-upload-staging/${body.uploadId}/source`);
      assert.deepEqual(rpcCalls.map(([name]) => name), ["gallery_upload_cleanup_claim", "gallery_upload_init"]);
      assert.deepEqual(cleanupRemovals, [{ prefixes: [`u-${userB}/source`] }]);
      assert.equal(rpcCalls.some(([name]) => name === "gallery_upload_cleanup_finish"), false);

      const completed = await galleryRoute(() => completeGalleryUpload(new Request("https://gallery.example/api/gallery/upload/complete", {
        method: "POST",
        headers,
        body: JSON.stringify({ uploadId: body.uploadId }),
      })));
      assert.equal(completed.status, 201, await completed.clone().text());
      const result = await completed.json();
      assert.equal(result.post.url, `https://gallery-test.supabase.co/storage/v1/object/sign/gallery-images/${body.uploadId}.png?token=final-test`);
      assert.equal(result.post.width, 32);
      assert.equal(result.post.height, 24);
      assert.equal(postRow.object_path, `${body.uploadId}.png`);
      assert.deepEqual(await sharp(finalBytes).raw().toBuffer(), await sharp(image).raw().toBuffer());
      assert.deepEqual(rpcCalls.map(([name]) => name), [
        "gallery_upload_cleanup_claim",
        "gallery_upload_init",
        "gallery_upload_claim",
        "gallery_upload_prepare",
        "gallery_upload_finish",
      ]);
      assert.deepEqual(
        Object.keys(rpcCalls[1][1]).sort(),
        ["p_id", "p_type", "p_user"].sort(),
        "the server-minted staging request carries metadata, never browser-supplied image bytes",
      );
      const callsBeforeReadyRetry = rpcCalls.length;
      const retry = await galleryRoute(() => completeGalleryUpload(new Request("https://gallery.example/api/gallery/upload/complete", {
        method: "POST",
        headers,
        body: JSON.stringify({ uploadId: body.uploadId }),
      })));
      assert.equal(retry.status, 200);
      assert.equal((await retry.json()).post.width, 32);
      assert.equal(stageDownloads, 1);
      assert.equal(prepareCalls, 1);
      assert.equal(rpcCalls.length, callsBeforeReadyRetry + 1);
    },
  );
});

test("a mismatched occupied final path rejects without deleting either object", async () => {
  const { default: sharp } = await import("sharp");
  const id = `u-${userA}`;
  const source = await sharp({
    create: { width: 8, height: 6, channels: 4, background: { r: 120, g: 40, b: 190, alpha: 0.7 } },
  }).png().toBuffer();
  const differentFinal = await sharp({
    create: { width: 8, height: 6, channels: 4, background: { r: 10, g: 20, b: 30, alpha: 0.7 } },
  }).png().toBuffer();
  const actions = [];
  const storage = [];
  await withMockSupabase(
    async (input, init) => {
      const url = new URL(String(input));
      if (url.pathname === "/auth/v1/user")
        return Response.json({
          id: anonymous,
          is_anonymous: true,
          aud: "authenticated",
          role: "authenticated",
          app_metadata: {},
          user_metadata: {},
          created_at: "2026-10-06T00:00:00.000Z",
        });
      if (url.pathname.startsWith("/rest/v1/rpc/")) {
        const name = url.pathname.split("/").at(-1);
        actions.push(name);
        if (name === "gallery_upload_claim")
          return Response.json({ upload: { id, stage_path: `${id}/source`, content_type: "image/png" } });
        if (name === "gallery_upload_prepare")
          return Response.json({ post: { id, object_path: `${id}.png`, width: 8, height: 6, bytes: JSON.parse(init.body).p_bytes } });
        if (name === "gallery_upload_release") return Response.json({ ok: true });
        throw new Error(`Unexpected RPC ${name}`);
      }
      if (url.pathname === `/storage/v1/object/gallery-upload-staging/${id}/source`)
        return new Response(source, { headers: { "content-type": "image/png" } });
      if (url.pathname === `/storage/v1/object/gallery-images/${id}.png`) {
        storage.push(init.method);
        if (init.method === "POST") return Response.json({ message: "object already exists" }, { status: 409 });
        return new Response(differentFinal, { headers: { "content-type": "image/png" } });
      }
      if (url.pathname === `/storage/v1/object/gallery-images` || url.pathname.endsWith("/remove")) {
        storage.push(`unexpected:${init.method}`);
        throw new Error("Final objects must never be deleted during conflict recovery");
      }
      throw new Error(`Unexpected conflict mock request ${url.pathname}`);
    },
    async () => {
      const response = await galleryRoute(() => completeGalleryUpload(new Request(
        "https://gallery.example/api/gallery/upload/complete",
        {
          method: "POST",
          headers: {
            origin: "https://gallery.example",
            authorization: "Bearer anonymous-verified-token-123456789",
            "content-type": "application/json",
          },
          body: JSON.stringify({ uploadId: id }),
        },
      )));
      assert.equal(response.status, 503);
      assert.deepEqual(await response.json(), { error: "画像の保存に失敗しました。時間をおいてお試しください。" });
      assert.deepEqual(storage, ["POST", "GET"]);
      assert.deepEqual(actions, ["gallery_upload_claim", "gallery_upload_prepare", "gallery_upload_release"]);
      assert.equal(actions.includes("gallery_upload_finish"), false);
    },
  );
});

test("sanitization keeps original dimensions and PNG RGBA pixels exactly", async () => {
  const { default: sharp } = await import("sharp");
  const width = 37;
  const height = 29;
  const pixels = Buffer.alloc(width * height * 4);
  for (let index = 0; index < pixels.length; index += 4) {
    const pixel = index / 4;
    pixels[index] = (pixel * 19) % 256;
    pixels[index + 1] = (pixel * 41) % 256;
    pixels[index + 2] = (pixel * 73) % 256;
    pixels[index + 3] = pixel % 5 === 0 ? 0 : (pixel * 29) % 256;
  }
  const source = await sharp(pixels, { raw: { width, height, channels: 4 } }).png().toBuffer();
  const result = await sanitizeGalleryImage(source, "image/png");
  assert.equal(result.width, width);
  assert.equal(result.height, height);
  assert.equal(result.format, "png");
  assert.equal(result.contentType, "image/png");
  assert.ok(result.bytes.byteLength <= 19 * 1024 * 1024);
  const decoded = await sharp(result.bytes).raw().toBuffer();
  assert.deepEqual(decoded, pixels);
});

function jpegWithGpsExif(jpeg) {
  const tiff = Buffer.alloc(56);
  tiff.write("II", 0, "ascii");
  tiff.writeUInt16LE(42, 2);
  tiff.writeUInt32LE(8, 4);
  tiff.writeUInt16LE(2, 8);
  tiff.writeUInt16LE(0x0112, 10);
  tiff.writeUInt16LE(3, 12);
  tiff.writeUInt32LE(1, 14);
  tiff.writeUInt16LE(6, 18);
  tiff.writeUInt16LE(0x8825, 22);
  tiff.writeUInt16LE(4, 24);
  tiff.writeUInt32LE(1, 26);
  tiff.writeUInt32LE(38, 30);
  tiff.writeUInt32LE(0, 34);
  tiff.writeUInt16LE(1, 38);
  tiff.writeUInt16LE(1, 40);
  tiff.writeUInt16LE(2, 42);
  tiff.writeUInt32LE(2, 44);
  tiff.write("N\0", 48, "ascii");
  tiff.writeUInt32LE(0, 52);
  const exif = Buffer.concat([Buffer.from("Exif\0\0", "binary"), tiff]);
  const segment = Buffer.alloc(4);
  segment[0] = 0xff;
  segment[1] = 0xe1;
  segment.writeUInt16BE(exif.length + 2, 2);
  return Buffer.concat([jpeg.subarray(0, 2), segment, exif, jpeg.subarray(2)]);
}

const pngCrcTable = Uint32Array.from({ length: 256 }, (_, value) => {
  let crc = value;
  for (let bit = 0; bit < 8; bit++) crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  return crc >>> 0;
});

function pngChunk(type, data) {
  const typeBytes = Buffer.from(type, "ascii");
  const chunk = Buffer.alloc(data.length + 12);
  chunk.writeUInt32BE(data.length, 0);
  typeBytes.copy(chunk, 4);
  data.copy(chunk, 8);
  let crc = 0xffffffff;
  for (const byte of chunk.subarray(4, 8 + data.length))
    crc = pngCrcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  chunk.writeUInt32BE((crc ^ 0xffffffff) >>> 0, 8 + data.length);
  return chunk;
}

function pngWithLargeTextChunk(source, targetBytes) {
  const end = source.subarray(source.length - 12);
  const textBytes = targetBytes - source.length - 12;
  assert.ok(textBytes >= 2);
  const text = Buffer.alloc(textBytes);
  text.write("x\0", 0, "binary");
  const textChunk = pngChunk("tEXt", text);
  assert.equal(source.length + textChunk.length, targetBytes);
  return Buffer.concat([source.subarray(0, source.length - 12), textChunk, end]);
}

function exifIfd0Tags(exif) {
  if (!exif || exif.length < 14) return [];
  const tiff = exif.subarray(6);
  const littleEndian = tiff.toString("ascii", 0, 2) === "II";
  const view = new DataView(tiff.buffer, tiff.byteOffset, tiff.byteLength);
  const read16 = (offset) => view.getUint16(offset, littleEndian);
  const read32 = (offset) => view.getUint32(offset, littleEndian);
  const ifdOffset = read32(4);
  const count = read16(ifdOffset);
  return Array.from({ length: count }, (_, index) => read16(ifdOffset + 2 + index * 12));
}

test("sanitization preserves 16-bit PNG samples and alpha without resizing", async () => {
  const { default: sharp } = await import("sharp");
  const width = 23;
  const height = 17;
  const samples = new Uint16Array(width * height * 4);
  for (let index = 0; index < samples.length; index++) samples[index] = (index * 7919) % 65536;
  for (let pixel = 0; pixel < width * height; pixel++) samples[pixel * 4 + 3] = pixel % 4 ? 65535 : 0;
  const { deflateSync, inflateSync } = await import("node:zlib");
  const rows = Buffer.alloc(height * (1 + width * 8));
  for (let y = 0; y < height; y++) {
    const rowStart = y * (1 + width * 8);
    rows[rowStart] = 0;
    for (let x = 0; x < width * 4; x++) rows.writeUInt16BE(samples[y * width * 4 + x], rowStart + 1 + x * 2);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 16;
  ihdr[9] = 6;
  const source = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(rows)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
  const sourceMetadata = await sharp(source).metadata();
  assert.equal(sourceMetadata.depth, "ushort");
  assert.equal(sourceMetadata.hasAlpha, true);

  const result = await sanitizeGalleryImage(source, "image/png");
  assert.equal(result.width, width);
  assert.equal(result.height, height);
  assert.equal(result.format, "png");
  const metadata = await sharp(result.bytes).metadata();
  assert.equal(metadata.depth, "ushort");
  assert.equal(metadata.hasAlpha, true);
  const idatData = (buffer) => {
    const chunks = [];
    for (let offset = 8; offset + 12 <= buffer.length; ) {
      const length = buffer.readUInt32BE(offset);
      const name = buffer.toString("ascii", offset + 4, offset + 8);
      if (name === "IDAT") chunks.push(buffer.subarray(offset + 8, offset + 8 + length));
      offset += length + 12;
    }
    return inflateSync(Buffer.concat(chunks));
  };
  assert.deepEqual(idatData(result.bytes), idatData(source));
});

test("PNG ICC profiles survive lossless metadata cleanup", async () => {
  const { default: sharp } = await import("sharp");
  const source = await sharp({
    create: { width: 11, height: 9, channels: 4, background: { r: 40, g: 90, b: 150, alpha: 0.6 } },
  })
    .withIccProfile("p3")
    .png()
    .toBuffer();
  const sourceProfile = (await sharp(source).metadata()).icc;
  assert.ok(sourceProfile);
  const result = await sanitizeGalleryImage(source, "image/png");
  const resultProfile = (await sharp(result.bytes).metadata()).icc;
  assert.deepEqual(resultProfile, sourceProfile);
});

test("JPEG EXIF orientation is retained while visible dimensions account for it", async () => {
  const { default: sharp } = await import("sharp");
  const width = 80;
  const height = 40;
  const source = await sharp({
    create: { width, height, channels: 3, background: "#cc4477" },
  })
    .withMetadata({ orientation: 6 })
    .jpeg({ quality: 90 })
    .toBuffer();
  const result = await sanitizeGalleryImage(source, "image/jpeg");
  assert.equal(result.width, height);
  assert.equal(result.height, width);
  assert.equal(result.format, "jpeg");
  assert.equal(result.contentType, "image/jpeg");
  const metadata = await sharp(result.bytes).metadata();
  assert.equal(metadata.format, "jpeg");
  assert.equal(metadata.orientation, 6);
  assert.deepEqual(metadata.autoOrient, { width: height, height: width });
  assert.ok(metadata.exif);
  assert.ok(result.bytes.byteLength <= 19 * 1024 * 1024);
});

test("JPEG GPS metadata is removed without changing its raster or required orientation", async () => {
  const { default: sharp } = await import("sharp");
  const jpeg = await sharp({
    create: { width: 80, height: 40, channels: 3, background: "#cc4477" },
  })
    .jpeg({ quality: 90 })
    .toBuffer();
  const source = jpegWithGpsExif(jpeg);
  const sourceMetadata = await sharp(source).metadata();
  assert.equal(sourceMetadata.orientation, 6);
  assert.ok(exifIfd0Tags(sourceMetadata.exif).includes(0x8825));
  const result = await sanitizeGalleryImage(source, "image/jpeg");
  const resultMetadata = await sharp(result.bytes).metadata();
  assert.equal(resultMetadata.orientation, 6);
  assert.ok(!exifIfd0Tags(resultMetadata.exif).includes(0x8825));
  assert.deepEqual(
    await sharp(result.bytes).rotate().raw().toBuffer(),
    await sharp(source).rotate().raw().toBuffer(),
  );
});

test("JPEG and WebP sanitization does not recompress the encoded picture", async () => {
  const { default: sharp } = await import("sharp");
  const sourcePixels = Buffer.alloc(31 * 19 * 3);
  for (let index = 0; index < sourcePixels.length; index++) sourcePixels[index] = (index * 43) % 256;
  for (const [format, type] of [["jpeg", "image/jpeg"], ["webp", "image/webp"]]) {
    const source = await sharp(sourcePixels, {
      raw: { width: 31, height: 19, channels: 3 },
    })[format]({ quality: 82 })
      .toBuffer();
    const result = await sanitizeGalleryImage(source, type);
    assert.equal(result.format, format);
    assert.equal(result.contentType, type);
    assert.equal(result.width, 31);
    assert.equal(result.height, 19);
    assert.deepEqual(
      await sharp(result.bytes).raw().toBuffer(),
      await sharp(source).raw().toBuffer(),
      `${format} raster must remain bit-for-bit identical after lossless sanitization`,
    );
  }
});

test("exact 19 MiB sources are accepted and one-byte-over inputs are rejected", async () => {
  const { default: sharp } = await import("sharp");
  const source = await sharp({
    create: { width: 4, height: 4, channels: 4, background: { r: 80, g: 120, b: 160, alpha: 0.5 } },
  })
    .png()
    .toBuffer();
  const exact = pngWithLargeTextChunk(source, 19 * 1024 * 1024);
  const result = await sanitizeGalleryImage(exact, "image/png");
  assert.equal(result.width, 4);
  assert.equal(result.height, 4);
  await assert.rejects(
    () => sanitizeGalleryImage(new Uint8Array([255, 216, 255]), "image/jpeg"),
    (error) => error.status === 400,
  );
  await assert.rejects(
    () => sanitizeGalleryImage(source, "image/jpeg"),
    (error) => error.status === 400,
  );
  await assert.rejects(
    () => sanitizeGalleryImage(new Uint8Array(19 * 1024 * 1024 + 1), "image/png"),
    (error) => error.status === 413,
  );
  // Oversized IHDR dimensions are rejected before the decoder allocates pixels.
  const bomb = new Uint8Array(source);
  new DataView(bomb.buffer).setUint32(16, 100_000);
  new DataView(bomb.buffer).setUint32(20, 100_000);
  await assert.rejects(
    () => sanitizeGalleryImage(bomb, "image/png"),
    (error) => error.status === 400,
  );
});

async function database(expandCatalogue = true) {
  const db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth; create schema storage;
    create table auth.users(id uuid primary key, is_anonymous boolean default false);
    create table storage.buckets(id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
    create table storage.objects(id uuid primary key, bucket_id text);
    alter table storage.objects enable row level security;
    insert into auth.users(id, is_anonymous) values('${userA}', false), ('${userB}', false), ('${anonymous}', true);
  `);
  await db.exec(migration);
  if (expandCatalogue) await db.exec(catalogueMigration);
  await db.exec(losslessMigration);
  return db;
}
async function call(db, name, values) {
  const argumentsSql = values.map((_, index) => `$${index + 1}`).join(",");
  const result = await db.query(`select public.${name}(${argumentsSql}) as result`, values);
  return result.rows[0].result;
}
async function post(db, user = userA, id = postA, bytes = 123) {
  const reserved = await call(db, "gallery_reserve_upload", [user, id, 200, 300, bytes]);
  assert.equal(reserved.post.id, id);
  return call(db, "gallery_complete_upload", [user, id, false]);
}

test("catalogue expansion changes only the static ID predicate of the existing title RPC", () => {
  const titleFunction = /create or replace function public\.gallery_set_title[\s\S]*?end \$\$;/;
  assert.equal(
    catalogueMigration.match(titleFunction)?.[0],
    migration
      .match(titleFunction)?.[0]
      .replace("^g(0[1-9]|[1-6][0-9]|7[0-9])$", "^g(0[1-9]|[1-9][0-9]|10[0-9]|11[0-3])$"),
  );
});

test("existing installations expand to all 34 new IDs without changing stored data or RPC privileges", async () => {
  const db = await database(false);
  try {
    await post(db);
    await call(db, "gallery_set_title", [anonymous, "g79", "保存済みの作品名", 0]);
    assert.deepEqual(await call(db, "gallery_set_title", [anonymous, "g80", "追加前", 0]), {
      error: "not_found",
    });
    const snapshot = async () => ({
      posts: (await db.query("select * from public.gallery_posts order by id")).rows,
      titles: (await db.query("select * from public.gallery_titles order by artwork_id")).rows,
      history: (await db.query("select * from public.gallery_title_history order by id")).rows,
      rates: (await db.query("select * from public.gallery_rate_limits order by user_id, action"))
        .rows,
      globalRates: (await db.query("select * from public.gallery_global_limits order by action"))
        .rows,
      rpc: (
        await db.query(
          "select proacl, prosecdef, proconfig from pg_proc where oid = 'public.gallery_set_title(uuid,text,text,integer)'::regprocedure",
        )
      ).rows,
    });
    const before = await snapshot();
    const constraintBefore = await db.query(
      "select pg_get_constraintdef(oid) as definition from pg_constraint where conrelid = 'public.gallery_titles'::regclass and conname = 'gallery_titles_artwork_id_check'",
    );
    assert.equal(constraintBefore.rows.length, 1);
    assert.match(constraintBefore.rows[0].definition, /\[1-6\]\[0-9\]/);
    await db.exec(catalogueMigration);
    assert.deepEqual(await snapshot(), before);
    // Reapplying the additive migration also preserves data and grants.
    await db.exec(catalogueMigration);
    assert.deepEqual(await snapshot(), before);
    const constraintAfter = await db.query(
      "select pg_get_constraintdef(oid) as definition from pg_constraint where conrelid = 'public.gallery_titles'::regclass and conname = 'gallery_titles_artwork_id_check'",
    );
    assert.equal(constraintAfter.rows.length, 1);
    assert.match(constraintAfter.rows[0].definition, /11\[0-3\]/);
    for (let number = 80; number <= 113; number++)
      assert.deepEqual(
        await call(db, "gallery_set_title", [
          number % 2 ? userA : userB,
          `g${number}`,
          `作品${number}`,
          0,
        ]),
        { title: `作品${number}`, version: 1 },
      );
    for (const id of ["g00", "g001", "g1", "g0113", "g114", "g999"])
      assert.deepEqual(await call(db, "gallery_set_title", [anonymous, id, "対象外", 0]), {
        error: "not_found",
      });
    await assert.rejects(db.query("insert into public.gallery_titles(artwork_id) values ('g114')"));
    assert.deepEqual(await call(db, "gallery_set_title", [anonymous, "g113", "", 1]), {
      title: "",
      version: 2,
    });
    assert.deepEqual(await call(db, "gallery_set_title", [anonymous, "g79", "従来の再編集", 1]), {
      title: "従来の再編集",
      version: 2,
    });
  } finally {
    await db.close();
  }
});

test("catalogue expansion rejects a same-named unexpected constraint before changing data or schema", async () => {
  const db = await database(false);
  try {
    await post(db);
    await call(db, "gallery_set_title", [anonymous, "g79", "保存済みの作品名", 0]);
    await db.exec(`alter table public.gallery_titles drop constraint gallery_titles_artwork_id_check;
      alter table public.gallery_titles add constraint gallery_titles_artwork_id_check
      check (artwork_id ~ '^g[0-9]{2,3}$' or artwork_id ~ '^u-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$');`);
    const snapshot = async () => ({
      posts: (await db.query("select * from public.gallery_posts order by id")).rows,
      titles: (await db.query("select * from public.gallery_titles order by artwork_id")).rows,
      history: (await db.query("select * from public.gallery_title_history order by id")).rows,
      constraint: (
        await db.query(
          "select pg_get_constraintdef(oid) as definition from pg_constraint where conrelid = 'public.gallery_titles'::regclass and conname = 'gallery_titles_artwork_id_check'",
        )
      ).rows,
      rpc: (
        await db.query(
          "select pg_get_functiondef(oid) as definition, proacl from pg_proc where oid = 'public.gallery_set_title(uuid,text,text,integer)'::regprocedure",
        )
      ).rows,
    });
    const before = await snapshot();
    await assert.rejects(db.exec(catalogueMigration), /Unexpected gallery artwork ID constraint/);
    await db.exec("rollback;");
    assert.deepEqual(await snapshot(), before);
  } finally {
    await db.close();
  }
});

test("Supabase migration denies direct anonymous/authenticated mutations and RPC calls", async () => {
  const db = await database();
  try {
    const result = await db.query(
      `select relname, relrowsecurity from pg_class where relname in ('gallery_posts','gallery_titles','gallery_title_history','gallery_rate_limits','gallery_global_limits','gallery_uploads')`,
    );
    assert.equal(result.rows.length, 6);
    assert.ok(result.rows.every((row) => row.relrowsecurity));
    for (const role of ["anon", "authenticated"]) {
      const privileges = await db.query(
        `select has_table_privilege($1, 'public.gallery_posts', 'INSERT') as inserts, has_table_privilege($1, 'public.gallery_titles', 'UPDATE') as updates, has_function_privilege($1, 'public.gallery_set_title(uuid,text,text,integer)', 'EXECUTE') as rpc`,
        [role],
      );
      assert.deepEqual(privileges.rows[0], { inserts: false, updates: false, rpc: false });
    }
    const bucket = await db.query(
      "select id, public, file_size_limit, allowed_mime_types from storage.buckets order by id",
    );
    assert.deepEqual(
      bucket.rows.map((row) => [row.id, row.public, Number(row.file_size_limit), row.allowed_mime_types]),
      [
        ["gallery-images", false, 19 * 1024 * 1024, ["image/jpeg", "image/png", "image/webp"]],
        ["gallery-upload-staging", false, 19 * 1024 * 1024, ["image/jpeg", "image/png", "image/webp"]],
      ],
    );
    assert.equal(await call(db, "gallery_upload_protocol_ready", []), true);
    const storagePolicy = await db.query(
      "select permissive, roles, cmd from pg_policies where schemaname = 'storage' and policyname = 'gallery_server_only'",
    );
    assert.equal(storagePolicy.rows[0].permissive, "RESTRICTIVE");
    assert.equal(storagePolicy.rows[0].cmd, "ALL");
    await db.exec(`
      grant usage on schema storage to authenticated;
      grant select on storage.objects to authenticated;
      create policy existing_broad_rule on storage.objects for select to authenticated using (true);
      insert into storage.objects(id,bucket_id) values('${userA}', 'gallery-images'), ('${userB}', 'unrelated-bucket');
      set role authenticated;
    `);
    const readableObjects = await db.query("select bucket_id from storage.objects");
    assert.deepEqual(readableObjects.rows, [{ bucket_id: "unrelated-bucket" }]);
    await db.exec("reset role");
  } finally {
    await db.close();
  }
});

test("upload readiness is role-invariant and fails closed when either private bucket drifts", async () => {
  const db = await database();
  const readyAsService = async () => {
    await db.exec("set role service_role");
    try {
      return await call(db, "gallery_upload_protocol_ready", []);
    } finally {
      await db.exec("reset role");
    }
  };
  try {
    // Supabase Storage uses RLS. The RPC must retain its fixed definer and
    // cannot depend on the caller having direct access to Storage's tables.
    await db.exec("alter table storage.buckets enable row level security");
    const functionSecurity = await db.query(
      `select prosecdef, proconfig from pg_proc
       where oid = 'public.gallery_upload_protocol_ready()'::regprocedure`,
    );
    assert.equal(functionSecurity.rows.length, 1);
    assert.equal(functionSecurity.rows[0].prosecdef, true);
    assert.ok(functionSecurity.rows[0].proconfig.includes("search_path=pg_catalog"));
    for (const role of ["anon", "authenticated"])
      assert.equal(
        (
          await db.query(
            "select has_function_privilege($1, 'public.gallery_upload_protocol_ready()', 'EXECUTE') as allowed",
            [role],
          )
        ).rows[0].allowed,
        false,
      );
    assert.equal(
      (
        await db.query(
          "select has_function_privilege('service_role', 'public.gallery_upload_protocol_ready()', 'EXECUTE') as allowed",
        )
      ).rows[0].allowed,
      true,
    );
    const rowSecurity = await db.query(
      `select n.nspname, c.relname, c.relrowsecurity from pg_class c
       join pg_namespace n on n.oid = c.relnamespace
       where (n.nspname, c.relname) in
         (('public', 'gallery_uploads'), ('storage', 'objects'), ('storage', 'buckets'))`,
    );
    assert.equal(rowSecurity.rows.length, 3);
    assert.ok(rowSecurity.rows.every((row) => row.relrowsecurity));

    assert.equal(await call(db, "gallery_upload_protocol_ready", []), true);
    assert.equal(await readyAsService(), true);

    // Reproduce the production drift: only the final gallery bucket has
    // reverted to the legacy 3 MiB/WebP-only setting; staging remains v2.
    await db.exec(`update storage.buckets
      set file_size_limit = 3145728, allowed_mime_types = array['image/webp']
      where id = 'gallery-images'`);
    assert.equal(await call(db, "gallery_upload_protocol_ready", []), false);
    assert.equal(await readyAsService(), false);
    const staging = await db.query(
      "select file_size_limit, allowed_mime_types from storage.buckets where id = 'gallery-upload-staging'",
    );
    assert.equal(Number(staging.rows[0].file_size_limit), 19 * 1024 * 1024);
    assert.deepEqual(staging.rows[0].allowed_mime_types, ["image/jpeg", "image/png", "image/webp"]);

    await db.exec(`update storage.buckets
      set file_size_limit = 19922944,
          allowed_mime_types = array['image/jpeg','image/png','image/webp']
      where id = 'gallery-images'`);
    assert.equal(await readyAsService(), true);

    for (const [bucket, change] of [
      ["gallery-images", "public = true"],
      ["gallery-upload-staging", "file_size_limit = 3145728"],
      ["gallery-upload-staging", "allowed_mime_types = array['image/webp']"],
      [
        "gallery-upload-staging",
        "allowed_mime_types = array['image/jpeg','image/png','image/webp','image/svg+xml']",
      ],
    ]) {
      await db.query(`update storage.buckets set ${change} where id = $1`, [bucket]);
      assert.equal(await readyAsService(), false, `${bucket}: ${change}`);
      await db.exec(`update storage.buckets
        set public = false, file_size_limit = 19922944,
            allowed_mime_types = array['image/jpeg','image/png','image/webp']
        where id in ('gallery-images','gallery-upload-staging')`);
      assert.equal(await readyAsService(), true);
    }
  } finally {
    await db.close();
  }
});

test("restore migration repairs replayed legacy setup without changing gallery data or browser grants", async () => {
  const db = await database();
  try {
    await db.exec(titleEditingMigration);
    await post(db, userA, postA, 12_345);
    assert.deepEqual(await call(db, "gallery_set_title", [userB, "g113", "保存済みの作品名", 0]), {
      title: "保存済みの作品名",
      version: 1,
    });
    assert.equal((await call(db, "gallery_upload_init", [userB, postB, "image/png"])).upload.id, postB);

    const dataSnapshot = async () => ({
      posts: (await db.query("select * from public.gallery_posts order by id")).rows,
      titles: (await db.query("select * from public.gallery_titles order by artwork_id")).rows,
      history: (await db.query("select * from public.gallery_title_history order by id")).rows,
      uploads: (await db.query("select * from public.gallery_uploads order by id")).rows,
      titleBuckets: (await db.query("select * from public.gallery_title_buckets order by bucket_key")).rows,
      rateLimits: (await db.query("select * from public.gallery_rate_limits order by user_id, action")).rows,
      globalLimits: (await db.query("select * from public.gallery_global_limits order by action")).rows,
    });
    const functionState = async () => {
      const result = await db.query(`select oid::regprocedure::text as signature, prosrc, proowner, prosecdef, proconfig, proacl
        from pg_proc where oid in (
          'public.gallery_reserve_upload(uuid,text,integer,integer,integer)'::regprocedure,
          'public.gallery_set_title(uuid,text,text,integer)'::regprocedure,
          'public.gallery_upload_protocol_ready()'::regprocedure)
        order by oid::regprocedure::text`);
      return result.rows.map((row) => ({
        ...row,
        prosrc: row.prosrc
          .split("\n")
          .filter((line) => !line.trim().startsWith("--"))
          .join("\n")
          .replace(/\n\s*\n/g, "\n")
          .trim(),
      }));
    };
    const browserGrants = async () => {
      const results = [];
      for (const role of ["anon", "authenticated"])
        results.push((await db.query(`select
          has_table_privilege($1,'public.gallery_posts','INSERT') as posts_insert,
          has_table_privilege($1,'public.gallery_uploads','INSERT') as uploads_insert,
          has_table_privilege($1,'public.gallery_titles','UPDATE') as titles_update,
          has_table_privilege($1,'public.gallery_title_buckets','UPDATE') as title_rate_update,
          has_function_privilege($1,'public.gallery_set_title(uuid,text,text,integer)','EXECUTE') as title_rpc,
          has_function_privilege($1,'public.gallery_reserve_upload(uuid,text,integer,integer,integer)','EXECUTE') as reserve_rpc,
          has_function_privilege($1,'public.gallery_upload_protocol_ready()','EXECUTE') as ready_rpc`, [role])).rows[0]);
      return results;
    };
    const originalData = await dataSnapshot();
    const originalFunctions = await functionState();
    const originalGrants = await browserGrants();
    assert.ok(originalGrants.every((grants) => Object.values(grants).every((allowed) => !allowed)));
    assert.equal(await call(db, "gallery_upload_protocol_ready", []), true);

    // Replaying obsolete bootstrap SQL reproduces the observed drift without
    // attributing how the live installation reached that state.
    await db.exec(migration);
    assert.equal(await call(db, "gallery_upload_protocol_ready", []), false);
    const driftedBuckets = await db.query(
      "select id, file_size_limit, allowed_mime_types from storage.buckets order by id",
    );
    assert.deepEqual(
      driftedBuckets.rows.map((row) => [row.id, Number(row.file_size_limit), row.allowed_mime_types]),
      [
        ["gallery-images", 3 * 1024 * 1024, ["image/webp"]],
        ["gallery-upload-staging", 19 * 1024 * 1024, ["image/jpeg", "image/png", "image/webp"]],
      ],
    );
    const driftedFunctions = await functionState();
    const titleBody = driftedFunctions.find((entry) => entry.signature.includes("gallery_set_title"));
    const reserveBody = driftedFunctions.find((entry) => entry.signature.includes("gallery_reserve_upload"));
    assert.ok(titleBody.prosrc.includes("gallery_take_rate"));
    assert.equal(titleBody.prosrc.includes("gallery_take_title_rate"), false);
    assert.ok(reserveBody.prosrc.includes("insert into public.gallery_posts"));
    assert.equal(reserveBody.prosrc.includes("public.gallery_reserve_upload(p_user,p_id,p_width,p_height,p_bytes,'webp')"), false);
    assert.deepEqual(await dataSnapshot(), originalData);

    for (let pass = 0; pass < 2; pass++) {
      await db.exec(restoreProtocolMigration);
      assert.equal(await call(db, "gallery_upload_protocol_ready", []), true);
      await db.exec("set role service_role");
      try {
        assert.equal(await call(db, "gallery_upload_protocol_ready", []), true);
      } finally {
        await db.exec("reset role");
      }
      assert.deepEqual(await dataSnapshot(), originalData);
      assert.deepEqual(await functionState(), originalFunctions);
      assert.deepEqual(await browserGrants(), originalGrants);
      const security = await db.query(`select n.nspname, c.relname, c.relrowsecurity
        from pg_class c join pg_namespace n on n.oid=c.relnamespace
        where (n.nspname,c.relname) in (('public','gallery_posts'),('public','gallery_titles'),
          ('public','gallery_uploads'),('storage','objects'))`);
      assert.equal(security.rows.length, 4);
      assert.ok(security.rows.every((row) => row.relrowsecurity));
      const policy = await db.query(`select permissive, roles, cmd from pg_policies
        where schemaname='storage' and tablename='objects' and policyname='gallery_server_only'`);
      assert.equal(policy.rows[0].permissive, "RESTRICTIVE");
      assert.equal(policy.rows[0].cmd, "ALL");
      assert.deepEqual(policy.rows[0].roles.sort(), ["anon", "authenticated"]);
    }
  } finally {
    await db.close();
  }
});

test("restore migration rolls back bucket changes when final readiness or prerequisites fail", async () => {
  const db = await database();
  try {
    await db.exec(titleEditingMigration);
    await db.exec(migration);
    const buckets = async () =>
      (await db.query("select id, public, file_size_limit, allowed_mime_types from storage.buckets order by id")).rows;
    const titleBody = async () =>
      (await db.query(
        "select prosrc from pg_proc where oid='public.gallery_set_title(uuid,text,text,integer)'::regprocedure",
      )).rows[0].prosrc;
    const oldBuckets = await buckets();
    const oldTitleBody = await titleBody();

    // The final assertion is inside the transaction: an unmet Storage RLS
    // prerequisite must not leave the bucket update or RPC replacements behind.
    await db.exec("alter table storage.objects disable row level security");
    await assert.rejects(db.exec(restoreProtocolMigration), /Gallery upload prerequisites are incomplete/);
    await db.exec("rollback");
    assert.deepEqual(await buckets(), oldBuckets);
    assert.equal(await titleBody(), oldTitleBody);

    await db.exec("alter table storage.objects enable row level security");
    await db.exec("delete from storage.buckets where id='gallery-upload-staging'");
    const singleBucket = await buckets();
    await assert.rejects(db.exec(restoreProtocolMigration), /Both existing gallery buckets are required/);
    await db.exec("rollback");
    assert.deepEqual(await buckets(), singleBucket);
    assert.equal(await titleBody(), oldTitleBody);
  } finally {
    await db.close();
  }
});

test("restore migration never creates a missing replacement RPC with public EXECUTE", async () => {
  for (const signature of [
    "gallery_set_title(uuid,text,text,integer)",
    "gallery_reserve_upload(uuid,text,integer,integer,integer)",
  ]) {
    const db = await database();
    try {
      await db.exec(titleEditingMigration);
      await post(db);
      await db.exec(migration);
      const beforeBuckets = (
        await db.query("select id, public, file_size_limit, allowed_mime_types from storage.buckets order by id")
      ).rows;
      const beforePosts = (await db.query("select * from public.gallery_posts order by id")).rows;
      await db.exec(`drop function public.${signature}`);
      assert.equal(
        (await db.query("select to_regprocedure($1) as target", [`public.${signature}`])).rows[0].target,
        null,
      );
      await assert.rejects(
        db.exec(restoreProtocolMigration),
        /Apply the four gallery migrations in order before this repair/,
        signature,
      );
      await db.exec("rollback");
      assert.equal(
        (await db.query("select to_regprocedure($1) as target", [`public.${signature}`])).rows[0].target,
        null,
        `${signature} must remain absent rather than being recreated with default PUBLIC EXECUTE`,
      );
      assert.deepEqual(
        (await db.query("select id, public, file_size_limit, allowed_mime_types from storage.buckets order by id")).rows,
        beforeBuckets,
      );
      assert.deepEqual((await db.query("select * from public.gallery_posts order by id")).rows, beforePosts);
    } finally {
      await db.close();
    }
  }
});

test("lossless upload migration keeps legacy reserve RPC and adds an idempotent format-bound lifecycle", async () => {
  const db = await database();
  try {
    const uploadId = `u-${userA}`;
    const lease = "42345678-1234-4123-8123-123456789abc";
    const digest = "a".repeat(64);
    const initialized = await call(db, "gallery_upload_init", [userA, uploadId, "image/png"]);
    assert.equal(initialized.upload.id, uploadId);
    assert.equal(initialized.upload.stage_path, `${uploadId}/source`);
    assert.equal(initialized.upload.reserved_bytes, 19 * 1024 * 1024);
    const claimed = await call(db, "gallery_upload_claim", [userA, uploadId, lease]);
    assert.equal(claimed.upload.id, uploadId);
    assert.equal(claimed.upload.state, "processing");
    assert.equal(claimed.upload.lease_id, lease);
    assert.deepEqual(
      await call(db, "gallery_upload_claim", [userA, uploadId, "52345678-1234-4123-8123-123456789abc"]),
      { error: "busy" },
    );
    const prepared = await call(db, "gallery_upload_prepare", [
      userA,
      uploadId,
      lease,
      640,
      480,
      2_000_000,
      "png",
      digest,
    ]);
    assert.equal(prepared.post.id, uploadId);
    assert.equal(prepared.post.object_path, `${uploadId}.png`);
    assert.equal(prepared.post.width, 640);
    assert.equal(prepared.post.height, 480);
    assert.equal(prepared.post.bytes, 2_000_000);
    assert.deepEqual(await call(db, "gallery_upload_prepare", [
      userA,
      uploadId,
      lease,
      640,
      480,
      2_000_000,
      "png",
      digest,
    ]), prepared);
    const finished = await call(db, "gallery_upload_finish", [userA, uploadId, lease]);
    assert.equal(finished.post.state, "ready");
    assert.deepEqual(await call(db, "gallery_upload_finish", [userA, uploadId, lease]), {
      post: finished.post,
      ready: true,
    });
    assert.deepEqual(await call(db, "gallery_upload_claim", [userA, uploadId, lease]), {
      post: finished.post,
      ready: true,
    });

    const legacy = await call(db, "gallery_reserve_upload", [userB, postB, 200, 300, 1000]);
    assert.equal(legacy.post.object_path, `${postB}.webp`);
    const formatted = await call(db, "gallery_reserve_upload", [
      userB,
      `u-32345678-1234-4123-8123-123456789abc`,
      200,
      300,
      1000,
      "jpeg",
    ]);
    assert.equal(formatted.post.object_path, `u-32345678-1234-4123-8123-123456789abc.jpeg`);
  } finally {
    await db.close();
  }
});

test("every verified visitor can edit every static and posted title with audited version conflicts", async () => {
  const db = await database();
  try {
    assert.deepEqual(
      await call(db, "gallery_set_title", ["99999999-1234-4123-8123-123456789abc", "g01", "no", 0]),
      {
        error: "auth",
      },
    );
    assert.deepEqual(await call(db, "gallery_set_title", [userA, "g01", "第一の名前", 0]), {
      title: "第一の名前",
      version: 1,
    });
    assert.deepEqual(await call(db, "gallery_set_title", [userB, "g01", "別の名前", 0]), {
      error: "conflict",
      current: { title: "第一の名前", version: 1 },
    });
    assert.deepEqual(await call(db, "gallery_set_title", [userB, "g01", "次の名前", 1]), {
      title: "次の名前",
      version: 2,
    });
    await post(db);
    assert.deepEqual(
      await call(db, "gallery_set_title", [userB, postA, "他の人の投稿にも名前を", 0]),
      { title: "他の人の投稿にも名前を", version: 1 },
    );
    const history = await db.query(
      "select previous_title, title, version, edited_by from public.gallery_title_history where artwork_id = 'g01' order by version",
    );
    assert.deepEqual(
      history.rows.map((row) => [row.previous_title, row.title, row.version, row.edited_by]),
      [
        ["", "第一の名前", 1, userA],
        ["第一の名前", "次の名前", 2, userB],
      ],
    );
    assert.deepEqual(await call(db, "gallery_set_title", [userB, "g114", "bad", 0]), {
      error: "not_found",
    });
  } finally {
    await db.close();
  }
});

test("verified anonymous database sessions own posts and can edit all titles", async () => {
  const db = await database();
  try {
    assert.deepEqual(await call(db, "gallery_begin_upload", [anonymous]), { ok: true });
    const id = `u-${anonymous}`;
    await post(db, anonymous, id);
    const stored = await db.query(
      "select owner_id, object_path from public.gallery_posts where id = $1",
      [id],
    );
    assert.deepEqual(stored.rows, [{ owner_id: anonymous, object_path: `${id}.webp` }]);
    assert.deepEqual(await call(db, "gallery_set_title", [anonymous, "g113", "来訪者の名前", 0]), {
      title: "来訪者の名前",
      version: 1,
    });
    assert.deepEqual(await call(db, "gallery_set_title", [userA, id, "別の来訪者から", 0]), {
      title: "別の来訪者から",
      version: 1,
    });
    assert.deepEqual(await call(db, "gallery_set_deleted", [anonymous, id, true]), { ok: true });
    assert.deepEqual(await call(db, "gallery_set_deleted", [anonymous, id, false]), { ok: true });
  } finally {
    await db.close();
  }
});

test("global attempt counters stop fresh sessions bypassing upload and title limits", async () => {
  const db = await database();
  try {
    await db.exec(`insert into public.gallery_global_limits(action, window_start, count) values
      ('upload', to_timestamp(floor(extract(epoch from now()) / 86400) * 86400), 99),
      ('title', to_timestamp(floor(extract(epoch from now()) / 3600) * 3600), 119);`);
    assert.deepEqual(await call(db, "gallery_begin_upload", [anonymous]), { ok: true });
    assert.deepEqual(await call(db, "gallery_begin_upload", [userA]), { error: "rate" });
    assert.deepEqual(await call(db, "gallery_set_title", [anonymous, "g01", "上限内の名前", 0]), {
      title: "上限内の名前",
      version: 1,
    });
    assert.deepEqual(await call(db, "gallery_set_title", [userA, "g02", "上限外の名前", 0]), {
      error: "rate",
    });
    const limits = await db.query(
      "select action, count from public.gallery_global_limits order by action",
    );
    assert.deepEqual(limits.rows, [
      { action: "title", count: 120 },
      { action: "upload", count: 100 },
    ]);
    const rejected = await db.query(
      "select title, version from public.gallery_titles where artwork_id = 'g02'",
    );
    assert.deepEqual(rejected.rows, [{ title: "", version: 0 }]);
  } finally {
    await db.close();
  }
});

test("title recovery history keeps recent 20000 entries and removes stale records in batches", async () => {
  const db = await database();
  try {
    await db.exec(`insert into public.gallery_titles(artwork_id, title, version) values('g01', 'current', 20000);
      insert into public.gallery_title_history(artwork_id, title, previous_title, version, edited_by)
      select 'g01', 'history-' || i, '', i, '${userA}' from generate_series(1,20000) i;`);
    assert.deepEqual(await call(db, "gallery_set_title", [anonymous, "g01", "最新の名前", 20000]), {
      title: "最新の名前",
      version: 20001,
    });
    const bounded = await db.query(
      "select count(*) as count, min(version) as earliest, max(version) as latest from public.gallery_title_history",
    );
    assert.deepEqual(
      { ...bounded.rows[0], count: Number(bounded.rows[0].count) },
      { count: 20000, earliest: 2, latest: 20001 },
    );
    await db.exec(
      "update public.gallery_title_history set edited_at = now() - interval '31 days' where version between 2 and 601",
    );
    assert.deepEqual(await call(db, "gallery_set_title", [anonymous, "g01", "次の名前", 20001]), {
      title: "次の名前",
      version: 20002,
    });
    const stale = await db.query(
      "select count(*) from public.gallery_title_history where edited_at < now() - interval '30 days'",
    );
    assert.equal(Number(stale.rows[0].count), 100);
    const current = await db.query(
      "select title, version from public.gallery_titles where artwork_id = 'g01'",
    );
    assert.deepEqual(current.rows, [{ title: "次の名前", version: 20002 }]);
  } finally {
    await db.close();
  }
});

test("competing title writes produce one winning version and one conflict", async () => {
  const db = await database();
  try {
    const results = await Promise.all([
      call(db, "gallery_set_title", [userA, "g113", "名前A", 0]),
      call(db, "gallery_set_title", [userB, "g113", "名前B", 0]),
    ]);
    const accepted = results.find((result) => !result.error);
    const rejected = results.find((result) => result.error);
    assert.equal(accepted.version, 1);
    assert.deepEqual(rejected, { error: "conflict", current: accepted });
    const history = await db.query(
      "select title, version from public.gallery_title_history where artwork_id = 'g113'",
    );
    assert.deepEqual(history.rows, [accepted]);
  } finally {
    await db.close();
  }
});

test("competing upload reservations admit only one image at the account quota boundary", async () => {
  const db = await database();
  try {
    await db.exec(`insert into public.gallery_posts(id, owner_id, object_path, width, height, bytes, state, deleted_at)
      select 'u-00000000-0000-4000-8000-' || lpad(i::text,12,'0'), '${userA}', 'seed/' || i::text, 1, 1, 1, 'ready', now() from generate_series(1,49) i;`);
    const results = await Promise.all([
      call(db, "gallery_reserve_upload", [userA, postA, 1, 1, 1]),
      call(db, "gallery_reserve_upload", [userA, postB, 1, 1, 1]),
    ]);
    assert.equal(results.filter((result) => result.post).length, 1);
    assert.deepEqual(
      results.find((result) => result.error),
      { error: "user_quota" },
    );
    const total = await db.query("select count(*) from public.gallery_posts where owner_id = $1", [
      userA,
    ]);
    assert.equal(Number(total.rows[0].count), 50);
  } finally {
    await db.close();
  }
});

test("rate counters expire in bounded batches without resetting live quota windows", async () => {
  const db = await database();
  try {
    await db.exec(`insert into public.gallery_rate_limits(user_id, action, window_start, count)
      select '${userA}', 'title', now() - interval '30 days' + i * interval '1 hour', 60 from generate_series(1,300) i;
      insert into public.gallery_rate_limits(user_id, action, window_start, count) values('${userB}', 'title', now() - interval '1 day', 59);`);
    for (const remaining of [172, 44, 0]) {
      assert.deepEqual(await call(db, "gallery_begin_upload", [userA]), { ok: true });
      const counters = await db.query(
        "select count(*) from public.gallery_rate_limits where window_start < now() - interval '7 days'",
      );
      assert.equal(Number(counters.rows[0].count), remaining);
    }
    const retained = await db.query(
      "select count from public.gallery_rate_limits where user_id = $1",
      [userB],
    );
    assert.deepEqual(retained.rows, [{ count: 59 }]);
    const live = await db.query(
      "select count from public.gallery_rate_limits where user_id = $1 and action = 'upload'",
      [userA],
    );
    assert.deepEqual(live.rows, [{ count: 3 }]);
  } finally {
    await db.close();
  }
});

test("public image deletion is owner-only, reversible and retains quota accounting", async () => {
  const db = await database();
  try {
    await post(db);
    assert.deepEqual(await call(db, "gallery_set_deleted", [userB, postA, true]), {
      error: "forbidden",
    });
    assert.deepEqual(await call(db, "gallery_set_deleted", [userA, postA, true]), { ok: true });
    assert.deepEqual(await call(db, "gallery_set_title", [userB, postA, "deleted", 0]), {
      error: "not_found",
    });
    const deleted = await db.query(
      "select deleted_at, bytes, state from public.gallery_posts where id = $1",
      [postA],
    );
    assert.ok(deleted.rows[0].deleted_at);
    assert.equal(deleted.rows[0].bytes, 123);
    assert.deepEqual(await call(db, "gallery_set_deleted", [userB, postA, false]), {
      error: "forbidden",
    });
    assert.deepEqual(await call(db, "gallery_set_deleted", [userA, postA, false]), { ok: true });
    const restored = await db.query("select deleted_at from public.gallery_posts where id = $1", [
      postA,
    ]);
    assert.equal(restored.rows[0].deleted_at, null);
  } finally {
    await db.close();
  }
});

test("upload reservations enforce durable aggregate quotas and attempts before decode", async () => {
  const db = await database();
  try {
    assert.deepEqual(
      await call(db, "gallery_begin_upload", ["99999999-1234-4123-8123-123456789abc"]),
      { error: "auth" },
    );
    for (let i = 0; i < 10; i++)
      assert.deepEqual(await call(db, "gallery_begin_upload", [userA]), { ok: true });
    assert.deepEqual(await call(db, "gallery_begin_upload", [userA]), { error: "rate" });
    const reserved = await call(db, "gallery_reserve_upload", [userA, postA, 200, 300, 123]);
    assert.equal(reserved.post.state, "pending");
    assert.deepEqual(await call(db, "gallery_complete_upload", [userB, postA, true]), {
      error: "not_found",
    });
    assert.deepEqual(await call(db, "gallery_complete_upload", [userA, postA, true]), { ok: true });
    const count = await db.query("select count(*) from public.gallery_posts");
    assert.equal(Number(count.rows[0].count), 0);
    await db.exec(`insert into public.gallery_posts(id, owner_id, object_path, width, height, bytes, state, deleted_at)
      select 'u-00000000-0000-4000-8000-' || lpad(i::text,12,'0'), '${userA}', 'seed/' || i::text, 1, 1, 3145728, 'ready', now() from generate_series(1,34) i;`);
    assert.deepEqual(await call(db, "gallery_reserve_upload", [userA, postB, 200, 300, 3145728]), {
      error: "user_quota",
    });
  } finally {
    await db.close();
  }
});
