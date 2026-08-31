import { useEffect } from "react";

const LEGACY_AI_STORAGE_KEYS = [
  "archive-ai-pending-v1",
  "archive-ai-session-v1",
  "deception-world:archive-ai-health:v1",
  "deception-world:archive-models:v2",
] as const;

/**
 * Removes browser data left by the retired chat feature. This deliberately
 * runs on every visit for one release cycle so devices that skipped an
 * intermediate deployment are cleaned as soon as they return.
 */
export function LegacyDataRetirement() {
  useEffect(() => {
    for (const key of LEGACY_AI_STORAGE_KEYS) {
      try {
        window.localStorage.removeItem(key);
      } catch {
        // Storage can be unavailable in private browsing.
      }
      try {
        window.sessionStorage.removeItem(key);
      } catch {
        // Storage can be unavailable in private browsing.
      }
    }

    try {
      window.indexedDB?.deleteDatabase("deception-world-ai");
    } catch {
      // An unavailable or already-removed database requires no recovery.
    }
  }, []);

  return null;
}
