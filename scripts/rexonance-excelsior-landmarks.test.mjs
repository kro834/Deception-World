import assert from "node:assert/strict";
import test from "node:test";
import {
  EXCELSIOR_LANDMARK_REFERENCE as reference,
  FORM_LANDMARKS,
} from "../src/lib/rexonance-overwrite.js";

const panelNames = [
  "head",
  "leftShoulder",
  "rightShoulder",
  "core",
  "belt",
  "leftForearm",
  "rightForearm",
  "leftFist",
  "rightFist",
  "leftFoot",
  "rightFoot",
  "tailTip",
];
const figureNames = [...panelNames.slice(0, 9), "leftKnee", "rightKnee", ...panelNames.slice(9)];
const close = (actual, expected) =>
  assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`);

test("panel and padded scroll anchors register the same source features in the new cutout", () => {
  assert.deepEqual([reference.width, reference.height], [1022, 1880]);
  assert.deepEqual(reference.fit, {
    left: 125,
    top: 5,
    width: 560,
    height: 1030,
    originX: 120,
    frameWidth: 571,
    frameHeight: 1040,
  });
  assert.equal(FORM_LANDMARKS.panel.excelsior.length, FORM_LANDMARKS.panel.ultra.length);
  assert.equal(FORM_LANDMARKS.figure.excelsior.length, FORM_LANDMARKS.figure.ultra.length);
  for (const [index, name] of panelNames.entries()) {
    const [x, y] = FORM_LANDMARKS.panel.excelsior[index];
    const [fx, fy] = FORM_LANDMARKS.figure.excelsior[figureNames.indexOf(name)];
    const sourceX = x * reference.width;
    const sourceY = y * reference.height;
    close(sourceX, reference.points[name][0]);
    close(sourceY, reference.points[name][1]);
    close(fx * 571 + 120, 125 + (sourceX * 560) / 1022);
    close(fy * 1040, 5 + (sourceY * 1030) / 1880);
  }
});

test("anatomical centers remain ordered and anchors use body detail rather than ribbons or empty padding", () => {
  const p = reference.points;
  assert.ok(p.head[1] < p.core[1] && p.core[1] < p.belt[1]);
  assert.ok(
    p.belt[1] < p.leftFist[1] && p.leftFist[1] < p.leftKnee[1] && p.leftKnee[1] < p.leftFoot[1],
  );
  assert.ok(
    p.belt[1] < p.rightFist[1] &&
      p.rightFist[1] < p.rightKnee[1] &&
      p.rightKnee[1] < p.rightFoot[1],
  );
  for (const pair of [
    ["leftShoulder", "rightShoulder"],
    ["leftForearm", "rightForearm"],
    ["leftFist", "rightFist"],
    ["leftKnee", "rightKnee"],
    ["leftFoot", "rightFoot"],
  ]) {
    assert.ok(p[pair[0]][0] < p.core[0] && p[pair[1]][0] > p.core[0]);
    assert.ok(Math.abs(p[pair[0]][1] - p[pair[1]][1]) < 15, "frontal pose joints share height");
  }
  assert.ok(p.core[0] / 1022 > 0.49 && p.core[0] / 1022 < 0.51);
  assert.ok(p.core[1] / 1880 > 0.25 && p.core[1] / 1880 < 0.28);
  assert.ok(p.belt[1] / 1880 > 0.39 && p.belt[1] / 1880 < 0.41);
  assert.ok(p.tailTip[0] / 1022 > 0.92 && p.tailTip[1] / 1880 > 0.28);
  assert.ok(
    p.leftForearm[0] > 150 && p.rightForearm[0] < 880,
    "anchors stay on the gauntlets, away from side ribbons",
  );
});
