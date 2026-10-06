import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

test("public verification rejects an old commit or changed delivered artwork", async () => {
  const expectedSha = 'a'.repeat(40);
  const image = Buffer.from('current artwork');
  const sha256 = createHash('sha256').update(image).digest('hex');
  const fetchFor = (sha, delivered) => async url => {
    const path = new URL(url).pathname;
    if (path === '/release-identity.json') return Response.json({ sha, assets: [{ path: '/gallery/g69-1536.webp', sha256 }] });
    if (path.startsWith('/gallery/')) return new Response(delivered);
    if (RETIRED_AI_ROUTES.includes(path)) return new Response('not found', { status: 404 });
    return new Response('Deception World');
  };
  assert.equal((await verifyPublicDeployment({ baseUrl: 'https://example.test', expectedSha, fetchImpl: fetchFor(expectedSha, image) })).ok, true);
  assert.equal((await verifyPublicDeployment({ baseUrl: 'https://example.test', expectedSha, fetchImpl: fetchFor('b'.repeat(40), image) })).ok, false);
  assert.equal((await verifyPublicDeployment({ baseUrl: 'https://example.test', expectedSha, fetchImpl: fetchFor(expectedSha, 'old artwork') })).ok, false);
});

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
