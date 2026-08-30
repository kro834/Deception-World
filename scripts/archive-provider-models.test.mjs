import assert from "node:assert/strict";
import test from "node:test";

import {
  isArchiveAiRequestEnvelope,
  isArchiveProviderRequestId,
  isArchiveProviderResponseId,
} from "../src/lib/archive-ai-request.ts";
import {
  ARCHIVE_PROVIDER_MODELS_BY_REQUEST,
  isAllowedArchiveProviderModel,
  isArchiveRequestedModel,
} from "../src/lib/archive-provider-models.js";
import {
  ARCHIVE_AI_DEPLOYMENT_CASES,
  verifyArchiveAiDeployment,
} from "./verify-archive-ai-deployment.mjs";

const SHA = "0123456789abcdef0123456789abcdef01234567";
const TOKEN = "monitor-token".repeat(4);

function searchResult(requestId, requestedModel, providerModel) {
  const providerResponseId = `resp_${requestId.replaceAll("-", "")}`;
  const openaiRequestId = `req_${requestId.replaceAll("-", "")}`;
  return {
    requestId,
    reply: "接続確認済みです。",
    suggestions: [],
    referenceCandidateIds: [],
    source: "openai",
    requestedModel,
    providerModel,
    providerResponseId,
    openaiRequestId,
    modelVerified: true,
    delivery: { channel: "online", reason: "ok" },
  };
}

function searchEnvelope(requestId, requestedModel, providerModel) {
  const result = searchResult(requestId, requestedModel, providerModel);
  return {
    requestId,
    state: "succeeded",
    requestedModel: result.requestedModel,
    providerModel,
    providerResponseId: result.providerResponseId,
    openaiRequestId: result.openaiRequestId,
    result,
  };
}

function isSearchResult(value) {
  return Boolean(value && typeof value === "object" && value.source === "openai");
}

test("the shared provider contract accepts the official GPT-5.5 snapshot and Grok 4.20", () => {
  assert.deepEqual(ARCHIVE_PROVIDER_MODELS_BY_REQUEST["gpt-5.5"], [
    "gpt-5.5-2026-04-23",
    "grok-4.20-0309-non-reasoning",
    "grok-4.20-0309-reasoning",
  ]);
  assert.equal(isAllowedArchiveProviderModel("gpt-5.5", "gpt-5.5"), false);
  assert.equal(isAllowedArchiveProviderModel("gpt-5.5", "gpt-5.5-2026-04-23"), true);
  assert.equal(isAllowedArchiveProviderModel("gpt-5.5", "grok-4.20-0309-non-reasoning"), true);
  assert.equal(isAllowedArchiveProviderModel("gpt-5.6-terra", "gpt-5.5-2026-04-23"), false);
  assert.equal(isAllowedArchiveProviderModel("gpt-5.5", "gpt-5.5-2099-01-01"), false);
});

test("the browser envelope accepts Grok 4.20 UUIDs as well as OpenAI resp_/req_ ids", () => {
  const requestId = crypto.randomUUID();
  const grokResponseId = "23f3a044-8554-9a22-b4d6-e31fac4dfad2";
  const grokRequestId = "xai-request-9f3a2c1b0e";
  assert.equal(isArchiveProviderResponseId(`resp_${requestId.replaceAll("-", "")}`), true);
  assert.equal(isArchiveProviderResponseId(grokResponseId), true);
  assert.equal(isArchiveProviderResponseId("short"), false);
  assert.equal(isArchiveProviderRequestId(`req_${requestId.replaceAll("-", "")}`), true);
  assert.equal(isArchiveProviderRequestId(grokRequestId), true);
  const grokEnvelope = {
    requestId,
    state: "succeeded",
    requestedModel: "gpt-5.6-terra",
    providerModel: "grok-4.20-0309-non-reasoning",
    providerResponseId: grokResponseId,
    openaiRequestId: grokRequestId,
    result: {
      requestId,
      reply: "接続確認済みです。",
      suggestions: [],
      referenceCandidateIds: [],
      source: "openai",
      requestedModel: "gpt-5.6-terra",
      providerModel: "grok-4.20-0309-non-reasoning",
      providerResponseId: grokResponseId,
      openaiRequestId: grokRequestId,
      modelVerified: true,
      delivery: { channel: "online", reason: "ok" },
    },
  };
  assert.equal(isArchiveAiRequestEnvelope(grokEnvelope, isSearchResult), true);
  assert.equal(
    isArchiveAiRequestEnvelope({ ...grokEnvelope, openaiRequestId: undefined }, isSearchResult),
    false,
  );
});

test("the browser envelope accepts the allowed GPT-5.5 snapshot and rejects unknown snapshots", () => {
  const requestId = crypto.randomUUID();
  assert.equal(
    isArchiveAiRequestEnvelope(
      searchEnvelope(requestId, "gpt-5.5", "gpt-5.5-2026-04-23"),
      isSearchResult,
    ),
    true,
  );
  assert.equal(
    isArchiveAiRequestEnvelope(
      searchEnvelope(requestId, "gpt-5.5", "gpt-5.5-2099-01-01"),
      isSearchResult,
    ),
    false,
  );
});

test("provider model lookup fails closed for inherited and hostile keys", () => {
  assert.equal(isArchiveRequestedModel("__proto__"), false);
  assert.equal(isArchiveRequestedModel("constructor"), false);
  assert.equal(isAllowedArchiveProviderModel("__proto__", "gpt-5.5-2026-04-23"), false);
  assert.equal(isAllowedArchiveProviderModel("constructor", "gpt-5.6-sol"), false);
});

test("request envelopes reject unknown models, malformed expiries, and unknown reasons", () => {
  const requestId = crypto.randomUUID();
  const pending = {
    requestId,
    state: "running",
    retryAfterMs: 1_000,
    requestedModel: "gpt-5.6-terra",
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  };
  assert.equal(isArchiveAiRequestEnvelope(pending, () => false), true);
  assert.equal(
    isArchiveAiRequestEnvelope({ ...pending, requestedModel: "__proto__" }, () => false),
    false,
  );
  assert.equal(
    isArchiveAiRequestEnvelope({ ...pending, expiresAt: "not-a-date" }, () => false),
    false,
  );
  assert.equal(
    isArchiveAiRequestEnvelope(
      { requestId, state: "failed", reason: "made_up_reason", retryable: false },
      () => false,
    ),
    false,
  );
});

test("the Production verifier accepts an allowed resolved GPT-5.5 snapshot", async () => {
  let call = 0;
  const report = await verifyArchiveAiDeployment({
    baseUrl: "https://archive.example",
    expectedSha: SHA,
    monitorToken: TOKEN,
    probeControlPlane: false,
    fetchImpl: async (_input, init) => {
      const deploymentCase = ARCHIVE_AI_DEPLOYMENT_CASES[call++];
      const requestId = JSON.parse(init.body).requestId;
      const providerModel =
        deploymentCase.expectedModel === "gpt-5.5"
          ? "gpt-5.5-2026-04-23"
          : deploymentCase.expectedModel;
      return Response.json(
        searchEnvelope(requestId, deploymentCase.expectedModel, providerModel),
        {
        headers: { "x-archive-deployment-sha": SHA },
        },
      );
    },
  });

  assert.equal(report.ok, true);
  assert.equal(
    report.results.filter((result) => result.expectedModel === "gpt-5.5").every(
      (result) => result.providerModel === "gpt-5.5-2026-04-23",
    ),
    true,
  );
});
