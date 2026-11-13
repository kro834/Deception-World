// Passed directly to page.evaluate: observe application state without overrides.
export function observeBrowserConditions() {
  const choice = (value) => {
    if (value === "high" || value === "lightweight") return { quality: value, revision: 0 };
    if (typeof value === "string") {
      try {
        return choice(JSON.parse(value));
      } catch {
        return null;
      }
    }
    if (
      value &&
      typeof value === "object" &&
      (value.quality === "high" || value.quality === "lightweight") &&
      Number.isFinite(value.revision)
    ) {
      return { quality: value.quality, revision: value.revision };
    }
    return null;
  };
  let storageChoice = null,
    historyChoice = null;
  let storageReadable = true,
    historyReadable = true;
  try {
    storageChoice = choice(localStorage.getItem("deception-world:render-quality:v1"));
  } catch {
    storageReadable = false;
  }
  try {
    historyChoice = choice(history.state?.deceptionWorldRenderQualityV1);
  } catch {
    historyReadable = false;
  }
  const saved =
    historyChoice && (!storageChoice || historyChoice.revision > storageChoice.revision)
      ? historyChoice
      : storageChoice;
  return {
    worldEffects: document.documentElement.getAttribute("data-world-effects"),
    storageChoice,
    historyChoice,
    savedRenderQuality: saved?.quality ?? null,
    storageReadable,
    historyReadable,
    devicePixelRatio: window.devicePixelRatio,
    reducedMotion: matchMedia("(prefers-reduced-motion: reduce)").matches,
  };
}

const fields = ["worldEffects", "savedRenderQuality", "devicePixelRatio", "reducedMotion"];
function valid(value) {
  return (
    value &&
    value.storageReadable === true &&
    value.historyReadable === true &&
    fields.every((field) => Object.hasOwn(value, field)) &&
    Number.isFinite(value.devicePixelRatio) &&
    value.devicePixelRatio > 0 &&
    typeof value.reducedMotion === "boolean"
  );
}

// Equal observations do not prove equal rendering implementation or GPU quality.
export function compareConditions(baseline, candidate) {
  if (!baseline || !candidate)
    return { status: "not-comparable", reason: "A comparison side is missing" };
  const a = baseline.conditions,
    b = candidate.conditions;
  const ae = baseline.conditionsAfter,
    be = candidate.conditionsAfter;
  if (![a, b, ae, be].every(valid))
    return {
      status: "not-comparable",
      reason: "Observed rendering conditions are missing or unreadable",
    };
  const unstable = fields.filter((field) => a[field] !== ae[field] || b[field] !== be[field]);
  if (unstable.length)
    return {
      status: "not-comparable",
      reason: `Rendering conditions changed during observation: ${unstable.join(", ")}`,
    };
  const differences = fields.filter((field) => a[field] !== b[field]);
  if (differences.length)
    return {
      status: "not-comparable",
      reason: `Observed rendering conditions differ: ${differences.join(", ")}`,
    };
  return {
    status: "matched",
    reason: "Observed conditions match; rendering quality equivalence is not established",
  };
}

export function assessProbeConditions(probe) {
  const groups = new Map();
  for (const run of probe?.runs ?? []) {
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
  const pairs = [...groups.values()].map(({ baseline, candidate, ...identity }) => ({
    ...identity,
    ...compareConditions(baseline, candidate),
  }));
  const reasons = [
    ...new Set(pairs.filter((pair) => pair.status !== "matched").map((pair) => pair.reason)),
  ];
  if (!pairs.length) reasons.push("No paired browser observations were recorded");
  return { status: reasons.length ? "not-comparable" : "matched", reasons, pairs };
}

export function assertRequiredComparison(options, assessment) {
  if (options.mode !== "compare" || options["no-browser"] || options["reuse-build"]) return;
  if (assessment?.status !== "matched")
    throw new Error(
      `Required comparison conditions were not verified: ${(assessment?.reasons ?? ["Comparison evidence is missing"]).join("; ")}`,
    );
}
