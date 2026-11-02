import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { assertReviewedProductionAdoption, deploymentSourceFiles } from "./verify-previous-production-main.mjs";

const sha1 = (value) => createHash("sha1").update(value).digest("hex");
const adoption = {
  deployment: { id: "dpl_reviewed", url: "https://reviewed.vercel.app", sha: "a".repeat(40) },
  projectId: "prj_reviewed",
  sourceFiles: [{ path: "art.txt", sha1: sha1("public art") }, { path: "map.txt", sha1: sha1("old map") }],
  retainedMain: [{ path: "map.txt", sha1: sha1("new map") }],
};
const options = {
  adoption, snapshot: adoption.deployment, projectId: adoption.projectId,
  sourceFiles: adoption.sourceFiles,
  readCandidateFile: (path) => path === "art.txt" ? "public art" : "new map",
};

test("reviewed adoption preserves public art together with pinned newer main changes", () => {
  assert.doesNotThrow(() => assertReviewedProductionAdoption(options));
});

test("adoption rejects another deployment, commit, project, or immutable URL", () => {
  for (const key of ["id", "url", "sha"]) {
    assert.throws(() => assertReviewedProductionAdoption({ ...options, snapshot: { ...options.snapshot, [key]: "other" } }), /not the reviewed/);
  }
  assert.throws(() => assertReviewedProductionAdoption({ ...options, projectId: "other" }), /not the reviewed/);
});

test("adoption rejects changed source metadata or lost content on either side of integration", () => {
  assert.throws(() => assertReviewedProductionAdoption({ ...options, sourceFiles: options.sourceFiles.slice(1) }), /manifest differs/);
  for (const path of ["art.txt", "map.txt"]) {
    assert.throws(() => assertReviewedProductionAdoption({ ...options, readCandidateFile: (name) => name === path ? "unreviewed" : options.readCandidateFile(name) }), /does not preserve/);
  }
});

test("source manifests reject traversal and omit generated lambdas", () => {
  const tree = [{ name: "src", type: "directory", children: [{ name: "art.txt", type: "file", uid: sha1("public art") }] }, { name: "out", type: "directory", children: [{ type: "lambda" }] }];
  assert.deepEqual(deploymentSourceFiles(tree), adoption.sourceFiles.slice(0, 1));
  tree[0].children[0].name = "../art.txt";
  assert.throws(() => deploymentSourceFiles(tree), /unsafe path/);
});

test("workflow retains ordinary lineage checks and attested rollback around the exact adoption", () => {
  const source = readFileSync(new URL("./verify-previous-production-main.mjs", import.meta.url), "utf8");
  assert.match(source, /"cat-file", "-e"/);
  assert.match(source, /"merge-base", "--is-ancestor"/);
  const workflow = readFileSync(new URL("../.github/workflows/deploy-main.yml", import.meta.url), "utf8");
  assert.match(workflow, /git cat-file -e/);
  assert.match(workflow, /git merge-base --is-ancestor/);
  assert.match(workflow, /assertVercelCandidateRollbackMetadata/);
  assert.match(workflow, /assertVercelProductionSnapshot/);
});
