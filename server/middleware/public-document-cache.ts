import {
  cachePublicDocumentResponse,
  isPublicDocumentRequest,
  type PublicDocumentRequest,
} from "../lib/public-document-cache.ts";

/** Short-lived edge reuse for explicitly public SSR shells, never user data. */
export default async function publicDocumentCacheMiddleware(
  event: PublicDocumentRequest,
  next: () => unknown | Promise<unknown>,
): Promise<unknown> {
  const eligible = isPublicDocumentRequest(event);
  const result = await next();
  return eligible && result instanceof Response ? cachePublicDocumentResponse(result) : result;
}
