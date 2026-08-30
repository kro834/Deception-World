/**
 * Requested Archive model aliases and the provider model IDs they are allowed
 * to resolve to. Keep this runtime-only module importable from both the browser
 * contract validator and the Node deployment verifier.
 */
export const ARCHIVE_PROVIDER_MODELS_BY_REQUEST = Object.freeze({
  "gpt-5.5": Object.freeze([
    "gpt-5.5-2026-04-23",
    "grok-4.20-0309-non-reasoning",
    "grok-4.20-0309-reasoning",
  ]),
  "gpt-5.6-terra": Object.freeze([
    "gpt-5.6-terra",
    "grok-4.20-0309-non-reasoning",
    "grok-4.20-0309-reasoning",
  ]),
  "gpt-5.6-luna": Object.freeze([
    "gpt-5.6-luna",
    "grok-4.20-0309-non-reasoning",
    "grok-4.20-0309-reasoning",
  ]),
  "gpt-5.6-sol": Object.freeze([
    "gpt-5.6-sol",
    "grok-4.20-0309-non-reasoning",
    "grok-4.20-0309-reasoning",
  ]),
});


/**
 * @param {string} requestedModel
 * @param {string} providerModel
 */
export function isAllowedArchiveProviderModel(requestedModel, providerModel) {
  if (!Object.hasOwn(ARCHIVE_PROVIDER_MODELS_BY_REQUEST, requestedModel)) return false;
  return ARCHIVE_PROVIDER_MODELS_BY_REQUEST[requestedModel].includes(providerModel);
}

/**
 * @param {unknown} requestedModel
 */
export function isArchiveRequestedModel(requestedModel) {
  return (
    typeof requestedModel === "string" &&
    Object.hasOwn(ARCHIVE_PROVIDER_MODELS_BY_REQUEST, requestedModel)
  );
}
