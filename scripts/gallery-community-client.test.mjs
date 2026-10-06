import assert from "node:assert/strict";
import test from "node:test";
import {
  communityPostToArtwork,
  createGalleryAuthClient,
  deleteCommunityGalleryImage,
  ensureGalleryWriteSession,
  galleryNumberFor,
  GalleryRequestError,
  isCommunityGalleryId,
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

test("input limits accept supported raster formats and reject SVG, empty files and oversized originals", () => {
  for (const type of ["image/jpeg", "image/png", "image/webp"])
    validateCommunityImageFile({ type, size: 10 * 1024 * 1024 });
  for (const type of ["image/svg+xml", "image/gif", "text/html", ""])
    assert.throws(() => validateCommunityImageFile({ type, size: 100 }), /JPEG/);
  assert.throws(() => validateCommunityImageFile({ type: "image/png", size: 0 }), /空/);
  assert.throws(
    () => validateCommunityImageFile({ type: "image/png", size: 10 * 1024 * 1024 + 1 }),
    /10MB/,
  );
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

test("APNG and animated WebP are rejected before a canvas can flatten their frames", async (t) => {
  const browser = fakeBrowser(t);
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
  assert.equal(browser.images(), 0);
  assert.equal(browser.revoke.mock.callCount(), 0);
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

function fakeBrowser(t, options = {}) {
  const dimensions = options.dimensions ?? { width: 1200, height: 3000 };
  let drawn = null;
  let images = 0;
  const qualities = [];
  const canvas = {
    width: 0,
    height: 0,
    getContext: () => ({
      drawImage: (_image, _x, _y, width, height) => {
        drawn = { width, height };
      },
    }),
    toBlob: (callback, type, quality) => {
      qualities.push(quality);
      callback(
        options.blobFailure
          ? null
          : new Blob(
              [new Uint8Array(options.tooLarge && quality > 0.6 ? 3 * 1024 * 1024 + 1 : 100)],
              { type },
            ),
      );
    },
  };
  class Image {
    naturalWidth = dimensions.width;
    naturalHeight = dimensions.height;
    constructor() {
      images++;
    }
    set src(value) {
      if (!value) return;
      queueMicrotask(() => (options.decodeFailure ? this.onerror?.() : this.onload?.()));
    }
  }
  for (const [name, value] of Object.entries({
    Image,
    window: { setTimeout, clearTimeout },
    document: { createElement: () => canvas },
  })) {
    const previous = Object.getOwnPropertyDescriptor(globalThis, name);
    Object.defineProperty(globalThis, name, { value, writable: true, configurable: true });
    t.after(() =>
      previous
        ? Object.defineProperty(globalThis, name, previous)
        : Reflect.deleteProperty(globalThis, name),
    );
  }
  const revoke = t.mock.method(URL, "revokeObjectURL", () => {});
  return { canvas, qualities, revoke, drawn: () => drawn, images: () => images };
}

test("client conversion preserves the entire aspect ratio, strips original metadata and releases temporary resources", async (t) => {
  const browser = fakeBrowser(t);
  const converted = await prepareCommunityUpload(
    new File([png()], "original-secret-name.png", { type: "image/png" }),
  );
  assert.equal(converted.type, "image/webp");
  assert.equal(converted.name, "gallery-upload.webp");
  assert.deepEqual(browser.drawn(), { width: 960, height: 2400 });
  assert.equal(browser.canvas.width, 0);
  assert.equal(browser.canvas.height, 0);
  assert.equal(browser.revoke.mock.callCount(), 1);
});

test("conversion retries quality within 3MB and rejects invalid dimensions before allocating an image", async (t) => {
  const browser = fakeBrowser(t, { tooLarge: true });
  await prepareCommunityUpload(new File([png()], "image.png", { type: "image/png" }));
  assert.deepEqual(browser.qualities, [0.9, 0.76, 0.6]);
  await assert.rejects(
    prepareCommunityUpload(new File([png(8001, 5000)], "too-big.png", { type: "image/png" })),
    /4,000万/,
  );
  assert.equal(browser.images(), 1);
});

test("decode and canvas failures are visible and always revoke object URLs", async (t) => {
  await t.test("invalid image", async (t) => {
    const browser = fakeBrowser(t, { decodeFailure: true });
    await assert.rejects(
      prepareCommunityUpload(new File([png()], "broken.png", { type: "image/png" })),
      /読み込め/,
    );
    assert.equal(browser.revoke.mock.callCount(), 1);
  });
  await t.test("encoder failure", async (t) => {
    const browser = fakeBrowser(t, { blobFailure: true });
    await assert.rejects(
      prepareCommunityUpload(new File([png()], "image.png", { type: "image/png" })),
      /変換/,
    );
    assert.equal(browser.revoke.mock.callCount(), 1);
    assert.equal(browser.canvas.width, 0);
  });
});

test("public numbers are unchanged and shared upload numbering survives filtering and title edits", () => {
  assert.equal(isCommunityGalleryId(id), true);
  assert.equal(isCommunityGalleryId("u-001"), false);
  assert.equal(galleryNumberFor({ id: "g79" }), "079");
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
  t.mock.method(globalThis, "fetch", async (path, options) => {
    calls.push({ path, options });
    const body =
      options.method === "PATCH"
        ? { title: "新しいタイトル", version: 4 }
        : options.method === "POST" && path === "/api/gallery"
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
  );
  assert.ok(calls[2].options.body instanceof FormData);
  assert.equal(calls[2].options.body.get("file").name, "gallery-upload.webp");
  assert.deepEqual(await updateCommunityGalleryTitle("g01", " 新しいタイトル ", 3, "test-token"), {
    title: "新しいタイトル",
    version: 4,
  });
  assert.deepEqual(JSON.parse(calls[3].options.body), {
    artworkId: "g01",
    title: "新しいタイトル",
    expectedVersion: 3,
  });
  await deleteCommunityGalleryImage(id, "test-token");
  await restoreCommunityGalleryImage(id, "test-token");
  assert.equal(calls[4].options.method, "DELETE");
  assert.equal(calls[5].path, `/api/gallery/${id}/restore`);
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
  await assert.rejects(updateCommunityGalleryTitle("g01", "x".repeat(101), 0, "test-token"));
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
