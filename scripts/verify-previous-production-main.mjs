import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const receipt = JSON.parse(readFileSync(new URL("./release-adoptions/7c89d657.json", import.meta.url), "utf8"));
const digest = (value) => createHash("sha1").update(value).digest("hex");

export function deploymentSourceFiles(tree) {
  const source = Array.isArray(tree) && tree.find((node) => node.name === "src");
  if (!source || source.type !== "directory" || tree.filter((node) => node.name === "src").length !== 1) {
    throw new Error("Adoption source tree has an unexpected deployment root");
  }
  const files = [];
  function walk(nodes, prefix = "") {
    for (const node of nodes) {
      if (typeof node.name !== "string" || !node.name || /[\\/]/u.test(node.name) || [".", ".."].includes(node.name)) {
        throw new Error("Adoption source tree contains an unsafe path");
      }
      const path = prefix + node.name;
      if (node.type === "directory") walk(node.children, `${path}/`);
      else if (node.type === "file" && /^[a-f0-9]{40}$/u.test(node.uid)) files.push({ path, sha1: node.uid });
      else throw new Error("Adoption source tree contains an invalid file");
    }
  }
  // Vercel also returns generated `out` lambdas; only `src` is the uploaded source.
  walk(source.children);
  return files.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
}

/** Exact recovery of this reviewed external deployment; no generic ancestry bypass. */
export function assertReviewedProductionAdoption({ snapshot, projectId, sourceFiles, readCandidateFile, adoption = receipt }) {
  if (projectId !== adoption.projectId || ["id", "url", "sha"].some((key) => snapshot[key] !== adoption.deployment[key])) {
    throw new Error("Previous Production is not the reviewed external deployment");
  }
  if (JSON.stringify(sourceFiles) !== JSON.stringify(adoption.sourceFiles)) {
    throw new Error("Previous Production source manifest differs from the reviewed snapshot");
  }
  const retained = new Map(adoption.retainedMain.map((file) => [file.path, file.sha1]));
  for (const file of sourceFiles) {
    const expected = retained.get(file.path) ?? file.sha1;
    if (digest(readCandidateFile(file.path)) !== expected) {
      throw new Error(`Candidate does not preserve reviewed source: ${file.path}`);
    }
  }
}

async function main() {
  const [id, url, sha, candidateSha] = process.argv.slice(2);
  if (![sha, candidateSha].every((value) => /^[a-f0-9]{40}$/u.test(value ?? ""))) throw new Error("Expected full Git SHAs");
  // Keep the ordinary requirement for every existing or future Git-backed release.
  const exists = spawnSync("git", ["cat-file", "-e", `${sha}^{commit}`], { cwd: root });
  if (exists.status === 0) {
    const ancestor = spawnSync("git", ["merge-base", "--is-ancestor", sha, candidateSha], { cwd: root });
    if (ancestor.status === 0) return;
    throw new Error("Previous Production Git commit is not an ancestor of main");
  }
  const endpoint = new URL(`/v6/deployments/${encodeURIComponent(id)}/files`, "https://api.vercel.com");
  if (process.env.VERCEL_ORG_ID) endpoint.searchParams.set("teamId", process.env.VERCEL_ORG_ID);
  // Reject identity mismatches before making an authenticated source request.
  if (id !== receipt.deployment.id || url !== receipt.deployment.url || sha !== receipt.deployment.sha || process.env.VERCEL_PROJECT_ID !== receipt.projectId) {
    throw new Error("Unknown previous Production commit has no reviewed adoption");
  }
  if (!process.env.VERCEL_TOKEN) throw new Error("Vercel authentication is required for reviewed adoption");
  const response = await fetch(endpoint, { headers: { authorization: `Bearer ${process.env.VERCEL_TOKEN}` } });
  if (!response.ok) throw new Error(`Adoption source lookup failed with HTTP ${response.status}`);
  assertReviewedProductionAdoption({
    snapshot: { id, url, sha }, projectId: process.env.VERCEL_PROJECT_ID,
    sourceFiles: deploymentSourceFiles(await response.json()),
    readCandidateFile: (path) => readFileSync(resolve(root, path)),
  });
  console.log(`Verified reviewed external Production adoption: ${id}; ${receipt.sourceFiles.length} source files preserved`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
