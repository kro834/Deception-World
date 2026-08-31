import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const fromRoot = (path) => new URL(`../${path}`, import.meta.url);
const read = (path) => readFileSync(fromRoot(path), "utf8");

test("the retired AI chat cannot be rebuilt from public application sources", () => {
  for (const path of [
    "src/routes/intelligence.tsx",
    "src/routes/api/archive-search.ts",
    "src/routes/api/archive-intelligence.ts",
    "src/components/world/archive-intelligence-page.tsx",
    "src/components/world/archive-oracle.tsx",
    "src/components/world/archive-roleplay.tsx",
    "src/lib/archive-ai-credentials.server.ts",
    "src/lib/archive-openai-transport.server.ts",
    "src/lib/archive-request-body.server.ts",
    "src/lib/archive-user-memory.ts",
    "src/lib/archive-viewport.ts",
    "scripts/archive-user-memory.test.mjs",
    "scripts/archive-viewport.test.mjs",
  ]) {
    assert.equal(existsSync(fromRoot(path)), false, `${path} must remain removed`);
  }

  const packageJson = JSON.parse(read("package.json"));
  assert.equal("@heyputer/puter.js" in packageJson.dependencies, false);
  assert.equal("verify:archive-ai" in packageJson.scripts, false);
});

test("the retirement release clears browser and database chat data", () => {
  const root = read("src/routes/__root.tsx");
  const cleanup = read("src/components/legacy-data-retirement.tsx");
  const migration = read("migrations/0004_retire_archive_ai.sql");

  assert.match(root, /<LegacyDataRetirement \/>/);
  for (const key of [
    "archive-ai-pending-v1",
    "archive-ai-session-v1",
    "deception-world:archive-ai-health:v1",
    "deception-world:archive-models:v2",
  ]) {
    assert.match(cleanup, new RegExp(key.replaceAll(":", "\\:")));
  }
  assert.match(cleanup, /deleteDatabase\("deception-world-ai"\)/);
  for (const table of [
    "archive_ai_rate_charges",
    "archive_ai_requests",
    "archive_ai_circuit_breakers",
    "archive_ai_rate_limits",
  ]) {
    assert.match(migration, new RegExp(`DROP TABLE IF EXISTS ${table}`));
  }
});
