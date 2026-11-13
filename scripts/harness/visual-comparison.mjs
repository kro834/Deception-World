import { join, basename } from "node:path";
import sharp from "sharp";
import { compareConditions } from "./comparison-conditions.mjs";

// A changed pixel is any RGBA channel difference. MAE is per channel, 0..255.
// Dynamic content makes all comparisons advisory; none is a pass/fail gate.
export async function compareScreenshots(probe, probeOutput) {
  const groups = new Map();
  for (const run of probe?.runs ?? []) {
    if (run.status !== "passed" || !["baseline", "candidate"].includes(run.side)) continue;
    const key = JSON.stringify([run.engine, run.profile, run.route, run.sample]);
    if (!groups.has(key))
      groups.set(key, {
        engine: run.engine,
        profile: run.profile,
        route: run.route,
        sample: run.sample,
      });
    groups.get(key)[run.side] = run;
  }
  const results = [];
  const resolveImage = (file) => {
    if (
      typeof file !== "string" ||
      !file ||
      basename(file) !== file ||
      file === "." ||
      file === ".."
    )
      throw new Error("Invalid screenshot filename");
    return join(probeOutput, file);
  };
  for (const group of groups.values()) {
    const baselineScenes = new Map(
      (group.baseline?.sceneScreenshots ?? []).map((scene) => [scene.progress, scene.screenshot]),
    );
    const candidateScenes = new Map(
      (group.candidate?.sceneScreenshots ?? []).map((scene) => [scene.progress, scene.screenshot]),
    );
    const captures = [
      {
        scene: "hero",
        progress: null,
        baseline: group.baseline?.screenshot,
        candidate: group.candidate?.screenshot,
      },
    ];
    const progressValues = [...new Set([...baselineScenes.keys(), ...candidateScenes.keys()])].sort(
      (a, b) => a - b,
    );
    for (const progress of progressValues)
      captures.push({
        scene: "transformation",
        progress,
        baseline: baselineScenes.get(progress),
        candidate: candidateScenes.get(progress),
      });
    for (const capture of captures) {
      const result = {
        engine: group.engine,
        profile: group.profile,
        route: group.route,
        sample: group.sample,
        ...capture,
        assessment: "advisory",
        status: "not-comparable",
        diffRatio: null,
        meanAbsError: null,
        diffScreenshot: null,
      };
      results.push(result);
      if (!capture.baseline || !capture.candidate) {
        result.reason = "A baseline or candidate screenshot is missing";
        continue;
      }
      result.conditions = compareConditions(group.baseline, group.candidate);
      if (result.conditions.status !== "matched") {
        result.reason = result.conditions.reason;
        continue;
      }
      try {
        const [a, b] = await Promise.all(
          [capture.baseline, capture.candidate].map((file) =>
            sharp(resolveImage(file))
              .toColourspace("srgb")
              .ensureAlpha()
              .raw()
              .toBuffer({ resolveWithObject: true }),
          ),
        );
        result.baselineDimensions = { width: a.info.width, height: a.info.height };
        result.candidateDimensions = { width: b.info.width, height: b.info.height };
        if (a.info.width !== b.info.width || a.info.height !== b.info.height) {
          result.status = "dimension-mismatch";
          result.reason = "Screenshot dimensions differ";
          continue;
        }
        const pixels = a.info.width * a.info.height;
        const diff = Buffer.alloc(pixels * 4);
        let changed = 0;
        let sum = 0;
        for (let offset = 0; offset < diff.length; offset += 4) {
          let pixelChanged = false;
          for (let channel = 0; channel < 4; channel++) {
            const delta = Math.abs(a.data[offset + channel] - b.data[offset + channel]);
            sum += delta;
            pixelChanged ||= delta !== 0;
            if (channel < 3) diff[offset + channel] = delta;
            else if (delta) diff[offset] = Math.max(diff[offset], delta);
          }
          diff[offset + 3] = 255;
          if (pixelChanged) changed++;
        }
        result.diffRatio = changed / pixels;
        result.meanAbsError = sum / (pixels * 4);
        const file = `visual-diff-${String(results.length).padStart(4, "0")}.png`;
        await sharp(diff, { raw: { width: a.info.width, height: a.info.height, channels: 4 } })
          .png()
          .toFile(join(probeOutput, file));
        result.diffScreenshot = file;
        result.status = "compared";
      } catch (error) {
        result.status = "error";
        result.reason = String(error);
      }
    }
  }
  return results;
}
