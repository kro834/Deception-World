/** Pose contract read from the model's clips and its manifest. Every clip except the breath is
 * a selectable pose; Rest is the default. Short Japanese labels come from the manifest
 * (`poseLabels`), then from the built-in table, then from the clip name itself. */
export type GuardianPose = { name: string; label: string; loop: boolean };
export type GuardianPoseManifest = {
  poseLabels?: Record<string, string>;
  poseLoops?: string[];
  transitionSeconds?: number;
};

export const GUARDIAN_POSE_LABELS: Record<string, string> = {
  Rest: "静止",
  Idle: "静止",
  Coil: "とぐろ",
  Coiled: "とぐろ",
  Rear: "威嚇",
  Rearing: "威嚇",
  Threat: "威嚇",
  Swim: "遊泳",
  Undulate: "遊泳",
  Glide: "遊泳",
};

/** The breath clip, or any additive layer: never a pose of its own. */
export function isGuardianBreathClip(name: string) {
  return /exhale|additive|breath/i.test(name);
}

export function isGuardianLoopClip(name: string, manifest?: GuardianPoseManifest | null) {
  return (
    Boolean(manifest?.poseLoops?.includes(name)) || /loop|swim|cycle|undulat|glide/i.test(name)
  );
}

export function describeGuardianPoses(
  clipNames: readonly string[],
  manifest?: GuardianPoseManifest | null,
): GuardianPose[] {
  const seen = new Set<string>();
  const poses: GuardianPose[] = [];
  for (const name of clipNames) {
    if (seen.has(name) || isGuardianBreathClip(name)) continue;
    seen.add(name);
    poses.push({
      name,
      label: manifest?.poseLabels?.[name] ?? GUARDIAN_POSE_LABELS[name] ?? name,
      loop: isGuardianLoopClip(name, manifest),
    });
  }
  // Rest first, so the chooser opens on the default pose.
  poses.sort((a, b) => Number(/^rest$/i.test(b.name)) - Number(/^rest$/i.test(a.name)));
  return poses;
}

/** A chooser is only worth showing when there is somewhere to go. */
export function guardianPoseChooserVisible(poses: readonly GuardianPose[]) {
  return poses.length > 1;
}

/** Crossfade length derived from the manifest's transition, kept within a comfortable band. */
export function guardianPoseFadeSeconds(manifest?: GuardianPoseManifest | null) {
  const transition = manifest?.transitionSeconds;
  const base = typeof transition === "number" && transition > 0 ? transition * 0.75 : 1.2;
  return Math.round(Math.min(2, Math.max(0.6, base)) * 1000) / 1000;
}
