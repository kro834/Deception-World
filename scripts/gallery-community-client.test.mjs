import assert from "node:assert/strict";
import test from "node:test";
import {
  communityPostToArtwork,
  COMMUNITY_GALLERY_TITLE_LIMIT,
  createGalleryAuthClient,
  deleteCommunityGalleryImage,
  ensureGalleryWriteSession,
  galleryNumberFor,
  GalleryRequestError,
  isCommunityGalleryId,
  mergeCommunityGalleryTitles,
  normalizeCommunityGalleryCollection,
  postCommunityGalleryImage,
  prepareCommunityUpload,
  readCommunityGallery,
  readCommunityImageDimensions,
  restoreCommunityGalleryImage,
  subscribeGallerySession,
  updateCommunityGalleryTitle,
  validateCommunityImageDimensions,
  validateCommunityImageFile,
  validateCommunityStillImage,
} from "../src/components/gallery/gallery-community-client.ts";
import {
  filterGalleryArtworks,
  GALLERY_FAVORITES_KEY,
  readGalleryFavorites,
  toggleGalleryFavorite,
} from "../src/components/gallery/gallery-discovery.ts";

const id = "u-12345678-1234-4123-8123-123456789abc";
const secondId = "u-22345678-1234-4123-8123-123456789abc";
const post = {
  id,
  sequence: 1,
  width: 200,
  height: 300,
  url: "https://images.example/gallery/image.webp",
  createdAt: "2026-10-06T00:00:00Z",
  canDelete: true,
};

function png(width = 640, height = 480) {
  const bytes = new Uint8Array(24);
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10]);
  bytes.set([73, 72, 68, 82], 12);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return bytes;
}

test("input limits accept supported raster formats through 19 MiB and reject larger originals", () => {
  const limit = 19 * 1024 * 1024;
  for (const type of ["image/jpeg", "image/png", "image/webp"])
    validateCommunityImageFile({ type, size: limit });
  for (const type of ["image/svg+xml", "image/gif", "text/html", ""])
    assert.throws(() => validateCommunityImageFile({ type, size: 100 }), /JPEG/);
  assert.throws(() => validateCommunityImageFile({ type: "image/png", size: 0 }), /空/);
  assert.throws(() => validateCommunityImageFile({ type: "image/png", size: limit + 1 }), /19MB/);
  validateCommunityImageDimensions(8000, 5000);
  assert.throws(() => validateCommunityImageDimensions(8001, 5000), /4,000万/);
  for (const size of [
    [0, 2],
    [-1, 2],
    [1.5, 2],
    [NaN, 2],
    [Infinity, 2],
  ])
    assert.throws(() => validateCommunityImageDimensions(...size));
});

test("raster signatures, dimensions and truncation are checked before browser decoding", () => {
  assert.deepEqual(readCommunityImageDimensions(png(), "image/png"), { width: 640, height: 480 });
  assert.throws(() => readCommunityImageDimensions(png(8001, 5000), "image/png"), /4,000万/);
  assert.throws(() => readCommunityImageDimensions(png(), "image/jpeg"));
  assert.throws(() =>
    readCommunityImageDimensions(
      new TextEncoder().encode("<svg width='100' height='100'/>"),
      "image/png",
    ),
  );
  for (let length = 0; length < 24; length++)
    assert.throws(() => readCommunityImageDimensions(png().slice(0, length), "image/png"));
  for (const marker of [0xc0, 0xc2]) {
    const jpeg = new Uint8Array([
      255,
      216,
      255,
      225,
      0,
      4,
      0,
      0,
      255,
      marker,
      0,
      8,
      8,
      1,
      44,
      0,
      200,
      1,
    ]);
    assert.deepEqual(readCommunityImageDimensions(jpeg, "image/jpeg"), { width: 200, height: 300 });
    assert.throws(() => readCommunityImageDimensions(jpeg.slice(0, 16), "image/jpeg"));
  }
});

