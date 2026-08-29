import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));

const SEARCH_EFFORTS = ["low", "medium", "high", "xhigh"];

function mockOutputFor(body) {
  if (body.text?.format?.name === "deception_world_search_reply") {
    return {
      reply: "検索結果です。",
      suggestions: ["続きを探す"],
      focusCandidateId: "",
      referenceCandidateIds: [],
    };
  }
  return {
    reply: "応答です。",
    narration: "",
    tactical: { range: "", tempo: "", threat: "", objective: "" },
    suggestions: ["続きを話す"],
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
  const calls = [];

  try {
    const [{ requestOpenAiArchiveSearch }, { requestOpenAiArchiveReply }, modelConfig] =
      await Promise.all([
        vite.ssrLoadModule("/src/lib/archive-search.server.ts"),
        vite.ssrLoadModule("/src/lib/archive-intelligence.server.ts"),
        vite.ssrLoadModule("/src/lib/archive-model-config.ts"),
      ]);

    process.env.OPENAI_API_KEY = "archive-payload-test-key";
    globalThis.fetch = async (input, init = {}) => {
      const body = JSON.parse(String(init.body));
      calls.push({ input: String(input), init, body });
      return Response.json({ output_text: JSON.stringify(mockOutputFor(body)) });
    };

    const searchCases = [
      ...["gpt-5.5", "gpt-5.6-terra"].flatMap((model) =>
        SEARCH_EFFORTS.map((effort) => ({
          name: `${model}/${effort}`,
          preference: { model, effort, execution: "standard" },
          expected: {
            model,
            reasoning: { effort, context: "current_turn" },
            maxOutputTokens: 3600,
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
          maxOutputTokens: 10_000,
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
      assert.equal(body.model, expected.model, name);
      assert.deepEqual(body.reasoning, expected.reasoning, name);
      assert.equal(body.max_output_tokens, expected.maxOutputTokens, name);
      assert.equal(body.text.verbosity, expected.verbosity, name);
      assert.equal(body.safety_identifier, "search-safety-id", name);
      assert.equal(body.store, false, name);
      assert.deepEqual(body.tools, [], name);
      assert.equal(modelConfig.resolveArchiveSearchRoute(preference).costClass, expected.costClass);
      assert.equal(reply?.source, "openai", name);
      assert.equal(reply?.model, expected.model, name);
    }

    const personaCases = [
      {
        name: "Normal/Luna",
        mode: "normal",
        profile: "pro",
        expected: {
          model: "gpt-5.6-luna",
          reasoning: { effort: "low", context: "current_turn" },
          maxOutputTokens: 2400,
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
          maxOutputTokens: 12_000,
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
          maxOutputTokens: 12_000,
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
        messages: [{ role: "user", content: `persona payload ${name}` }],
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
      assert.equal(modelConfig.archivePersonaCostClass(mode, profile), expected.costClass);
      assert.equal(reply?.source, "openai", name);
      assert.equal(reply?.model, expected.model, name);
    }

    assert.equal(calls.length, 13, "the full Search and Persona model matrix should be exercised");
  } finally {
    globalThis.fetch = originalFetch;
    if (originalApiKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originalApiKey;
    await vite.close();
  }
});
