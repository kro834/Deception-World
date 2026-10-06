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

const userA = "12345678-1234-4123-8123-123456789abc";
const userB = "22345678-1234-4123-8123-123456789abc";
const anonymous = "32345678-1234-4123-8123-123456789abc";
const postA = `u-${userA}`;
const postB = `u-${userB}`;
const migration = await readFile(
  new URL("../supabase/migrations/202610060001_shared_gallery.sql", import.meta.url),
  "utf8",
);

test("gallery server validates static IDs, public UUIDs, titles and concurrency versions", () => {
  for (const id of ["g01", "g79", postA]) assert.equal(validGalleryArtworkId(id), true);
  for (const id of ["g00", "g80", "g1", "p-12345678-1234-4123-8123-123456789abc", "__proto__"])
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

test("public GET retains all 1079 titles beyond the default Supabase response cap without disclosing owner IDs", async () => {
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
    ...Array.from({ length: 79 }, (_, index) => ({
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
      assert.equal(Object.keys(body.titles).length, 1079);
      assert.deepEqual(body.titles.g79, { title: "既存79", version: 3 });
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
        assert.equal(verifications, 8);
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
            body: JSON.stringify({ artworkId: "g79", title: "来訪者の作品名", expectedVersion: 0 }),
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

test("image sanitization bounds dimensions, rotates pixels and removes original metadata", async () => {
  const { default: sharp } = await import("sharp");
  const source = await sharp({
    create: { width: 3000, height: 500, channels: 3, background: "#55aaff" },
  })
    .png()
    .toBuffer();
  const result = await sanitizeGalleryImage(source, "image/png");
  assert.equal(result.width, 2400);
  assert.equal(result.height, 400);
  assert.ok(result.bytes.byteLength <= 3 * 1024 * 1024);
  const jpeg = await sharp({
    create: { width: 80, height: 40, channels: 3, background: "#cc4477" },
  })
    .withMetadata({ orientation: 6 })
    .jpeg()
    .toBuffer();
  const rotated = await sanitizeGalleryImage(jpeg, "image/jpeg");
  assert.equal(rotated.width, 40);
  assert.equal(rotated.height, 80);
  const metadata = await sharp(rotated.bytes).metadata();
  assert.equal(metadata.format, "webp");
  for (const key of ["exif", "xmp", "icc", "orientation"]) assert.equal(metadata[key], undefined);
  await assert.rejects(
    () => sanitizeGalleryImage(new Uint8Array([255, 216, 255]), "image/jpeg"),
    (error) => error.status === 400,
  );
  await assert.rejects(
    () => sanitizeGalleryImage(source, "image/jpeg"),
    (error) => error.status === 400,
  );
  await assert.rejects(
    () => sanitizeGalleryImage(new Uint8Array(10 * 1024 * 1024 + 1), "image/png"),
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

async function database() {
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

test("Supabase migration denies direct anonymous/authenticated mutations and RPC calls", async () => {
  const db = await database();
  try {
    const result = await db.query(
      `select relname, relrowsecurity from pg_class where relname in ('gallery_posts','gallery_titles','gallery_title_history','gallery_rate_limits','gallery_global_limits')`,
    );
    assert.equal(result.rows.length, 5);
    assert.ok(result.rows.every((row) => row.relrowsecurity));
    for (const role of ["anon", "authenticated"]) {
      const privileges = await db.query(
        `select has_table_privilege($1, 'public.gallery_posts', 'INSERT') as inserts, has_table_privilege($1, 'public.gallery_titles', 'UPDATE') as updates, has_function_privilege($1, 'public.gallery_set_title(uuid,text,text,integer)', 'EXECUTE') as rpc`,
        [role],
      );
      assert.deepEqual(privileges.rows[0], { inserts: false, updates: false, rpc: false });
    }
    const bucket = await db.query(
      "select public, file_size_limit, allowed_mime_types from storage.buckets",
    );
    assert.equal(bucket.rows[0].public, false);
    assert.equal(Number(bucket.rows[0].file_size_limit), 3 * 1024 * 1024);
    assert.deepEqual(bucket.rows[0].allowed_mime_types, ["image/webp"]);
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
    assert.deepEqual(await call(db, "gallery_set_title", [userB, "g80", "bad", 0]), {
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
    assert.deepEqual(await call(db, "gallery_set_title", [anonymous, "g79", "来訪者の名前", 0]), {
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
      call(db, "gallery_set_title", [userA, "g79", "名前A", 0]),
      call(db, "gallery_set_title", [userB, "g79", "名前B", 0]),
    ]);
    const accepted = results.find((result) => !result.error);
    const rejected = results.find((result) => result.error);
    assert.equal(accepted.version, 1);
    assert.deepEqual(rejected, { error: "conflict", current: accepted });
    const history = await db.query(
      "select title, version from public.gallery_title_history where artwork_id = 'g79'",
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
