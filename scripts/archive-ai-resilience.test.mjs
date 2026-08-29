import assert from "node:assert/strict";
import test from "node:test";

import { postArchiveApi } from "../src/lib/archive-api-client.ts";
import { trimArchiveConversation } from "../src/lib/archive-conversation-budget.ts";
import {
  ArchiveOpenAiTransportError,
  isRetryableOpenAiResponse,
  openAiRetryDelayMs,
  requestOpenAiStructuredResponse,
} from "../src/lib/archive-openai-transport.server.ts";

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

function installGlobals(t, replacements) {
  for (const [name, value] of Object.entries(replacements)) {
    replaceProperty(t, globalThis, name, value);
  }
}

function installOpenAiHarness(t, fetchImpl) {
  let nextTimerId = 0;
  const timers = new Map();
  const fakeSetTimeout = (callback, delay = 0, ...args) => {
    const id = ++nextTimerId;
    const numericDelay = Number(delay) || 0;
    timers.set(id, { callback, delay: numericDelay, args });
    if (numericDelay <= 0) {
      queueMicrotask(() => {
        const timer = timers.get(id);
        if (!timer) return;
        timers.delete(id);
        timer.callback(...timer.args);
      });
    }
    return id;
  };
  const fakeClearTimeout = (id) => {
    timers.delete(id);
  };

  installGlobals(t, {
    fetch: fetchImpl,
    setTimeout: fakeSetTimeout,
    clearTimeout: fakeClearTimeout,
  });
  replaceProperty(t, console, "warn", () => undefined);
  return timers;
}

function openAiRequest(overrides = {}) {
  return requestOpenAiStructuredResponse({
    apiKey: "archive-resilience-test-key",
    body: { model: "test-model", input: "test" },
    timeoutMs: 10_000,
    parse: (payload) => payload,
    ...overrides,
  });
}

test("trimArchiveConversation drops blanks, bounds each turn, and retains newest order", () => {
  const result = trimArchiveConversation(
    [
      { role: "user", content: "  discard-oldest  " },
      { role: "assistant", content: " \n\t " },
      { role: "assistant", content: "  alpha-long  " },
      { role: "user", content: "  beta-long  " },
      { role: "assistant", content: "  gamma-long  " },
    ],
    { maxTurns: 2, maxTotalChars: 100, maxCharsPerTurn: 5 },
  );

  assert.deepEqual(result, [
    { role: "user", content: "beta-" },
    { role: "assistant", content: "gamma" },
  ]);
});

test("trimArchiveConversation spends the total budget from the newest turn backwards", () => {
  const messages = [
    { role: "user", content: "123456" },
    { role: "assistant", content: "abcdef" },
    { role: "user", content: "UVWXYZ" },
  ];

  assert.deepEqual(
    trimArchiveConversation(messages, {
      maxTurns: 3,
      maxTotalChars: 9,
      maxCharsPerTurn: 6,
    }),
    [
      { role: "assistant", content: "abc" },
      { role: "user", content: "UVWXYZ" },
    ],
  );
  assert.deepEqual(
    trimArchiveConversation(messages, {
      maxTurns: 3,
      maxTotalChars: 0,
      maxCharsPerTurn: 6,
    }),
    [],
  );
  assert.deepEqual(
    trimArchiveConversation(messages, {
      maxTurns: 0,
      maxTotalChars: 20,
      maxCharsPerTurn: 6,
    }),
    [],
  );
});

test("OpenAI retry classification covers the full 5xx range and selected transient 4xx", () => {
  for (let status = 500; status <= 599; status += 1) {
    assert.equal(isRetryableOpenAiResponse(status, undefined), true, String(status));
  }

  const transient4xx = new Set([408, 409, 425, 429]);
  for (let status = 400; status <= 499; status += 1) {
    assert.equal(
      isRetryableOpenAiResponse(status, undefined),
      transient4xx.has(status),
      String(status),
    );
  }
  assert.equal(isRetryableOpenAiResponse(600, undefined), false);
});

test("OpenAI quota and spend-limit responses are terminal even when their status is transient", () => {
  for (const code of [
    "credit_balance_exhausted",
    "organization_spend_limit_exceeded",
    "project_spend_limit_exceeded",
    "organization_usage_limit_exceeded",
    "insufficient_quota",
  ]) {
    assert.equal(isRetryableOpenAiResponse(429, { error: { code } }), false, code);
  }
  assert.equal(isRetryableOpenAiResponse(429, { error: { code: "rate_limit_exceeded" } }), true);
});

test("Retry-After supports milliseconds, seconds, HTTP dates, and bounded fallback", (t) => {
  const fixedNow = Date.UTC(2026, 7, 30, 12, 0, 0);
  replaceProperty(t, Date, "now", () => fixedNow);

  const milliseconds = new Response(null, {
    status: 503,
    headers: { "retry-after-ms": "875", "retry-after": "2" },
  });
  assert.equal(openAiRetryDelayMs(milliseconds, 0), 875);

  const seconds = new Response(null, {
    status: 503,
    headers: { "retry-after": "1.25" },
  });
  assert.equal(openAiRetryDelayMs(seconds, 0), 1_250);

  const date = new Response(null, {
    status: 503,
    headers: { "retry-after": new Date(fixedNow + 3_000).toUTCString() },
  });
  assert.equal(openAiRetryDelayMs(date, 0), 3_000);

  const serverDirectedLongDelay = new Response(null, {
    status: 503,
    headers: { "retry-after-ms": "9000" },
  });
  assert.equal(openAiRetryDelayMs(serverDirectedLongDelay, 0), 9_000);
  assert.equal(openAiRetryDelayMs(new Response(null, { status: 503 }), 20), 4_000);
});

