import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  localUrl,
  localEnvironment,
  launch,
  git,
  changedFiles,
  revision,
  acquireLock,
} from "./harness/runtime.mjs";
import { parseArgs } from "./harness.mjs";
import { compareMetrics, reportHtml } from "./harness/report.mjs";

test("only credential-free loopback origins are accepted", () => {
  assert.equal(localUrl("http://127.0.0.1:8123/"), "http://127.0.0.1:8123");
  for (const url of [
    "https://deception-world.vercel.app",
    "http://localhost.evil.test",
    "http://user:secret@localhost",
    "file:///tmp/x",
    "http://localhost/a",
    "http://localhost/?token=secret",
  ])
    assert.throws(() => localUrl(url));
});
test("execution strips ambient secrets and disables destructive migrations", () => {
  const env = localEnvironment(
    {},
    {
      PATH: "/bin",
      DATABASE_URL: "private",
      VERCEL_TOKEN: "secret",
      NODE_OPTIONS: "--require bad",
      PW_BROWSER_CHANNEL: "chrome",
    },
  );
  assert.equal(env.PATH, "/bin");
  assert.equal(env.DATABASE_URL, "");
  assert.equal(env.APPLY_DESTRUCTIVE_MIGRATIONS, "0");
  assert.equal(env.VERCEL_TOKEN, undefined);
  assert.equal(env.NODE_OPTIONS, undefined);
});
test("arguments reject unknown/missing options, invalid targets and invalid samples", () => {
  assert.equal(parseArgs(["compare", "--samples", "2"]).mode, "compare");
  for (const args of [
    ["deploy"],
    ["--unknown"],
    ["--output"],
    ["--samples", "0"],
    ["--samples", "1.5"],
    ["--base-url", "https://example.com"],
    ["--baseline-ref", "main", "--baseline-url", "http://localhost:3000"],
  ])
    assert.throws(() => parseArgs(args));
});
test("process timeout is a failure and child output is retained", async () => {
  const temp = await mkdtemp(join(tmpdir(), "harness-test-"));
  try {
    const log = join(temp, "child.log");
    const handle = launch(
      process.execPath,
      ["-e", "console.log('started');setInterval(()=>{},1000)"],
      { cwd: temp, log, timeoutMs: 300 },
    );
    const result = await handle.done;
    assert.equal(result.timedOut, true);
    assert.notEqual(result.code, 0);
    assert.match(await readFile(log, "utf8"), /started/);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});
test("Git discovery includes committed, staged, unstaged and untracked changes with literal names", async () => {
  const temp = await mkdtemp(join(tmpdir(), "harness-git-"));
  try {
    git(temp, ["init", "-q"]);
    git(temp, ["config", "user.name", "Harness test"]);
    git(temp, ["config", "user.email", "harness@example.invalid"]);
    await writeFile(join(temp, "base.txt"), "base");
    git(temp, ["add", "."]);
    git(temp, ["commit", "-qm", "base"]);
    const base = revision(temp, "HEAD");
    await writeFile(join(temp, "committed.txt"), "a");
    git(temp, ["add", "."]);
    git(temp, ["commit", "-qm", "candidate"]);
    await writeFile(join(temp, "staged.txt"), "a");
    git(temp, ["add", "."]);
    await writeFile(join(temp, "base.txt"), "changed");
    await writeFile(join(temp, "literal $(no shell).txt"), "x");
    assert.deepEqual(changedFiles(temp, base).files, [
      "base.txt",
      "committed.txt",
      "literal $(no shell).txt",
      "staged.txt",
    ]);
    assert.throws(() => revision(temp, "--all"));
    const release = acquireLock(temp);
    assert.throws(() => acquireLock(temp), /Another harness/);
    release();
    acquireLock(temp)();
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});
test("comparison pairs identical conditions and reports unsupported samples honestly", () => {
  const observed = {
    worldEffects: null,
    savedRenderQuality: null,
    storageReadable: true,
    historyReadable: true,
    devicePixelRatio: 1,
    reducedMotion: false,
  };
  const base = {
    conditions: observed,
    conditionsAfter: observed,
    engine: "webkit",
    profile: "phone",
    route: "/world",
    status: "passed",
    metrics: { frame: { p95Ms: 20 }, longTasks: { supported: false, entries: [] } },
  };
  const results = compareMetrics({
    runs: [
      { ...base, side: "baseline" },
      { ...base, side: "candidate", metrics: { ...base.metrics, frame: { p95Ms: 24 } } },
    ],
  });
  assert.equal(results.find((r) => r.metric === "frameP95").delta, 4);
  const delayed = compareMetrics({
    runs: [
      {
        ...base,
        side: "baseline",
        metrics: { ...base.metrics, frame: { firstFrameDelayMs: 12, p95Ms: 20 } },
      },
      {
        ...base,
        side: "candidate",
        metrics: { ...base.metrics, frame: { firstFrameDelayMs: 1600, p95Ms: 20 } },
      },
    ],
  });
  assert.equal(delayed.find((r) => r.metric === "firstFrameDelay").delta, 1588);
  assert.equal(delayed.find((r) => r.metric === "frameP95").delta, 0);
  assert.equal(results.find((r) => r.metric === "longTaskTotal").baselineSamples, 0);
  assert.equal(results.find((r) => r.metric === "longTaskTotal").assessment, "not-comparable");
  assert.equal(
    compareMetrics({ runs: [{ ...base, side: "candidate" }] }).find((r) => r.metric === "frameP95")
      .baseline,
    null,
  );
});
test("HTML report escapes log-derived values and rejects unsafe artifact links", () => {
  const html = reportHtml({
    status: "failed",
    checks: [{ id: "<script>alert(1)</script>", log: "javascript:bad", status: "failed" }],
    warnings: ["<img onerror=bad>"],
  });
  assert.ok(!html.includes("<script>"));
  assert.ok(!html.includes('href="javascript:'));
  assert.match(html, /&lt;script&gt;/);
});

test("condition mismatches and missing observations cannot produce performance deltas", () => {
  const observed = {
    worldEffects: null,
    savedRenderQuality: null,
    storageReadable: true,
    historyReadable: true,
    devicePixelRatio: 1,
    reducedMotion: false,
  };
  const baseline = {
    engine: "chromium",
    profile: "phone",
    route: "/world",
    sample: 1,
    side: "baseline",
    status: "passed",
    conditions: observed,
    conditionsAfter: observed,
    metrics: { frame: { p95Ms: 20 } },
  };
  const candidate = {
    ...baseline,
    side: "candidate",
    conditions: { ...observed, worldEffects: "economy" },
    conditionsAfter: { ...observed, worldEffects: "economy" },
    metrics: { frame: { p95Ms: 10 } },
  };
  for (const changed of [candidate, { ...candidate, conditions: undefined }]) {
    const row = compareMetrics({ runs: [baseline, changed] }).find(
      (row) => row.metric === "frameP95",
    );
    assert.equal(row.assessment, "not-comparable");
    assert.equal(row.delta, null);
    assert.match(row.reason, /conditions/);
    const html = reportHtml({ comparisons: [row] });
    assert.ok(html.includes(row.reason));
    assert.ok(!html.includes("同一画質"));
  }
});
