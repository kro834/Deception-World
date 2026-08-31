import assert from "node:assert/strict";
import test from "node:test";

import {
  PUBLIC_SMOKE_ROUTES,
  RETIRED_AI_ROUTES,
  verifyPublicDeployment,
} from "./verify-public-deployment.mjs";

test("public smoke routes pass while all retired AI routes remain 404", async () => {
  const seen = [];
  const report = await verifyPublicDeployment({
    baseUrl: "https://example.test",
    bypassToken: "preview-token",
    fetchImpl: async (input, init) => {
      const path = new URL(input).pathname;
      seen.push({ path, headers: init.headers });
      return RETIRED_AI_ROUTES.includes(path)
        ? new Response("Not Found", { status: 404 })
        : new Response("<title>Deception World</title>", { status: 200 });
    },
  });
  assert.equal(report.ok, true);
  assert.equal(seen.length, PUBLIC_SMOKE_ROUTES.length + RETIRED_AI_ROUTES.length);
  assert.ok(seen.every(({ headers }) => headers["x-vercel-protection-bypass"] === "preview-token"));
});

test("a resurrected AI endpoint fails the release gate", async () => {
  const report = await verifyPublicDeployment({
    baseUrl: "https://example.test",
    fetchImpl: async (input) => {
      const path = new URL(input).pathname;
      if (path === "/intelligence") return new Response("AIに聞く", { status: 200 });
      return RETIRED_AI_ROUTES.includes(path)
        ? new Response("Not Found", { status: 404 })
        : new Response("Deception World", { status: 200 });
    },
  });
  assert.equal(report.ok, false);
  assert.equal(report.results.find(({ path }) => path === "/intelligence")?.ok, false);
});
