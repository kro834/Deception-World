import { createFileRoute } from "@tanstack/react-router";
import { archiveSecretsEqual } from "@/lib/archive-ai-crypto.server";
import { archiveAiJson } from "@/lib/archive-ai-http.server";
import { cleanupArchiveAiRequests } from "@/lib/archive-ai-ledger.server";
import { archiveDeploymentSha } from "@/lib/archive-ai-observability.server";
import { recoverArchiveAiPendingRequests } from "@/lib/archive-ai-recovery.server";

function authorized(request: Request): boolean {
  const configured = process.env.ARCHIVE_MONITOR_TOKEN?.trim() ?? "";
  const supplied =
    request.headers
      .get("authorization")
      ?.replace(/^Bearer\s+/iu, "")
      .trim() ?? "";
  return (
    configured.length >= 32 && supplied.length >= 32 && archiveSecretsEqual(configured, supplied)
  );
}

export const Route = createFileRoute("/api/internal/archive-ai-maintenance")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!authorized(request)) return archiveAiJson({ error: "not_found" }, 404);
        try {
          const cleaned = await cleanupArchiveAiRequests();
          const recovery = await recoverArchiveAiPendingRequests(request);
          return archiveAiJson(
            {
              contractVersion: 1,
              cleaned,
              recovery,
              deploymentSha: archiveDeploymentSha(),
            },
            recovery.errors > 0 ? 503 : 200,
          );
        } catch {
          return archiveAiJson({ error: "database_unavailable" }, 503);
        }
      },
    },
  },
});
