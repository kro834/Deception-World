import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { cancelArchiveApi, postArchiveApi } from "../src/lib/archive-api-client.ts";
import {
  forgetArchiveAiPending,
  listArchiveAiPending,
  rememberArchiveAiPending,
} from "../src/lib/archive-ai-pending.ts";

function restoreProperty(target, name, descriptor) {
  if (descriptor) Object.defineProperty(target, name, descriptor);
  else Reflect.deleteProperty(target, name);
}

function replaceProperty(t, target, name, value) {
  const descriptor = Object.getOwnPropertyDescriptor(target, name);
  Object.defineProperty(target, name, {
    configurable: true,
    writable: true,
    value,
  });
  t.after(() => restoreProperty(target, name, descriptor));
}

function memoryStorage() {
  const values = new Map();
  return {
    get length() {
      return values.size;
    },
    clear() {
      values.clear();
    },
    getItem(key) {
      return values.get(key) ?? null;
    },
    key(index) {
      return [...values.keys()][index] ?? null;
    },
    removeItem(key) {
      values.delete(key);
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
  };
}

test("iOS IndexedDB cold start waits past the normal 450ms operation deadline", async (t) => {
  const expected = {
    requestId: "00000000-0000-4000-8000-000000000101",
    url: "/api/archive-search",
    client: "search-v1",
    startedAt: Date.now(),
    expiresAt: Date.now() + 60_000,
  };
  let closed = false;
  const database = {
    objectStoreNames: { contains: () => true },
    transaction() {
      return {
        objectStore() {
          return {
            getAll() {
              const request = {};
              queueMicrotask(() => {
                request.result = [expected];
                request.onsuccess?.();
              });
              return request;
            },
          };
        },
      };
    },
    close() {
      closed = true;
    },
  };
  const indexedDb = {
    open() {
      const request = {};
      setTimeout(() => {
        request.result = database;
        request.onsuccess?.();
      }, 520);
      return request;
    },
  };
  replaceProperty(t, globalThis, "indexedDB", indexedDb);
  replaceProperty(t, globalThis, "sessionStorage", memoryStorage());

  const startedAt = Date.now();
  const records = await listArchiveAiPending(expected.startedAt);

  assert.equal(
    records.some((record) => record.requestId === expected.requestId),
    true,
  );
  assert.equal(Date.now() - startedAt >= 450, true);
  assert.equal(closed, true);
});

test("successful HTTP contract errors keep the logical request recoverable without replay", async (t) => {
  const sessionStorage = memoryStorage();
  replaceProperty(t, globalThis, "sessionStorage", sessionStorage);
  replaceProperty(t, globalThis, "localStorage", memoryStorage());
  replaceProperty(t, globalThis, "indexedDB", undefined);

  const invalidJsonId = "00000000-0000-4000-8000-000000000102";
  const invalidEnvelopeId = "00000000-0000-4000-8000-000000000103";
  let fetchCalls = 0;
  replaceProperty(t, globalThis, "fetch", async () => {
    fetchCalls += 1;
    return fetchCalls === 1
      ? new Response("not-json", { status: 200 })
      : Response.json({ unexpected: true });
  });

  for (const [requestId, message] of [
    [invalidJsonId, /was not JSON/],
    [invalidEnvelopeId, /response was invalid/],
  ]) {
    await assert.rejects(
      postArchiveApi({
        url: "/api/archive-search",
        client: "search-v1",
        body: { query: "recover me" },
        signal: new AbortController().signal,
        validate: () => false,
        requestId,
      }),
      message,
    );
  }

  const pending = await listArchiveAiPending();
  assert.deepEqual(
    pending.map((record) => record.requestId).sort(),
    [invalidEnvelopeId, invalidJsonId].sort(),
  );
  assert.equal(fetchCalls, 2, "a completed HTTP 200 response must never replay its POST");

  await Promise.all(pending.map((record) => forgetArchiveAiPending(record.requestId)));
});

test("request-id mismatch is rejected but the correct pending request remains recoverable", async (t) => {
  replaceProperty(t, globalThis, "sessionStorage", memoryStorage());
  replaceProperty(t, globalThis, "localStorage", memoryStorage());
  replaceProperty(t, globalThis, "indexedDB", undefined);
  const expectedRequestId = "00000000-0000-4000-8000-000000000104";
  let fetchCalls = 0;
  replaceProperty(t, globalThis, "fetch", async () => {
    fetchCalls += 1;
    return Response.json({
      requestId: "10000000-0000-4000-8000-000000000104",
      state: "failed",
      reason: "provider_unavailable",
      retryable: false,
    });
  });

  await assert.rejects(
    postArchiveApi({
      url: "/api/archive-intelligence",
      client: "persona-v1",
      body: { messages: [] },
      signal: new AbortController().signal,
      validate: () => false,
      requestId: expectedRequestId,
    }),
    /request id did not match/,
  );

  assert.equal(fetchCalls, 1);
  assert.equal(
    (await listArchiveAiPending()).some((record) => record.requestId === expectedRequestId),
    true,
  );
  await forgetArchiveAiPending(expectedRequestId);
});

test("communication-error messages have a dedicated RECONNECT source", () => {
  const oracle = readFileSync(
    new URL("../src/components/world/archive-oracle.tsx", import.meta.url),
    "utf8",
  );
  const roleplay = readFileSync(
    new URL("../src/components/world/archive-roleplay.tsx", import.meta.url),
    "utf8",
  );
  for (const source of [oracle, roleplay]) {
    assert.match(source, /source:\s*"error"/u);
    assert.match(source, /modelLabel:\s*"RECONNECT"/u);
    assert.match(source, /message\.source === "local"[\s\S]*?"LOCAL"[\s\S]*?"RECONNECT"/u);
  }
});

test("a failed cancellation keeps the durable request recoverable until the server confirms it", async (t) => {
  replaceProperty(t, globalThis, "sessionStorage", memoryStorage());
  replaceProperty(t, globalThis, "localStorage", memoryStorage());
  replaceProperty(t, globalThis, "indexedDB", undefined);
  const requestId = "00000000-0000-4000-8000-000000000105";
  await rememberArchiveAiPending({
    requestId,
    url: "/api/archive-search",
    client: "search-v1",
    startedAt: Date.now(),
  });
  let offline = true;
  replaceProperty(t, globalThis, "fetch", async () => {
    if (offline) throw new TypeError("offline");
    return Response.json({}, { status: 404 });
  });

  await cancelArchiveApi({ client: "search-v1", requestId });
  assert.equal(
    (await listArchiveAiPending()).some((record) => record.requestId === requestId),
    true,
  );

  offline = false;
  await cancelArchiveApi({ client: "search-v1", requestId });
  assert.equal(
    (await listArchiveAiPending()).some((record) => record.requestId === requestId),
    false,
  );
});
