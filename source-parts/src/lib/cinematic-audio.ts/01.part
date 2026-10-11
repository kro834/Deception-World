/**
 * Retired sound adapter for legacy callers only.
 *
 * The opening has no sound controls or imports of this module. Keeping these
 * inert methods temporarily makes stale callers harmless: no browser APIs,
 * media requests, timers, preferences, or audio graph are created.
 */
export type CinematicScore = {
  unlock: () => Promise<boolean>;
  start: () => void;
  stop: () => void;
  setMuted: (muted: boolean) => void;
  muted: () => boolean;
};

export function createCinematicScore(): CinematicScore {
  return {
    unlock: async () => false,
    start: () => undefined,
    stop: () => undefined,
    setMuted: () => undefined,
    muted: () => true,
  };
}
