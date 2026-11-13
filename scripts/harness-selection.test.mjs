import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { planChecks } from "./harness/selection.mjs";

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), "dw-harness-selection-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const write = (path, contents = "") => {
    const absolute = join(root, path);
    mkdirSync(dirname(absolute), { recursive: true });
    writeFileSync(absolute, contents);
  };
  mkdirSync(join(root, "scripts"));
  for (const name of [
    "opening-controls",
    "route-history",
    "route-error-recovery",
    "route-warmup-deadline",
    "world-section-nav",
    "archive-history-navigation",
    "gallery-controls-focus",
    "dream-chapter-stage",
    "dream-navigation-recovery",
    "rexonance-operability",
    "site-health",
  ]) {
    write(`scripts/verify-${name}.mjs`);
  }
  return { root, write };
}

test("a Gallery edit selects existing area and direct source tests only", (t) => {
  const { root, write } = fixture(t);
  write("scripts/gallery-viewer.test.mjs");
  write("scripts/cross-route-a11y.test.mjs", `read("src/components/gallery/gallery-page.tsx")`);
  write(
    "scripts/partial-reference.test.mjs",
    `read("src/components/gallery/gallery-page.tsx.bak")`,
  );
  write("scripts/dream-reader.test.mjs");
  const plan = planChecks({ root, files: ["src/components/gallery/gallery-page.tsx"] });
  assert.deepEqual(plan.areas, ["gallery"]);
  assert.deepEqual(plan.unknownFiles, []);
  assert.deepEqual(
    plan.checks.map(({ id }) => id),
    ["typecheck", "selected-node-tests", "verify-gallery-controls-focus"],
  );
  assert.deepEqual(plan.checks[1].args, [
    "--test",
    "./scripts/cross-route-a11y.test.mjs",
    "./scripts/gallery-viewer.test.mjs",
  ]);
  assert.deepEqual(plan.checks[2].browsers, ["chrome", "webkit"]);
  assert.equal(plan.checks[2].artifactDirEnv, "OUTPUT_DIR");
});

test("source parts and generated paths plan the same checks and deduplicate pairs", (t) => {
  const { root, write } = fixture(t);
  const source = "src/components/cinematic/title-sequence.tsx";
  const part = `source-parts/${source}/000.part`;
  write(part);
  write("scripts/opening-notice.test.mjs");
  const plan = planChecks({ root, files: [source] });
  assert.equal(plan.checks[0].id, "sync-source-parts");
  assert.deepEqual(planChecks({ root, files: [part] }), plan);
  assert.deepEqual(planChecks({ root, files: [part, source, source] }), plan);
});

test("shared loading code expands across navigation and sets production-only requirements", (t) => {
  const { root, write } = fixture(t);
  write("scripts/loading-gate-immediate.test.mjs");
  write("scripts/world-home-navigation-accessibility.test.mjs");
  const plan = planChecks({ root, files: ["src/components/load-gate.tsx"] });
  assert.deepEqual(plan.areas, ["archive", "navigation", "opening", "shared", "world"]);
  for (const id of [
    "opening-controls",
    "route-history",
    "world-section-nav",
    "archive-history-navigation",
  ]) {
    assert.ok(
      plan.checks.some((check) => check.id === `verify-${id}`),
      id,
    );
  }
  for (const id of ["route-error-recovery", "route-warmup-deadline"]) {
    assert.equal(
      plan.checks.find((check) => check.id === `verify-${id}`).requiresProductionBuild,
      true,
    );
  }
});

test("root and shared styles route to the cross-page checks", (t) => {
  const { root } = fixture(t);
  for (const path of [
    "src/router.tsx",
    "src/routes/__root.tsx",
    "src/styles.css",
    "src/styles-world-common.css",
  ]) {
    const plan = planChecks({ root, files: [path] });
    assert.ok(plan.areas.includes("shared"), path);
    assert.ok(
      plan.checks.some(({ id }) => id === "verify-route-history"),
      path,
    );
    assert.ok(
      plan.checks.some(({ id }) => id === "verify-archive-history-navigation"),
      path,
    );
  }
});

