import { createFileRoute } from "@tanstack/react-router";
import { archiveAiJson, archiveAiStateResponse } from "@/lib/archive-ai-http.server";
import {
  attachArchiveAiIdentityCookie,
  resolveArchiveAiCookieIdentity,
} from "@/lib/archive-ai-identity.server";
import {
  continueArchiveAiRequestInBackground,
  startArchiveSearchAiRequest,
} from "@/lib/archive-ai-job.server";
import {
  ArchiveAiRequestConflictError,
  ArchiveAiRequestNotFoundError,
} from "@/lib/archive-ai-ledger.server";
import { logArchiveAiEvent } from "@/lib/archive-ai-observability.server";
import { archiveSearchRequestSchema } from "@/lib/archive-search.server";
import {
  ArchiveRequestTooLargeError,
  readArchiveRequestBody,
} from "@/lib/archive-request-body.server";
import { assertSameSiteRequest } from "@/lib/auth/isolation.server";
import { isAllowedArchiveBrowserRequest } from "@/lib/archive-api-origin.server";

const MAX_BODY_BYTES = 65_536;

export const Route = createFileRoute("/api/archive-search")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          assertSameSiteRequest();
        } catch {
          return archiveAiJson({ error: "forbidden" }, 403);
        }
        if (!isAllowedArchiveBrowserRequest(request, "search-v1")) {
          return archiveAiJson({ error: "forbidden" }, 403);
        }
        let cookieIdentity;
        try {
          cookieIdentity = resolveArchiveAiCookieIdentity(request);
        } catch {
          return archiveAiJson({ error: "shared_state_unavailable" }, 503);
        }
        const respond = (response: Response) =>
          attachArchiveAiIdentityCookie(response, cookieIdentity);
        let raw: unknown;
        try {
          raw = JSON.parse(await readArchiveRequestBody(request, MAX_BODY_BYTES)) as unknown;
        } catch (error) {
          return respond(
            archiveAiJson(
              {
                error:
                  error instanceof ArchiveRequestTooLargeError
                    ? "request_too_large"
                    : "invalid_json",
              },
              error instanceof ArchiveRequestTooLargeError ? 413 : 400,
            ),
          );
        }
        const parsed = archiveSearchRequestSchema.safeParse(raw);
        if (!parsed.success || !parsed.data.requestId) {
          return respond(archiveAiJson({ error: "invalid_request" }, 400));
        }
        try {
          const state = await startArchiveSearchAiRequest(
            request,
            parsed.data,
            cookieIdentity.rateLimitHash,
          );
          continueArchiveAiRequestInBackground(request, state, cookieIdentity.rateLimitHash);
          return respond(archiveAiStateResponse(state));
        } catch (error) {
          if (error instanceof ArchiveAiRequestConflictError) {
            return respond(archiveAiJson({ error: "request_id_conflict" }, 409));
          }
          if (error instanceof ArchiveAiRequestNotFoundError) {
            return respond(archiveAiJson({ error: "not_found" }, 404));
          }
          logArchiveAiEvent("request_admission_failed", {
            requestId: parsed.data.requestId,
            surface: "search",
            reason: error instanceof Error ? error.name : "unknown",
          });
          return respond(archiveAiJson({ error: "shared_state_unavailable" }, 503));
        }
      },
    },
  },
});