test("WebP VP8X, VP8L and VP8 dimensions are validated", () => {
  for (const kind of ["VP8X", "VP8L", "VP8 "]) {
    const payload = kind === "VP8L" ? 5 : 10;
    const bytes = new Uint8Array(20 + payload + (payload % 2));
    const view = new DataView(bytes.buffer);
    bytes.set(new TextEncoder().encode("RIFF"));
    view.setUint32(4, bytes.length - 8, true);
    bytes.set(new TextEncoder().encode("WEBP"), 8);
    bytes.set(new TextEncoder().encode(kind), 12);
    view.setUint32(16, payload, true);
    if (kind === "VP8X") {
      view.setUint32(24, 199, true);
      bytes[27] = 43;
      bytes[28] = 1;
    }
    if (kind === "VP8L") {
      bytes[20] = 0x2f;
      view.setUint32(21, 199 | (299 << 14), true);
    }
    if (kind === "VP8 ") {
      bytes.set([157, 1, 42], 23);
      view.setUint16(26, 200, true);
      view.setUint16(28, 300, true);
    }
    assert.deepEqual(readCommunityImageDimensions(bytes, "image/webp"), {
      width: 200,
      height: 300,
    });
    assert.throws(() => readCommunityImageDimensions(bytes.slice(0, 22), "image/webp"));
  }
});

function animatedPng() {
  const bytes = new Uint8Array(53);
  bytes.set(png());
  const view = new DataView(bytes.buffer);
  view.setUint32(8, 13);
  view.setUint32(33, 8);
  bytes.set(new TextEncoder().encode("acTL"), 37);
  view.setUint32(41, 2);
  return bytes;
}

function animatedWebp(kind = "VP8X") {
  const bytes = new Uint8Array(kind === "VP8X" ? 30 : 44);
  const view = new DataView(bytes.buffer);
  bytes.set(new TextEncoder().encode("RIFF"));
  view.setUint32(4, bytes.length - 8, true);
  bytes.set(new TextEncoder().encode("WEBPVP8X"), 8);
  view.setUint32(16, 10, true);
  bytes[20] = kind === "VP8X" ? 0x02 : 0;
  bytes[24] = 199;
  bytes[27] = 43;
  bytes[28] = 1;
  if (kind !== "VP8X") {
    bytes.set(new TextEncoder().encode(kind), 30);
    view.setUint32(34, 6, true);
  }
  return bytes;
}

test("APNG and animated WebP are rejected before upload", async () => {
  assert.throws(() => readCommunityImageDimensions(animatedPng(), "image/png"), /アニメーション/);
  for (const kind of ["VP8X", "ANIM", "ANMF"])
    assert.throws(
      () => readCommunityImageDimensions(animatedWebp(kind), "image/webp"),
      /アニメーション/,
    );
  await assert.rejects(
    prepareCommunityUpload(new File([animatedPng()], "animation.png", { type: "image/png" })),
    /アニメーション/,
  );
});

test("animation chunk names inside compressed pixel data do not produce false positives", () => {
  const bytes = new Uint8Array(61);
  bytes.set(png());
  const view = new DataView(bytes.buffer);
  view.setUint32(8, 13);
  view.setUint32(33, 4);
  bytes.set(new TextEncoder().encode("IDATacTL"), 37);
  bytes.set(new TextEncoder().encode("IEND"), 53);
  assert.doesNotThrow(() => validateCommunityStillImage(bytes, "image/png"));
});