test("requestOpenAiStructuredResponse retries a 503 and returns the next valid response", async (t) => {
  let fetchCalls = 0;
  const timers = installOpenAiHarness(t, async () => {
    fetchCalls += 1;
    if (fetchCalls === 1) {
      return Response.json(
        { error: { code: "server_error" } },
        { status: 503, headers: { "retry-after-ms": "0" } },
      );
    }
    return Response.json({ answer: "remote" });
  });

  const result = await openAiRequest();
  assert.deepEqual(result, { answer: "remote" });
  assert.equal(fetchCalls, 2);
  assert.equal(timers.size, 0, "deadline and retry timers must be cleared");
});

test("requestOpenAiStructuredResponse never retries a terminal 400", async (t) => {
  let fetchCalls = 0;
  const timers = installOpenAiHarness(t, async () => {
    fetchCalls += 1;
    return Response.json({ error: { code: "invalid_request_error" } }, { status: 400 });
  });

  await assert.rejects(openAiRequest(), (error) => {
    assert.ok(error instanceof ArchiveOpenAiTransportError);
    assert.equal(error.status, 400);
    return true;
  });
  assert.equal(fetchCalls, 1);
  assert.equal(timers.size, 0, "deadline timer must be cleared after failure");
});

test("requestOpenAiStructuredResponse stops after its three-attempt ceiling", async (t) => {
  let fetchCalls = 0;
  const timers = installOpenAiHarness(t, async () => {
    fetchCalls += 1;
    return Response.json(
      { error: { code: "server_error" } },
      { status: 503, headers: { "retry-after-ms": "0" } },
    );
  });

  await assert.rejects(openAiRequest(), (error) => {
    assert.ok(error instanceof ArchiveOpenAiTransportError);
    assert.equal(error.status, 503);
    return true;
  });
  assert.equal(fetchCalls, 3);
  assert.equal(timers.size, 0, "all timers must be cleared at the attempt ceiling");
});

test("requestOpenAiStructuredResponse will not wait past its shared deadline", async (t) => {
  let fetchCalls = 0;
  const timers = installOpenAiHarness(t, async () => {
    fetchCalls += 1;
    return Response.json(
      { error: { code: "server_error" } },
      { status: 503, headers: { "retry-after-ms": "5000" } },
    );
  });

  await assert.rejects(openAiRequest({ timeoutMs: 1_000 }), (error) => {
    assert.ok(error instanceof ArchiveOpenAiTransportError);
    assert.equal(error.status, 503);
    return true;
  });
  assert.equal(fetchCalls, 1);
  assert.equal(timers.size, 0, "deadline timer must be cleared without scheduling a late retry");
});

test("requestOpenAiStructuredResponse propagates caller AbortError without retrying", async (t) => {
  const caller = new AbortController();
  const abortError = new DOMException("caller cancelled", "AbortError");
  let fetchCalls = 0;
  let requestSignal;
  const timers = installOpenAiHarness(t, async (_input, init = {}) => {
    fetchCalls += 1;
    requestSignal = init.signal;
    return new Promise((_resolve, reject) => {
      if (init.signal.aborted) {
        reject(init.signal.reason);
        return;
      }
      init.signal.addEventListener("abort", () => reject(init.signal.reason), { once: true });
    });
  });

  const pending = openAiRequest({ signal: caller.signal });
  caller.abort(abortError);

  await assert.rejects(pending, (error) => error === abortError);
  assert.equal(fetchCalls, 1);
  assert.equal(requestSignal.aborted, true);
  assert.equal(timers.size, 0, "caller abort must clear the shared deadline timer");
});

test("archive API client rejects a 400 without replaying the generation POST", async (t) => {
  let fetchCalls = 0;
  installGlobals(t, {
    fetch: async () => {
      fetchCalls += 1;
      return Response.json({ error: "bad request" }, { status: 400 });
    },
  });

  await assert.rejects(
    postArchiveApi({
      url: "/api/archive-search",
      client: "search-v1",
      body: { query: "test" },
      signal: new AbortController().signal,
      validate: () => true,
    }),
    /Archive API request failed with 400/,
  );
  assert.equal(fetchCalls, 1);
});

test("archive API client never replays an explicit transient failure", async (t) => {
  let fetchCalls = 0;
  installGlobals(t, {
    fetch: async () => {
      fetchCalls += 1;
      return Response.json({ error: "temporarily unavailable" }, { status: 503 });
    },
  });

  await assert.rejects(
    postArchiveApi({
      url: "/api/archive-intelligence",
      client: "persona-v1",
      body: { messages: [] },
      signal: new AbortController().signal,
      validate: () => true,
    }),
    /Archive API request failed with 503/,
  );
  assert.equal(fetchCalls, 1);
});

test("archive API client never replays an invalid successful payload", async (t) => {
  let fetchCalls = 0;
  installGlobals(t, {
    fetch: async () => {
      fetchCalls += 1;
      return Response.json({ unexpected: true });
    },
  });

  await assert.rejects(
    postArchiveApi({
      url: "/api/archive-search",
      client: "search-v1",
      body: { query: "test" },
      signal: new AbortController().signal,
      validate: (payload) => Boolean(payload && typeof payload === "object" && "reply" in payload),
    }),
    /Archive API response was invalid/,
  );
  assert.equal(fetchCalls, 1);
});
