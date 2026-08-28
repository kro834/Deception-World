import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

test("standalone archives stay out of the public deploy payload", () => {
  assert.equal(existsSync(resolve(root, "public/saga-form-archive-standalone.html")), false);
  assert.equal(existsSync(resolve(root, "public/realm-form-archive-standalone.html")), false);
  assert.equal(existsSync(resolve(root, "archives/saga-form-archive-standalone.html")), true);
  assert.equal(existsSync(resolve(root, "archives/realm-form-archive-standalone.html")), true);
});
