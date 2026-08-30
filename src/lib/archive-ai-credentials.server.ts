export const ARCHIVE_GROK_FAST = "grok-4.20-0309-non-reasoning";
export const ARCHIVE_GROK_DEEP = "grok-4.20-0309-reasoning";

function envValue(environment: NodeJS.ProcessEnv, name: string): string {
  return environment[name]?.trim() ?? "";
}

export function archiveAiApiKey(environment: NodeJS.ProcessEnv = process.env): string {
  return envValue(environment, "XAI_API_KEY") || envValue(environment, "OPENAI_API_KEY");
}

export function archiveAiUsesXai(environment: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(envValue(environment, "XAI_API_KEY"));
}

export function archiveAiBaseUrl(environment: NodeJS.ProcessEnv = process.env): string {
  return archiveAiUsesXai(environment) ? "https://api.x.ai/v1" : "https://api.openai.com/v1";
}

export function archiveAiProviderModel(
  requestedModel: string,
  environment: NodeJS.ProcessEnv = process.env,
): string {
  if (!archiveAiUsesXai(environment)) {
    return requestedModel === "gpt-5.5" ? "gpt-5.5-2026-04-23" : requestedModel;
  }
  if (requestedModel === "gpt-5.6-sol") return ARCHIVE_GROK_DEEP;
  return ARCHIVE_GROK_FAST;
}
