import { createFileRoute } from "@tanstack/react-router";
import { waitUntil } from "@vercel/functions";
import { archiveAiJson, archiveAiStateResponse } from "@/lib/archive-ai-http.server";
import {
  attachArchiveAiIdentityCookie,
  resolveArchiveAiCookieIdentity,
} from "@/lib/archive-ai-identity.server";
import { resumeArchiveAiRequest } from "@/lib/archive-ai-job.server";
import {
  ArchiveAiRequestNotFoundError,
  archiveAiRequestState,
  cancelArchiveAiRequest,
  getArchiveAiRequest,
} from "@/lib/archive-ai-ledger.server";
import { readArchiveRequestIdentity } from "@/lib/archive-ai-crypto.server";
import { archiveAiApiKey } from "@/lib/archive-ai-credentials.server";
import { logArchiveAiEvent } from "@/lib/archive-ai-observability.server";
import { cancelOpenAiBackgroundResponse } from "@/lib/archive-openai-transport.server";
import { assertSameSiteRequest } from "@/lib/auth/isolation.server";
import {
  isAllowedArchiveBrowserRequest,
  type ArchiveBrowserClient,
} from "@/lib/archive-api-origin.server";

function allowedStatusRequest(request: Request): boolean {
  const client = request.headers.get("x-archive-client") as ArchiveBrowserClient | null;
  return (
    (client === "search-v1" || client === "persona-v1") &&
    isAllowedArchiveBrowserRequest(request, client)
  );
}

function hiddenNotFound(): Response {
  return archiveAiJson({ error: "not_found" }, 404);
}

export const Route = createFileRoute("/api/archive-ai/requests/$requestId")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        try {
          assertSameSiteRequest();
        } catch {
          return archiveAiJson({ error: "forbidden" }, 403);
        }
        if (!allowedStatusRequest(request)) return archiveAiJson({ error: "forbidden" }, 403);
        let cookieIdentity;
        try {
          cookieIdentity = resolveArchiveAiCookieIdentity(request);
        } catch {
          return archiveAiJson({ error: "shared_state_unavailable" }, 503);
        }
        const respond = (response: Response) =>
          attachArchiveAiIdentityCookie(response, cookieIdentity);
        const requestId = params.requestId.toLowerCase();
        if (!ARCHIVE_AI_REQUEST_ID_PATTERN.test(requestId)) return respond(hiddenNotFound());
        try {
          return respond(
            archiveAiStateResponse(
              await resumeArchiveAiRequest(request, requestId, cookieIdentity.rateLimitHash),
            ),
          );
        } catch (error) {
          if (error instanceof ArchiveAiRequestNotFoundError) return respond(hiddenNotFound());
          return respond(archiveAiJson({ error: "shared_state_unavailable" }, 503));
        }
      },
      DELETE: async ({ request, params }) => {
        try {
          assertSameSiteRequest();
        } catch {
          return archiveAiJson({ error: "forbidden" }, 403);
        }
        if (!allowedStatusRequest(request)) return archiveAiJson({ error: "forbidden" }, 403);
        let cookieIdentity;
        try {
          cookieIdentity = resolveArchiveAiCookieIdentity(request);
        } catch {
          return archiveAiJson({ error: "shared_state_unavailable" }, 503);
        }
        const respond = (response: Response) =>
          attachArchiveAiIdentityCookie(response, cookieIdentity);
        const requestId = params.requestId.toLowerCase();
        if (!ARCHIVE_AI_REQUEST_ID_PATTERN.test(requestId)) return respond(hiddenNotFound());
        try {
          const identity = readArchiveRequestIdentity(request);
          if (identity.requestId !== requestId) return hiddenNotFound();
          const existing = await getArchiveAiRequest(requestId, identity.sessionHashes);
          await cancelArchiveAiRequest(requestId, existing.session_hash);
          const apiKey = archiveAiApiKey();
          if (
            apiKey &&
            existing.provider_response_id &&
            (existing.state === "queued" ||
              existing.state === "running" ||
              existing.state === "unknown")
          ) {
            const providerCancellation = cancelOpenAiBackgroundResponse({
              apiKey,
              responseId: existing.provider_response_id,
              logicalRequestId: requestId,
              attemptOffset: 90,
            }).catch((error) => {
              logArchiveAiEvent("provider_cancel_failed", {
                requestId,
                surface: existing.surface,
                requestedModel: existing.requested_model,
                providerModel: existing.provider_model,
                providerResponseId: existing.provider_response_id,
                reason: error instanceof Error ? error.name : "unknown",
              });
            });
            if (process.env.VERCEL) waitUntil(providerCancellation);
          }
          return respond(
            archiveAiStateResponse(
              archiveAiRequestState(await getArchiveAiRequest(requestId, existing.session_hash)),
            ),
          );
        } catch (error) {
          return error instanceof ArchiveAiRequestNotFoundError
            ? respond(hiddenNotFound())
            : respond(archiveAiJson({ error: "unavailable" }, 503));
        }
      },
    },
  },
});
