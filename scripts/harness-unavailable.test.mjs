import assert from "node:assert/strict";
import test from "node:test";
import { cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { git } from "./harness/runtime.mjs";

test("missing selected verifier is visible in plan and fails run and compare before execution", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "dw-harness-unavailable-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, "scripts"));
  await cp("scripts/harness.mjs", join(root, "scripts/harness.mjs"));
  await cp("scripts/harness", join(root, "scripts/harness"), { recursive: true });
  await symlink(resolve("node_modules"), join(root, "node_modules"), "dir");
  await writeFile(join(root, ".gitignore"), "node_modules\nartifacts\n");
  git(root, ["init", "-q"]);
  git(root, ["config", "user.name", "Harness test"]);
  git(root, ["config", "user.email", "harness@example.invalid"]);
  git(root, ["add", "."]);
  git(root, ["commit", "-qm", "fixture"]);
  for (const mode of ["plan", "run", "compare"]) {
    const output = join(root, "artifacts", mode);
    const child = spawnSync(
      process.execPath,
      [
        "scripts/harness.mjs",
        mode,
        "--base-ref",
        "HEAD",
        "--files",
        "src/components/gallery/gallery-page.tsx",
        "--output",
        output,
      ],
      { cwd: root, encoding: "utf8", timeout: 10000 },
    );
    assert.equal(child.status, mode === "plan" ? 0 : 1, child.stderr);
    const report =
      mode === "plan"
        ? JSON.parse(child.stdout)
        : JSON.parse(await readFile(join(output, "report.json"), "utf8"));
    assert.deepEqual(
      report.unavailableChecks.map((check) => check.id),
      ["verify-gallery-controls-focus"],
    );
    if (mode !== "plan") {
      assert.equal(report.status, "failed");
      assert.equal(report.coverage.browser, "blocked");
      assert.ok(report.checks.every((check) => check.status === "blocked"));
    }
  }
});
