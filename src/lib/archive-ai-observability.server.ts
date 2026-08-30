export function archiveDeploymentSha(environment: NodeJS.ProcessEnv = process.env): string {
  return (
    environment.VERCEL_GIT_COMMIT_SHA?.trim() ||
    environment.ARCHIVE_DEPLOYMENT_SHA?.trim() ||
    "development"
  );
}

function isSensitiveArchiveLogField(key: string): boolean {
  const normalized = key.replace(/[^a-z0-9]/giu, "").toLowerCase();
  return (
    /(?:prompt|input|output|message|query|answer|reply|content|body)/u.test(normalized) ||
    normalized === "ip" ||
    normalized === "rawip" ||
    normalized.endsWith("ipaddress")
  );
}

export function logArchiveAiEvent(
  event: string,
  fields: Record<string, string | number | boolean | null | undefined>,
): void {
  const safeFields = Object.fromEntries(
    Object.entries(fields).filter(
      ([key]) =>
        !isSensitiveArchiveLogField(key) &&
        !/^(?:scope|event|at|commitSha|deploymentUrl|region)$/u.test(key),
    ),
  );
  const entry = {
    scope: "archive-ai",
    event,
    at: new Date().toISOString(),
    commitSha: archiveDeploymentSha(),
    deploymentUrl: process.env.VERCEL_URL?.trim() || "local",
    region: process.env.VERCEL_REGION?.trim() || "local",
    ...safeFields,
  };
  console.log(JSON.stringify(entry));
}
