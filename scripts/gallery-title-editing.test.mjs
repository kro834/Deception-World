import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { galleryRoute, patchGalleryTitle } from "../src/lib/gallery.server.ts";

const user = "12345678-1234-4123-8123-123456789abc";
const other = "22345678-1234-4123-8123-123456789abc";
const migration = await readFile(
  new URL("../supabase/migrations/202610070002_gallery_title_editing.sql", import.meta.url),
  "utf8",
);
async function database(upgrade = true) {
  const db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create schema auth; create schema storage;
    create table auth.users(id uuid primary key);
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid primary key,bucket_id text);
    alter table storage.objects enable row level security;
    insert into auth.users values('${user}'),('${other}');`);
  for (const name of [
    "202610060001_shared_gallery.sql",
    "202610060002_gallery_catalogue_113.sql",
    "202610070001_gallery_lossless_uploads.sql",
  ])
    await db.exec(
      await readFile(new URL(`../supabase/migrations/${name}`, import.meta.url), "utf8"),
    );
  if (upgrade) await db.exec(migration);
  return db;
}
async function title(db, text, expected, owner = user, artwork = "g01") {
  return (
    await db.query("select public.gallery_set_title($1,$2,$3,$4) as result", [
      owner,
      artwork,
      text,
      expected,
    ])
  ).rows[0].result;
}

test("old hourly lockout reproduces; migration allows continued editing without resetting upload limits", async () => {
  const db = await database(false);
  try {
    for (let index = 1; index <= 20; index++)
      assert.equal((await title(db, `name ${index}`, index - 1)).version, index);
    assert.deepEqual(await title(db, "name 21", 20), { error: "rate" });
    await db.exec(`insert into public.gallery_rate_limits(user_id,action,window_start,count)
      values('${user}','upload',date_trunc('day',now()),10);`);
    await db.exec(migration);
    assert.deepEqual(await title(db, "name 21", 20), { title: "name 21", version: 21 });
    assert.equal(
      (await db.query("select count from public.gallery_rate_limits where action='upload'")).rows[0]
        .count,
      10,
    );
  } finally {
    await db.close();
  }
});

test("title burst limit returns a short retry and replenishes without an hour wait", async () => {
  const db = await database();
  try {
    for (let index = 1; index <= 20; index++)
      assert.equal((await title(db, `name ${index}`, index - 1)).version, index);
    // Pin an exhausted bucket so heavily loaded parallel CI does not replenish
    // capacity between the test's setup query and assertion.
    await db.query(
      "update public.gallery_title_buckets set tokens=0,updated_at=clock_timestamp()+interval '5 minutes' where bucket_key=$1",
      [user],
    );
    const limited = await title(db, "next name", 20);
    assert.equal(limited.error, "title_rate");
    assert.ok(limited.retry_after >= 1 && limited.retry_after <= 3);
    await db.query(
      "update public.gallery_title_buckets set updated_at=clock_timestamp()-interval '3.1 seconds' where bucket_key=$1",
      [user],
    );
    assert.deepEqual(await title(db, "next name", 20), { title: "next name", version: 21 });
  } finally {
    await db.close();
  }
});

test("global title bucket cannot be bypassed with another account and rejected edits consume neither bucket", async () => {
  const db = await database();
  try {
    await title(db, "first", 0);
    await db.exec(
      "update public.gallery_title_buckets set tokens=0,updated_at=clock_timestamp()+interval '5 minutes' where bucket_key='global'",
    );
    const result = await title(db, "other", 1, other);
    assert.equal(result.error, "title_rate");
    assert.equal(result.retry_after, 1);
    assert.equal(
      (
        await db.query("select tokens from public.gallery_title_buckets where bucket_key=$1", [
          other,
        ])
      ).rows[0].tokens,
      "20",
    );
    await db.exec(
      "update public.gallery_title_buckets set updated_at=clock_timestamp()-interval '1 second' where bucket_key='global'",
    );
    assert.equal((await title(db, "other", 1, other)).version, 2);
  } finally {
    await db.close();
  }
});

test("same saved title retries are idempotent while different stale edits remain conflicts", async () => {
  const db = await database();
  try {
    await title(db, "saved", 0);
    await db.exec("update public.gallery_title_buckets set tokens=0,updated_at=clock_timestamp()");
    assert.deepEqual(await title(db, " saved ", 0), { title: "saved", version: 1 });
    assert.deepEqual(await title(db, "different", 0), {
      error: "conflict",
      current: { title: "saved", version: 1 },
    });
    assert.equal(
      (await db.query("select count(*)::integer as count from public.gallery_title_history"))
        .rows[0].count,
      1,
    );
    assert.deepEqual(await title(db, "saved", 0, "99999999-1234-4123-8123-123456789abc"), {
      error: "auth",
    });
    assert.deepEqual(await title(db, "saved", 0, user, "g114"), { error: "not_found" });
    for (const role of ["anon", "authenticated"])
      assert.deepEqual(
        (
          await db.query(
            "select has_table_privilege($1,'public.gallery_title_buckets','UPDATE') as writes,has_function_privilege($1,'public.gallery_take_title_rate(uuid)','EXECUTE') as helper",
            [role],
          )
        ).rows[0],
        { writes: false, helper: false },
      );
  } finally {
    await db.close();
  }
});

test("title API returns Retry-After for throttling and needs only auth plus mutation, not a gallery reload", async () => {
  const keys = ["SUPABASE_URL", "SUPABASE_PUBLISHABLE_KEY", "SUPABASE_SERVICE_ROLE_KEY"];
  const previous = keys.map((key) => process.env[key]);
  const originalFetch = globalThis.fetch;
  process.env.SUPABASE_URL = "https://title-editing.example";
  process.env.SUPABASE_PUBLISHABLE_KEY = "sb_publishable_title_test";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "sb_secret_title_test";
  const paths = [];
  let result = { error: "title_rate", retry_after: 3 };
  globalThis.fetch = async (input) => {
    const path = new URL(
      typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
    ).pathname;
    paths.push(path);
    if (path === "/auth/v1/user")
      return Response.json({ id: user, aud: "authenticated", role: "authenticated" });
    assert.equal(path, "/rest/v1/rpc/gallery_set_title");
    return Response.json(result);
  };
  const request = () =>
    new Request("https://gallery.example/api/gallery/title", {
      method: "PATCH",
      headers: {
        origin: "https://gallery.example",
        authorization: `Bearer ${"a".repeat(30)}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ artworkId: "g01", title: "new title", expectedVersion: 0 }),
    });
  try {
    const limited = await galleryRoute(() => patchGalleryTitle(request()));
    assert.equal(limited.status, 429);
    assert.equal(limited.headers.get("retry-after"), "3");
    assert.equal((await limited.json()).retryAfterSeconds, 3);
    result = { title: "new title", version: 1 };
    const saved = await galleryRoute(() => patchGalleryTitle(request()));
    assert.equal(saved.status, 200);
    assert.deepEqual(await saved.json(), result);
    assert.deepEqual(paths, [
      "/auth/v1/user",
      "/rest/v1/rpc/gallery_set_title",
      "/auth/v1/user",
      "/rest/v1/rpc/gallery_set_title",
    ]);
  } finally {
    globalThis.fetch = originalFetch;
    keys.forEach((key, index) => {
      if (previous[index] === undefined) delete process.env[key];
      else process.env[key] = previous[index];
    });
  }
});
