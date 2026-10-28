import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { createGalleryCommunityRefresh } from "../src/components/gallery/gallery-community-refresh.ts";

const flush = async () => {
  for (let i = 0; i < 20; i++) await Promise.resolve();
};
function reader() {
  const reads = [],
    values = [],
    errors = [];
  let clock = 0;
  const updates = createGalleryCommunityRefresh({
    read: () => new Promise((resolve, reject) => reads.push({ resolve, reject })),
    onSuccess: (value) => values.push(value),
    onError: (error) => errors.push(error),
    now: () => clock,
  });
  return {
    updates,
    reads,
    values,
    errors,
    at(value) {
      clock = value;
    },
  };
}

test("simultaneous focus/visibility/poll requests share one collection flight", async () => {
  const h = reader();
  const first = h.updates.refresh("event");
  assert.equal(h.updates.refresh("event"), first);
  assert.equal(h.updates.refresh("poll"), first);
  await flush();
  assert.equal(h.reads.length, 1);
  h.reads[0].resolve("collection");
  assert.equal(await first, true);
  assert.deepEqual(h.values, ["collection"]);
});

test("only recent successful event bursts coalesce; polling and explicit reload always read", async () => {
  const h = reader();
  const first = h.updates.refresh("poll");
  await flush();
  h.reads[0].resolve(1);
  await first;
  h.at(999);
  assert.equal(await h.updates.refresh("event"), true);
  assert.equal(h.reads.length, 1);
  const poll = h.updates.refresh("poll");
  await flush();
  assert.equal(h.reads.length, 2, "30 second poll is never skipped by a recent focus refresh");
  h.reads[1].resolve(2);
  await poll;
  const explicit = h.updates.refresh();
  await flush();
  assert.equal(h.reads.length, 3);
  h.reads[2].resolve(3);
  await explicit;
  h.at(1999);
  const expired = h.updates.refresh("event");
  await flush();
  assert.equal(h.reads.length, 4);
  h.reads[3].resolve(4);
  await expired;
  h.at(0);
  const backwards = h.updates.refresh("event");
  await flush();
  assert.equal(h.reads.length, 5, "a backwards clock does not make success permanently fresh");
  h.reads[4].resolve(5);
  await backwards;
});

test("a write or explicit reload during a flight queues exactly one fresh read and suppresses its older snapshot", async () => {
  const h = reader();
  const original = h.updates.refresh("poll");
  await flush();
  const fresh = h.updates.refresh("reload");
  assert.equal(h.updates.refresh("reload"), fresh);
  assert.equal(h.updates.refresh("event"), fresh);
  assert.equal(h.reads.length, 1, "the fresh read does not overlap the active request");
  h.reads[0].resolve("before upload");
  await flush();
  assert.equal(await original, false);
  assert.deepEqual(h.values, [], "the superseded collection never rolls posts back");
  assert.equal(h.reads.length, 2);
  h.reads[1].resolve("after upload");
  assert.equal(await fresh, true);
  assert.deepEqual(h.values, ["after upload"]);
});

test("a later mutation during the queued read gets its own subsequent snapshot", async () => {
  const h = reader();
  const original = h.updates.refresh("poll");
  await flush();
  const firstWrite = h.updates.refresh("reload");
  h.reads[0].resolve("old");
  await original;
  await flush();
  const secondWrite = h.updates.refresh("reload");
  assert.notEqual(secondWrite, firstWrite);
  h.reads[1].resolve("first write only");
  await flush();
  assert.equal(await firstWrite, false);
  assert.equal(h.reads.length, 3);
  h.reads[2].resolve("both writes");
  assert.equal(await secondWrite, true);
  assert.deepEqual(h.values, ["both writes"]);
});

test("errors clear recent-success coalescing and can retry immediately", async () => {
  const h = reader();
  const first = h.updates.refresh();
  await flush();
  h.reads[0].resolve("ok");
  await first;
  h.at(100);
  const failure = h.updates.refresh("poll");
  await flush();
  h.reads[1].reject(new Error("offline"));
  assert.equal(await failure, false);
  const retry = h.updates.refresh("event");
  await flush();
  assert.equal(h.reads.length, 3);
  h.reads[2].resolve("recovered");
  assert.equal(await retry, true);
  assert.equal(h.errors.length, 1);
  assert.deepEqual(h.values, ["ok", "recovered"]);
});

test("authentication scopes cannot share promises or publish old results after disposal", async () => {
  const old = reader(),
    current = reader();
  const pending = old.updates.refresh("poll");
  await flush();
  const queued = old.updates.refresh("reload");
  old.updates.dispose();
  const latest = current.updates.refresh("poll");
  await flush();
  current.reads[0].resolve("new auth");
  assert.equal(await latest, true);
  old.reads[0].resolve("old private deleted posts");
  assert.equal(await pending, false);
  assert.equal(await queued, false);
  assert.equal(old.reads.length, 1, "disposed auth scope never starts its queued request");
  assert.deepEqual(old.values, []);
  assert.deepEqual(old.errors, []);
  assert.deepEqual(current.values, ["new auth"]);
  const early = reader();
  const cancelled = early.updates.refresh();
  early.updates.dispose();
  assert.equal(await cancelled, false);
  assert.equal(early.reads.length, 0);
});

