import { archiveDeploymentSha } from "./archive-ai-observability.server.ts";
import type { ArchiveAiWireState } from "./archive-ai-job.server.ts";

export function archiveAiJson(payload: unknown, status = 200): Response {
  return Response.json(payload, {
    status,
    headers: {
      "cache-control": "no-store, max-age=0",
      "x-content-type-options": "nosniff",
      "x-archive-deployment-sha": archiveDeploymentSha(),
    },
  });
}

export function archiveAiStateResponse(state: ArchiveAiWireState): Response {
  const pending =
    state.state === "queued" || state.state === "running" || state.state === "unknown";
  return archiveAiJson(state, state.state === "expired" ? 410 : pending ? 202 : 200);
}
