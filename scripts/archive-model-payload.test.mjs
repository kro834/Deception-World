import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));

const SEARCH_EFFORTS = ["low", "medium", "high", "xhigh"];
const SEARCH_RUNTIME = {
  low: { maxOutputTokens: 1_600, timeoutMs: 10_000 },
  medium: { maxOutputTokens: 2_000, timeoutMs: 12_000 },
  high: { maxOutputTokens: 2_400, timeoutMs: 14_000 },
  xhigh: { maxOutputTokens: 3_200, timeoutMs: 16_000 },
};

function providerModelFor(requestedModel) {
  return requestedModel === "gpt-5.5" ? "gpt-5.5-2026-04-23" : requestedModel;
}

function mockOutputFor(body) {
  if (body.text?.format?.name === "deception_world_search_reply") {
    return {
      reply: "検".repeat(5_000),
      suggestions: ["続".repeat(140)],
      focusCandidateId: "",
      referenceCandidateIds: [],
    };
  }
  return {
    reply: "応".repeat(4_000),
    narration: "描".repeat(1_000),
    tactical: {
      range: "間".repeat(140),
      tempo: "速".repeat(140),
      threat: "脅".repeat(160),
      objective: "目".repeat(180),
    },
    suggestions: ["続".repeat(140)],
    navigationQuery: "",
  };
}

