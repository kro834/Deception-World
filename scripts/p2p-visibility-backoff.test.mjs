import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

const p2p = readFileSync(new URL("../src/lib/multiplayer/p2p.ts", import.meta.url), "utf8");

async function loadP2PRoom() {
  const compiled = ts.transpileModule(p2p, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  return import(
    `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}#${Date.now()}`
  );
}

function deferred() {
  let resolve;
  const promise = new Promise((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

async function flushMicrotasks() {
  for (let index = 0; index < 6; index += 1) await Promise.resolve();
}

function jsonResponse(body) {
  return { ok: true, status: 200, json: async () => body };
}

function restoreGlobal(name, descriptor) {
  if (descriptor) Object.defineProperty(globalThis, name, descriptor);
  else Reflect.deleteProperty(globalThis, name);
}

test("hidden P2P work backs off without weakening relay poll cadence", () => {
  assert.match(p2p, /const FAST_POLL_MS = 400;/);
  assert.match(p2p, /const IDLE_POLL_MS = 2000;/);
  assert.match(p2p, /const PING_INTERVAL_MS = 2000;/);
  assert.match(p2p, /const HIDDEN_PING_INTERVAL_MS = 10_000;/);
  assert.match(p2p, /this\.pageIsHidden\(\)\s*\?\s*Math\.max\(delay, IDLE_POLL_MS\)\s*:\s*delay/);
  assert.match(p2p, /if \(!hidden\) this\.watchdog\(\);/);
  assert.match(
    p2p,
    /this\.scheduleMaintenance\(hidden \? HIDDEN_PING_INTERVAL_MS : PING_INTERVAL_MS\)/,
  );
  assert.doesNotMatch(p2p, /setInterval\s*\(/);
});

test("visibility recovery immediately refreshes direct and relay state", () => {
  assert.match(p2p, /document\.addEventListener\("visibilitychange", this\.onVisibilityChange\)/);
  assert.match(
    p2p,
    /document\.removeEventListener\("visibilitychange", this\.onVisibilityChange\)/,
  );
  assert.match(p2p, /slot\.lastProgressAt = now;\s*slot\.pingSentAt = undefined;/);
  assert.match(p2p, /this\.pingAll\(\);\s*this\.scheduleMaintenance\(PING_INTERVAL_MS\);/);
  assert.match(
    p2p,
    /if \(this\.pollInFlight\) this\.pollAfterCurrent = true;\s*else this\.schedulePoll\(0\);/,
  );
  assert.match(
    p2p,
    /const pollImmediately = this\.pollAfterCurrent;[\s\S]*?this\.schedulePoll\(pollImmediately \? 0 : this\.nextPollDelay\(\)\)/,
  );
});

test("the published multiplayer surface remains stable", () => {
  assert.match(p2p, /export interface P2PRoomOptions/);
  assert.match(p2p, /export class P2PRoom/);
  assert.match(p2p, /async join\(\): Promise<void>/);
  assert.match(p2p, /close\(\): void/);
  assert.match(p2p, /broadcast\(data: unknown\): void/);
  assert.match(p2p, /send\(data: unknown, peerId\?: string\): void/);
  assert.match(p2p, /peerList\(\): PeerInfo\[\]/);
  assert.match(p2p, /private joinPromise: Promise<void> \| null = null;/);
  assert.match(p2p, /if \(this\.closed \|\| this\.joined\) return;/);
  assert.match(p2p, /if \(this\.joinPromise\) return this\.joinPromise;/);
  assert.match(p2p, /close\(\): void \{\s*if \(this\.closed\) return;/);
});

test("join is single-flight and close remains final across visibility recovery", async () => {
  const originalDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
  const originalFetch = Object.getOwnPropertyDescriptor(globalThis, "fetch");
  const originalSetTimeout = Object.getOwnPropertyDescriptor(globalThis, "setTimeout");
  const originalClearTimeout = Object.getOwnPropertyDescriptor(globalThis, "clearTimeout");
  let visibilityState = "visible";
  const fakeDocument = new EventTarget();
  Object.defineProperty(fakeDocument, "visibilityState", {
    configurable: true,
    get: () => visibilityState,
  });

  let timerId = 0;
  const timers = new Map();
  const fakeSetTimeout = (callback, delay = 0) => {
    const id = ++timerId;
    timers.set(id, { callback, delay });
    return id;
  };
  const fakeClearTimeout = (id) => {
    timers.delete(id);
  };
  const timerDelays = () =>
    [...timers.values()].map((timer) => timer.delay).sort((left, right) => left - right);
  const takeTimer = (delay) => {
    const match = [...timers].find(([, timer]) => timer.delay === delay);
    assert.ok(match, `missing ${delay}ms timer`);
    const [id, timer] = match;
    timers.delete(id);
    timer.callback();
  };

  const polls = [];
  const posts = [];
  const fakeFetch = (_input, init = {}) => {
    if (init.method === "POST") {
      posts.push(JSON.parse(init.body));
      return Promise.resolve(jsonResponse({}));
    }
    const pending = deferred();
    polls.push(pending);
    return pending.promise;
  };

  Object.defineProperty(globalThis, "document", { configurable: true, value: fakeDocument });
  Object.defineProperty(globalThis, "fetch", { configurable: true, value: fakeFetch });
  Object.defineProperty(globalThis, "setTimeout", { configurable: true, value: fakeSetTimeout });
  Object.defineProperty(globalThis, "clearTimeout", { configurable: true, value: fakeClearTimeout });

  try {
    const { P2PRoom } = await loadP2PRoom();
    const room = new P2PRoom({ room: "contract-room", selfId: "self", iceServers: [] });
    const emptyPoll = () => jsonResponse({ peers: [{ id: "self", name: "" }], signals: [] });

    const firstJoin = room.join();
    const duplicateJoin = room.join();
    assert.equal(polls.length, 1, "concurrent joins must share the initial signaling poll");
    polls[0].resolve(emptyPoll());
    await Promise.all([firstJoin, duplicateJoin]);
    assert.deepEqual(timerDelays(), [2_000, 2_000]);

    await room.join();
    assert.equal(polls.length, 1, "joining an active room must be idempotent");
    assert.deepEqual(timerDelays(), [2_000, 2_000]);

    visibilityState = "hidden";
    fakeDocument.dispatchEvent(new Event("visibilitychange"));
    assert.deepEqual(timerDelays(), [2_000, 10_000]);

    takeTimer(2_000);
    await flushMicrotasks();
    assert.equal(polls.length, 2, "the hidden relay poll must continue at idle cadence");

    visibilityState = "visible";
    fakeDocument.dispatchEvent(new Event("visibilitychange"));
    assert.deepEqual(
      timerDelays(),
      [2_000],
      "resuming during an in-flight poll must defer the immediate refresh",
    );

    polls[1].resolve(emptyPoll());
    await flushMicrotasks();
    assert.deepEqual(timerDelays(), [0, 2_000]);

    takeTimer(0);
    await flushMicrotasks();
    assert.equal(polls.length, 3, "the deferred visible refresh must run exactly once");

    room.close();
    room.close();
    assert.equal(
      posts.filter((post) => post.op === "leave").length,
      1,
      "repeated close calls must emit one leave operation",
    );
    assert.deepEqual(timerDelays(), [], "close must clear all pending maintenance and poll work");

    polls[2].resolve(emptyPoll());
    await flushMicrotasks();
    assert.deepEqual(timerDelays(), [], "an in-flight poll must not reschedule after close");
  } finally {
    restoreGlobal("document", originalDocument);
    restoreGlobal("fetch", originalFetch);
    restoreGlobal("setTimeout", originalSetTimeout);
    restoreGlobal("clearTimeout", originalClearTimeout);
  }
});

test("closing during the initial join aborts registration before sending leave", async () => {
  const originalDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
  const originalFetch = Object.getOwnPropertyDescriptor(globalThis, "fetch");
  const originalSetTimeout = Object.getOwnPropertyDescriptor(globalThis, "setTimeout");
  const originalClearTimeout = Object.getOwnPropertyDescriptor(globalThis, "clearTimeout");
  const fakeDocument = new EventTarget();
  Object.defineProperty(fakeDocument, "visibilityState", {
    configurable: true,
    value: "visible",
  });

  const timers = new Map();
  let timerId = 0;
  const posts = [];
  const registrations = [];
  let initialSignal;
  const initialPoll = deferred();
  const fakeFetch = (input, init = {}) => {
    if (init.method === "POST") {
      posts.push(JSON.parse(init.body));
      return Promise.resolve(jsonResponse({}));
    }
    initialSignal = init.signal;
    const url = new URL(input, "https://example.invalid");
    const registration = { peer: url.searchParams.get("peer"), completed: false };
    registrations.push(registration);
    init.signal?.addEventListener("abort", () => {
      initialPoll.resolve({
        ok: true,
        status: 200,
        json: async () => {
          registration.completed = true;
          return { peers: [], signals: [] };
        },
      });
    }, { once: true });
    return initialPoll.promise;
  };

  Object.defineProperty(globalThis, "document", { configurable: true, value: fakeDocument });
  Object.defineProperty(globalThis, "fetch", { configurable: true, value: fakeFetch });
  Object.defineProperty(globalThis, "setTimeout", {
    configurable: true,
    value: (callback, delay = 0) => {
      const id = ++timerId;
      timers.set(id, { callback, delay });
      return id;
    },
  });
  Object.defineProperty(globalThis, "clearTimeout", {
    configurable: true,
    value: (id) => timers.delete(id),
  });

  try {
    const { P2PRoom } = await loadP2PRoom();
    const room = new P2PRoom({ room: "closing-room", selfId: "closing-peer", iceServers: [] });
    const joining = room.join();

    assert.equal(registrations.length, 1, "join must start one registration request");
    assert.equal(initialSignal?.aborted, false);

    room.close();
    await joining;
    await flushMicrotasks();

    assert.equal(initialSignal?.aborted, true, "close must abort the unfinished registration request");
    assert.equal(registrations[0].completed, false, "an aborted response body must not complete registration");
    assert.equal(posts.filter((post) => post.op === "leave").length, 1);
    assert.deepEqual([...timers.values()], [], "an aborted join must not schedule room work");

    await room.join();
    assert.equal(registrations.length, 1, "a closed room must never restart registration");
  } finally {
    restoreGlobal("document", originalDocument);
    restoreGlobal("fetch", originalFetch);
    restoreGlobal("setTimeout", originalSetTimeout);
    restoreGlobal("clearTimeout", originalClearTimeout);
  }
});
