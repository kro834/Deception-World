import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { requestAllowed } from "./harness/browser-policy.mjs";

const script = resolve("scripts/harness/browser-probe.mjs");
const valid = ["--base-url", "http://127.0.0.1:1234", "--output", "/tmp/harness-invalid-test"];
function rejected(args) {
  const result = spawnSync(process.execPath, [script, ...args], {
    encoding: "utf8",
    timeout: 5000,
  });
  assert.equal(result.status, 2, `expected validation error: ${args.join(" ")}\n${result.stderr}`);
  assert.notEqual(result.stderr.trim(), "");
}

test("probe rejects malformed or incomplete CLI arguments before browser launch", () => {
  for (const args of [
    [],
    ["--base-url"],
    [...valid, "--unknown", "value"],
    [...valid, "--samples", "0"],
    [...valid, "--samples", "1.5"],
    [...valid, "--samples", "101"],
    [...valid, "--scene", "bogus"],
  ])
    rejected(args);
});

test("probe rejects unsupported engines and profiles before browser launch", () => {
  for (const args of [
    ["--engines", "firefox"],
    ["--engines", "chromium,firefox"],
    ["--profiles", "watch"],
    ["--profiles", "phone,watch"],
  ])
    rejected([...valid, ...args]);
});

test("probe refuses remote URLs, credentials, protocols and routes leaving the origin", () => {
  for (const url of [
    "https://example.com",
    "http://127.0.0.2:1234",
    "http://user:password@localhost",
    "file:///tmp/test",
    "not-a-url",
  ])
    rejected(["--base-url", url, "--output", "/tmp/harness-invalid-test"]);
  for (const url of ["https://example.com", "http://user@localhost"])
    rejected([...valid, "--baseline-url", url]);
  for (const route of ["//example.com/path", "/\\example.com/path", "https://example.com", "world"])
    rejected([...valid, "--routes", route]);
});

test("read-only policy blocks writes throughout the context and external navigation", () => {
  const base = "http://127.0.0.1:1234";
  for (const method of ["POST", "PUT", "PATCH", "DELETE", "OPTIONS"]) {
    assert.equal(requestAllowed(method, `${base}/api/gallery`, false, base), false);
    assert.equal(requestAllowed(method, "https://example.com/api", false, base), false);
  }
  assert.equal(requestAllowed("GET", "https://example.com/image.png", false, base), true);
  assert.equal(requestAllowed("HEAD", "https://example.com/image.png", false, base), true);
  assert.equal(requestAllowed("GET", `${base}/world`, true, base), true);
  assert.equal(requestAllowed("GET", "https://example.com/", true, base), false);
});
