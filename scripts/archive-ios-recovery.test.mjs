import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  cancelArchiveApi,
  postArchiveApi,
  resumeArchiveApi,
  subscribeArchiveAiRecoveryWake,
} from "../src/lib/archive-api-client.ts";
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

function memoryIndexedDb() {
  const stores = new Map();
  let version = 0;
  const database = {
    objectStoreNames: {
      contains(name) {
        return stores.has(name);
      },
    },
    createObjectStore(name) {
      const store = new Map();
      stores.set(name, store);
      return store;
    },
    transaction(name) {
      const store = stores.get(name);
      if (!store) throw new Error(`missing object store: ${name}`);
      const transaction = {
        objectStore() {
          return {
            put(value) {
              queueMicrotask(() => {
                store.set(value.requestId ?? value.key, structuredClone(value));
                transaction.oncomplete?.();
              });
            },
            delete(key) {
              queueMicrotask(() => {
                store.delete(key);
                transaction.oncomplete?.();
              });
            },
            get(key) {
              const request = {};
              queueMicrotask(() => {
                request.result = structuredClone(store.get(key));
                request.onsuccess?.();
              });
              return request;
            },
            getAll() {
              const request = {};
              queueMicrotask(() => {
                request.result = [...store.values()].map((value) => structuredClone(value));
                request.onsuccess?.();
              });
              return request;
            },
          };
        },
      };
      return transaction;
    },
    close() {},
  };
  return {
    stores,
    open(_name, nextVersion) {
      const request = {};
      queueMicrotask(() => {
        request.result = database;
        if ((nextVersion ?? version) > version) {
          version = nextVersion;
          request.onupgradeneeded?.();
        }
        request.onsuccess?.();
      });
      return request;
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

test("a 4s-plus WebKit cold start is retried on pageshow without losing the request", async (t) => {
  const expected = {
    requestId: "00000000-0000-4000-8000-000000000106",
    sessionId: "10000000-0000-4000-8000-000000000106",
    url: "/api/archive-search",
    client: "search-v1",
    startedAt: Date.now(),
    expiresAt: Date.now() + 60_000,
  };
  let openCount = 0;
  let awake = false;
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
    close() {},
  };
  replaceProperty(t, globalThis, "indexedDB", {
    open() {
      const request = {};
      openCount += 1;
      const open = () => {
        awake = true;
        request.result = database;
        request.onsuccess?.();
      };
      if (openCount === 1) setTimeout(open, 4_200);
      else queueMicrotask(open);
      return request;
    },
  });
  replaceProperty(t, globalThis, "sessionStorage", memoryStorage());
  const windowTarget = new EventTarget();
  replaceProperty(t, globalThis, "window", windowTarget);
  const documentTarget = new EventTarget();
  Object.defineProperty(documentTarget, "visibilityState", { value: "visible" });
  replaceProperty(t, globalThis, "document", documentTarget);

  const first = await listArchiveAiPending(expected.startedAt);
  assert.deepEqual(first, [], "the bounded first paint may use the empty synchronous fallback");
  while (!awake) await new Promise((resolve) => setTimeout(resolve, 25));

  let wakeCount = 0;
  let unsubscribe = () => {};
  const recovered = new Promise((resolve) => {
    unsubscribe = subscribeArchiveAiRecoveryWake(async () => {
      wakeCount += 1;
      if (wakeCount === 1) resolve(await listArchiveAiPending(expected.startedAt));
    });
  });
  windowTarget.dispatchEvent(new Event("pageshow"));
  const records = await recovered;
  assert.equal(records.some((record) => record.requestId === expected.requestId), true);
  windowTarget.dispatchEvent(new Event("online"));
  assert.equal(wakeCount, 2);
  unsubscribe();
});

test("a blocked IndexedDB v2 upgrade closes a late Safari connection", async (t) => {
  let closed = 0;
  let openedVersion;
  replaceProperty(t, globalThis, "sessionStorage", memoryStorage());
  replaceProperty(t, globalThis, "indexedDB", {
    open(_name, version) {
      openedVersion = version;
      const request = {};
      queueMicrotask(() => request.onblocked?.());
      setTimeout(() => {
        request.result = { close: () => (closed += 1) };
        request.onsuccess?.();
      }, 5);
      return request;
    },
  });

  assert.deepEqual(await listArchiveAiPending(), []);
  await new Promise((resolve) => setTimeout(resolve, 15));
  assert.equal(openedVersion, 2);
  assert.equal(closed, 1);
});

test("the persisted pending session owns recovery when localStorage is unavailable", async (t) => {
  const indexedDb = memoryIndexedDb();
  const sessionStorage = memoryStorage();
  replaceProperty(t, globalThis, "indexedDB", indexedDb);
  replaceProperty(t, globalThis, "sessionStorage", sessionStorage);
  replaceProperty(t, globalThis, "localStorage", {
    getItem() {
      throw new DOMException("blocked", "SecurityError");
    },
    setItem() {
      throw new DOMException("blocked", "SecurityError");
    },
  });
  const pending = {
    requestId: "00000000-0000-4000-8000-000000000107",
    sessionId: "10000000-0000-4000-8000-000000000107",
    url: "/api/archive-search",
    client: "search-v1",
    startedAt: Date.now(),
  };
  await rememberArchiveAiPending(pending);
  sessionStorage.clear();
  const [durable] = await listArchiveAiPending(pending.startedAt);
  assert.equal(durable.sessionId, pending.sessionId);

  let ownershipHeader;
  replaceProperty(t, globalThis, "fetch", async (_url, init) => {
    ownershipHeader = init.headers["x-archive-session-id"];
    return Response.json({ error: "not_found" }, { status: 404 });
  });
  await assert.rejects(
    resumeArchiveApi({
      pending: durable,
      signal: new AbortController().signal,
      validate: () => false,
    }),
    /recovery failed with 404/,
  );
  assert.equal(ownershipHeader, pending.sessionId);
  assert.equal(
    (await listArchiveAiPending()).some((record) => record.requestId === pending.requestId),
    true,
    "a rejected resume remains actionable for the next pageshow/online wake",
  );
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

test("surface recovery failures remain reconnecting and persona modes keep isolated state", () => {
  const oracle = readFileSync(
    new URL("../src/components/world/archive-oracle.tsx", import.meta.url),
    "utf8",
  );
  const roleplay = readFileSync(
    new URL("../src/components/world/archive-roleplay.tsx", import.meta.url),
    "utf8",
  );
  assert.match(oracle, /subscribeArchiveAiRecoveryWake/);
  assert.match(oracle, /firstFailedIndex[\s\S]*?setSearchPending\(true\)[\s\S]*?setSearchLifecycle\("reconnecting"\)/);
  assert.match(oracle, /if \(disposed \|\| searchAbortRef\.current \|\| !pendingRecords\.length\) return/);
  assert.match(oracle, /const searchAbortRef[\s\S]*?const searchRecoveryAbortRef/);
  assert.match(oracle, /<ArchiveRoleplay[\s\S]*?active=\{active && surface === "roleplay"\}/);
  assert.match(roleplay, /subscribeArchiveAiRecoveryWake/);
  assert.match(
    roleplay,
    /firstFailedIndex[\s\S]*?recoveryPendingKeyRef\.current = failedPendingKey[\s\S]*?setPendingKey\(failedPendingKey\)/,
  );
  assert.match(roleplay, /if \(disposed \|\| abortRef\.current \|\| !pendingRecords\.length\) return/);
  assert.match(roleplay, /const recoveryRequestIdRef[\s\S]*?const foregroundPendingKeyRef/);
  assert.match(
    roleplay,
    /const stopRecovery =[\s\S]*?recoveryPendingKeyRef\.current === activeSessionKeyRef\.current/,
  );
  assert.match(roleplay, /stopForegroundResponse\(true\);[\s\S]*?setCharacterId/);
  assert.match(roleplay, /stopForegroundResponse\(true\);[\s\S]*?setMode/);
  assert.match(roleplay, /function sessionKey\(characterId:[\s\S]*?mode:[\s\S]*?`\$\{characterId\}:\$\{mode\}`/);
  assert.match(roleplay, /viewportBySessionRef\.current\[activeSessionKey\]/);
  assert.match(roleplay, /useLayoutEffect\(\(\) => \{[\s\S]*?if \(!active\) return;[\s\S]*?viewportBySessionRef/);
  assert.match(roleplay, /contextId: keyAtRequest/);
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