test("every Archive Intelligence choice reaches the Responses API with its fixed model profile", async () => {
  const vite = await createServer({
    root: projectRoot,
    configFile: false,
    appType: "custom",
    logLevel: "silent",
    server: { middlewareMode: true },
  });
  const originalFetch = globalThis.fetch;
  const originalApiKey = process.env.OPENAI_API_KEY;
  const originalXaiKey = process.env.XAI_API_KEY;
  const calls = [];

  try {
    const [{ requestOpenAiArchiveSearch }, { requestOpenAiArchiveReply }, modelConfig] =
      await Promise.all([
        vite.ssrLoadModule("/src/lib/archive-search.server.ts"),
        vite.ssrLoadModule("/src/lib/archive-intelligence.server.ts"),
        vite.ssrLoadModule("/src/lib/archive-model-config.ts"),
      ]);

    process.env.OPENAI_API_KEY = "archive-payload-test-key";
    delete process.env.XAI_API_KEY;
    globalThis.fetch = async (input, init = {}) => {
      const body = JSON.parse(String(init.body));
      calls.push({ input: String(input), init, body });
      return Response.json(
        {
          id: `resp_payload_${calls.length}`,
          model: providerModelFor(body.model),
          status: "completed",
          output_text: JSON.stringify(mockOutputFor(body)),
        },
        { headers: { "x-request-id": `req_payload_${calls.length}` } },
      );
    };

    const searchCases = [
      ...["gpt-5.5", "gpt-5.6-terra"].flatMap((model) =>
        SEARCH_EFFORTS.map((effort) => ({
          name: `${model}/${effort}`,
          preference: { model, effort, execution: "standard" },
          expected: {
            model,
            reasoning: { effort, context: "current_turn" },
            ...SEARCH_RUNTIME[effort],
            verbosity: "low",
            costClass:
              model === "gpt-5.5" || effort === "high" || effort === "xhigh"
                ? "advanced"
                : "standard",
          },
        })),
      ),
      {
        name: "gpt-5.6-terra/Search Pro",
        preference: { model: "gpt-5.6-terra", effort: "xhigh", execution: "pro" },
        expected: {
          model: "gpt-5.6-terra",
          reasoning: { effort: "xhigh", mode: "pro", context: "current_turn" },
          maxOutputTokens: 4_800,
          timeoutMs: 28_000,
          verbosity: "medium",
          costClass: "pro",
        },
      },
    ];

    for (const { name, preference, expected } of searchCases) {
      const callIndex = calls.length;
      const reply = await requestOpenAiArchiveSearch({
        messages: [{ role: "user", content: `search payload ${name}` }],
        candidates: [],
        modelPreference: preference,
        safetyIdentifier: "search-safety-id",
      });
      assert.equal(calls.length, callIndex + 1, `${name} should perform exactly one fetch`);
      const { input, init, body } = calls[callIndex];
      assert.equal(input, "https://api.openai.com/v1/responses", name);
      assert.equal(init.method, "POST", name);
      assert.equal(
        new Headers(init.headers).get("authorization"),
        "Bearer archive-payload-test-key",
      );
      assert.equal(body.model, providerModelFor(expected.model), name);
      assert.deepEqual(body.reasoning, expected.reasoning, name);
      assert.equal(body.max_output_tokens, expected.maxOutputTokens, name);
      assert.equal(body.text.verbosity, expected.verbosity, name);
      assert.equal(body.safety_identifier, "search-safety-id", name);
      assert.equal(body.store, false, name);
      assert.deepEqual(body.tools, [], name);
      const resolvedRoute = modelConfig.resolveArchiveSearchRoute(preference);
      assert.equal(resolvedRoute.requestedModel, expected.model, name);
      assert.equal(resolvedRoute.model, providerModelFor(expected.model), name);
      assert.equal(resolvedRoute.costClass, expected.costClass);
      assert.equal(resolvedRoute.timeoutMs, expected.timeoutMs, name);
      assert.equal(reply?.source, "openai", name);
      assert.equal(reply?.model, expected.model, name);
      assert.equal(reply?.providerModel, providerModelFor(expected.model), name);
      assert.equal(reply?.openaiRequestId, `req_payload_${callIndex + 1}`, name);
      assert.equal(reply?.modelVerified, true, name);
      assert.equal(reply?.reply.length, preference.execution === "pro" ? 3_600 : 2_400, name);
      assert.equal(reply?.suggestions[0]?.length, 90, name);
    }

    const personaCases = [
      {
        name: "Normal/Luna",
        mode: "normal",
        profile: "pro",
        expected: {
          model: "gpt-5.6-luna",
          reasoning: { effort: "low", context: "current_turn" },
          maxOutputTokens: 3600,
          timeoutMs: 10_000,
          verbosity: "low",
          costClass: "standard",
        },
      },
      {
        name: "Pro/Instant",
        mode: "pro",
        profile: "instant",
        expected: {
          model: "gpt-5.6-sol",
          reasoning: { effort: "none", context: "current_turn" },
          maxOutputTokens: 3600,
          timeoutMs: 10_000,
          verbosity: "medium",
          costClass: "standard",
        },
      },
      {
        name: "Pro/Max",
        mode: "pro",
        profile: "max",
        expected: {
          model: "gpt-5.6-sol",
          reasoning: { effort: "max", context: "current_turn" },
          maxOutputTokens: 14_000,
          timeoutMs: 28_000,
          verbosity: "medium",
          costClass: "advanced",
        },
      },
      {
        name: "Pro/Pro",
        mode: "pro",
        profile: "pro",
        expected: {
          model: "gpt-5.6-sol",
          reasoning: { effort: "max", mode: "pro", context: "current_turn" },
          maxOutputTokens: 14_000,
          timeoutMs: 28_000,
          verbosity: "medium",
          costClass: "pro",
        },
      },
    ];

    for (const { name, mode, profile, expected } of personaCases) {
      const callIndex = calls.length;
      const reply = await requestOpenAiArchiveReply({
        characterId: "ciel",
        mode,
        proProfile: profile,
        messages: [
          {
            role: "user",
            content:
              mode === "pro"
                ? `フィクションの戦闘中です。相手の攻撃へ対応して。persona payload ${name}`
                : `persona payload ${name}`,
          },
        ],
        safetyIdentifier: "persona-safety-id",
      });
      assert.equal(calls.length, callIndex + 1, `${name} should perform exactly one fetch`);
      const { input, init, body } = calls[callIndex];
      assert.equal(input, "https://api.openai.com/v1/responses", name);
      assert.equal(init.method, "POST", name);
      assert.equal(
        new Headers(init.headers).get("authorization"),
        "Bearer archive-payload-test-key",
      );
      assert.equal(body.model, expected.model, name);
      assert.deepEqual(body.reasoning, expected.reasoning, name);
      assert.equal(body.max_output_tokens, expected.maxOutputTokens, name);
      assert.equal(body.text.verbosity, expected.verbosity, name);
      assert.equal(body.safety_identifier, "persona-safety-id", name);
      assert.equal(body.store, false, name);
      assert.deepEqual(body.tools, [], name);
      const resolvedRoute = modelConfig.resolveArchivePersonaRoute(mode, profile);
      assert.equal(resolvedRoute.costClass, expected.costClass);
      assert.equal(resolvedRoute.timeoutMs, expected.timeoutMs, name);
      assert.equal(reply?.source, "openai", name);
      assert.equal(reply?.model, expected.model, name);
      assert.equal(reply?.providerModel, providerModelFor(expected.model), name);
      assert.equal(reply?.openaiRequestId, `req_payload_${callIndex + 1}`, name);
      assert.equal(reply?.modelVerified, true, name);
      assert.equal(reply?.reply.length, mode === "normal" ? 700 : 3_000, name);
      assert.equal(reply?.narration.length, mode === "normal" ? 220 : 700, name);
      assert.equal(reply?.suggestions[0]?.length, 90, name);
      if (mode === "normal") {
        assert.deepEqual(reply?.tactical, { range: "", tempo: "", threat: "", objective: "" });
      } else {
        assert.deepEqual(
          Object.fromEntries(
            Object.entries(reply?.tactical ?? {}).map(([key, value]) => [key, value.length]),
          ),
          { range: 80, tempo: 80, threat: 100, objective: 120 },
          name,
        );
      }
    }

    assert.equal(calls.length, 13, "the full Search and Persona model matrix should be exercised");
  } finally {
    globalThis.fetch = originalFetch;
    if (originalApiKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originalApiKey;
    if (originalXaiKey === undefined) delete process.env.XAI_API_KEY;
    else process.env.XAI_API_KEY = originalXaiKey;
    await vite.close();
  }
});
