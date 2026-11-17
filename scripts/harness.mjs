#!/usr/bin/env node
import { mkdir, readFile, mkdtemp, symlink, rm, readdir, cp, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { planChecks } from "./harness/selection.mjs";
import {
  localUrl,
  git,
  revision,
  changedFiles,
  acquireLock,
  launch,
  freePort,
  waitForPreview,
} from "./harness/runtime.mjs";
import { compareMetrics, writeReport } from "./harness/report.mjs";
import { compareScreenshots } from "./harness/visual-comparison.mjs";
import {
  assessProbeConditions,
  assertRequiredComparison,
} from "./harness/comparison-conditions.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
export function parseArgs(args) {
  const flags = new Set(["full", "probe", "memory", "no-browser", "reuse-build", "help"]);
  const values = new Set([
    "base-ref",
    "baseline-ref",
    "base-url",
    "baseline-url",
    "files",
    "output",
    "profiles",
    "engines",
    "samples",
    "routes",
    "scene",
  ]);
  const options = {
    mode: "run",
    "base-ref": "origin/main",
    profiles: "phone,desktop",
    engines: "chromium,webkit",
    samples: "3",
    scene: "hero",
  };
  if (args[0] && !args[0].startsWith("--")) options.mode = args.shift();
  if (!["plan", "run", "compare"].includes(options.mode))
    throw new Error("Expected plan, run or compare");
  for (let i = 0; i < args.length; i++) {
    const key = args[i].replace(/^--/, "");
    if (args[i] !== `--${key}` || (!flags.has(key) && !values.has(key)))
      throw new Error(`Unknown option ${args[i]}`);
    if (flags.has(key)) options[key] = true;
    else {
      if (!args[i + 1] || args[i + 1].startsWith("--"))
        throw new Error(`Missing value for --${key}`);
      options[key] = args[++i];
    }
  }
  if (options["base-url"]) options["base-url"] = localUrl(options["base-url"]);
  if (options["baseline-url"]) options["baseline-url"] = localUrl(options["baseline-url"]);
  if (options["baseline-url"] && options["baseline-ref"])
    throw new Error("Choose --baseline-url or --baseline-ref");
  if (
    !Number.isInteger(Number(options.samples)) ||
    Number(options.samples) < 1 ||
    Number(options.samples) > 10
  )
    throw new Error("--samples must be 1..10");
  if (!["hero", "transformation"].includes(options.scene)) throw new Error("Unknown --scene");
  if (options.engines.split(",").some((engine) => !["chromium", "webkit"].includes(engine)))
    throw new Error("Unknown --engines");
  const profiles = [
    "phone",
    "desktop",
    "320",
    "phone-landscape",
    "ipad-portrait",
    "ipad-landscape",
    "phone-reduced-motion",
    "desktop-reduced-motion",
  ];
  if (options.profiles.split(",").some((profile) => !profiles.includes(profile)))
    throw new Error("Unknown --profiles");
  return options;
}
const usage = `Deception World development harness
  npm run harness -- plan [--base-ref origin/main] [--files src/example.ts]
  npm run harness -- run [--full] [--probe] [--memory]
  npm run harness -- compare [--baseline-ref origin/main] [--routes /rexonance-saga] [--scene transformation]
Local production previews are built and started automatically. Compare builds an isolated baseline.
--base-url / --baseline-url accept loopback origins only. --reuse-build explicitly reuses a build.
--profiles phone,desktop --engines chromium,webkit --samples 3 --output artifacts/harness/RUN
--no-browser records partial coverage; it is never a full verification result.
No database migration, publication, model API call, or shared-gallery write is performed.
`;

export async function main(args = process.argv.slice(2)) {
  const options = parseArgs([...args]);
  if (options.help) {
    console.log(usage);
    return 0;
  }
  const change = changedFiles(root, options["base-ref"]);
  const files = options.files ? options.files.split(",").filter(Boolean) : change.files;
  const plan = planChecks({ files, root, full: options.full });
  const currentSha = revision(root, "HEAD");
  const browserChecks = plan.checks.filter((check) => check.kind === "browser");
  const wantsMemory = Boolean(options.memory || plan.areas.includes("rexonance"));
  if (wantsMemory && !browserChecks.some((c) => c.id === "rexonance-heap"))
    browserChecks.push({
      id: "rexonance-heap",
      kind: "browser",
      command: process.execPath,
      args: ["scripts/verify-rexonance-heap.mjs"],
      env: {},
      timeoutMs: 600000,
      reason: options.memory
        ? "Explicit two-warm-up + five-measured-SPA-return forced-GC regression"
        : "Rexonance changed: two-warm-up + five-measured-SPA-return forced-GC regression",
      reportEnv: "HEAP_REPORT",
    });
  const shouldProbe = Boolean(options.probe || options.mode === "compare");
  const needBrowser = browserChecks.length > 0 || shouldProbe;
  if (options.mode === "plan") {
    console.log(
      JSON.stringify(
        {
          ...plan,
          checks: [...plan.checks.filter((c) => c.kind !== "browser"), ...browserChecks],
          files,
          baseSha: change.baseSha,
          revision: currentSha,
          browserProbe: shouldProbe,
        },
        null,
        2,
      ),
    );
    return 0;
  }
  const output = resolve(
    options.output ??
      join(root, "artifacts/harness", new Date().toISOString().replace(/[:.]/g, "-")),
  );
  if (existsSync(output) && (await readdir(output)).length)
    throw new Error(
      `Output directory is not empty: ${output}; choose a fresh directory to preserve evidence.`,
    );
  const releaseLock = acquireLock(root);
  const handles = new Set();
  const ownedTrees = [];
  let candidateRoot;
  let interrupted = false;
  const interrupt = () => {
    interrupted = true;
    for (const handle of handles) handle.stop();
  };
  process.on("SIGINT", interrupt);
  process.on("SIGTERM", interrupt);
  const report = {
    version: 1,
    status: "running",
    startedAt: new Date().toISOString(),
    mode: options.mode,
    revision: currentSha,
    baseSha: change.baseSha,
    files,
    areas: plan.areas,
    unknownFiles: plan.unknownFiles,
    unavailableChecks: plan.unavailableChecks,
    warnings: [...plan.warnings],
    errors: [],
    checks: [],
    coverage: {
      static: "pending",
      browser: options["no-browser"] ? "skipped" : needBrowser ? "pending" : "not-selected",
      comparison: shouldProbe ? "pending" : "not-selected",
      physicalDevices: "unverified",
      gpuResourceRelease: "unverified",
      renderQualityEquivalence: "unverified",
      memory: wantsMemory ? "pending" : "not-selected",
    },
    options,
  };
  let sequence = 0;
  async function execute(check, cwd = root, env = {}) {
    if (interrupted) throw new Error("Harness interrupted");
    const log = `logs/${String(++sequence).padStart(3, "0")}-${check.id.replace(/[^\w-]/g, "_")}.log`;
    const row = {
      ...check,
      command: [check.command, ...check.args],
      env: undefined,
      log,
      status: "running",
      startedAt: new Date().toISOString(),
    };
    report.checks.push(row);
    console.log(`[harness] ${check.id}`);
    const start = Date.now();
    const handle = launch(check.command, check.args, {
      cwd,
      env: { ...check.env, ...env },
      log: join(output, log),
      timeoutMs: check.timeoutMs,
    });
    handles.add(handle);
    const result = await handle.done;
    handles.delete(handle);
    Object.assign(row, result, {
      durationMs: Date.now() - start,
      status: result.code === 0 && !result.timedOut && !interrupted ? "passed" : "failed",
    });
    if (row.status === "failed")
      throw new Error(`${check.id} ${result.timedOut ? "timed out" : "failed"}; see ${log}`);
    return row;
  }
  async function build(cwd, prefix) {
    await execute(
      {
        id: `${prefix}-assets`,
        command: "npm",
        args: ["run", "prebuild"],
        kind: "gate",
        timeoutMs: 180000,
      },
      cwd,
    );
    await execute(
      {
        id: `${prefix}-build`,
        command: process.execPath,
        args: ["node_modules/vite/bin/vite.js", "build"],
        kind: "gate",
        timeoutMs: 900000,
        reason: "Production build without database migration",
      },
      cwd,
    );
  }
  async function materialize(sha, label, overlay = false) {
    const temp = await mkdtemp(join(tmpdir(), `dw-harness-${label}-`));
    const directory = join(temp, "tree");
    ownedTrees.push({ temp, directory });
    git(root, ["worktree", "add", "--detach", directory, sha]);
    if (overlay) {
      const names = (args) =>
        execFileSync("git", args, { cwd: root, encoding: "utf8" }).split("\0").filter(Boolean);
      const dirty = [
        ...new Set([
          ...names(["diff", "--name-only", "--no-renames", "-z", "HEAD"]),
          ...names(["ls-files", "--others", "--exclude-standard", "-z"]),
        ]),
      ].sort();
      const digest = createHash("sha256");
      for (const name of dirty) {
        const source = join(root, name),
          target = join(directory, name);
        digest.update(name).update("\0");
        if (existsSync(source)) {
          await mkdir(dirname(target), { recursive: true });
          await cp(source, target, { recursive: true, dereference: false });
          digest.update(await readFile(source));
        } else {
          await rm(target, { force: true, recursive: true });
          digest.update("deleted");
        }
      }
      report.workspace = {
        dirtyFiles: dirty,
        fingerprint: digest.digest("hex"),
        buildIsolation:
          "detached HEAD plus current tracked/untracked changes; prebuild only modifies the owned copy",
      };
    }
    const sameLock = (await readFile(join(root, "package-lock.json"))).equals(
      await readFile(join(directory, "package-lock.json")),
    );
    if (sameLock && existsSync(join(root, "node_modules")))
      await symlink(resolve(root, "node_modules"), join(directory, "node_modules"), "dir");
    else {
      const config = join(output, "npm-empty-config");
      await writeFile(config, "");
      await execute(
        {
          id: `${label}-dependencies`,
          command: "npm",
          args: ["ci"],
          kind: "gate",
          timeoutMs: 900000,
        },
        directory,
        { NPM_CONFIG_USERCONFIG: config },
      );
    }
    return directory;
  }
  async function candidateDirectory() {
    candidateRoot ??= await materialize(currentSha, "candidate", true);
    return candidateRoot;
  }
  async function startPreview(cwd, prefix) {
    const port = await freePort();
    const handle = launch(process.execPath, [join(root, "scripts/preview-production.mjs")], {
      cwd,
      env: { PREVIEW_ROOT: cwd, PREVIEW_PORT: String(port) },
      log: join(output, `logs/${prefix}-preview.log`),
      timeoutMs: 0,
    });
    handles.add(handle);
    const url = `http://127.0.0.1:${port}`;
    const expectedSha = prefix === "baseline" ? report.baselineRevision : currentSha;
    const identity = await waitForPreview(url, handle, 30000, expectedSha);
    report[`${prefix}Identity`] = identity;
    return url;
  }
  try {
    await mkdir(join(output, "logs"), { recursive: true });
    if (plan.unavailableChecks.length) {
      report.coverage.browser = "blocked";
      report.checks.push(
        ...plan.unavailableChecks.map((check) => ({ ...check, status: "blocked" })),
      );
      throw new Error(
        `Required browser verifiers are unavailable: ${plan.unavailableChecks.map((check) => check.script).join(", ")}`,
      );
    }
    let built = false;
    for (const check of plan.checks.filter((c) => c.kind !== "browser")) {
      if (check.id === "build") {
        if (options["reuse-build"]) {
          report.warnings.push(
            "Candidate build explicitly reused; source/build equality is not established by Git SHA alone.",
          );
          report.checks.push({ id: "build", status: "reused", reason: "--reuse-build" });
        } else {
          await build(await candidateDirectory(), "candidate");
          built = true;
        }
      } else await execute(check);
    }
    report.coverage.static = plan.checks.some((c) => c.kind !== "browser")
      ? "passed"
      : "not-selected";
    if (options["no-browser"]) {
      for (const check of browserChecks)
        report.checks.push({ id: check.id, status: "skipped", reason: "--no-browser" });
      if (needBrowser)
        report.warnings.push("Browser checks were requested or selected but not executed.");
    } else if (needBrowser) {
      let baseUrl = options["base-url"];
      if (!baseUrl) {
        if (!built && !options["reuse-build"]) await build(await candidateDirectory(), "candidate");
        baseUrl = await startPreview(
          options["reuse-build"] ? root : await candidateDirectory(),
          "candidate",
        );
      } else {
        report.candidateIdentity = await waitForPreview(baseUrl, undefined, 10000, currentSha);
        report.warnings.push(
          "External local preview: its delivered build must be matched separately to the working tree.",
        );
      }
      report.baseUrl = baseUrl;
      for (const check of browserChecks) {
        const env = {
          BASE_URL: baseUrl,
          BASE: baseUrl,
          ...(check.baseUrlEnv ? { [check.baseUrlEnv]: baseUrl } : {}),
        };
        if (check.artifactDirEnv) {
          const directory = join(output, check.id);
          await mkdir(directory, { recursive: true });
          env[check.artifactDirEnv] = directory;
        }
        if (check.reportEnv) env[check.reportEnv] = join(output, `${check.id}.json`);
        await execute(check, root, env);
        if (check.id === "rexonance-heap")
          report.coverage.memory =
            "passed: two warm-up + five measured SPA returns + forced GC, Rexonance page DOM";
      }
      report.coverage.browser = "passed";
      if (shouldProbe) {
        let baselineUrl = options["baseline-url"];
        if (!baselineUrl && options.mode === "compare") {
          const sha = revision(root, options["baseline-ref"] ?? "origin/main");
          report.baselineRevision = sha;
          const baselineRoot = await materialize(sha, "baseline");
          await build(baselineRoot, "baseline");
          baselineUrl = await startPreview(baselineRoot, "baseline");
        }
        report.baselineUrl = baselineUrl ?? null;
        if (baselineUrl && !report.baselineIdentity) {
          report.baselineIdentity = await waitForPreview(baselineUrl, undefined, 10000);
          report.baselineRevision = report.baselineIdentity.sha;
        }
        if (baselineUrl === baseUrl)
          report.warnings.push(
            "Same origin on both sides: this is a control run, not a comparison between revisions.",
          );
        const areaRoutes = {
          world: "/world",
          rexonance: "/rexonance-saga",
          dream: "/dream-chapter",
          extreme: "/extreme-saga",
          gallery: "/gallery",
          library: "/library",
          "far-from": "/far-from-saga",
          illusionculum: "/illusionculum-saga",
          "meta-unitas": "/meta-unitas-saga",
          "final-stage": "/final-stage",
          "saga-cinema": "/saga-cinema",
        };
        const selected = plan.areas.map((area) => areaRoutes[area]).filter(Boolean);
        const routes =
          options.routes ??
          (options.scene === "transformation"
            ? "/rexonance-saga"
            : selected.length
              ? [...new Set(selected)].join(",")
              : "/world,/rexonance-saga");
        const probeOutput = join(output, "probe");
        const probeArgs = [
          "scripts/harness/browser-probe.mjs",
          "--base-url",
          baseUrl,
          "--output",
          probeOutput,
          "--routes",
          routes,
          "--profiles",
          options.profiles,
          "--engines",
          options.engines,
          "--samples",
          options.samples,
          "--scene",
          options.scene,
        ];
        if (baselineUrl) probeArgs.push("--baseline-url", baselineUrl);
        try {
          await execute({
            id: "browser-probe",
            kind: "browser",
            command: process.execPath,
            args: probeArgs,
            timeoutMs: 1800000,
          });
        } finally {
          if (existsSync(join(probeOutput, "probe.json"))) {
            report.probe = JSON.parse(await readFile(join(probeOutput, "probe.json"), "utf8"));
            report.comparisons = compareMetrics(report.probe);
            report.visualComparisons = await compareScreenshots(report.probe, probeOutput);
            report.comparisonConditions = assessProbeConditions(report.probe);
            report.coverage.comparison = !baselineUrl
              ? "not-comparable: candidate observation only"
              : report.probe.status !== "passed"
                ? report.probe.status
                : report.comparisonConditions.status !== "matched"
                  ? "not-comparable: rendering conditions differ, changed, or are unavailable"
                  : "passed";
          }
        }
      }
    }
    assertRequiredComparison(options, report.comparisonConditions);
    report.status =
      options["no-browser"] || options["reuse-build"]
        ? "partial"
        : report.checks.length
          ? "passed"
          : "no-changes";
  } catch (error) {
    report.status = interrupted ? "interrupted" : "failed";
    report.errors.push(error.message);
  } finally {
    for (const handle of handles) handle.stop();
    await Promise.all([...handles].map((handle) => handle.done));
    for (const { temp, directory } of ownedTrees) {
      try {
        if (existsSync(directory)) git(root, ["worktree", "remove", "--force", directory]);
        await rm(temp, { recursive: true, force: true });
      } catch (error) {
        report.warnings.push(`Owned build directory cleanup needs attention: ${error.message}`);
      }
    }
    if (["failed", "interrupted"].includes(report.status)) {
      for (const key of Object.keys(report.coverage))
        if (report.coverage[key] === "pending") report.coverage[key] = "blocked";
      if (shouldProbe && !report.checks.some((c) => c.id === "browser-probe"))
        report.checks.push({
          id: "browser-probe",
          status: "blocked",
          reason: "Earlier failure prevented browser measurement",
        });
    }
    const completed = new Set(report.checks.map((c) => c.id));
    for (const check of [...plan.checks, ...browserChecks])
      if (!completed.has(check.id) && !(check.id === "build" && completed.has("candidate-build"))) {
        report.checks.push({
          id: check.id,
          status: "blocked",
          reason: "Earlier failure or interruption prevented execution",
        });
        completed.add(check.id);
      }
    report.finishedAt = new Date().toISOString();
    try {
      await writeReport(output, report);
    } finally {
      releaseLock();
      process.removeListener("SIGINT", interrupt);
      process.removeListener("SIGTERM", interrupt);
    }
  }
  console.log(`[harness] ${report.status}: ${join(output, "report.html")}`);
  return ["passed", "partial", "no-changes"].includes(report.status) ? 0 : 1;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main()
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error) => {
      console.error(`[harness] ${error.message}`);
      process.exitCode = 1;
    });
}