test("Dream stage uses its original BASE and output variable names", (t) => {
  const { root } = fixture(t);
  const { checks } = planChecks({ root, files: ["src/routes/dream-chapter.tsx"] });
  const check = checks.find(({ id }) => id === "verify-dream-chapter-stage");
  assert.equal(check.baseUrlEnv, "BASE");
  assert.equal(check.artifactDirEnv, "AUDIT_OUT");
  assert.deepEqual(check.browsers, ["chrome", "webkit"]);
});

test("heap retainer changes select the Rexonance checks", (t) => {
  const { root, write } = fixture(t);
  write("scripts/heap-retainers.test.mjs");
  const plan = planChecks({ root, files: ["scripts/heap-retainers.mjs"] });
  assert.deepEqual(plan.areas, ["rexonance"]);
  assert.deepEqual(plan.unknownFiles, []);
  assert.deepEqual(
    plan.checks.map(({ id }) => id),
    ["selected-node-tests", "verify-rexonance-operability"],
  );
  assert.deepEqual(plan.checks[0].args, ["--test", "./scripts/heap-retainers.test.mjs"]);
  const heapPlan = planChecks({ root, files: ["scripts/verify-rexonance-heap.mjs"] });
  assert.ok(!heapPlan.warnings.some((warning) => warning.includes("no harness adapter")));
});

test("unknown runtime paths trigger broad checks and explain the fallback", (t) => {
  const { root } = fixture(t);
  const path = "src/routes/new-entry.tsx";
  const plan = planChecks({ root, files: [path] });
  assert.deepEqual(plan.unknownFiles, [path]);
  assert.ok(plan.warnings.some((warning) => warning.includes(path)));
  for (const id of [
    "sync-source-parts",
    "lint",
    "typecheck",
    "test",
    "build",
    "verify-route-history",
    "verify-site-health",
  ]) {
    assert.ok(
      plan.checks.some((check) => check.id === id),
      id,
    );
  }
});

test("full mode includes static gates and the supplemental test outside scripts", (t) => {
  const { root, write } = fixture(t);
  const extra = "src/components/saga-cinema/saga-cinema-data.test.mjs";
  write(extra);
  write("scripts/direct.test.mjs");
  const plan = planChecks({ root, files: ["scripts/direct.test.mjs"], full: true });
  assert.deepEqual(
    plan.checks.map(({ id }) => id),
    [
      "sync-source-parts",
      "lint",
      "typecheck",
      "test",
      "selected-node-tests",
      "build",
      "verify-site-health",
    ],
  );
  assert.deepEqual(plan.checks[4].args, ["--test", `./${extra}`]);
  assert.deepEqual(plan.checks[5].args, ["node_modules/vite/bin/vite.js", "build"]);
});

test("a removed verifier, an unadapted verifier and an escaped path stay visible", (t) => {
  const { root } = fixture(t);
  rmSync(join(root, "scripts/verify-opening-controls.mjs"));
  const plan = planChecks({
    root,
    files: [
      "scripts/verify-opening-controls.mjs",
      "scripts/verify-public-deployment.mjs",
      "../foreign.test.mjs",
    ],
  });
  assert.deepEqual(plan.unknownFiles, ["../foreign.test.mjs"]);
  assert.ok(plan.warnings.some((warning) => warning.includes("no longer exists")));
  assert.ok(plan.warnings.some((warning) => warning.includes("no harness adapter")));
  assert.ok(plan.warnings.some((warning) => warning.includes("outside the repository")));
  assert.ok(!plan.checks.some((check) => check.id === "verify-public-deployment"));
  assert.ok(plan.unavailableChecks.some((check) => check.id === "verify-opening-controls"));
  assert.ok(!plan.unavailableChecks.some((check) => check.id === "verify-public-deployment"));
});

test("documentation-only changes need no application check in targeted mode", (t) => {
  const { root } = fixture(t);
  const plan = planChecks({ root, files: ["AGENTS.md", "docs/web-harness.md"] });
  assert.deepEqual(plan, {
    checks: [],
    areas: [],
    unknownFiles: [],
    warnings: [],
    unavailableChecks: [],
  });
});
