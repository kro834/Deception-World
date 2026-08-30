/**
 * Requested Archive model aliases and the provider model IDs they are allowed
 * to resolve to. Keep this runtime-only module importable from both the browser
 * contract validator and the Node deployment verifier.
 */
export const ARCHIVE_PROVIDER_MODELS_BY_REQUEST = Object.freeze({
  // GPT-5.5 must resolve to the pinned provider snapshot. Accepting the alias
  // here would only prove that we echoed the requested model, not which
  // snapshot actually executed the request.
  "gpt-5.5": Object.freeze(["gpt-5.5-2026-04-23"]),
  "gpt-5.6-terra": Object.freeze(["gpt-5.6-terra"]),
  "gpt-5.6-luna": Object.freeze(["gpt-5.6-luna"]),
  "gpt-5.6-sol": Object.freeze(["gpt-5.6-sol"]),
});

/**
 * @param {string} requestedModel
 * @param {string} providerModel
 */
export function isAllowedArchiveProviderModel(requestedModel, providerModel) {
  return ARCHIVE_PROVIDER_MODELS_BY_REQUEST[requestedModel]?.includes(providerModel) ?? false;
}
