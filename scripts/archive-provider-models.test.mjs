import assert from "node:assert/strict";
import test from "node:test";

import { isArchiveAiRequestEnvelope } from "../src/lib/archive-ai-request.ts";
import {
  ARCHIVE_PROVIDER_MODELS_BY_REQUEST,
  isAllowedArchiveProviderModel,
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

test("the shared provider contract accepts the official GPT-5.5 snapshot only for GPT-5.5", () => {
  assert.deepEqual(ARCHIVE_PROVIDER_MODELS_BY_REQUEST["gpt-5.5"], [
    "gpt-5.5-2026-04-23",
  ]);
  assert.equal(isAllowedArchiveProviderModel("gpt-5.5", "gpt-5.5"), false);
  assert.equal(isAllowedArchiveProviderModel("gpt-5.5", "gpt-5.5-2026-04-23"), true);
  assert.equal(isAllowedArchiveProviderModel("gpt-5.6-terra", "gpt-5.5-2026-04-23"), false);
  assert.equal(isAllowedArchiveProviderModel("gpt-5.5", "gpt-5.5-2099-01-01"), false);
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
