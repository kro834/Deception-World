import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  attachArchiveAiIdentityCookie,
  resolveArchiveAiCookieIdentity,
} from "../src/lib/archive-ai-identity.server.ts";

const environment = {
  NODE_ENV: "development",
  ARCHIVE_RATE_LIMIT_SECRET: "cookie-identity-secret-with-at-least-32-bytes",
};

function cookiePair(setCookie) {
  return setCookie.split(";", 1)[0];
}

test("the server issues a hardened opaque rate identity cookie", () => {
  const identity = resolveArchiveAiCookieIdentity(
    new Request("https://archive.example/api/archive-search"),
    environment,
  );
  assert.match(identity.rateLimitHash, /^[0-9a-f]{64}$/u);
  assert.match(identity.setCookie, /^__Host-archive_ai_identity=v1\./u);
  for (const directive of ["Path=/", "Max-Age=31536000", "HttpOnly", "Secure", "SameSite=Lax"]) {
    assert.match(identity.setCookie, new RegExp(directive, "u"));
  }
});

test("a valid signed cookie is stable and a tampered cookie is replaced", () => {
  const first = resolveArchiveAiCookieIdentity(
    new Request("https://archive.example/api/archive-search"),
    environment,
  );
  const pair = cookiePair(first.setCookie);
  const valid = resolveArchiveAiCookieIdentity(
    new Request("https://archive.example/api/archive-search", { headers: { cookie: pair } }),
    environment,
  );
  assert.equal(valid.rateLimitHash, first.rateLimitHash);
  assert.equal(valid.setCookie, undefined);

  const finalCharacter = pair.at(-1);
  const tamperedPair = `${pair.slice(0, -1)}${finalCharacter === "A" ? "B" : "A"}`;
  const tampered = resolveArchiveAiCookieIdentity(
    new Request("https://archive.example/api/archive-search", {
      headers: {
        cookie: tamperedPair,
        "x-archive-session-id": crypto.randomUUID(),
        "x-forwarded-for": "203.0.113.44",
      },
    }),
    environment,
  );
  assert.notEqual(tampered.rateLimitHash, first.rateLimitHash);
  assert.ok(tampered.setCookie, "an invalid signature must rotate the cookie");
});

test("the shared response wrapper appends Set-Cookie without weakening AI headers", async () => {
  const identity = resolveArchiveAiCookieIdentity(
    new Request("https://archive.example/api/archive-search"),
    environment,
  );
  const response = attachArchiveAiIdentityCookie(
    Response.json({ state: "queued" }, { status: 202, headers: { "cache-control": "no-store" } }),
    identity,
  );
  assert.equal(response.status, 202);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.get("set-cookie"), identity.setCookie);
  assert.deepEqual(await response.json(), { state: "queued" });
});

test("all public AI routes use the common cookie identity and persist its hash", () => {
  const readSource = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
  const routes = [
    readSource("src/routes/api/archive-search.ts"),
    readSource("src/routes/api/archive-intelligence.ts"),
    readSource("src/routes/api/archive-ai/requests/$requestId.ts"),
  ];
  for (const route of routes) {
    assert.match(route, /resolveArchiveAiCookieIdentity\(request\)/u);
    assert.match(route, /attachArchiveAiIdentityCookie\(response, cookieIdentity\)/u);
  }
  const job = readSource("src/lib/archive-ai-job.server.ts");
  const ledger = readSource("src/lib/archive-ai-ledger.server.ts");
  assert.match(job, /processingContext:[\s\S]*?rateLimitHash/u);
  assert.match(job, /storedRateLimitHash/u);
  assert.match(ledger, /rateLimitHash \?\? sessionHash/u);
});
