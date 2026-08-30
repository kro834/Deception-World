import assert from "node:assert/strict";
import test from "node:test";

import { isAllowedArchiveBrowserRequest } from "../src/lib/archive-api-origin.server.ts";

function request({
  url = "https://internal-project.vercel.app/api/archive-search",
  origin = "https://sand-zenith-meadow-dune.grok.me",
  client = "search-v1",
  site = "same-origin",
  forwardedHost = "sand-zenith-meadow-dune.grok.me",
  forwardedProto = "https",
} = {}) {
  return new Request(url, {
    method: "POST",
    headers: {
      origin,
      "x-archive-client": client,
      "sec-fetch-site": site,
      "x-forwarded-host": forwardedHost,
      "x-forwarded-proto": forwardedProto,
    },
  });
}

test("archive API accepts its public origin behind a trusted reverse proxy", () => {
  assert.equal(isAllowedArchiveBrowserRequest(request(), "search-v1"), true);
  assert.equal(
    isAllowedArchiveBrowserRequest(
      request({ client: "persona-v1", url: "https://internal/api/archive-intelligence" }),
      "persona-v1",
    ),
    true,
  );
});

test("archive API trusts browser same-origin metadata when the proxy hides the public host", () => {
  assert.equal(
    isAllowedArchiveBrowserRequest(
      request({ forwardedHost: "internal-project.vercel.app" }),
      "search-v1",
    ),
    true,
  );
});

test("archive API accepts a direct same-origin deployment", () => {
  assert.equal(
    isAllowedArchiveBrowserRequest(
      request({
        url: "https://archive.example/api/archive-search",
        origin: "https://archive.example",
        forwardedHost: "archive.example",
      }),
      "search-v1",
    ),
    true,
  );
});

test("archive API rejects sibling, cross-site, wrong-client, and malformed origins", () => {
  assert.equal(
    isAllowedArchiveBrowserRequest(
      request({ origin: "https://sibling.grok.me", site: "same-site" }),
      "search-v1",
    ),
    false,
  );
  assert.equal(isAllowedArchiveBrowserRequest(request({ site: "same-site" }), "search-v1"), false);
  assert.equal(
    isAllowedArchiveBrowserRequest(request({ client: "persona-v1" }), "search-v1"),
    false,
  );
  assert.equal(
    isAllowedArchiveBrowserRequest(request({ origin: "not a url" }), "search-v1"),
    false,
  );
  assert.equal(
    isAllowedArchiveBrowserRequest(
      request({ forwardedHost: "archive.example/path", site: "" }),
      "search-v1",
    ),
    false,
  );
});
