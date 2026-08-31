import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  DESTRUCTIVE_MIGRATIONS,
  destructiveMigrationsEnabled,
  shouldApplyMigration,
} from "./migrate.mjs";

const workflow = readFileSync(
  new URL("../.github/workflows/deploy-main.yml", import.meta.url),
  "utf8",
);

test("destructive migrations require an exact explicit opt-in", () => {
  assert.equal(DESTRUCTIVE_MIGRATIONS.has("0004_retire_archive_ai.sql"), true);
  assert.equal(destructiveMigrationsEnabled(undefined), false);
  assert.equal(destructiveMigrationsEnabled(""), false);
  assert.equal(destructiveMigrationsEnabled("0"), false);
  assert.equal(destructiveMigrationsEnabled(" 1 "), true);
  assert.throws(
    () => destructiveMigrationsEnabled("true"),
    /must be exactly 0 or 1/,
  );

  assert.equal(shouldApplyMigration("0001_auth.sql", false), true);
  assert.equal(shouldApplyMigration("0004_retire_archive_ai.sql", false), false);
  assert.equal(shouldApplyMigration("0004_retire_archive_ai.sql", true), true);
});

test("main deploy verifies the AI-free release before starting destructive cleanup", () => {
  const candidate = workflow.indexOf("Create staged Production candidate");
  const promote = workflow.indexOf("Promote verified candidate");
  const initialProbe = workflow.indexOf("Verify Production before destructive cleanup");
  const cleanup = workflow.indexOf(
    "Apply destructive cleanup from the verified main SHA",
  );
  const finalProbe = workflow.indexOf("Verify Production after destructive cleanup");
  const rollback = workflow.indexOf("Roll back only before destructive cleanup starts");

  for (const [label, index] of [
    ["candidate", candidate],
    ["promotion", promote],
    ["initial Production probe", initialProbe],
    ["destructive cleanup", cleanup],
    ["post-cleanup probe", finalProbe],
    ["rollback", rollback],
  ]) {
    assert.notEqual(index, -1, `${label} step must exist`);
  }
  assert.ok(candidate < promote && promote < initialProbe && initialProbe < cleanup);
  assert.ok(cleanup < finalProbe && finalProbe < rollback);

  const candidateBlock = workflow.slice(candidate, promote);
  assert.match(candidateBlock, /--build-env "APPLY_DESTRUCTIVE_MIGRATIONS=0"/);

  const cleanupBlock = workflow.slice(cleanup, finalProbe);
  assert.ok(
    cleanupBlock.indexOf('echo "started=true"') < cleanupBlock.indexOf("vercel deploy"),
    "the no-rollback fence must be persisted before cleanup can touch the database",
  );
  assert.match(cleanupBlock, /vercel deploy --prod --skip-domain --force/);
  assert.match(cleanupBlock, /--build-env "APPLY_DESTRUCTIVE_MIGRATIONS=1"/);
  assert.match(cleanupBlock, /assertVercelCandidateRollbackMetadata/);

  const rollbackBlock = workflow.slice(rollback);
  assert.match(
    rollbackBlock,
    /steps\.destructive_cleanup\.outputs\.started != 'true'/,
  );
});
