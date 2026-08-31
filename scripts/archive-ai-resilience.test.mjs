import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  ArchiveApiClientError,
  postArchiveApi,
  resumeArchiveApi,
} from "../src/lib/archive-api-client.ts";
import { logArchiveAiEvent } from "../src/lib/archive-ai-observability.server.ts";
import { trimArchiveConversation } from "../src/lib/archive-conversation-budget.ts";
import { archiveAiStateResponse } from "../src/lib/archive-ai-http.server.ts";
import {
  archiveOpenAiCreateOutcomeUnknown,
  archiveOpenAiProviderIdentity,
  archiveOpenAiResponseIsMissing,
  ArchiveOpenAiTransportError,
  cancelOpenAiBackgroundResponse,
  createOpenAiBackgroundResponse,
  isRetryableArchiveProviderError,
  isRetryableOpenAiCreateResponse,
  isRetryableOpenAiResponse,
  openAiRetryDelayMs,
  requestOpenAiStructuredResponse,
} from "../src/lib/archive-openai-transport.server.ts";

const ledgerSource = readFileSync(
  new URL("../src/lib/archive-ai-ledger.server.ts", import.meta.url),
  "utf8",
);
const circuitSource = readFileSync(
  new URL("../src/lib/archive-ai-circuit.server.ts", import.meta.url),
  "utf8",
);
const jobSource = readFileSync(
  new URL("../src/lib/archive-ai-job.server.ts", import.meta.url),
  "utf8",
);
const requestLedgerMigration = readFileSync(
  new URL("../migrations/0003_archive_ai_requests.sql", import.meta.url),
  "utf8",
);

