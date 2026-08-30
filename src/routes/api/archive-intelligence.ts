import { createFileRoute } from "@tanstack/react-router";
import {
  archiveIntelligenceRequestSchema,
  requestOpenAiArchiveReply,
} from "@/lib/archive-intelligence.server";
import { checkArchiveAiAccess } from "@/lib/archive-ai-rate-limit.server";
import {
  ArchiveRequestTooLargeError,
  readArchiveRequestBody,
} from "@/lib/archive-request-body.server";
import { assertSameSiteRequest } from "@/lib/auth/isolation.server";
import { createLocalArchiveReply } from "@/lib/archive-roleplay-fallback";
import { archivePersonaCostClass } from "@/lib/archive-model-config";
import { archiveProviderFailureReason } from "@/lib/archive-openai-transport.server";

// The character limits below are measured in Unicode code units. Reserve
// enough UTF-8 space for a full Japanese conversation plus its JSON envelope.
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
  if (!origin || request.headers.get("x-archive-client") !== "persona-v1") return false;
  try {
    if (new URL(origin).origin !== new URL(request.url).origin) return false;
    const fetchSite = request.headers.get("sec-fetch-site");
    return !fetchSite || fetchSite === "same-origin";
  } catch {
    return false;
  }
}

export const Route = createFileRoute("/api/archive-intelligence")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          assertSameSiteRequest();
        } catch {
          return noStoreJson({ error: "forbidden" }, 403);
        }
        if (!isAllowedBrowserRequest(request)) {
          return noStoreJson({ error: "forbidden" }, 403);
        }

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

        const parsed = archiveIntelligenceRequestSchema.safeParse(raw);
        if (!parsed.success) return noStoreJson({ error: "invalid_request" }, 400);

        const { characterId, mode, proProfile, messages } = parsed.data;
        const latestMessage = messages.at(-1)?.content ?? "";
        const costClass = archivePersonaCostClass(mode, proProfile);
        const remoteAccess = await checkArchiveAiAccess(request, costClass);

        if (!remoteAccess.allowed) {
          const notice =
            remoteAccess.reason === "unconfigured"
              ? "AI接続が未設定のため、ローカル人格コアで応答しています。"
              : remoteAccess.reason === "shared_limit_unavailable"
                ? "安全な利用上限を確認できないため、ローカル人格コアで応答しています。"
                : "接続集中を避けるため、今回はローカル人格コアで応答しました。";
          return noStoreJson(
            createLocalArchiveReply({
              characterId,
              mode,
              message: latestMessage,
              messages,
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
          const remoteReply = await requestOpenAiArchiveReply({
            characterId,
            mode,
            proProfile,
            messages,
            safetyIdentifier: remoteAccess.safetyIdentifier,
            signal: request.signal,
          });
          if (remoteReply) return noStoreJson(remoteReply);
          return noStoreJson(
            createLocalArchiveReply({
              characterId,
              mode,
              message: latestMessage,
              messages,
              notice: "AI接続を利用できないため、ローカル人格コアで応答しています。",
              deliveryReason: "provider_unavailable",
            }),
          );
        } catch (error) {
          return noStoreJson(
            createLocalArchiveReply({
              characterId,
              mode,
              message: latestMessage,
              messages,
              notice: "AI接続を一時的に利用できないため、ローカル人格コアへ切り替えました。",
              deliveryReason: archiveProviderFailureReason(error),
            }),
          );
        }
      },
    },
  },
});
