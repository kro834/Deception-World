import { createFileRoute } from "@tanstack/react-router";
import { checkArchiveAiAccess } from "@/lib/archive-ai-rate-limit.server";
import {
  archiveSearchRequestSchema,
  requestOpenAiArchiveSearch,
} from "@/lib/archive-search.server";
import { createLocalArchiveSearchReply } from "@/lib/archive-search";
import { canonicalizeArchiveSearchCandidates } from "@/lib/archive-search-catalog.server";
import {
  ArchiveRequestTooLargeError,
  readArchiveRequestBody,
} from "@/lib/archive-request-body.server";
import { assertSameSiteRequest } from "@/lib/auth/isolation.server";
import { resolveArchiveSearchRoute } from "@/lib/archive-model-config";
import { archiveProviderFailureReason } from "@/lib/archive-openai-transport.server";

// Search Pro keeps a longer Japanese transcript. The schema still owns the
// strict character budget; this byte ceiling only prevents valid UTF-8 input
// from being rejected before validation.
const MAX_BODY_BYTES = 65_536;

function noStoreJson(payload: unknown, status = 200): Response {
  return Response.json(payload, {
    status,
    headers: {
      "cache-control": "no-store, max-age=0",
      "x-content-type-options": "nosniff",
    },
  });
}

function isAllowedBrowserRequest(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin || request.headers.get("x-archive-client") !== "search-v1") return false;
  try {
    if (new URL(origin).origin !== new URL(request.url).origin) return false;
    const fetchSite = request.headers.get("sec-fetch-site");
    return !fetchSite || fetchSite === "same-origin";
  } catch {
    return false;
  }
}

export const Route = createFileRoute("/api/archive-search")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          assertSameSiteRequest();
        } catch {
          return noStoreJson({ error: "forbidden" }, 403);
        }
        if (!isAllowedBrowserRequest(request)) return noStoreJson({ error: "forbidden" }, 403);

        let raw: unknown;
        try {
          const body = await readArchiveRequestBody(request, MAX_BODY_BYTES);
          raw = JSON.parse(body) as unknown;
        } catch (error) {
          if (error instanceof ArchiveRequestTooLargeError) {
            return noStoreJson({ error: "request_too_large" }, 413);
          }
          return noStoreJson({ error: "invalid_json" }, 400);
        }

        const parsed = archiveSearchRequestSchema.safeParse(raw);
        if (!parsed.success) return noStoreJson({ error: "invalid_request" }, 400);
        const { query, messages, modelPreference } = parsed.data;
        const candidates = canonicalizeArchiveSearchCandidates(parsed.data.candidates);
        const remoteAccess = await checkArchiveAiAccess(
          request,
          resolveArchiveSearchRoute(modelPreference).costClass,
        );

        if (!remoteAccess.allowed) {
          const notice =
            remoteAccess.reason === "unconfigured"
              ? "AI接続が未設定のため、ローカルサーチで案内しています。"
              : "AI回線が混み合っているため、ローカルサーチで案内しています。";
          return noStoreJson(
            createLocalArchiveSearchReply({
              query,
              candidates,
              notice,
              deliveryReason:
                remoteAccess.reason === "unconfigured"
                  ? "unconfigured"
                  : remoteAccess.reason === "shared_limit_unavailable"
                    ? "shared_limit_unavailable"
                    : "rate_limited",
            }),
          );
        }

        try {
          const remoteReply = await requestOpenAiArchiveSearch({
            messages,
            candidates,
            modelPreference,
            safetyIdentifier: remoteAccess.safetyIdentifier,
            signal: request.signal,
          });
          if (remoteReply) return noStoreJson(remoteReply);
        } catch (error) {
          return noStoreJson(
            createLocalArchiveSearchReply({
              query,
              candidates,
              notice: "AI回線へ接続できなかったため、ローカルサーチへ切り替えました。",
              deliveryReason: archiveProviderFailureReason(error),
            }),
          );
        }

        return noStoreJson(
          createLocalArchiveSearchReply({
            query,
            candidates,
            notice: "AI回線へ接続できなかったため、ローカルサーチへ切り替えました。",
            deliveryReason: "provider_unavailable",
          }),
        );
      },
    },
  },
});
