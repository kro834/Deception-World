import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const source = readFileSync(new URL("./verify-rexonance-rx17-frames.mjs", import.meta.url), "utf8");
const ast = ts.createSourceFile(
  "frame-audit.mjs",
  source,
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.JS,
);
const declaration = ast.statements.find(
  (node) => ts.isFunctionDeclaration(node) && node.name?.text === "assertRexonanceFaceHold",
);
assert.ok(declaration, "the capture script owns the executable face contract");
// Execute the exact declaration used by the live recorder. Never evaluate
// the surrounding Playwright module, whose top-level code launches Chrome.
const audit = runInNewContext(`(${declaration.getText(ast).replace(/^export\s+/, "")})`, {
  assert,
});
const heldGroups = () =>
  Array.from({ length: 6 }, (_, i) => ({
    opacity: "1",
    transform: `matrix(${(1 / (i + 2)).toFixed(6)}, 0, 0, ${(1 / (i + 2)).toFixed(6)}, 0, 0)`,
  }));
const frame = (clock, groups = heldGroups()) => ({ clock, faceGroups: groups });
const valid = () => ({
  shots: [frame(2120)],
  supplements: [
    frame(
      1990,
      heldGroups().map((group) => ({ ...group, opacity: "0" })),
    ),
    frame(
      2000,
      heldGroups().map((group, i) => ({ ...group, opacity: i === 0 ? "0.174216" : "0" })),
    ),
    frame(2640),
    frame(2670),
    frame(
      2710,
      heldGroups().map((group, i) =>
        i === 0
          ? {
              ...group,
              opacity: "0.315544",
              transform: "matrix(0.766418, -0.129388, 0.129388, 0.766418, 0, 0)",
            }
          : group,
      ),
    ),
    frame(
      2800,
      heldGroups().map((group) => ({ ...group, opacity: "0.0796586" })),
    ),
  ],
});
const at = (evidence, time) =>
  [...evidence.shots, ...evidence.supplements].find((shot) => shot.clock === time);

test("the live recorder invokes the same face contract tested without a browser", () => {
  let invoked = false;
  const visit = (node) => {
    if (ts.isCallExpression(node) && node.expression.getText(ast) === "assertRexonanceFaceHold")
      invoked = true;
    ts.forEachChild(node, visit);
  };
  visit(ast);
  assert.equal(invoked, true);
  assert.doesNotThrow(() => audit(valid(), "fixture"));
});

test("actual frame evidence must include all required times and all six face groups", () => {
  const missing = valid();
  missing.supplements = missing.supplements.filter((shot) => shot.clock !== 2670);
  assert.throws(() => audit(missing, "missing"), /actual face evidence is missing at 2670ms/);
  const incomplete = valid();
  at(incomplete, 2640).faceGroups.pop();
  assert.throws(() => audit(incomplete, "incomplete"), /six face groups at 2640ms/);
});

test("face pixels remain dark at 1990ms, then begin a gradual fill at 2000ms", () => {
  const early = valid();
  at(early, 1990).faceGroups[5].opacity = "0.001";
  assert.throws(() => audit(early, "early"), assert.AssertionError);
  for (const opacity of ["0", "1"]) {
    const noGradualFill = valid();
    at(noGradualFill, 2000).faceGroups[0].opacity = opacity;
    assert.throws(() => audit(noGradualFill, "fill"), assert.AssertionError);
  }
  const late = valid();
  at(late, 2120).faceGroups[5].opacity = "0.99";
  assert.throws(() => audit(late, "late"), assert.AssertionError);
});

test("the full face stays fixed through 2640ms and does not scatter before 2670ms", () => {
  for (const time of [2640, 2670]) {
    const moved = valid();
    at(moved, time).faceGroups[3].transform = "matrix(1, 0, 0, 1, 10, 0)";
    assert.throws(() => audit(moved, "moved"), /hold on the face|does not start early/);
    const faded = valid();
    at(faded, time).faceGroups[2].opacity = "0.99";
    assert.throws(() => audit(faded, "faded"), /hold on the face|does not start early/);
  }
});

test("the face must scatter after its hold and leave only faint remnants by 2800ms", () => {
  const noScatter = valid();
  at(noScatter, 2710).faceGroups = heldGroups();
  assert.throws(() => audit(noScatter, "static"), /squares scatter after the hold/);
  const stuck = valid();
  at(stuck, 2800).faceGroups[5].opacity = "0.09";
  assert.throws(() => audit(stuck, "stuck"), assert.AssertionError);
});

// Opt in to reviewing a freshly captured artifact; normal CI uses the
// deterministic failure fixtures above and never depends on a /tmp path.
if (process.env.RX17_FRAMES_AUDIT_EVIDENCE) {
  test("the exact live contract passes the supplied native Canvas frame evidence", () => {
    const { reports } = JSON.parse(readFileSync(process.env.RX17_FRAMES_AUDIT_EVIDENCE, "utf8"));
    assert.equal(reports.length, 2);
    for (const report of reports) {
      assert.equal(report.shots.length, 46);
      assert.deepEqual(
        report.shots.map((shot) => shot.clock),
        Array.from({ length: 46 }, (_, i) => 600 + i * 40),
      );
      assert.equal(report.supplements.length, 8);
      assert.ok(
        [...report.shots, ...report.supplements].every(
          (shot) =>
            shot.nanites === "canvas" && shot.suit === "build" && shot.canvases.length === 2,
        ),
      );
      audit(report, report.profile);
    }
  });
}
