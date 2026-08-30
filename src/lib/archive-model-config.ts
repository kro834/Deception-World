export const ARCHIVE_SEARCH_MODELS = ["gpt-5.6-terra", "gpt-5.5"] as const;
export const ARCHIVE_SEARCH_EFFORTS = ["low", "medium", "high", "xhigh"] as const;
export const ARCHIVE_SEARCH_EXECUTIONS = ["standard", "pro"] as const;
export const ARCHIVE_PERSONA_PRO_PROFILES = ["instant", "max", "pro"] as const;

export type ArchiveSearchModel = (typeof ARCHIVE_SEARCH_MODELS)[number];
export type ArchiveSearchEffort = (typeof ARCHIVE_SEARCH_EFFORTS)[number];
export type ArchiveSearchExecution = (typeof ARCHIVE_SEARCH_EXECUTIONS)[number];
export type ArchivePersonaProProfile = (typeof ARCHIVE_PERSONA_PRO_PROFILES)[number];

export type ArchiveSearchPreference = {
  model: ArchiveSearchModel;
  effort: ArchiveSearchEffort;
  execution: ArchiveSearchExecution;
};

export type ArchiveModelPreferences = {
  search: ArchiveSearchPreference;
  personaProProfile: ArchivePersonaProProfile;
};

export const DEFAULT_ARCHIVE_MODEL_PREFERENCES: ArchiveModelPreferences = {
  search: {
    model: "gpt-5.6-terra",
    effort: "low",
    execution: "standard",
  },
  personaProProfile: "pro",
};

export const ARCHIVE_MIN_THINKING_MS = 180;

// GPT-5.5 is intentionally pinned. The UI and request ledger keep the stable
// logical model name while the provider receives this exact snapshot, so an
// upstream alias change cannot silently alter behavior or trip every
// Production model-attestation probe at once.
export const ARCHIVE_GPT55_PROVIDER_SNAPSHOT = "gpt-5.5-2026-04-23" as const;

