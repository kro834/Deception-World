export const ULTRA_BLOCKING_ATTRIBUTES: readonly string[];
export function isUltraSceneBlocked(doc: Document): boolean;
export function watchUltraSceneVisibility(
  notify: (blocked: boolean) => void,
  doc?: Document,
): () => void;
