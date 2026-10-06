import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

test("standalone archives stay out of the public deploy payload", () => {
  assert.equal(existsSync(resolve(root, "public/saga-form-archive-standalone.html")), false);
  assert.equal(existsSync(resolve(root, "public/realm-form-archive-standalone.html")), false);
  assert.equal(existsSync(resolve(root, "archives/saga-form-archive-standalone.html")), true);
  assert.equal(existsSync(resolve(root, "archives/realm-form-archive-standalone.html")), true);
  const excluded = readFileSync(resolve(root, '.vercelignore'), 'utf8').split(/\r?\n/u).map(line => line.trim());
  assert.equal(excluded.includes('archives'), false, 'remote release gates require archive sources');
  assert.equal(excluded.includes('source-parts'), false, 'remote release gates require split sources');
});
