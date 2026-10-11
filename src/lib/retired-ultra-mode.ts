/** Retire only the removed graphics setting; personal gallery choices stay intact.
 * Runs before paint, with no observers, renderer imports, or preference reads.
 * Storage can be unavailable in private/embedded browsers: markup cleanup still
 * completes and the normal interface remains usable.
 */
export const RETIRED_ULTRA_STORAGE_KEYS = ["dw-ultra-mode-v1", "dw-ultra-quality-v1"] as const;
const RETIRED_ULTRA_ATTRIBUTES = [
  "data-ultra-mode",
  "data-ultra-motion",
  "data-ultra-quality",
  "data-ultra-paused",
  "data-ultra-renderer",
] as const;

export const RETIRED_ULTRA_MODE_SCRIPT = `(function(){var r=document.documentElement;${RETIRED_ULTRA_ATTRIBUTES.map((attribute) => `r.removeAttribute(${JSON.stringify(attribute)});`).join("")}${RETIRED_ULTRA_STORAGE_KEYS.map((key) => `try{window.localStorage.removeItem(${JSON.stringify(key)});}catch(_){}`).join("")}})();`;
