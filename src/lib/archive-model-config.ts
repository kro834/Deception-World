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

export const ARCHIVE_MIN_THINKING_MS = 2400;

export async function waitForArchiveThinkingFloor(
  startedAt: number,
  signal: AbortSignal,
): Promise<void> {
  const remaining = Math.max(0, ARCHIVE_MIN_THINKING_MS - (performance.now() - startedAt));
  if (!remaining || signal.aborted) return;
  await new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, remaining);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
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

export function archiveSearchModelName(model: ArchiveSearchModel): string {
  return model === "gpt-5.6-terra" ? "GPT-5.6 TERRA" : "GPT-5.5";
}

export function archiveEffortName(effort: ArchiveSearchEffort): string {
  return effort.toUpperCase();
}

export function archiveSearchPreferenceLabel(preference: ArchiveSearchPreference): string {
  if (preference.execution === "pro") return "5.6 TERRA PRO";
  return `${preference.model === "gpt-5.6-terra" ? "5.6 TERRA" : "5.5"} ${archiveEffortName(preference.effort)}`;
}

export function archivePersonaProfileLabel(profile: ArchivePersonaProProfile): string {
  if (profile === "instant") return "5.6 SOL INSTANT";
  if (profile === "max") return "5.6 SOL MAX";
  return "5.6 SOL PRO";
}

export type ArchiveAiCostClass = "standard" | "advanced" | "pro";

export function resolveArchiveSearchRoute(value: ArchiveSearchPreference) {
  const preference = normalizeArchiveSearchPreference(value);
  const pro = preference.execution === "pro";
  const costClass: ArchiveAiCostClass = pro
    ? "pro"
    : preference.model === "gpt-5.5" ||
        preference.effort === "high" ||
        preference.effort === "xhigh"
      ? "advanced"
      : "standard";
  return {
    preference,
    model: preference.model,
    reasoning: pro
      ? ({ effort: "xhigh", mode: "pro", context: "current_turn" } as const)
      : ({ effort: preference.effort, context: "current_turn" } as const),
    maxOutputTokens: pro ? 10_000 : 3600,
    timeoutMs: pro ? 110_000 : 60_000,
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
      timeoutMs: 45_000,
      costClass: "standard" as const,
    };
  }
  if (profile === "max") {
    return {
      model: "gpt-5.6-sol" as const,
      reasoning: { effort: "max", context: "current_turn" } as const,
      maxOutputTokens: 12_000,
      timeoutMs: 110_000,
      costClass: "advanced" as const,
    };
  }
  return {
    model: "gpt-5.6-sol" as const,
    reasoning: { effort: "max", mode: "pro", context: "current_turn" } as const,
    maxOutputTokens: 12_000,
    timeoutMs: 110_000,
    costClass: "pro" as const,
  };
}

export function archivePersonaCostClass(
  mode: "normal" | "pro",
  profile: ArchivePersonaProProfile,
): ArchiveAiCostClass {
  return mode === "normal" ? "standard" : resolveArchivePersonaProRoute(profile).costClass;
}
