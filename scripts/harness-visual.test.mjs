import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { compareScreenshots } from "./harness/visual-comparison.mjs";

const observed = {
  worldEffects: null,
  savedRenderQuality: null,
  storageReadable: true,
  historyReadable: true,
  devicePixelRatio: 1,
  reducedMotion: false,
};

async function fixture(t) {
  const dir = await mkdtemp(join(tmpdir(), "dw-visual-test-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  async function png(name, width, height, data) {
    await sharp(Buffer.from(data), { raw: { width, height, channels: 4 } })
      .png()
      .toFile(join(dir, name));
  }
  await png("base.png", 2, 1, [10, 20, 30, 255, 40, 50, 60, 255]);
  await png("same.png", 2, 1, [10, 20, 30, 255, 40, 50, 60, 255]);
  await png("different.png", 2, 1, [14, 20, 30, 255, 40, 50, 60, 255]);
  await png("small.png", 1, 1, [10, 20, 30, 255]);
  const run = (side, screenshot, sample = 1) => ({
    conditions: observed,
    conditionsAfter: observed,
    status: "passed",
    side,
    screenshot,
    engine: "chromium",
    profile: "phone",
    route: "/world",
    sample,
  });
  return { dir, run };
}

test("same RGBA has zero difference and generates a diff image", async (t) => {
  const { dir, run } = await fixture(t);
  const [result] = await compareScreenshots(
    { runs: [run("baseline", "base.png"), run("candidate", "same.png")] },
    dir,
  );
  assert.equal(result.status, "compared");
  assert.equal(result.diffRatio, 0);
  assert.equal(result.meanAbsError, 0);
  assert.deepEqual((await sharp(join(dir, result.diffScreenshot)).metadata()).width, 2);
});

test("changed pixel yields fraction and per-channel mean error", async (t) => {
  const { dir, run } = await fixture(t);
  const [result] = await compareScreenshots(
    { runs: [run("baseline", "base.png"), run("candidate", "different.png")] },
    dir,
  );
  assert.equal(result.diffRatio, 0.5);
  assert.equal(result.meanAbsError, 0.5);
  assert.equal(result.assessment, "advisory");
});

test("mismatched dimensions and missing side are not comparable", async (t) => {
  const { dir, run } = await fixture(t);
  const results = await compareScreenshots(
    {
      runs: [
        run("baseline", "base.png"),
        run("candidate", "small.png"),
        run("candidate", "same.png", 2),
      ],
    },
    dir,
  );
  assert.equal(results[0].status, "dimension-mismatch");
  assert.equal(results[0].diffRatio, null);
  assert.equal(results[1].status, "not-comparable");
  assert.equal(results[1].diffScreenshot, null);
});

test("progress captures pair by progress and missing images are recorded", async (t) => {
  const { dir, run } = await fixture(t);
  const a = {
    ...run("baseline", "base.png"),
    sceneScreenshots: [
      { progress: 0.06, screenshot: "base.png" },
      { progress: 0.5, screenshot: "base.png" },
    ],
  };
  const b = {
    ...run("candidate", "same.png"),
    sceneScreenshots: [{ progress: 0.06, screenshot: "different.png" }],
  };
  const results = await compareScreenshots({ runs: [a, b] }, dir);
  assert.deepEqual(
    results.map((r) => [r.scene, r.progress, r.status]),
    [
      ["hero", null, "compared"],
      ["transformation", 0.06, "compared"],
      ["transformation", 0.5, "not-comparable"],
    ],
  );
});

test("decode errors are recorded and do not abort other comparisons", async (t) => {
  const { dir, run } = await fixture(t);
  const results = await compareScreenshots(
    {
      runs: [
        run("baseline", "missing.png"),
        run("candidate", "same.png"),
        run("baseline", "base.png", 2),
        run("candidate", "same.png", 2),
      ],
    },
    dir,
  );
  assert.equal(results[0].status, "error");
  assert.ok(results[0].reason);
  assert.equal(results[1].status, "compared");
});

test("quality condition differences suppress pixel comparison with a reason", async (t) => {
  const { dir, run } = await fixture(t);
  const candidate = run("candidate", "different.png");
  candidate.conditions = candidate.conditionsAfter = { ...observed, worldEffects: "economy" };
  const [result] = await compareScreenshots(
    { runs: [run("baseline", "base.png"), candidate] },
    dir,
  );
  assert.equal(result.status, "not-comparable");
  assert.equal(result.diffRatio, null);
  assert.equal(result.diffScreenshot, null);
  assert.match(result.reason, /conditions differ: worldEffects/);
});
