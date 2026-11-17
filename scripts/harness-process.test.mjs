import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";
import { launch, waitForPreview } from "./harness/runtime.mjs";

const sha = "a".repeat(40);
const url = "http://127.0.0.1:8082";

test(
  "stop signals a grandchild holding the output pipe after its group leader exits",
  {
    skip: process.platform === "win32",
    timeout: 10_000,
  },
  async (t) => {
    const grandchildScript = `
    process.on("SIGTERM", () => {
      clearTimeout(fallback);
      process.stdout.write("grandchild stopped\\n");
    });
    const fallback = setTimeout(() => process.stdout.write("grandchild completed naturally\\n"), 5000);
    process.stdout.write("grandchild ready\\n");
  `;
    const leaderScript = `
    const { spawn } = require("node:child_process");
    spawn(process.execPath, ["-e", ${JSON.stringify(grandchildScript)}], { stdio: "inherit" }).unref();
  `;
    const handle = launch(process.execPath, ["-e", leaderScript], { timeoutMs: 0 });
    t.after(handle.stop);
    let output = "";
    const ready = new Promise((resolve) => {
      handle.child.stdout.on("data", (chunk) => {
        output += chunk;
        if (output.includes("grandchild ready")) resolve();
      });
    });
    await Promise.all([once(handle.child, "exit"), ready]);
    assert.equal(handle.child.exitCode, 0);
    handle.stop();
    await handle.done;
    assert.match(output, /grandchild stopped/);
    assert.doesNotMatch(output, /completed naturally/);
  },
);

test("preview readiness returns the validated identity and rejects a different SHA", async (t) => {
  const identity = { sha, artworks: 113 };
  const fetch = t.mock.method(globalThis, "fetch", async () => {
    return new Response(JSON.stringify(identity));
  });
  assert.deepEqual(await waitForPreview(url, undefined, 1000, sha), identity);
  await assert.rejects(
    waitForPreview(url, undefined, 1000, "b".repeat(40)),
    /Preview SHA mismatch/,
  );
  assert.deepEqual(
    fetch.mock.calls.map(({ arguments: [request] }) => request.href),
    [`${url}/release-identity.json`, `${url}/release-identity.json`],
  );
});

test("a successful HTTP status with missing SHA cannot satisfy preview readiness", async (t) => {
  t.mock.method(globalThis, "fetch", async () => new Response('{"artworks":113}'));
  await assert.rejects(waitForPreview(url, undefined, 1000), /does not contain a full commit SHA/);
});

test("preview readiness requests use fetch's redirect error mode", async (t) => {
  const fetch = t.mock.method(globalThis, "fetch", async () => {
    throw new TypeError("redirect rejected");
  });
  await assert.rejects(waitForPreview(url, undefined, 50, sha), /readiness timed out/);
  assert.ok(fetch.mock.callCount() > 0);
  for (const {
    arguments: [, options],
  } of fetch.mock.calls) {
    assert.equal(options.redirect, "error");
  }
});

test(
  "preview readiness times out while a response body is still streaming",
  { timeout: 3000 },
  async (t) => {
    t.mock.method(globalThis, "fetch", async (_request, { signal }) => ({
      ok: true,
      json: () =>
        new Promise((resolve, reject) => {
          const fallback = setTimeout(() => resolve({ sha }), 2000);
          signal.addEventListener(
            "abort",
            () => {
              clearTimeout(fallback);
              reject(signal.reason);
            },
            { once: true },
          );
        }),
    }));
    await assert.rejects(waitForPreview(url, undefined, 200, sha), /readiness timed out/);
  },
);
