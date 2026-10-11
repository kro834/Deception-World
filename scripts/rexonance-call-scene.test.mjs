import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import test from "node:test";
import { runInNewContext } from "node:vm";

const source = readFileSync(new URL("../src/components/load-gate.tsx", import.meta.url), "utf8");
const start = source.indexOf("function composeScene(");
const end = source.indexOf("// Zeus's seal:", start);
assert.ok(start !== -1 && end > start);
const code = stripTypeScriptTypes(source.slice(start, end));

test("a preloaded Rexonance call keeps tier and clock metadata without closing-menu layout", () => {
  let measurements = 0;
  const ctx = {
    lastPress: { target: "closing menu" },
    centredRect: (w, h) => ({ x: (1440 - w) / 2, y: (900 - h) / 2, w, h }),
    takePress: () => {
      measurements += 1;
      throw new Error("unused layout");
    },
  };
  runInNewContext(code, ctx);
  const scene = ctx.composeScene({
    tier: "full",
    kind: "iris",
    frameKind: "file",
    timings: { cover: 2880, reveal: 480 },
    assets: [],
    to: "/rexonance-saga",
    callOnly: true,
  });
  assert.equal(measurements, 0);
  assert.equal(ctx.lastPress, null);
  assert.equal(scene.tier, "full");
  assert.equal(scene.cover, 2880);
  assert.equal(scene.reveal, 480);
  for (const key of ["landing", "plate", "hold", "art", "artRect", "file"])
    assert.equal(scene[key], null);
  assert.equal(scene.frame.w, 0);
  assert.equal(scene.frame.h, 0);
  assert.throws(
    () =>
      ctx.composeScene({
        tier: "full",
        kind: "iris",
        frameKind: "file",
        timings: { cover: 800, reveal: 800 },
        assets: [],
        to: "/riders/saga",
      }),
    /unused layout/,
  );
  assert.equal(measurements, 1, "other dives retain their pressed geometry");
});

test("the call yields before mount; decoded plan preparation is bounded and cancellation-guarded", () => {
  const branch = source.slice(source.indexOf("rexonanceCall = await preparation.promise;"));
  assert.match(
    branch,
    /await nextFrame\(\);\s*await nextFrame\(\);\s*if \(!isCurrent\(\)\) return;/,
  );
  assert.match(branch, /rexonanceCall && tier === "full" && rexonanceSuitWarm/);
  assert.match(
    branch,
    /prepareRexonanceEntry\(\{[\s\S]*?decoded: rexonanceSuitWarm,[\s\S]*?prepareRexonanceSuit\("high"\)[\s\S]*?deadlineMs: 1800,/,
  );
  assert.match(
    branch,
    /rexonanceCoverCancel\.current = entry\.cancel;\s*await entry\.promise;[\s\S]*?if \(!isCurrent\(\)\) return;/,
  );
  assert.ok(branch.indexOf('setSignal("running")') < branch.indexOf("await nextFrame()"));
  assert.ok(
    branch.indexOf("await entry.promise;") < branch.indexOf("startedAt = performance.now();"),
  );
  assert.match(branch, /callOnly: Boolean\(rexonanceCall\)/);
});
