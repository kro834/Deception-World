import assert from "node:assert/strict";
import test from "node:test";
import { cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { git } from "./harness/runtime.mjs";

// Exercise the real CLI/report/exit path with recorded observations. No browser,
// network, builds or source mutations are needed to test the publication gate.
test("compare fails closed on condition problems and preserves evidence and explicit partial modes", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "dw-harness-comparison-gate-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, "scripts"));
  await cp("scripts/harness.mjs", join(root, "scripts/harness.mjs"));
  await cp("scripts/harness", join(root, "scripts/harness"), { recursive: true });
  await symlink(resolve("node_modules"), join(root, "node_modules"), "dir");
  await writeFile(join(root, ".gitignore"), "node_modules\nartifacts\n");
  const runtimePath = join(root, "scripts/harness/runtime.mjs");
  const runtime = (await readFile(runtimePath, "utf8")).replace(
    "export async function waitForPreview(",
    "async function unusedWaitForPreview(",
  );
  await writeFile(
    runtimePath,
    `${runtime}\nexport async function waitForPreview(url, handle, timeout, expectedSha) { return { sha: expectedSha ?? "a".repeat(40) }; }\n`,
  );
  await writeFile(
    join(root, "scripts/harness/browser-probe.mjs"),
    `
    import { mkdir, writeFile } from "node:fs/promises";
    import { join } from "node:path";
    import sharp from "sharp";
    const args = Object.fromEntries(Array.from({ length: (process.argv.length - 2) / 2 }, (_, i) => [process.argv[2 + i * 2], process.argv[3 + i * 2]]));
    const output = args["--output"];
    const scenario = args["--routes"];
    await mkdir(output, { recursive: true });
    const conditions = { worldEffects: null, savedRenderQuality: null, storageReadable: true, historyReadable: true, devicePixelRatio: 1, reducedMotion: false };
    const sides = args["--baseline-url"] ? ["baseline", "candidate"] : ["candidate"];
    const runs = [];
    for (const side of sides) {
      const observed = { ...conditions };
      if (side === "candidate" && scenario === "/different") observed.worldEffects = "economy";
      const after = { ...observed };
      if (side === "candidate" && scenario === "/changed") after.devicePixelRatio = 2;
      const screenshot = side + ".png";
      await sharp({ create: { width: 1, height: 1, channels: 4, background: "#000" } }).png().toFile(join(output, screenshot));
      runs.push({ engine: "webkit", profile: "phone", route: scenario, sample: 1, side, status: "passed", conditions: scenario === "/missing" ? undefined : observed, conditionsAfter: after, screenshot, metrics: { frame: { p95Ms: 20 }, longTasks: { supported: false, entries: [] } } });
    }
    await writeFile(join(output, "probe.json"), JSON.stringify({ status: "passed", runs }));
  `,
  );
  git(root, ["init", "-q"]);
  git(root, ["config", "user.name", "Harness test"]);
  git(root, ["config", "user.email", "harness@example.invalid"]);
  git(root, ["add", "."]);
  git(root, ["commit", "-qm", "fixture"]);
  const scenarios = [
    { route: "/different", status: "failed", reason: /conditions differ/ },
    { route: "/missing", status: "failed", reason: /conditions are missing/ },
    { route: "/changed", status: "failed", reason: /conditions changed/ },
    { route: "/matching", status: "passed" },
    { route: "/different", flags: ["--reuse-build"], status: "partial" },
    { route: "/different", flags: ["--no-browser"], status: "partial" },
    { route: "/matching", mode: "run", flags: ["--probe"], status: "passed" },
  ];
  for (const [index, scenario] of scenarios.entries()) {
    const mode = scenario.mode ?? "compare";
    const output = join(root, "artifacts", String(index));
    const args = [
      "scripts/harness.mjs",
      mode,
      "--base-ref",
      "HEAD",
      "--files",
      "docs/example.md",
      "--base-url",
      "http://127.0.0.1:12345",
      "--routes",
      scenario.route,
      "--output",
      output,
      ...(scenario.flags ?? []),
    ];
    if (mode === "compare") args.push("--baseline-url", "http://127.0.0.1:12346");
    const child = spawnSync(process.execPath, args, {
      cwd: root,
      encoding: "utf8",
      timeout: 10000,
    });
    assert.equal(
      child.status,
      scenario.status === "failed" ? 1 : 0,
      `${JSON.stringify(scenario)}\n${child.stderr}`,
    );
    const report = JSON.parse(await readFile(join(output, "report.json"), "utf8"));
    assert.equal(report.status, scenario.status);
    const html = await readFile(join(output, "report.html"), "utf8");
    if (scenario.reason) {
      assert.match(report.errors.join("\n"), scenario.reason);
      assert.match(html, scenario.reason);
      assert.match(report.coverage.comparison, /^not-comparable/);
      assert.ok((await readFile(join(output, "probe/candidate.png"))).length > 0);
      assert.ok((await readFile(join(output, "probe/probe.json"))).length > 0);
    }
    if (scenario.status === "passed" && mode === "compare") {
      assert.equal(report.coverage.comparison, "passed");
      assert.equal(
        report.comparisons.find((row) => row.metric === "longTaskTotal").assessment,
        "not-comparable",
      );
    }
  }
});