test("the request ledger migration applies with lease fencing columns", async () => {
  const { PGlite } = await import("@electric-sql/pglite");
  const pg = new PGlite();
  try {
    await pg.waitReady;
    await pg.exec(requestLedgerMigration);
    const columns = await pg.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_name IN ('archive_ai_requests', 'archive_ai_circuit_breakers')`,
    );
    const names = new Set(columns.rows.map((row) => row.column_name));
    assert.equal(names.has("lease_generation"), true);
    assert.equal(names.has("probe_lease_expires_at"), true);
  } finally {
    await pg.close();
  }
});

function sourceSection(source, start, end) {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert.ok(startIndex >= 0 && endIndex > startIndex, `${start} section should remain reviewable`);
  return source.slice(startIndex, endIndex);
}

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
  replaceProperty(t, console, "log", () => undefined);
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

test("background cancellation targets the persisted response with the logical diagnostic id", async (t) => {
  const calls = [];
  installOpenAiHarness(t, async (input, init) => {
    calls.push({ input: String(input), init });
    return Response.json({ id: "resp_cancelled123", status: "cancelled" });
  });

  await cancelOpenAiBackgroundResponse({
    apiKey: "archive-resilience-test-key",
    responseId: "resp_cancelled123",
    logicalRequestId: "00000000-0000-4000-8000-000000000123",
    attemptOffset: 90,
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].init.method, "POST");
  assert.equal(new URL(calls[0].input).pathname, "/v1/responses/resp_cancelled123/cancel");
  assert.equal(
    calls[0].init.headers["x-client-request-id"],
    "00000000-0000-4000-8000-000000000123.a91",
  );
});

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

test("background create retries only responses that definitively did not create work", () => {
  for (const status of [409, 425, 429]) {
    assert.equal(isRetryableOpenAiCreateResponse(status, undefined), true, String(status));
  }
  for (const status of [408, 500, 503, 599]) {
    assert.equal(isRetryableOpenAiCreateResponse(status, undefined), false, String(status));
  }
  assert.equal(
    isRetryableOpenAiCreateResponse(429, { error: { code: "insufficient_quota" } }),
    false,
  );
});

test("provider retry classification excludes terminal status, payload, and quota failures", () => {
  for (const status of [408, 409, 425, 429, 500, 503, 599]) {
    assert.equal(
      isRetryableArchiveProviderError(
        new ArchiveOpenAiTransportError("transient", status, {
          code: status === 429 ? "rate_limit_exceeded" : undefined,
        }),
      ),
      true,
      String(status),
    );
  }
  for (const status of [400, 401, 403, 404, 422]) {
    assert.equal(
      isRetryableArchiveProviderError(new ArchiveOpenAiTransportError("terminal", status)),
      false,
      String(status),
    );
  }
  assert.equal(
    isRetryableArchiveProviderError(
      new ArchiveOpenAiTransportError("quota", 429, { code: "insufficient_quota" }),
    ),
    false,
  );
  assert.equal(
    isRetryableArchiveProviderError(new ArchiveOpenAiTransportError("OpenAI request timed out")),
    true,
  );
  assert.equal(
    isRetryableArchiveProviderError(
      new ArchiveOpenAiTransportError("OpenAI network request failed"),
    ),
    true,
  );
});

test("a missing persisted provider response is classified separately from a missing model", () => {
  assert.equal(
    archiveOpenAiResponseIsMissing(new ArchiveOpenAiTransportError("not found", 404)),
    true,
  );
  assert.equal(
    archiveOpenAiResponseIsMissing(new ArchiveOpenAiTransportError("unavailable", 503)),
    false,
  );
  assert.match(jobSource, /provider_response_id && archiveOpenAiResponseIsMissing\(error\)/u);
  assert.match(jobSource, /\? "provider_response_expired"/u);
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
  const fallback = openAiRetryDelayMs(new Response(null, { status: 503 }), 20);
  assert.ok(fallback >= 0 && fallback <= 4_000, `full-jitter fallback was ${fallback}`);
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

test("provider diagnostics use the exact logical request attempt format", async (t) => {
  const clientRequestIds = [];
  const timers = installOpenAiHarness(t, async (_input, init = {}) => {
    clientRequestIds.push(new Headers(init.headers).get("x-client-request-id"));
    return Response.json({ answer: "remote" });
  });

  await openAiRequest({ logicalRequestId: "logical-request" });
  await openAiRequest({ logicalRequestId: "logical-request" });

  assert.equal(clientRequestIds.length, 2);
  assert.equal(clientRequestIds[0], "logical-request.a1");
  assert.equal(clientRequestIds[1], "logical-request.a1");
  assert.equal(timers.size, 0);
});

test("requestOpenAiStructuredResponse never retries a successful malformed payload", async (t) => {
  let fetchCalls = 0;
  const timers = installOpenAiHarness(t, async () => {
    fetchCalls += 1;
    return Response.json(fetchCalls === 1 ? { malformed: true } : { answer: "remote" });
  });
  await assert.rejects(
    openAiRequest({
      parse: (payload) => {
        if (!payload || typeof payload !== "object" || !("answer" in payload)) {
          throw new Error("invalid structured payload");
        }
        return payload;
      },
    }),
    /expected structured payload/,
  );
  assert.equal(fetchCalls, 1);
  assert.equal(timers.size, 0);
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

test("background create leaves ambiguous retry scheduling to the durable ledger", async (t) => {
  let fetchCalls = 0;
  const timers = installOpenAiHarness(t, async () => {
    fetchCalls += 1;
    throw new TypeError("connection reset after write");
  });

  await assert.rejects(
    createOpenAiBackgroundResponse({
      apiKey: "archive-resilience-test-key",
      body: { model: "gpt-5.6-sol", input: "test" },
      logicalRequestId: "00000000-0000-4000-8000-000000000001.create1",
    }),
    (error) => archiveOpenAiCreateOutcomeUnknown(error),
  );
  assert.equal(fetchCalls, 1, "transport must not hide extra billable create attempts");
  assert.equal(timers.size, 0);
});

test("background create does not internally retry ambiguous 408 or 5xx outcomes", async (t) => {
  let fetchCalls = 0;
  let status = 408;
  const timers = installOpenAiHarness(t, async () => {
    fetchCalls += 1;
    return Response.json(
      { error: { code: "server_error" } },
      { status, headers: { "retry-after-ms": "0" } },
    );
  });

  for (const [index, ambiguousStatus] of [408, 500, 503, 599].entries()) {
    status = ambiguousStatus;
    await assert.rejects(
      createOpenAiBackgroundResponse({
        apiKey: "archive-resilience-test-key",
        body: { model: "gpt-5.6-sol", input: "test" },
        logicalRequestId: `00000000-0000-4000-8000-00000000000${index + 2}.create1`,
      }),
      (error) => {
        assert.ok(error instanceof ArchiveOpenAiTransportError);
        assert.equal(error.status, ambiguousStatus);
        assert.equal(archiveOpenAiCreateOutcomeUnknown(error), true);
        return true;
      },
    );
  }
  assert.equal(fetchCalls, 4, "each logical create must make exactly one physical POST");
  assert.equal(timers.size, 0);
});

test("background create retries a definitive 429 response up to three times", async (t) => {
  let fetchCalls = 0;
  const timers = installOpenAiHarness(t, async () => {
    fetchCalls += 1;
    return Response.json(
      { error: { code: "rate_limit_exceeded" } },
      { status: 429, headers: { "retry-after-ms": "0" } },
    );
  });

  await assert.rejects(
    createOpenAiBackgroundResponse({
      apiKey: "archive-resilience-test-key",
      body: { model: "gpt-5.6-sol", input: "test" },
      logicalRequestId: "00000000-0000-4000-8000-000000000009.create1",
    }),
    (error) => {
      assert.ok(error instanceof ArchiveOpenAiTransportError);
      assert.equal(error.status, 429);
      assert.equal(archiveOpenAiCreateOutcomeUnknown(error), false);
      return true;
    },
  );
  assert.equal(fetchCalls, 3);
  assert.equal(timers.size, 0);
});

test("background create never recreates after a malformed HTTP 200", async (t) => {
  let fetchCalls = 0;
  const timers = installOpenAiHarness(t, async () => {
    fetchCalls += 1;
    return new Response("not-json", {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  });

  await assert.rejects(
    createOpenAiBackgroundResponse({
      apiKey: "archive-resilience-test-key",
      body: { model: "gpt-5.6-sol", input: "test" },
      logicalRequestId: "00000000-0000-4000-8000-000000000004.create1",
    }),
    (error) => archiveOpenAiCreateOutcomeUnknown(error) === false,
  );
  assert.equal(fetchCalls, 1);
  assert.equal(timers.size, 0);
});

test("background create never recreates after HTTP 200 without a response id", async (t) => {
  let fetchCalls = 0;
  const timers = installOpenAiHarness(t, async () => {
    fetchCalls += 1;
    return Response.json({ model: "gpt-5.6-sol", status: "completed" });
  });

  await assert.rejects(
    createOpenAiBackgroundResponse({
      apiKey: "archive-resilience-test-key",
      body: { model: "gpt-5.6-sol", input: "test" },
      logicalRequestId: "00000000-0000-4000-8000-000000000005.create1",
    }),
    (error) => archiveOpenAiCreateOutcomeUnknown(error) === false,
  );
  assert.equal(fetchCalls, 1);
  assert.equal(timers.size, 0);
});

test("a confirmed provider response id is adopted even when create metadata is invalid", async (t) => {
  let fetchCalls = 0;
  const timers = installOpenAiHarness(t, async () => {
    fetchCalls += 1;
    return Response.json(
      { id: "resp_identity123", model: "gpt-5.6-sol", status: "unexpected" },
      { headers: { "x-request-id": "req_identity123" } },
    );
  });

  await assert.rejects(
    createOpenAiBackgroundResponse({
      apiKey: "archive-resilience-test-key",
      body: { model: "gpt-5.6-sol", input: "test" },
      logicalRequestId: "00000000-0000-4000-8000-000000000003.create1",
    }),
    (error) => {
      assert.equal(archiveOpenAiCreateOutcomeUnknown(error), false);
      assert.deepEqual(archiveOpenAiProviderIdentity(error), {
        providerModel: "gpt-5.6-sol",
        providerResponseId: "resp_identity123",
        openaiRequestId: "req_identity123",
      });
      return true;
    },
  );
  assert.equal(fetchCalls, 1);
  assert.equal(timers.size, 0);
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

test("archive API client recovers a transient HTTP failure through the same request ledger", async (t) => {
  let fetchCalls = 0;
  let logicalRequestId = "";
  installGlobals(t, {
    fetch: async (_input, init) => {
      fetchCalls += 1;
      logicalRequestId ||= new Headers(init.headers).get("x-archive-request-id") ?? "";
      if (fetchCalls === 1) {
        return Response.json({ error: "temporarily unavailable" }, { status: 503 });
      }
      assert.match(logicalRequestId, /^[0-9a-f-]{36}$/u);
      return Response.json({
        requestId: logicalRequestId,
        state: "local",
        requestedModel: "gpt-5.6-luna",
        result: {
          reply: "recovered",
          requestId: logicalRequestId,
          requestedModel: "gpt-5.6-luna",
          source: "local",
          modelVerified: false,
        },
      });
    },
  });

  const result = await postArchiveApi({
    url: "/api/archive-intelligence",
    client: "persona-v1",
    body: { messages: [] },
    signal: new AbortController().signal,
    validate: (payload) => Boolean(payload && typeof payload === "object" && "reply" in payload),
  });
  assert.deepEqual(result, {
    reply: "recovered",
    requestId: logicalRequestId,
    requestedModel: "gpt-5.6-luna",
    source: "local",
    modelVerified: false,
  });
  assert.equal(fetchCalls, 2);
});

test("healthy pending polls honor the server window without extra client jitter", async (t) => {
  const delays = [];
  let nextTimerId = 0;
  const cancelledTimers = new Set();
  replaceProperty(t, Math, "random", () => 0.999);
  replaceProperty(t, globalThis, "setTimeout", (callback, delay = 0, ...args) => {
    const id = ++nextTimerId;
    const numericDelay = Number(delay);
    delays.push(numericDelay);
    if (numericDelay < 10_000) {
      queueMicrotask(() => {
        if (!cancelledTimers.has(id)) callback(...args);
      });
    }
    return id;
  });
  replaceProperty(t, globalThis, "clearTimeout", (id) => cancelledTimers.add(id));

  const requestId = "00000000-0000-4000-8000-000000000140";
  let fetchCalls = 0;
  const timings = [];
  installGlobals(t, {
    fetch: async () => {
      fetchCalls += 1;
      if (fetchCalls === 1) {
        return Response.json(
          {
            requestId,
            state: "running",
            retryAfterMs: 250,
            requestedModel: "gpt-5.6-terra",
            expiresAt: new Date(Date.now() + 60_000).toISOString(),
          },
          { status: 202 },
        );
      }
      return Response.json({
        requestId,
        state: "local",
        requestedModel: "gpt-5.6-terra",
        result: {
          reply: "ready",
          requestId,
          requestedModel: "gpt-5.6-terra",
          source: "local",
          modelVerified: false,
        },
      });
    },
  });

  const result = await postArchiveApi({
    url: "/api/archive-search",
    client: "search-v1",
    body: { query: "ready" },
    requestId,
    signal: new AbortController().signal,
    validate: (payload) => Boolean(payload && typeof payload === "object" && "reply" in payload),
    onTiming: (timing) => timings.push(timing),
  });

  assert.equal(result.reply, "ready");
  assert.equal(fetchCalls, 2);
  assert.deepEqual(
    delays.filter((delay) => delay < 10_000 && delay !== 450),
    [250],
    "a lease-aware server delay must not receive the transport-failure jitter",
  );
  assert.deepEqual(
    timings.map(({ phase, outcome, status }) => ({ phase, outcome, status })),
    [
      { phase: "submit", outcome: "response", status: 202 },
      { phase: "poll", outcome: "response", status: 200 },
    ],
  );
  assert.equal(
    timings.every((timing) => timing.durationMs >= 0),
    true,
  );
});

test("a confirmed missing ledger is recreated immediately after the paid retry wait", async (t) => {
  const delays = [];
  let nextTimerId = 0;
  const cancelledTimers = new Set();
  replaceProperty(t, Math, "random", () => 0);
  replaceProperty(t, globalThis, "setTimeout", (callback, delay = 0, ...args) => {
    const id = ++nextTimerId;
    const numericDelay = Number(delay);
    delays.push(numericDelay);
    if (numericDelay < 10_000) {
      queueMicrotask(() => {
        if (!cancelledTimers.has(id)) callback(...args);
      });
    }
    return id;
  });
  replaceProperty(t, globalThis, "clearTimeout", (id) => cancelledTimers.add(id));

  const requestId = "00000000-0000-4000-8000-000000000141";
  const methods = [];
  installGlobals(t, {
    fetch: async (_input, init) => {
      methods.push(init.method);
      if (methods.length === 1) {
        return Response.json({ error: "temporarily unavailable" }, { status: 503 });
      }
      if (methods.length === 2) {
        return Response.json({ error: "not found" }, { status: 404 });
      }
      return Response.json({
        requestId,
        state: "local",
        requestedModel: "gpt-5.6-luna",
        result: {
          reply: "recreated",
          requestId,
          requestedModel: "gpt-5.6-luna",
          source: "local",
          modelVerified: false,
        },
      });
    },
  });

  const result = await postArchiveApi({
    url: "/api/archive-intelligence",
    client: "persona-v1",
    body: { messages: [] },
    requestId,
    signal: new AbortController().signal,
    validate: (payload) => Boolean(payload && typeof payload === "object" && "reply" in payload),
  });

  assert.equal(result.reply, "recreated");
  assert.deepEqual(methods, ["POST", "GET", "POST"]);
  assert.deepEqual(
    delays.filter((delay) => delay < 10_000 && delay !== 450),
    [200],
    "GET 404 must not add the old two-second sleep before the same-id POST",
  );
});

test("archive API client can recreate a missing ledger with the same id up to three POST attempts", async (t) => {
  let nextTimerId = 0;
  const cancelledTimers = new Set();
  replaceProperty(t, globalThis, "setTimeout", (callback, delay = 0, ...args) => {
    const id = ++nextTimerId;
    if (Number(delay) < 10_000) {
      queueMicrotask(() => {
        if (!cancelledTimers.has(id)) callback(...args);
      });
    }
    return id;
  });
  replaceProperty(t, globalThis, "clearTimeout", (id) => cancelledTimers.add(id));

  const methods = [];
  let logicalRequestId = "";
  installGlobals(t, {
    fetch: async (_input, init) => {
      const method = init.method ?? "GET";
      methods.push(method);
      logicalRequestId ||= new Headers(init.headers).get("x-archive-request-id") ?? "";
      if (methods.length === 1 || methods.length === 3) {
        return Response.json({ error: "gateway unavailable" }, { status: 503 });
      }
      if (methods.length === 2 || methods.length === 4) {
        return Response.json({ error: "not found" }, { status: 404 });
      }
      return Response.json({
        requestId: logicalRequestId,
        state: "local",
        requestedModel: "gpt-5.6-terra",
        result: {
          reply: "recovered after ledger recreation",
          requestId: logicalRequestId,
          requestedModel: "gpt-5.6-terra",
          source: "local",
          modelVerified: false,
        },
      });
    },
  });

  const result = await postArchiveApi({
    url: "/api/archive-search",
    client: "search-v1",
    body: { query: "recover" },
    signal: new AbortController().signal,
    validate: (payload) => Boolean(payload && typeof payload === "object" && "reply" in payload),
  });
  assert.equal(result.reply, "recovered after ledger recreation");
  assert.deepEqual(methods, ["POST", "GET", "POST", "GET", "POST"]);
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

test("archive API client treats retryable failed envelopes as terminal", async (t) => {
  let fetchCalls = 0;
  installGlobals(t, {
    fetch: async (_input, init) => {
      fetchCalls += 1;
      const requestId = new Headers(init.headers).get("x-archive-request-id");
      return Response.json({
        requestId,
        state: "failed",
        reason: "provider_unavailable",
        retryable: true,
      });
    },
  });

  await assert.rejects(
    postArchiveApi({
      url: "/api/archive-search",
      client: "search-v1",
      body: { query: "test" },
      signal: new AbortController().signal,
      validate: () => false,
    }),
    (error) =>
      error instanceof ArchiveApiClientError &&
      error.reason === "provider_unavailable" &&
      error.retryable,
  );
  assert.equal(fetchCalls, 1);
});

test("archive API client rejects a bare result and a mismatched envelope request id", async (t) => {
  let fetchCalls = 0;
  installGlobals(t, {
    fetch: async (_input, init) => {
      fetchCalls += 1;
      assert.ok(new Headers(init.headers).get("x-archive-request-id"));
      if (fetchCalls === 1) return Response.json({ reply: "bare result" });
      return Response.json({
        requestId: "10000000-0000-4000-8000-000000000001",
        state: "local",
        requestedModel: "gpt-5.6-luna",
        result: {
          reply: "wrong request",
          requestId: "10000000-0000-4000-8000-000000000001",
          requestedModel: "gpt-5.6-luna",
          source: "local",
          modelVerified: false,
        },
      });
    },
  });
  const validate = (payload) =>
    Boolean(payload && typeof payload === "object" && "reply" in payload);
  await assert.rejects(
    postArchiveApi({
      url: "/api/archive-intelligence",
      client: "persona-v1",
      body: { messages: [] },
      signal: new AbortController().signal,
      validate,
    }),
    /response was invalid/,
  );
  await assert.rejects(
    postArchiveApi({
      url: "/api/archive-intelligence",
      client: "persona-v1",
      body: { messages: [] },
      signal: new AbortController().signal,
      validate,
      requestId: "00000000-0000-4000-8000-000000000001",
    }),
    /request id did not match/,
  );
  assert.equal(fetchCalls, 2);
});

test("archive API recovery rejects a mismatched envelope request id", async (t) => {
  installGlobals(t, {
    fetch: async () =>
      Response.json({
        requestId: "10000000-0000-4000-8000-000000000001",
        state: "failed",
        reason: "provider_unavailable",
        retryable: false,
      }),
  });
  await assert.rejects(
    resumeArchiveApi({
      pending: {
        requestId: "00000000-0000-4000-8000-000000000001",
        url: "/api/archive-search",
        client: "search-v1",
        startedAt: Date.now(),
        expiresAt: Date.now() + 60_000,
      },
      signal: new AbortController().signal,
      validate: () => false,
    }),
    /request id did not match/,
  );
});

test("archive AI structured logging strips prompt, answer, and IP fields", (t) => {
  let line = "";
  replaceProperty(t, console, "log", (value) => {
    line = String(value);
  });
  logArchiveAiEvent("safe_log_test", {
    requestId: "request-safe",
    providerResponseId: "resp_safe12345678",
    status: 503,
    errorCode: "server_error",
    latencyMs: 42,
    prompt: "secret prompt",
    promptText: "secret prompt variant",
    answer: "secret answer",
    response_body: "secret response body",
    ip: "203.0.113.4",
    raw_ip: "198.51.100.9",
  });
  const parsed = JSON.parse(line);
  assert.equal(parsed.requestId, "request-safe");
  assert.equal(parsed.providerResponseId, "resp_safe12345678");
  assert.equal(parsed.status, 503);
  assert.equal(parsed.errorCode, "server_error");
  assert.equal(parsed.latencyMs, 42);
  assert.equal("prompt" in parsed, false);
  assert.equal("answer" in parsed, false);
  assert.equal("ip" in parsed, false);
  assert.equal("promptText" in parsed, false);
  assert.equal("response_body" in parsed, false);
  assert.equal("raw_ip" in parsed, false);
  assert.doesNotMatch(
    line,
    /secret prompt|secret answer|secret response body|203\.0\.113\.4|198\.51\.100\.9/u,
  );
});

test("the request ledger permits exactly one fenced recovery create after five seconds", () => {
  const claim = sourceSection(
    ledgerSource,
    "export async function claimArchiveAiRequest",
    "export async function recordArchiveAiProviderStarted",
  );
  const begin = sourceSection(
    ledgerSource,
    "export async function beginArchiveAiProviderCreateAttempt",
    "export async function deferArchiveAiProviderCreateRetry",
  );
  const defer = sourceSection(
    ledgerSource,
    "export async function deferArchiveAiProviderCreateRetry",
    "export async function recordArchiveAiProviderProgress",
  );

  assert.match(ledgerSource, /const LEASE_MS = 45_000/);
  assert.match(requestLedgerMigration, /lease_generation INTEGER NOT NULL DEFAULT 0/);
  assert.match(claim, /lease_expires_at = NOW\(\) \+ \(\$3::text \|\| ' milliseconds'\)::interval/);
  assert.match(claim, /lease_generation = lease_generation \+ 1/);
  assert.match(begin, /attempt_count = 0/);
  assert.match(begin, /provider_response_id IS NULL/);
  assert.match(begin, /attempt_count = 1 AND state = 'unknown' AND next_poll_at <= NOW\(\)/);
  assert.match(begin, /attempt_count < 2/);
  assert.match(begin, /lease_generation = \$3/);
  assert.match(begin, /lease_expires_at > NOW\(\)/);
  assert.match(defer, /next_poll_at = NOW\(\) \+ INTERVAL '5 seconds'/);
  assert.match(defer, /attempt_count = 1/);
  assert.match(jobSource, /providerCreateAttempt === 1/);
  assert.match(jobSource, /archiveOpenAiCreateOutcomeUnknown\(error\)/);
  assert.match(jobSource, /archiveOpenAiProviderIdentity\(error\)/);
});

test("terminal request states cannot be resurrected by a stale provider worker", () => {
  const started = sourceSection(
    ledgerSource,
    "export async function recordArchiveAiProviderStarted",
    "export async function beginArchiveAiProviderCreateAttempt",
  );
  const progress = sourceSection(
    ledgerSource,
    "export async function recordArchiveAiProviderProgress",
    "export async function completeArchiveAiRequest",
  );
  const complete = sourceSection(
    ledgerSource,
    "export async function completeArchiveAiRequest",
    "export async function failArchiveAiRequest",
  );
  const fail = sourceSection(
    ledgerSource,
    "export async function failArchiveAiRequest",
    "export async function cancelArchiveAiRequest",
  );
  const cancel = sourceSection(
    ledgerSource,
    "export async function cancelArchiveAiRequest",
    "export function archiveAiRequestState",
  );

  assert.match(started, /state IN \('queued', 'running', 'unknown'\)/);
  assert.match(started, /provider_response_id IS NULL/);
  assert.match(started, /attempt_count BETWEEN 1 AND 2/);
  assert.match(started, /lease_generation = \$6/);
  assert.match(progress, /state IN \('running', 'unknown'\)/);
  assert.match(progress, /provider_response_id IS NOT NULL/);
  assert.match(progress, /lease_generation = \$6/);
  for (const section of [complete, fail]) {
    assert.match(section, /state IN \('queued', 'running', 'unknown'\)/);
    assert.match(section, /lease_generation = \$/);
    assert.doesNotMatch(section, /state NOT IN/);
  }
  assert.match(cancel, /state IN \('queued', 'running', 'unknown'\)/);
  assert.doesNotMatch(cancel, /state NOT IN/);
});

test("a provider response that loses ledger adoption is cancelled by exact id", () => {
  const cancellation = sourceSection(
    jobSource,
    "async function cancelUnadoptedProviderResponse",
    "async function finishOnline",
  );
  assert.match(cancellation, /cancelOpenAiBackgroundResponse\(\{/);
  assert.match(cancellation, /responseId: providerResponseId/);
  assert.match(cancellation, /unadopted_provider_cancel_failed/);

  assert.match(
    jobSource,
    /catch \(error\) \{\s*await cancelUnadoptedProviderResponse\(apiKey, row, response\.metadata\.providerResponseId\)/u,
  );
  assert.match(
    jobSource,
    /if \(!adopted\) \{\s*await cancelUnadoptedProviderResponse\(apiKey, row, response\.metadata\.providerResponseId\)/u,
  );
  assert.match(
    jobSource,
    /else \{\s*await cancelUnadoptedProviderResponse\(\s*apiKey,\s*row,\s*providerIdentity\.providerResponseId/u,
  );
});

test("a crashed half-open circuit probe releases itself after a bounded lease", () => {
  const acquire = sourceSection(
    circuitSource,
    "export async function acquireArchiveAiCircuit",
    "const BREAKER_FAILURE_REASONS",
  );
  assert.match(requestLedgerMigration, /probe_lease_expires_at TIMESTAMPTZ/);
  assert.match(circuitSource, /const PROBE_LEASE_MS = 45_000/);
  assert.match(acquire, /probeLeaseExpiresAt > now/);
  assert.match(acquire, /new Date\(now \+ PROBE_LEASE_MS\)\.toISOString\(\)/);
  assert.match(acquire, /probe_lease_expires_at = \$2::timestamptz/);
  assert.match(circuitSource, /probe_lease_expires_at = NULL/);
});

test("expired requests return 410 while an encrypted-data-free tombstone is retained", () => {
  const cleanupStart = ledgerSource.indexOf("export async function cleanupArchiveAiRequests");
  assert.ok(cleanupStart >= 0);
  const cleanup = ledgerSource.slice(cleanupStart);
  const response = archiveAiStateResponse({
    requestId: "00000000-0000-4000-8000-000000000004",
    state: "expired",
    reason: "request_expired",
    retryable: false,
  });

  assert.equal(response.status, 410);
  assert.match(
    ledgerSource,
    /state = 'expired', encrypted_request = NULL, encrypted_result = NULL/,
  );
  assert.match(ledgerSource, /expires_at = NOW\(\) \+ INTERVAL '1 hour'/);
  assert.match(cleanup, /DELETE FROM archive_ai_requests/);
  assert.match(cleanup, /WHERE state = 'expired' AND expires_at <= NOW\(\)/);
});