export async function waitForArchiveThinkingFloor(
  startedAt: number,
  signal: AbortSignal,
): Promise<void> {
  const remaining = Math.max(0, ARCHIVE_MIN_THINKING_MS - (performance.now() - startedAt));
  if (!remaining || signal.aborted) return;
  await new Promise<void>((resolve) => {
    const cleanup = () => signal.removeEventListener("abort", onAbort);
    const onAbort = () => {
      clearTimeout(timer);
      cleanup();
      resolve();
    };
    const timer = setTimeout(() => {
      cleanup();
      resolve();
    }, remaining);
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

const isOneOf = <T extends string>(value: unknown, values: readonly T[]): value is T =>
  typeof value === "string" && values.includes(value as T);

export function normalizeArchiveSearchPreference(value: unknown): ArchiveSearchPreference {
  if (!value || typeof value !== "object") return DEFAULT_ARCHIVE_MODEL_PREFERENCES.search;
  const candidate = value as Partial<ArchiveSearchPreference>;
  const model = isOneOf(candidate.model, ARCHIVE_SEARCH_MODELS)
    ? candidate.model
    : DEFAULT_ARCHIVE_MODEL_PREFERENCES.search.model;
  const effort = isOneOf(candidate.effort, ARCHIVE_SEARCH_EFFORTS)
    ? candidate.effort
    : DEFAULT_ARCHIVE_MODEL_PREFERENCES.search.effort;
  const execution = isOneOf(candidate.execution, ARCHIVE_SEARCH_EXECUTIONS)
    ? candidate.execution
    : DEFAULT_ARCHIVE_MODEL_PREFERENCES.search.execution;

  // Pro mode is a GPT-5.6 capability. Invalid persisted combinations are
  // corrected locally and are validated again at the server boundary.
  return execution === "pro"
    ? { model: "gpt-5.6-terra", effort: "xhigh", execution }
    : { model, effort, execution };
}

export function normalizeArchiveModelPreferences(value: unknown): ArchiveModelPreferences {
  if (!value || typeof value !== "object") return DEFAULT_ARCHIVE_MODEL_PREFERENCES;
  const candidate = value as Partial<ArchiveModelPreferences>;
  return {
    search: normalizeArchiveSearchPreference(candidate.search),
    personaProProfile: isOneOf(candidate.personaProProfile, ARCHIVE_PERSONA_PRO_PROFILES)
      ? candidate.personaProProfile
      : DEFAULT_ARCHIVE_MODEL_PREFERENCES.personaProProfile,
  };
}

export const ARCHIVE_RUNTIME_MODEL_LABEL = "Grok 4.20";

export function archiveEffortName(effort: ArchiveSearchEffort): string {
  return effort.toUpperCase();
}

export function archiveSearchModelName(_model: ArchiveSearchModel): string {
  return ARCHIVE_RUNTIME_MODEL_LABEL;
}

export function archiveSearchPreferenceLabel(_preference: ArchiveSearchPreference): string {
  return ARCHIVE_RUNTIME_MODEL_LABEL;
}

export function archivePersonaProfileLabel(_profile: ArchivePersonaProProfile): string {
  return ARCHIVE_RUNTIME_MODEL_LABEL;
}

export type ArchiveAiCostClass = "standard" | "advanced" | "pro";

const ARCHIVE_SEARCH_STANDARD_RUNTIME: Record<
  ArchiveSearchEffort,
  { maxOutputTokens: number; timeoutMs: number }
> = {
  low: { maxOutputTokens: 2_400, timeoutMs: 20_000 },
  medium: { maxOutputTokens: 3_200, timeoutMs: 22_000 },
  high: { maxOutputTokens: 4_000, timeoutMs: 25_000 },
  xhigh: { maxOutputTokens: 4_800, timeoutMs: 28_000 },
};

export function resolveArchiveSearchRoute(value: ArchiveSearchPreference) {
  const preference = normalizeArchiveSearchPreference(value);
  const pro = preference.execution === "pro";
  const runtime = ARCHIVE_SEARCH_STANDARD_RUNTIME[preference.effort];
  const costClass: ArchiveAiCostClass = pro
    ? "pro"
    : preference.model === "gpt-5.5" ||
        preference.effort === "high" ||
        preference.effort === "xhigh"
      ? "advanced"
      : "standard";
  return {
    preference,
    requestedModel: preference.model,
    model:
      preference.model === "gpt-5.5" ? ARCHIVE_GPT55_PROVIDER_SNAPSHOT : preference.model,
    reasoning: pro
      ? ({ effort: "xhigh", mode: "pro", context: "current_turn" } as const)
      : ({ effort: preference.effort, context: "current_turn" } as const),
    maxOutputTokens: pro ? 4_800 : runtime.maxOutputTokens,
    timeoutMs: pro ? 28_000 : runtime.timeoutMs,
    verbosity: pro ? ("medium" as const) : ("low" as const),
    costClass,
  };
}

export function resolveArchivePersonaProRoute(profile: ArchivePersonaProProfile) {
  if (profile === "instant") {
    return {
      model: "gpt-5.6-sol" as const,
      reasoning: { effort: "none", context: "current_turn" } as const,
      maxOutputTokens: 3600,
      timeoutMs: 20_000,
      costClass: "standard" as const,
    };
  }
  if (profile === "max") {
    return {
      model: "gpt-5.6-sol" as const,
      reasoning: { effort: "max", context: "current_turn" } as const,
      maxOutputTokens: 14_000,
      timeoutMs: 28_000,
      costClass: "advanced" as const,
    };
  }
  return {
    model: "gpt-5.6-sol" as const,
    reasoning: { effort: "max", mode: "pro", context: "current_turn" } as const,
    maxOutputTokens: 14_000,
    timeoutMs: 28_000,
    costClass: "pro" as const,
  };
}

export function resolveArchivePersonaRoute(
  mode: "normal" | "pro",
  profile: ArchivePersonaProProfile,
) {
  if (mode === "normal") {
    return {
      model: "gpt-5.6-luna" as const,
      reasoning: { effort: "low", context: "current_turn" } as const,
      maxOutputTokens: 3600,
      timeoutMs: 20_000,
      costClass: "standard" as const,
    };
  }
  return resolveArchivePersonaProRoute(profile);
}

export function archivePersonaCostClass(
  mode: "normal" | "pro",
  profile: ArchivePersonaProProfile,
): ArchiveAiCostClass {
  return resolveArchivePersonaRoute(mode, profile).costClass;
}