// Execute the real page's collection effect against a tiny browser host. This
// verifies event gating and cleanup without mocking a copy of its scheduling.
const page = readFileSync(
  new URL("../src/components/gallery/gallery-page.tsx", import.meta.url),
  "utf8",
);
const ast = ts.createSourceFile(
  "gallery-page.tsx",
  page,
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX,
);
let effect;
function findEffect(node) {
  if (
    ts.isCallExpression(node) &&
    node.expression.getText(ast) === "useEffect" &&
    node.arguments[1]?.getText(ast) === "[session?.access_token]"
  )
    effect = node.arguments[0].getText(ast);
  ts.forEachChild(node, findEffect);
}
findEffect(ast);
assert.ok(effect);
const effectCode = ts.transpileModule(`exports.mount = ${effect};`, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
function mountEffect({ hidden = false, online = true } = {}) {
  class Target extends EventTarget {
    listeners = new Set();
    addEventListener(type, fn) {
      super.addEventListener(type, fn);
      this.listeners.add(fn);
    }
    removeEventListener(type, fn) {
      super.removeEventListener(type, fn);
      this.listeners.delete(fn);
    }
  }
  const window = new Target(),
    document = Object.assign(new Target(), { hidden }),
    navigator = { onLine: online };
  const reads = [],
    posts = [],
    errors = [],
    intervals = new Map(),
    communityReloadRef = { current: null },
    communityBusyRef = { current: false },
    viewerActiveRef = { current: false };
  let clock = 0;
  Object.assign(window, {
    setInterval(fn, ms) {
      intervals.set(1, { fn, ms });
      return 1;
    },
    clearInterval(id) {
      intervals.delete(id);
    },
  });
  const exports = {};
  runInNewContext(effectCode, {
    exports,
    window,
    document,
    navigator,
    session: { access_token: "current-token" },
    communityReloadRef,
    communityBusyRef,
    viewerActiveRef,
    createGalleryCommunityRefresh: (options) =>
      createGalleryCommunityRefresh({ ...options, now: () => clock }),
    readCommunityGallery: (token) =>
      new Promise((resolve, reject) => reads.push({ token, resolve, reject })),
    setCommunityPosts: (value) => posts.push(value),
    setDeletedPosts() {},
    setSharedTitles() {},
    setCommunityLoaded() {},
    setCommunityLoadError: (value) => errors.push(value),
    mergeCommunityGalleryTitles: (old) => old,
  });
  const cleanup = exports.mount();
  return {
    window,
    document,
    navigator,
    reads,
    posts,
    intervals,
    communityReloadRef,
    communityBusyRef,
    viewerActiveRef,
    cleanup,
    at(value) {
      clock = value;
    },
    poll() {
      for (const { fn } of intervals.values()) fn();
    },
    resolve(index) {
      reads[index].resolve({ posts: [index], titles: {} });
    },
  };
}

test("page focus/visibility/online/timer share one flight, keep the 30-second poll and remove listeners", async () => {
  const h = mountEffect();
  await flush();
  assert.equal(h.intervals.get(1).ms, 30000);
  h.window.dispatchEvent(new Event("focus"));
  h.document.dispatchEvent(new Event("visibilitychange"));
  h.window.dispatchEvent(new Event("online"));
  h.poll();
  await flush();
  assert.equal(h.reads.length, 1);
  assert.equal(h.reads[0].token, "current-token");
  h.resolve(0);
  await flush();
  h.at(100);
  h.window.dispatchEvent(new Event("focus"));
  h.document.dispatchEvent(new Event("visibilitychange"));
  await flush();
  assert.equal(h.reads.length, 1);
  h.poll();
  await flush();
  assert.equal(h.reads.length, 2, "poll remains fresh even inside event-coalescing window");
  h.cleanup();
  h.resolve(1);
  await flush();
  assert.deepEqual(h.posts, [[0]]);
  assert.equal(h.intervals.size, 0);
  assert.equal(h.window.listeners.size, 0);
  assert.equal(h.document.listeners.size, 0);
  assert.equal(h.communityReloadRef.current, null);
});

test("page automatic updates skip hidden/offline/busy/viewing; online resumes and manual reload bypasses those skips", async () => {
  const h = mountEffect({ hidden: true, online: false });
  await flush();
  const events = async () => {
    h.window.dispatchEvent(new Event("focus"));
    h.document.dispatchEvent(new Event("visibilitychange"));
    h.window.dispatchEvent(new Event("online"));
    h.poll();
    await flush();
  };
  await events();
  assert.equal(h.reads.length, 0);
  h.document.hidden = false;
  await events();
  assert.equal(h.reads.length, 0, "still offline");
  h.navigator.onLine = true;
  h.communityBusyRef.current = true;
  await events();
  assert.equal(h.reads.length, 0);
  h.communityBusyRef.current = false;
  h.viewerActiveRef.current = true;
  await events();
  assert.equal(h.reads.length, 0);
  h.viewerActiveRef.current = false;
  h.window.dispatchEvent(new Event("online"));
  await flush();
  assert.equal(h.reads.length, 1);
  h.resolve(0);
  await flush();
  h.document.hidden = true;
  h.navigator.onLine = false;
  h.communityBusyRef.current = true;
  h.viewerActiveRef.current = true;
  const explicit = h.communityReloadRef.current();
  await flush();
  assert.equal(h.reads.length, 2);
  h.resolve(1);
  assert.equal(await explicit, true);
  h.cleanup();
});