test("browser upload preparation preserves original bytes, MIME and dimensions without image or canvas allocation", async (t) => {
  const calls = { createObjectURL: 0, revokeObjectURL: 0, canvas: 0, image: 0 };
  const originals = new Map();
  for (const [name, value] of Object.entries({
    Image: class {
      constructor() {
        calls.image++;
        throw new Error("Image decoding must not run in the browser upload path");
      }
    },
    document: {
      createElement() {
        calls.canvas++;
        throw new Error("Canvas encoding must not run in the browser upload path");
      },
    },
  })) {
    originals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
    Object.defineProperty(globalThis, name, { value, writable: true, configurable: true });
  }
  const createObjectURL = URL.createObjectURL;
  const revokeObjectURL = URL.revokeObjectURL;
  URL.createObjectURL = (...args) => {
    calls.createObjectURL++;
    return createObjectURL.apply(URL, args);
  };
  URL.revokeObjectURL = (...args) => {
    calls.revokeObjectURL++;
    return revokeObjectURL.apply(URL, args);
  };
  t.after(() => {
    for (const [name, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else Reflect.deleteProperty(globalThis, name);
    }
    URL.createObjectURL = createObjectURL;
    URL.revokeObjectURL = revokeObjectURL;
  });

  const source = png(3000, 500);
  const file = new File([source], "original-artwork.png", { type: "image/png" });
  const prepared = await prepareCommunityUpload(file);
  assert.equal(prepared.type, file.type);
  assert.equal(prepared.name, "gallery-upload.png");
  assert.deepEqual(new Uint8Array(await prepared.arrayBuffer()), source);
  assert.deepEqual(
    readCommunityImageDimensions(new Uint8Array(await prepared.arrayBuffer()), prepared.type),
    {
      width: 3000,
      height: 500,
    },
  );
  assert.deepEqual(calls, { createObjectURL: 0, revokeObjectURL: 0, canvas: 0, image: 0 });
});

test("exact 19 MiB upload stays intact while invalid dimensions reject before browser allocation", async (t) => {
  const originals = new Map();
  for (const [name, value] of Object.entries({
    Image: class {
      constructor() {
        throw new Error("unexpected image decode");
      }
    },
    document: {
      createElement() {
        throw new Error("unexpected canvas allocation");
      },
    },
  })) {
    originals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
    Object.defineProperty(globalThis, name, { value, writable: true, configurable: true });
  }
  t.after(() => {
    for (const [name, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else Reflect.deleteProperty(globalThis, name);
    }
  });
  const limit = 19 * 1024 * 1024;
  const payload = new Uint8Array(limit);
  payload.set(png());
  const accepted = await prepareCommunityUpload(
    new File([payload], "limit.png", { type: "image/png" }),
  );
  assert.equal(accepted.size, limit);
  assert.deepEqual(new Uint8Array(await accepted.arrayBuffer()), payload);
  await assert.rejects(
    prepareCommunityUpload(
      new File([new Uint8Array(limit + 1)], "over.png", { type: "image/png" }),
    ),
    /19MB/,
  );
  await assert.rejects(
    prepareCommunityUpload(new File([png(8001, 5000)], "too-big.png", { type: "image/png" })),
    /4,000万/,
  );
});

test("public numbers are unchanged and shared upload numbering survives filtering and title edits", () => {
  assert.equal(isCommunityGalleryId(id), true);
  assert.equal(isCommunityGalleryId("u-001"), false);
  assert.equal(galleryNumberFor({ id: "g79" }), "079");
  assert.equal(galleryNumberFor({ id: "g80" }), "080");
  assert.equal(galleryNumberFor({ id: "g99" }), "099");
  assert.equal(galleryNumberFor({ id: "g100" }), "100");
  assert.equal(galleryNumberFor({ id: "g112" }), "112");
  assert.equal(galleryNumberFor({ id: "g113" }), "113");
  const artwork = communityPostToArtwork(post);
  assert.equal(galleryNumberFor(artwork), "U001");
  assert.equal(artwork.full, post.url);
  assert.equal(artwork.srcSet, "");
  for (const query of ["Ｕ００１", "共有タイトル"])
    assert.deepEqual(
      filterGalleryArtworks([artwork], {
        category: "community",
        query,
        favoritesOnly: true,
        favorites: [id],
        titles: { [id]: "共有タイトル" },
      }),
      [artwork],
    );
});

test("favorites stay local and retain valid shared IDs while asynchronous posts are loading", () => {
  let value = JSON.stringify([id, "g01", "u-unsafe"]);
  const storage = {
    getItem: () => value,
    setItem: (key, next) => {
      assert.equal(key, GALLERY_FAVORITES_KEY);
      value = next;
    },
  };
  assert.deepEqual(readGalleryFavorites(storage, ["g01"]), ["g01"]);
  assert.deepEqual(toggleGalleryFavorite(storage, "g02", ["g01", "g02"]), [id, "g01", "g02"]);
  assert.throws(() => toggleGalleryFavorite(storage, secondId, ["g01"]));
});

test("response validation rejects unsafe image URLs and malformed records and does not display hidden posts", () => {
  const hidden = { ...post, id: secondId, sequence: 2, deletedAt: "2026-10-06T01:00:00Z" };
  const collection = normalizeCommunityGalleryCollection({
    posts: [post, hidden],
    titles: { g01: { title: "共有", version: 1 }, bad: { title: "bad", version: 1 } },
    deletedPosts: [hidden],
  });
  assert.deepEqual(collection.posts, [post]);
  assert.deepEqual(collection.deletedPosts, [hidden]);
  assert.deepEqual(collection.titles, { g01: { title: "共有", version: 1 } });
  assert.equal("ownerId" in collection.posts[0], false);
  for (const change of [
    { url: "javascript:alert(1)" },
    { width: 0 },
    { sequence: 0 },
    { id: "u-unsafe" },
    { canDelete: "true" },
  ])
    assert.throws(() =>
      normalizeCommunityGalleryCollection({ posts: [{ ...post, ...change }], titles: {} }),
    );
});

test("shared titles accept every catalogue ID through 113 and discard unknown or padded aliases", async (t) => {
  const known = Array.from({ length: 113 }, (_, index) => `g${String(index + 1).padStart(2, "0")}`);
  const unknown = ["g00", "g001", "g1", "g0113", "g114", "g999"];
  const entry = { title: "共有の作品名", version: 1 };
  const titles = Object.fromEntries([...known, ...unknown].map((id) => [id, entry]));
  assert.deepEqual(
    normalizeCommunityGalleryCollection({ posts: [], titles }).titles,
    Object.fromEntries(known.map((id) => [id, entry])),
  );
  const fetchMock = t.mock.method(globalThis, "fetch", async (_input, init) => {
    assert.equal(init.method, "PATCH");
    assert.equal(init.headers.get("Authorization"), "Bearer anonymous-session");
    assert.equal(JSON.parse(init.body).artworkId, "g113");
    return Response.json(entry);
  });
  assert.deepEqual(
    await updateCommunityGalleryTitle("g113", entry.title, 0, "anonymous-session"),
    entry,
  );
  for (const id of unknown)
    await assert.rejects(updateCommunityGalleryTitle(id, entry.title, 0, "anonymous-session"));
  assert.equal(fetchMock.mock.callCount(), 1);
});

test("title saves can repeat with the returned version and accept the server's 120-character limit", async (t) => {
  assert.equal(COMMUNITY_GALLERY_TITLE_LIMIT, 120);
  const longTitle = "花".repeat(COMMUNITY_GALLERY_TITLE_LIMIT);
  const saved = [
    { title: "一度目", version: 1 },
    { title: longTitle, version: 2 },
  ];
  const calls = [];
  const fetchMock = t.mock.method(globalThis, "fetch", async (_path, options) => {
    const body = JSON.parse(options.body);
    calls.push(body);
    return Response.json(saved[calls.length - 1]);
  });
  assert.deepEqual(await updateCommunityGalleryTitle("g01", "一度目", 0, "test-token"), saved[0]);
  assert.deepEqual(await updateCommunityGalleryTitle("g01", longTitle, 1, "test-token"), saved[1]);
  await assert.rejects(
    updateCommunityGalleryTitle(
      "g01",
      "花".repeat(COMMUNITY_GALLERY_TITLE_LIMIT + 1),
      2,
      "test-token",
    ),
    /120文字まで/,
  );
  assert.equal(fetchMock.mock.callCount(), 2, "each save uses only its title mutation response");
  assert.deepEqual(
    calls.map(({ artworkId, expectedVersion }) => [artworkId, expectedVersion]),
    [
      ["g01", 0],
      ["g01", 1],
    ],
  );

  const older = { [id]: { title: "古い保存", version: 4 } };
  const newer = { [id]: { title: "新しい保存", version: 5 } };
  assert.deepEqual(mergeCommunityGalleryTitles(newer, older), newer);
  assert.deepEqual(mergeCommunityGalleryTitles(older, newer), newer);
});

test("title rate limits carry a retry interval and allow retrying the unchanged draft", async (t) => {
  const calls = [];
  const fetchMock = t.mock.method(globalThis, "fetch", async (_path, options) => {
    calls.push(JSON.parse(options.body));
    if (calls.length === 1)
      return Response.json(
        { error: "更新が集中しています。", retryAfterSeconds: 4 },
        { status: 429, headers: { "Retry-After": "4" } },
      );
    return Response.json({ title: "再試行後", version: 3 });
  });
  let throttled;
  try {
    await updateCommunityGalleryTitle("g01", "再試行後", 2, "test-token");
  } catch (error) {
    throttled = error;
  }
  assert.ok(throttled instanceof GalleryRequestError);
  assert.equal(throttled.status, 429);
  assert.equal(throttled.retryAfterSeconds, 4);
  assert.equal(
    JSON.stringify(await updateCommunityGalleryTitle("g01", "再試行後", 2, "test-token")),
    JSON.stringify({ title: "再試行後", version: 3 }),
  );
  assert.equal(fetchMock.mock.callCount(), 2);
  assert.deepEqual(calls, [
    { artworkId: "g01", title: "再試行後", expectedVersion: 2 },
    { artworkId: "g01", title: "再試行後", expectedVersion: 2 },
  ]);
});

test("later auth events win over an earlier session read and unmount unsubscribes", async () => {
  for (const event of ["SIGNED_IN", "SIGNED_OUT"]) {
    let finishRead;
    let listener;
    let unsubscriptions = 0;
    const initial = { access_token: "old-token", user: { id: "old-user" } };
    const latest =
      event === "SIGNED_IN" ? { access_token: "new-token", user: { id: "new-user" } } : null;
    const client = {
      auth: {
        getSession: () =>
          new Promise((resolve) => {
            finishRead = resolve;
          }),
        onAuthStateChange: (callback) => {
          listener = callback;
          return {
            data: {
              subscription: {
                unsubscribe: () => {
                  unsubscriptions++;
                },
              },
            },
          };
        },
      },
    };
    const sessions = [];
    const subscription = subscribeGallerySession(client, (session) => sessions.push(session));
    listener(event, latest);
    finishRead({ data: { session: initial }, error: null });
    await subscription.loaded;
    assert.deepEqual(sessions, [latest]);
    subscription.unsubscribe();
    listener("SIGNED_IN", initial);
    assert.deepEqual(sessions, [latest]);
    assert.equal(unsubscriptions, 1);
  }
});

test("a session read completing after unmount never updates page state", async () => {
  let finishRead;
  const sessions = [];
  const client = {
    auth: {
      getSession: () =>
        new Promise((resolve) => {
          finishRead = resolve;
        }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
    },
  };
  const subscription = subscribeGallerySession(client, (session) => sessions.push(session));
  subscription.unsubscribe();
  finishRead({ data: { session: { access_token: "old-token" } }, error: null });
  await subscription.loaded;
  assert.deepEqual(sessions, []);
});

test("read-only visitors receive no anonymous account from session observation", async () => {
  let anonymousCalls = 0;
  const client = {
    auth: {
      getSession: async () => ({ data: { session: null }, error: null }),
      signInAnonymously: async () => {
        anonymousCalls++;
      },
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
    },
  };
  const sessions = [];
  const observation = subscribeGallerySession(client, (session) => sessions.push(session));
  await observation.loaded;
  observation.unsubscribe();
  assert.deepEqual(sessions, [null]);
  assert.equal(anonymousCalls, 0);
});

test("intentional concurrent writes create one anonymous session and reuse it afterward", async () => {
  let current = null;
  let anonymousCalls = 0;
  const anonymous = {
    access_token: "anonymous-test-token",
    user: { id: "browser-session", is_anonymous: true },
  };
  const client = {
    auth: {
      getSession: async () => ({ data: { session: current }, error: null }),
      signInAnonymously: async () => {
        anonymousCalls++;
        current = anonymous;
        return { data: { session: anonymous }, error: null };
      },
    },
  };
  assert.deepEqual(
    await Promise.all([ensureGalleryWriteSession(client), ensureGalleryWriteSession(client)]),
    [anonymous, anonymous],
  );
  assert.equal(await ensureGalleryWriteSession(client), anonymous);
  assert.equal(anonymousCalls, 1);
});

test("existing authenticated sessions remain usable and anonymous setup failures are explicit", async () => {
  const existing = { access_token: "existing-test-token", user: { id: "existing-user" } };
  let anonymousCalls = 0;
  const existingClient = {
    auth: {
      getSession: async () => ({ data: { session: existing }, error: null }),
      signInAnonymously: async () => {
        anonymousCalls++;
      },
    },
  };
  assert.equal(await ensureGalleryWriteSession(existingClient), existing);
  assert.equal(anonymousCalls, 0);
  const deniedClient = {
    auth: {
      getSession: async () => ({ data: { session: null }, error: null }),
      signInAnonymously: async () => ({
        data: { session: null },
        error: new Error("anonymous disabled"),
      }),
    },
  };
  await assert.rejects(ensureGalleryWriteSession(deniedClient), /投稿設定の準備中/);
});

test("public reads and authenticated writes use the agreed API with bearer tokens only in headers", async (t) => {
  const calls = [];
  const signedUploads = [];
  t.mock.method(globalThis, "fetch", async (path, options) => {
    calls.push({ path, options });
    const pathname = new URL(String(path), "https://gallery.example").pathname;
    const body =
      options.method === "PATCH"
        ? { title: "新しいタイトル", version: 4 }
        : pathname === "/api/gallery/upload"
          ? { uploadId: id, path: `${id}/source`, token: "stage-token" }
          : pathname === "/api/gallery/upload/complete"
            ? { post }
            : options.method
              ? { ok: true }
              : { posts: [post], titles: {} };
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  });
  await readCommunityGallery();
  await readCommunityGallery("test-token");
  assert.equal(calls[0].options.headers.has("Authorization"), false);
  assert.equal(calls[1].path, "/api/gallery?includeDeleted=1");
  await postCommunityGalleryImage(
    new File(["raster"], "gallery-upload.webp", { type: "image/webp" }),
    "test-token",
    {
      storage: {
        from(bucket) {
          assert.equal(bucket, "gallery-upload-staging");
          return {
            async uploadToSignedUrl(path, token, file, options) {
              signedUploads.push({ path, token, file, options });
              return { error: null };
            },
          };
        },
      },
    },
  );
  assert.equal(calls[2].path, "/api/gallery/upload");
  assert.deepEqual(JSON.parse(calls[2].options.body), { size: 6, type: "image/webp" });
  assert.equal(signedUploads.length, 1);
  assert.equal(signedUploads[0].path, `${id}/source`);
  assert.equal(signedUploads[0].token, "stage-token");
  assert.equal(signedUploads[0].file.name, "gallery-upload.webp");
  assert.deepEqual(signedUploads[0].options, { contentType: "image/webp", upsert: false });
  assert.equal(calls[3].path, "/api/gallery/upload/complete");
  assert.deepEqual(JSON.parse(calls[3].options.body), { uploadId: id });
  assert.deepEqual(await updateCommunityGalleryTitle("g01", " 新しいタイトル ", 3, "test-token"), {
    title: "新しいタイトル",
    version: 4,
  });
  assert.deepEqual(JSON.parse(calls[4].options.body), {
    artworkId: "g01",
    title: "新しいタイトル",
    expectedVersion: 3,
  });
  await deleteCommunityGalleryImage(id, "test-token");
  await restoreCommunityGalleryImage(id, "test-token");
  assert.equal(calls[5].options.method, "DELETE");
  assert.equal(calls[6].path, `/api/gallery/${id}/restore`);
  for (const call of calls.slice(1)) {
    assert.equal(call.options.headers.get("Authorization"), "Bearer test-token");
    assert.equal(call.path.includes("test-token"), false);
    assert.equal(call.options.cache, "no-store");
  }
});

test("title conflicts expose the latest version and malformed mutations never reach fetch", async (t) => {
  const fetch = t.mock.method(
    globalThis,
    "fetch",
    async () =>
      new Response(
        JSON.stringify({ error: "競合", current: { title: "ほかの利用者のタイトル", version: 5 } }),
        { status: 409 },
      ),
  );
  await assert.rejects(
    updateCommunityGalleryTitle("g01", "下書き", 4, "test-token"),
    (error) =>
      error instanceof GalleryRequestError && error.status === 409 && error.current.version === 5,
  );
  await assert.rejects(updateCommunityGalleryTitle("__proto__", "bad", 0, "test-token"));
  await assert.rejects(updateCommunityGalleryTitle("g01", "x".repeat(121), 0, "test-token"));
  await assert.rejects(deleteCommunityGalleryImage("g01", "test-token"));
  assert.equal(fetch.mock.callCount(), 1);
  await assert.rejects(createGalleryAuthClient({ ready: false }), /準備/);
});

test("a timed out mutation asks visitors to verify the result rather than claiming failure or success", async (t) => {
  t.mock.method(globalThis, "setTimeout", (callback) => {
    queueMicrotask(callback);
    return 0;
  });
  t.mock.method(globalThis, "clearTimeout", () => {});
  t.mock.method(
    globalThis,
    "fetch",
    (_path, options) =>
      new Promise((_resolve, reject) => {
        options.signal.addEventListener("abort", () =>
          reject(new DOMException("aborted", "AbortError")),
        );
      }),
  );
  await assert.rejects(
    updateCommunityGalleryTitle("g01", "公開予定", 0, "test-token"),
    (error) =>
      error instanceof GalleryRequestError &&
      error.status === 408 &&
      /再読み込みで確認/.test(error.message),
  );
});
