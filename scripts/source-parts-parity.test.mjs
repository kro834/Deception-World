import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

test("source parts match authoritative files without modifying the checkout", () => {
  const result = spawnSync(
    process.execPath,
    [fileURLToPath(new URL("./sync-source-parts.mjs", import.meta.url)), "--check"],
    { encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr || result.stdout);
});
