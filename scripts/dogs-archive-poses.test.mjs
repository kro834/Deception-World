import assert from "node:assert/strict";
import test from "node:test";
import {
  describeGuardianPoses,
  guardianPoseChooserVisible,
  guardianPoseFadeSeconds,
  isGuardianBreathClip,
} from "../src/lib/dogs-archive/poses.ts";

test("a Rest/Exhale model exposes a single pose and no chooser", () => {
  const poses = describeGuardianPoses(["Rest", "Exhale"], { transitionSeconds: 1.6 });
  assert.deepEqual(poses, [{ name: "Rest", label: "静止", loop: false }]);
  assert.equal(guardianPoseChooserVisible(poses), false);
});

test("extra clips become poses with short labels, Rest first, loops detected", () => {
  const poses = describeGuardianPoses(
    ["Coiled", "Exhale", "Rest", "SwimLoop", "Rearing", "Rest", "HeadAdditive"],
    { poseLabels: { Rearing: "鎌首" }, poseLoops: ["Coiled"] },
  );
  assert.deepEqual(
    poses.map(({ name }) => name),
    ["Rest", "Coiled", "SwimLoop", "Rearing"],
  );
  assert.deepEqual(
    poses.map(({ label }) => label),
    ["静止", "とぐろ", "SwimLoop", "鎌首"],
  );
  assert.deepEqual(
    poses.map(({ loop }) => loop),
    [false, true, true, false],
  );
  assert.equal(guardianPoseChooserVisible(poses), true);
  for (const name of ["Exhale", "exhale_head", "BreathAdditive"])
    assert.equal(isGuardianBreathClip(name), true, name);
  assert.equal(isGuardianBreathClip("Rest"), false);
});

test("the crossfade follows the manifest transition within a comfortable band", () => {
  assert.equal(guardianPoseFadeSeconds({ transitionSeconds: 1.6 }), 1.2);
  assert.equal(guardianPoseFadeSeconds({ transitionSeconds: 0.2 }), 0.6);
  assert.equal(guardianPoseFadeSeconds({ transitionSeconds: 10 }), 2);
  assert.equal(guardianPoseFadeSeconds(null), 1.2);
  assert.equal(guardianPoseFadeSeconds({}), 1.2);
});
